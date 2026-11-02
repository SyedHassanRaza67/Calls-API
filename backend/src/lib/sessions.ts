import crypto from "crypto";
import { Request } from "express";
import { query } from "../db";

/**
 * Login sessions for the admin Security Logs page. Each sign-in gets a
 * user_sessions row whose id rides in the JWT as `sid`. There is no limit on
 * concurrent sessions per user — shared agent logins span dozens of PCs.
 */

/** How often (at most) a request refreshes last_seen_at / last_ip. */
const TOUCH_INTERVAL_SECONDS = 60;
/** A session with no activity for this long is treated as gone (JWT lifetime). */
export const SESSION_IDLE_DAYS = 7;

const LOGIN_EVENT_RETENTION_DAYS = 90;
const DEAD_SESSION_RETENTION_DAYS = 30;

export function clientIp(req: Request): string | null {
  return req.ip ? req.ip.replace(/^::ffff:/, "") : null;
}

function userAgent(req: Request): string | null {
  const ua = req.headers["user-agent"];
  return ua ? String(ua).slice(0, 500) : null;
}

export async function createSession(userId: string, req: Request): Promise<string> {
  const ip = clientIp(req);
  const { rows } = await query<{ id: string }>(
    `INSERT INTO user_sessions (user_id, ip, last_ip, user_agent)
     VALUES ($1, $2, $2, $3) RETURNING id`,
    [userId, ip, userAgent(req)]
  );
  return rows[0].id;
}

/**
 * Give a pre-sessions token (no `sid`) a session without logging the user out.
 * Keyed on the token hash so parallel requests from one browser converge on a
 * single row. Returns null when that session has since been revoked.
 */
export async function adoptLegacySession(userId: string, token: string, req: Request): Promise<string | null> {
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const ip = clientIp(req);
  const { rows } = await query<{ id: string; revoked_at: string | null }>(
    `INSERT INTO user_sessions (user_id, ip, last_ip, user_agent, legacy_token_hash)
     VALUES ($1, $2, $2, $3, $4)
     ON CONFLICT (legacy_token_hash) DO UPDATE SET last_seen_at = now(), last_ip = EXCLUDED.last_ip
     RETURNING id, revoked_at`,
    [userId, ip, userAgent(req), hash]
  );
  return rows[0].revoked_at ? null : rows[0].id;
}

/**
 * True when the session is live. Refreshes last_seen_at / last_ip at most once
 * per TOUCH_INTERVAL_SECONDS so busy clients don't write on every request.
 */
export async function validateAndTouchSession(sid: string, userId: string, req: Request): Promise<boolean> {
  const { rows } = await query<{ revoked_at: string | null; stale: boolean }>(
    `SELECT revoked_at, last_seen_at < now() - make_interval(secs => $3) AS stale
       FROM user_sessions WHERE id = $1 AND user_id = $2`,
    [sid, userId, TOUCH_INTERVAL_SECONDS]
  );
  const row = rows[0];
  if (!row || row.revoked_at) return false;
  if (row.stale) {
    await query("UPDATE user_sessions SET last_seen_at = now(), last_ip = $2 WHERE id = $1", [
      sid,
      clientIp(req),
    ]);
  }
  return true;
}

export async function revokeSession(sid: string, by: string | null, reason: string): Promise<void> {
  await query(
    `UPDATE user_sessions SET revoked_at = now(), revoked_by = $2, revoke_reason = $3
      WHERE id = $1 AND revoked_at IS NULL`,
    [sid, by, reason]
  );
}

export async function revokeAllSessions(
  userId: string,
  by: string | null,
  reason: string,
  exceptSid?: string
): Promise<number> {
  const { rowCount } = await query(
    `UPDATE user_sessions SET revoked_at = now(), revoked_by = $2, revoke_reason = $3
      WHERE user_id = $1 AND revoked_at IS NULL AND ($4::uuid IS NULL OR id <> $4::uuid)`,
    [userId, by, reason, exceptSid ?? null]
  );
  return rowCount ?? 0;
}

export async function recordLoginEvent(
  req: Request,
  e: { userId: string | null; email: string; success: boolean; reason?: string; sessionId?: string }
): Promise<void> {
  try {
    await query(
      `INSERT INTO login_events (user_id, email, ip, user_agent, success, reason, session_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [e.userId, e.email.slice(0, 254), clientIp(req), userAgent(req), e.success, e.reason ?? null, e.sessionId ?? null]
    );
  } catch (err) {
    // Audit logging must never block a sign-in.
    console.error("[sessions] failed to record login event:", err);
  }
}

let pruneTimer: NodeJS.Timeout | null = null;

async function pruneSecurityLogs(): Promise<void> {
  try {
    await query("DELETE FROM login_events WHERE created_at < now() - make_interval(days => $1)", [
      LOGIN_EVENT_RETENTION_DAYS,
    ]);
    await query(
      `DELETE FROM user_sessions
        WHERE revoked_at < now() - make_interval(days => $1)
           OR last_seen_at < now() - make_interval(days => $1 + $2)`,
      [DEAD_SESSION_RETENTION_DAYS, SESSION_IDLE_DAYS]
    );
  } catch (err) {
    console.error("[sessions] prune failed:", err);
  }
}

export function startSecurityLogPruner(): void {
  void pruneSecurityLogs();
  pruneTimer = setInterval(() => void pruneSecurityLogs(), 60 * 60 * 1000);
  pruneTimer.unref();
}

export function stopSecurityLogPruner(): void {
  if (pruneTimer) clearInterval(pruneTimer);
  pruneTimer = null;
}
