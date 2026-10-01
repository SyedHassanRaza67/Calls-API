import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Sheet as SheetIcon,
  Loader2,
  PlugZap,
  RefreshCw,
  History,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";

type Mode = "apps_script" | "service_account";

interface Override {
  spreadsheet_id?: string;
  webapp_url?: string;
  tab_name?: string;
}

interface SheetsSettings {
  enabled: boolean;
  mode: Mode;
  webapp_url: string;
  spreadsheet_id: string;
  client_email: string;
  has_private_key: boolean;
  timezone: string;
  sync_from: string;
  admin_overrides: Record<string, Override>;
}

interface SyncStatus {
  running: boolean;
  last_run_at: string | null;
  last_success_at: string | null;
  last_synced_count: number;
  errors: { tab: string; dest: string; error: string }[];
}

interface Company {
  user_id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  role: string;
  tab_name: string;
  dest: string;
  override: Override | null;
}

interface SheetsResponse {
  settings: SheetsSettings;
  status: SyncStatus;
  pending: number;
  companies: Company[];
  apps_script: string;
}

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "UTC",
  "Asia/Karachi",
];

const sheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
        {n}
      </div>
      <div className="space-y-2 pt-0.5 min-w-0 flex-1">
        <div className="font-medium">{title}</div>
        <div className="text-sm text-muted-foreground space-y-2">{children}</div>
      </div>
    </div>
  );
}

