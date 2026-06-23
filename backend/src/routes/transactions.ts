import { Router } from "express";
import { query } from "../db";
import { asyncHandler } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { isSuperAdmin, isAdmin } from "../lib/authz";

const router = Router();
router.use(requireAuth);

// GET /api/transactions?days=&limit= — scoped to user / managed agents
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const days = Math.max(0, parseInt((req.query.days as string) || "0", 10) || 0);
    const limit = Math.min(5000, Math.max(1, parseInt((req.query.limit as string) || "500", 10) || 500));

    const where: string[] = [];
    const params: unknown[] = [];

    const superAdmin = await isSuperAdmin(me);
    const admin = await isAdmin(me);
    if (superAdmin) {
      // all
    } else if (admin) {
      params.push(me);
      where.push(
        `(t.user_id = $${params.length} OR t.user_id IN (SELECT user_id FROM profiles WHERE managed_by = $${params.length}))`
      );
    } else {
      params.push(me);
      where.push(`t.user_id = $${params.length}`);
    }

    if (days > 0) {
      params.push(days);
      where.push(`t.created_at >= now() - ($${params.length} || ' days')::interval`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    params.push(limit);
    const { rows } = await query(
      `SELECT t.* FROM transactions t ${whereSql} ORDER BY t.created_at DESC LIMIT $${params.length}`,
      params
    );
    res.json(rows);
  })
);

export default router;
