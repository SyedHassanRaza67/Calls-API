import { Router } from "express";
import { z } from "zod";
import { query } from "../db";
import { asyncHandler } from "../middleware/error";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { isSuperAdmin } from "../lib/authz";
import { HttpError } from "../types";

const router = Router();

// GET /api/system-settings/:key
// `global_pause` is PUBLIC (no auth). Any other key requires auth.
router.get(
  "/:key",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const key = req.params.key;
    if (key !== "global_pause" && !req.user) {
      throw new HttpError(401, "Unauthorized");
    }
    const { rows } = await query<{ setting_key: string; setting_value: unknown }>(
      "SELECT setting_key, setting_value FROM system_settings WHERE setting_key = $1",
      [key]
    );
    if (rows.length === 0) {
      // For global_pause, return a sensible disabled default if unseeded.
      if (key === "global_pause") {
        return res.json({ setting_key: "global_pause", setting_value: { enabled: false, reason: null } });
      }
      throw new HttpError(404, "Setting not found");
    }
    res.json({ setting_key: rows[0].setting_key, setting_value: rows[0].setting_value });
  })
);

// PUT /api/system-settings/:key — super_admin only
const putSchema = z.object({ setting_value: z.any() });

router.put(
  "/:key",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!(await isSuperAdmin(req.user!.id))) throw new HttpError(403, "Forbidden");
    const key = req.params.key;
    const { setting_value } = putSchema.parse(req.body);

    const { rows } = await query(
      `INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
         VALUES ($1, $2, $3, now())
       ON CONFLICT (setting_key)
         DO UPDATE SET setting_value = EXCLUDED.setting_value,
                       updated_by = EXCLUDED.updated_by,
                       updated_at = now()
       RETURNING setting_key, setting_value`,
      [key, JSON.stringify(setting_value), req.user!.id]
    );
    res.json({ setting_key: rows[0].setting_key, setting_value: rows[0].setting_value });
  })
);

export default router;
