/**
 * Faithful port of supabase/functions/ping-post-lead/index.ts.
 * External HTTP calls to Retreaver / Ringba / LeadsPedia / TrackDrive and
 * response shaping are preserved. Lead-row writes use direct SQL.
 *
 * Returns { status, body } — body matches the original JSON exactly so the
 * frontend needs no behavioral change.
 */
import { query } from "../db";

export interface LeadResult {
  status: number;
  body: Record<string, unknown>;
}

const VALID_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
]);

export function normalizePhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (phone.startsWith("+")) return `+${digits}`;
  return `+1${digits}`;
}

/** fetch() with an abort-based timeout (used by the Service Direct branch). */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve the Service Direct API key from the api_key column or an sd_api_key custom field. */
function resolveSdApiKey(apiConfig: any): string {
  if (typeof apiConfig.api_key === "string" && apiConfig.api_key) return apiConfig.api_key;
  if (Array.isArray(apiConfig.custom_fields)) {
    const f = apiConfig.custom_fields.find(
      (x: any) => x.key === "sd_api_key" && x.enabled !== false
    );
    if (f && typeof f.value === "string") return f.value;
  }
  return "";
}

function getByPath(obj: unknown, path: string): unknown {
  if (!obj || !path) return undefined;
  const parts = path.split(".").map((p) => p.trim()).filter(Boolean);
  let current: any = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    const asIdx = /^\d+$/.test(part) ? Number(part) : null;
    if (Array.isArray(current) && asIdx !== null) current = current[asIdx];
    else if (typeof current === "object") current = current[part];
    else return undefined;
  }
  return current;
}

function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return;
  if (parts.length === 1) {
    obj[parts[0]] = value;
    return;
  }
  let current: any = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (typeof current[key] !== "object" || current[key] === null || Array.isArray(current[key])) {
      current[key] = {};
    }
    current = current[key];
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Sets a custom field's value at its dot-path. A key ending in "[]" (e.g.
 * "data.quoteRequest.item.drivers[]") signals the value is a JSON array literal
 * (typed by the admin, e.g. `[{"birthDate":"1990-01-01", ...}]`) rather than a
 * plain string — needed for providers like QuoteWizard whose schema requires
 * real arrays (drivers/vehicles) that dot-path objects alone can't express.
 */
function setFieldValue(obj: Record<string, unknown>, key: string, rawValue: string): void {
  if (key.endsWith("[]")) {
    const path = key.slice(0, -2);
    try {
      setByPath(obj, path, JSON.parse(rawValue));
      return;
    } catch {
      // Fall through and store as a plain string if it isn't valid JSON.
    }
  }
  setByPath(obj, key, rawValue);
}

/**
 * Read the first matching key from an object case-insensitively. Lets the
 * generic ping/post engine understand providers that use PascalCase response
 * fields (e.g. PX: Success / Payout / TransactionId) without a dedicated adapter.
 */
function ciGet(obj: unknown, ...keys: string[]): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const lower: Record<string, unknown> = {};
  for (const k of Object.keys(obj as Record<string, unknown>)) {
    lower[k.toLowerCase()] = (obj as Record<string, unknown>)[k];
  }
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v !== undefined) return v;
  }
  return undefined;
}

function sanitizeUrl(url: string): string {
  return url.replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/i, "").trim();
}

function resolveFieldValue(
  field: any,
  formattedNumber: string,
  caller_state: string,
  caller_zip: string,
  apiConfig: any,
  agentFields?: Record<string, string>,
  rawDigits?: string
): string {
  if (field.ask_agent && agentFields && agentFields[field.key] !== undefined) {
    return agentFields[field.key];
  }
  let val = field.value || "";
  val = val.replace(/\{\{phone_raw\}\}/gi, rawDigits || formattedNumber.replace(/\D/g, ""));
  val = val.replace(/\{\{phone\}\}/gi, formattedNumber);
  val = val.replace(/\{\{state\}\}/gi, caller_state);
  val = val.replace(/\{\{zip\}\}/gi, caller_zip);
  val = val.replace(/\{\{api_key\}\}/gi, apiConfig.api_key || "");
  val = val.replace(/\{\{publisher_id\}\}/gi, apiConfig.publisher_id || "");
  return val;
}

function normalizeLeadspediaFields(
  body: Record<string, unknown>,
  url: string
): Record<string, unknown> {
  const isLeadspedia = url.toLowerCase().includes("leadspedia");
  if (!isLeadspedia) return body;
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    const lk = key.toLowerCase();
    if (lk === "phone" && !body.caller_id) normalized.caller_id = value;
    else if (lk === "zip" && !body.zip_code) normalized.zip_code = value;
    else normalized[key] = value;
  }
  return normalized;
}

export interface PingPostInput {
  action: "ping" | "post" | "ping-only" | "rtb";
  api_configuration_id?: string;
  caller_number: string;
  caller_state: string;
  caller_zip: string;
  external_lead_id?: string;
  lead_id?: string;
  test_mode?: boolean;
  agent_fields?: Record<string, string>;
  test_config?: any;
}

/**
 * Runs the ping/post/ping-only/rtb flow. `resolveConfig` is invoked to fetch &
 * authorize the api_configuration when not in test mode (returns the row or null).
 */
