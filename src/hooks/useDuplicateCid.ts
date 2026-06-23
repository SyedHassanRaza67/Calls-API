import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useApiConfigurations } from "@/hooks/useAdminData";

export interface DuplicateCidMatch {
  campaignName: string;
  did: string;
  createdAt: string;
}

function cleanPhone(input: string): string {
  return (input || "").replace(/\D/g, "").slice(-10);
}

export function useDuplicateCid(rawCallerNumber: string) {
  const { user } = useAuth();
  const { data: apiConfigs } = useApiConfigurations();

  const cleaned = cleanPhone(rawCallerNumber);
  const [debounced, setDebounced] = useState(cleaned);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(cleaned), 300);
    return () => clearTimeout(t);
  }, [cleaned]);

  const enabled = !!user && debounced.length === 10;

  const { data, isLoading } = useQuery({
    queryKey: ["duplicate-cid", user?.id, debounced],
    queryFn: async () => {
      try {
        // Server scopes leads to the current user. Filter to this caller with a returned DID.
        const rows = await api.get<Array<{ caller_number: string; returned_did: string | null; api_configuration_id: string | null; created_at: string }>>(
          `/api/leads?caller_number=${encodeURIComponent(debounced)}&limit=50`
        );
        return (rows || [])
          .filter((r) => r.caller_number === debounced && r.returned_did)
          .slice(0, 20) as { returned_did: string; api_configuration_id: string | null; created_at: string }[];
      } catch (error) {
        console.error("useDuplicateCid error", error);
        return [] as { returned_did: string; api_configuration_id: string | null; created_at: string }[];
      }
    },
    enabled,
    staleTime: 60 * 1000,
  });

  const nameMap = new Map((apiConfigs || []).map((c) => [c.id, c.name]));
  const seen = new Set<string>();
  const matches: DuplicateCidMatch[] = [];
  for (const row of data || []) {
    const key = `${row.api_configuration_id || "unknown"}|${row.returned_did}`;
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({
      campaignName: nameMap.get(row.api_configuration_id || "") || "Unknown campaign",
      did: row.returned_did,
      createdAt: row.created_at,
    });
  }

  return { matches, isLoading: enabled && isLoading };
}
