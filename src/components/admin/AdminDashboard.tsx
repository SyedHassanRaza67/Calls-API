import { memo, useMemo, useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, Activity, TrendingUp, CheckCircle, CalendarRange } from "lucide-react";
import { useDashboardStats, useProfiles, useLeads, useApiConfigurations } from "@/hooks/useAdminData";

/* -------------------------------------------------------------------------- */
/*  Date helpers — all calendar math is done in US Eastern (America/New_York)  */
/* -------------------------------------------------------------------------- */

const ET_TIME_ZONE = "America/New_York";

// en-CA formats dates as YYYY-MM-DD, which is exactly the calendar-date string
// we want for bucketing/comparison. Reused across calls to avoid re-allocating.
const ET_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: ET_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Returns the calendar date (YYYY-MM-DD) for the given Date as seen in ET.
function etDateString(date: Date): string {
  return ET_DATE_FORMAT.format(date);
}

// Pure calendar arithmetic on a YYYY-MM-DD string (timezone-independent).
// Anchors at UTC midnight so adding/subtracting days never crosses a DST seam.
function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

type RangeKey = "today" | "yesterday" | "last7" | "last30" | "month" | "all";

const RANGE_OPTIONS: { key: RangeKey; label: string; subtitle: string }[] = [
  { key: "today", label: "Today", subtitle: "Submissions today" },
  { key: "yesterday", label: "Yesterday", subtitle: "Submissions yesterday" },
  { key: "last7", label: "Last 7 Days", subtitle: "Submissions in last 7 days" },
  { key: "last30", label: "Last 30 Days", subtitle: "Submissions in last 30 days" },
  { key: "month", label: "This Month", subtitle: "Submissions this month" },
  { key: "all", label: "All Time", subtitle: "Submissions all time" },
];

// Inclusive ET calendar-date bounds for the selected range. `start === null`
// (used by "All Time") means no lower/upper bound.
function getEtRangeBounds(key: RangeKey): { start: string | null; end: string | null } {
  const today = etDateString(new Date());
  switch (key) {
    case "today":
      return { start: today, end: today };
    case "yesterday": {
      const y = addDaysToDateString(today, -1);
      return { start: y, end: y };
    }
    case "last7":
      return { start: addDaysToDateString(today, -6), end: today };
    case "last30":
      return { start: addDaysToDateString(today, -29), end: today };
    case "month":
      return { start: `${today.slice(0, 8)}01`, end: today };
    case "all":
    default:
      return { start: null, end: null };
  }
}

// True when a lead's created_at (ISO/UTC) falls within the inclusive ET bounds.
function isWithinEtRange(createdAt: string, start: string | null, end: string | null): boolean {
  if (!start || !end) return true;
  const d = etDateString(new Date(createdAt));
  return d >= start && d <= end;
}

/* -------------------------------------------------------------------------- */
/*  Role helpers — decide which profiles are agent accounts                     */
/* -------------------------------------------------------------------------- */

