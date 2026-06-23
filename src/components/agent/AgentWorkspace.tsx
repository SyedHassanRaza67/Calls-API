import React, { useState, useCallback, useMemo, memo, lazy, Suspense } from "react";

const Hero3D = lazy(() => import("./Hero3D"));
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { api, ApiError } from "@/lib/api";
import { useActiveApiConfigurations } from "@/hooks/useAdminData";
import { useAgentSubmissions, PersistedSubmission } from "@/hooks/useAgentSubmissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import {
  Loader2, Phone, AlertCircle, PhoneCall, Copy, CheckCircle, XCircle,
  ChevronDown, ChevronRight, FileText, List, Filter, Search, RotateCw, Info, X, UserCheck
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PhoneInput } from "@/components/ui/phone-input";
import { ZipInput } from "@/components/ui/zip-input";
import { DuplicateCidNotice } from "@/components/agent/DuplicateCidNotice";

// Safely extract a string from an error value that may be a string or object
function toErrorString(val: unknown, fallback: string): string {
  if (typeof val === "string") return val;
  if (val && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    try { return JSON.stringify(val); } catch { return fallback; }
  }
  return fallback;
}

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"
];

const leadFormSchema = z.object({
  callerNumber: z.string()
    .refine((val) => val.replace(/\D/g, "").length === 10, "Phone number must be exactly 10 digits"),
  callerState: z.string().min(2, "Please select a state"),
  callerZip: z.string()
    .length(5, "Zip code must be 5 digits")
    .regex(/^\d{5}$/, "Zip code must be 5 digits"),
});

type LeadFormData = z.infer<typeof leadFormSchema>;

interface CampaignResult {
  status: "idle" | "loading" | "success" | "failed";
  did?: string;
  raw?: Record<string, unknown>;
  error?: string;
  httpStatus?: number;
}

interface ResponseDialogState {
  open: boolean;
  campaignName: string;
  result: CampaignResult | null;
  did?: string;
  forwardingNumber?: string;
  notes?: string;
  callerNumber?: string;
}

type StatusFilter = "all" | "success" | "failed" | "idle";

function getSubmissionSummary(campaignResults: Record<string, CampaignResult>) {
  const values = Object.values(campaignResults);
  const success = values.filter((r) => r.status === "success").length;
  const failed = values.filter((r) => r.status === "failed").length;
  const loading = values.filter((r) => r.status === "loading").length;
  const idle = values.filter((r) => r.status === "idle").length;
  return { success, failed, loading, idle, total: values.length };
}

function getOverallStatus(campaignResults: Record<string, CampaignResult>): StatusFilter {
  const values = Object.values(campaignResults);
  if (values.some((r) => r.status === "success")) return "success";
  if (values.some((r) => r.status === "failed")) return "failed";
  return "idle";
}

