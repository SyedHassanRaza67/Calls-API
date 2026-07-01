import { Router } from "express";
import { z } from "zod";
import { config } from "../config";
import { query, withTransaction } from "../db";
import { asyncHandler } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { isSuperAdmin, isAdmin } from "../lib/authz";
import { getAccessibleApiConfig } from "../lib/apiConfigAccess";
import { runPingPost, normalizePhoneNumber } from "../lib/leadProvider";
import { insertLead, updateLead } from "../lib/leadPersistence";

const router = Router();
router.use(requireAuth);

const VALID_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
]);

function sanitizeUrl(url: string): string {
  let cleaned = url.replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/i, "").trim();
  if (cleaned && !/^https?:\/\//i.test(cleaned)) cleaned = `https://${cleaned}`;
  return cleaned;
}

// Fold the upstream HTTP status into the persisted response JSON so the agent
// UI can still render the status badge after a reload (the leads table has no
// dedicated column — see useAgentSubmissions.ts which reads __http_status back).
function withHttpStatus(raw: unknown, httpStatus: unknown): unknown {
  if (typeof httpStatus !== "number") return raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>), __http_status: httpStatus };
  }
  return { raw: raw ?? null, __http_status: httpStatus };
}

// ── GET /api/leads?days=&limit= — scoped to user / managed agents ────────
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const days = Math.max(0, parseInt((req.query.days as string) || "0", 10) || 0);
    const limit = Math.min(5000, Math.max(1, parseInt((req.query.limit as string) || "500", 10) || 500));

    const where: string[] = [];
    const params: unknown[] = [];

    const superAdmin = await isSuperAdmin(me);
    const admin = await isAdmin(me);
    if (superAdmin) {
      // all leads
    } else if (admin) {
      // own + managed agents'
      params.push(me);
      where.push(
        `(l.user_id = $${params.length} OR l.user_id IN (SELECT user_id FROM profiles WHERE managed_by = $${params.length}))`
      );
    } else {
      params.push(me);
      where.push(`l.user_id = $${params.length}`);
    }

    if (days > 0) {
      params.push(days);
      where.push(`l.created_at >= now() - ($${params.length} || ' days')::interval`);
    }

    // Optional caller_number filter (digits) — used by duplicate-CID detection.
    const callerNumber = (req.query.caller_number as string) || "";
    if (callerNumber) {
      const digits = callerNumber.replace(/\D/g, "");
      if (digits) {
        params.push(`%${digits}%`);
        // Match on digits regardless of formatting in the stored value.
        where.push(`regexp_replace(l.caller_number, '\\D', '', 'g') LIKE $${params.length}`);
      }
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    params.push(limit);
    const { rows } = await query(
      `SELECT l.* FROM leads l ${whereSql} ORDER BY l.created_at DESC LIMIT $${params.length}`,
      params
    );
    res.json(rows);
  })
);

// ── POST /api/leads/ping-post — port of ping-post-lead ──────────────────
const pingPostSchema = z.object({
  action: z.enum(["ping", "post", "ping-only", "rtb"]),
  api_configuration_id: z.string().uuid().optional(),
  caller_number: z.string().optional().default(""),
  caller_state: z.string().optional().default(""),
  caller_zip: z.string().optional().default(""),
  external_lead_id: z.string().optional(),
  lead_id: z.string().uuid().optional(),
  test_mode: z.boolean().optional(),
  agent_fields: z.record(z.string()).optional(),
  test_config: z.any().optional(),
});

