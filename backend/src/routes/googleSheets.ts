import { Router } from "express";
import { z } from "zod";
import { query } from "../db";
import { asyncHandler } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { isSuperAdmin } from "../lib/authz";
import { HttpError } from "../types";
import {
  GoogleSheetsSettings,
  loadSettings,
  saveSettings,
  parseSpreadsheetId,
  getSpreadsheetInfo,
  getSyncStatus,
  countPending,
  runSync,
  resolveTarget,
} from "../lib/googleSheets";

const router = Router();

// Every endpoint here is super_admin only — the settings hold a private key.
router.use(
  requireAuth,
  asyncHandler(async (req, _res, next) => {
    if (!(await isSuperAdmin(req.user!.id))) throw new HttpError(403, "Forbidden");
    next();
  })
);

/** Never send the private key back to the browser. */
function publicView(s: GoogleSheetsSettings) {
  const { private_key, ...rest } = s;
  return { ...rest, has_private_key: !!private_key };
}

async function listCompanies(s: GoogleSheetsSettings) {
  const { rows } = await query<{ user_id: string; email: string; full_name: string | null; company: string | null; role: string }>(
    `SELECT p.user_id, COALESCE(p.email, u.email::text) AS email, p.full_name, p.company,
            CASE WHEN bool_or(r.role = 'super_admin') THEN 'super_admin' ELSE 'admin' END AS role
       FROM user_roles r
       JOIN profiles p ON p.user_id = r.user_id
       JOIN app_users u ON u.id = r.user_id
      WHERE r.role IN ('admin', 'super_admin')
      GROUP BY p.user_id, p.email, u.email, p.full_name, p.company
      ORDER BY lower(COALESCE(p.company, p.email, u.email::text))`
  );
  return rows.map((r) => {
    const target = resolveTarget(s, r.user_id, r.company, r.email);
    return {
      ...r,
      tab_name: target.tab,
      spreadsheet_id: target.spreadsheetId,
      override: s.admin_overrides[r.user_id] ?? null,
    };
  });
}

// ── GET /api/google-sheets — settings, status, per-company targets ─────────
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const s = await loadSettings();
    res.json({
      settings: publicView(s),
      status: getSyncStatus(),
      pending: s.enabled ? await countPending(s) : 0,
      companies: await listCompanies(s),
    });
  })
);

// ── PUT /api/google-sheets — save settings ─────────────────────────────────
const overrideSchema = z.object({
  spreadsheet_id: z.string().max(500).optional(),
  tab_name: z.string().max(100).optional(),
});

const putSchema = z.object({
  enabled: z.boolean().optional(),
  spreadsheet_id: z.string().max(500).optional(),
  // The raw JSON key file contents. Omit to keep the stored key.
  service_account_json: z.string().max(20_000).optional(),
  timezone: z.string().max(64).optional(),
  admin_overrides: z.record(overrideSchema).optional(),
});

router.put(
  "/",
  asyncHandler(async (req, res) => {
    const input = putSchema.parse(req.body);
    const s = await loadSettings();
    const wasEnabled = s.enabled;

    if (input.service_account_json !== undefined && input.service_account_json.trim()) {
      let key: { client_email?: string; private_key?: string; type?: string };
      try {
        key = JSON.parse(input.service_account_json);
      } catch {
        throw new HttpError(400, "Service account key is not valid JSON — paste the whole downloaded .json file.");
      }
      if (!key.client_email || !key.private_key) {
        throw new HttpError(400, "Key file is missing client_email / private_key — download a JSON key for a service account.");
      }
      s.client_email = key.client_email;
      // Tolerate keys that were double-escaped while copy/pasting.
      s.private_key = key.private_key.replace(/\\n/g, "\n");
    }
    if (input.spreadsheet_id !== undefined) s.spreadsheet_id = parseSpreadsheetId(input.spreadsheet_id);
    if (input.timezone !== undefined) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: input.timezone });
      } catch {
        throw new HttpError(400, `Unknown timezone "${input.timezone}"`);
      }
      s.timezone = input.timezone;
    }
    if (input.admin_overrides !== undefined) {
      const cleaned: GoogleSheetsSettings["admin_overrides"] = {};
      for (const [adminId, o] of Object.entries(input.admin_overrides)) {
        const spreadsheet_id = parseSpreadsheetId(o.spreadsheet_id || "");
        const tab_name = (o.tab_name || "").trim();
        if (spreadsheet_id || tab_name) cleaned[adminId] = { spreadsheet_id, tab_name };
      }
      s.admin_overrides = cleaned;
    }
    if (input.enabled !== undefined) {
      if (input.enabled && (!s.spreadsheet_id || !s.client_email || !s.private_key)) {
        throw new HttpError(400, "Add a spreadsheet and a service account key before enabling.");
      }
      s.enabled = input.enabled;
      // Turning the export on starts from "now" — history is opt-in via backfill.
      if (input.enabled && !wasEnabled) s.sync_from = new Date().toISOString();
    }

    await saveSettings(s, req.user!.id);
    if (s.enabled) void runSync();
    res.json({ settings: publicView(s) });
  })
);

// ── POST /api/google-sheets/test — verify access to every target sheet ─────
router.post(
  "/test",
  asyncHandler(async (_req, res) => {
    const s = await loadSettings();
    if (!s.spreadsheet_id || !s.client_email || !s.private_key) {
      throw new HttpError(400, "Add a spreadsheet and a service account key first.");
    }
    const ids = new Set<string>([s.spreadsheet_id]);
    for (const o of Object.values(s.admin_overrides)) if (o.spreadsheet_id) ids.add(o.spreadsheet_id);

    const results = [];
    for (const id of ids) {
      try {
        const info = await getSpreadsheetInfo(s, id);
        results.push({ spreadsheet_id: id, ok: true, title: info.title, tabs: info.tabs });
      } catch (e) {
        results.push({ spreadsheet_id: id, ok: false, error: (e as Error).message });
      }
    }
    res.json({ ok: results.every((r) => r.ok), client_email: s.client_email, results });
  })
);

// ── POST /api/google-sheets/sync — export pending leads now ────────────────
router.post(
  "/sync",
  asyncHandler(async (_req, res) => {
    const s = await loadSettings();
    if (!s.enabled) throw new HttpError(400, "Google Sheets export is turned off.");
    let total = 0;
    // A pass writes up to 1000 leads; drain a backlog in a few passes.
    for (let i = 0; i < 10; i++) {
      const n = await runSync();
      total += n;
      if (n === 0 || getSyncStatus().errors.length) break;
    }
    res.json({ synced: total, status: getSyncStatus(), pending: await countPending(s) });
  })
);

// ── POST /api/google-sheets/backfill — also export older leads ─────────────
const backfillSchema = z.object({
  // ISO date; omit to export the entire lead history.
  from: z.string().optional(),
});

router.post(
  "/backfill",
  asyncHandler(async (req, res) => {
    const { from } = backfillSchema.parse(req.body ?? {});
    const s = await loadSettings();
    const d = from ? new Date(from) : new Date(0);
    if (Number.isNaN(d.getTime())) throw new HttpError(400, "Invalid date");
    s.sync_from = d.toISOString();
    await saveSettings(s, req.user!.id);
    res.json({ settings: publicView(s), pending: await countPending(s) });
  })
);

export default router;
