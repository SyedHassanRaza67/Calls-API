import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useApiConfigurations, useProfiles, useUserRoles, useInvalidateAdminData } from "@/hooks/useAdminData";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, Copy, Key, CheckCircle, XCircle, User, FlaskConical, AlertTriangle, ChevronDown, Link, Phone, MessageSquare, Send, UserCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";

type ApiProvider = "retreaver" | "trackdrive" | "ringba" | "custom" | "quotewizard";
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface FormData {
  name: string;
  api_key: string;
  publisher_id: string;
  is_active: boolean;
  assigned_to: string;
  api_mode: "rtb" | "ping-post" | "ping";
  ping_url: string;
  post_url: string;
  api_provider: ApiProvider;
  trackdrive_number_id: string;
  trackdrive_number: string;
  http_method: HttpMethod;
  notes: string;
  custom_fields: { key: string; value: string; enabled?: boolean; ask_agent?: boolean; stages?: { ping?: boolean; post?: boolean } }[];
  assigned_agents: string[];
  buyer: string;
  ping_id_source_key: string;
  ping_id_post_field: string;
}

const initialFormData: FormData = {
  name: "",
  api_key: "",
  publisher_id: "",
  is_active: true,
  assigned_to: "",
  api_mode: "rtb",
  ping_url: "",
  post_url: "",
  api_provider: "custom",
  trackdrive_number_id: "",
  trackdrive_number: "",
  http_method: "POST",
  notes: "",
  custom_fields: [
    { key: "lp_campaign_id", value: "", enabled: false },
    { key: "lp_campaign_key", value: "", enabled: false },
    { key: "caller_id", value: "{{phone}}", enabled: true },
    { key: "state", value: "{{state}}", enabled: true },
    { key: "zip_code", value: "{{zip}}", enabled: true },
  ],
  assigned_agents: [],
  buyer: "",
  ping_id_source_key: "",
  ping_id_post_field: "",
};

const httpMethodColors: Record<HttpMethod, string> = {
  GET: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  POST: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  PUT: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  PATCH: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  DELETE: "bg-red-500/20 text-red-400 border-red-500/30",
};

// Memoized table row
const ConfigTableRow = memo(({ 
  config, 
  isSuperAdmin, 
  canManage,
  getAssignedAdminName, 
  maskApiKey,
  onEdit,
  onDelete,
  onDuplicate,
  onToggle 
}: { 
  config: any;
  isSuperAdmin: boolean;
  canManage: boolean;
  getAssignedAdminName: (id: string | null) => string;
  maskApiKey: (key: string) => string;
  onEdit: (config: any) => void;
  onDelete: (config: any) => void;
  onDuplicate: (config: any) => void;
  onToggle: (config: any) => void;
}) => (
  <TableRow className="border-border">
    <TableCell className="font-medium">{config.name}</TableCell>
    <TableCell>
      <div className="flex flex-col gap-1">
        <Badge variant="outline" className={
          config.http_method 
            ? httpMethodColors[config.http_method as HttpMethod] || "bg-muted/50"
            : "bg-blue-500/20 text-blue-400 border-blue-500/30"
        }>
          {config.http_method || "POST"}
        </Badge>
        <Badge variant="outline" className={
            config.api_mode === "ping-post" 
              ? "bg-purple-500/20 text-purple-400 border-purple-500/30" 
              : config.api_mode === "ping"
                ? "bg-primary/20 text-primary border-primary/30"
                : "bg-muted/50 text-muted-foreground"
          }>
            {config.api_mode === "ping-post" ? "Ping/Post" : config.api_mode === "ping" ? "Ping Only" : "RTB / Ping"}
          </Badge>
      </div>
    </TableCell>
    <TableCell className="font-mono text-sm text-muted-foreground max-w-[200px] truncate">
      {config.ping_url || config.post_url || "—"}
    </TableCell>
    {isSuperAdmin && (
      <TableCell>
        <Badge variant="outline" className="text-xs">
          <User className="h-3 w-3 mr-1" />
          {getAssignedAdminName(config.assigned_to)}
        </Badge>
      </TableCell>
    )}
    <TableCell>
      <Badge 
        variant={config.is_active ? "default" : "secondary"}
        className={config.is_active 
          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" 
          : "bg-muted text-muted-foreground"
        }
      >
        {config.is_active ? (
          <>
            <CheckCircle className="h-3 w-3 mr-1" />
            Active
          </>
        ) : (
          <>
            <XCircle className="h-3 w-3 mr-1" />
            Inactive
          </>
        )}
      </Badge>
    </TableCell>
    <TableCell className="text-muted-foreground text-sm">
      {format(new Date(config.created_at), "MMM d, yyyy")}
    </TableCell>
    <TableCell className="text-right">
      {canManage ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggle(config)}
            title={config.is_active ? "Deactivate" : "Activate"}
          >
            <Switch checked={config.is_active} className="pointer-events-none" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(config)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Duplicate"
            onClick={() => onDuplicate(config)}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive"
            title="Delete permanently"
            onClick={() => onDelete(config)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      )}
    </TableCell>
  </TableRow>
));
ConfigTableRow.displayName = "ConfigTableRow";

// Loading skeleton
const TableSkeleton = () => (
  <div className="space-y-3">
    {[1, 2, 3].map((i) => (
      <div key={i} className="flex items-center gap-4 p-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-4 w-24" />
      </div>
    ))}
  </div>
);

