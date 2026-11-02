import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { ShieldCheck, Monitor, Users, Wifi, AlertTriangle, LogOut, Loader2, RefreshCw, Search } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Session {
  id: string;
  user_id: string;
  ip: string | null;
  last_ip: string | null;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  legacy: boolean;
  new_ip: boolean;
  email: string;
  full_name: string | null;
  company: string | null;
  roles: string[];
}

interface LoginEvent {
  id: string;
  user_id: string | null;
  email: string | null;
  ip: string | null;
  user_agent: string | null;
  success: boolean;
  reason: string | null;
  created_at: string;
  full_name: string | null;
  roles: string[];
}

type PendingAction =
  | { kind: "session"; session: Session }
  | { kind: "user"; userId: string; label: string; count: number };

/** A session seen within this window counts as "online now". */
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
/** Failed attempts from one IP at or above this count get flagged. */
const FAILED_ATTEMPT_ALERT = 5;

const FAILURE_LABELS: Record<string, string> = {
  wrong_password: "Wrong password",
  unknown_email: "Unknown email",
  account_pending: "Account pending",
  account_rejected: "Account rejected",
};

function describeDevice(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iPod/.test(ua)
        ? "iOS"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /CrOS/.test(ua)
            ? "ChromeOS"
            : /Linux/.test(ua)
              ? "Linux"
              : "Unknown OS";
  return `${browser} on ${os}`;
}

function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function roleLabel(roles: string[]): string {
  if (roles.includes("super_admin")) return "Super Admin";
  if (roles.includes("admin")) return "Admin";
  if (roles.includes("agent")) return "Agent";
  return "—";
}

