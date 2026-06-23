import { Router } from "express";
import { z } from "zod";
import { query } from "../db";
import { asyncHandler } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/requireRole";
import { isSuperAdmin, isAdmin, getManagingAdmin } from "../lib/authz";
import { HttpError } from "../types";

const router = Router();
router.use(requireAuth);

// Columns exposed by the api_configurations_safe view (NO api_key).
const SAFE_COLS = [
  "id", "name", "api_provider", "api_type", "api_mode", "http_method",
  "ping_url", "post_url", "is_active", "assigned_to", "assigned_agents",
  "created_by", "created_at", "updated_at", "custom_fields", "notes",
  "trackdrive_number", "trackdrive_number_id", "publisher_id",
  "ping_id_source_key", "ping_id_post_field", "buyer",
];

/** Strip api_key from a row (safe projection for non-owners). */
function toSafe(row: Record<string, unknown>): Record<string, unknown> {
  const { api_key, ...rest } = row;
  return rest;
}

// GET /api/api-configurations — scoped; non-owners get the _safe projection.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const superAdmin = await isSuperAdmin(me);
    const admin = await isAdmin(me);

    if (superAdmin) {
      // Super admin sees everything WITH api_key.
      const { rows } = await query("SELECT * FROM api_configurations ORDER BY created_at DESC");
      return res.json(rows);
    }

    let rows: Record<string, unknown>[];
    if (admin) {
      // Admin: configs assigned to them. Owner of a config = assigned_to.
      ({ rows } = await query(
        "SELECT * FROM api_configurations WHERE assigned_to = $1 ORDER BY created_at DESC",
        [me]
      ) as { rows: Record<string, unknown>[] });
    } else {
      // Agent: active configs owned by their managing admin where they are
      // assigned (or assignment list is empty). Mirrors the RLS policy.
      const managingAdmin = await getManagingAdmin(me);
      if (!managingAdmin) return res.json([]);
      ({ rows } = await query(
        `SELECT * FROM api_configurations
          WHERE is_active = true
            AND assigned_to = $1
            AND (cardinality(assigned_agents) = 0 OR $2 = ANY(assigned_agents))
          ORDER BY created_at DESC`,
        [managingAdmin, me]
      ) as { rows: Record<string, unknown>[] });
    }

    // Non-super-admins NEVER receive api_key (safe projection).
    res.json(rows.map(toSafe));
  })
);

const createSchema = z.object({
  name: z.string().min(1),
  api_key: z.string().optional().default(""),
  publisher_id: z.string().optional().nullable(),
  api_type: z.string().optional(),
  api_provider: z.string().optional(),
  api_mode: z.string().optional(),
  http_method: z.string().optional().nullable(),
  ping_url: z.string().optional().nullable(),
  post_url: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
  assigned_to: z.string().uuid().optional().nullable(),
  assigned_agents: z.array(z.string().uuid()).optional(),
  custom_fields: z.any().optional(),
  notes: z.string().optional().nullable(),
  buyer: z.string().optional().nullable(),
  trackdrive_number: z.string().optional().nullable(),
  trackdrive_number_id: z.string().optional().nullable(),
  ping_id_source_key: z.string().optional().nullable(),
  ping_id_post_field: z.string().optional().nullable(),
});

// POST /api/api-configurations — admin; create.
router.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const data = createSchema.parse(req.body);

    // Default ownership to the creating admin when not specified.
    const assignedTo = data.assigned_to ?? me;

    const cols: string[] = ["created_by", "assigned_to"];
    const vals: unknown[] = [me, assignedTo];
    const optional: (keyof typeof data)[] = [
      "name", "api_key", "publisher_id", "api_type", "api_provider", "api_mode",
      "http_method", "ping_url", "post_url", "is_active", "assigned_agents",
      "custom_fields", "notes", "buyer", "trackdrive_number", "trackdrive_number_id",
      "ping_id_source_key", "ping_id_post_field",
    ];
    for (const key of optional) {
      if (data[key] !== undefined) {
        cols.push(key);
        const v = data[key];
        vals.push(key === "custom_fields" ? JSON.stringify(v) : (v as unknown));
      }
    }
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const { rows } = await query(
      `INSERT INTO api_configurations (${cols.join(", ")}) VALUES (${placeholders}) RETURNING *`,
      vals
    );
    res.status(201).json(rows[0]);
  })
);

const updateSchema = createSchema.partial();

async function canMutate(me: string, id: string): Promise<boolean> {
  if (await isSuperAdmin(me)) return true;
  const { rows } = await query<{ assigned_to: string | null; created_by: string | null }>(
    "SELECT assigned_to, created_by FROM api_configurations WHERE id = $1",
    [id]
  );
  if (rows.length === 0) return false;
  if (!(await isAdmin(me))) return false;
  return rows[0].assigned_to === me || rows[0].created_by === me;
}

// PATCH /api/api-configurations/:id — owner/admin.
router.patch(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const id = req.params.id;
    if (!(await canMutate(me, id))) throw new HttpError(403, "Forbidden");

    const data = updateSchema.parse(req.body);
    const keys = Object.keys(data) as (keyof typeof data)[];
    if (keys.length === 0) {
      const { rows } = await query("SELECT * FROM api_configurations WHERE id = $1", [id]);
      if (rows.length === 0) throw new HttpError(404, "Not found");
      return res.json(rows[0]);
    }
    const set = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
    const values = keys.map((k) =>
      k === "custom_fields" ? JSON.stringify(data[k]) : (data[k] as unknown)
    );
    const { rows } = await query(
      `UPDATE api_configurations SET ${set}, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    if (rows.length === 0) throw new HttpError(404, "Not found");
    res.json(rows[0]);
  })
);

// DELETE /api/api-configurations/:id — owner/admin.
router.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const id = req.params.id;
    if (!(await canMutate(me, id))) throw new HttpError(403, "Forbidden");
    const del = await query("DELETE FROM api_configurations WHERE id = $1", [id]);
    if (del.rowCount === 0) throw new HttpError(404, "Not found");
    res.json({ success: true });
  })
);

export default router;