export function ApiConfigurations() {
  const { user, isSuperAdmin } = useAuth();
  const { data: configs, isLoading } = useApiConfigurations();
  const { data: profiles } = useProfiles();
  const { data: roles } = useUserRoles();
  const { invalidateApiConfigs } = useInvalidateAdminData();

  const scrollSnapshotRef = useRef<{ top: number; left: number } | null>(null);
  const restorePendingRef = useRef(false);

  const getAdminScrollContainer = useCallback((): HTMLElement | null => {
    return document.querySelector<HTMLElement>("[data-admin-scroll-container='true']");
  }, []);

  const snapshotScroll = useCallback(() => {
    const el = getAdminScrollContainer();
    if (el) {
      scrollSnapshotRef.current = { top: el.scrollTop, left: el.scrollLeft };
      return;
    }
    scrollSnapshotRef.current = { top: window.scrollY, left: window.scrollX };
  }, [getAdminScrollContainer]);

  const restoreScroll = useCallback(() => {
    const snap = scrollSnapshotRef.current;
    if (!snap) return;
    const el = getAdminScrollContainer();
    if (el) {
      el.scrollTop = snap.top;
      el.scrollLeft = snap.left;
      return;
    }
    window.scrollTo({ top: snap.top, left: snap.left, behavior: "auto" });
  }, [getAdminScrollContainer]);

  const scheduleRestoreScroll = useCallback(() => {
    restorePendingRef.current = true;
    requestAnimationFrame(() => {
      restoreScroll();
      requestAnimationFrame(restoreScroll);
    });
  }, [restoreScroll]);

  useEffect(() => {
    if (!restorePendingRef.current) return;
    restorePendingRef.current = false;
    requestAnimationFrame(() => {
      restoreScroll();
      requestAnimationFrame(restoreScroll);
    });
  }, [configs, restoreScroll]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<any | null>(null);
  const [deletingConfig, setDeletingConfig] = useState<any | null>(null);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);
  const [isTestResultOpen, setIsTestResultOpen] = useState(false);


  // Campaign Names — the section an API belongs to (groups APIs on the agent call screen)
  const [campaignSection, setCampaignSection] = useState("");
  const [campaignSectionCustom, setCampaignSectionCustom] = useState("");
  // Name parts (display identifier, e.g. "D3 HS Bathroom" — independent of Campaign Names)
  const [namePrefix, setNamePrefix] = useState("");
  const [namePrefixCustom, setNamePrefixCustom] = useState("");
  const [nameCategory, setNameCategory] = useState("");
  const [nameCategoryCustom, setNameCategoryCustom] = useState("");
  const [nameSubname, setNameSubname] = useState("");
  // Buyer (separate from campaign name)
  const [buyerSelect, setBuyerSelect] = useState("");
  const [buyerCustom, setBuyerCustom] = useState("");

  // Kept for legacy parsing of saved names only (not rendered in dropdowns)
  const KNOWN_CATEGORIES = [
    "Auto Insurance", "Home Insurance", "Health Insurance", "Life Insurance", "Medicare",
    "Home Warranty", "Home Security", "Bathroom", "Roofing", "Windows",
    "Pest Control", "Walk-in Tub", "Plumbing", "Water Damage", "Solar", "Mass Tort",
  ];

  // Lists derived from existing saved configs (replaces hardcoded dummy options)
  const existingBuyers = useMemo(() => {
    const set = new Set<string>();
    (configs ?? []).forEach((c: any) => {
      const b = (c.buyer || "").trim();
      if (b) set.add(b);
    });
    const current = (formData.buyer || "").trim();
    if (current && buyerSelect !== "__custom__") set.add(current);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [configs, formData.buyer, buyerSelect]);

  const parsedNames = useMemo(() => {
    return (configs ?? []).map((c: any) => {
      const name = (c.name || "").trim();
      const m = name.match(/^(D\d+)\s*(.*)/);
      const prefix = m ? m[1] : "";
      const savedCategory = (c.category || "").trim();
      if (savedCategory) return { prefix, category: savedCategory };
      if (!m) return { prefix: "", category: "" };
      const rest = m[2] || "";
      const foundCat = KNOWN_CATEGORIES.find(k => rest.startsWith(k));
      let category = "";
      if (foundCat) category = foundCat;
      else {
        const spaceIdx = rest.indexOf(" ");
        category = spaceIdx > 0 ? rest.slice(0, spaceIdx) : rest;
      }
      return { prefix, category };
    });
  }, [configs]);

  const existingPrefixes = useMemo(() => {
    const set = new Set<string>();
    parsedNames.forEach(p => { if (p.prefix) set.add(p.prefix); });
    if (namePrefix && /^D\d+/.test(namePrefix)) set.add(namePrefix);
    return Array.from(set).sort((a, b) => {
      const na = parseInt(a.slice(1), 10) || 0;
      const nb = parseInt(b.slice(1), 10) || 0;
      return na - nb;
    });
  }, [parsedNames, namePrefix]);

  const existingCategories = useMemo(() => {
    const set = new Set<string>();
    parsedNames.forEach(p => { if (p.category) set.add(p.category); });
    if (nameCategory && nameCategory !== "__custom__") set.add(nameCategory);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [parsedNames, nameCategory]);

  const existingCampaignSections = useMemo(() => {
    const set = new Set<string>();
    (configs ?? []).forEach((c: any) => {
      const s = (c.campaign_section || "").trim();
      if (s) set.add(s);
    });
    if (campaignSection && campaignSection !== "__custom__") set.add(campaignSection);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [configs, campaignSection]);

  // Compose full name from parts
  const composeCampaignName = (prefix: string, category: string, customCat: string, sub: string) => {
    const cat = category === "__custom__" ? customCat : category;
    const parts = [prefix, cat, sub].filter(Boolean);
    return parts.join(" ");
  };

  // Parse existing name into parts
  const parseCampaignName = (name: string) => {
    const match = name.match(/^(D\d+)\s*(.*)/);
    if (match) {
      const prefix = match[1];
      const rest = match[2] || "";
      // Try to find a category match
      const foundCat = KNOWN_CATEGORIES.find(c => rest.startsWith(c));
      if (foundCat) {
        return { prefix, category: foundCat, customCat: "", sub: rest.slice(foundCat.length).trim() };
      }
      // Check if there's a space to split category and sub
      const spaceIdx = rest.indexOf(" ");
      if (spaceIdx > 0) {
        return { prefix, category: "__custom__", customCat: rest.slice(0, spaceIdx), sub: rest.slice(spaceIdx + 1) };
      }
      return { prefix, category: rest ? "__custom__" : "", customCat: rest, sub: "" };
    }
    return { prefix: "D1", category: name ? "__custom__" : "", customCat: name, sub: "" };
  };

  // Memoized admin users
  const adminUsers = useMemo(() => {
    if (!profiles || !roles) return [];
    const adminUserIds = roles.filter(r => r.role === "admin").map(r => r.user_id);
    return profiles
      .filter(p => adminUserIds.includes(p.user_id))
      .map(p => ({
        user_id: p.user_id,
        full_name: p.full_name,
        email: p.email,
      }));
  }, [profiles, roles]);

  // Agents managed by the currently selected admin (for per-agent assignment)
  const eligibleAgents = useMemo(() => {
    if (!profiles || !roles) return [];
    const targetAdminId = isSuperAdmin ? formData.assigned_to : user?.id;
    if (!targetAdminId) return [];
    const agentIds = new Set(roles.filter(r => r.role === "agent").map(r => r.user_id));
    return profiles
      .filter(p => agentIds.has(p.user_id) && p.managed_by === targetAdminId)
      .map(p => ({ user_id: p.user_id, full_name: p.full_name, email: p.email }));
  }, [profiles, roles, formData.assigned_to, isSuperAdmin, user?.id]);

  const handleOpenDialog = useCallback((config?: any) => {
    snapshotScroll();
    if (config) {
      setEditingConfig(config);

      // Campaign Names section (independent field, no parsing)
      const savedSection: string = (config.campaign_section || "").trim();
      if (savedSection) {
        if (existingCampaignSections.includes(savedSection)) {
          setCampaignSection(savedSection);
          setCampaignSectionCustom("");
        } else {
          setCampaignSection("__custom__");
          setCampaignSectionCustom(savedSection);
        }
      } else {
        setCampaignSection("");
        setCampaignSectionCustom("");
      }

      const savedCategory: string = (config.category || "").trim();
      if (savedCategory) {
        // Category/sub-name were saved explicitly — use them directly, no re-parsing.
        const prefixMatch = (config.name || "").match(/^(D\d+)/);
        setNamePrefix(prefixMatch ? prefixMatch[1] : "D1");
        if (existingCategories.includes(savedCategory)) {
          setNameCategory(savedCategory);
          setNameCategoryCustom("");
        } else {
          setNameCategory("__custom__");
          setNameCategoryCustom(savedCategory);
        }
        setNameSubname((config.sub_name || "").trim());
      } else {
        // Legacy row with no saved category — fall back to best-effort parsing.
        const parsed = parseCampaignName(config.name || "");
        setNamePrefix(parsed.prefix);
        setNameCategory(parsed.category);
        setNameCategoryCustom(parsed.customCat);
        setNameSubname(parsed.sub);
      }

      // Buyer (independent column)
      const savedBuyer: string = (config.buyer || "").trim();
      if (savedBuyer) {
        if (existingBuyers.includes(savedBuyer)) {
          setBuyerSelect(savedBuyer);
          setBuyerCustom("");
        } else {
          setBuyerSelect("__custom__");
          setBuyerCustom(savedBuyer);
        }
      } else {
        setBuyerSelect("");
        setBuyerCustom("");
      }
      setFormData({
        name: config.name,
        api_key: config.api_key || "",
        publisher_id: config.publisher_id || "",
        is_active: config.is_active,
        assigned_to: config.assigned_to || "",
        api_mode: config.api_mode || "ping",
        ping_url: config.ping_url || "",
        post_url: config.post_url || "",
        api_provider: config.api_provider || "custom",
        trackdrive_number_id: config.trackdrive_number_id || "",
        trackdrive_number: config.trackdrive_number || "",
        http_method: config.http_method || "POST",
        notes: config.notes || "",
        custom_fields: (() => {
          if (Array.isArray(config.custom_fields)) {
            // Respect saved parameter list exactly (including deleted defaults)
            return config.custom_fields.map((f: any) => ({
              key: f.key,
              value: f.value,
              enabled: f.enabled !== false,
              ask_agent: !!f.ask_agent,
              stages: {
                ping: f.stages?.ping !== false,
                post: f.stages?.post !== false,
              },
            }));
          }

          // Legacy records with no parameter list get seeded defaults
          return initialFormData.custom_fields.map((field) => ({ ...field }));
        })(),
        assigned_agents: Array.isArray(config.assigned_agents) ? config.assigned_agents : [],
        buyer: config.buyer || "",
        ping_id_source_key: config.ping_id_source_key || "",
        ping_id_post_field: config.ping_id_post_field || "",
      });
    } else {
      setEditingConfig(null);
      setFormData(initialFormData);
      setCampaignSection("");
      setCampaignSectionCustom("");
      setNamePrefix("");
      setNamePrefixCustom("");
      setNameCategory("");
      setNameCategoryCustom("");
      setNameSubname("");
      setBuyerSelect("");
      setBuyerCustom("");
    }
    setIsDialogOpen(true);
  }, [snapshotScroll]);

  const handleCloseDialog = useCallback(() => {
    scheduleRestoreScroll();
    setIsDialogOpen(false);
    setEditingConfig(null);
    setFormData(initialFormData);
    setTestResult(null);
    setIsTestResultOpen(false);
  }, [scheduleRestoreScroll]);

  const handleTestApi = async () => {
    // RTB mode: try to extract publisher_id from ping_url or custom_fields
    const customPublisherId = formData.custom_fields.find(f => f.key === "publisher_id" && f.enabled !== false)?.value?.trim() || "";
    const rtbUrlMatch = formData.ping_url.match(/rtb\.ringba\.com\/v1\/production\/(.+?)\.json/);
    const effectivePublisherId = formData.publisher_id.trim() || customPublisherId || (rtbUrlMatch ? rtbUrlMatch[1] : "");
    if (formData.api_mode !== "rtb" && !formData.ping_url.trim()) {
      toast({
        title: "Missing URL",
        description: "Please enter an API Endpoint URL before testing",
        variant: "destructive",
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const testConfig = {
        id: editingConfig?.id || "test-config",
        name: formData.name || "Test Configuration",
        api_key: formData.api_key,
        publisher_id: effectivePublisherId || formData.publisher_id,
        api_mode: formData.api_mode,
        api_provider: formData.api_provider,
        ping_url: formData.ping_url.trim(),
        post_url: formData.post_url.trim(),
        trackdrive_number: formData.trackdrive_number,
        trackdrive_number_id: formData.trackdrive_number_id,
        http_method: formData.http_method,
        custom_fields: formData.custom_fields.filter(f => f.key.trim() && f.enabled !== false),
      };

      const actionForMode: "ping" | "ping-only" | "rtb" = formData.api_mode === "rtb" ? "rtb" : formData.api_mode === "ping" ? "ping-only" : "ping";

      const baseTestData = {
        action: actionForMode,
        caller_number: "+15551234567",
        caller_state: "CA",
        caller_zip: "90210",
        api_configuration_id: editingConfig?.id,
        test_mode: true,
        test_config: testConfig,
      };

      let pingData: any = null;
      let pingError: { message: string } | null = null;
      try {
        pingData = await api.post("/api/leads/ping-post", baseTestData);
      } catch (e) {
        pingError = { message: e instanceof ApiError ? e.message : (e instanceof Error ? e.message : "Request failed") };
        if (e instanceof ApiError && e.body) pingData = e.body;
      }

      // RTB mode result
      if (formData.api_mode === "rtb") {
        if (pingError) {
          setTestResult({ success: false, message: `Error: ${pingError.message}`, details: pingError });
        } else if (pingData?.ok === false) {
          setTestResult({ success: false, message: (typeof pingData.error === "string" ? pingData.error : JSON.stringify(pingData.error)) || "RTB request failed", details: pingData.raw || pingData });
        } else if (pingData?.rejected) {
          setTestResult({ success: true, message: `⚠️ No Bid — ${pingData.message || "Rejected by provider"}`, details: pingData.raw || pingData });
        } else {
          setTestResult({ success: true, message: pingData?.did ? `RTB Success — DID: ${pingData.did}` : "RTB Success — Connection OK", details: pingData });
        }
        setIsTestResultOpen(true);
        return;
      }

      if (formData.api_mode === "ping") {
        if (pingError) {
          setTestResult({ success: false, message: `Error: ${pingError.message}`, details: pingError });
        } else if (pingData?.ok === false) {
          setTestResult({ success: false, message: (typeof pingData.error === "string" ? pingData.error : JSON.stringify(pingData.error)) || "API request failed", details: pingData.raw || pingData });
        } else {
          setTestResult({ success: true, message: pingData?.did ? `Success — DID: ${pingData.did}` : "Success — API connection OK", details: pingData });
        }
        setIsTestResultOpen(true);
        return;
      }

      // Ping/Post mode
      if (pingError) {
        setTestResult({ success: false, message: `Error: ${pingError.message}`, details: pingError });
        setIsTestResultOpen(true);
        return;
      }

      if (pingData?.ok === false || !pingData?.has_bid || !pingData?.external_lead_id) {
        setTestResult({ success: false, message: (typeof pingData?.error === "string" ? pingData.error : JSON.stringify(pingData?.error)) || "Ping did not return an accepted buyer", details: { ping: pingData } });
        setIsTestResultOpen(true);
        return;
      }

      let postData: any = null;
      let postError: { message: string } | null = null;
      try {
        postData = await api.post("/api/leads/ping-post", {
          action: "post",
          caller_number: "+15551234567",
          caller_state: "CA",
          caller_zip: "90210",
          api_configuration_id: editingConfig?.id,
          external_lead_id: pingData.external_lead_id,
          test_mode: true,
          test_config: testConfig,
        });
      } catch (e) {
        postError = { message: e instanceof ApiError ? e.message : (e instanceof Error ? e.message : "Request failed") };
        if (e instanceof ApiError && e.body) postData = e.body;
      }

      if (postError) {
        setTestResult({ success: false, message: `Post error: ${postError.message}`, details: { ping: pingData, postError } });
      } else if (postData?.ok === false) {
        setTestResult({ success: false, message: (typeof postData.error === "string" ? postData.error : JSON.stringify(postData.error)) || "Post failed", details: { ping: pingData, post: postData } });
      } else {
        setTestResult({ success: true, message: postData?.did ? `Ping OK, Post OK — DID: ${postData.did}` : "Ping OK, Post OK", details: { ping: pingData, post: postData } });
      }

      setIsTestResultOpen(true);
    } catch (err) {
      console.error("Test API error:", err);
      setTestResult({ success: false, message: err instanceof Error ? err.message : "Unknown error", details: err });
      setIsTestResultOpen(true);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    const effectiveCampaignSection = (campaignSection === "__custom__" ? campaignSectionCustom : campaignSection).trim();
    if (!effectiveCampaignSection) {
      toast({ title: "Error", description: "Campaign Names is required", variant: "destructive" });
      return;
    }
    if (!formData.name.trim()) {
      toast({ title: "Error", description: "Name is required", variant: "destructive" });
      return;
    }
    if (!formData.ping_url.trim() && formData.api_mode !== "rtb") {
      toast({ title: "Error", description: "API Endpoint URL is required", variant: "destructive" });
      return;
    }
    if (formData.api_mode === "ping-post" && !formData.post_url.trim()) {
      toast({ title: "Error", description: "Post URL is required for Ping/Post mode", variant: "destructive" });
      return;
    }

    setIsSaving(true);

    try {
      // Regular admins must own the API; super admins can assign to anyone
      const effectiveAssignedTo = isSuperAdmin
        ? (formData.assigned_to || null)
        : (user?.id || null);

      const dataToSave = {
        name: formData.name.trim(),
        campaign_section: effectiveCampaignSection,
        api_key: formData.api_key.trim() || null,
        publisher_id: formData.publisher_id.trim() || null,
        is_active: formData.is_active,
        assigned_to: effectiveAssignedTo,
        api_mode: formData.api_mode,
        ping_url: formData.ping_url.trim() || null,
        post_url: formData.api_mode === "ping-post" ? formData.post_url.trim() || null : null,
        api_provider: formData.api_provider,
        trackdrive_number_id: formData.trackdrive_number_id.trim() || null,
        trackdrive_number: formData.trackdrive_number.trim() || null,
        http_method: formData.http_method,
        notes: formData.notes.trim() || null,
        custom_fields: formData.custom_fields.length > 0 
          ? formData.custom_fields.filter(f => f.key.trim()).map(({ key, value, enabled, ask_agent, stages }) => ({
              key,
              value,
              enabled: enabled !== false,
              ...(ask_agent ? { ask_agent: true } : {}),
              ...(formData.api_mode === "ping-post"
                ? { stages: { ping: stages?.ping !== false, post: stages?.post !== false } }
                : {}),
            }))
          : null,
        assigned_agents: formData.assigned_agents || [],
        buyer: formData.buyer?.trim() || null,
        category: (nameCategory === "__custom__" ? nameCategoryCustom : nameCategory).trim() || null,
        sub_name: nameSubname.trim() || null,
        ping_id_source_key: formData.api_mode === "ping-post" ? (formData.ping_id_source_key.trim() || null) : null,
        ping_id_post_field: formData.api_mode === "ping-post" ? (formData.ping_id_post_field.trim() || null) : null,
      };

      if (editingConfig) {
        await api.patch(`/api/api-configurations/${editingConfig.id}`, dataToSave);
        toast({ title: "Success", description: "API configuration updated" });
      } else {
        await api.post("/api/api-configurations", { ...dataToSave, created_by: user?.id });
        toast({ title: "Success", description: "API configuration created" });
      }

      handleCloseDialog();
      invalidateApiConfigs();
    } catch (error) {
      console.error("Error saving:", error);
      toast({ title: "Error", description: "Failed to save API configuration", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingConfig) return;
    try {
      await api.del(`/api/api-configurations/${deletingConfig.id}`);
      toast({ title: "Success", description: "API configuration permanently deleted" });
      setIsDeleteDialogOpen(false);
      setDeletingConfig(null);
      invalidateApiConfigs();
    } catch (error) {
      console.error("Error deleting:", error);
      toast({ title: "Error", description: "Failed to delete API configuration", variant: "destructive" });
    }
  };

  const handleDuplicate = useCallback(async (config: any) => {
    try {
      await api.post("/api/api-configurations", {
        name: `${config.name} (Copy)`,
        api_type: config.api_type,
        api_key: config.api_key,
        publisher_id: config.publisher_id,
        api_provider: config.api_provider,
        api_mode: config.api_mode,
        ping_url: config.ping_url,
        post_url: config.post_url,
        http_method: config.http_method,
        notes: config.notes,
        custom_fields: config.custom_fields,
        trackdrive_number_id: config.trackdrive_number_id,
        trackdrive_number: config.trackdrive_number,
        assigned_to: config.assigned_to,
        buyer: config.buyer || null,
        category: config.category || null,
        sub_name: config.sub_name || null,
        campaign_section: config.campaign_section || null,
        created_by: user?.id,
        is_active: false,
      });
      toast({ title: "Success", description: `Duplicated as "${config.name} (Copy)"` });
      invalidateApiConfigs();
    } catch (error) {
      console.error("Error duplicating:", error);
      toast({ title: "Error", description: "Failed to duplicate API configuration", variant: "destructive" });
    }
  }, [user?.id, invalidateApiConfigs]);

  const toggleActive = useCallback(async (config: any) => {
    try {
      await api.patch(`/api/api-configurations/${config.id}`, { is_active: !config.is_active });
      toast({ title: "Success", description: `API ${!config.is_active ? "activated" : "deactivated"}` });
      invalidateApiConfigs();
    } catch (error) {
      toast({ title: "Error", description: "Failed to update", variant: "destructive" });
    }
  }, [invalidateApiConfigs]);

  const maskApiKey = useCallback((key: string) => {
    if (!key || key.length <= 8) return "••••••••";
    return key.slice(0, 4) + "••••••••" + key.slice(-4);
  }, []);

  const getAssignedAdminName = useCallback((assignedTo: string | null) => {
    if (!assignedTo) return "Unassigned";
    const admin = adminUsers.find(a => a.user_id === assignedTo);
    return admin?.full_name || admin?.email || "Unknown";
  }, [adminUsers]);

  const handleEditClick = useCallback((config: any) => handleOpenDialog(config), [handleOpenDialog]);
  const handleDeleteClick = useCallback((config: any) => {
    snapshotScroll();
    setDeletingConfig(config);
    setIsDeleteDialogOpen(true);
  }, [snapshotScroll]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">API Configurations</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
        <Card className="bg-card/50 border-border">
          <CardContent className="pt-6"><TableSkeleton /></CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">API Configurations</h1>
          <p className="text-muted-foreground">
            {isSuperAdmin ? "Manage API integrations and assign them to admins" : "View your assigned API configurations"}
          </p>
        </div>
        {(isSuperAdmin || !!user) && (
          <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) handleCloseDialog(); else setIsDialogOpen(true); }}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()} className="gap-2">
                <Plus className="h-4 w-4" />
                Add API
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[820px] w-[95vw] max-h-[90vh] overflow-hidden flex flex-col p-4" onCloseAutoFocus={(e) => e.preventDefault()}>
              <DialogHeader className="flex-shrink-0 pb-2">
                <DialogTitle className="text-sm font-semibold">
                  {editingConfig ? "Edit API Configuration" : "Add New API"}
                </DialogTitle>
                <DialogDescription className="text-[11px]">
                  {editingConfig 
                    ? "Update the configuration below."
                    : "Set up any API — just enter a name, method, URL, and you're done."
                  }
                </DialogDescription>
              </DialogHeader>

              {/* Scrollable form region — whole form scrolls as one */}
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-3 mt-1">
                {/* Campaign / Request Mode / URL */}
                <div className="space-y-3">
                {/* Campaign Names — the section this API belongs to (groups APIs on the agent call screen) */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Campaign Names *</Label>
                  <Select value={campaignSection} onValueChange={(val) => {
                    setCampaignSection(val);
                    if (val !== "__custom__") setCampaignSectionCustom("");
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select a campaign" /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      <SelectItem value="__custom__">+ Custom…</SelectItem>
                      {existingCampaignSections.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {campaignSection === "__custom__" && (
                    <Input
                      placeholder="Enter new campaign name (e.g. Auto Insurance)"
                      value={campaignSectionCustom}
                      onChange={(e) => setCampaignSectionCustom(e.target.value)}
                    />
                  )}
                </div>

                {/* Name (3-part) */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Name *</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Select value={namePrefix} onValueChange={(val) => {
                      setNamePrefix(val);
                      const effective = val === "__custom__" ? namePrefixCustom : val;
                      setFormData({ ...formData, name: composeCampaignName(effective, nameCategory, nameCategoryCustom, nameSubname) });
                    }}>
                      <SelectTrigger><SelectValue placeholder="D#" /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        <SelectItem value="__custom__">+ Custom…</SelectItem>
                        {existingPrefixes.map(d => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={nameCategory} onValueChange={(val) => {
                      setNameCategory(val);
                      const customVal = val === "__custom__" ? nameCategoryCustom : "";
                      const effectivePrefix = namePrefix === "__custom__" ? namePrefixCustom : namePrefix;
                      setFormData({ ...formData, name: composeCampaignName(effectivePrefix, val, customVal, nameSubname) });
                    }}>
                      <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        <SelectItem value="__custom__">+ Custom…</SelectItem>
                        {existingCategories.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Sub-name"
                      value={nameSubname}
                      onChange={(e) => {
                        setNameSubname(e.target.value);
                        const effectivePrefix = namePrefix === "__custom__" ? namePrefixCustom : namePrefix;
                        setFormData({ ...formData, name: composeCampaignName(effectivePrefix, nameCategory, nameCategoryCustom, e.target.value) });
                      }}
                    />
                  </div>
                  {namePrefix === "__custom__" && (
                    <Input
                      placeholder="Enter custom prefix (e.g. D247)"
                      value={namePrefixCustom}
                      onChange={(e) => {
                        setNamePrefixCustom(e.target.value);
                        setFormData({ ...formData, name: composeCampaignName(e.target.value, nameCategory, nameCategoryCustom, nameSubname) });
                      }}
                    />
                  )}
                  {nameCategory === "__custom__" && (
                    <Input
                      placeholder="Enter custom category"
                      value={nameCategoryCustom}
                      onChange={(e) => {
                        setNameCategoryCustom(e.target.value);
                        const effectivePrefix = namePrefix === "__custom__" ? namePrefixCustom : namePrefix;
                        setFormData({ ...formData, name: composeCampaignName(effectivePrefix, nameCategory, e.target.value, nameSubname) });
                      }}
                    />
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    Preview: <span className="font-medium text-foreground">{formData.name || "—"}</span>
                  </p>
                </div>

                {/* Request Mode — segmented control */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Request Mode *</Label>
                  <div className="inline-flex w-full rounded-lg border border-border bg-muted/30 p-0.5">
                    {([
                      { v: "rtb", label: "RTB / Ping", hint: "Legacy single-step with RTB key" },
                      { v: "ping-post", label: "Ping / Post", hint: "Check availability, then submit" },
                      { v: "ping", label: "Ping Only", hint: "One call, returns result directly" },
                    ] as const).map((opt) => (
                      <button
                        key={opt.v}
                        type="button"
                        title={opt.hint}
                        onClick={() => setFormData({ ...formData, api_mode: opt.v })}
                        className={`flex-1 h-8 text-xs font-medium rounded-md transition-colors ${
                          formData.api_mode === opt.v
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {formData.api_mode === "ping-post" && (
                  <div className="flex items-center gap-2">

                      <span className="w-12 text-[10px] font-bold tracking-wider text-emerald-600">PING</span>
                      <div className="flex-1 flex items-center gap-0 rounded-lg border border-border overflow-hidden bg-muted/30">
                        <Select
                          value={formData.http_method}
                          onValueChange={(value: HttpMethod) => setFormData({ ...formData, http_method: value })}
                        >
                          <SelectTrigger className="w-[100px] rounded-none border-0 border-r border-border font-mono font-bold text-sm h-10 focus:ring-0 focus:ring-offset-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(["GET", "POST", "PUT", "PATCH", "DELETE"] as HttpMethod[]).map(m => (
                              <SelectItem key={m} value={m}>
                                <span className={`font-mono font-bold ${
                                  m === "GET" ? "text-emerald-500" : m === "POST" ? "text-blue-500" : m === "PUT" ? "text-amber-500" : m === "PATCH" ? "text-orange-500" : "text-red-500"
                                }`}>{m}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="url"
                          placeholder="https://api.example.com/ping"
                          value={formData.ping_url}
                          onChange={(e) => setFormData({ ...formData, ping_url: e.target.value })}
                          className="flex-1 rounded-none border-0 h-10 focus-visible:ring-0 focus-visible:ring-offset-0"
                        />
                        <Button
                          type="button"
                          onClick={handleTestApi}
                          disabled={isTesting || isSaving}
                          className="rounded-none h-10 px-4 gap-2"
                        >
                          {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          Send
                        </Button>
                      </div>
                    </div>
                  )}
                {formData.api_mode !== "ping-post" && (
                  <>

                    <div className="flex items-center gap-0 rounded-lg border border-border overflow-hidden bg-muted/30">
                      <Select
                        value={formData.http_method}
                        onValueChange={(value: HttpMethod) => setFormData({ ...formData, http_method: value })}
                      >
                        <SelectTrigger className="w-[100px] rounded-none border-0 border-r border-border font-mono font-bold text-sm h-10 focus:ring-0 focus:ring-offset-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(["GET", "POST", "PUT", "PATCH", "DELETE"] as HttpMethod[]).map(m => (
                            <SelectItem key={m} value={m}>
                              <span className={`font-mono font-bold ${
                                m === "GET" ? "text-emerald-500" : m === "POST" ? "text-blue-500" : m === "PUT" ? "text-amber-500" : m === "PATCH" ? "text-orange-500" : "text-red-500"
                              }`}>{m}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="url"
                        placeholder="https://api.example.com/endpoint"
                        value={formData.ping_url}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (formData.api_mode === "rtb" && raw.includes("?")) {
                            try {
                              const u = new URL(raw.trim());
                              if (u.search) {
                                const cleanUrl = `${u.origin}${u.pathname}`;
                                const next = [...formData.custom_fields];
                                const mirror: Partial<FormData> = {};
                                u.searchParams.forEach((value, key) => {
                                  const idx = next.findIndex((f) => f.key === key);
                                  if (idx >= 0) {
                                    next[idx] = { ...next[idx], value, enabled: true };
                                  } else {
                                    next.push({ key, value, enabled: true });
                                  }
                                  if (key === "trackdrive_number") mirror.trackdrive_number = value;
                                  if (key === "trackdrive_number_id") mirror.trackdrive_number_id = value;
                                });
                                setFormData({ ...formData, ...mirror, ping_url: cleanUrl, custom_fields: next });
                                return;
                              }
                            } catch {
                              /* fall through */
                            }
                          }
                          setFormData({ ...formData, ping_url: raw });
                        }}
                        className="flex-1 rounded-none border-0 h-10 focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                      <Button
                        type="button"
                        onClick={handleTestApi}
                        disabled={isTesting || isSaving}
                        className="rounded-none h-10 px-4 gap-2"
                      >
                        {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Send
                      </Button>
                    </div>
                    {formData.api_mode === "rtb" && (
                      <p className="text-[10px] text-muted-foreground pl-1">
                        Tip: paste a full URL with <code className="px-1 rounded bg-muted">?key=value</code> params — they'll auto-fill into Parameters below.
                      </p>
                    )}
                    </>
                )}
                {formData.api_mode === "ping-post" && (
                    <div className="flex items-center gap-2">

                      <span className="w-12 text-[10px] font-bold tracking-wider text-blue-600">POST</span>
                      <div className="flex-1 flex items-center gap-0 rounded-lg border border-border overflow-hidden bg-muted/30">
                        <span className="w-[100px] flex items-center justify-center border-r border-border font-mono font-bold text-sm h-10 text-blue-500">POST</span>
                        <Input
                          type="url"
                          placeholder="https://api.example.com/post"
                          value={formData.post_url}
                          onChange={(e) => setFormData({ ...formData, post_url: e.target.value })}
                          className="flex-1 rounded-none border-0 h-10 focus-visible:ring-0 focus-visible:ring-offset-0"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setFormData({ ...formData, post_url: formData.ping_url })}
                          disabled={!formData.ping_url}
                          className="rounded-none h-10 px-3 text-[11px] border-0 border-l border-border"
                          title="Copy Ping URL to Post URL"
                        >
                          Same as Ping
                        </Button>
                      </div>
                    </div>
                )}

              </div>

              {/* Body — tabs + meta (ordered) */}
              <div className="flex flex-col gap-3">
                {/* Meta fields (order 2 — below the request panel) */}
                <div className="flex flex-col gap-3 order-2">
                {/* Notes */}
                <div className="space-y-1.5">
                  <Label htmlFor="notes" className="flex items-center gap-1.5 text-xs">
                    <MessageSquare className="h-3 w-3" />
                    Agent Notes / Instructions
                  </Label>
                  <Textarea
                    id="notes"
                    placeholder="e.g., HOO: M-F 9 AM - 6 PM EST, Cap: 10 raw calls"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="min-h-[60px]"
                  />
                  <p className="text-[10px] text-muted-foreground">Shown to agents when they view results</p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="is_active" className="text-xs">Active</Label>
                    <p className="text-[10px] text-muted-foreground">Inactive APIs won't appear for agents</p>
                  </div>
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                </div>

                  {isSuperAdmin && (
                    <>
                {/* Assign to Admin — super admin only */}
                {isSuperAdmin && (
                  <div className="space-y-1.5">
                    <Label htmlFor="assigned_to" className="text-xs">Assign to Admin</Label>
                    <Select
                      value={formData.assigned_to || "unassigned"}
                      onValueChange={(value) => setFormData({ ...formData, assigned_to: value === "unassigned" ? "" : value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select an admin (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">
                          <span className="text-muted-foreground">Unassigned</span>
                        </SelectItem>
                        {adminUsers.map((admin) => (
                          <SelectItem key={admin.user_id} value={admin.user_id}>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              {admin.full_name || admin.email}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">Their agents will be able to use this API</p>
                  </div>
                )}
                    </>
                  )}
                {/* Assign to specific Agents (optional, scoped to admin) */}
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <UserCheck className="h-3 w-3" />
                    Assign to Agents
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-between h-9 font-normal"
                        disabled={eligibleAgents.length === 0}
                      >
                        <span className="text-xs">
                          {formData.assigned_agents.length === 0
                            ? eligibleAgents.length === 0
                              ? "No agents available for this admin"
                              : "All agents (default)"
                            : `${formData.assigned_agents.length} agent${formData.assigned_agents.length === 1 ? "" : "s"} selected`}
                        </span>
                        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <div className="max-h-60 overflow-y-auto p-1">
                        {eligibleAgents.length === 0 ? (
                          <div className="px-2 py-3 text-xs text-muted-foreground text-center">No agents found.</div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => setFormData({ ...formData, assigned_agents: [] })}
                              className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent flex items-center gap-2"
                            >
                              <Checkbox checked={formData.assigned_agents.length === 0} className="h-3.5 w-3.5 pointer-events-none" />
                              <span className="text-muted-foreground italic">All agents (clear)</span>
                            </button>
                            {eligibleAgents.map((agent) => {
                              const checked = formData.assigned_agents.includes(agent.user_id);
                              return (
                                <button
                                  type="button"
                                  key={agent.user_id}
                                  onClick={() => {
                                    const next = checked
                                      ? formData.assigned_agents.filter((id) => id !== agent.user_id)
                                      : [...formData.assigned_agents, agent.user_id];
                                    setFormData({ ...formData, assigned_agents: next });
                                  }}
                                  className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent flex items-center gap-2"
                                >
                                  <Checkbox checked={checked} className="h-3.5 w-3.5 pointer-events-none" />
                                  <User className="h-3 w-3 text-muted-foreground" />
                                  <span className="truncate">{agent.full_name || agent.email}</span>
                                </button>
                              );
                            })}
                          </>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <p className="text-[10px] text-muted-foreground">
                    Leave empty to allow all agents under this admin. Select specific agents to restrict access.
                  </p>
                </div>
                </div>

                {/* Request panel — Postman-style tabs (order 1) */}
                <div className="flex flex-col order-1 border border-border rounded-lg overflow-hidden">
                  <Tabs defaultValue="params" className="flex flex-col">
                    <TabsList className="grid w-full grid-cols-4 rounded-none border-b border-border bg-muted/40 h-9">
                      <TabsTrigger value="params" className="text-xs">Params</TabsTrigger>
                      <TabsTrigger value="mapping" className="text-xs">Mapping</TabsTrigger>
                      <TabsTrigger value="body" className="text-xs">Body</TabsTrigger>
                      <TabsTrigger value="response" className="text-xs">Response</TabsTrigger>
                    </TabsList>
                    <TabsContent value="params" className="p-3 mt-0 data-[state=inactive]:hidden">
                {/* Key-Value rows with checkboxes */}
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs">
                    <Key className="h-3 w-3" />
                    Parameters
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-0.5 px-1 py-px rounded bg-blue-500/10 text-blue-600 text-[9px] font-medium">Form</span> = auto-filled from lead · <span className="inline-flex items-center gap-0.5 px-1 py-px rounded bg-purple-500/10 text-purple-600 text-[9px] font-medium">Agent</span> = filled at runtime · <span className="inline-flex items-center gap-0.5 px-1 py-px rounded bg-muted text-muted-foreground text-[9px] font-medium">Static</span> = sent as-is
                  </p>
                  {formData.api_mode === "ping-post" && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-[10px] text-amber-900 space-y-1">
                      <p>
                        Toggle <span className="font-semibold">Ping(P)</span> / <span className="font-semibold">Post(S)</span> per row to choose which step each field is sent in.
                      </p>
                      <p>
                        <span className="font-semibold">Tip:</span> To send only the ping token in POST, add a row with key <code className="px-1 bg-amber-100 rounded">token</code>, value <code className="px-1 bg-amber-100 rounded">{"{{token}}"}</code>, and check only <span className="font-semibold">S</span>. POST body becomes <code className="px-1 bg-amber-100 rounded">{'{ "token": "<ping token>" }'}</code> — no <code>call_token</code>.
                      </p>
                    </div>
                  )}
                  {/* Header row */}
                  {formData.custom_fields.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                      <span className="w-5"></span>
                      <span className="flex-1">Key</span>
                      <span className="flex-1">Value</span>
                      <span className="w-12 text-center">Type</span>
                      {formData.api_mode === "ping-post" && (
                        <span className="w-20 text-center">Ping(P) / Post(S)</span>
                      )}
                      <span className="w-8"></span>
                      <span className="w-8"></span>
                    </div>
                  )}
                  {formData.custom_fields.map((field, index) => (
                    <div key={index} className={`flex items-center gap-1.5 ${field.enabled === false ? "opacity-40" : ""}`}>
                      <Checkbox
                        checked={field.enabled !== false}
                        onCheckedChange={(checked) => {
                          const updated = [...formData.custom_fields];
                          updated[index] = { ...updated[index], enabled: !!checked };
                          setFormData({ ...formData, custom_fields: updated });
                        }}
                        className="h-3.5 w-3.5"
                      />
                      <Input
                        placeholder="Key"
                        value={field.key}
                        onChange={(e) => {
                          const updated = [...formData.custom_fields];
                          updated[index] = { ...updated[index], key: e.target.value };
                          setFormData({ ...formData, custom_fields: updated });
                        }}
                        className="flex-1 h-7 text-xs"
                      />
                      <Input
                        placeholder={field.ask_agent ? "Filled by agent" : "Value"}
                        value={field.ask_agent ? "" : field.value}
                        onChange={(e) => {
                          const updated = [...formData.custom_fields];
                          updated[index] = { ...updated[index], value: e.target.value };
                          setFormData({ ...formData, custom_fields: updated });
                        }}
                        className={`flex-1 h-7 text-xs ${field.ask_agent ? "bg-muted/50 text-muted-foreground italic" : ""}`}
                        disabled={field.ask_agent}
                      />
                      {/* Type badge */}
                      <span className={`flex-shrink-0 w-12 text-center inline-flex items-center justify-center px-1.5 py-px rounded text-[9px] font-medium ${
                        field.ask_agent
                          ? "bg-purple-500/10 text-purple-600"
                          : field.value && field.value.includes("{{")
                            ? "bg-blue-500/10 text-blue-600"
                            : "bg-muted text-muted-foreground"
                      }`}>
                        {field.ask_agent ? "Agent" : field.value && field.value.includes("{{") ? "Form" : "Static"}
                      </span>
                      {formData.api_mode === "ping-post" && (
                        <div className="flex-shrink-0 w-20 flex items-center justify-center gap-2">
                          <label className="flex items-center gap-0.5 cursor-pointer" title="Send in Ping step">
                            <Checkbox
                              checked={field.stages?.ping !== false}
                              onCheckedChange={(checked) => {
                                const updated = [...formData.custom_fields];
                                const prev = updated[index].stages || { ping: true, post: true };
                                updated[index] = { ...updated[index], stages: { ...prev, ping: !!checked } };
                                setFormData({ ...formData, custom_fields: updated });
                              }}
                              className="h-3 w-3"
                            />
                            <span className="text-[9px] font-medium text-muted-foreground">P</span>
                          </label>
                          <label className="flex items-center gap-0.5 cursor-pointer" title="Send in Post step">
                            <Checkbox
                              checked={field.stages?.post !== false}
                              onCheckedChange={(checked) => {
                                const updated = [...formData.custom_fields];
                                const prev = updated[index].stages || { ping: true, post: true };
                                updated[index] = { ...updated[index], stages: { ...prev, post: !!checked } };
                                setFormData({ ...formData, custom_fields: updated });
                              }}
                              className="h-3 w-3"
                            />
                            <span className="text-[9px] font-medium text-muted-foreground">S</span>
                          </label>
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={`flex-shrink-0 h-7 w-7 ${field.ask_agent ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                        onClick={() => {
                          const updated = [...formData.custom_fields];
                          updated[index] = { ...updated[index], ask_agent: !updated[index].ask_agent, value: !updated[index].ask_agent ? "" : updated[index].value };
                          setFormData({ ...formData, custom_fields: updated });
                        }}
                        title={field.ask_agent ? "Agent fills this field" : "Click to require agent input"}
                      >
                        <UserCheck className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive flex-shrink-0 h-7 w-7"
                        onClick={() => {
                          const updated = formData.custom_fields.filter((_, i) => i !== index);
                          setFormData({ ...formData, custom_fields: updated });
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => setFormData({ ...formData, custom_fields: [...formData.custom_fields, { key: "", value: "", enabled: true, stages: { ping: true, post: false } }] })}
                  >
                    <Plus className="h-3 w-3" />
                    Add Field
                  </Button>
                  <div className="flex items-center gap-1.5 flex-wrap mt-2">
                    <span className="text-[10px] text-muted-foreground mr-1">Template vars:</span>
                    {[
                      "{{phone}}",
                      "{{state}}",
                      "{{zip}}",
                      ...(formData.api_mode === "ping-post" ? ["{{token}}", "{{lead_id}}", "{{call_token}}"] : []),

                    ].map((v) => (
                      <button
                        key={v}
                        type="button"
                        className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
                        onClick={() => {
                          navigator.clipboard.writeText(v);
                          toast({ title: "Copied!", description: `${v} copied to clipboard` });
                        }}
                      >
                        {v}
                      </button>
                    ))}
                  </div>

                  {/* Phone number format — how the phone token / caller ID is sent */}
                  <div className="space-y-1.5 mt-3 rounded-md border border-border p-2.5">
                    <Label className="text-xs font-medium">Phone number format (how we send phone / caller ID)</Label>
                    <Select
                      value={formData.custom_fields.find(f => f.key === "_phone_format")?.value || "digits"}
                      onValueChange={(value) => {
                        const filtered = formData.custom_fields.filter(f => f.key !== "_phone_format");
                        setFormData({ ...formData, custom_fields: [...filtered, { key: "_phone_format", value, enabled: true }] });
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="digits">Digits only — 5551234567 (most common)</SelectItem>
                        <SelectItem value="e164">+1 format — +15551234567 (Retreaver RTB, Twilio-style)</SelectItem>
                        <SelectItem value="us1">1 + digits — 15551234567</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">Applied to the <code className="font-mono">{"{{phone}}"}</code> token (and caller ID) before the request is sent.</p>
                  </div>
                </div>
                    </TabsContent>
                    <TabsContent value="mapping" className="p-3 mt-0 data-[state=inactive]:hidden">
                      {formData.api_mode === "ping-post" ? (
                        <>
                {/* Ping ID Mapping (only for ping-post) */}
                {formData.api_mode === "ping-post" && (
                  <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50/40 p-2.5">
                    <Label className="text-xs font-semibold text-blue-900">Ping ID Mapping (optional)</Label>
                    <p className="text-[10px] text-muted-foreground">
                      Tell the system which field in the Ping response holds the Ping ID, and what field name to send it under in the Post request.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="ping_id_source_key" className="text-[11px]">Extract from Ping response key</Label>
                        <Input
                          id="ping_id_source_key"
                          placeholder="e.g. ping_id, try_all_buyers.ping_id, buyers.0.ping_id"
                          value={formData.ping_id_source_key}
                          onChange={(e) => setFormData({ ...formData, ping_id_source_key: e.target.value })}
                          className="h-7 text-xs"
                        />
                        <p className="text-[10px] text-muted-foreground">Dot-notation supported. Leave blank to auto-detect.</p>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="ping_id_post_field" className="text-[11px]">Send in Post as field name</Label>
                        <Input
                          id="ping_id_post_field"
                          placeholder="e.g. ping_id, lead_id, token"
                          value={formData.ping_id_post_field}
                          onChange={(e) => setFormData({ ...formData, ping_id_post_field: e.target.value })}
                          className="h-7 text-xs"
                        />
                        <p className="text-[10px] text-muted-foreground">Adds this key to the Post body. Or use <code className="px-1 bg-blue-100 rounded">{"{{ping_id}}"}</code> in any custom field value.</p>
                      </div>
                    </div>
                  </div>
                )}
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">Ping ID Mapping is only available in <span className="font-medium text-foreground">Ping / Post</span> mode.</p>
                      )}
                    </TabsContent>
                    <TabsContent value="body" className="p-3 mt-0 data-[state=inactive]:hidden">
                      {["POST", "PUT", "PATCH"].includes(formData.http_method) ? (
                        <>
                {/* Body Format (for POST/PUT/PATCH) */}
                {["POST", "PUT", "PATCH"].includes(formData.http_method) && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Body Format</Label>
                    <Select
                      value={formData.custom_fields.find(f => f.key === "_body_format")?.value || "json"}
                      onValueChange={(value) => {
                        const filtered = formData.custom_fields.filter(f => f.key !== "_body_format");
                        setFormData({ ...formData, custom_fields: [...filtered, { key: "_body_format", value, enabled: true }] });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="json">JSON (application/json)</SelectItem>
                        <SelectItem value="form">Form Data (x-www-form-urlencoded)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">How the request body is encoded</p>
                  </div>
                )}
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground"><span className="font-mono font-semibold">{formData.http_method}</span> requests don't have a body.</p>
                      )}
                    </TabsContent>
                    <TabsContent value="response" className="p-3 mt-0 data-[state=inactive]:hidden">
                      {testResult ? (
                  <div className="border border-border rounded-md overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b border-border">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-mono ${
                          testResult.success 
                            ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" 
                            : "bg-red-500/15 text-red-600 border-red-500/30"
                        }`}>
                          {testResult.success ? "200 OK" : "ERROR"}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{testResult.message}</span>
                      </div>
                      <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] text-muted-foreground" onClick={() => setTestResult(null)}>
                        Clear
                      </Button>
                    </div>
                    <pre className="text-[10px] font-mono p-3 overflow-auto max-h-[180px] bg-background leading-relaxed">
                      {JSON.stringify(testResult.details, null, 2)}
                    </pre>
                  </div>
                      ) : (

                        <div className="flex items-center justify-center h-full">
                          <p className="text-xs text-muted-foreground">Click <span className="font-medium text-foreground">Send</span> to see the response.</p>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0 flex-shrink-0">
                <Button variant="outline" onClick={handleCloseDialog}>Cancel</Button>
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingConfig ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            {isSuperAdmin ? "All API Configurations" : "Your Assigned APIs"}
          </CardTitle>
          <CardDescription>
            {isSuperAdmin ? "APIs assigned to admins for their agents" : "APIs available for your agents"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!configs || configs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {isSuperAdmin 
                ? "No API configurations yet. Click \"Add API\" to create one."
                : "No APIs assigned. Contact a super admin."
              }
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead>Name</TableHead>
                    <TableHead>Method / Mode</TableHead>
                    <TableHead>Endpoint</TableHead>
                    {isSuperAdmin && <TableHead>Assigned To</TableHead>}
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {configs.map((config) => (
                    <ConfigTableRow
                      key={config.id}
                      config={config}
                      isSuperAdmin={isSuperAdmin}
                      canManage={isSuperAdmin || config.assigned_to === user?.id}
                      getAssignedAdminName={getAssignedAdminName}
                      maskApiKey={maskApiKey}
                      onEdit={handleEditClick}
                      onDelete={handleDeleteClick}
                      onDuplicate={handleDuplicate}
                      onToggle={toggleActive}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!open) scheduleRestoreScroll();
          setIsDeleteDialogOpen(open);
        }}
      >
        <AlertDialogContent onCloseAutoFocus={(e) => e.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deletingConfig?.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
