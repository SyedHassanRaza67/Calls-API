import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { AppRole, Profile } from "@/lib/types";

// Minimal local stand-ins for the previous external auth User/Session shapes.
export interface AuthUser {
  id: string;
  email: string;
}
export interface AuthSession {
  token: string;
}

interface AuthContextType {
  user: AuthUser | null;
  session: AuthSession | null;
  profile: Profile | null;
  roles: AppRole[];
  isLoading: boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  isPaused: boolean;
  pausedReason: string | null;
  isGlobalPaused: boolean;
  globalPauseReason: string | null;
  signUp: (email: string, password: string, fullName?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [pausedReason, setPausedReason] = useState<string | null>(null);
  const [isGlobalPaused, setIsGlobalPaused] = useState(false);
  const [globalPauseReason, setGlobalPauseReason] = useState<string | null>(null);

  const clearAuthState = useCallback(() => {
    setSession(null);
    setUser(null);
    setProfile(null);
    setRoles([]);
    setIsPaused(false);
    setPausedReason(null);
  }, []);

  // Hydrate user/profile/roles/pause from GET /api/auth/me using the stored token.
  const hydrate = useCallback(async () => {
    const token = api.getToken();
    if (!token) {
      clearAuthState();
      return;
    }
    try {
      const me = await api.auth.me();
      if (me?.user) {
        setSession({ token });
        setUser({ id: me.user.id, email: me.user.email });
        setProfile((me.profile as unknown as Profile | null) ?? null);
        setRoles((me.roles || []) as AppRole[]);
        setIsPaused(!!me.isPaused);
        setPausedReason(me.pausedReason ?? null);
      } else {
        clearAuthState();
      }
    } catch (err) {
      // 401 already cleared the token inside the client; treat as signed out.
      console.warn("Failed to hydrate session:", err);
      clearAuthState();
    }
  }, [clearAuthState]);

  const refreshProfile = useCallback(async () => {
    await hydrate();
  }, [hydrate]);

  const fetchGlobalPause = useCallback(async () => {
    try {
      const data = await api.get<{ setting_key: string; setting_value: { enabled?: boolean; reason?: string | null } | null }>(
        "/api/system-settings/global_pause",
        { skipAuth: true }
      );
      const v = data?.setting_value || {};
      setIsGlobalPaused(!!v.enabled);
      setGlobalPauseReason(v.reason ?? null);
    } catch {
      // ignore — fail open
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await hydrate();
      if (!cancelled) setIsLoading(false);
    })();

    // Global pause: check immediately + poll every 30s (works for anon and signed-in users)
    fetchGlobalPause();
    const gpInterval = window.setInterval(fetchGlobalPause, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(gpInterval);
    };
  }, [hydrate, fetchGlobalPause]);

  const signUp = async (email: string, password: string, fullName?: string) => {
    await api.auth.signUp(email, password, fullName);
    await hydrate();
  };

  const signIn = async (email: string, password: string) => {
    await api.auth.signIn(email, password);
    await hydrate();
  };

  const signOut = async () => {
    // Clear UI state immediately so the app reacts even if the network call hangs/fails.
    clearAuthState();
    setIsLoading(false);
    // Drop all cached query data so the next account doesn't see the previous user's rows.
    queryClient.clear();
    await api.auth.signOut();
  };

  const isSuperAdmin = roles.includes("super_admin");
  const isAdmin = roles.includes("admin") || isSuperAdmin;
  const isAgent = roles.includes("agent");

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles,
        isLoading,
        isSuperAdmin,
        isAdmin,
        isAgent,
        isPaused,
        pausedReason,
        isGlobalPaused,
        globalPauseReason,
        signUp,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
