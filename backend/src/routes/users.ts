import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { query, withTransaction } from "../db";
import { asyncHandler } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { requireAdmin, requireSuperAdmin } from "../middleware/requireRole";
import { hashPassword } from "../lib/password";
import { isSuperAdmin, isAdmin } from "../lib/authz";
import { AppRole, HttpError } from "../types";

const router = Router();
router.use(requireAuth);

// ── GET /api/users — list users + roles + profiles (scoped) ─────────────
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const superAdmin = await isSuperAdmin(me);
    const admin = await isAdmin(me);

    let rows;
    if (superAdmin) {
      ({ rows } = await query(
        `SELECT u.id AS user_id, u.email, u.created_at,
                p.full_name, p.phone, p.company, p.managed_by, p.is_paused, p.paused_reason, p.approval_status,
                COALESCE((SELECT array_agg(role) FROM user_roles ur WHERE ur.user_id = u.id), '{}') AS roles
           FROM app_users u
           LEFT JOIN profiles p ON p.user_id = u.id
          ORDER BY u.created_at DESC`
      ));
    } else if (admin) {
      ({ rows } = await query(
        `SELECT u.id AS user_id, u.email, u.created_at,
                p.full_name, p.phone, p.company, p.managed_by, p.is_paused, p.paused_reason, p.approval_status,
                COALESCE((SELECT array_agg(role) FROM user_roles ur WHERE ur.user_id = u.id), '{}') AS roles
           FROM app_users u
           JOIN profiles p ON p.user_id = u.id
          WHERE p.managed_by = $1
          ORDER BY u.created_at DESC`,
        [me]
      ));
    } else {
      ({ rows } = await query(
        `SELECT u.id AS user_id, u.email, u.created_at,
                p.full_name, p.phone, p.company, p.managed_by, p.is_paused, p.paused_reason, p.approval_status,
                COALESCE((SELECT array_agg(role) FROM user_roles ur WHERE ur.user_id = u.id), '{}') AS roles
           FROM app_users u
           LEFT JOIN profiles p ON p.user_id = u.id
          WHERE u.id = $1`,
        [me]
      ));
    }
    res.json(rows);
  })
);

