import { Router } from "express";
import { z } from "zod";
import { query } from "../db";
import { asyncHandler } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { createApiKey } from "../lib/apiKeys";
import { HttpError } from "../types";

const router = Router();
router.use(requireAuth);

// GET /api/api-keys — current user's keys (NEVER the secret)
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, key_name, key_prefix, is_active, created_at, last_used_at
         FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user!.id]
    );
    res.json(rows);
  })
);

// POST /api/api-keys — port of create_api_key RPC; plaintext returned ONCE
const createSchema = z.object({
  key_name: z.string().min(1).optional(),
  keyName: z.string().min(1).optional(),
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = createSchema.parse(req.body ?? {});
    const keyName = parsed.key_name ?? parsed.keyName;
    if (!keyName) throw new HttpError(400, "key_name is required");

    const result = await createApiKey(req.user!.id, keyName);
    // { api_key, key_id } — matches the create_api_key RPC return shape.
    res.status(201).json(result);
  })
);

// DELETE /api/api-keys/:id — deactivate/delete own key
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const del = await query("DELETE FROM api_keys WHERE id = $1 AND user_id = $2", [
      req.params.id,
      req.user!.id,
    ]);
    if (del.rowCount === 0) throw new HttpError(404, "API key not found");
    res.json({ success: true });
  })
);

export default router;
