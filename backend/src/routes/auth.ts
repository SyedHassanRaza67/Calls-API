import { Router } from "express";
import { z } from "zod";
import { query, withTransaction } from "../db";
import { hashPassword, verifyPassword } from "../lib/password";
import { signToken } from "../lib/jwt";
import { asyncHandler } from "../middleware/error";
import { requireAuth } from "../middleware/auth";
import {
  getRoles,
  isAccountPaused,
  accountPausedReason,
  isGlobalPaused,
  globalPauseReason,
} from "../lib/authz";
import { HttpError } from "../types";

const router = Router();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  full_name: z.string().optional(),
  company: z.string().optional(),
  phone: z.string().optional(),
});

const signinSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/signup — self-signup creates a PENDING `admin` awaiting
// Super-Admin approval. No JWT is issued until the account is approved.
router.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const { email, password, full_name, company, phone } = signupSchema.parse(req.body);
    const normalizedEmail = email.toLowerCase().trim();

    const existing = await query("SELECT 1 FROM app_users WHERE lower(email) = $1", [normalizedEmail]);
    if (existing.rows.length > 0) {
      throw new HttpError(409, "A user with this email already exists");
    }

    const passwordHash = await hashPassword(password);

    await withTransaction(async (client) => {
      const userRes = await client.query<{ id: string }>(
        "INSERT INTO app_users (email, password_hash) VALUES ($1, $2) RETURNING id",
        [normalizedEmail, passwordHash]
      );
      const id = userRes.rows[0].id;

      await client.query(
        `INSERT INTO profiles (user_id, email, full_name, company, phone, approval_status)
         VALUES ($1, $2, $3, $4, $5, 'pending')`,
        [id, normalizedEmail, full_name || "", company || null, phone || null]
      );
      await client.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')", [id]);
      return id;
    });

    // No JWT — the account is pending Super-Admin approval.
    res.status(200).json({
      status: "pending",
      message:
        "Registration submitted. Your account is pending Super Admin approval — you can sign in once approved.",
    });
  })
);

// POST /api/auth/signin
router.post(
  "/signin",
  asyncHandler(async (req, res) => {
    const { email, password } = signinSchema.parse(req.body);
    const normalizedEmail = email.toLowerCase().trim();

    const { rows } = await query<{ id: string; email: string; password_hash: string }>(
      "SELECT id, email, password_hash FROM app_users WHERE lower(email) = $1",
      [normalizedEmail]
    );
    const user = rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      throw new HttpError(401, "Invalid email or password");
    }

    // Block sign-in for accounts that are still pending or were rejected.
    const approvalRes = await query<{ approval_status: string | null }>(
      "SELECT approval_status FROM profiles WHERE user_id = $1",
      [user.id]
    );
    const approvalStatus = approvalRes.rows[0]?.approval_status ?? null;
    if (approvalStatus === "pending") {
      throw new HttpError(403, "Your account is pending Super Admin approval.");
    }
    if (approvalStatus === "rejected") {
      throw new HttpError(
        403,
        "Your registration request was rejected. Please contact the administrator."
      );
    }

    const token = signToken({ sub: user.id, email: user.email });
    res.json({ token, user: { id: user.id, email: user.email } });
  })
);

// POST /api/auth/signout — stateless; client drops the token.
router.post(
  "/signout",
  asyncHandler(async (_req, res) => {
    res.json({ ok: true });
  })
);

// GET /api/auth/me
router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const profileRes = await query("SELECT * FROM profiles WHERE user_id = $1", [userId]);
    const roles = await getRoles(userId);

    const [paused, pausedReason, globalPaused, globalReason] = await Promise.all([
      isAccountPaused(userId),
      accountPausedReason(userId),
      isGlobalPaused(),
      globalPauseReason(),
    ]);

    res.json({
      user: { id: req.user!.id, email: req.user!.email },
      profile: profileRes.rows[0] || null,
      roles,
      isPaused: paused,
      pausedReason: pausedReason,
      isGlobalPaused: globalPaused,
      globalPauseReason: globalReason,
    });
  })
);

export default router;
