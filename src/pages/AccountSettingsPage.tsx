import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/layout/Layout";
import { AccountSettings } from "@/components/agent/AccountSettings";
import { Loader2 } from "lucide-react";

export default function AccountSettingsPage() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading || user) return;
    navigate("/auth", { replace: true });
  }, [user, isLoading, navigate]);

  if (isLoading || !user) {
    return (
      <Layout showFooter={false}>
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout showFooter={false}>
      <div className="min-h-[calc(100vh-4rem)] p-6">
        <AccountSettings />
      </div>
    </Layout>
  );
}