// Normalize a roles value into a string[]. Accepts a real array (["admin"]) OR a
// Postgres array literal string ("{admin,agent}").
function toRolesArray(roles: unknown): string[] {
  if (Array.isArray(roles)) return roles.map(String);
  if (typeof roles === "string") {
    return roles
      .replace(/^\{|\}$/g, "")
      .split(",")
      .map((s) => s.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
  }
  return [];
}

// An "agent" is any account that is not an admin / super_admin.
function isAgentProfile(roles: unknown): boolean {
  const arr = toRolesArray(roles);
  if (arr.length === 0) return false;
  return !arr.includes("admin") && !arr.includes("super_admin");
}

/* -------------------------------------------------------------------------- */
/*  UI building blocks                                                          */
/* -------------------------------------------------------------------------- */

// Memoized stat card
const StatCard = memo(({
  title,
  value,
  change,
  icon: Icon,
  iconClass,
  accentClass,
  isLoading,
}: {
  title: string;
  value: string;
  change: string;
  icon: any;
  iconClass: string;
  accentClass: string;
  isLoading: boolean;
}) => (
  <Card className="bg-card/50 border-border transition-colors hover:border-border/80">
    <CardContent className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {isLoading ? (
            <>
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-4 w-24" />
            </>
          ) : (
            <>
              <div className="text-2xl font-bold tracking-tight">{value}</div>
              <p className="text-xs text-muted-foreground">{change}</p>
            </>
          )}
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accentClass}`}>
          <Icon className={`h-5 w-5 ${iconClass}`} />
        </div>
      </div>
    </CardContent>
  </Card>
));
StatCard.displayName = "StatCard";

// Memoized campaign item
const CampaignItem = memo(({
  service,
  successCount,
  totalCount,
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
  formatTimeAgo,
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

  const [rangeKey, setRangeKey] = useState<RangeKey>("today");
  const rangeOption = useMemo(
    () => RANGE_OPTIONS.find((o) => o.key === rangeKey) ?? RANGE_OPTIONS[0],
    [rangeKey]
  );

  const isLoading = profilesLoading || leadsLoading;

  // All-time metrics (unaffected by the date filter).
  const allTimeStats = useMemo(() => {
    const totalAgents = profiles?.length || 0;
    const totalLeads = leads?.length || 0;
    return { totalAgents, totalLeads };
  }, [profiles, leads]);

  // Range-driven metrics (ET timezone).
  const rangeStats = useMemo(() => {
    const { start, end } = getEtRangeBounds(rangeKey);
    const inRange = leads?.filter((l) => isWithinEtRange(l.created_at, start, end)) || [];
    const total = inRange.length;
    const success = inRange.filter((l) => l.status === "success").length;
    const successRate = total > 0 ? (success / total) * 100 : 0;
    return { total, success, successRate };
  }, [leads, rangeKey]);

  // Recently added agents: agent accounts only, most-recent first. Falls back to
  // all profiles (most-recent first) if no role data distinguishes agents.
  const recentAgents = useMemo(() => {
    const all = profiles || [];
    const agents = all.filter((p) => isAgentProfile(p.roles));
    const source = agents.length > 0 ? agents : all;
    return [...source]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
  }, [profiles]);

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
      value: allTimeStats.totalAgents.toLocaleString(),
      change: "Registered users",
      icon: Users,
      iconClass: "text-sky-500",
      accentClass: "bg-sky-500/10",
    },
    {
      title: "Leads",
      value: rangeStats.total.toLocaleString(),
      change: rangeOption.subtitle,
      icon: Activity,
      iconClass: "text-violet-500",
      accentClass: "bg-violet-500/10",
    },
    {
      title: "Success Rate",
      value: `${rangeStats.successRate.toFixed(1)}%`,
      change: `${rangeStats.success.toLocaleString()}/${rangeStats.total.toLocaleString()} successful (${rangeOption.label.toLowerCase()})`,
      icon: CheckCircle,
      iconClass: "text-emerald-500",
      accentClass: "bg-emerald-500/10",
    },
    {
      title: "Total Leads",
      value: allTimeStats.totalLeads.toLocaleString(),
      change: "All time",
      icon: TrendingUp,
      iconClass: "text-amber-500",
      accentClass: "bg-amber-500/10",
    },
  ], [allTimeStats, rangeStats, rangeOption]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">
            Platform overview and management tools.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          <Select value={rangeKey} onValueChange={(v) => setRangeKey(v as RangeKey)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Select range" />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.key} value={opt.key}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <StatCard
            key={stat.title}
            title={stat.title}
            value={stat.value}
            change={stat.change}
            icon={stat.icon}
            iconClass={stat.iconClass}
            accentClass={stat.accentClass}
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
            <CardTitle>Recently Added Agents</CardTitle>
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
