import { Router } from "express";
import { query } from "../db";
import { asyncHandler } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import { isSuperAdmin, isAdmin, managesUser } from "../lib/authz";
import { HttpError } from "../types";

const router = Router();
router.use(requireAuth);

// GET /api/roles?user_id=  → returns [{ role }] for a user (authz-scoped)
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const targetUserId = (req.query.user_id as string) || me;

    const allowed =
      targetUserId === me ||
      (await isSuperAdmin(me)) ||
      ((await isAdmin(me)) && (await managesUser(me, targetUserId)));
    if (!allowed) throw new HttpError(403, "Forbidden");

    const { rows } = await query<{ role: string }>(
      "SELECT role FROM user_roles WHERE user_id = $1",
      [targetUserId]
    );
    res.json(rows);
  })
);

export default router;