router.post(
  "/ping-post",
  asyncHandler(async (req, res) => {
    const input = pingPostSchema.parse(req.body);
    const me = req.user!.id;

    const result = await runPingPost(input, (configId) => getAccessibleApiConfig(me, configId));
    const body = result.body as Record<string, unknown>;

    // ── Server-side lead persistence ──────────────────────────────────────
    // test_mode never persists.
    if (input.test_mode) {
      if (input.action !== "post") body.lead_id = null;
      return res.status(result.status).json(body);
    }

    if (input.action === "post") {
      // Advance the existing lead row identified by lead_id (the post branch in
      // runPingPost already writes returned_did/api_response/status on success,
      // but we mirror it here for failures and to stay authoritative).
      if (input.lead_id) {
        const ok = body.ok === true;
        const did = (body.did as string | undefined) ?? null;
        await updateLead(input.lead_id, me, {
          status: ok ? "success" : "failed",
          submission_stage: "complete",
          returned_did: did,
          api_response: withHttpStatus(body.raw, body.http_status),
        });
        body.lead_id = input.lead_id;
      }
      return res.status(result.status).json(body);
    }

    // ping / ping-only / rtb → INSERT a new lead row capturing the result.
    // Only persist when we have valid caller fields (validation already ran in
    // runPingPost; a 400 there means we never reach here with bad data).
    if (input.caller_number && input.caller_state && input.caller_zip) {
      const ok = body.ok === true;
      const externalLeadId = (body.external_lead_id as string | undefined) ?? input.external_lead_id ?? null;
      const did = (body.did as string | undefined) ?? null;

      // ping is the first step of a ping-post flow → stays "pending"/"ping".
      // ping-only / rtb are single-step → terminal status.
      let status: string;
      let stage: string;
      if (input.action === "ping") {
        status = ok ? "pending" : "failed";
        stage = "ping";
      } else {
        status = ok ? "success" : "failed";
        stage = "complete";
      }

      const leadId = await insertLead({
        userId: me,
        caller_number: input.caller_number,
        caller_state: input.caller_state,
        caller_zip: input.caller_zip,
        api_configuration_id: input.api_configuration_id ?? null,
        status,
        submission_stage: stage,
        external_lead_id: externalLeadId,
        returned_did: did,
        ping_response: withHttpStatus(body.raw, body.http_status),
      });
      body.lead_id = leadId;
    } else {
      body.lead_id = null;
    }

    res.status(result.status).json(body);
  })
);

// ── POST /api/leads/submit — port of submit-lead ────────────────────────
const submitSchema = z.object({
  api_configuration_id: z.string().uuid().optional(),
  caller_number: z.string(),
  caller_state: z.string(),
  caller_zip: z.string(),
});

