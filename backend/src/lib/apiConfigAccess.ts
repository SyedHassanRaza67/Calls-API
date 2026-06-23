import { query } from "../db";
import { isSuperAdmin, isAdmin, getManagingAdmin } from "./authz";

/**
 * Reproduces the RLS visibility the edge functions relied on when looking up an
 * api_configuration with the user-scoped Supabase client. Returns the full row
 * (including api_key) when the user is permitted to use the campaign, else null.
 *
 * Visibility (from migrations):
 *  - super_admin: any config
 *  - admin: configs where assigned_to = me
 *  - agent: active configs where assigned_to = my managing admin AND
 *           (assigned_agents empty OR I am in assigned_agents)
 */
export async function getAccessibleApiConfig(
  userId: string,
  configId: string
): Promise<Record<string, unknown> | null> {
  const { rows } = await query<Record<string, unknown>>(
    "SELECT * FROM api_configurations WHERE id = $1",
    [configId]
  );
  const cfg = rows[0];
  if (!cfg) return null;

  if (await isSuperAdmin(userId)) return cfg;

  if (await isAdmin(userId)) {
    return cfg.assigned_to === userId ? cfg : null;
  }

  // agent
  const managingAdmin = await getManagingAdmin(userId);
  if (!managingAdmin) return null;
  if (cfg.is_active !== true) return null;
  if (cfg.assigned_to !== managingAdmin) return null;
  const assigned = (cfg.assigned_agents as string[] | null) || [];
  if (assigned.length === 0 || assigned.includes(userId)) return cfg;
  return null;
}
