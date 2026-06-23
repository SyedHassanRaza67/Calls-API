import { memo, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Activity, TrendingUp, CheckCircle } from "lucide-react";
import { useDashboardStats, useProfiles, useLeads, useApiConfigurations } from "@/hooks/useAdminData";

// Memoized stat card
const StatCard = memo(({ 
  title, 
  value, 
  change, 
  icon: Icon, 
  color, 
  isLoading 
}: { 
  title: string; 
  value: string; 
  change: string; 
  icon: any; 
  color: string; 
  isLoading: boolean;
}) => (
  <Card className="bg-card/50 border-border">
    <CardHeader className="flex flex-row items-center justify-between pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">
        {title}
      </CardTitle>
      <Icon className={`h-4 w-4 ${color}`} />
    </CardHeader>
    <CardContent>
      {isLoading ? (
        <>
          <Skeleton className="h-8 w-20 mb-1" />
          <Skeleton className="h-4 w-24" />
        </>
      ) : (
        <>
          <div className="text-2xl font-bold">{value}</div>
          <p className="text-xs text-muted-foreground">{change}</p>
        </>
      )}
    </CardContent>
  </Card>
));
StatCard.displayName = "StatCard";

// Memoized campaign item
const CampaignItem = memo(({ 
  service, 
  successCount, 
  totalCount 
}: { 
  service: string; 
  successCount: number; 
  totalCount: number;
}) => {
  const successRate = totalCount > 0 ? (successCount / totalCount) * 100 : 0;
  const isHealthy = successRate >= 50;
  
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <div className={`h-2 w-2 rounded-full ${isHealthy ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        <span className="text-sm">{service}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className={`text-xs ${isHealthy ? 'text-emerald-500' : 'text-amber-500'}`}>
          {successRate.toFixed(0)}% success
        </span>
        <span className="text-xs text-muted-foreground">
          {successCount}/{totalCount} leads
        </span>
      </div>
    </div>
  );
});
CampaignItem.displayName = "CampaignItem";

// Memoized agent item
const AgentItem = memo(({ 
  agent, 
  formatTimeAgo 
}: { 
  agent: { full_name: string | null; email: string | null; created_at: string }; 
  formatTimeAgo: (date: string) => string;
}) => (
  <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
    <div>
      <p className="text-sm font-medium">{agent.full_name || "Unknown"}</p>
      <p className="text-xs text-muted-foreground">{agent.email || "No email"}</p>
    </div>
    <span className="text-xs text-muted-foreground">
      {formatTimeAgo(agent.created_at)}
    </span>
  </div>
));
AgentItem.displayName = "AgentItem";

export function AdminDashboard() {
  const { data: profiles, isLoading: profilesLoading } = useProfiles();
  const { data: leads, isLoading: leadsLoading } = useLeads();
  const { data: apiConfigs } = useApiConfigurations();

  const isLoading = profilesLoading || leadsLoading;

  // Memoized stats calculation
  const stats = useMemo(() => {
    const totalAgents = profiles?.length || 0;
    const totalLeads = leads?.length || 0;
    const today = new Date().toISOString().split('T')[0];
    const leadsToday = leads?.filter(l => l.created_at.startsWith(today)).length || 0;
    const successfulLeads = leads?.filter(l => l.status === "success").length || 0;
    const successRate = totalLeads > 0 ? (successfulLeads / totalLeads) * 100 : 0;

    return { totalAgents, totalLeads, leadsToday, successRate };
  }, [profiles, leads]);

  const recentAgents = useMemo(() => 
    profiles?.slice(0, 5) || [], 
    [profiles]
  );

  const serviceHealth = useMemo(() => {
    const campaignMap = new Map<string, { success: number; total: number }>();
    leads?.forEach((lead) => {
      const configId = lead.api_configuration_id || "unknown";
      const current = campaignMap.get(configId) || { success: 0, total: 0 };
      current.total++;
      if (lead.status === "success") current.success++;
      campaignMap.set(configId, current);
    });

    const campaignNames = new Map(apiConfigs?.map(c => [c.id, c.name]) || []);
    
    return Array.from(campaignMap.entries())
      .map(([id, data]) => ({
        service: campaignNames.get(id) || "Unknown Campaign",
        successCount: data.success,
        totalCount: data.total,
      }))
      .slice(0, 5);
  }, [leads, apiConfigs]);

  const formatTimeAgo = useCallback((dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays === 1) return "1 day ago";
    return `${diffDays} days ago`;
  }, []);

  const statCards = useMemo(() => [
    { 
      title: "Total Agents", 
      value: stats.totalAgents.toLocaleString(), 
      change: "Registered users", 
      icon: Users,
      color: "text-primary" 
    },
    { 
      title: "Leads Today", 
      value: stats.leadsToday.toLocaleString(), 
      change: "Submissions today", 
      icon: Activity,
      color: "text-primary" 
    },
    { 
      title: "Success Rate", 
      value: `${stats.successRate.toFixed(1)}%`, 
      change: `${stats.totalLeads} total leads`, 
      icon: CheckCircle,
      color: "text-emerald-500" 
    },
    { 
      title: "Total Leads", 
      value: stats.totalLeads.toLocaleString(), 
      change: "All time", 
      icon: TrendingUp,
      color: "text-primary" 
    },
  ], [stats]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Platform overview and management tools.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <StatCard
            key={stat.title}
            title={stat.title}
            value={stat.value}
            change={stat.change}
            icon={stat.icon}
            color={stat.color}
            isLoading={isLoading}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card/50 border-border">
          <CardHeader>
            <CardTitle>Campaign Performance</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : serviceHealth.length === 0 ? (
              <p className="text-sm text-muted-foreground">No campaign data available yet.</p>
            ) : (
              <div className="space-y-4">
                {serviceHealth.map((item) => (
                  <CampaignItem
                    key={item.service}
                    service={item.service}
                    successCount={item.successCount}
                    totalCount={item.totalCount}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border">
          <CardHeader>
            <CardTitle>Recent Agent Signups</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : recentAgents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No agents registered yet.</p>
            ) : (
              <div className="space-y-4">
                {recentAgents.map((agent, i) => (
                  <AgentItem
                    key={agent.user_id || i}
                    agent={agent}
                    formatTimeAgo={formatTimeAgo}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
