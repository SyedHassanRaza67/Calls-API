import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export interface PersistedSubmission {
  id: string;
  callerNumber: string;
  callerState: string;
  callerZip: string;
  timestamp: Date;
  campaignResults: Record<string, {
    status: "idle" | "loading" | "success" | "failed";
    did?: string;
    raw?: Record<string, unknown>;
    error?: string;
  }>;
}

function dayKey(iso: string): string {
  return new Date(iso).toISOString().split("T")[0];
}

function groupLeads(data: any[]): PersistedSubmission[] {
  // data is ordered by created_at DESC. Group by phone+state+zip+day.
  const map = new Map<string, PersistedSubmission>();

  // process oldest-first so timestamp/id come from the placeholder
  const ordered = [...data].reverse();

  for (const lead of ordered) {
    const key = `${lead.user_id}|${lead.caller_number}|${lead.caller_state}|${lead.caller_zip}|${dayKey(lead.created_at)}`;
    let group = map.get(key);
    if (!group) {
      group = {
        id: lead.id,
        callerNumber: lead.caller_number,
        callerState: lead.caller_state,
        callerZip: lead.caller_zip,
        timestamp: new Date(lead.created_at),
        campaignResults: {},
      };
      map.set(key, group);
    }

    if (lead.api_configuration_id) {
      group.campaignResults[lead.api_configuration_id] = {
        status: (lead.status === "success" && lead.returned_did) ? "success" : lead.status === "pending" ? "idle" : "failed",
        did: lead.returned_did || undefined,
        raw: (lead.api_response as Record<string, unknown>) || undefined,
        error: lead.status === "failed"
          ? ((lead.api_response as any)?.error || "API call failed")
          : undefined,
      };
    }
  }

  // newest first
  return Array.from(map.values()).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

export function useAgentSubmissions() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ["agent-submissions", user?.id, isAdmin],
    queryFn: async () => {
      // Server scopes leads: agents get their own; admins/super-admins get managed agents + own.
      try {
        const data = await api.get<any[]>("/api/leads?days=30&limit=2000");
        return groupLeads(data || []);
      } catch (error) {
        console.error("Failed to fetch leads:", error);
        return [];
      }
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const setSubmissions = (updater: (prev: PersistedSubmission[]) => PersistedSubmission[]) => {
    queryClient.setQueryData(["agent-submissions", user?.id, isAdmin], (old: PersistedSubmission[] | undefined) =>
      updater(old || [])
    );
  };

  return { submissions, setSubmissions, isLoading };
}
