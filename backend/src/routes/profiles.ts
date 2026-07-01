import { Router } from "express";
import { z } from "zod";
import { query } from "../db";
import { asyncHandler } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { isSuperAdmin, isAdmin, managesUser } from "../lib/authz";
import { HttpError } from "../types";

const router = Router();
router.use(requireAuth);

// NOTE: `company` is intentionally NOT self-editable. Agents inherit their
// admin's company name and their logins are tied to the company email domain,
// so a self-serve rename would orphan existing agents. It is set once at signup.
const meUpdateSchema = z.object({
  full_name: z.string().optional(),
  phone: z.string().optional(),
  company_logo: z.string().nullable().optional(),
  avatar_url: z.string().optional(),
});

// The admin path may still set company/company_domain when provisioning/fixing
// accounts (super_admin or a managing admin), so it keeps `company`.
const adminUpdateSchema = meUpdateSchema.extend({
  company: z.string().optional(),
  is_paused: z.boolean().optional(),
  paused_reason: z.string().nullable().optional(),
  managed_by: z.string().uuid().nullable().optional(),
  email: z.string().email().optional(),
});

// GET /api/profiles/me
router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const { rows } = await query("SELECT * FROM profiles WHERE user_id = $1", [req.user!.id]);
    res.json(rows[0] || null);
  })
);

// PATCH /api/profiles/me
router.patch(
  "/me",
  asyncHandler(async (req, res) => {
    const data = meUpdateSchema.parse(req.body);
    const fields = Object.keys(data) as (keyof typeof data)[];
    if (fields.length === 0) {
      const { rows } = await query("SELECT * FROM profiles WHERE user_id = $1", [req.user!.id]);
      return res.json(rows[0] || null);
    }
    const set = fields.map((f, i) => `${f} = $${i + 2}`).join(", ");
    const values = fields.map((f) => data[f]);
    const { rows } = await query(
      `UPDATE profiles SET ${set}, updated_at = now() WHERE user_id = $1 RETURNING *`,
      [req.user!.id, ...values]
    );
    res.json(rows[0] || null);
  })
);

// GET /api/profiles/branding — resolve the current user's company branding.
// Agents inherit their managing admin's company name + logo via managed_by.
router.get(
  "/branding",
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      "SELECT managed_by, company, company_logo FROM profiles WHERE user_id = $1",
      [req.user!.id]
    );
    const me = rows[0];
    let company = me?.company ?? null;
    let companyLogo = me?.company_logo ?? null;
    if (me?.managed_by) {
      const { rows: mgr } = await query(
        "SELECT company, company_logo FROM profiles WHERE user_id = $1",
        [me.managed_by]
      );
      company = mgr[0]?.company ?? null;
      companyLogo = mgr[0]?.company_logo ?? null;
    }
    res.json({ company_name: company, company_logo: companyLogo });
  })
);

// GET /api/profiles — admin: managed agents; super_admin: all (joined with roles)
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    if (await isSuperAdmin(userId)) {
      const { rows } = await query(
        `SELECT p.*, COALESCE(
            (SELECT array_agg(ur.role::text) FROM user_roles ur WHERE ur.user_id = p.user_id), '{}'
          ) AS roles
         FROM profiles p ORDER BY p.created_at DESC`
      );
      return res.json(rows);
    }
    if (await isAdmin(userId)) {
      // Include the admin's OWN profile plus the agents they manage, so the UI
      // can render the admin and nest their agents under them.
      const { rows } = await query(
        `SELECT p.*, COALESCE(
            (SELECT array_agg(ur.role::text) FROM user_roles ur WHERE ur.user_id = p.user_id), '{}'
          ) AS roles
         FROM profiles p WHERE p.managed_by = $1 OR p.user_id = $1 ORDER BY p.created_at DESC`,
        [userId]
      );
      return res.json(rows);
    }
    // Plain agents only see themselves.
    const { rows } = await query("SELECT * FROM profiles WHERE user_id = $1", [userId]);
    res.json(rows);
  })
);

// GET /api/profiles/:userId — authz-scoped
router.get(
  "/:userId",
  asyncHandler(async (req, res) => {
    const target = req.params.userId;
    const me = req.user!.id;
    const allowed =
      target === me || (await isSuperAdmin(me)) || ((await isAdmin(me)) && (await managesUser(me, target)));
    if (!allowed) throw new HttpError(403, "Forbidden");

    const { rows } = await query("SELECT * FROM profiles WHERE user_id = $1", [target]);
    if (rows.length === 0) throw new HttpError(404, "Profile not found");
    res.json(rows[0]);
  })
);

// PATCH /api/profiles/:userId — admin can update pause/managed_by/etc.
router.patch(
  "/:userId",
  asyncHandler(async (req, res) => {
    const target = req.params.userId;
    const me = req.user!.id;

    const superAdmin = await isSuperAdmin(me);
    const adminManages = (await isAdmin(me)) && (await managesUser(me, target));
    if (!superAdmin && !adminManages) throw new HttpError(403, "Forbidden");

    const data = adminUpdateSchema.parse(req.body);
    const updates: Record<string, unknown> = { ...data };

    // Keep paused_at consistent with is_paused.
    if (data.is_paused === true) updates.paused_at = new Date().toISOString();
    if (data.is_paused === false) {
      updates.paused_at = null;
      if (updates.paused_reason === undefined) updates.paused_reason = null;
    }

    const fields = Object.keys(updates);
    if (fields.length === 0) {
      const { rows } = await query("SELECT * FROM profiles WHERE user_id = $1", [target]);
      return res.json(rows[0] || null);
    }
    const set = fields.map((f, i) => `${f} = $${i + 2}`).join(", ");
    const values = fields.map((f) => updates[f]);
    const { rows } = await query(
      `UPDATE profiles SET ${set}, updated_at = now() WHERE user_id = $1 RETURNING *`,
      [target, ...values]
    );
    if (rows.length === 0) throw new HttpError(404, "Profile not found");
    res.json(rows[0]);
  })
);

export default router;