// ── GET /api/users/pending — self-signups awaiting approval (super_admin) ─
// MUST be registered before any GET /:userId route so "pending" is not
// captured as a :userId param.
router.get(
  "/pending",
  requireSuperAdmin,
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT user_id, email, full_name, company, phone, created_at
         FROM profiles
        WHERE approval_status = 'pending'
        ORDER BY created_at DESC`
    );
    res.json(rows);
  })
);

// ── POST /api/users/:userId/approval — approve/reject a signup (super_admin)
const approvalSchema = z.object({ status: z.enum(["approved", "rejected"]) });

router.post(
  "/:userId/approval",
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const userId = req.params.userId;
    const { status } = approvalSchema.parse(req.body);

    const { rowCount } = await query(
      "UPDATE profiles SET approval_status = $2, updated_at = now() WHERE user_id = $1",
      [userId, status]
    );
    if (rowCount === 0) throw new HttpError(404, "Profile not found");

    res.json({ ok: true });
  })
);

// ── POST /api/users — port of create-agent edge function ────────────────
const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  // accept both full_name (contract) and fullName (legacy edge fn body)
  full_name: z.string().optional(),
  fullName: z.string().optional(),
  role: z.string().optional(),
});

router.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const superAdmin = await isSuperAdmin(me);
    // isAdmin already enforced by requireAdmin middleware.

    const parsed = createSchema.parse(req.body);
    const email = parsed.email?.toLowerCase().trim();
    const password = parsed.password;
    const fullName = parsed.full_name ?? parsed.fullName ?? "";
    const requestedRole = parsed.role;

    if (!email || !password) {
      throw new HttpError(400, "Email and password are required");
    }

    // Validate role based on requester's permissions (mirrors create-agent).
    let assignedRole: AppRole = "agent";
    if (requestedRole === "admin") {
      if (!superAdmin) throw new HttpError(403, "Only super admins can create admin users");
      assignedRole = "admin";
    } else if (requestedRole === "super_admin") {
      throw new HttpError(403, "Cannot create super admin users");
    }

    const existing = await query("SELECT 1 FROM app_users WHERE lower(email) = $1", [email]);
    if (existing.rows.length > 0) {
      throw new HttpError(400, "A user with this email address has already been registered");
    }

    // Agents are managed by their creator so they nest under them in the UI.
    const managedBy = assignedRole === "agent" ? me : null;
    const passwordHash = await hashPassword(password);

    const newUserId = await withTransaction(async (client) => {
      const u = await client.query<{ id: string }>(
        "INSERT INTO app_users (email, password_hash) VALUES ($1, $2) RETURNING id",
        [email, passwordHash]
      );
      const id = u.rows[0].id;
      await client.query(
        "INSERT INTO profiles (user_id, email, full_name, managed_by) VALUES ($1, $2, $3, $4)",
        [id, email, fullName, managedBy]
      );
      await client.query("INSERT INTO user_roles (user_id, role) VALUES ($1, $2)", [id, assignedRole]);
      return id;
    });

    res.status(200).json({
      success: true,
      user: { id: newUserId, email, role: assignedRole, managed_by: managedBy },
    });
  })
);

// ── DELETE /api/users/:userId — port of delete-user (super_admin only) ───
router.delete(
  "/:userId",
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const userId = req.params.userId;

    if (!userId) throw new HttpError(400, "userId is required");
    if (userId === me) throw new HttpError(400, "You cannot delete yourself");

    const targetRoles = await query<{ role: AppRole }>(
      "SELECT role FROM user_roles WHERE user_id = $1",
      [userId]
    );
    if (targetRoles.rows.some((r) => r.role === "super_admin")) {
      throw new HttpError(403, "Super admins cannot be deleted");
    }

    // app_users delete cascades to profiles/user_roles/leads/etc via FK.
    const del = await query("DELETE FROM app_users WHERE id = $1", [userId]);
    if (del.rowCount === 0) throw new HttpError(404, "User not found");

    res.status(200).json({ success: true });
  })
);

// ── POST /api/users/:userId/reset-password — port of reset-user-password ─
function generatePassword(len = 14): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const nums = "23456789";
  const sym = "!@#$%^&*";
  const all = upper + lower + nums + sym;
  const bytes = crypto.randomBytes(len);
  let out =
    upper[bytes[0] % upper.length] +
    lower[bytes[1] % lower.length] +
    nums[bytes[2] % nums.length] +
    sym[bytes[3] % sym.length];
  for (let i = 4; i < len; i++) out += all[bytes[i] % all.length];
  return out
    .split("")
    .sort(() => 0.5 - Math.random())
    .join("");
}

const resetSchema = z.object({
  new_password: z.string().optional(),
  newPassword: z.string().optional(),
});

router.post(
  "/:userId/reset-password",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const userId = req.params.userId;
    const superAdmin = await isSuperAdmin(me);

    if (!userId) throw new HttpError(400, "userId is required");

    const parsed = resetSchema.parse(req.body ?? {});
    let password = (parsed.new_password ?? parsed.newPassword ?? "").trim();

    const target = await query<{ managed_by: string | null }>(
      "SELECT managed_by FROM profiles WHERE user_id = $1",
      [userId]
    );
    const targetRole = await query<{ role: AppRole }>(
      "SELECT role FROM user_roles WHERE user_id = $1",
      [userId]
    );
    if (target.rows.length === 0 || targetRole.rows.length === 0) {
      throw new HttpError(404, "Target user not found");
    }
    if (targetRole.rows.some((r) => r.role === "super_admin")) {
      throw new HttpError(403, "Cannot reset a super admin's password");
    }
    if (!superAdmin && target.rows[0].managed_by !== me) {
      throw new HttpError(403, "You can only reset passwords for your agents");
    }

    if (password) {
      if (password.length < 6) throw new HttpError(400, "Password must be at least 6 characters");
    } else {
      password = generatePassword(14);
    }

    const hash = await hashPassword(password);
    await query("UPDATE app_users SET password_hash = $1 WHERE id = $2", [hash, userId]);

    res.status(200).json({ success: true, password });
  })
);

// ── PATCH /api/users/:userId/role — super_admin only ────────────────────
const roleSchema = z.object({ role: z.enum(["super_admin", "admin", "agent"]) });

router.patch(
  "/:userId/role",
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const userId = req.params.userId;
    const { role } = roleSchema.parse(req.body);

    const exists = await query("SELECT 1 FROM app_users WHERE id = $1", [userId]);
    if (exists.rows.length === 0) throw new HttpError(404, "User not found");

    // Single-role model: replace whatever roles the user currently has.
    await withTransaction(async (client) => {
      await client.query("DELETE FROM user_roles WHERE user_id = $1", [userId]);
      await client.query("INSERT INTO user_roles (user_id, role) VALUES ($1, $2)", [userId, role]);
    });

    res.json({ success: true, user_id: userId, role });
  })
);

// ── PATCH /api/users/:userId/pause — admin (scoped) ─────────────────────
const pauseSchema = z.object({ is_paused: z.boolean(), reason: z.string().nullable().optional() });

router.patch(
  "/:userId/pause",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const userId = req.params.userId;
    const { is_paused, reason } = pauseSchema.parse(req.body);

    const superAdmin = await isSuperAdmin(me);
    if (!superAdmin) {
      const target = await query<{ managed_by: string | null }>(
        "SELECT managed_by FROM profiles WHERE user_id = $1",
        [userId]
      );
      if (target.rows.length === 0) throw new HttpError(404, "User not found");
      if (target.rows[0].managed_by !== me) {
        throw new HttpError(403, "You can only pause your own agents");
      }
    }

    const { rows } = await query(
      `UPDATE profiles
          SET is_paused = $2,
              paused_reason = $3,
              paused_at = CASE WHEN $2 THEN now() ELSE NULL END,
              updated_at = now()
        WHERE user_id = $1
        RETURNING *`,
      [userId, is_paused, is_paused ? reason ?? null : null]
    );
    if (rows.length === 0) throw new HttpError(404, "User not found");
    res.json(rows[0]);
  })
);

export default router;
