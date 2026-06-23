import { Request, Response, NextFunction } from "express";
import { AppRole, HttpError } from "../types";

/** Require the authenticated user to hold at least one of the given roles. */
export function requireRole(...allowed: AppRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new HttpError(401, "Unauthorized"));
    }
    const ok = req.user.roles.some((r) => allowed.includes(r));
    if (!ok) {
      return next(new HttpError(403, "Forbidden"));
    }
    next();
  };
}

/** admin OR super_admin */
export const requireAdmin = requireRole("admin", "super_admin");
/** super_admin only */
export const requireSuperAdmin = requireRole("super_admin");
