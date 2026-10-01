import jwt from "jsonwebtoken";
import { query } from "../db";

/**
 * Google Sheets lead export.
 *
 * The super admin connects a Google *service account* (pasted JSON key) and a
 * spreadsheet that has been shared with the service account's email. A
 * background worker then appends every finished lead to a tab named after the
 * owning company (the admin who manages the submitting agent), so each company
 * — e.g. "TF Communication" — gets its own sheet. An admin can optionally be
 * routed to a completely separate spreadsheet via `admin_overrides`.
 *
 * No googleapis dependency: we sign the OAuth JWT with jsonwebtoken (RS256)
 * and call the Sheets REST API with fetch.
 */

export const SETTINGS_KEY = "google_sheets";

export interface AdminOverride {
  /** Send this company's leads to a different spreadsheet (service_account mode). */
  spreadsheet_id?: string;
  /** Send this company's leads to a different Apps Script web app (apps_script mode). */
  webapp_url?: string;
  /** Custom tab name (defaults to the company name / admin email). */
  tab_name?: string;
}

/**
 * apps_script     — the sheet owner pastes our script into Extensions → Apps
 *                   Script and deploys it as a web app; we POST rows to it.
 *                   No Google Cloud project or key needed (the default).
 * service_account — Sheets REST API with a service-account JSON key.
 */
export type SheetsMode = "apps_script" | "service_account";

export interface GoogleSheetsSettings {
  enabled: boolean;
  mode: SheetsMode;
  /** Apps Script web app "/exec" URL. */
  webapp_url: string;
  /** Shared secret embedded in the Apps Script so only we can write. */
  webapp_secret: string;
  spreadsheet_id: string;
  client_email: string;
  private_key: string;
  timezone: string;
  /** Leads created before this instant are never exported (unless backfilled). */
  sync_from: string;
  admin_overrides: Record<string, AdminOverride>;
}

export const DEFAULT_SETTINGS: GoogleSheetsSettings = {
  enabled: false,
  mode: "apps_script",
  webapp_url: "",
  webapp_secret: "",
  spreadsheet_id: "",
  client_email: "",
  private_key: "",
  timezone: "America/New_York",
  sync_from: new Date(0).toISOString(),
  admin_overrides: {},
};

export const HEADER = [
  "Timestamp",
  "Agent Name",
  "Agent Email",
  "Campaign",
  "Campaign Section",
  "Caller Number",
  "State",
  "Zip",
  "Resulting DID",
  "Status",
  "Stage",
  "External Lead ID",
  "Lead ID",
];

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

// A ping/post lead normally completes within seconds; anything still not
// "complete" after this long was abandoned and is exported as-is.
const STALE_MINUTES = 10;
const BATCH_LIMIT = 1000;
const INTERVAL_MS = 30_000;

// ── settings ────────────────────────────────────────────────────────────────

export async function loadSettings(): Promise<GoogleSheetsSettings> {
  const { rows } = await query<{ setting_value: Partial<GoogleSheetsSettings> }>(
    "SELECT setting_value FROM system_settings WHERE setting_key = $1",
    [SETTINGS_KEY]
  );
  const stored = rows[0]?.setting_value ?? {};
  // Rows saved before Apps Script mode existed were service-account setups.
  const mode: SheetsMode = stored.mode ?? (stored.private_key ? "service_account" : "apps_script");
  return { ...DEFAULT_SETTINGS, ...stored, mode };
}

export async function saveSettings(s: GoogleSheetsSettings, userId: string): Promise<void> {
  await query(
    `INSERT INTO system_settings (setting_key, setting_value, description, updated_by, updated_at)
       VALUES ($1, $2, 'Google Sheets lead export (contains service-account key)', $3, now())
     ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = EXCLUDED.setting_value,
                     updated_by = EXCLUDED.updated_by,
                     updated_at = now()`,
    [SETTINGS_KEY, JSON.stringify(s), userId]
  );
}

/** Is the export fully configured for its mode? */
export function isConnected(s: GoogleSheetsSettings): boolean {
  return s.mode === "apps_script"
    ? !!s.webapp_url && !!s.webapp_secret
    : !!s.spreadsheet_id && !!s.client_email && !!s.private_key;
}

/**
 * Only Apps Script web-app URLs are accepted — this is a server-side fetch, so
 * the host is pinned to Google rather than being an arbitrary URL.
 */
