import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const useIsAuthenticated = () => {
  const { user } = useAuth();
  return !!user;
};

const useCurrentUserId = () => {
  const { user } = useAuth();
  return user?.id ?? null;
};

export interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
  managed_by: string | null;
  is_paused?: boolean;
  paused_at?: string | null;
  paused_reason?: string | null;
  // /api/profiles returns the role(s) for each row; used as the source of truth.
  roles?: string[];
}

// Reduce a roles[] array to a single role by privilege (super_admin > admin > agent).
function pickRole(rolesArr?: string[] | null, fallback?: string): string {
  if (Array.isArray(rolesArr) && rolesArr.length) {
    if (rolesArr.includes("super_admin")) return "super_admin";
    if (rolesArr.includes("admin")) return "admin";
    return rolesArr[0] || "agent";
  }
  return fallback || "agent";
}

export interface UserRole {
  user_id: string;
  role: string;
}

export interface ApiConfiguration {
  id: string;
  name: string;
  api_type: string;
  api_key: string;
  publisher_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  assigned_to: string | null;
  api_mode: "rtb" | "ping-post" | "ping";
  ping_url: string | null;
  post_url: string | null;
  api_provider: "retreaver" | "trackdrive" | "ringba" | "custom";
  trackdrive_number_id: string | null;
  trackdrive_number: string | null;
  http_method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | null;
  custom_fields: { key: string; value: string }[] | null;
}

export interface Lead {
  id: string;
  caller_number: string;
  caller_state: string;
  caller_zip: string;
  returned_did: string | null;
  status: string;
  created_at: string;
  user_id: string;
  api_response: Record<string, unknown> | null;
  api_configuration_id: string | null;
  ping_response: Record<string, unknown> | null;
  external_lead_id: string | null;
  submission_stage: "ping" | "posted" | "complete";
}

// Fetch all profiles
export function useProfiles() {
  const enabled = useIsAuthenticated();
  const uid = useCurrentUserId();
  return useQuery({
    queryKey: ["profiles", uid],
    queryFn: async () => {
      const data = await api.get<Profile[]>("/api/profiles");
      return data as Profile[];
    },
    staleTime: 0,
    refetchOnMount: "always",
    enabled,
  });
}

// Fetch all user roles
export function useUserRoles() {
  const enabled = useIsAuthenticated();
  const uid = useCurrentUserId();
  return useQuery({
    queryKey: ["user_roles", uid],
    queryFn: async () => {
      // /api/users lists users+roles+profiles (scoped). The API returns `roles`
      // as an array; reduce to a single { user_id, role } using privilege order.
      const data = await api.get<Array<{ user_id: string; role?: string; roles?: string[] }>>("/api/users");
      return (data || []).map((u) => {
        const rs = Array.isArray(u.roles) ? u.roles : u.role ? [u.role] : [];
        const role = rs.includes("super_admin")
          ? "super_admin"
          : rs.includes("admin")
            ? "admin"
            : rs[0] || "agent";
        return { user_id: u.user_id, role };
      }) as UserRole[];
    },
    staleTime: 0,
    refetchOnMount: "always",
    enabled,
  });
}

// Fetch API configurations
export function useApiConfigurations() {
  const enabled = useIsAuthenticated();
  const uid = useCurrentUserId();
  return useQuery({
    queryKey: ["api_configurations", uid],
    queryFn: async () => {
      const data = await api.get<ApiConfiguration[]>("/api/api-configurations");
      return data as unknown as ApiConfiguration[];
    },
    staleTime: 1000 * 60 * 5,
    enabled,
  });
}

// Fetch active API configurations (for agent form)
export function useActiveApiConfigurations() {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const enabled = !!user;
  return useQuery({
    queryKey: ["api_configurations", "active", user?.id, isAdmin, isSuperAdmin],
    queryFn: async () => {
      // Server already scopes configs to ones this user may see (owner / assigned / managing admin).
      const all = await api.get<Array<{ id: string; name: string; api_mode: "rtb" | "ping-post" | "ping"; trackdrive_number: string | null; notes: string | null; custom_fields: any[] | null; buyer: string | null; assigned_agents: string[] | null; created_by: string | null; is_active?: boolean }>>(
        "/api/api-configurations"
      );
      const rows = (all ?? [])
        .filter((r) => r.is_active !== false)
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      const uid = user?.id;

      // Admins/super-admins see every config the server returned.
      if (isAdmin) return rows;

      // Agents: respect per-config assigned_agents allowlist (empty = all agents).
      return rows.filter((r) => {
        const list = Array.isArray(r.assigned_agents) ? r.assigned_agents : [];
        return list.length === 0 || (uid ? list.includes(uid) : false);
      });
    },
    staleTime: 1000 * 60 * 5,
    enabled,
  });
}


