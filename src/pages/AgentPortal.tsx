import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/layout/Layout";
import { AgentWorkspace } from "@/components/agent/AgentWorkspace";
import { PausedAccountScreen } from "@/components/PausedAccountScreen";
import { Loader2 } from "lucide-react";

export default function AgentPortal() {
  const { user, isLoading, isPaused, pausedReason, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const hadUserRef = useRef(false);

  useEffect(() => {
    if (user) {
      hadUserRef.current = true;
    }
  }, [user]);

  useEffect(() => {
    if (isLoading || user) return;

    // Auth is hydrated synchronously from the stored token; once loading is done
    // with no user (initial mount or after logout), route to sign-in.
    navigate("/auth", { replace: true });
  }, [user, isLoading, navigate]);

  if (isLoading) {
    return (
      <Layout showFooter={false}>
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout showFooter={false}>
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Reconnecting...
          </div>
        </div>
      </Layout>
    );
  }

  if (isPaused && !isSuperAdmin) {
    return <PausedAccountScreen reason={pausedReason} />;
  }

  return (
    <Layout showFooter={false}>
      <div className="min-h-[calc(100vh-4rem)] p-6">
        <AgentWorkspace />
      </div>
    </Layout>
  );
}
