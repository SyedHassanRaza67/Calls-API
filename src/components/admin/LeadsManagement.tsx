import { useState, useMemo, memo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Phone, CheckCircle, XCircle, Users, Clock, Send } from "lucide-react";
import { format, isToday, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { LeadsFilters, LeadsFilterState } from "./LeadsFilters";
import { useLeads, useProfiles, useApiConfigurations } from "@/hooks/useAdminData";
import { ResponseViewDialog } from "./ResponseViewDialog";
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
}

// Memoized table row
const LeadTableRow = memo(({ 
  lead, 
  formatPhoneNumber 
}: { 
  lead: LeadWithAgent; 
  formatPhoneNumber: (phone: string) => string;
}) => (
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
      {lead.api_name ? (
        <Badge variant="outline" className="text-xs bg-primary/10 border-primary/30">
          {lead.api_name}
        </Badge>
      ) : (
        <Badge variant="secondary" className="text-xs">
          Legacy/Direct
        </Badge>
      )}
    </TableCell>
    <TableCell className="font-mono">
      {formatPhoneNumber(lead.caller_number)}
    </TableCell>
    <TableCell>{lead.caller_state}</TableCell>
    <TableCell>{lead.caller_zip}</TableCell>
    <TableCell>
      {lead.returned_did ? (
        <a 
          href={`tel:${lead.returned_did}`}
          className="font-mono text-primary hover:underline"
        >
          {lead.returned_did}
        </a>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </TableCell>
    <TableCell>
      {lead.submission_stage === "pending" ? (
        <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30">
          <Clock className="h-3 w-3 mr-1" />
          Pending
        </Badge>
      ) : lead.submission_stage === "complete" ? (
        lead.status === "success" ? (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
            <CheckCircle className="h-3 w-3 mr-1" />
            Success
          </Badge>
        ) : (
          <Badge variant="destructive" className="bg-destructive/20 text-destructive border-destructive/30">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        )
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
      {lead.campaign_count > 0 && (
        <span className="ml-2 text-[10px] text-muted-foreground">{lead.campaign_count} call{lead.campaign_count > 1 ? "s" : ""}</span>
      )}
    </TableCell>
    <TableCell>
      <ResponseViewDialog
        title="Ping Response"
        data={lead.ping_response}
        variant="ping"
      />
    </TableCell>
    <TableCell>
      <ResponseViewDialog
        title="Post Response"
        data={lead.api_response}
        variant="post"
      />
    </TableCell>
  </TableRow>
));
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
    new Map(apiConfigs?.map(c => [c.id, c.name]) || []),
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
        };
        map.set(key, g);
      }
      // Track latest interaction for ordering
      if (new Date(lead.created_at) > new Date(g.created_at) && lead.api_configuration_id) {
        // keep earliest created_at as submission timestamp; do nothing
      }
      if (lead.api_configuration_id) {
        g.campaign_count += 1;
        if (lead.status === "success" && lead.returned_did && !g.returned_did) {
          g.returned_did = lead.returned_did;
        }
        if (lead.status === "success" && lead.returned_did) {
          g.status = "success";
          g.submission_stage = "complete";
          g.api_configuration_id = lead.api_configuration_id;
          g.api_name = apiConfigMap.get(lead.api_configuration_id) || null;
          g.api_response = lead.api_response as Record<string, unknown> | null;
          g.ping_response = lead.ping_response as Record<string, unknown> | null;
        } else if (g.status !== "success") {
          g.status = "failed";
          g.submission_stage = "complete";
          g.api_configuration_id = lead.api_configuration_id;
          g.api_name = apiConfigMap.get(lead.api_configuration_id) || null;
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