function PhoneAutocomplete({
  value, onChange, disabled, placeholder, submissions, onSelect,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  submissions: PersistedSubmission[];
  onSelect: (sub: PersistedSubmission) => void;
}) {
  const [open, setOpen] = useState(false);

  const suggestions = useMemo(() => {
    const digits = value.replace(/\D/g, "");
    const seen = new Set<string>();
    const filtered = submissions.filter((s) => {
      const phoneDigits = s.callerNumber.replace(/\D/g, "");
      const key = `${phoneDigits}-${s.callerState}-${s.callerZip}`;
      if (seen.has(key)) return false;
      seen.add(key);
      if (!digits) return true;
      return phoneDigits.includes(digits);
    });
    return filtered.slice(0, 8);
  }, [value, submissions]);

  return (
    <div className="relative">
      <PhoneInput
        placeholder={placeholder}
        value={value}
        onChange={(v) => { onChange(v); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        disabled={disabled}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border border-border bg-popover shadow-md max-h-48 overflow-y-auto">
          {suggestions.map((sub) => (
            <button
              key={sub.id}
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors flex items-center justify-between"
              onMouseDown={(e) => { e.preventDefault(); onSelect(sub); setOpen(false); }}
            >
              <span className="font-mono text-xs">{sub.callerNumber}</span>
              <span className="text-muted-foreground text-xs">{sub.callerState} · {sub.callerZip}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Memoized row component to prevent unnecessary re-renders
interface SubmissionRowProps {
  sub: PersistedSubmission;
  rowNumber: number;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  sortedConfigs: any[];
  onTriggerCampaign: (submissionId: string, campaignId: string, mode: any) => void;
  onUpdateSubmission: (submissionId: string, campaignId: string, result: CampaignResult) => void;
  onOpenResponse: (dialog: ResponseDialogState) => void;
}

function buyerSortKey(name: string): [number, number, string] {
  if (name === "Unassigned") return [2, 0, name];
  const m = name.match(/^Buyer\s+(\d+)$/i);
  if (m) return [0, parseInt(m[1], 10), name];
  return [1, 0, name.toLowerCase()];
}

function groupAndSortConfigs(configs: any[]): { category: string; items: any[] }[] {
  const groups = new Map<string, any[]>();
  for (const c of configs) {
    const key = (c.buyer && String(c.buyer).trim()) || "Unassigned";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }
  const entries = Array.from(groups.entries()).map(([category, items]) => ({ category, items }));
  entries.sort((a, b) => {
    const ka = buyerSortKey(a.category);
    const kb = buyerSortKey(b.category);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    if (ka[1] !== kb[1]) return ka[1] - kb[1];
    return String(ka[2]).localeCompare(String(kb[2]));
  });
  return entries;
}

const CampaignButton = memo(function CampaignButton({ config, result, onTrigger, onRetry, onOpenResponse }: {
  config: any; result: CampaignResult; onTrigger: () => void; onRetry: () => void; onOpenResponse: () => void;
}) {
  const httpLabel = result.httpStatus
    ? `${result.httpStatus} ${result.httpStatus >= 200 && result.httpStatus < 300 ? "OK" : result.httpStatus >= 400 && result.httpStatus < 500 ? "Err" : result.httpStatus >= 500 ? "Err" : ""}`
    : null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (result.status === "idle") onTrigger();
        else if (result.status === "success" || result.status === "failed") onOpenResponse();
      }}
      disabled={result.status === "loading"}
      className={`rounded border px-1.5 py-1 text-[10px] font-medium transition-colors flex items-center gap-1 ${
        result.status === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : result.status === "failed"
          ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
          : result.status === "loading"
          ? "border-primary/30 bg-primary/10 text-primary animate-pulse"
          : "border-border bg-card text-foreground hover:bg-accent/50 cursor-pointer"
      }`}
    >
      {result.status === "success" && <CheckCircle className="h-2.5 w-2.5 flex-shrink-0" />}
      {result.status === "failed" && <XCircle className="h-2.5 w-2.5 flex-shrink-0" />}
      {result.status === "loading" && <Loader2 className="h-2.5 w-2.5 animate-spin flex-shrink-0" />}
      {result.status === "idle" && <PhoneCall className="h-2.5 w-2.5 flex-shrink-0" />}
      <span className="truncate flex flex-col leading-tight">
        {(() => {
          const match = config.name.match(/^(D\d+)\s+(.+?)(?:\s+(.+))?$/);
          if (!match) return <span>{config.name}</span>;
          const [, prefix, service, sub] = match;
          const knownCategories = ["Auto Insurance","Home Insurance","Health Insurance","Life Insurance","Home Warranty","Home Security","Mass Tort","Pest Control","Walk-in Tub","Water Damage"];
          let serviceName = service;
          let subName = sub || "";
          if (sub) {
            const twoWord = `${service} ${sub.split(" ")[0]}`;
            if (knownCategories.includes(twoWord)) {
              serviceName = twoWord;
              subName = sub.split(" ").slice(1).join(" ");
            } else {
              subName = sub;
            }
          }
          return <>
            <span className="font-bold">{prefix} {serviceName}</span>
            {subName && <span className="text-[9px] opacity-60">{subName}</span>}
          </>;
        })()}
      </span>
      {httpLabel && (
        <span className={`text-[8px] font-mono px-1 py-0.5 rounded whitespace-nowrap ${
          result.httpStatus! >= 200 && result.httpStatus! < 300
            ? "bg-emerald-100 text-emerald-700"
            : "bg-red-100 text-red-700"
        }`}>
          {httpLabel}
        </span>
      )}
      {result.status === "success" && result.did && (
        <span className="text-[9px] opacity-70 whitespace-nowrap">{result.did.slice(-4)}</span>
      )}
      {(result.status === "success" || result.status === "failed") && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRetry();
          }}
          className="ml-auto p-0.5 rounded hover:bg-muted transition-colors"
          title="Retry"
        >
          <RotateCw className="h-2.5 w-2.5" />
        </button>
      )}
    </button>
  );
});

/* Full-page campaign overlay — shows only API names grouped by category */
const CampaignOverlay = memo(function CampaignOverlay({
  sub, sortedConfigs, onClose, onTriggerCampaign, onUpdateSubmission, onOpenResponse,
}: {
  sub: PersistedSubmission;
  sortedConfigs: any[];
  onClose: () => void;
  onTriggerCampaign: (submissionId: string, campaignId: string, mode: any) => void;
  onUpdateSubmission: (submissionId: string, campaignId: string, result: CampaignResult) => void;
  onOpenResponse: (dialog: ResponseDialogState) => void;
}) {
  const [campaignSearch, setCampaignSearch] = useState("");

  const groupedConfigs = useMemo(() => {
    const filtered = campaignSearch
      ? sortedConfigs.filter((c: any) => c.name.toLowerCase().includes(campaignSearch.toLowerCase()))
      : sortedConfigs;
    return groupAndSortConfigs(filtered);
  }, [sortedConfigs, campaignSearch]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95" onClick={onClose}>
      <div className="flex-1 overflow-auto" onClick={(e) => e.stopPropagation()}>
        {/* Compact sticky header */}
        <div className="sticky top-0 z-10 bg-primary border-b border-primary px-3 py-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Phone className="h-3.5 w-3.5 text-primary-foreground flex-shrink-0" />
            <span className="text-xs font-semibold text-primary-foreground whitespace-nowrap font-mono">{sub.callerNumber}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-primary-foreground/40 text-primary-foreground">{sub.callerState}</Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-primary-foreground/40 text-primary-foreground">{sub.callerZip}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-primary-foreground/60" />
              <input
                type="text"
                placeholder="Search..."
                value={campaignSearch}
                onChange={(e) => setCampaignSearch(e.target.value)}
                className="h-6 w-32 rounded border border-primary-foreground/30 bg-primary-foreground/10 pl-7 pr-2 text-[11px] text-primary-foreground placeholder:text-primary-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary-foreground/40"
              />
            </div>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-primary-foreground/10 transition-colors text-primary-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Campaign groups — ultra compact, minimal spacing */}
        <div className="px-3 py-1.5 space-y-1">
          {groupedConfigs.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-4 text-center">No campaigns match your search.</p>
          ) : (
            groupedConfigs.map(({ category, items }) => (
              <div key={category}>
                <div className="flex items-center gap-2 py-0.5">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{category}</span>
                  <span className="text-[9px] text-muted-foreground/60">({items.length})</span>
                  <div className="flex-1 h-px bg-border/50" />
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1 pb-1">
                  {items.map((config: any) => {
                    const result = sub.campaignResults[config.id] || { status: "idle" as const };
                    return (
                      <CampaignButton
                        key={config.id}
                        config={config}
                        result={result}
                        onTrigger={() => onTriggerCampaign(sub.id, config.id, config.api_mode)}
                        onRetry={() => {
                          onUpdateSubmission(sub.id, config.id, { status: "idle" });
                          setTimeout(() => onTriggerCampaign(sub.id, config.id, config.api_mode), 50);
                        }}
                        onOpenResponse={() => onOpenResponse({ open: true, campaignName: config.name, result, did: result.did, forwardingNumber: config.trackdrive_number || undefined, notes: (config as any).notes || undefined, callerNumber: sub.callerNumber })}
                      />
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
});

const SubmissionRow = memo(function SubmissionRow({
  sub, rowNumber, isExpanded, onToggleExpand, sortedConfigs,
  onTriggerCampaign, onUpdateSubmission, onOpenResponse,
}: SubmissionRowProps) {
  const summary = getSubmissionSummary(sub.campaignResults);

  return (
    <React.Fragment key={sub.id}>
      <tr
        className={`border-b border-border transition-colors cursor-pointer ${isExpanded ? 'bg-primary/5' : 'hover:bg-accent/30'}`}
        onClick={() => onToggleExpand(sub.id)}
      >
        <td className="px-2 py-1.5 text-muted-foreground text-xs">{rowNumber}</td>
        <td className="px-2 py-1.5 text-muted-foreground text-xs whitespace-nowrap">
          {format(sub.timestamp, "MM/dd HH:mm")}
        </td>
        <td className="px-2 py-1.5 font-mono text-xs">{sub.callerNumber}</td>
        <td className="px-2 py-1.5 text-xs">{sub.callerState}</td>
        <td className="px-2 py-1.5 text-xs">{sub.callerZip}</td>
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            {summary.success > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600">
                <CheckCircle className="h-3 w-3" /> {summary.success}
              </span>
            )}
            {summary.failed > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-destructive">
                <XCircle className="h-3 w-3" /> {summary.failed}
              </span>
            )}
            {summary.loading > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary">
                <Loader2 className="h-3 w-3 animate-spin" /> {summary.loading}
              </span>
            )}
            {summary.idle > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground">
                <PhoneCall className="h-3 w-3" /> {summary.idle}
              </span>
            )}
          </div>
        </td>
        <td className="px-2 py-1.5 text-muted-foreground">
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </td>
      </tr>
    </React.Fragment>
  );
});

export function AgentWorkspace() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: apiConfigs, isLoading: isLoadingConfigs } = useActiveApiConfigurations();
  const { submissions: persistedSubmissions, setSubmissions: setPersistedSubmissions, isLoading: isLoadingSubs } = useAgentSubmissions();
  const [localSubmissions, setLocalSubmissions] = useState<PersistedSubmission[]>([]);
  const [showForm, setShowForm] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [responseDialog, setResponseDialog] = useState<ResponseDialogState>({
    open: false, campaignName: "", result: null,
  });
  const [agentFieldsDialog, setAgentFieldsDialog] = useState<{
    open: boolean;
    submissionId: string;
    campaignId: string;
    campaignMode: "rtb" | "ping-post" | "ping";
    fields: { key: string }[];
    values: Record<string, string>;
  }>({ open: false, submissionId: "", campaignId: "", campaignMode: "ping", fields: [], values: {} });

  // Memoize allSubmissions, deduped by id (local placeholder + persisted may share the same DB id)
  const allSubmissions = useMemo(() => {
    const seen = new Set<string>();
    const out: PersistedSubmission[] = [];
    for (const s of [...localSubmissions, ...persistedSubmissions]) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
    }
    return out;
  }, [localSubmissions, persistedSubmissions]);

  // Memoize sorted apiConfigs
  const sortedConfigs = useMemo(
    () => apiConfigs ? [...apiConfigs].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })) : [],
    [apiConfigs]
  );

  const filteredSubmissions = useMemo(() => {
    let result = allSubmissions;
    if (searchQuery) {
      const digits = searchQuery.replace(/\D/g, "");
      if (digits) {
        result = result.filter((sub) =>
          sub.callerNumber.replace(/\D/g, "").includes(digits)
        );
      }
    }
    if (statusFilter !== "all") {
      result = result.filter((sub) => getOverallStatus(sub.campaignResults) === statusFilter);
    }
    return result;
  }, [allSubmissions, statusFilter, searchQuery]);

  const filterCounts = useMemo(() => {
    const s = allSubmissions.reduce((acc, sub) => {
      const status = getOverallStatus(sub.campaignResults);
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return { success: s.success || 0, failed: s.failed || 0, idle: s.idle || 0 };
  }, [allSubmissions]);

  const form = useForm<LeadFormData>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: { callerNumber: "", callerState: "", callerZip: "" },
  });

  const cleanPhoneNumber = useCallback((phone: string): string => phone.replace(/\D/g, ""), []);

  const copyToClipboard = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: "Copied to clipboard" });
  }, []);

  const updateSubmission = useCallback((submissionId: string, campaignId: string, result: CampaignResult) => {
    const updateFn = (prev: PersistedSubmission[]) =>
      prev.map((s) =>
        s.id === submissionId
          ? { ...s, campaignResults: { ...s.campaignResults, [campaignId]: result } }
          : s
      );
    setLocalSubmissions(updateFn);
    setPersistedSubmissions(updateFn);
  }, [setPersistedSubmissions]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedRow((prev) => prev === id ? null : id);
  }, []);

  const triggerCampaignCall = useCallback(async (
    submissionId: string,
    campaignId: string,
    campaignMode: "rtb" | "ping-post" | "ping",
    agentFields?: Record<string, string>
  ) => {
    if (!user) return;
    const submission = [...localSubmissions, ...persistedSubmissions].find((s) => s.id === submissionId);
    if (!submission) return;

    const currentStatus = submission.campaignResults[campaignId]?.status;
    if (currentStatus === "loading") return;

    const campaignConfig = sortedConfigs.find((c: any) => c.id === campaignId);
    const campaignName = campaignConfig?.name || "Campaign";
    const forwardingNumber = campaignConfig?.trackdrive_number || undefined;
    const campaignNotes = (campaignConfig as any)?.notes || undefined;

    const showResultDialog = (result: CampaignResult) => {
      setResponseDialog({
        open: true,
        campaignName,
        result,
        did: result.did,
        forwardingNumber,
        notes: campaignNotes,
        callerNumber: submission.callerNumber,
      });
    };

    updateSubmission(submissionId, campaignId, { status: "loading" });
    const cleanedNumber = cleanPhoneNumber(submission.callerNumber);

    try {
      // Use the cached campaign config; the backend persists the lead as part of the call.
      const mode = campaignConfig?.api_mode || campaignMode;
      let funcData: any, funcError: any;

      const callPingPost = async (body: Record<string, unknown>) => {
        try {
          return { data: await api.post<any>("/api/leads/ping-post", body), error: null };
        } catch (e) {
          if (e instanceof ApiError && e.body && typeof e.body === "object") {
            return { data: e.body as any, error: null };
          }
          return { data: null, error: e };
        }
      };

      if (mode === "ping-post") {
        // Step 1: Ping
        ({ data: funcData, error: funcError } = await callPingPost(
          { action: "ping", api_configuration_id: campaignId, caller_number: cleanedNumber, caller_state: submission.callerState, caller_zip: submission.callerZip, ...(agentFields ? { agent_fields: agentFields } : {}) }
        ));
        if (funcError) throw funcError;

        const pingRaw = funcData?.raw || funcData;
        const hasBid = funcData?.ok === true && funcData?.has_bid === true;
        const pingDid = funcData?.did;

        if (hasBid && pingDid) {
          // Ping already returned a DID (e.g. Retreaver) — no post needed
          updateSubmission(submissionId, campaignId, { status: "success", did: String(pingDid), raw: pingRaw, httpStatus: funcData?.http_status as number | undefined });
          showResultDialog({ status: "success", did: String(pingDid), raw: pingRaw, httpStatus: funcData?.http_status as number | undefined });
          toast({ title: "Success!", description: `DID: ${pingDid}` });
        } else if (hasBid && funcData?.external_lead_id) {
          // Step 2: Auto-post with token
          const { data: postData, error: postError } = await callPingPost(
            // Pass lead_id so the backend UPDATEs the ping's lead row with the post
            // result (status/DID/response), persisting it for later viewing + retry.
            { action: "post", api_configuration_id: campaignId, caller_number: cleanedNumber, caller_state: submission.callerState, caller_zip: submission.callerZip, external_lead_id: funcData.external_lead_id, lead_id: funcData.lead_id, ...(agentFields ? { agent_fields: agentFields } : {}) }
          );
          if (postError) throw postError;

          const postRaw = postData?.raw || postData;
          const did = postData?.did;
          const combinedRaw = { ping: pingRaw, post: postRaw };

          const postHttpStatus = postData?.http_status as number | undefined;
          const result: CampaignResult = did
            ? { status: "success", did: String(did), raw: combinedRaw, httpStatus: postHttpStatus }
            : { status: "failed", error: "Post succeeded but no DID returned", raw: combinedRaw, httpStatus: postHttpStatus };
          updateSubmission(submissionId, campaignId, result);
          showResultDialog(result);

          if (did) {
            toast({ title: "Success!", description: `DID: ${did}` });
          } else {
            toast({ title: "API Call Successful", description: "Check response for details" });
          }
        } else {
          // Ping failed or no bid
          { const failedResult: CampaignResult = { status: "failed", error: toErrorString(funcData?.error, "No bid received"), raw: pingRaw, httpStatus: funcData?.http_status as number | undefined };
          updateSubmission(submissionId, campaignId, failedResult);
          showResultDialog(failedResult); }
          toast({ title: "No Target", description: toErrorString(funcData?.error, "No bid received"), variant: "destructive" });
        }
      } else if (mode === "ping") {
        ({ data: funcData, error: funcError } = await callPingPost(
          { action: "ping-only", api_configuration_id: campaignId, caller_number: cleanedNumber, caller_state: submission.callerState, caller_zip: submission.callerZip, ...(agentFields ? { agent_fields: agentFields } : {}) }
        ));
        if (funcError) throw funcError;

        const isSuccess = funcData?.ok === true;
        const did = funcData?.did;

        const pingHttpStatus = funcData?.http_status as number | undefined;
        const result: CampaignResult = isSuccess
          ? { status: "success", did: did ? String(did) : undefined, raw: funcData?.raw || funcData, httpStatus: pingHttpStatus }
          : { status: "failed", error: toErrorString(funcData?.error, "No tracking number returned"), raw: funcData?.raw || funcData, httpStatus: pingHttpStatus };
        updateSubmission(submissionId, campaignId, result);
        showResultDialog(result);

        if (isSuccess && did) {
          toast({ title: "Success!", description: `DID: ${did}` });
        } else if (isSuccess) {
          toast({ title: "API Call Successful", description: "Check response for details" });
        } else {
          toast({ title: "No Target", description: toErrorString(funcData?.error, "No tracking number returned"), variant: "destructive" });
        }
      } else {
        // RTB mode — use ping-post with action "rtb" for unified handling
        ({ data: funcData, error: funcError } = await callPingPost(
          { action: "rtb", api_configuration_id: campaignId, caller_number: cleanedNumber, caller_state: submission.callerState, caller_zip: submission.callerZip, ...(agentFields ? { agent_fields: agentFields } : {}) }
        ));
        if (funcError) throw funcError;

        const isSuccess = funcData?.ok === true;
        const did = funcData?.did;

        const rtbHttpStatus = funcData?.http_status as number | undefined;
        const result: CampaignResult = isSuccess
          ? { status: "success", did: did ? String(did) : undefined, raw: funcData?.raw || funcData, httpStatus: rtbHttpStatus }
          : { status: "failed", error: toErrorString(funcData?.error, "No tracking number returned"), raw: funcData?.raw || funcData, httpStatus: rtbHttpStatus };
        updateSubmission(submissionId, campaignId, result);
        showResultDialog(result);

        if (isSuccess && did) {
          toast({ title: "Success!", description: `DID: ${did}` });
        } else if (isSuccess) {
          toast({ title: "API Call Successful", description: "Check response for details" });
        } else {
          toast({ title: "No Target", description: toErrorString(funcData?.error, "No tracking number returned"), variant: "destructive" });
        }
      }
    } catch (error) {
      console.error("Campaign call error:", error);
      const errResult: CampaignResult = {
        status: "failed",
        error: error instanceof Error ? error.message : "API call failed",
      };
      updateSubmission(submissionId, campaignId, errResult);
      showResultDialog(errResult);
      toast({ title: "Error", description: "Failed to call campaign API", variant: "destructive" });
    } finally {
      // Refresh persisted submissions so admin + agent stay in sync after refresh
      queryClient.invalidateQueries({ queryKey: ["agent-submissions", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    }
  }, [user, localSubmissions, persistedSubmissions, updateSubmission, cleanPhoneNumber, queryClient, sortedConfigs]);

  // Wrapper: check for ask_agent fields before triggering
  const handleTriggerCampaign = useCallback((submissionId: string, campaignId: string, campaignMode: "rtb" | "ping-post" | "ping") => {
    const config = sortedConfigs.find((c: any) => c.id === campaignId);
    const customFields = Array.isArray(config?.custom_fields) ? config.custom_fields : [];
    const askAgentFields = customFields.filter((f: any) => f.ask_agent === true && f.key);
    
    if (askAgentFields.length > 0) {
      const initialValues: Record<string, string> = {};
      askAgentFields.forEach((f: any) => { initialValues[f.key] = ""; });
      setAgentFieldsDialog({
        open: true,
        submissionId,
        campaignId,
        campaignMode,
        fields: askAgentFields.map((f: any) => ({ key: f.key })),
        values: initialValues,
      });
    } else {
      triggerCampaignCall(submissionId, campaignId, campaignMode);
    }
  }, [sortedConfigs, triggerCampaignCall]);

  const onSubmit = useCallback(async (data: LeadFormData) => {
    if (!user || !apiConfigs) return;
    setIsSubmitting(true);

    const campaignResults: Record<string, CampaignResult> = {};
    apiConfigs.forEach((c) => { campaignResults[c.id] = { status: "idle" }; });

    // Local placeholder row. Real lead rows are persisted by the backend when a
    // campaign is triggered (POST /api/leads/ping-post|submit).
    const localId = (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const newRow: PersistedSubmission = {
      id: localId,
      callerNumber: data.callerNumber,
      callerState: data.callerState,
      callerZip: data.callerZip,
      timestamp: new Date(),
      campaignResults,
    };

    setLocalSubmissions((prev) => [newRow, ...prev]);
    form.reset({ callerNumber: "", callerState: "", callerZip: "" });
    setIsSubmitting(false);
    setShowForm(false);
    queryClient.invalidateQueries({ queryKey: ["agent-submissions", user.id] });
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    toast({ title: "Lead Added", description: "Click any campaign to trigger the API call" });
  }, [user, apiConfigs, form, queryClient]);

  // Precompute row numbers for the filtered list
  const rowNumbers = useMemo(() => {
    return filteredSubmissions.map((sub) => allSubmissions.length - allSubmissions.indexOf(sub));
  }, [filteredSubmissions, allSubmissions]);

  if (isLoadingConfigs || isLoadingSubs) {
    return (
      <div className="space-y-6 w-full max-w-7xl mx-auto">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!apiConfigs || apiConfigs.length === 0) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>No campaigns available. Please contact an administrator.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4">
      {showForm ? (
        <Card className="bg-card border-border relative overflow-hidden">
          <Suspense fallback={null}>
            <Hero3D />
          </Suspense>
          <CardHeader className="pb-3 relative">
            <CardTitle className="text-lg flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Lead Submission Form
            </CardTitle>
            <CardDescription>Fill in the caller details to submit a lead</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="callerNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Caller Number *</FormLabel>
                    <FormControl>
                      <PhoneAutocomplete
                        placeholder="(555) 123-4567"
                        value={field.value}
                        onChange={field.onChange}
                        disabled={isSubmitting}
                        submissions={allSubmissions}
                        onSelect={(sub) => {
                          form.setValue("callerNumber", sub.callerNumber);
                          form.setValue("callerState", sub.callerState);
                          form.setValue("callerZip", sub.callerZip);
                        }}
                      />
                    </FormControl>
                    <DuplicateCidNotice callerNumber={field.value} className="mt-2" />
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="callerState" render={({ field }) => (
                  <FormItem>
                    <FormLabel>State *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select a state" /></SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-card border-border">
                        {US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="callerZip" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Zip Code *</FormLabel>
                    <FormControl>
                      <ZipInput placeholder="12345" value={field.value} onChange={field.onChange} disabled={isSubmitting} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button type="submit" disabled={isSubmitting} className="w-full gap-2">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
                  Submit Lead
                </Button>
              </form>
            </Form>
            {allSubmissions.length > 0 && (
              <Button variant="outline" className="w-full mt-3 gap-2" onClick={() => setShowForm(false)}>
                <List className="h-4 w-4" />
                View Submissions
                <Badge variant="secondary" className="ml-1">{allSubmissions.length}</Badge>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="w-full flex flex-col h-[calc(100vh-100px)]">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-2 px-1 flex-shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-foreground">Submissions ({filteredSubmissions.length})</h2>
              {/* Filters */}
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="Search phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 w-36 pl-7 text-xs"
                />
              </div>
              <div className="flex items-center gap-1">
                <Filter className="h-3 w-3 text-muted-foreground" />
                <button
                  onClick={() => setStatusFilter("all")}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${statusFilter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
                >
                  All
                </button>
                <button
                  onClick={() => setStatusFilter("success")}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors flex items-center gap-1 ${statusFilter === "success" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-muted text-muted-foreground hover:bg-accent"}`}
                >
                  ✅ {filterCounts.success}
                </button>
                <button
                  onClick={() => setStatusFilter("failed")}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors flex items-center gap-1 ${statusFilter === "failed" ? "bg-destructive/20 text-destructive ring-1 ring-destructive/40" : "bg-muted text-muted-foreground hover:bg-accent"}`}
                >
                  ❌ {filterCounts.failed}
                </button>
                <button
                  onClick={() => setStatusFilter("idle")}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors flex items-center gap-1 ${statusFilter === "idle" ? "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200" : "bg-muted text-muted-foreground hover:bg-accent"}`}
                >
                  ⏳ {filterCounts.idle}
                </button>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="gap-1.5 h-7 text-xs">
              <Phone className="h-3.5 w-3.5" />
              New Lead
            </Button>
          </div>

          {/* Full-page campaign overlay when expanded */}
          {expandedRow && (() => {
            const activeSub = allSubmissions.find(s => s.id === expandedRow);
            return activeSub ? (
              <CampaignOverlay
                sub={activeSub}
                sortedConfigs={sortedConfigs}
                onClose={() => setExpandedRow(null)}
                onTriggerCampaign={handleTriggerCampaign}
                onUpdateSubmission={updateSubmission}
                onOpenResponse={setResponseDialog}
              />
            ) : null;
          })()}

          {/* Table */}
          <div className="border border-border rounded-md overflow-hidden flex-1 min-h-0">
            <div className="h-full overflow-y-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-20">
                  <tr className="border-b border-border bg-secondary">
                    <th className="w-8 px-2 py-2 text-left font-medium text-muted-foreground text-xs">#</th>
                    <th className="w-20 px-2 py-2 text-left font-medium text-muted-foreground text-xs">Time</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground text-xs">Phone</th>
                    <th className="w-10 px-2 py-2 text-left font-medium text-muted-foreground text-xs">ST</th>
                    <th className="w-14 px-2 py-2 text-left font-medium text-muted-foreground text-xs">Zip</th>
                    <th className="px-2 py-2 text-left font-medium text-muted-foreground text-xs">Status</th>
                    <th className="w-8 px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubmissions.map((sub, idx) => (
                    <SubmissionRow
                      key={sub.id}
                      sub={sub}
                      rowNumber={rowNumbers[idx]}
                      isExpanded={expandedRow === sub.id}
                      onToggleExpand={toggleExpand}
                      sortedConfigs={sortedConfigs}
                      onTriggerCampaign={triggerCampaignCall}
                      onUpdateSubmission={updateSubmission}
                      onOpenResponse={setResponseDialog}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Response Dialog */}
      <Dialog open={responseDialog.open} onOpenChange={(open) => setResponseDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {responseDialog.result?.status === "success" ? (
                <CheckCircle className="h-5 w-5 text-emerald-500" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
              {responseDialog.campaignName}
            </DialogTitle>
            <DialogDescription>
              {responseDialog.result?.status === "success"
                ? "API call was successful"
                : responseDialog.result?.error || "API call failed"}
            </DialogDescription>
          </DialogHeader>
          {responseDialog.result?.status === "success" && responseDialog.forwardingNumber && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-emerald-50 border border-emerald-200">
              <Phone className="h-4 w-4 text-emerald-600 flex-shrink-0" />
              <span className="text-sm font-mono text-emerald-700">{responseDialog.forwardingNumber}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 ml-auto text-emerald-600 hover:text-emerald-500"
                onClick={() => responseDialog.forwardingNumber && copyToClipboard(responseDialog.forwardingNumber)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          {responseDialog.did && (
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/30 text-center">
              <p className="text-xs text-muted-foreground mb-1">Tracking Number</p>
              <div className="flex items-center justify-center gap-2">
                <a href={`tel:${responseDialog.did}`} className="text-xl font-bold text-primary hover:text-primary/80 transition-colors flex items-center gap-2">
                  <PhoneCall className="h-5 w-5" />
                  {responseDialog.did}
                </a>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => responseDialog.did && copyToClipboard(responseDialog.did)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          {responseDialog.callerNumber && (
            <DuplicateCidNotice callerNumber={responseDialog.callerNumber} />
          )}
          {responseDialog.notes && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-blue-50 border border-blue-200">
              <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700 whitespace-pre-wrap">{responseDialog.notes}</p>
            </div>
          )}
          {responseDialog.result?.raw && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between text-muted-foreground">
                  <span className="flex items-center gap-2"><FileText className="h-4 w-4" />View Raw Response</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 p-3 rounded-lg bg-muted/50 border border-border">
                  <pre className="text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                    {JSON.stringify(responseDialog.result.raw, null, 2)}
                  </pre>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </DialogContent>
      </Dialog>

      {/* Agent Fields Dialog */}
      <Dialog open={agentFieldsDialog.open} onOpenChange={(open) => setAgentFieldsDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              Fill Required Fields
            </DialogTitle>
            <DialogDescription>
              This campaign requires additional information before the API call.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {agentFieldsDialog.fields.map((field) => (
              <div key={field.key} className="space-y-1">
                <Label className="text-sm font-medium capitalize">{field.key}</Label>
                <Input
                  placeholder={`Enter ${field.key}`}
                  value={agentFieldsDialog.values[field.key] || ""}
                  onChange={(e) => setAgentFieldsDialog(prev => ({
                    ...prev,
                    values: { ...prev.values, [field.key]: e.target.value },
                  }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAgentFieldsDialog(prev => ({ ...prev, open: false }))}>Cancel</Button>
            <Button
              onClick={() => {
                const { submissionId, campaignId, campaignMode, values } = agentFieldsDialog;
                setAgentFieldsDialog(prev => ({ ...prev, open: false }));
                triggerCampaignCall(submissionId, campaignId, campaignMode, values);
              }}
              disabled={agentFieldsDialog.fields.some(f => !agentFieldsDialog.values[f.key]?.trim())}
            >
              Submit & Call API
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