export function normalizeWebAppUrl(input: string): string {
  const url = (input || "").trim();
  if (!url) return "";
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec\/?$/.test(url)) {
    throw new Error(
      'Web App URL must look like https://script.google.com/macros/s/…/exec (Deploy → New deployment → Web app, then copy the "Web app URL").'
    );
  }
  return url.replace(/\/$/, "");
}

/** Accepts a bare spreadsheet id or a full docs.google.com URL. */
export function parseSpreadsheetId(input: string): string {
  const trimmed = (input || "").trim();
  const m = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : trimmed;
}

/** Sheet titles cannot contain []*?:/\ and are capped at 100 chars. */
export function sanitizeTabName(name: string): string {
  const cleaned = name.replace(/[\[\]*?:/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  return cleaned || "Unassigned";
}

// ── Google API client ───────────────────────────────────────────────────────

let tokenCache: { key: string; token: string; expiresAt: number } | null = null;

async function getAccessToken(s: GoogleSheetsSettings): Promise<string> {
  const cacheKey = `${s.client_email}:${s.private_key.length}`;
  if (tokenCache && tokenCache.key === cacheKey && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }
  const now = Math.floor(Date.now() / 1000);
  let assertion: string;
  try {
    assertion = jwt.sign(
      { iss: s.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 },
      s.private_key,
      { algorithm: "RS256" }
    );
  } catch {
    throw new Error("Service account private key is invalid — re-paste the JSON key file.");
  }
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });
  const data = (await resp.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!resp.ok || !data.access_token) {
    throw new Error(`Google sign-in failed: ${data.error_description || data.error || resp.status}`);
  }
  tokenCache = { key: cacheKey, token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

async function sheetsFetch<T>(s: GoogleSheetsSettings, url: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken(s);
  const resp = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const data = (await resp.json().catch(() => ({}))) as any;
  if (!resp.ok) {
    const msg = data?.error?.message || `HTTP ${resp.status}`;
    if (resp.status === 403 || resp.status === 404) {
      throw new Error(
        `${msg} — make sure the spreadsheet exists and is shared (Editor) with ${s.client_email}`
      );
    }
    throw new Error(msg);
  }
  return data as T;
}

/** A1 range for a whole tab: 'Tab ''name'''!A1 */
function tabRange(tab: string, cells = "A1"): string {
  return encodeURIComponent(`'${tab.replace(/'/g, "''")}'!${cells}`);
}

export async function getSpreadsheetInfo(
  s: GoogleSheetsSettings,
  spreadsheetId: string
): Promise<{ title: string; tabs: string[] }> {
  const data = await sheetsFetch<{ properties?: { title?: string }; sheets?: { properties?: { title?: string } }[] }>(
    s,
    `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties.title`
  );
  return {
    title: data.properties?.title ?? "",
    tabs: (data.sheets ?? []).map((x) => x.properties?.title ?? "").filter(Boolean),
  };
}

/** Create a tab with a bold, frozen header row. */
async function createTab(s: GoogleSheetsSettings, spreadsheetId: string, tab: string): Promise<void> {
  const added = await sheetsFetch<{ replies?: { addSheet?: { properties?: { sheetId?: number } } }[] }>(
    s,
    `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: tab, gridProperties: { frozenRowCount: 1 } } } }],
      }),
    }
  );
  await sheetsFetch(
    s,
    `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${tabRange(tab)}?valueInputOption=RAW`,
    { method: "PUT", body: JSON.stringify({ values: [HEADER] }) }
  );
  const sheetId = added.replies?.[0]?.addSheet?.properties?.sheetId;
  if (sheetId !== undefined) {
    await sheetsFetch(s, `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true } } },
              fields: "userEnteredFormat.textFormat.bold",
            },
          },
        ],
      }),
    });
  }
}

