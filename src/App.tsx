import React, { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ViewModeProvider } from "@/contexts/ViewModeContext";
import { Loader2 } from "lucide-react";
import { PausedAccountScreen } from "@/components/PausedAccountScreen";

// Eager load critical pages
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Lazy load heavy dashboard pages with preload capability
const AgentPortal = lazy(() => import("./pages/AgentPortal"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AccountSettingsPage = lazy(() => import("./pages/AccountSettingsPage"));

// Preload functions for route prefetching
const preloadAgentPortal = () => import("./pages/AgentPortal");
const preloadAdminDashboard = () => import("./pages/AdminDashboard");

// Optimized QueryClient with aggressive caching
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 10, // 10 minutes - keep data fresh longer
      gcTime: 1000 * 60 * 30, // 30 minutes - keep in cache longer
      refetchOnWindowFocus: false,
      refetchOnMount: false, // Don't refetch if data exists
      retry: 1,
    },
  },
});

// Route prefetching component
function RoutePrefetcher() {
  const location = useLocation();

  useEffect(() => {
    const prefetchTimer = setTimeout(() => {
      if (location.pathname === "/" || location.pathname === "/auth") {
        preloadAgentPortal();
        preloadAdminDashboard();
      } else if (location.pathname.startsWith("/agent")) {
        preloadAdminDashboard();
      } else if (location.pathname.startsWith("/admin")) {
        preloadAgentPortal();
      }
    }, 1000);

    return () => clearTimeout(prefetchTimer);
  }, [location.pathname]);

  return null;
}

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
    </div>
  </div>
);

function GlobalPauseGate({ children }: { children: React.ReactNode }) {
  const { isGlobalPaused, globalPauseReason, isSuperAdmin } = useAuth();
  if (isGlobalPaused && !isSuperAdmin) {
    return <PausedAccountScreen reason={globalPauseReason} />;
  }
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <ViewModeProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <RoutePrefetcher />
            <GlobalPauseGate>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/agent/*" element={<AgentPortal />} />
                  <Route path="/account-settings" element={<AccountSettingsPage />} />
                  <Route path="/admin/*" element={<AdminDashboard />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </GlobalPauseGate>
          </BrowserRouter>
        </ViewModeProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
