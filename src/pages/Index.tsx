import { Layout } from "@/components/layout/Layout";
import { ApiTesterSection } from "@/components/home/ApiTesterSection";
import { PausedAccountScreen } from "@/components/PausedAccountScreen";
import { useAuth } from "@/contexts/AuthContext";

const Index = () => {
  const { user, isPaused, pausedReason, isSuperAdmin } = useAuth();
  if (user && isPaused && !isSuperAdmin) {
    return <PausedAccountScreen reason={pausedReason} />;
  }
  return (
    <Layout showFooter={false}>
      <ApiTesterSection />
    </Layout>
  );
};

export default Index;