export function GoogleSheetsSettings() {
  const [data, setData] = useState<SheetsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Connection form
  const [mode, setMode] = useState<Mode>("apps_script");
  const [webAppUrl, setWebAppUrl] = useState("");
  const [spreadsheet, setSpreadsheet] = useState("");
  const [keyJson, setKeyJson] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  // Per-company routing form
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [backfillFrom, setBackfillFrom] = useState("");

  const load = async () => {
    try {
      const res = await api.get<SheetsResponse>("/api/google-sheets");
      setData(res);
      setMode(res.settings.mode);
      setWebAppUrl(res.settings.webapp_url);
      setSpreadsheet(res.settings.spreadsheet_id);
      setTimezone(res.settings.timezone);
      setOverrides(res.settings.admin_overrides || {});
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load Google Sheets settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Request failed", { duration: 10000 });
    } finally {
      setBusy(null);
    }
  };

  const copyScript = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.apps_script);
      setCopied(true);
      toast.success("Script copied — paste it into Apps Script");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Could not copy — select the script text and copy it manually");
    }
  };

  const saveConnection = () =>
    run("save", async () => {
      await api.put(
        "/api/google-sheets",
        mode === "apps_script"
          ? { mode, webapp_url: webAppUrl, timezone }
          : {
              mode,
              spreadsheet_id: spreadsheet,
              timezone,
              ...(keyJson.trim() ? { service_account_json: keyJson } : {}),
            }
      );
      setKeyJson("");
      toast.success("Connection saved — now click Test connection");
      await load();
    });

  const toggleEnabled = (enabled: boolean) =>
    run("toggle", async () => {
      await api.put("/api/google-sheets", { enabled });
      toast.success(enabled ? "Google Sheets export turned on" : "Google Sheets export turned off");
      await load();
    });

  const testConnection = () =>
    run("test", async () => {
      const res = await api.post<{ ok: boolean; results: { dest: string; ok: boolean; title?: string; error?: string }[] }>(
        "/api/google-sheets/test"
      );
      for (const r of res.results) {
        if (r.ok) toast.success(`Connected to "${r.title}"`);
        else toast.error(r.error || "Could not reach the sheet", { duration: 12000 });
      }
    });

  const syncNow = () =>
    run("sync", async () => {
      const res = await api.post<{ synced: number; status: SyncStatus; pending: number }>("/api/google-sheets/sync");
      if (res.status.errors.length) toast.error(res.status.errors[0].error, { duration: 10000 });
      else toast.success(`Exported ${res.synced} lead${res.synced === 1 ? "" : "s"}`);
      await load();
    });

  const saveOverrides = () =>
    run("overrides", async () => {
      await api.put("/api/google-sheets", { admin_overrides: overrides });
      toast.success("Company sheets saved");
      await load();
    });

  const backfill = () =>
    run("backfill", async () => {
      const res = await api.post<{ pending: number }>("/api/google-sheets/backfill", backfillFrom ? { from: backfillFrom } : {});
      toast.success(`${res.pending} older lead${res.pending === 1 ? "" : "s"} queued for export`);
      await load();
    });

  const setOverride = (adminId: string, field: keyof Override, value: string) =>
    setOverrides((prev) => ({ ...prev, [adminId]: { ...prev[adminId], [field]: value } }));

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) return null;

  const { settings, status, pending, companies } = data;
  const connected =
    settings.mode === "apps_script"
      ? !!settings.webapp_url
      : !!settings.spreadsheet_id && !!settings.client_email && settings.has_private_key;
  const hasErrors = status.errors.length > 0;
  // The saved mode drives routing; the tab selector only edits the form.
  const overrideField: keyof Override = settings.mode === "apps_script" ? "webapp_url" : "spreadsheet_id";

  return (
    <div className="space-y-6">
      {/* Status / on-off */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <SheetIcon className="h-5 w-5 text-green-600" />
                Google Sheets Export
                {settings.enabled ? (
                  hasErrors ? <Badge variant="destructive">Error</Badge> : <Badge className="bg-green-600 hover:bg-green-600">On</Badge>
                ) : (
                  <Badge variant="secondary">Off</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Every lead submission is copied to Google Sheets automatically. Each company (e.g. TF Communication) gets its own sheet tab.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="gs-enabled" className="text-sm">Export enabled</Label>
              <Switch
                id="gs-enabled"
                checked={settings.enabled}
                disabled={!connected || busy !== null}
                onCheckedChange={toggleEnabled}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Waiting to export</div>
              <div className="text-2xl font-semibold">{settings.enabled ? pending : "—"}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Last successful sync</div>
              <div className="text-sm font-medium mt-1">{fmt(status.last_success_at)}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Exporting since</div>
              <div className="text-sm font-medium mt-1">
                {settings.enabled ? (new Date(settings.sync_from).getTime() === 0 ? "All history" : fmt(settings.sync_from)) : "—"}
              </div>
            </div>
          </div>

          {settings.enabled && hasErrors && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="space-y-1">
                {status.errors.map((e, i) => (
                  <div key={i}>
                    <span className="font-medium">{e.tab === "*" ? "Sync" : `Tab "${e.tab}"`}:</span> {e.error}
                  </div>
                ))}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={testConnection} disabled={!connected || busy !== null}>
              {busy === "test" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlugZap className="h-4 w-4 mr-2" />}
              Test connection
            </Button>
            <Button variant="outline" onClick={syncNow} disabled={!settings.enabled || busy !== null}>
              {busy === "sync" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Sync now
            </Button>
            {settings.mode === "service_account" && settings.spreadsheet_id && (
              <Button variant="ghost" asChild>
                <a href={sheetUrl(settings.spreadsheet_id)} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" /> Open spreadsheet
                </a>
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            New leads are exported automatically every 30 seconds once they finish (ping/post leads are written after the post step).
          </p>
        </CardContent>
      </Card>

      {/* Connection */}
      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
          <CardDescription>Connect the Google Sheet the leads should go to.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList>
              <TabsTrigger value="apps_script">Apps Script (easy)</TabsTrigger>
              <TabsTrigger value="service_account">Service account (advanced)</TabsTrigger>
            </TabsList>

            {/* ── Apps Script ─────────────────────────────────────── */}
            <TabsContent value="apps_script" className="space-y-6 pt-4">
              <Step n={1} title="Open your Google Sheet's Apps Script">
                <p>
                  Create (or open) the Google Sheet you want the leads in, then click <b>Extensions → Apps Script</b>. A code editor opens in a new tab.
                </p>
              </Step>

              <Step n={2} title="Paste this script">
                <p>
                  Delete everything in the editor (the empty <code>myFunction</code>), paste the script below, and click the <b>Save</b> 💾 icon. The script already contains your private secret code, so don't share it.
                </p>
                <div className="relative">
                  <Button size="sm" className="absolute right-2 top-2 z-10" onClick={copyScript}>
                    {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                    {copied ? "Copied" : "Copy script"}
                  </Button>
                  <pre className="max-h-64 overflow-auto rounded-lg border bg-muted p-4 pr-32 text-xs leading-relaxed text-foreground">
                    {data.apps_script}
                  </pre>
                </div>
              </Step>

              <Step n={3} title="Deploy it as a Web app">
                <ol className="list-disc pl-5 space-y-1">
                  <li>Click the blue <b>Deploy</b> button (top right) → <b>New deployment</b>.</li>
                  <li>Click the ⚙️ gear next to "Select type" → choose <b>Web app</b>.</li>
                  <li><b>Execute as:</b> <i>Me</i> · <b>Who has access:</b> <i>Anyone</i> → click <b>Deploy</b>.</li>
                  <li>
                    Google asks you to authorize: <b>Authorize access</b> → choose your account → <b>Advanced</b> → <b>Go to (project name) (unsafe)</b> → <b>Allow</b>. This is normal for your own scripts.
                  </li>
                  <li>Copy the <b>Web app URL</b> (it ends with <code>/exec</code>).</li>
                </ol>
              </Step>

              <Step n={4} title="Paste the Web app URL here and save">
                <Input
                  value={webAppUrl}
                  onChange={(e) => setWebAppUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/…/exec"
                />
              </Step>

              <Step n={5} title="Test, then turn it on">
                <p>
                  Click <b>Save connection</b>, then <b>Test connection</b> at the top. When it says "Connected", switch <b>Export enabled</b> on. Each company's tab appears automatically with its first lead.
                </p>
                <p className="text-xs">
                  Changed the script later? Use <b>Deploy → Manage deployments → ✏️ Edit → Version: New version</b>, so the URL stays the same.
                </p>
              </Step>
            </TabsContent>

            {/* ── Service account ─────────────────────────────────── */}
            <TabsContent value="service_account" className="space-y-5 pt-4">
              <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
                <li>
                  In <a className="underline" href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">Google Cloud Console</a>, enable the <b>Google Sheets API</b>.
                </li>
                <li>Create a <b>Service Account</b>, open it → Keys → Add key → <b>JSON</b>, and paste the downloaded file below.</li>
                <li>Create a Google Sheet and <b>Share</b> it with the service account email as <b>Editor</b>.</li>
                <li>Paste the sheet's URL below, save, click <b>Test connection</b>, then turn the export on.</li>
              </ol>

              <div className="space-y-2">
                <Label>Spreadsheet URL or ID</Label>
                <Input
                  value={spreadsheet}
                  onChange={(e) => setSpreadsheet(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/…/edit"
                />
              </div>

              <div className="space-y-2">
                <Label>Service account key (JSON)</Label>
                {settings.client_email && (
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Connected as <code className="rounded bg-muted px-1.5 py-0.5">{settings.client_email}</code>
                  </div>
                )}
                <Textarea
                  value={keyJson}
                  onChange={(e) => setKeyJson(e.target.value)}
                  rows={5}
                  className="font-mono text-xs"
                  placeholder={settings.has_private_key ? "Key saved. Paste a new JSON key only to replace it." : '{ "type": "service_account", "client_email": "…", "private_key": "…" }'}
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="space-y-2 max-w-xs">
            <Label>Timestamp timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES]).map((tz) => (
                  <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={saveConnection} disabled={busy !== null}>
              {busy === "save" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save connection
            </Button>
            {mode !== settings.mode && (
              <span className="text-xs text-muted-foreground">
                Saving switches the export to {mode === "apps_script" ? "Apps Script" : "the service account"}.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Per-company sheets */}
      <Card>
        <CardHeader>
          <CardTitle>Company sheets</CardTitle>
          <CardDescription>
            Leads from each company's admin and agents go to that company's own tab. Optionally rename a tab, or send a company to a completely separate Google Sheet
            {settings.mode === "apps_script"
              ? " (install the same script in that sheet and paste its Web app URL)."
              : " (share it with the service account too)."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead className="min-w-[200px]">Tab name</TableHead>
                  <TableHead className="min-w-[260px]">
                    {settings.mode === "apps_script" ? "Separate sheet Web app URL (optional)" : "Separate spreadsheet (optional)"}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((c) => (
                  <TableRow key={c.user_id}>
                    <TableCell>
                      <div className="font-medium">
                        {c.company || c.full_name || c.email}
                        {c.role === "super_admin" && <Badge variant="outline" className="ml-2">Super Admin</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">{c.email}</div>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={overrides[c.user_id]?.tab_name ?? ""}
                        onChange={(e) => setOverride(c.user_id, "tab_name", e.target.value)}
                        placeholder={c.company || c.email}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={overrides[c.user_id]?.[overrideField] ?? ""}
                        onChange={(e) => setOverride(c.user_id, overrideField, e.target.value)}
                        placeholder="Same as main sheet"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button onClick={saveOverrides} disabled={busy !== null}>
            {busy === "overrides" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save company sheets
          </Button>
        </CardContent>
      </Card>

      {/* Backfill */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" /> Export older leads
          </CardTitle>
          <CardDescription>
            Turning the export on only sends leads submitted from that moment. Use this to also send earlier leads. Leads already in the sheet are never written twice.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label>From date (leave empty for all history)</Label>
            <Input type="date" value={backfillFrom} onChange={(e) => setBackfillFrom(e.target.value)} className="w-48" />
          </div>
          <Button variant="outline" onClick={backfill} disabled={!settings.enabled || busy !== null}>
            {busy === "backfill" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Export older leads
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
