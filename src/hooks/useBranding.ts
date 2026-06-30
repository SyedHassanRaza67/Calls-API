import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export interface Branding {
  company_name: string | null;
  company_logo: string | null;
}

export function useBranding() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["branding"],
    queryFn: async (): Promise<Branding | undefined> => {
      try {
        return await api.get<Branding>("/api/profiles/branding");
      } catch {
        // On error, resolve to undefined instead of throwing to the UI.
        return undefined;
      }
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });
}
