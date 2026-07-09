import { useState, useMemo, memo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Phone, CheckCircle, XCircle, Users, Clock, Send } from "lucide-react";
import { format, isToday, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { LeadsFilters, LeadsFilterState } from "./LeadsFilters";
import { useLeads, useProfiles, useApiConfigurations } from "@/hooks/useAdminData";
import { ResponseViewDialog } from "./ResponseViewDialog";

// One call attempt against a single campaign, with the data that was passed to it.
interface CampaignDetail {
  leadId: string;
  configId: string;
  name: string;
  provider: string | null;
  mode: string | null;
  publisherId: string | null;
  callerNumber: string;
  callerState: string;
  callerZip: string;
  status: string;
  returnedDid: string | null;
  createdAt: string;
  pingResponse: Record<string, unknown> | null;
  apiResponse: Record<string, unknown> | null;
}

interface LeadWithAgent {
  id: string;
  caller_number: string;
  caller_state: string;
  caller_zip: string;
  returned_did: string | null;
  status: string;
  created_at: string;
  user_id: string;
  agent_name: string | null;
  agent_email: string | null;
  api_response: Record<string, unknown> | null;
  api_configuration_id: string | null;
  api_name: string | null;
  ping_response: Record<string, unknown> | null;
  external_lead_id: string | null;
  submission_stage: "ping" | "posted" | "complete" | "pending";
  campaign_count: number;
  campaigns: CampaignDetail[];
}

// Campaign column: shows the distinct campaigns this submission was called on.
// Clicking a campaign badge selects it, which drives the Status/DID/Ping/Post
// columns for that row. A popover (opened via the "N campaigns" label) shows
// the full data passed to each call (Pub ID, Caller ID, State, Zip, DID).
const CampaignCell = memo(({
  campaigns,
  formatPhoneNumber,
  selectedConfigId,
  onSelect,
}: {
  campaigns: CampaignDetail[];
  formatPhoneNumber: (phone: string) => string;
  selectedConfigId: string | null;
  onSelect: (configId: string) => void;
}) => {
  if (campaigns.length === 0) {
    return (
      <Badge variant="secondary" className="text-xs">
        Legacy/Direct
      </Badge>
    );
  }

  // Distinct campaigns (a submission may hit the same campaign more than once on retry).
  const distinct = Array.from(new Map(campaigns.map((c) => [c.configId, c])).values());
  const extraCalls = campaigns.length - distinct.length;

  return (
    <div className="flex flex-col items-start gap-1">
      <span className="flex flex-wrap items-center gap-1">
        {distinct.slice(0, 2).map((c) => (
          <button
            key={c.configId}
            type="button"
            onClick={() => onSelect(c.configId)}
            className={cn(
              "text-xs rounded-md border px-2 py-0.5 transition-colors",
              c.configId === selectedConfigId
                ? "bg-primary/25 border-primary text-primary font-semibold"
                : "bg-primary/10 border-primary/30 hover:bg-primary/20"
            )}
          >
            {c.name}
          </button>
        ))}
        {distinct.length > 2 && (
          <Badge variant="secondary" className="text-xs">+{distinct.length - 2}</Badge>
        )}
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <button className="text-[10px] text-muted-foreground hover:underline text-left">
            {distinct.length} campaign{distinct.length > 1 ? "s" : ""}
            {extraCalls > 0 ? ` • ${campaigns.length} calls` : ""}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 max-h-96 overflow-y-auto p-3">
          <p className="text-xs font-semibold mb-2">
            {campaigns.length} call{campaigns.length > 1 ? "s" : ""} across {distinct.length} campaign
            {distinct.length > 1 ? "s" : ""} — click a campaign to view its responses
          </p>
          <div className="space-y-2">
            {distinct.map((c) => (
              <button
                key={c.configId}
                type="button"
                onClick={() => onSelect(c.configId)}
                className={cn(
                  "w-full rounded-md border p-2 text-xs text-left transition-colors",
                  c.configId === selectedConfigId
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{c.name}</span>
                  {c.status === "success" ? (
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                  ) : c.status === "pending" ? (
                    <Clock className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                  )}
                </div>
                {(c.provider || c.mode) && (
                  <div className="text-[10px] text-muted-foreground">
                    {[c.provider, c.mode].filter(Boolean).join(" / ")}
                  </div>
                )}
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground">
                  <span>Pub ID: <span className="font-mono text-foreground">{c.publisherId || "—"}</span></span>
                  <span>Caller: <span className="font-mono text-foreground">{formatPhoneNumber(c.callerNumber)}</span></span>
                  <span>State: <span className="text-foreground">{c.callerState}</span></span>
                  <span>Zip: <span className="text-foreground">{c.callerZip}</span></span>
                  <span className="col-span-2">DID: <span className="font-mono text-foreground">{c.returnedDid || "—"}</span></span>
                </div>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
});
CampaignCell.displayName = "CampaignCell";

// Memoized table row. When a submission hit multiple campaigns, the user can
// click a campaign badge to switch which campaign's DID/Status/Ping/Post
// responses are shown; it defaults to the first (earliest-called) campaign.
// If that campaign itself was retried more than once, numbered buttons
// (1, 2, 3, ...) let the user pick which specific attempt to inspect,
// defaulting to attempt 1 (the earliest call).
const LeadTableRow = memo(({
  lead,
  formatPhoneNumber
}: {
  lead: LeadWithAgent;
  formatPhoneNumber: (phone: string) => string;
}) => {
  // Every call attempt, grouped by campaign, in call order (oldest first).
  const attemptsByConfig = useMemo(() => {
    const map = new Map<string, CampaignDetail[]>();
    for (const c of lead.campaigns) {
      const arr = map.get(c.configId);
      if (arr) arr.push(c);
      else map.set(c.configId, [c]);
    }
    return map;
  }, [lead.campaigns]);

  // One representative (first attempt) per distinct campaign, for the badge row.
  const distinctCampaigns = useMemo(
    () => Array.from(attemptsByConfig.values()).map((attempts) => attempts[0]),
    [attemptsByConfig]
  );

  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(
    distinctCampaigns[0]?.configId ?? null
  );
  const [selectedAttemptIndex, setSelectedAttemptIndex] = useState(0);

  const effectiveConfigId =
    selectedConfigId && attemptsByConfig.has(selectedConfigId) ? selectedConfigId : distinctCampaigns[0]?.configId ?? null;
  const selectedAttempts = effectiveConfigId ? attemptsByConfig.get(effectiveConfigId) ?? [] : [];
  const clampedAttemptIndex = Math.min(selectedAttemptIndex, Math.max(selectedAttempts.length - 1, 0));
  const selectedCampaign = selectedAttempts[clampedAttemptIndex] ?? null;

  const displayDid = selectedCampaign ? selectedCampaign.returnedDid : lead.returned_did;
  const displayPing = selectedCampaign ? selectedCampaign.pingResponse : lead.ping_response;
  const displayPost = selectedCampaign ? selectedCampaign.apiResponse : lead.api_response;

  const handleSelectCampaign = useCallback((configId: string) => {
    setSelectedConfigId(configId);
    setSelectedAttemptIndex(0);
  }, []);

  return (
    <TableRow className="border-border">
      <TableCell className="text-muted-foreground text-sm">
        {format(new Date(lead.created_at), "MMM d, yyyy h:mm a")}
      </TableCell>
      <TableCell>
        <div>
          <p className="font-medium">{lead.agent_name || "Unknown"}</p>
          {lead.agent_email && (
            <p className="text-xs text-muted-foreground">{lead.agent_email}</p>
          )}
        </div>
      </TableCell>
      <TableCell>
        <CampaignCell
          campaigns={lead.campaigns}
          formatPhoneNumber={formatPhoneNumber}
          selectedConfigId={selectedCampaign?.configId ?? null}
          onSelect={handleSelectCampaign}
        />
      </TableCell>
      <TableCell className="font-mono">
        {formatPhoneNumber(lead.caller_number)}
      </TableCell>
      <TableCell>{lead.caller_state}</TableCell>
      <TableCell>{lead.caller_zip}</TableCell>
      <TableCell>
        {displayDid ? (
          <a
            href={`tel:${displayDid}`}
            className="font-mono text-primary hover:underline"
          >
            {displayDid}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {selectedCampaign ? (
          selectedCampaign.status === "success" ? (
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
              <CheckCircle className="h-3 w-3 mr-1" />
              Success
            </Badge>
          ) : selectedCampaign.status === "pending" ? (
            <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30">
              <Clock className="h-3 w-3 mr-1" />
              Pending
            </Badge>
          ) : (
            <Badge variant="destructive" className="bg-destructive/20 text-destructive border-destructive/30">
              <XCircle className="h-3 w-3 mr-1" />
              Failed
            </Badge>
          )
        ) : lead.submission_stage === "pending" ? (
          <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        ) : lead.submission_stage === "ping" ? (
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
            <Clock className="h-3 w-3 mr-1" />
            Ping
          </Badge>
        ) : (
          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
            <Send className="h-3 w-3 mr-1" />
            Posted
          </Badge>
        )}
        {selectedAttempts.length > 1 ? (
          <span className="ml-2 inline-flex items-center gap-1 align-middle">
            {selectedAttempts.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedAttemptIndex(i)}
                title={`Call ${i + 1} of ${selectedAttempts.length}`}
                className={cn(
                  "h-4 w-4 rounded-full text-[9px] font-semibold flex items-center justify-center border transition-colors",
                  i === clampedAttemptIndex
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground border-border hover:bg-muted/70"
                )}
              >
                {i + 1}
              </button>
            ))}
          </span>
        ) : (
          lead.campaign_count > 0 && (
            <span className="ml-2 text-[10px] text-muted-foreground">{lead.campaign_count} call{lead.campaign_count > 1 ? "s" : ""}</span>
          )
        )}
      </TableCell>
      <TableCell>
        <ResponseViewDialog
          title={
            selectedCampaign
              ? `Ping Response — ${selectedCampaign.name}${selectedAttempts.length > 1 ? ` (call ${clampedAttemptIndex + 1} of ${selectedAttempts.length})` : ""}`
              : "Ping Response"
          }
          data={displayPing}
          variant="ping"
        />
      </TableCell>
      <TableCell>
        <ResponseViewDialog
          title={
            selectedCampaign
              ? `Post Response — ${selectedCampaign.name}${selectedAttempts.length > 1 ? ` (call ${clampedAttemptIndex + 1} of ${selectedAttempts.length})` : ""}`
              : "Post Response"
          }
          data={displayPost}
          variant="post"
        />
      </TableCell>
    </TableRow>
  );
});
LeadTableRow.displayName = "LeadTableRow";

// Loading skeleton
const TableSkeleton = () => (
  <div className="space-y-3">
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="flex items-center gap-4 p-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-6 w-16" />
      </div>
    ))}
  </div>
);

export function LeadsManagement() {
  const { data: leads, isLoading: leadsLoading } = useLeads();
  const { data: profiles } = useProfiles();
  const { data: apiConfigs } = useApiConfigurations();

  const [filters, setFilters] = useState<LeadsFilterState>({
    dateRange: undefined,
    status: "all",
    agentId: "all",
    state: "all",
    apiConfigId: "all",
  });

  // Memoized profile and config maps
  const profileMap = useMemo(() => 
    new Map(profiles?.map(p => [p.user_id, p]) || []),
    [profiles]
  );

  const apiConfigMap = useMemo(() =>
    new Map(apiConfigs?.map(c => [c.id, c]) || []),
    [apiConfigs]
  );

  // Group leads: one row per (user_id + phone + state + zip + day)
  const leadsWithAgents = useMemo<LeadWithAgent[]>(() => {
    const map = new Map<string, LeadWithAgent>();
    // Process oldest first so timestamp = earliest
    const ordered = [...(leads || [])].reverse();
    for (const lead of ordered) {
      const day = new Date(lead.created_at).toISOString().split("T")[0];
      const key = `${lead.user_id}|${lead.caller_number}|${lead.caller_state}|${lead.caller_zip}|${day}`;
      let g = map.get(key);
      if (!g) {
        g = {
          id: lead.id,
          caller_number: lead.caller_number,
          caller_state: lead.caller_state,
          caller_zip: lead.caller_zip,
          returned_did: null,
          status: "pending",
          created_at: lead.created_at,
          user_id: lead.user_id,
          agent_name: profileMap.get(lead.user_id)?.full_name || null,
          agent_email: profileMap.get(lead.user_id)?.email || null,
          api_response: null,
          api_configuration_id: null,
          api_name: null,
          ping_response: null,
          external_lead_id: lead.external_lead_id,
          submission_stage: "pending",
          campaign_count: 0,
          campaigns: [],
        };
        map.set(key, g);
      }
      // Track latest interaction for ordering
      if (new Date(lead.created_at) > new Date(g.created_at) && lead.api_configuration_id) {
        // keep earliest created_at as submission timestamp; do nothing
      }
      if (lead.api_configuration_id) {
        g.campaign_count += 1;
        const cfg = apiConfigMap.get(lead.api_configuration_id);
        g.campaigns.push({
          leadId: lead.id,
          configId: lead.api_configuration_id,
          name: cfg?.name || "Unknown Campaign",
          provider: cfg?.api_provider || null,
          mode: cfg?.api_mode || null,
          publisherId: cfg?.publisher_id || null,
          callerNumber: lead.caller_number,
          callerState: lead.caller_state,
          callerZip: lead.caller_zip,
          status: lead.status,
          returnedDid: lead.returned_did,
          createdAt: lead.created_at,
          pingResponse: lead.ping_response as Record<string, unknown> | null,
          apiResponse: lead.api_response as Record<string, unknown> | null,
        });
        if (lead.status === "success" && lead.returned_did && !g.returned_did) {
          g.returned_did = lead.returned_did;
        }
        if (lead.status === "success" && lead.returned_did) {
          g.status = "success";
          g.submission_stage = "complete";
          g.api_configuration_id = lead.api_configuration_id;
          g.api_name = cfg?.name || null;
          g.api_response = lead.api_response as Record<string, unknown> | null;
          g.ping_response = lead.ping_response as Record<string, unknown> | null;
        } else if (g.status !== "success") {
          g.status = "failed";
          g.submission_stage = "complete";
          g.api_configuration_id = lead.api_configuration_id;
          g.api_name = cfg?.name || null;
          g.api_response = lead.api_response as Record<string, unknown> | null;
          g.ping_response = lead.ping_response as Record<string, unknown> | null;
        }
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [leads, profileMap, apiConfigMap]);

  // Extract unique agents
  const agents = useMemo(() => 
    Array.from(profileMap.values()).map(p => ({
      user_id: p.user_id,
      full_name: p.full_name,
      email: p.email,
    })),
    [profileMap]
  );

  // Filter leads based on filter state
  const filteredLeads = useMemo(() => {
    return leadsWithAgents.filter(lead => {
      if (filters.dateRange?.from) {
        const leadDate = new Date(lead.created_at);
        const from = startOfDay(filters.dateRange.from);
        const to = filters.dateRange.to ? endOfDay(filters.dateRange.to) : endOfDay(filters.dateRange.from);
        if (!isWithinInterval(leadDate, { start: from, end: to })) {
          return false;
        }
      }
      if (filters.status !== "all" && lead.status !== filters.status) return false;
      if (filters.agentId !== "all" && lead.user_id !== filters.agentId) return false;
      if (filters.state !== "all" && lead.caller_state !== filters.state) return false;
      if (filters.apiConfigId !== "all" && lead.api_configuration_id !== filters.apiConfigId) return false;
      return true;
    });
  }, [leadsWithAgents, filters]);

  // Stats
  const { todayLeads, totalLeadsToday, successfulDidsToday } = useMemo(() => {
    const todayLeads = filteredLeads.filter(lead => isToday(new Date(lead.created_at)));
    return {
      todayLeads,
      totalLeadsToday: todayLeads.length,
      successfulDidsToday: todayLeads.filter(lead => lead.status === "success" && lead.returned_did).length,
    };
  }, [filteredLeads]);

  const formatPhoneNumber = useCallback((phone: string) => {
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  }, []);

  if (leadsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Leads Management</h1>
        <p className="text-muted-foreground">View and manage all lead submissions</p>
      </div>

      <LeadsFilters
        filters={filters}
        onFiltersChange={setFilters}
        agents={agents}
        apiConfigs={apiConfigs?.map(c => ({ id: c.id, name: c.name })) || []}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/50 border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Leads (Filtered)
            </CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{filteredLeads.length}</div>
            <p className="text-xs text-muted-foreground">matching filters</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Today's Leads
            </CardTitle>
            <Phone className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalLeadsToday}</div>
            <p className="text-xs text-muted-foreground">submissions today</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Successful DIDs
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-500">{successfulDidsToday}</div>
            <p className="text-xs text-muted-foreground">
              {totalLeadsToday > 0 
                ? `${Math.round((successfulDidsToday / totalLeadsToday) * 100)}% success rate today`
                : "no leads today"
              }
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Lead Submissions ({filteredLeads.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredLeads.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {(leads?.length || 0) === 0 
                ? "No leads have been submitted yet."
                : "No leads match the current filters."
              }
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Agent Name</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Caller Number</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Zip</TableHead>
                    <TableHead>Resulting DID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ping Response</TableHead>
                    <TableHead>Post Response</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.slice(0, 100).map((lead) => (
                    <LeadTableRow
                      key={lead.id}
                      lead={lead}
                      formatPhoneNumber={formatPhoneNumber}
                    />
                  ))}
                </TableBody>
              </Table>
              {filteredLeads.length > 100 && (
                <p className="text-center text-sm text-muted-foreground mt-4">
                  Showing first 100 of {filteredLeads.length} leads
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