async function appendRows(
  s: GoogleSheetsSettings,
  spreadsheetId: string,
  tab: string,
  rows: string[][]
): Promise<void> {
  // RAW so agent-entered text like "=HYPERLINK(...)" is never evaluated.
  await sheetsFetch(
    s,
    `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${tabRange(tab)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: rows }) }
  );
}

// ── Apps Script web app client ──────────────────────────────────────────────

/** The script the sheet owner pastes into Extensions → Apps Script. */
export function buildAppsScript(secret: string): string {
  return `/**
 * Calls API -> Google Sheets lead export.
 * Paste this whole file into Extensions > Apps Script, then
 * Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
 * Each company's leads are written to its own tab, created automatically.
 */
const SECRET = '${secret}';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return reply({ ok: false, error: 'Invalid secret - copy the script again from Calls API' });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (body.action === 'test') {
      return reply({ ok: true, title: ss.getName(), tabs: ss.getSheets().map(function (s) { return s.getName(); }) });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      let sheet = ss.getSheetByName(body.tab);
      if (!sheet) {
        sheet = ss.insertSheet(body.tab);
        sheet.getRange(1, 1, 1, body.header.length).setValues([body.header]).setFontWeight('bold');
        sheet.setFrozenRows(1);
      }
      const rows = body.rows || [];
      if (rows.length) {
        // Plain-text format: keeps phone numbers as typed and never runs "=" formulas.
        sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length)
          .setNumberFormat('@')
          .setValues(rows);
      }
      return reply({ ok: true, appended: rows.length });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}

function doGet() {
  return reply({ ok: true, message: 'Calls API sheet export is installed. Paste this Web App URL into Calls API.' });
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
`;
}

async function webAppPost<T>(url: string, payload: Record<string, unknown>): Promise<T> {
  // Apps Script answers a POST with a 302 to googleusercontent.com; fetch
  // follows it (as GET), which is how the web app hands back its output.
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    redirect: "follow",
  });
  const text = await resp.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    if (/<html/i.test(text)) {
      throw new Error(
        'Google returned a sign-in page instead of the script — redeploy the Web app with "Who has access: Anyone".'
      );
    }
    throw new Error(`Web app returned an unexpected response (HTTP ${resp.status})`);
  }
  if (!data?.ok) throw new Error(data?.error || `Web app error (HTTP ${resp.status})`);
  return data as T;
}

export async function testWebApp(s: GoogleSheetsSettings, url: string): Promise<{ title: string; tabs: string[] }> {
  return webAppPost(url, { secret: s.webapp_secret, action: "test" });
}

// ── sync worker ─────────────────────────────────────────────────────────────

interface LeadRow {
  id: string;
  created_at: Date;
  caller_number: string;
  caller_state: string;
  caller_zip: string;
  returned_did: string | null;
  status: string;
  submission_stage: string;
  external_lead_id: string | null;
  agent_name: string | null;
  agent_email: string | null;
  campaign: string | null;
  campaign_section: string | null;
  owner_id: string | null;
  owner_company: string | null;
  owner_email: string | null;
}

export interface SyncStatus {
  running: boolean;
  last_run_at: string | null;
  last_success_at: string | null;
  last_synced_count: number;
  total_synced_since_start: number;
  errors: { tab: string; dest: string; error: string }[];
}

const status: SyncStatus = {
  running: false,
  last_run_at: null,
  last_success_at: null,
  last_synced_count: 0,
  total_synced_since_start: 0,
  errors: [],
};

export function getSyncStatus(): SyncStatus {
  return { ...status, errors: [...status.errors] };
}

function formatTimestamp(d: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function toSheetRow(l: LeadRow, timezone: string): string[] {
  return [
    formatTimestamp(new Date(l.created_at), timezone),
    l.agent_name ?? "",
    l.agent_email ?? "",
    l.campaign ?? "",
    l.campaign_section ?? "",
    l.caller_number ?? "",
    l.caller_state ?? "",
    l.caller_zip ?? "",
    l.returned_did ?? "",
    l.status ?? "",
    l.submission_stage ?? "",
    l.external_lead_id ?? "",
    l.id,
  ];
}

/** Where a company's leads go: its spreadsheet + tab. */
export function resolveTarget(
  s: GoogleSheetsSettings,
  ownerId: string | null,
  company: string | null,
  ownerEmail: string | null
): { dest: string; tab: string } {
  const o: AdminOverride = (ownerId && s.admin_overrides[ownerId]) || {};
  return {
    // dest = web app URL (apps_script) or spreadsheet id (service_account).
    dest:
      s.mode === "apps_script"
        ? o.webapp_url || s.webapp_url
        : parseSpreadsheetId(o.spreadsheet_id || "") || s.spreadsheet_id,
    tab: sanitizeTabName(o.tab_name || company || ownerEmail || "Unassigned"),
  };
}

// The lead's owner is the submitter when they are an admin, otherwise the
// admin that manages them (profiles.managed_by).
const OWNER_SQL = `
  LEFT JOIN app_users u ON u.id = l.user_id
  LEFT JOIN profiles p ON p.user_id = l.user_id
  LEFT JOIN api_configurations ac ON ac.id = l.api_configuration_id
  LEFT JOIN LATERAL (
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = l.user_id AND r.role IN ('admin','super_admin'))
        THEN l.user_id
      ELSE p.managed_by
    END AS owner_id
  ) o ON true
  LEFT JOIN profiles op ON op.user_id = o.owner_id
  LEFT JOIN app_users ou ON ou.id = o.owner_id`;

const READY_SQL = `
  l.sheet_synced_at IS NULL
  AND l.created_at >= $1
  AND (l.submission_stage = 'complete' OR l.created_at < now() - interval '${STALE_MINUTES} minutes')`;

export async function countPending(s: GoogleSheetsSettings): Promise<number> {
  const { rows } = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM leads l WHERE ${READY_SQL}`,
    [s.sync_from]
  );
  return parseInt(rows[0]?.n ?? "0", 10);
}

