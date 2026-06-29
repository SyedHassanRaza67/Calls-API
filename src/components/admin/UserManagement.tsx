import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { Label } from "@/components/ui/label";
import { Search, UserPlus, Loader2, Shield, User, Users, Trash2, ChevronDown, ChevronRight, KeyRound, Eye, EyeOff, Copy, Check, Pause, Play, Clock, Building2, Phone, Mail, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";
import { useUsersWithRoles, useInvalidateAdminData } from "@/hooks/useAdminData";
import { Skeleton } from "@/components/ui/skeleton";
import { GlobalPauseCard } from "./GlobalPauseCard";

const getInitials = (name: string | null, email: string | null) => {
  if (name) return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  if (email) return email[0].toUpperCase();
  return "?";
};

const RoleBadge = ({ role }: { role: string }) => {
  if (role === "super_admin") {
    return (
      <Badge className="bg-purple-500/20 text-purple-600 border-purple-500/30">
        <Shield className="h-3 w-3 mr-1" /> Super Admin
      </Badge>
    );
  }
  if (role === "admin") {
    return (
      <Badge className="bg-blue-500/20 text-blue-600 border-blue-500/30">
        <Users className="h-3 w-3 mr-1" /> Admin
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <User className="h-3 w-3 mr-1" /> Agent
    </Badge>
  );
};

export function UserManagement() {
  const { isSuperAdmin, user: currentUser } = useAuth();
  const { users, isLoading } = useUsersWithRoles();
  const { invalidateProfiles, invalidateUserRoles } = useInvalidateAdminData();

  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserLocalPart, setNewUserLocalPart] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState<"agent" | "admin">("agent");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Password reset state
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string; email: string | null } | null>(null);
  const [resetMode, setResetMode] = useState<"generate" | "custom">("generate");
  const [customPassword, setCustomPassword] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [showRevealed, setShowRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  // Pause state
  const [pauseTarget, setPauseTarget] = useState<{ id: string; name: string; pause: boolean } | null>(null);
  const [isPausing, setIsPausing] = useState(false);

  // Pending signup approvals (super_admin only)
  const queryClient = useQueryClient();
  const { data: pendingApprovals = [] } = useQuery<
    Array<{ user_id: string; email: string | null; full_name: string | null; company: string | null; phone: string | null; created_at: string }>
  >({
    queryKey: ["pending-approvals", currentUser?.id],
    queryFn: () => api.get("/api/users/pending"),
    enabled: isSuperAdmin,
  });
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const handleApproval = async (userId: string, status: "approved" | "rejected") => {
    setApprovingId(userId);
    try {
      await api.post(`/api/users/${userId}/approval`, { status });
      toast.success(status === "approved" ? "Account approved" : "Registration rejected");
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      invalidateProfiles();
      invalidateUserRoles();
    } catch (error: any) {
      toast.error(error instanceof ApiError ? error.message : (error?.message || "Failed to update approval"));
    } finally {
      setApprovingId(null);
    }
  };

  // Group: top-level = admins/super_admins, with their agents nested under them.
  // Regular admins only see themselves + their own agents (tenant isolation).
  const grouped = useMemo(() => {
    const term = searchTerm.toLowerCase();
    const matches = (u: typeof users[number]) =>
      !term ||
      (u.full_name?.toLowerCase() || "").includes(term) ||
      (u.email?.toLowerCase() || "").includes(term);

    let admins = users.filter((u) => u.role === "admin" || u.role === "super_admin");
    let agents = users.filter((u) => u.role === "agent");

    if (!isSuperAdmin && currentUser) {
      admins = admins.filter((a) => a.user_id === currentUser.id);
      agents = agents.filter((a) => a.managed_by === currentUser.id);
    }

    const groups = admins.map((admin) => {
      const adminAgents = agents.filter((a) => a.managed_by === admin.user_id);
      const visible = matches(admin) || adminAgents.some(matches);
      return {
        admin,
        agents: adminAgents,
        visible,
      };
    });

    // Orphan agents (no managing admin) — only visible to super admins
    const orphanAgents = isSuperAdmin
      ? agents.filter((a) => !admins.some((adm) => adm.user_id === a.managed_by))
      : [];

    return { groups: groups.filter((g) => g.visible), orphanAgents: orphanAgents.filter(matches) };
  }, [users, searchTerm, isSuperAdmin, currentUser]);

  // The current admin's enforced company email domain (e.g. "acme.com"), read
  // from their own row in the fetched users list. Null for super-admins / legacy
  // accounts — in that case we don't enforce client-side and let the server decide.
  const currentAdminDomain = useMemo(() => {
    if (!currentUser) return null;
    const me = users.find((u) => u.user_id === currentUser.id);
    const domain = me?.company_domain?.trim().toLowerCase();
    return domain || null;
  }, [users, currentUser]);

  // When the admin has a fixed company domain, they type only the local part
  // (the name before @); validate it has no spaces/@ and uses safe characters.
  const localPartError = useMemo(() => {
    if (!currentAdminDomain || !newUserLocalPart) return null;
    if (!/^[a-zA-Z0-9._%+-]+$/.test(newUserLocalPart.trim())) {
      return "Use only letters, numbers and . _ % + - (no spaces or @).";
    }
    return null;
  }, [currentAdminDomain, newUserLocalPart]);

  const adminCount = grouped.groups.length;
  const totalAgentCount = grouped.groups.reduce((acc, g) => acc + g.agents.length, 0) + grouped.orphanAgents.length;

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCreateUser = async () => {
    // If this admin has a fixed company domain, compose the email from the typed
    // local part; otherwise (super-admin / legacy) use the full email field.
    const email = currentAdminDomain
      ? (newUserLocalPart.trim() ? `${newUserLocalPart.trim().toLowerCase()}@${currentAdminDomain}` : "")
      : newUserEmail.trim();
    if (!email || !newUserPassword) {
      toast.error("Email and password are required");
      return;
    }
    if (currentAdminDomain && localPartError) {
      toast.error(localPartError);
      return;
    }
    setIsCreating(true);
    try {
      await api.post("/api/users", {
        email,
        password: newUserPassword,
        full_name: newUserName,
        role: newUserRole,
      });

      toast.success(`${newUserRole === "admin" ? "Admin" : "Agent"} created successfully!`);
      setIsDialogOpen(false);
      setNewUserEmail(""); setNewUserLocalPart(""); setNewUserPassword(""); setNewUserName(""); setNewUserRole("agent");
      setTimeout(() => { invalidateProfiles(); invalidateUserRoles(); }, 1000);
    } catch (error: any) {
      let message = error instanceof ApiError ? error.message : (error?.message || "Failed to create user");
      if (message.includes("already been registered") || message.includes("email_exists") || message.includes("already exists")) {
        message = "A user with this email already exists.";
      }
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.del(`/api/users/${deleteTarget.id}`);
      toast.success(`Deleted ${deleteTarget.name}`);
      setDeleteTarget(null);
      setTimeout(() => { invalidateProfiles(); invalidateUserRoles(); }, 500);
    } catch (error: any) {
      toast.error(error instanceof ApiError ? error.message : (error?.message || "Failed to delete user"));
    } finally {
      setIsDeleting(false);
    }
  };

  const openResetDialog = (u: typeof users[number]) => {
    setResetTarget({ id: u.user_id, name: u.full_name || u.email || "user", email: u.email });
    setResetMode("generate");
    setCustomPassword("");
    setRevealedPassword(null);
    setShowRevealed(false);
    setCopied(false);
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    if (resetMode === "custom" && customPassword.trim().length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setIsResetting(true);
    try {
      const response = await api.post<{ password?: string }>(
        `/api/users/${resetTarget.id}/reset-password`,
        resetMode === "custom" ? { new_password: customPassword.trim() } : {}
      );
      const pw = response?.password;
      if (!pw) throw new Error("No password returned");
      setRevealedPassword(pw);
      setShowRevealed(true);
      toast.success("Password reset. Copy it now — it will not be shown again.");
    } catch (error: any) {
      toast.error(error instanceof ApiError ? error.message : (error?.message || "Failed to reset password"));
    } finally {
      setIsResetting(false);
    }
  };

  const copyPassword = async () => {
    if (!revealedPassword) return;
    try {
      await navigator.clipboard.writeText(revealedPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const closeResetDialog = () => {
    setResetTarget(null);
    setRevealedPassword(null);
    setCustomPassword("");
    setShowRevealed(false);
    setCopied(false);
  };

  const handleTogglePause = async () => {
    if (!pauseTarget) return;
    setIsPausing(true);
    try {
      await api.patch(`/api/users/${pauseTarget.id}/pause`, {
        is_paused: pauseTarget.pause,
      });
      toast.success(pauseTarget.pause ? `Paused ${pauseTarget.name}` : `Resumed ${pauseTarget.name}`);
      setPauseTarget(null);
      invalidateProfiles();
    } catch (error: any) {
      toast.error(error instanceof ApiError ? error.message : (error?.message || "Failed to update pause state"));
    } finally {
      setIsPausing(false);
    }
  };

  const UserRow = ({ u, indent = false }: { u: typeof users[number]; indent?: boolean }) => {
    const canDelete = isSuperAdmin && u.role !== "super_admin" && u.user_id !== currentUser?.id;
    const canReset =
      u.role !== "super_admin" &&
      u.user_id !== currentUser?.id &&
      (isSuperAdmin || u.managed_by === currentUser?.id);
    const canPause =
      isSuperAdmin &&
      (u.role === "admin") &&
      u.user_id !== currentUser?.id;
    const paused = !!u.is_paused;
    return (
      <div className={`flex items-center justify-between gap-4 py-3 px-3 rounded-md hover:bg-accent/50 ${indent ? "pl-12 border-l-2 border-border ml-6" : ""}`}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {getInitials(u.full_name, u.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{u.full_name || "No name"}</p>
            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <RoleBadge role={u.role} />
          {paused && (
            <Badge className="bg-amber-100 text-amber-700 border-amber-300">
              <Pause className="h-3 w-3 mr-1" /> Paused
            </Badge>
          )}
        </div>
        <div className="hidden lg:block text-xs text-muted-foreground w-24 text-right">
          {new Date(u.created_at).toLocaleDateString()}
        </div>
        {canReset && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-primary hover:bg-primary/10"
            onClick={() => openResetDialog(u)}
            title="Reset password"
          >
            <KeyRound className="h-4 w-4" />
          </Button>
        )}
        {canPause && (
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${paused ? "text-green-600 hover:bg-green-100" : "text-amber-600 hover:bg-amber-100"}`}
            onClick={() =>
              setPauseTarget({
                id: u.user_id,
                name: u.full_name || u.email || "user",
                pause: !paused,
              })
            }
            title={paused ? "Resume account" : "Pause account"}
          >
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </Button>
        )}
        {canDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:bg-destructive/10"
            onClick={() => setDeleteTarget({ id: u.user_id, name: u.full_name || u.email || "user" })}
            title="Delete user"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  };


  return (
    <div className="space-y-6">
      {isSuperAdmin && <GlobalPauseCard />}

      {isSuperAdmin && pendingApprovals.length > 0 && (
        <Card className="bg-card/50 border-amber-300/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600" />
              Pending Approvals
              <Badge className="bg-amber-100 text-amber-700 border-amber-300">{pendingApprovals.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingApprovals.map((p) => (
              <div
                key={p.user_id}
                className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-md border border-border bg-background"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-sm truncate">{p.full_name || "No name"}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{p.email}</span>
                    {p.company && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{p.company}</span>}
                    {p.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{p.phone}</span>}
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(p.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    disabled={approvingId === p.user_id}
                    onClick={() => handleApproval(p.user_id, "approved")}
                  >
                    {approvingId === p.user_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <><Check className="h-4 w-4 mr-1" />Approve</>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive border-destructive/40 hover:bg-destructive/10"
                    disabled={approvingId === p.user_id}
                    onClick={() => handleApproval(p.user_id, "rejected")}
                  >
                    <X className="h-4 w-4 mr-1" />Reject
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{isSuperAdmin ? "User Management" : "Agents Management"}</h1>
          <p className="text-muted-foreground">
            {isSuperAdmin ? "Manage all admins and their agents." : "Manage your agents and their permissions."}
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary">
              <UserPlus className="h-4 w-4 mr-2" /> {isSuperAdmin ? "Add User" : "Add Agent"}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>
                {isSuperAdmin ? "Create a new admin or agent account." : "Create a new agent account managed by you."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {isSuperAdmin && (
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={newUserRole} onValueChange={(v: "agent" | "admin") => setNewUserRole(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agent"><div className="flex items-center gap-2"><User className="h-4 w-4" />Agent</div></SelectItem>
                      <SelectItem value="admin"><div className="flex items-center gap-2"><Users className="h-4 w-4" />Admin</div></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input id="name" placeholder="John Smith" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                {currentAdminDomain ? (
                  <>
                    <div className="flex">
                      <Input
                        id="email"
                        type="text"
                        inputMode="text"
                        autoComplete="off"
                        placeholder="john"
                        value={newUserLocalPart}
                        onChange={(e) => setNewUserLocalPart(e.target.value)}
                        aria-invalid={!!localPartError}
                        className={`rounded-r-none ${localPartError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                      />
                      <span className="inline-flex items-center whitespace-nowrap rounded-r-md border border-l-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                        @{currentAdminDomain}
                      </span>
                    </div>
                    {localPartError ? (
                      <p className="text-xs text-destructive">{localPartError}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Just enter the agent's name — the <span className="font-medium">@{currentAdminDomain}</span> domain is added automatically.
                      </p>
                    )}
                  </>
                ) : (
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@example.com"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="••••••••" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateUser} disabled={isCreating || !!localPartError}>
                {isCreating ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</>) : `Create ${newUserRole === "admin" ? "Admin" : "Agent"}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-card/50 border-border">
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-4 justify-between">
            <CardTitle>
              {isSuperAdmin
                ? `${adminCount} ${adminCount === 1 ? "Admin" : "Admins"} · ${totalAgentCount} ${totalAgentCount === 1 ? "Agent" : "Agents"}`
                : `${totalAgentCount} ${totalAgentCount === 1 ? "Agent" : "Agents"}`}
            </CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={isSuperAdmin ? "Search users..." : "Search agents..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-full md:w-[300px]"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 p-2">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : (isSuperAdmin ? (grouped.groups.length === 0 && grouped.orphanAgents.length === 0) : totalAgentCount === 0) ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm
                ? (isSuperAdmin ? "No users found matching your search." : "No agents found matching your search.")
                : (isSuperAdmin ? "No users yet. Click 'Add User' to create one." : "No agents yet. Click 'Add Agent' to create one.")}
            </div>
          ) : !isSuperAdmin ? (
            // Admins see a flat list of just their own agents (no admin header row).
            <div className="space-y-1">
              {grouped.groups.flatMap((g) => g.agents).map((a) => (
                <UserRow key={a.user_id} u={a} />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {grouped.groups.map((g) => {
                const isOpen = expanded.has(g.admin.user_id);
                return (
                  <div key={g.admin.user_id} className="border border-border rounded-lg overflow-hidden">
                    <div className="flex items-center bg-accent/30">
                      <button
                        type="button"
                        onClick={() => toggleExpand(g.admin.user_id)}
                        className="p-2 hover:bg-accent transition-colors"
                        disabled={g.agents.length === 0}
                        title={g.agents.length ? "Toggle agents" : "No agents"}
                      >
                        {g.agents.length === 0 ? (
                          <span className="block h-4 w-4" />
                        ) : isOpen ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                      <div className="flex-1">
                        <UserRow u={g.admin} />
                      </div>
                      <div className="px-3 text-xs text-muted-foreground">
                        {g.agents.length} {g.agents.length === 1 ? "agent" : "agents"}
                      </div>
                    </div>
                    {isOpen && g.agents.length > 0 && (
                      <div className="bg-background py-1">
                        {g.agents.map((a) => (
                          <UserRow key={a.user_id} u={a} indent />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {grouped.orphanAgents.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-muted/40 text-xs font-medium text-muted-foreground">
                    Unassigned agents
                  </div>
                  <div className="py-1">
                    {grouped.orphanAgents.map((a) => (
                      <UserRow key={a.user_id} u={a} indent />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-semibold">{deleteTarget?.name}</span> and all their data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteUser(); }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</>) : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!resetTarget} onOpenChange={(open) => !open && closeResetDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              {resetTarget && (
                <>For <span className="font-semibold">{resetTarget.name}</span> ({resetTarget.email}). The new password will be shown once — copy it before closing.</>
              )}
            </DialogDescription>
          </DialogHeader>

          {!revealedPassword ? (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Method</Label>
                <Select value={resetMode} onValueChange={(v: "generate" | "custom") => setResetMode(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="generate">Generate a strong password</SelectItem>
                    <SelectItem value="custom">Set a custom password</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {resetMode === "custom" && (
                <div className="space-y-2">
                  <Label htmlFor="newpw">New password (min 6 chars)</Label>
                  <Input
                    id="newpw"
                    type="text"
                    placeholder="Enter new password"
                    value={customPassword}
                    onChange={(e) => setCustomPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <Label>New password</Label>
              <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/40">
                <code className="flex-1 text-sm font-mono break-all">
                  {showRevealed ? revealedPassword : "•".repeat(revealedPassword.length)}
                </code>
                <Button
                  type="button" variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => setShowRevealed((s) => !s)}
                  title={showRevealed ? "Hide" : "Show"}
                >
                  {showRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  type="button" variant="ghost" size="icon" className="h-8 w-8"
                  onClick={copyPassword} title="Copy"
                >
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                This password will not be shown again. Share it with the agent through a secure channel.
              </p>
            </div>
          )}

          <DialogFooter>
            {!revealedPassword ? (
              <>
                <Button variant="outline" onClick={closeResetDialog} disabled={isResetting}>Cancel</Button>
                <Button onClick={handleResetPassword} disabled={isResetting}>
                  {isResetting ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Resetting...</>) : "Reset password"}
                </Button>
              </>
            ) : (
              <Button onClick={closeResetDialog}>Done</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pauseTarget} onOpenChange={(open) => !open && setPauseTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pauseTarget?.pause ? "Pause this admin?" : "Resume this admin?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pauseTarget?.pause ? (
                <>
                  <span className="font-semibold">{pauseTarget?.name}</span> and all their agents
                  will immediately lose access. They'll see a "Contact Administration" screen until
                  you resume the account.
                </>
              ) : (
                <>
                  <span className="font-semibold">{pauseTarget?.name}</span> and their agents will
                  regain full access to the platform.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPausing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleTogglePause(); }}
              disabled={isPausing}
              className={pauseTarget?.pause ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}
            >
              {isPausing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
              ) : pauseTarget?.pause ? "Pause" : "Resume"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