router.post(
  "/submit",
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const { api_configuration_id, caller_number, caller_state, caller_zip } = submitSchema.parse(req.body);

    if (!caller_number || !caller_state || !caller_zip) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }

    // Server-side input validation (defense in depth)
    const phoneDigitsValidate = String(caller_number).replace(/\D/g, "");
    const cleanedPhoneValidate =
      phoneDigitsValidate.length === 11 && phoneDigitsValidate.startsWith("1")
        ? phoneDigitsValidate.slice(1)
        : phoneDigitsValidate;
    if (cleanedPhoneValidate.length !== 10) {
      return res.status(400).json({ ok: false, error: "Phone must be exactly 10 digits" });
    }
    if (typeof caller_state !== "string" || !VALID_STATES.has(caller_state.toUpperCase())) {
      return res.status(400).json({ ok: false, error: "Invalid state code" });
    }
    if (!/^\d{5}$/.test(String(caller_zip))) {
      return res.status(400).json({ ok: false, error: "Zip code must be exactly 5 digits" });
    }

    // Persist a lead row for every terminal provider response below, and inject
    // the new lead_id into the body. submit is single-step → terminal status.
    // We intercept res.json so the faithful provider port stays untouched.
    const originalJson = res.json.bind(res);
    (res as any).json = (body: any) => {
      void (async () => {
        try {
          // Only persist once an actual provider call happened (response carries
          // http_status) or a DID came back — not for pre-flight 4xx/5xx guards.
          const isProviderResult =
            body && typeof body === "object" && "ok" in body &&
            body.lead_id === undefined && ("http_status" in body || body.did);
          if (isProviderResult) {
            const ok = body.ok === true;
            const leadId = await insertLead({
              userId: me,
              caller_number,
              caller_state,
              caller_zip,
              api_configuration_id: api_configuration_id ?? null,
              status: ok ? "success" : "failed",
              submission_stage: "complete",
              returned_did: (body.did as string | undefined) ?? null,
              api_response: body.raw,
            });
            body.lead_id = leadId;
          }
        } catch (e) {
          console.error("submit lead persistence failed:", e);
        }
        originalJson(body);
      })();
      return res;
    };

    let rtbKey: string | undefined;
    let publisherId: string | undefined;
    let apiConfig: any = null;

    if (api_configuration_id) {
      apiConfig = await getAccessibleApiConfig(me, api_configuration_id);
      if (!apiConfig) {
        return res.status(403).json({ ok: false, error: "API configuration not found or access denied" });
      }
      if (!apiConfig.is_active) {
        return res.status(400).json({ ok: false, error: "Selected campaign is no longer active" });
      }

      // Custom provider
      if (apiConfig.api_provider === "custom") {
        const formattedNumber = normalizePhoneNumber(caller_number);
        const httpMethod = apiConfig.http_method || "POST";
        const apiEndpoint = apiConfig.ping_url ? sanitizeUrl(apiConfig.ping_url) : null;
        if (!apiEndpoint) {
          return res.status(200).json({
            ok: false,
            error: "No API Endpoint URL configured for this campaign. Please edit the campaign and add the API endpoint URL.",
          });
        }
        const leadData: Record<string, string> = {
          caller_id: formattedNumber, phone: formattedNumber, caller_number: formattedNumber,
          state: caller_state, caller_state: caller_state,
          zip: caller_zip, zip_code: caller_zip, caller_zip: caller_zip,
        };
        if (apiConfig.api_key) {
          leadData.lp_campaign_key = apiConfig.api_key;
          leadData.key = apiConfig.api_key;
          leadData.api_key = apiConfig.api_key;
        }
        if (apiConfig.publisher_id) {
          leadData.lp_campaign_id = apiConfig.publisher_id;
          leadData.publisher_id = apiConfig.publisher_id;
          leadData.campaign_id = apiConfig.publisher_id;
        }
        if (Array.isArray(apiConfig.custom_fields)) {
          for (const field of apiConfig.custom_fields) if (field.key) leadData[field.key] = field.value;
        }

        let fetchUrl = apiEndpoint;
        const fetchOptions: RequestInit = { method: httpMethod, headers: { Accept: "application/json" } };
        if (["GET", "HEAD"].includes(httpMethod)) {
          const url = new URL(apiEndpoint);
          for (const [k, v] of Object.entries(leadData)) if (!url.searchParams.has(k)) url.searchParams.set(k, v);
          fetchUrl = url.toString();
        } else {
          fetchOptions.headers = { ...fetchOptions.headers, "Content-Type": "application/x-www-form-urlencoded" };
          fetchOptions.body = new URLSearchParams(leadData).toString();
        }

        const customResponse = await fetch(fetchUrl, fetchOptions);
        const contentType = customResponse.headers.get("content-type") || "";
        let customData: Record<string, unknown>;
        if (contentType.includes("application/json")) {
          customData = await customResponse.json() as Record<string, unknown>;
        } else {
          const textResponse = await customResponse.text();
          try {
            customData = JSON.parse(textResponse);
          } catch {
            return res.status(200).json({ ok: false, error: "API returned an invalid response", raw: { text: textResponse.substring(0, 500) } });
          }
        }
        const customUpstreamStatus = customResponse.status;
        const did =
          customData.phoneNumber || customData.number || customData.inbound_number ||
          customData.destination || customData.tracking_number || customData.did ||
          customData.phone || customData.transferNumber;

        if (did) {
          return res.status(200).json({ ok: true, did: String(did), api_configuration_id, raw: customData, http_status: customUpstreamStatus });
        } else {
          const errorMsg =
            customData.error || customData.message || customData.info || customData.reason ||
            `HTTP ${customUpstreamStatus} — no target / no DID returned`;
          return res.status(200).json({ ok: false, error: errorMsg, raw: customData, http_status: customUpstreamStatus });
        }
      }

      // Ringba provider
      if (apiConfig.api_provider === "ringba") {
        const formattedNumber = normalizePhoneNumber(caller_number);
        const rtbId = apiConfig.publisher_id;
        const ringbaUrl = `https://rtb.ringba.com/v1/production/${encodeURIComponent(rtbId)}.json`;
        const ringbaBody: Record<string, unknown> = { CID: formattedNumber, zipcode: caller_zip, state: caller_state, exposeCallerId: "yes" };
        if (Array.isArray(apiConfig.custom_fields)) {
          for (const field of apiConfig.custom_fields) if (field.key) ringbaBody[field.key] = field.value;
        }
        const ringbaResponse = await fetch(ringbaUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(ringbaBody),
        });
        const contentType = ringbaResponse.headers.get("content-type") || "";
        let ringbaData: Record<string, unknown>;
        if (contentType.includes("application/json")) {
          ringbaData = await ringbaResponse.json() as Record<string, unknown>;
        } else {
          const textResponse = await ringbaResponse.text();
          return res.status(200).json({ ok: false, error: "Ringba returned an invalid response. Please try again.", raw: { text: textResponse.substring(0, 200) } });
        }
        const ringbaUpStatus = ringbaResponse.status;
        const trackingNumber =
          ringbaData.phoneNumber || ringbaData.number || ringbaData.inbound_number ||
          ringbaData.destination || ringbaData.tracking_number || ringbaData.did;
        if (trackingNumber) {
          return res.status(200).json({ ok: true, did: trackingNumber, api_configuration_id, raw: ringbaData, http_status: ringbaUpStatus });
        } else if (ringbaData.error) {
          return res.status(200).json({ ok: false, error: ringbaData.error, raw: ringbaData, http_status: ringbaUpStatus });
        } else {
          return res.status(200).json({ ok: false, error: ringbaData.message || ringbaData.info || "No tracking number returned from Ringba", raw: ringbaData, http_status: ringbaUpStatus });
        }
      }

      rtbKey = apiConfig.api_key;
      publisherId = apiConfig.publisher_id;
      if (!rtbKey && Array.isArray(apiConfig.custom_fields)) {
        const keyField = apiConfig.custom_fields.find((f: any) => f.enabled !== false && (f.key === "key" || f.key === "api_key"));
        if (keyField) rtbKey = keyField.value;
      }
      if (!publisherId && Array.isArray(apiConfig.custom_fields)) {
        const pubField = apiConfig.custom_fields.find((f: any) => f.enabled !== false && (f.key === "publisher_id" || f.key === "pub_id"));
        if (pubField) publisherId = pubField.value;
      }
    } else {
      // Fallback to environment secrets
      rtbKey = config.retreaverRtbKey || undefined;
      publisherId = config.retreaverPublisherId || undefined;
    }

    if (!rtbKey || !publisherId) {
      return res.status(500).json({
        ok: false,
        error: "API credentials not configured. Add them as dedicated fields or as custom field parameters named 'key'/'api_key' and 'publisher_id'.",
      });
    }

    const formattedNumber = normalizePhoneNumber(caller_number);
    const rtbUrl = new URL("https://rtb.retreaver.com/rtbs.json");
    rtbUrl.searchParams.set("key", rtbKey);
    rtbUrl.searchParams.set("publisher_id", publisherId);
    rtbUrl.searchParams.set("caller_number", formattedNumber);
    rtbUrl.searchParams.set("caller_state", caller_state);
    rtbUrl.searchParams.set("caller_zip", caller_zip);

    if (api_configuration_id && Array.isArray(apiConfig?.custom_fields)) {
      for (const field of apiConfig.custom_fields) {
        if (field.enabled === false || !field.key) continue;
        if (["key", "api_key", "publisher_id", "pub_id"].includes(field.key)) continue;
        if (!rtbUrl.searchParams.has(field.key)) rtbUrl.searchParams.set(field.key, field.value || "");
      }
    }

    const response = await fetch(rtbUrl.toString(), { method: "POST", headers: { Accept: "application/json" } });
    const contentType = response.headers.get("content-type") || "";
    let responseData: Record<string, unknown>;
    if (contentType.includes("application/json")) {
      responseData = await response.json() as Record<string, unknown>;
    } else {
      const textResponse = await response.text();
      return res.status(200).json({ ok: false, error: "Retreaver returned an invalid response. Please try again.", raw: { text: textResponse.substring(0, 200) } });
    }
    const retUpstreamStatus = response.status;
    const trackingNumber =
      responseData.inbound_number || responseData.number || responseData.routing_number ||
      responseData.tracking_number || responseData.did;

    if (trackingNumber) {
      return res.status(200).json({ ok: true, did: trackingNumber, api_configuration_id, raw: responseData, http_status: retUpstreamStatus });
    } else if (responseData.error) {
      return res.status(200).json({ ok: false, error: responseData.error, raw: responseData, http_status: retUpstreamStatus });
    } else {
      return res.status(200).json({ ok: false, error: responseData.info || responseData.message || "No tracking number returned", raw: responseData, http_status: retUpstreamStatus });
    }
  })
);