/** One pass: export every ready lead. Returns how many rows were written. */
export async function runSync(): Promise<number> {
  if (status.running) return 0;
  status.running = true;
  status.last_run_at = new Date().toISOString();
  try {
    const s = await loadSettings();
    if (!s.enabled || !isConnected(s)) {
      status.errors = [];
      return 0;
    }

    const { rows } = await query<LeadRow>(
      `SELECT l.id, l.created_at, l.caller_number, l.caller_state, l.caller_zip, l.returned_did,
              l.status, l.submission_stage, l.external_lead_id,
              p.full_name AS agent_name, COALESCE(p.email, u.email::text) AS agent_email,
              ac.name AS campaign, ac.campaign_section,
              o.owner_id, op.company AS owner_company, COALESCE(op.email, ou.email::text) AS owner_email
         FROM leads l ${OWNER_SQL}
        WHERE ${READY_SQL}
        ORDER BY l.created_at ASC
        LIMIT ${BATCH_LIMIT}`,
      [s.sync_from]
    );

    // Group by destination (spreadsheet / web app) + tab.
    const groups = new Map<string, { dest: string; tab: string; leads: LeadRow[] }>();
    for (const l of rows) {
      const t = resolveTarget(s, l.owner_id, l.owner_company, l.owner_email);
      const k = `${t.dest}\u0000${t.tab}`;
      if (!groups.has(k)) groups.set(k, { ...t, leads: [] });
      groups.get(k)!.leads.push(l);
    }

    const errors: SyncStatus["errors"] = [];
    const tabsBySheet = new Map<string, Set<string>>();
    let written = 0;

    for (const g of groups.values()) {
      try {
        const values = g.leads.map((l) => toSheetRow(l, s.timezone));
        if (s.mode === "apps_script") {
          // The script creates the tab (with header) itself when missing.
          await webAppPost(g.dest, { secret: s.webapp_secret, action: "append", tab: g.tab, header: HEADER, rows: values });
        } else {
          let tabs = tabsBySheet.get(g.dest);
          if (!tabs) {
            tabs = new Set((await getSpreadsheetInfo(s, g.dest)).tabs);
            tabsBySheet.set(g.dest, tabs);
          }
          if (!tabs.has(g.tab)) {
            await createTab(s, g.dest, g.tab);
            tabs.add(g.tab);
          }
          await appendRows(s, g.dest, g.tab, values);
        }
        await query("UPDATE leads SET sheet_synced_at = now() WHERE id = ANY($1::uuid[])", [
          g.leads.map((l) => l.id),
        ]);
        written += g.leads.length;
      } catch (e) {
        // Leave these leads unsynced so the next pass retries them.
        errors.push({ tab: g.tab, dest: g.dest, error: (e as Error).message });
      }
    }

    const prev = status.errors.map((e) => e.error).join("|");
    if (errors.length && errors.map((e) => e.error).join("|") !== prev) {
      console.error("google sheets sync errors:", errors);
    }
    status.errors = errors;
    status.last_synced_count = written;
    status.total_synced_since_start += written;
    if (!errors.length) status.last_success_at = new Date().toISOString();
    return written;
  } catch (e) {
    status.errors = [{ tab: "*", dest: "", error: (e as Error).message }];
    console.error("google sheets sync failed:", e);
    return 0;
  } finally {
    status.running = false;
  }
}

let timer: NodeJS.Timeout | null = null;

export function startSheetsSyncWorker(): void {
  if (timer) return;
  timer = setInterval(() => {
    void runSync();
  }, INTERVAL_MS);
  timer.unref();
}

export function stopSheetsSyncWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
