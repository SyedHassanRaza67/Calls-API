import { Router } from "express";
import { z } from "zod";
import { query } from "../db";
import { asyncHandler } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/requireRole";
import { isSuperAdmin, managesUser } from "../lib/authz";
import { revokeAllSessions, revokeSession, SESSION_IDLE_DAYS } from "../lib/sessions";
import { HttpError } from "../types";

/**
 * Security Logs: where each account is logged in right now, and the sign-in
 * history. Super admins see everyone; an admin sees themselves plus the agents
 * they manage (profiles.managed_by).
 */
const router = Router();
router.use(requireAuth, requireAdmin);

/** SQL predicate on a user-id column limiting rows to what the caller may see ($1 = caller). */
function scopeSql(column: string, superAdmin: boolean): string {
  if (superAdmin) return "TRUE";
  return `(${column} = $1 OR ${column} IN (SELECT user_id FROM profiles WHERE managed_by = $1))`;
}

async function assertCanManage(me: string, target: string): Promise<void> {
  if (me === target || (await isSuperAdmin(me)) || (await managesUser(me, target))) return;
  throw new HttpError(403, "Forbidden");
}

// ── GET /api/security/sessions — live sessions in scope ─────────────────
router.get(
  "/sessions",
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const superAdmin = await isSuperAdmin(me);
    const { rows } = await query(
      `SELECT s.id, s.user_id, s.ip, s.last_ip, s.user_agent, s.created_at, s.last_seen_at,
              (s.legacy_token_hash IS NOT NULL) AS legacy,
              u.email, p.full_name, p.company,
              COALESCE((SELECT array_agg(role::text) FROM user_roles ur WHERE ur.user_id = s.user_id), '{}') AS roles,
              -- "New IP": the user has sign-in history, but never from this IP in the 30 days before.
              (s.legacy_token_hash IS NULL
                AND EXISTS (SELECT 1 FROM login_events h
                             WHERE h.user_id = s.user_id AND h.success
                               AND h.created_at < s.created_at - interval '1 minute')
                AND NOT EXISTS (SELECT 1 FROM login_events h
                                 WHERE h.user_id = s.user_id AND h.success AND h.ip = s.ip
                                   AND h.created_at < s.created_at - interval '1 minute'
                                   AND h.created_at > s.created_at - interval '30 days')
              ) AS new_ip
         FROM user_sessions s
         JOIN app_users u ON u.id = s.user_id
         LEFT JOIN profiles p ON p.user_id = s.user_id
        WHERE s.revoked_at IS NULL
          AND s.last_seen_at > now() - make_interval(days => ${SESSION_IDLE_DAYS})
          AND ${scopeSql("s.user_id", superAdmin)}
        ORDER BY s.last_seen_at DESC
        LIMIT 2000`,
      superAdmin ? [] : [me]
    );
    res.json({ sessions: rows, current_session_id: req.user!.sid ?? null });
  })
);

// ── GET /api/security/login-events — sign-in history in scope ───────────
const eventsQuerySchema = z.object({
  status: z.enum(["all", "success", "failed"]).default("all"),
  days: z.coerce.number().int().min(1).max(90).default(7),
  user_id: z.string().uuid().optional(),
});

router.get(
  "/login-events",
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const superAdmin = await isSuperAdmin(me);
    const { status, days, user_id } = eventsQuerySchema.parse(req.query);

    const params: unknown[] = superAdmin ? [] : [me];
    // Failed attempts on unknown emails have no user_id; only super admins see those.
    const where = [superAdmin ? "TRUE" : scopeSql("e.user_id", false)];
    params.push(days);
    where.push(`e.created_at > now() - make_interval(days => $${params.length})`);
    if (status !== "all") where.push(status === "success" ? "e.success" : "NOT e.success");
    if (user_id) {
      params.push(user_id);
      where.push(`e.user_id = $${params.length}`);
    }

    const { rows } = await query(
      `SELECT e.id, e.user_id, e.email, e.ip, e.user_agent, e.success, e.reason, e.created_at,
              p.full_name,
              COALESCE((SELECT array_agg(role::text) FROM user_roles ur WHERE ur.user_id = e.user_id), '{}') AS roles
         FROM login_events e
         LEFT JOIN profiles p ON p.user_id = e.user_id
        WHERE ${where.join(" AND ")}
        ORDER BY e.created_at DESC
        LIMIT 1000`,
      params
    );
    res.json(rows);
  })
);

// ── POST /api/security/sessions/:id/revoke — log out one device ─────────
router.post(
  "/sessions/:id/revoke",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { rows } = await query<{ user_id: string }>("SELECT user_id FROM user_sessions WHERE id = $1", [id]);
    if (!rows[0]) throw new HttpError(404, "Session not found");
    await assertCanManage(req.user!.id, rows[0].user_id);
    await revokeSession(id, req.user!.id, "admin_revoke");
    res.json({ ok: true });
  })
);

// ── POST /api/security/users/:userId/revoke-all — log out every device ──
// When an admin targets their own account, their current session is kept.
router.post(
  "/users/:userId/revoke-all",
  asyncHandler(async (req, res) => {
    const userId = z.string().uuid().parse(req.params.userId);
    await assertCanManage(req.user!.id, userId);
    const keep = userId === req.user!.id ? req.user!.sid : undefined;
    const revoked = await revokeAllSessions(userId, req.user!.id, "admin_revoke_all", keep);
    res.json({ ok: true, revoked });
  })
);

export default router;
