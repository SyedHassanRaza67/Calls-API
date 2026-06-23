import { useMemo, memo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLeads, useApiConfigurations } from "@/hooks/useAdminData";

type RangeKey = "12h" | "today" | "7d" | "30d";

interface Bucket {
  label: string;
  key: string;
  total: number;
  success: number;
  failed: number;
}

interface CampaignStats {
  id: string;
  name: string;
  total: number;
  success: number;
  percentage: number;
  trend: number[];
}

const ChartBar = memo(({ b, maxValue }: { b: Bucket; maxValue: number }) => (
  <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
    <div className="w-full flex flex-col gap-0.5" style={{ height: `${Math.max((b.total / maxValue) * 100, 5)}%` }}>
      {b.failed > 0 && (
        <div className="w-full bg-destructive rounded-t" style={{ height: `${(b.failed / b.total) * 100}%` }} title={`Failed: ${b.failed}`} />
      )}
      {b.success > 0 && (
        <div className="w-full bg-emerald-500 rounded-b" style={{ height: `${(b.success / b.total) * 100}%` }} title={`Success: ${b.success}`} />
      )}
      {b.total === 0 && <div className="w-full bg-muted rounded h-full" />}
    </div>
    <div className="text-center">
      <span className="text-[10px] text-muted-foreground block truncate w-full">{b.label}</span>
      <span className="text-[10px] font-medium">{b.total}</span>
    </div>
  </div>
));
ChartBar.displayName = "ChartBar";

const Sparkline = memo(({ values }: { values: number[] }) => {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-0.5 h-6">
      {values.map((v, i) => (
        <div key={i} className="w-1 bg-primary/60 rounded-sm" style={{ height: `${Math.max((v / max) * 100, 8)}%` }} />
      ))}
    </div>
  );
});
Sparkline.displayName = "Sparkline";