// ── POST /api/leads — create a lead row (frontend writes lead history) ───
const createLeadSchema = z.object({
  caller_number: z.string(),
  caller_state: z.string(),
  caller_zip: z.string(),
  api_configuration_id: z.string().uuid().nullable().optional(),
  returned_did: z.string().nullable().optional(),
  status: z.string().optional(),
  submission_stage: z.string().optional(),
  external_lead_id: z.string().nullable().optional(),
  api_response: z.any().optional(),
  ping_response: z.any().optional(),
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const data = createLeadSchema.parse(req.body);
    const { rows } = await query(
      `INSERT INTO leads (user_id, caller_number, caller_state, caller_zip,
          api_configuration_id, returned_did, status, submission_stage,
          external_lead_id, api_response, ping_response)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,'pending'),COALESCE($8,'complete'),$9,$10,$11)
       RETURNING *`,
      [
        me,
        data.caller_number,
        data.caller_state,
        data.caller_zip,
        data.api_configuration_id ?? null,
        data.returned_did ?? null,
        data.status ?? null,
        data.submission_stage ?? null,
        data.external_lead_id ?? null,
        data.api_response !== undefined ? JSON.stringify(data.api_response) : null,
        data.ping_response !== undefined ? JSON.stringify(data.ping_response) : null,
      ]
    );
    res.status(201).json(rows[0]);
  })
);

export default router;
