import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { AlertTriangle, Power, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";

export function GlobalPauseCard() {
  const [enabled, setEnabled] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get<{ setting_key: string; setting_value: { enabled?: boolean; reason?: string | null } | null }>(
        "/api/system-settings/global_pause",
        { skipAuth: true }
      );
      const v = data?.setting_value || {};
      setEnabled(!!v.enabled);
      setReason(v.reason || "");
    } catch {
      /* ignore — keep defaults */
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const apply = async (nextEnabled: boolean) => {
    setSaving(true);
    try {
      await api.put("/api/system-settings/global_pause", {
        setting_value: { enabled: nextEnabled, reason: reason || null },
      });
      setEnabled(nextEnabled);
      toast.success(nextEnabled ? "Platform paused for all users" : "Platform resumed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card className={enabled ? "border-destructive/40 bg-destructive/5" : "border-border"}>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className={`h-5 w-5 ${enabled ? "text-destructive" : "text-muted-foreground"}`} />
                Global Platform Pause
                {enabled && <Badge variant="destructive">Active</Badge>}
              </CardTitle>
              <CardDescription>
                When enabled, every user except Super Admins sees a "Payment Issue Detected" screen and cannot access the platform.
              </CardDescription>
            </div>
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : enabled ? (
              <Button
                variant="outline"
                onClick={() => apply(false)}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Power className="h-4 w-4 mr-2" />}
                Resume Platform
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => setConfirmOpen(true)}
                disabled={saving}
              >
                <Power className="h-4 w-4 mr-2" /> Pause Platform
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-w-xl">
            <label className="text-sm font-medium">Message shown to users (optional)</label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Service temporarily restricted due to billing. Please contact administration."
              onBlur={() => enabled && apply(true)}
            />
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pause the entire platform?</AlertDialogTitle>
            <AlertDialogDescription>
              All users except Super Admins will be locked out and shown the Payment Issue Detected screen until you resume.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { setConfirmOpen(false); apply(true); }}
            >
              Yes, Pause Platform
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