export function Analytics() {
  const [range, setRange] = useState<RangeKey>("12h");
  const daysBack = range === "12h" ? 1 : range === "today" ? 1 : range === "7d" ? 7 : 30;
  const { data: leads, isLoading } = useLeads(daysBack, 5000);
  const { data: apiConfigs } = useApiConfigurations();

  // For 12h, scope leads to last 12 hours
  const scopedLeads = useMemo(() => {
    if (range !== "12h") return leads;
    const cutoff = Date.now() - 12 * 3600_000;
    return (leads || []).filter(l => new Date(l.created_at).getTime() >= cutoff);
  }, [leads, range]);

  // Group leads (one submission per phone+state+zip+day per agent), match Leads page.
  // Success requires returned_did so analytics align with Leads page.
  const groupedLeads = useMemo(() => {
    const map = new Map<string, {
      timestamp: string;
      status: "success" | "failed" | "pending";
      user_id: string;
      api_configuration_id: string | null;
    }>();
    const ordered = [...(scopedLeads || [])].reverse();
    for (const lead of ordered) {
      const day = new Date(lead.created_at).toISOString().split("T")[0];
      const key = `${lead.user_id}|${lead.caller_number}|${lead.caller_state}|${lead.caller_zip}|${day}`;
      let g = map.get(key);
      if (!g) {
        g = { timestamp: lead.created_at, status: "pending", user_id: lead.user_id, api_configuration_id: null };
        map.set(key, g);
      }
      if (lead.api_configuration_id) {
        if (lead.status === "success" && lead.returned_did) {
          g.status = "success";
          g.api_configuration_id = lead.api_configuration_id;
        } else if (g.status !== "success") {
          g.status = "failed";
          g.api_configuration_id = lead.api_configuration_id;
        }
      }
    }
    return Array.from(map.values());
  }, [scopedLeads]);

  const { buckets, maxValue, metrics, campaignStats } = useMemo(() => {
    const now = new Date();
    const buckets: Bucket[] = [];
    const bucketMap = new Map<string, Bucket>();

    if (range === "12h") {
      // 12 hourly buckets ending at current hour
      const startHour = new Date(now); startHour.setMinutes(0, 0, 0);
      for (let i = 11; i >= 0; i--) {
        const d = new Date(startHour.getTime() - i * 3600_000);
        const key = `${d.toISOString().split("T")[0]}T${String(d.getHours()).padStart(2, "0")}`;
        const label = `${String(d.getHours()).padStart(2, "0")}:00`;
        const b: Bucket = { label, key, total: 0, success: 0, failed: 0 };
        buckets.push(b); bucketMap.set(key, b);
      }
    } else if (range === "today") {
      const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
      for (let h = 0; h < 24; h++) {
        const d = new Date(startOfDay.getTime() + h * 3600_000);
        const key = `${d.toISOString().split("T")[0]}T${String(h).padStart(2, "0")}`;
        const b: Bucket = { label: `${h}h`, key, total: 0, success: 0, failed: 0 };
        buckets.push(b); bucketMap.set(key, b);
      }
    } else {
      const days = range === "7d" ? 7 : 30;
      const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400_000);
        const key = d.toISOString().split("T")[0];
        const label = days <= 7 ? dayNames[d.getDay()] : `${d.getMonth() + 1}/${d.getDate()}`;
        const b: Bucket = { label, key, total: 0, success: 0, failed: 0 };
        buckets.push(b); bucketMap.set(key, b);
      }
    }

    const campaignMap = new Map<string, { total: number; success: number; trend: number[] }>();
    const campaignNames = new Map(apiConfigs?.map(c => [c.id, c.name]) || []);

    for (const g of groupedLeads) {
      const ts = new Date(g.timestamp);
      let key: string;
      if (range === "12h" || range === "today") {
        key = `${ts.toISOString().split("T")[0]}T${String(ts.getHours()).padStart(2, "0")}`;
      } else {
        key = ts.toISOString().split("T")[0];
      }
      const b = bucketMap.get(key);
      if (b) {
        b.total++;
        if (g.status === "success") b.success++;
        else if (g.status === "failed") b.failed++;
      }

      if (g.api_configuration_id) {
        const cur = campaignMap.get(g.api_configuration_id) || { total: 0, success: 0, trend: new Array(buckets.length).fill(0) };
        cur.total++;
        if (g.status === "success") cur.success++;
        const idx = buckets.findIndex(x => x.key === key);
        if (idx >= 0) cur.trend[idx]++;
        campaignMap.set(g.api_configuration_id, cur);
      }
    }

    const totalLeads = groupedLeads.length;
    const successfulLeads = groupedLeads.filter(g => g.status === "success").length;
    const uniqueAgents = new Set(groupedLeads.map(g => g.user_id)).size;

    const campaignStats: CampaignStats[] = Array.from(campaignMap.entries())
      .map(([id, d]) => ({
        id,
        name: campaignNames.get(id) || "Unknown",
        total: d.total,
        success: d.success,
        percentage: totalLeads > 0 ? (d.total / totalLeads) * 100 : 0,
        trend: d.trend,
      }))
      .sort((a, b) => b.total - a.total);

    return {
      buckets,
      maxValue: Math.max(...buckets.map(b => b.total), 1),
      metrics: {
        totalLeads,
        successfulLeads,
        activeAgents: uniqueAgents,
        successRate: totalLeads > 0 ? (successfulLeads / totalLeads) * 100 : 0,
      },
      campaignStats,
    };
  }, [groupedLeads, range, apiConfigs]);

  const rangeLabel = range === "12h" ? "Last 12 Hours" : range === "today" ? "Today" : range === "7d" ? "Last 7 Days" : "Last 30 Days";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Analytics & Reports</h1>
          <p className="text-muted-foreground">Platform usage and campaign performance ({rangeLabel.toLowerCase()}).</p>
        </div>
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          {(["12h","today","7d","30d"] as RangeKey[]).map(r => (
            <Button
              key={r}
              size="sm"
              variant={range === r ? "default" : "ghost"}
              className="h-7 px-3 text-xs"
              onClick={() => setRange(r)}
            >
              {r === "12h" ? "12 Hours" : r === "today" ? "Today" : r === "7d" ? "7 Days" : "30 Days"}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/50 border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Submissions ({rangeLabel})</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-10 w-24" /> : (
              <>
                <div className="text-3xl font-bold">{metrics.totalLeads.toLocaleString()}</div>
                <Badge variant="default" className="mt-2">{metrics.successRate.toFixed(1)}% success rate</Badge>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Successful DIDs</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-10 w-24" /> : (
              <>
                <div className="text-3xl font-bold text-emerald-500">{metrics.successfulLeads.toLocaleString()}</div>
                <Badge variant="secondary" className="mt-2">DIDs returned</Badge>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Active Agents</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-10 w-24" /> : (
              <>
                <div className="text-3xl font-bold">{metrics.activeAgents}</div>
                <Badge variant="default" className="mt-2">Submitted in {rangeLabel.toLowerCase()}</Badge>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/50 border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Submission Activity ({rangeLabel})</CardTitle>
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-emerald-500" /><span className="text-muted-foreground">Success</span></div>
              <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-destructive" /><span className="text-muted-foreground">Failed</span></div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-end gap-1 h-64">{Array.from({ length: buckets.length }).map((_, i) => <Skeleton key={i} className="flex-1 h-32" />)}</div>
          ) : (
            <div className="flex items-end gap-1 h-64">
              {buckets.map(b => <ChartBar key={b.key} b={b} maxValue={maxValue} />)}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card/50 border-border">
        <CardHeader><CardTitle>Campaign Performance Trend ({rangeLabel})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : campaignStats.length === 0 ? (
            <p className="text-sm text-muted-foreground">No campaign data in this range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium">Campaign</th>
                    <th className="text-right py-2 px-2 font-medium">Submissions</th>
                    <th className="text-right py-2 px-2 font-medium">Success</th>
                    <th className="text-right py-2 px-2 font-medium">Success %</th>
                    <th className="text-left py-2 px-2 font-medium w-32">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {campaignStats.slice(0, 15).map(c => {
                    const pct = c.total > 0 ? (c.success / c.total) * 100 : 0;
                    return (
                      <tr key={c.id} className="border-b border-border/50">
                        <td className="py-2 px-2 truncate max-w-[280px]">{c.name}</td>
                        <td className="py-2 px-2 text-right font-medium">{c.total}</td>
                        <td className="py-2 px-2 text-right text-emerald-600 font-medium">{c.success}</td>
                        <td className="py-2 px-2 text-right">{pct.toFixed(0)}%</td>
                        <td className="py-2 px-2"><Sparkline values={c.trend} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card/50 border-border">
        <CardHeader><CardTitle>Lead Status Breakdown</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">{[1,2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center"><span className="text-emerald-500 font-bold">✓</span></div>
                  <div><p className="text-sm font-medium">Successful</p><p className="text-xs text-muted-foreground">DID returned</p></div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-emerald-500">{metrics.successfulLeads}</p>
                  <p className="text-xs text-muted-foreground">{metrics.successRate.toFixed(1)}%</p>
                </div>
              </div>
              <div className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-destructive/20 flex items-center justify-center"><span className="text-destructive font-bold">✗</span></div>
                  <div><p className="text-sm font-medium">Failed / No Target</p><p className="text-xs text-muted-foreground">No buyer or pending</p></div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-destructive">{metrics.totalLeads - metrics.successfulLeads}</p>
                  <p className="text-xs text-muted-foreground">{(100 - metrics.successRate).toFixed(1)}%</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
