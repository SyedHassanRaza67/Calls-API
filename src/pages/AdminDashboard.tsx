import { useEffect } from "react";
import { useNavigate, Routes, Route, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useViewMode } from "@/contexts/ViewModeContext";
import { Layout } from "@/components/layout/Layout";
import { AdminDashboard as AdminDashboardComponent } from "@/components/admin/AdminDashboard";
import { UserManagement } from "@/components/admin/UserManagement";
import { Analytics } from "@/components/admin/Analytics";
import { SystemSettings } from "@/components/admin/SystemSettings";
import { LeadsManagement } from "@/components/admin/LeadsManagement";
import { ApiConfigurations } from "@/components/admin/ApiConfigurations";
import { Instructions } from "@/components/admin/Instructions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PausedAccountScreen } from "@/components/PausedAccountScreen";
import { LayoutDashboard, Users, BarChart3, Settings, Loader2, ShieldAlert, Phone, Key, BookOpen } from "lucide-react";

export default function AdminDashboardPage() {
  const { user, isAdmin, isSuperAdmin, isLoading, isPaused, pausedReason } = useAuth();
  const { viewMode } = useViewMode();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isLoading || user) return;

    // Auth is hydrated synchronously from the stored token; once loading is done
    // with no user, route to sign-in.
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

  // Access is gated on the server-verified admin role only.
  // viewMode is a UI preview toggle and must NEVER grant access.
  const hasAccess = isAdmin;

  if (isPaused && !isSuperAdmin) {
    return <PausedAccountScreen reason={pausedReason} />;
  }

  if (!hasAccess) {
    return (
      <Layout showFooter={false}>
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
          <Alert variant="destructive" className="max-w-md">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              You don't have permission to access the Admin Dashboard. 
              Please contact an administrator if you believe this is an error.
            </AlertDescription>
          </Alert>
        </div>
      </Layout>
    );
  }

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { path: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { path: "/admin/leads", label: "Leads", icon: Phone },
    { path: "/admin/users", label: isSuperAdmin ? "Users" : "Agents", icon: Users },
    { path: "/admin/apis", label: "APIs", icon: Key },
    { path: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    { path: "/admin/settings", label: "Settings", icon: Settings },
    { path: "/admin/instructions", label: "Help", icon: BookOpen },
  ];

  return (
    <Layout showFooter={false}>
      <div className="min-h-[calc(100vh-4rem)] flex">
        {/* Sidebar */}
        <aside className="w-64 border-r border-border bg-card/30 p-4 hidden md:block">
          {/* Role Indicator */}
          {isSuperAdmin && (
            <div className="mb-4 p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-center">
              <span className="text-xs text-purple-400">Super Admin</span>
            </div>
          )}
          {!isSuperAdmin && isAdmin && (
            <div className="mb-4 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-center">
              <span className="text-xs text-blue-400">Admin</span>
            </div>
          )}
          {viewMode === "admin" && !isAdmin && (
            <div className="mb-4 p-2 rounded-lg bg-warning/10 border border-warning/20 text-center">
              <span className="text-xs text-warning">Dev Mode: Admin View</span>
            </div>
          )}
          
          <div className="space-y-2">
            {navItems.map((item) => (
              <Button
                key={item.path}
                variant={isActive(item.path) ? "secondary" : "ghost"}
                className={`w-full justify-start ${isActive(item.path) ? "bg-primary/10 text-primary" : ""}`}
                asChild
              >
                <Link to={item.path}>
                  <item.icon className="h-4 w-4 mr-2" />
                  {item.label}
                </Link>
              </Button>
            ))}
          </div>
        </aside>

        {/* Mobile Navigation */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-card/95 backdrop-blur-lg p-2 z-50">
          <div className="flex justify-around">
            {navItems.map((item) => (
              <Button
                key={item.path}
                variant="ghost"
                size="sm"
                className={isActive(item.path) ? "text-primary" : "text-muted-foreground"}
                asChild
              >
                <Link to={item.path} className="flex flex-col items-center gap-1">
                  <item.icon className="h-5 w-5" />
                  <span className="text-xs">{item.label}</span>
                </Link>
              </Button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <main
          className="flex-1 p-6 pb-20 md:pb-6 overflow-auto"
          data-admin-scroll-container="true"
        >
          <Routes>
            <Route index element={<AdminDashboardComponent />} />
            <Route path="leads" element={<LeadsManagement />} />
            <Route path="users" element={<UserManagement />} />
            <Route path="apis" element={<ApiConfigurations />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="settings" element={<SystemSettings />} />
            <Route path="instructions" element={<Instructions />} />
          </Routes>
        </main>
      </div>
    </Layout>
  );
}