export async function runPingPost(
  input: PingPostInput,
  resolveConfig: (configId: string) => Promise<Record<string, unknown> | null>
): Promise<LeadResult> {
  const {
    action,
    api_configuration_id,
    caller_number,
    caller_state,
    caller_zip,
    external_lead_id,
    lead_id,
    test_mode,
    test_config,
    agent_fields,
  } = input;

  // Server-side input validation (defense in depth)
  if (caller_number && caller_state && caller_zip) {
    const phoneDigitsValidate = String(caller_number).replace(/\D/g, "");
    const cleanedPhoneValidate =
      phoneDigitsValidate.length === 11 && phoneDigitsValidate.startsWith("1")
        ? phoneDigitsValidate.slice(1)
        : phoneDigitsValidate;
    if (cleanedPhoneValidate.length !== 10) {
      return { status: 400, body: { ok: false, error: "Phone must be exactly 10 digits" } };
    }
    if (typeof caller_state !== "string" || !VALID_STATES.has(caller_state.toUpperCase())) {
      return { status: 400, body: { ok: false, error: "Invalid state code" } };
    }
    if (!/^\d{5}$/.test(String(caller_zip))) {
      return { status: 400, body: { ok: false, error: "Zip code must be exactly 5 digits" } };
    }
  }

  if (!action || !["ping", "post", "ping-only", "rtb"].includes(action)) {
    return { status: 400, body: { ok: false, error: "Invalid action. Must be 'ping', 'post', 'ping-only', or 'rtb'" } };
  }

  if (!test_mode && (!api_configuration_id || !caller_number || !caller_state || !caller_zip)) {
    return { status: 400, body: { ok: false, error: "Missing required fields" } };
  }
  if (test_mode && !test_config) {
    return { status: 400, body: { ok: false, error: "test_config is required when test_mode is true" } };
  }
  if (action === "post" && !external_lead_id) {
    return { status: 400, body: { ok: false, error: "external_lead_id is required for post action" } };
  }

  // Fetch API configuration or use test_config
  let apiConfig: any;
  if (test_mode && test_config) {
    apiConfig = { ...test_config, is_active: true };
  } else {
    const configData = await resolveConfig(api_configuration_id!);
    if (!configData) {
      return { status: 403, body: { ok: false, error: "API configuration not found or access denied" } };
    }
    if (!configData.is_active) {
      return { status: 400, body: { ok: false, error: "Selected campaign is no longer active" } };
    }
    apiConfig = configData;
  }

  if (apiConfig.ping_url) apiConfig.ping_url = sanitizeUrl(apiConfig.ping_url);
  if (apiConfig.post_url) apiConfig.post_url = sanitizeUrl(apiConfig.post_url);

  // Validate api_mode matches action
  if (action === "ping-only" && apiConfig.api_mode !== "ping") {
    return { status: 400, body: { ok: false, error: "This campaign is not configured for Ping Only mode" } };
  }
  if ((action === "ping" || action === "post") && apiConfig.api_mode !== "ping-post") {
    return { status: 400, body: { ok: false, error: "This campaign is not configured for Ping/Post" } };
  }
  if (action === "rtb" && apiConfig.api_mode !== "rtb") {
    return { status: 400, body: { ok: false, error: "This campaign is not configured for RTB mode" } };
  }

  const apiProvider = apiConfig.api_provider || "retreaver";
  let formattedNumber = normalizePhoneNumber(caller_number);
  const rawDigits = caller_number.replace(/\D/g, "");

  // Phone number format ("how we send phone / caller ID"): apply the campaign's
  // _phone_format meta field to the {{phone}} token / caller_id. Defaults to digits.
  {
    const phoneFmt =
      (Array.isArray(apiConfig.custom_fields)
        ? apiConfig.custom_fields.find((f: any) => f.key === "_phone_format")?.value
        : undefined) || "digits";
    const d = formattedNumber.replace(/\D/g, "");
    const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
    if (ten.length === 10) {
      if (phoneFmt === "digits") formattedNumber = ten;
      else if (phoneFmt === "us1") formattedNumber = "1" + ten;
      else formattedNumber = "+1" + ten; // e164
    }
  }

  // Service Direct (Earn API) — detected by provider or by the SD host in the URL.
  // SD differs from the generic engine: bid/number are nested under `data`, and the
  // Post endpoint takes the request_id in the URL path (/partners/request/<id>/accept).
  const isServiceDirect =
    apiProvider === "servicedirect" ||
    (typeof apiConfig.ping_url === "string" && apiConfig.ping_url.includes("servicedirect.com")) ||
    (typeof apiConfig.post_url === "string" && apiConfig.post_url.includes("servicedirect.com"));

  // ── PING-ONLY ─────────────────────────────────────────────────────────
  if (action === "ping-only") {
    const pingUrl = apiConfig.ping_url;
    if (!pingUrl) {
      return { status: 400, body: { ok: false, error: "Ping URL not configured for this campaign" } };
    }
    if (apiProvider === "trackdrive" && pingUrl.includes("/posting_instructions/")) {
      return {
        status: 200,
        body: {
          ok: false,
          action: "ping-only",
          error:
            "This Trackdrive URL looks like a Posting Instructions page and will not return JSON. Please use a v1 endpoint like /api/v1/inbound_webhooks/ping/<vanity_uri>.",
          raw: { ping_url: pingUrl },
        },
      };
    }

    const httpMethod = apiConfig.http_method || "POST";

    if (httpMethod === "GET") {
      let fullUrl: string;
      const baseUrlRaw = pingUrl.replace(/\/$/, "");
      const urlObj = new URL(baseUrlRaw.startsWith("http") ? baseUrlRaw : `https://${baseUrlRaw}`);
      const existingParams = Array.from(urlObj.searchParams.keys());

      if (existingParams.length > 0) {
        for (const param of existingParams) {
          const upper = param.toUpperCase();
          if (upper.includes("CALLER") || upper.includes("CID") || upper.includes("PHONE")) {
            urlObj.searchParams.set(param, formattedNumber);
          } else if (upper.includes("ZIP")) {
            urlObj.searchParams.set(param, caller_zip);
          } else if (upper.includes("STATE")) {
            urlObj.searchParams.set(param, caller_state);
          }
        }
        if (apiConfig.api_key) urlObj.searchParams.set("api_key", apiConfig.api_key);
        if (Array.isArray(apiConfig.custom_fields)) {
          for (const field of apiConfig.custom_fields) {
            if (field.key && field.enabled !== false) urlObj.searchParams.set(field.key, field.value);
          }
        }
        fullUrl = urlObj.toString();
      } else {
        const queryParams = new URLSearchParams({
          CallerId: formattedNumber,
          InboundStateCode: caller_state,
          InboundZipCode: caller_zip,
        });
        if (apiConfig.api_key) queryParams.set("api_key", apiConfig.api_key);
        if (Array.isArray(apiConfig.custom_fields)) {
          for (const field of apiConfig.custom_fields) {
            if (field.key && field.enabled !== false) queryParams.set(field.key, field.value);
          }
        }
        const base = urlObj.origin + urlObj.pathname;
        fullUrl = apiConfig.publisher_id
          ? `${base}/${apiConfig.publisher_id}?${queryParams.toString()}`
          : `${base}?${queryParams.toString()}`;
      }

      const response = await fetch(fullUrl, { method: "GET", headers: { Accept: "application/json" } });
      const contentType = response.headers.get("content-type") || "";
      let responseData: Record<string, unknown>;
      if (contentType.includes("application/json")) {
        responseData = await response.json() as Record<string, unknown>;
      } else {
        const textResponse = await response.text();
        try {
          responseData = JSON.parse(textResponse);
        } catch {
          return {
            status: 200,
            body: {
              ok: false,
              error: "Invalid response from ping endpoint (expected JSON)",
              raw: { text: textResponse.substring(0, 200) },
            },
          };
        }
      }
      const upstreamStatus = response.status;

      const trackingNumber =
        responseData.number ||
        responseData.inbound_number ||
        responseData.tracking_number ||
        responseData.did ||
        responseData.routing_number ||
        responseData.forwarding_number ||
        responseData.dynamicSipAddress;

      const isSuccessResponse =
        responseData.code === 1000 ||
        responseData.success === true ||
        responseData.status === "success" ||
        responseData.status === "accepted" ||
        responseData.status === "reserved" ||
        responseData.status === "ok";

      if (trackingNumber) {
        return {
          status: 200,
          body: {
            ok: true,
            action: "ping-only",
            did: String(trackingNumber),
            payout: responseData.payout || responseData.price || responseData.bid || responseData.dynamicBid,
            raw: responseData,
            http_status: upstreamStatus,
          },
        };
      } else if ((isSuccessResponse || response.ok) && (responseData.dynamicSipAddress || responseData.id)) {
        return {
          status: 200,
          body: {
            ok: true,
            action: "ping-only",
            did: responseData.dynamicSipAddress || responseData.id,
            payout: responseData.dynamicBid || responseData.payout || responseData.price || responseData.bid,
            raw: responseData,
            http_status: upstreamStatus,
          },
        };
      } else if (responseData.error || responseData.code === 4003) {
        return {
          status: 200,
          body: {
            ok: false,
            action: "ping-only",
            error: responseData.error || responseData.message || "API error",
            raw: responseData,
            http_status: upstreamStatus,
          },
        };
      } else {
        return {
          status: 200,
          body: {
            ok: false,
            action: "ping-only",
            error: responseData.info || responseData.message || "No tracking number returned",
            raw: responseData,
            http_status: upstreamStatus,
          },
        };
      }
    }

    // POST request
    let requestBody: Record<string, unknown>;
    if (apiProvider === "quotewizard") {
      requestBody = {
        campaignId: apiConfig.publisher_id ? parseInt(apiConfig.publisher_id) : undefined,
        Apikey: apiConfig.api_key,
        data: {
          quoteRequest: {
            item: {
              contact: {
                state: caller_state,
                zipCode: caller_zip,
                phoneNumbers: { primaryPhone: { phoneNumberValue: formattedNumber } },
              },
              homeInsuranceQuoteRequest: {},
            },
          },
        },
      };
    } else if (apiProvider === "trackdrive") {
      const pingUrlParts = pingUrl.split("/");
      const vanityUri = pingUrlParts[pingUrlParts.length - 1]?.split("?")[0];
      requestBody = { vanity_uri: vanityUri, caller_id: formattedNumber, state: caller_state, zip: caller_zip };
      if (apiConfig.publisher_id) requestBody.traffic_source_id = apiConfig.publisher_id;
      if (apiConfig.trackdrive_number) requestBody.trackdrive_number = apiConfig.trackdrive_number.replace(/^\+/, "");
      if (apiConfig.trackdrive_number_id) requestBody.trackdrive_number_id = apiConfig.trackdrive_number_id;
    } else {
      const customFields = (Array.isArray(apiConfig.custom_fields) ? apiConfig.custom_fields : []).filter(
        (f: any) => f.enabled !== false
      );
      const hasTemplates = customFields.some((f: any) => f.value && /\{\{.+?\}\}/.test(f.value));
      if (hasTemplates) {
        requestBody = {};
        for (const field of customFields) {
          if (!field.key || field.key.startsWith("_")) continue;
          requestBody[field.key] = resolveFieldValue(field, formattedNumber, caller_state, caller_zip, apiConfig, agent_fields);
        }
      } else {
        requestBody = {
          caller_number: formattedNumber,
          phone: formattedNumber,
          caller_state: caller_state,
          state: caller_state,
          caller_zip: caller_zip,
          zip: caller_zip,
          zip_code: caller_zip,
        };
        if (apiConfig.api_key) {
          requestBody.key = apiConfig.api_key;
          requestBody.lp_campaign_key = apiConfig.api_key;
          requestBody.api_key = apiConfig.api_key;
        }
        if (apiConfig.publisher_id) {
          requestBody.publisher_id = apiConfig.publisher_id;
          requestBody.lp_campaign_id = apiConfig.publisher_id;
          requestBody.campaign_id = apiConfig.publisher_id;
        }
        for (const field of customFields) {
          if (field.key) requestBody[field.key] = field.value;
        }
      }
    }

    requestBody = normalizeLeadspediaFields(requestBody, pingUrl);
    const postMethod = apiConfig.http_method || "POST";

    const bodyFormatField = (Array.isArray(apiConfig.custom_fields) ? apiConfig.custom_fields : []).find(
      (f: any) => f.key === "_body_format"
    );
    const isLeadspediaUrl = pingUrl.toLowerCase().includes("leadspedia");
    const useFormEncoding = bodyFormatField?.value === "form" || (isLeadspediaUrl && bodyFormatField?.value !== "json");

    let fetchBody: string;
    let contentType: string;
    if (useFormEncoding) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(requestBody)) params.set(k, String(v));
      fetchBody = params.toString();
      contentType = "application/x-www-form-urlencoded";
    } else {
      fetchBody = JSON.stringify(requestBody);
      contentType = "application/json";
    }

    const response = await fetch(pingUrl, {
      method: ["GET", "HEAD"].includes(postMethod) ? "POST" : postMethod,
      headers: { "Content-Type": contentType, Accept: "application/json" },
      body: fetchBody,
    });

    const respContentType = response.headers.get("content-type") || "";
    let responseData: Record<string, unknown>;
    if (respContentType.includes("application/json")) {
      responseData = await response.json() as Record<string, unknown>;
    } else {
      const textResponse = await response.text();
      return {
        status: 200,
        body: { ok: false, error: "Invalid response from ping endpoint", raw: { text: textResponse.substring(0, 200) }, http_status: response.status },
      };
    }
    const postUpstreamStatus = response.status;

    if (apiProvider === "quotewizard") {
      const qwStatus = responseData.status as string | undefined;
      const isAccepted = qwStatus?.toLowerCase() === "accepted";
      const fallbackDid = apiConfig.trackdrive_number || null;
      if (isAccepted) {
        return {
          status: 200,
          body: {
            ok: true,
            action: "ping-only",
            did: responseData.phoneNumber ? String(responseData.phoneNumber) : fallbackDid,
            payout: responseData.bid,
            external_id: responseData.pingID,
            raw: responseData,
            http_status: postUpstreamStatus,
          },
        };
      } else {
        return {
          status: 200,
          body: {
            ok: false,
            action: "ping-only",
            error: responseData.rejectionReason || `QuoteWizard status: ${qwStatus || "unknown"}`,
            raw: responseData,
            http_status: postUpstreamStatus,
          },
        };
      }
    }

    const trackingNumber =
      responseData.number ||
      responseData.inbound_number ||
      responseData.tracking_number ||
      responseData.did ||
      responseData.routing_number;

    if (trackingNumber) {
      return {
        status: 200,
        body: {
          ok: true,
          action: "ping-only",
          did: String(trackingNumber),
          payout: responseData.payout || responseData.price || responseData.bid,
          raw: responseData,
          http_status: postUpstreamStatus,
        },
      };
    } else if (responseData.error) {
      return {
        status: 200,
        body: { ok: false, action: "ping-only", error: responseData.error, raw: responseData, http_status: postUpstreamStatus },
      };
    } else {
      return {
        status: 200,
        body: {
          ok: false,
          action: "ping-only",
          error: responseData.info || responseData.message || "No tracking number returned",
          raw: responseData,
          http_status: postUpstreamStatus,
        },
      };
    }
  }

  // ── PING ──────────────────────────────────────────────────────────────
  if (action === "ping") {
    const pingUrl = apiConfig.ping_url;
    if (!pingUrl) {
      return { status: 400, body: { ok: false, error: "Ping URL not configured for this campaign" } };
    }

    // ── Service Direct PING ───────────────────────────────────────────────
    if (isServiceDirect) {
      const sdApiKey = resolveSdApiKey(apiConfig);
      const sdBody: Record<string, unknown> = {};
      const sdFields = (Array.isArray(apiConfig.custom_fields) ? apiConfig.custom_fields : [])
        .filter((f: any) => f.enabled !== false)
        .filter((f: any) => f.stages?.ping !== false)
        .filter((f: any) => f.key && !f.key.startsWith("_") && f.key !== "sd_api_key");
      for (const field of sdFields) {
        sdBody[field.key] = resolveFieldValue(
          field, formattedNumber, caller_state, caller_zip, apiConfig, agent_fields, rawDigits
        );
      }
      sdBody.sd_api_key = sdApiKey;
      if (sdBody.zip_code === undefined || sdBody.zip_code === "") sdBody.zip_code = caller_zip;
      if (sdBody.caller_id === undefined || sdBody.caller_id === "") sdBody.caller_id = formattedNumber;
      if (test_mode) sdBody.test_mode = true;

      let sdData: Record<string, unknown>;
      let sdStatus: number;
      try {
        const sdResp = await fetchWithTimeout(
          pingUrl,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(sdBody),
          },
          3000
        );
        sdStatus = sdResp.status;
        const txt = await sdResp.text();
        try {
          sdData = JSON.parse(txt);
        } catch {
          return {
            status: 200,
            body: { ok: false, action: "ping", has_bid: false, error: "Invalid response from Service Direct (expected JSON)", raw: { text: txt.substring(0, 200) }, http_status: sdStatus },
          };
        }
      } catch (e) {
        const isAbort = e instanceof Error && e.name === "AbortError";
        const msg = isAbort ? "Service Direct ping timed out (3s)" : "Service Direct ping request failed";
        return {
          status: 200,
          body: { ok: false, action: "ping", has_bid: false, error: msg, raw: { service_direct_error: msg, detail: e instanceof Error ? e.message : String(e), request_url: pingUrl } },
        };
      }

      const sdPayload = (sdData && typeof sdData === "object" ? (sdData as any).data : undefined) || {};
      const availableBuyer = sdPayload.available_buyer === true;
      const requestId =
        sdPayload.request_id !== undefined && sdPayload.request_id !== null
          ? String(sdPayload.request_id)
          : undefined;
      const rawBid = sdPayload.bid;
      const bidAmount = typeof rawBid === "number" ? rawBid : parseFloat(rawBid) || 0;

      if (availableBuyer && requestId !== undefined) {
        return {
          status: 200,
          body: { ok: true, action: "ping", has_bid: true, external_lead_id: requestId, bid_amount: bidAmount, raw: sdData, http_status: sdStatus },
        };
      }
      return {
        status: 200,
        body: { ok: false, action: "ping", has_bid: false, error: ((sdData as any).message as string) || "No buyer found for the provided zip code and service category", raw: sdData, http_status: sdStatus },
      };
    }

    if (apiProvider === "trackdrive" && pingUrl.includes("/posting_instructions/")) {
      return {
        status: 200,
        body: {
          ok: false,
          action: "ping",
          has_bid: false,
          error:
            "This Trackdrive Ping URL looks like a Posting Instructions page and will not return JSON. Please use a v1 endpoint like /api/v1/inbound_webhooks/ping/<vanity_uri>.",
          raw: { ping_url: pingUrl },
        },
      };
    }

    let pingBody: Record<string, unknown>;
    if (apiProvider === "trackdrive") {
      const pingUrlClean = pingUrl.replace(/\/$/, "");
      const pingUrlParts = pingUrlClean.split("/");
      let vanityUri = pingUrlParts[pingUrlParts.length - 1]?.split("?")[0];
      if (vanityUri && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(vanityUri)) {
        vanityUri = "";
      }
      pingBody = { caller_id: formattedNumber, state: caller_state, zip: caller_zip };
      if (apiConfig.publisher_id) pingBody.traffic_source_id = apiConfig.publisher_id;
      if (vanityUri) pingBody.vanity_uri = vanityUri;
      if (apiConfig.trackdrive_number) pingBody.trackdrive_number = apiConfig.trackdrive_number.replace(/^\+/, "");
      if (apiConfig.trackdrive_number_id) pingBody.trackdrive_number_id = apiConfig.trackdrive_number_id;
    } else {
      const customFields = (Array.isArray(apiConfig.custom_fields) ? apiConfig.custom_fields : [])
        .filter((f: any) => f.enabled !== false)
        .filter((f: any) => f.stages?.ping !== false);
      const hasTemplates = customFields.some((f: any) => f.value && /\{\{.+?\}\}/.test(f.value));
      const nonMetaFields = customFields.filter((f: any) => f.key && !f.key.startsWith("_"));
      if (hasTemplates || nonMetaFields.length > 0) {
        pingBody = {};
        for (const field of nonMetaFields) {
          setFieldValue(pingBody, field.key, resolveFieldValue(field, formattedNumber, caller_state, caller_zip, apiConfig, agent_fields));
        }
      } else {
        pingBody = {
          key: apiConfig.api_key,
          publisher_id: apiConfig.publisher_id,
          caller_number: formattedNumber,
          caller_state: caller_state,
          caller_zip: caller_zip,
        };
      }
    }

    pingBody = normalizeLeadspediaFields(pingBody, pingUrl);
    const pingMethod = apiConfig.http_method || "POST";
    const pingResponse = await fetch(pingUrl, {
      method: ["GET", "HEAD"].includes(pingMethod) ? "POST" : pingMethod,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(pingBody),
    });

    const contentType = pingResponse.headers.get("content-type") || "";
    let pingData: Record<string, unknown>;
    if (contentType.includes("application/json")) {
      pingData = await pingResponse.json() as Record<string, unknown>;
    } else {
      const textResponse = await pingResponse.text();
      return {
        status: 200,
        body: { ok: false, error: "Invalid response from ping endpoint", raw: { text: textResponse.substring(0, 200) }, http_status: pingResponse.status },
      };
    }
    const pingUpstreamStatus = pingResponse.status;

    if (apiProvider === "trackdrive" && Array.isArray(pingData.errors) && (pingData.errors as string[]).length > 0) {
      const errorMessages = (pingData.errors as string[]).join(", ");
      return {
        status: 200,
        body: { ok: false, action: "ping", has_bid: false, error: errorMessages, raw: pingData, http_status: pingUpstreamStatus },
      };
    }

    let leadId: string | undefined;
    let hasBid: boolean;
    let bidAmount: number;

    if (apiProvider === "trackdrive") {
      leadId =
        (pingData.try_all_buyers_ping_id as string) ||
        ((pingData.try_all_buyers as Record<string, unknown>)?.ping_id as string) ||
        ((pingData.buyers as Record<string, unknown>[])?.[0]?.ping_id as string);
      hasBid =
        pingData.success === true &&
        pingData.status === "accepted" &&
        Array.isArray(pingData.buyers) &&
        (pingData.buyers as unknown[]).length > 0;
      bidAmount = ((pingData.buyers as Record<string, unknown>[])?.[0]?.price as number) || 0;
    } else {
      leadId = (pingData.call_token || pingData.token || pingData.lead_id || pingData.id || pingData.uuid || pingData.external_id || pingData.ping_id || pingData.session_id || pingData.transaction_id) as string | undefined;
      hasBid = false;
      bidAmount = 0;
    }

    const pingIdSourceKey = apiConfig.ping_id_source_key as string | null | undefined;
    if (pingIdSourceKey && pingIdSourceKey.trim()) {
      const extracted = getByPath(pingData, pingIdSourceKey.trim());
      if (extracted !== undefined && extracted !== null && extracted !== "") leadId = String(extracted);
    }

    if (!leadId) {
      const fallbackPaths = [
        "ping_id", "try_all_buyers_ping_id", "try_all_buyers.ping_id", "buyers.0.ping_id",
        "call_token", "token", "lead_id", "id", "uuid", "external_id", "session_id", "transaction_id",
      ];
      for (const p of fallbackPaths) {
        const v = getByPath(pingData, p);
        if (v !== undefined && v !== null && v !== "") {
          leadId = String(v);
          break;
        }
      }
    }

    if (apiProvider !== "trackdrive") {
      // Case-insensitive reads so PascalCase providers (e.g. PX: Success/Payout) work.
      const successField = ciGet(pingData, "success", "accepted");
      const statusVal = String(ciGet(pingData, "status") ?? "").toLowerCase();
      const rawBidVal = ciGet(pingData, "bid", "price", "payout", "retreaver_payout");
      const rawBid = rawBidVal ?? 0;
      bidAmount = typeof rawBid === "string" ? parseFloat(rawBid) || 0 : (typeof rawBid === "number" ? rawBid : 0);
      // An explicit rejection status is authoritative even if a "bid" field is present
      // (e.g. QuoteWizard returns {"status":"Rejected","bid":0} — bid:0 must not read as a win).
      const negativeStatuses = ["rejected", "declined", "denied", "no-bid", "nobid", "error", "failed"];
      if (negativeStatuses.includes(statusVal)) {
        hasBid = false;
      } else if (successField !== undefined) {
        // An explicit success/accepted flag is authoritative when present.
        hasBid = successField === true || successField === "true";
      } else {
        hasBid =
          ["reserved", "ok", "accepted"].includes(statusVal) || (rawBidVal !== undefined && bidAmount > 0);
      }
    }

    const pingDid = (pingData.inbound_number || pingData.number || pingData.routing_number || pingData.tracking_number || pingData.did || pingData.phoneNumber) as string | undefined;
    if (pingDid) {
      return {
        status: 200,
        body: {
          ok: true,
          action: "ping",
          has_bid: true,
          did: pingDid,
          external_lead_id: leadId ? String(leadId) : undefined,
          bid_amount: bidAmount,
          raw: pingData,
          http_status: pingUpstreamStatus,
        },
      };
    }

    if (leadId && hasBid) {
      return {
        status: 200,
        body: {
          ok: true,
          action: "ping",
          has_bid: true,
          external_lead_id: String(leadId),
          bid_amount: bidAmount,
          raw: pingData,
          http_status: pingUpstreamStatus,
        },
      };
    } else {
      const errs = ciGet(pingData, "errors");
      const errMsg =
        ciGet(pingData, "error", "message") ||
        (Array.isArray(errs) ? (errs as unknown[]).join(", ") : errs) ||
        "No buyer available";
      return {
        status: 200,
        body: { ok: false, action: "ping", has_bid: false, error: errMsg as string, raw: pingData, http_status: pingUpstreamStatus },
      };
    }
  }

  // ── POST ──────────────────────────────────────────────────────────────
  if (action === "post") {
    const postUrl = apiConfig.post_url;
    if (!postUrl) {
      return { status: 400, body: { ok: false, error: "Post URL not configured for this campaign" } };
    }

    // ── Service Direct POST (accept) ──────────────────────────────────────
    if (isServiceDirect) {
      const sdApiKey = resolveSdApiKey(apiConfig);

      // request_id goes in the URL path: /partners/request/<request_id>/accept
      const rawPostUrl = sanitizeUrl(postUrl);
      let acceptUrl: string;
      if (/\{\{\s*request_id\s*\}\}/i.test(rawPostUrl)) {
        acceptUrl = rawPostUrl.replace(/\{\{\s*request_id\s*\}\}/gi, encodeURIComponent(external_lead_id!));
      } else {
        let base = "https://api.servicedirect.com";
        try {
          base = new URL(sanitizeUrl(apiConfig.ping_url || rawPostUrl)).origin;
        } catch {
          /* keep default base */
        }
        acceptUrl = `${base}/partners/request/${encodeURIComponent(external_lead_id!)}/accept`;
      }

      const sdPostBody: Record<string, unknown> = { sd_api_key: sdApiKey };
      if (test_mode) sdPostBody.test_mode = true;

      let sdData: Record<string, unknown>;
      let sdStatus: number;
      try {
        const sdResp = await fetchWithTimeout(
          acceptUrl,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(sdPostBody),
          },
          3000
        );
        sdStatus = sdResp.status;
        const txt = await sdResp.text();
        try {
          sdData = JSON.parse(txt);
        } catch {
          return {
            status: 200,
            body: { ok: false, action: "post", error: "Invalid response from Service Direct (expected JSON)", raw: { text: txt.substring(0, 200) }, http_status: sdStatus },
          };
        }
      } catch (e) {
        const isAbort = e instanceof Error && e.name === "AbortError";
        const msg = isAbort ? "Service Direct post timed out (3s)" : "Service Direct post request failed";
        return {
          status: 200,
          body: { ok: false, action: "post", error: msg, raw: { service_direct_error: msg, detail: e instanceof Error ? e.message : String(e), request_url: acceptUrl } },
        };
      }

      const sdPayload = (sdData && typeof sdData === "object" ? (sdData as any).data : undefined) || {};
      const phone = sdPayload.phone_number;
      if (phone) {
        const finalDid = String(phone);
        if (lead_id) {
          await query(
            `UPDATE leads SET submission_stage = 'complete', returned_did = $2, status = 'success', api_response = $3 WHERE id = $1`,
            [lead_id, finalDid, JSON.stringify(sdData)]
          );
        }
        return {
          status: 200,
          body: { ok: true, action: "post", did: finalDid, raw: sdData, http_status: sdStatus },
        };
      }
      return {
        status: 200,
        body: { ok: false, action: "post", error: ((sdData as any).message as string) || "Service Direct did not return a phone number", raw: sdData, http_status: sdStatus },
      };
    }

    let postBody: Record<string, unknown>;
    if (apiProvider === "trackdrive") {
      const postUrlParts = postUrl.split("/");
      const vanityUri = postUrlParts[postUrlParts.length - 1]?.split("?")[0];
      postBody = { vanity_uri: vanityUri, ping_id: external_lead_id, caller_id: formattedNumber };
      if (apiConfig.publisher_id) postBody.traffic_source_id = apiConfig.publisher_id;
      if (apiConfig.trackdrive_number) postBody.trackdrive_number = apiConfig.trackdrive_number.replace(/^\+/, "");
    } else {
      const allCustomFields = (Array.isArray(apiConfig.custom_fields) ? apiConfig.custom_fields : []).filter(
        (f: any) => f.enabled !== false
      );
      const hasExplicitStages = allCustomFields.some(
        (f: any) => f.stages && (f.stages.ping !== undefined || f.stages.post !== undefined)
      );
      const customFields = hasExplicitStages
        ? allCustomFields.filter((f: any) => f.stages?.post !== false)
        : allCustomFields;
      const hasTemplates = customFields.some((f: any) => f.value && /\{\{.+?\}\}/.test(f.value));
      const nonMetaFields = customFields.filter((f: any) => f.key && !f.key.startsWith("_"));

      if (hasTemplates || nonMetaFields.length > 0) {
        const callerTemplates = /\{\{(phone|zip|state)\}\}/i;
        postBody = {};
        for (const field of nonMetaFields) {
          if (field.ask_agent && agent_fields && agent_fields[field.key] !== undefined) {
            setFieldValue(postBody, field.key, agent_fields[field.key]);
            continue;
          }
          let val = field.value || "";
          if (!hasExplicitStages && callerTemplates.test(val)) continue;
          val = val.replace(/\{\{api_key\}\}/gi, apiConfig.api_key || "");
          val = val.replace(/\{\{publisher_id\}\}/gi, apiConfig.publisher_id || "");
          val = val.replace(/\{\{token\}\}/gi, external_lead_id || "");
          val = val.replace(/\{\{call_token\}\}/gi, external_lead_id || "");
          val = val.replace(/\{\{lead_id\}\}/gi, external_lead_id || "");
          val = val.replace(/\{\{ping_id\}\}/gi, external_lead_id || "");
          val = val.replace(/\{\{phone\}\}/gi, formattedNumber || "");
          val = val.replace(/\{\{phone_raw\}\}/gi, (formattedNumber || "").replace(/^\+/, ""));
          val = val.replace(/\{\{state\}\}/gi, caller_state || "");
          val = val.replace(/\{\{zip\}\}/gi, caller_zip || "");
          setFieldValue(postBody, field.key, val);
        }
        if (!hasExplicitStages && external_lead_id && !postBody.token && !postBody.lead_id && !postBody.call_token) {
          postBody.call_token = external_lead_id;
          postBody.token = external_lead_id;
        }
      } else {
        postBody = {
          key: apiConfig.api_key,
          publisher_id: apiConfig.publisher_id,
          lead_id: external_lead_id,
          token: external_lead_id,
          caller_number: formattedNumber,
          caller_state: caller_state,
          caller_zip: caller_zip,
        };
      }
    }

    const pingIdPostField = apiConfig.ping_id_post_field as string | null | undefined;
    if (pingIdPostField && pingIdPostField.trim() && external_lead_id) {
      postBody[pingIdPostField.trim()] = external_lead_id;
    }

    postBody = normalizeLeadspediaFields(postBody, postUrl);
    const postHttpMethod = apiConfig.http_method || "POST";
    const postBodyFormatField = (Array.isArray(apiConfig.custom_fields) ? apiConfig.custom_fields : []).find(
      (f: any) => f.key === "_body_format"
    );
    const isLeadspediaPostUrl = postUrl.toLowerCase().includes("leadspedia");
    const usePostFormEncoding =
      postBodyFormatField?.value === "form" || (isLeadspediaPostUrl && postBodyFormatField?.value !== "json");

    let postFetchBody: string;
    let postContentType: string;
    if (usePostFormEncoding) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(postBody)) params.set(k, String(v));
      postFetchBody = params.toString();
      postContentType = "application/x-www-form-urlencoded";
    } else {
      postFetchBody = JSON.stringify(postBody);
      postContentType = "application/json";
    }

    const postResponse = await fetch(postUrl, {
      method: ["GET", "HEAD"].includes(postHttpMethod) ? "POST" : postHttpMethod,
      headers: { "Content-Type": postContentType, Accept: "application/json" },
      body: postFetchBody,
    });

    const contentType = postResponse.headers.get("content-type") || "";
    let postData: Record<string, unknown>;
    if (contentType.includes("application/json")) {
      postData = await postResponse.json() as Record<string, unknown>;
    } else {
      const textResponse = await postResponse.text();
      return {
        status: 200,
        body: { ok: false, error: "Invalid response from post endpoint", raw: { text: textResponse.substring(0, 200) }, http_status: postResponse.status },
      };
    }
    const postUpstreamStatus = postResponse.status;

    if (apiProvider === "trackdrive" && Array.isArray(postData.errors) && (postData.errors as string[]).length > 0) {
      const errorMessages = (postData.errors as string[]).join(", ");
      return {
        status: 200,
        body: { ok: false, action: "post", error: errorMessages, raw: postData, http_status: postUpstreamStatus },
      };
    }

    const trackingNumber = ciGet(
      postData,
      "forwarding_number", "inbound_number", "number", "routing_number",
      "tracking_number", "phone_number", "phoneNumber", "destination_number",
      "dial_number", "did"
    );

    const payout = ciGet(postData, "payout", "price", "bid");

    // Case-insensitive success flag — e.g. PX returns { Success: true } and may
    // not echo a number; the agent then transfers to the campaign's forwarding DID.
    const postSuccessField = ciGet(postData, "success", "accepted");
    const postSuccess = postSuccessField === true || postSuccessField === "true";
    const fallbackDid = (apiConfig.trackdrive_number as string | null | undefined) || "";
    const postErr = ciGet(postData, "error", "rejectionReason");

    // An explicit rejection status is authoritative even if a stray number-ish
    // field is present (e.g. QuoteWizard returns {"status":"Rejected","phoneNumber":null}).
    const postStatusVal = String(ciGet(postData, "status") ?? "").toLowerCase();
    if (["rejected", "declined", "denied", "error", "failed"].includes(postStatusVal)) {
      return {
        status: 200,
        body: {
          ok: false,
          action: "post",
          error: (postErr as string) || `Post ${postStatusVal}`,
          raw: postData,
          http_status: postUpstreamStatus,
        },
      };
    }

    if (trackingNumber || postSuccess) {
      const finalDid = trackingNumber ? String(trackingNumber) : fallbackDid;
      if (lead_id) {
        await query(
          `UPDATE leads SET submission_stage = 'complete', returned_did = $2, status = 'success', api_response = $3 WHERE id = $1`,
          [lead_id, finalDid, JSON.stringify(postData)]
        );
      }
      return {
        status: 200,
        body: {
          ok: true,
          action: "post",
          did: finalDid || undefined,
          payout,
          raw: postData,
          http_status: postUpstreamStatus,
        },
      };
    } else if (postErr) {
      return {
        status: 200,
        body: { ok: false, action: "post", error: postErr as string, raw: postData, http_status: postUpstreamStatus },
      };
    } else {
      const errs = ciGet(postData, "errors");
      const msg =
        ciGet(postData, "info", "message") ||
        (Array.isArray(errs) ? (errs as unknown[]).join(", ") : errs) ||
        "No tracking number returned";
      return {
        status: 200,
        body: { ok: false, action: "post", error: msg as string, raw: postData, http_status: postUpstreamStatus },
      };
    }
  }

  // ── RTB ───────────────────────────────────────────────────────────────
  // action === "rtb"
  const isRingba = apiProvider === "ringba" || (apiConfig.ping_url && apiConfig.ping_url.includes("ringba.com"));

  if (isRingba) {
    let rtbId = apiConfig.publisher_id;
    if (!rtbId && apiConfig.ping_url) {
      const urlMatch = apiConfig.ping_url.match(/rtb\.ringba\.com\/v1\/production\/(.+?)\.json/);
      if (urlMatch) rtbId = urlMatch[1];
    }
    if (!rtbId) {
      return {
        status: 200,
        body: {
          ok: false,
          action: "rtb",
          error: "RTB ID not found. Either set publisher_id or use a Ringba RTB URL (rtb.ringba.com/v1/production/{ID}.json)",
        },
      };
    }
    const ringbaBaseUrl = `https://rtb.ringba.com/v1/production/${encodeURIComponent(rtbId)}.json`;
    const ringbaParams = new URLSearchParams();
    const customKeys = new Set<string>();
    if (Array.isArray(apiConfig.custom_fields)) {
      for (const field of apiConfig.custom_fields) {
        if (field.key && field.enabled !== false) {
          const val = resolveFieldValue(field, formattedNumber, caller_state, caller_zip, apiConfig, agent_fields);
          ringbaParams.set(field.key, val);
          customKeys.add(field.key.toLowerCase());
        }
      }
    }
    if (!customKeys.has("cid")) ringbaParams.set("CID", formattedNumber);
    if (!customKeys.has("zipcode") && caller_zip) ringbaParams.set("zipcode", caller_zip);
    if (!customKeys.has("state") && caller_state) ringbaParams.set("state", caller_state);
    if (!customKeys.has("exposecallerid")) ringbaParams.set("exposeCallerId", "yes");

    const ringbaUrl = `${ringbaBaseUrl}?${ringbaParams.toString()}`;
    const httpMethod = (apiConfig.http_method || "GET").toUpperCase();
    const ringbaResponse = await fetch(ringbaUrl, { method: httpMethod, headers: { Accept: "application/json" } });

    const contentType = ringbaResponse.headers.get("content-type") || "";
    let ringbaData: Record<string, unknown>;
    if (contentType.includes("application/json")) {
      ringbaData = await ringbaResponse.json() as Record<string, unknown>;
    } else {
      const textResponse = await ringbaResponse.text();
      try {
        ringbaData = JSON.parse(textResponse);
      } catch {
        return {
          status: 200,
          body: { ok: false, action: "rtb", error: "Ringba returned an invalid response", raw: { text: textResponse.substring(0, 200) }, http_status: ringbaResponse.status },
        };
      }
    }
    const ringbaUpstreamStatus = ringbaResponse.status;

    const trackingNumber =
      ringbaData.phoneNumber || ringbaData.number || ringbaData.inbound_number ||
      ringbaData.destination || ringbaData.tracking_number || ringbaData.did;

    if (trackingNumber) {
      return { status: 200, body: { ok: true, action: "rtb", did: trackingNumber, raw: ringbaData, http_status: ringbaUpstreamStatus } };
    } else if (ringbaData.bidAmount === 0 && ringbaData.rejectReason) {
      return {
        status: 200,
        body: { ok: true, action: "rtb", rejected: true, message: ringbaData.rejectReason, raw: ringbaData, http_status: ringbaUpstreamStatus },
      };
    } else {
      const errorMsg = ringbaData.error || ringbaData.message || ringbaData.info || "No tracking number returned from Ringba RTB";
      return {
        status: 200,
        body: {
          ok: false,
          action: "rtb",
          error: typeof errorMsg === "string" ? errorMsg : JSON.stringify(errorMsg),
          raw: ringbaData,
          http_status: ringbaUpstreamStatus,
        },
      };
    }
  } else if (apiProvider === "custom" && apiConfig.ping_url) {
    const rawUrl = sanitizeUrl(apiConfig.ping_url);
    const httpMethod = (apiConfig.http_method || "GET").toUpperCase();
    const customParams: Record<string, string> = {};
    if (Array.isArray(apiConfig.custom_fields)) {
      for (const field of apiConfig.custom_fields) {
        if (field.key && field.enabled !== false) {
          customParams[field.key] = resolveFieldValue(field, formattedNumber, caller_state, caller_zip, apiConfig, agent_fields, rawDigits);
        }
      }
    }

    let customRtbUrl = rawUrl;
    const fetchOptions: RequestInit = { method: httpMethod, headers: { Accept: "application/json" } };
    const bodyFormatField = Array.isArray(apiConfig.custom_fields) && apiConfig.custom_fields.find((f: any) => f.key === "_body_format");
    const useFormEncoding = bodyFormatField ? bodyFormatField.value === "form" : false;

    if (httpMethod === "GET") {
      const url = new URL(customRtbUrl);
      for (const [k, v] of Object.entries(customParams)) {
        if (k.startsWith("_")) continue;
        if (!url.searchParams.has(k)) url.searchParams.set(k, v);
      }
      customRtbUrl = url.toString();
    } else {
      const bodyParams: Record<string, string> = {};
      for (const [k, v] of Object.entries(customParams)) {
        if (k.startsWith("_")) continue;
        bodyParams[k] = v;
      }
      if (useFormEncoding) {
        fetchOptions.headers = { ...(fetchOptions.headers as Record<string, string>), "Content-Type": "application/x-www-form-urlencoded" };
        fetchOptions.body = new URLSearchParams(bodyParams).toString();
      } else {
        fetchOptions.headers = { ...(fetchOptions.headers as Record<string, string>), "Content-Type": "application/json" };
        fetchOptions.body = JSON.stringify(bodyParams);
      }
    }

    const customResponse = await fetch(customRtbUrl, fetchOptions);
    const customContentType = customResponse.headers.get("content-type") || "";
    let customData: Record<string, unknown>;
    if (customContentType.includes("application/json")) {
      customData = await customResponse.json() as Record<string, unknown>;
    } else {
      const textResponse = await customResponse.text();
      try {
        customData = JSON.parse(textResponse);
      } catch {
        return {
          status: 200,
          body: {
            ok: false,
            action: "rtb",
            error: "Custom RTB returned an invalid response",
            raw: { text: textResponse.substring(0, 200) },
            http_status: customResponse.status,
          },
        };
      }
    }
    const customUpstreamStatus = customResponse.status;

    const trackingNumber =
      customData.phoneNumber || customData.number || customData.inbound_number ||
      customData.destination || customData.tracking_number || customData.did || customData.routing_number;

    const isCustomSuccess =
      customData.code === 1000 || customData.success === true || customData.status === "success" ||
      customData.status === "accepted" || customData.status === "reserved" || customData.status === "ok";
    const sipOrId = customData.dynamicSipAddress || customData.id;
    const payout = customData.dynamicBid || customData.payout || customData.price || customData.bid;

    if (trackingNumber) {
      return { status: 200, body: { ok: true, action: "rtb", did: trackingNumber, payout, raw: customData, http_status: customUpstreamStatus } };
    } else if (isCustomSuccess && sipOrId) {
      return { status: 200, body: { ok: true, action: "rtb", did: String(sipOrId), payout, raw: customData, http_status: customUpstreamStatus } };
    } else if (customData.bidAmount === 0 || customData.status === "no-target" || customData.status === "rejected") {
      const rejectMsg = customData.rejectReason || customData.message || customData.status || "No bid available";
      return { status: 200, body: { ok: true, action: "rtb", rejected: true, message: rejectMsg, raw: customData, http_status: customUpstreamStatus } };
    } else {
      const errorMsg = customData.error || customData.message || customData.info || "No tracking number returned from Custom RTB";
      return {
        status: 200,
        body: {
          ok: false,
          action: "rtb",
          error: typeof errorMsg === "string" ? errorMsg : JSON.stringify(errorMsg),
          raw: customData,
          http_status: customUpstreamStatus,
        },
      };
    }
  } else {
    // Retreaver RTB (legacy)
    let rtbKey = apiConfig.api_key;
    let publisherId = apiConfig.publisher_id;

    if (!rtbKey && Array.isArray(apiConfig.custom_fields)) {
      const keyField = apiConfig.custom_fields.find((f: any) => f.enabled !== false && (f.key === "key" || f.key === "api_key"));
      if (keyField) rtbKey = resolveFieldValue(keyField, formattedNumber, caller_state, caller_zip, apiConfig);
    }
    if (!publisherId && Array.isArray(apiConfig.custom_fields)) {
      const pubField = apiConfig.custom_fields.find((f: any) => f.enabled !== false && (f.key === "publisher_id" || f.key === "pub_id"));
      if (pubField) publisherId = resolveFieldValue(pubField, formattedNumber, caller_state, caller_zip, apiConfig);
    }

    if (!rtbKey || !publisherId) {
      return {
        status: 200,
        body: {
          ok: false,
          action: "rtb",
          error: "API Key and Publisher ID are required for RTB mode. Add them as dedicated fields or as custom field parameters named 'key'/'api_key' and 'publisher_id'.",
        },
      };
    }

    const rtbUrl = new URL(`https://rtb.retreaver.com/rtbs.json`);
    rtbUrl.searchParams.set("key", rtbKey);
    rtbUrl.searchParams.set("publisher_id", publisherId);
    rtbUrl.searchParams.set("caller_number", formattedNumber);
    rtbUrl.searchParams.set("caller_state", caller_state);
    rtbUrl.searchParams.set("caller_zip", caller_zip);

    if (Array.isArray(apiConfig.custom_fields)) {
      for (const field of apiConfig.custom_fields) {
        if (field.enabled === false || !field.key) continue;
        if (["key", "api_key", "publisher_id", "pub_id"].includes(field.key)) continue;
        const val = resolveFieldValue(field, formattedNumber, caller_state, caller_zip, apiConfig);
        if (!rtbUrl.searchParams.has(field.key)) rtbUrl.searchParams.set(field.key, val);
      }
    }

    const response = await fetch(rtbUrl.toString(), { method: "POST", headers: { Accept: "application/json" } });
    const contentType = response.headers.get("content-type") || "";
    let responseData: Record<string, unknown>;
    if (contentType.includes("application/json")) {
      responseData = await response.json() as Record<string, unknown>;
    } else {
      const textResponse = await response.text();
      try {
        responseData = JSON.parse(textResponse);
      } catch {
        return {
          status: 200,
          body: { ok: false, action: "rtb", error: "Retreaver returned an invalid response", raw: { text: textResponse.substring(0, 200) } },
        };
      }
    }
    const retreavUpstreamStatus = response.status;

    const trackingNumber =
      responseData.inbound_number || responseData.number || responseData.routing_number ||
      responseData.tracking_number || responseData.did;

    if (trackingNumber) {
      return { status: 200, body: { ok: true, action: "rtb", did: trackingNumber, raw: responseData, http_status: retreavUpstreamStatus } };
    } else {
      const errorMsg = responseData.error || responseData.info || responseData.message || "No tracking number returned";
      return {
        status: 200,
        body: {
          ok: false,
          action: "rtb",
          error: typeof errorMsg === "string" ? errorMsg : JSON.stringify(errorMsg),
          raw: responseData,
          http_status: retreavUpstreamStatus,
        },
      };
    }
  }
}
