import { Request, Response, NextFunction } from "express";
import { signToken, verifyToken } from "../lib/jwt";
import { getRoles } from "../lib/authz";
import { query } from "../db";
import { HttpError } from "../types";

/**
 * Parses `Authorization: Bearer <JWT>`, verifies it, loads roles, and attaches
 * `req.user = { id, email, roles }`. Throws 401 on any failure.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw new HttpError(401, "Unauthorized");
    }
    const token = header.slice("Bearer ".length).trim();
    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw new HttpError(401, "Unauthorized");
    }

    // Ensure the user still exists; pull canonical email.
    const { rows } = await query<{ id: string; email: string }>(
      "SELECT id, email FROM app_users WHERE id = $1",
      [payload.sub]
    );
    if (rows.length === 0) {
      throw new HttpError(401, "Unauthorized");
    }

    const roles = await getRoles(payload.sub);
    req.user = { id: rows[0].id, email: rows[0].email, roles };

    // Sliding session: once a token is over a day old, hand back a fresh one
    // so a user who keeps working is never logged out mid-edit by the fixed
    // 7-day expiry. The client swaps it in from this header.
    if (payload.iat && Date.now() / 1000 - payload.iat > REFRESH_AFTER_SECONDS) {
      res.setHeader("X-Refreshed-Token", signToken({ sub: rows[0].id, email: rows[0].email }));
    }
    next();
  } catch (err) {
    next(err);
  }
}

const REFRESH_AFTER_SECONDS = 24 * 60 * 60;

/**
 * Optional auth — attaches req.user when a valid token is present, but does not
 * reject anonymous requests. Used for the public global_pause read.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return next();
  try {
    const token = header.slice("Bearer ".length).trim();
    const payload = verifyToken(token);
    const { rows } = await query<{ id: string; email: string }>(
      "SELECT id, email FROM app_users WHERE id = $1",
      [payload.sub]
    );
    if (rows.length > 0) {
      const roles = await getRoles(payload.sub);
      req.user = { id: rows[0].id, email: rows[0].email, roles };
    }
  } catch {
    /* ignore — treat as anonymous */
  }
  next();
}