export function SecurityLogs() {
  const { isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [eventStatus, setEventStatus] = useState<"all" | "success" | "failed">("all");
  const [eventDays, setEventDays] = useState("7");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [revoking, setRevoking] = useState(false);

  const sessionsQuery = useQuery({
    queryKey: ["security", "sessions"],
    queryFn: () =>
      api.get<{ sessions: Session[]; current_session_id: string | null }>("/api/security/sessions"),
    refetchInterval: 30_000,
  });

  const eventsQuery = useQuery({
    queryKey: ["security", "login-events", eventStatus, eventDays],
    queryFn: () =>
      api.get<LoginEvent[]>(`/api/security/login-events?status=${eventStatus}&days=${eventDays}`),
    refetchInterval: 30_000,
  });

  const sessions = sessionsQuery.data?.sessions ?? [];
  const currentSessionId = sessionsQuery.data?.current_session_id ?? null;
  const events = eventsQuery.data ?? [];
  const needle = search.trim().toLowerCase();

  // Group live sessions by account so a shared login shows its device/IP count.
  const groups = useMemo(() => {
    const byUser = new Map<string, Session[]>();
    for (const s of sessions) {
      const hay = `${s.email} ${s.full_name ?? ""} ${s.company ?? ""} ${s.ip ?? ""} ${s.last_ip ?? ""}`.toLowerCase();
      if (needle && !hay.includes(needle)) continue;
      const list = byUser.get(s.user_id) ?? [];
      list.push(s);
      byUser.set(s.user_id, list);
    }
    return [...byUser.values()]
      .map((list) => ({
        user: list[0],
        sessions: list,
        ips: new Set(list.map((s) => s.last_ip || s.ip).filter(Boolean)).size,
        online: list.filter((s) => Date.now() - new Date(s.last_seen_at).getTime() < ONLINE_WINDOW_MS).length,
        newIp: list.some((s) => s.new_ip),
      }))
      .sort((a, b) => Number(b.newIp) - Number(a.newIp) || b.sessions.length - a.sessions.length);
  }, [sessions, needle]);

  const stats = useMemo(() => {
    const online = sessions.filter((s) => Date.now() - new Date(s.last_seen_at).getTime() < ONLINE_WINDOW_MS).length;
    return {
      devices: sessions.length,
      online,
      accounts: new Set(sessions.map((s) => s.user_id)).size,
      alerts: sessions.filter((s) => s.new_ip).length,
    };
  }, [sessions]);

  const failedByIp = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of events) if (!e.success && e.ip) counts.set(e.ip, (counts.get(e.ip) ?? 0) + 1);
    return counts;
  }, [events]);

  const filteredEvents = useMemo(
    () =>
      needle
        ? events.filter((e) =>
            `${e.email ?? ""} ${e.full_name ?? ""} ${e.ip ?? ""}`.toLowerCase().includes(needle)
          )
        : events,
    [events, needle]
  );

  const confirmRevoke = async () => {
    if (!pending) return;
    setRevoking(true);
    try {
      if (pending.kind === "session") {
        await api.post(`/api/security/sessions/${pending.session.id}/revoke`);
        toast.success("Device logged out");
      } else {
        const res = await api.post<{ revoked: number }>(`/api/security/users/${pending.userId}/revoke-all`);
        toast.success(`Logged out ${res.revoked} device${res.revoked === 1 ? "" : "s"}`);
      }
      await queryClient.invalidateQueries({ queryKey: ["security"] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to log out");
    } finally {
      setRevoking(false);
      setPending(null);
    }
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["security"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Security Logs
          </h1>
          <p className="text-sm text-muted-foreground">
            {isSuperAdmin
              ? "Where every account is logged in right now, and all sign-in attempts."
              : "Where you and your agents are logged in right now, and all sign-in attempts."}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search user, company or IP"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-full sm:w-64"
            />
          </div>
          <Button variant="outline" size="icon" onClick={refresh} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${sessionsQuery.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Monitor} label="Logged-in devices" value={stats.devices} />
        <StatCard icon={Wifi} label="Online now" value={stats.online} hint="active in last 5 min" />
        <StatCard icon={Users} label="Accounts logged in" value={stats.accounts} />
        <StatCard
          icon={AlertTriangle}
          label="New-IP alerts"
          value={stats.alerts}
          tone={stats.alerts > 0 ? "warning" : undefined}
        />
      </div>

      <Tabs defaultValue="sessions">
        <TabsList>
          <TabsTrigger value="sessions">Active Sessions</TabsTrigger>
          <TabsTrigger value="history">Login History</TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="space-y-4">
          {sessionsQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : sessionsQuery.isError ? (
            <p className="text-sm text-destructive py-6">Failed to load sessions.</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No active sessions.</p>
          ) : (
            groups.map((g) => (
              <Card key={g.user.user_id} className={g.newIp ? "border-warning/50" : undefined}>
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <CardTitle className="text-base flex flex-wrap items-center gap-2">
                        <span className="truncate">{g.user.full_name || g.user.email}</span>
                        <Badge variant="secondary">{roleLabel(g.user.roles)}</Badge>
                        {g.newIp && (
                          <Badge variant="outline" className="border-warning text-warning">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            New IP
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="truncate">
                        {g.user.email}
                        {isSuperAdmin && g.user.company ? ` · ${g.user.company}` : ""}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm text-muted-foreground">
                        <strong className="text-foreground">{g.sessions.length}</strong> device
                        {g.sessions.length === 1 ? "" : "s"} · <strong className="text-foreground">{g.ips}</strong> IP
                        {g.ips === 1 ? "" : "s"} · <span className="text-emerald-500">{g.online} online</span>
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setPending({
                            kind: "user",
                            userId: g.user.user_id,
                            label: g.user.full_name || g.user.email,
                            count: g.sessions.length,
                          })
                        }
                      >
                        <LogOut className="h-3.5 w-3.5 mr-1" />
                        Log out all
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>IP address</TableHead>
                        <TableHead>Device</TableHead>
                        <TableHead>Signed in</TableHead>
                        <TableHead>Last active</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.sessions.map((s) => {
                        const online = Date.now() - new Date(s.last_seen_at).getTime() < ONLINE_WINDOW_MS;
                        const ip = s.last_ip || s.ip || "—";
                        return (
                          <TableRow key={s.id}>
                            <TableCell>
                              <span className="inline-flex items-center gap-1.5 text-xs">
                                <span
                                  className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                                />
                                {online ? "Online" : "Idle"}
                              </span>
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {ip}
                              {s.new_ip && (
                                <Badge variant="outline" className="ml-2 border-warning text-warning text-[10px]">
                                  new
                                </Badge>
                              )}
                              {s.ip && s.last_ip && s.ip !== s.last_ip && (
                                <div className="text-[10px] text-muted-foreground">signed in from {s.ip}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-xs" title={s.user_agent ?? ""}>
                              {describeDevice(s.user_agent)}
                              {s.id === currentSessionId && (
                                <Badge className="ml-2 text-[10px]">This device</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {s.legacy ? (
                                <span className="text-muted-foreground">before tracking</span>
                              ) : (
                                new Date(s.created_at).toLocaleString()
                              )}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">{timeAgo(s.last_seen_at)}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setPending({ kind: "session", session: s })}
                              >
                                Log out
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base">Sign-in attempts</CardTitle>
                  <CardDescription>
                    Successful and failed logins. Kept for 90 days. IPs with {FAILED_ATTEMPT_ALERT}+ failures are
                    highlighted.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Select value={eventStatus} onValueChange={(v) => setEventStatus(v as typeof eventStatus)}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="success">Successful</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={eventDays} onValueChange={setEventDays}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Last 24 hours</SelectItem>
                      <SelectItem value="7">Last 7 days</SelectItem>
                      <SelectItem value="30">Last 30 days</SelectItem>
                      <SelectItem value="90">Last 90 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {eventsQuery.isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : filteredEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No sign-in attempts in this period.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead>IP address</TableHead>
                      <TableHead>Device</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEvents.map((e) => {
                      const suspicious = !!e.ip && (failedByIp.get(e.ip) ?? 0) >= FAILED_ATTEMPT_ALERT;
                      return (
                        <TableRow key={e.id} className={suspicious ? "bg-destructive/5" : undefined}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {new Date(e.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="font-medium">{e.full_name || e.email}</div>
                            <div className="text-muted-foreground">
                              {e.full_name ? `${e.email} · ` : ""}
                              {roleLabel(e.roles)}
                            </div>
                          </TableCell>
                          <TableCell>
                            {e.success ? (
                              <Badge variant="outline" className="border-emerald-500 text-emerald-500">
                                Success
                              </Badge>
                            ) : (
                              <Badge variant="destructive">{FAILURE_LABELS[e.reason ?? ""] ?? "Failed"}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {e.ip ?? "—"}
                            {suspicious && (
                              <div className="text-[10px] text-destructive">
                                {failedByIp.get(e.ip!)} failed attempts
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs" title={e.user_agent ?? ""}>
                            {describeDevice(e.user_agent)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!pending} onOpenChange={(open) => !open && !revoking && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.kind === "user" ? `Log out all devices for ${pending.label}?` : "Log out this device?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === "user"
                ? `All ${pending.count} device${pending.count === 1 ? "" : "s"} using this login will be signed out on their next action. If this login is shared by several agents, all of them will need to sign in again.`
                : pending?.kind === "session"
                  ? `The device at ${pending.session.last_ip || pending.session.ip || "unknown IP"} (${describeDevice(pending.session.user_agent)}) will be signed out on its next action.`
                  : ""}
              {" "}If you suspect the password is known to someone else, also reset it from the Users page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmRevoke();
              }}
              disabled={revoking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revoking && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Log out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Monitor;
  label: string;
  value: number;
  hint?: string;
  tone?: "warning";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className={`h-4 w-4 ${tone === "warning" ? "text-warning" : "text-muted-foreground"}`} />
        </div>
        <div className={`text-2xl font-bold mt-1 ${tone === "warning" ? "text-warning" : ""}`}>{value}</div>
        {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