// Fetch leads with optional date filter and pagination
export function useLeads(daysBack: number = 30, limit: number = 2000) {
  const enabled = useIsAuthenticated();
  const uid = useCurrentUserId();
  return useQuery({
    queryKey: ["leads", uid, daysBack, limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (daysBack) params.set("days", String(daysBack));
      if (limit) params.set("limit", String(limit));
      const qs = params.toString();
      const data = await api.get<Lead[]>(`/api/leads${qs ? `?${qs}` : ""}`);
      return data as Lead[];
    },
    staleTime: 1000 * 60 * 2,
    enabled,
  });
}

// Combined hook for users with roles (optimized)
export function useUsersWithRoles() {
  const { isSuperAdmin, user: currentUser } = useAuth();
  const { data: profiles, isLoading: profilesLoading } = useProfiles();
  const { data: roles, isLoading: rolesLoading } = useUserRoles();

  const isLoading = profilesLoading || rolesLoading;

  const usersWithRoles = profiles?.map((profile) => {
    const userRole = roles?.find((r) => r.user_id === profile.user_id);
    const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
    const managerProfile = profile.managed_by ? profileMap.get(profile.managed_by) : null;
    
    return {
      ...profile,
      // Prefer the role embedded in the profile row; fall back to /api/users.
      role: pickRole(profile.roles, userRole?.role),
      manager_name: managerProfile?.full_name || managerProfile?.email || null,
    };
  }) || [];

  // Filter based on permissions
  const filteredUsers = isSuperAdmin 
    ? usersWithRoles
    : usersWithRoles.filter(u => 
        u.user_id === currentUser?.id || u.managed_by === currentUser?.id
      );

  return { users: filteredUsers, isLoading };
}

// Hook to invalidate caches
export function useInvalidateAdminData() {
  const queryClient = useQueryClient();
  
  return {
    invalidateProfiles: () => queryClient.invalidateQueries({ queryKey: ["profiles"] }),
    invalidateUserRoles: () => queryClient.invalidateQueries({ queryKey: ["user_roles"] }),
    invalidateApiConfigs: () => queryClient.invalidateQueries({ queryKey: ["api_configurations"] }),
    invalidateLeads: () => queryClient.invalidateQueries({ queryKey: ["leads"] }),
    invalidateAll: () => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      queryClient.invalidateQueries({ queryKey: ["user_roles"] });
      queryClient.invalidateQueries({ queryKey: ["api_configurations"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  };
}

// Dashboard stats hook
export function useDashboardStats() {
  const { data: profiles } = useProfiles();
  const { data: leads } = useLeads();
  const { data: apiConfigs } = useApiConfigurations();

  const stats = {
    totalAgents: profiles?.length || 0,
    totalLeads: leads?.length || 0,
    leadsToday: leads?.filter(l => {
      const today = new Date().toISOString().split('T')[0];
      return l.created_at.startsWith(today);
    }).length || 0,
    successRate: leads?.length 
      ? (leads.filter(l => l.status === "success").length / leads.length) * 100 
      : 0,
  };

  const recentAgents = profiles?.slice(0, 5) || [];

  const campaignMap = new Map<string, { success: number; total: number }>();
  leads?.forEach((lead) => {
    const configId = lead.api_configuration_id || "unknown";
    const current = campaignMap.get(configId) || { success: 0, total: 0 };
    current.total++;
    if (lead.status === "success") current.success++;
    campaignMap.set(configId, current);
  });

  const campaignNames = new Map(apiConfigs?.map(c => [c.id, c.name]) || []);
  
  const serviceHealth = Array.from(campaignMap.entries())
    .map(([id, data]) => ({
      service: campaignNames.get(id) || "Unknown Campaign",
      successCount: data.success,
      totalCount: data.total,
      avgResponseTime: "~2s",
    }))
    .slice(0, 5);

  return { stats, recentAgents, serviceHealth };
}
