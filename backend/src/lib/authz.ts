import { query } from "../db";
import { AppRole } from "../types";

/** Ports of the Postgres SECURITY DEFINER authz helpers (see supabase/migrations). */

export async function getRoles(userId: string): Promise<AppRole[]> {
  const { rows } = await query<{ role: AppRole }>(
    "SELECT role FROM user_roles WHERE user_id = $1",
    [userId]
  );
  return rows.map((r) => r.role);
}

export async function hasRole(userId: string, role: AppRole): Promise<boolean> {
  const { rows } = await query(
    "SELECT 1 FROM user_roles WHERE user_id = $1 AND role = $2 LIMIT 1",
    [userId, role]
  );
  return rows.length > 0;
}

export async function isSuperAdmin(userId: string): Promise<boolean> {
  return hasRole(userId, "super_admin");
}

/** is_admin includes super_admin (matches the SQL function). */
export async function isAdmin(userId: string): Promise<boolean> {
  const { rows } = await query(
    "SELECT 1 FROM user_roles WHERE user_id = $1 AND role IN ('super_admin','admin') LIMIT 1",
    [userId]
  );
  return rows.length > 0;
}

/** Does _manager_id manage _user_id (profiles.managed_by = manager)? */
export async function managesUser(managerId: string, userId: string): Promise<boolean> {
  const { rows } = await query(
    "SELECT 1 FROM profiles WHERE user_id = $1 AND managed_by = $2 LIMIT 1",
    [userId, managerId]
  );
  return rows.length > 0;
}

/** Returns the admin who manages the given agent (profiles.managed_by). */
export async function getManagingAdmin(userId: string): Promise<string | null> {
  const { rows } = await query<{ managed_by: string | null }>(
    "SELECT managed_by FROM profiles WHERE user_id = $1",
    [userId]
  );
  return rows[0]?.managed_by ?? null;
}

export async function isGlobalPaused(): Promise<boolean> {
  const { rows } = await query<{ enabled: boolean | null }>(
    "SELECT (setting_value->>'enabled')::boolean AS enabled FROM system_settings WHERE setting_key = 'global_pause' LIMIT 1"
  );
  return rows[0]?.enabled === true;
}

export async function globalPauseReason(): Promise<string | null> {
  const { rows } = await query<{ reason: string | null }>(
    "SELECT setting_value->>'reason' AS reason FROM system_settings WHERE setting_key = 'global_pause' LIMIT 1"
  );
  return rows[0]?.reason ?? null;
}

/**
 * Mirrors public.is_account_paused: true when global pause is on (and user is
 * not super_admin), OR the user is paused, OR the user's managing admin is paused.
 */
export async function isAccountPaused(userId: string): Promise<boolean> {
  if ((await isGlobalPaused()) && !(await isSuperAdmin(userId))) {
    return true;
  }
  const { rows } = await query<{ paused: boolean }>(
    `SELECT EXISTS (
        SELECT 1 FROM profiles p WHERE p.user_id = $1 AND p.is_paused = true
     ) OR EXISTS (
        SELECT 1 FROM profiles self
        JOIN profiles mgr ON mgr.user_id = self.managed_by
        WHERE self.user_id = $1 AND mgr.is_paused = true
     ) AS paused`,
    [userId]
  );
  return rows[0]?.paused === true;
}

/** Reason string for an account pause (own pause reason takes precedence). */
export async function accountPausedReason(userId: string): Promise<string | null> {
  if ((await isGlobalPaused()) && !(await isSuperAdmin(userId))) {
    return (await globalPauseReason()) || "The platform is temporarily paused.";
  }
  const { rows } = await query<{ paused_reason: string | null; mgr_reason: string | null; self_paused: boolean; mgr_paused: boolean }>(
    `SELECT self.paused_reason AS paused_reason,
            self.is_paused AS self_paused,
            mgr.paused_reason AS mgr_reason,
            COALESCE(mgr.is_paused, false) AS mgr_paused
       FROM profiles self
       LEFT JOIN profiles mgr ON mgr.user_id = self.managed_by
      WHERE self.user_id = $1`,
    [userId]
  );
  const row = rows[0];
  if (!row) return null;
  if (row.self_paused) return row.paused_reason;
  if (row.mgr_paused) return row.mgr_reason;
  return null;
}
