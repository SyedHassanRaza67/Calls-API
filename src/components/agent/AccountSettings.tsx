import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Copy, Eye, EyeOff, RefreshCw, Key, AlertTriangle, Check, Building2 } from "lucide-react";
import { api } from "@/lib/api";
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

interface ApiKeyRecord {
  id: string;
  key_name: string;
  key_prefix: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
}

// Maximum size (in characters) for the encoded logo data URL (~150KB).
const MAX_LOGO_DATA_URL_LENGTH = 150 * 1024;

export function AccountSettings() {
  const { profile, user, isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [showNewKey, setShowNewKey] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [keyToRegenerate, setKeyToRegenerate] = useState<ApiKeyRecord | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Company Profile (admin only)
  const [companyName, setCompanyName] = useState(profile?.company || "");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [isSavingCompany, setIsSavingCompany] = useState(false);

  // Pre-fill company name + logo from /api/profiles/me (company_logo isn't on
  // the cached auth profile shape, so fetch the full record for admins).
  useEffect(() => {
    if (!isAdmin || !user?.id) return;
    let cancelled = false;
    const fetchCompanyProfile = async () => {
      try {
        const me = await api.get<{ company?: string | null; company_logo?: string | null }>(
          "/api/profiles/me"
        );
        if (cancelled || !me) return;
        if (typeof me.company === "string") setCompanyName(me.company);
        if (me.company_logo) setLogoDataUrl(me.company_logo);
      } catch (error) {
        console.error("Error loading company profile:", error);
      }
    };
    fetchCompanyProfile();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, user?.id]);

  // Downscale + compress a selected image to a small data URL.
  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxSide = 512;
        let { width, height } = img;
        if (width > height && width > maxSide) {
          height = Math.round((height * maxSide) / width);
          width = maxSide;
        } else if (height > maxSide) {
          width = Math.round((width * maxSide) / height);
          height = maxSide;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          toast({
            title: "Error",
            description: "Unable to process the selected image.",
            variant: "destructive",
          });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        // PNG preserves transparency; otherwise JPEG compresses far smaller.
        const hasAlpha = /image\/png|image\/webp/i.test(file.type);
        let dataUrl = hasAlpha
          ? canvas.toDataURL("image/png")
          : canvas.toDataURL("image/jpeg", 0.85);

        // If too big, progressively lower JPEG quality, then dimensions.
        if (dataUrl.length > MAX_LOGO_DATA_URL_LENGTH) {
          const qualities = [0.7, 0.55, 0.4];
          for (const q of qualities) {
            dataUrl = canvas.toDataURL("image/jpeg", q);
            if (dataUrl.length <= MAX_LOGO_DATA_URL_LENGTH) break;
          }
        }
        if (dataUrl.length > MAX_LOGO_DATA_URL_LENGTH) {
          const scales = [0.75, 0.5];
          for (const s of scales) {
            const sw = Math.max(1, Math.round(width * s));
            const sh = Math.max(1, Math.round(height * s));
            canvas.width = sw;
            canvas.height = sh;
            const sctx = canvas.getContext("2d");
            if (!sctx) break;
            sctx.drawImage(img, 0, 0, sw, sh);
            dataUrl = canvas.toDataURL("image/jpeg", 0.6);
            if (dataUrl.length <= MAX_LOGO_DATA_URL_LENGTH) break;
          }
        }

        if (dataUrl.length > MAX_LOGO_DATA_URL_LENGTH) {
          toast({
            title: "Error",
            description: "Logo is too large, please use a smaller image",
            variant: "destructive",
          });
          return;
        }

        setLogoDataUrl(dataUrl);
      };
      img.onerror = () => {
        toast({
          title: "Error",
          description: "Could not load the selected image.",
          variant: "destructive",
        });
      };
      img.src = reader.result as string;
    };
    reader.onerror = () => {
      toast({
        title: "Error",
        description: "Could not read the selected file.",
        variant: "destructive",
      });
    };
    reader.readAsDataURL(file);
  };

  const saveCompanyProfile = async () => {
    setIsSavingCompany(true);
    try {
      await api.patch("/api/profiles/me", {
        company: companyName,
        company_logo: logoDataUrl,
      });
      // Refresh the navbar branding so the new logo shows up immediately.
      queryClient.invalidateQueries({ queryKey: ["branding"] });
      toast({
        title: "Company Profile Updated",
        description: "Your company name and logo have been saved.",
      });
    } catch (error) {
      console.error("Error saving company profile:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save company profile.",
        variant: "destructive",
      });
    } finally {
      setIsSavingCompany(false);
    }
  };

  // Fetch existing API keys (only metadata, no plaintext)
  useEffect(() => {
    const fetchApiKeys = async () => {
      if (!user?.id) return;

      setIsLoading(true);
      try {
        const data = await api.get<ApiKeyRecord[]>("/api/api-keys");
        setApiKeys(data || []);
      } catch (error) {
        console.error('Error fetching API keys:', error);
        toast({
          title: "Error",
          description: "Failed to load API keys.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchApiKeys();
  }, [user?.id, toast]);

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setKeyCopied(true);
    toast({ title: "Copied!", description: `${label} copied to clipboard.` });
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const createNewKey = async () => {
    if (!user?.id) return;
    
    setIsCreating(true);
    try {
      const created = await api.post<{ api_key: string; key_id: string }>("/api/api-keys", {
        key_name: "Production API Key",
      });

      if (created?.api_key) {
        // Show the key only once
        setNewlyCreatedKey(created.api_key);
        setShowNewKey(true);

        // Refresh the keys list
        const refreshedKeys = await api.get<ApiKeyRecord[]>("/api/api-keys");
        setApiKeys(refreshedKeys || []);

        toast({
          title: "API Key Created",
          description: "Your new API key has been created. Make sure to copy it now - you won't be able to see it again!",
        });
      }
    } catch (error) {
      console.error('Error creating API key:', error);
      toast({
        title: "Error",
        description: "Failed to create API key.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const regenerateKey = async () => {
    if (!user?.id || !keyToRegenerate) return;
    
    setIsRegenerating(true);
    try {
      // Deactivate the old key
      await api.del(`/api/api-keys/${keyToRegenerate.id}`);

      // Create a new one
      const created = await api.post<{ api_key: string; key_id: string }>("/api/api-keys", {
        key_name: keyToRegenerate.key_name,
      });

      if (created?.api_key) {
        setNewlyCreatedKey(created.api_key);
        setShowNewKey(true);

        // Refresh the keys list
        const refreshedKeys = await api.get<ApiKeyRecord[]>("/api/api-keys");
        setApiKeys(refreshedKeys || []);

        toast({
          title: "API Key Regenerated",
          description: "Your old key has been deactivated. Copy your new key now!",
        });
      }
    } catch (error) {
      console.error('Error regenerating API key:', error);
      toast({
        title: "Error",
        description: "Failed to regenerate API key.",
        variant: "destructive",
      });
    } finally {
      setIsRegenerating(false);
      setShowRegenerateDialog(false);
      setKeyToRegenerate(null);
    }
  };

  const handleRegenerateClick = (key: ApiKeyRecord) => {
    setKeyToRegenerate(key);
    setShowRegenerateDialog(true);
  };

  const updatePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "New password and confirmation do not match.",
        variant: "destructive",
      });
      return;
    }
    if (newPassword.length < 8) {
      toast({
        title: "Error",
        description: "New password must be at least 8 characters.",
        variant: "destructive",
      });
      return;
    }

    setIsUpdatingPassword(true);
    try {
      await api.post("/api/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });

      toast({
        title: "Password Updated",
        description: "Your password has been changed successfully.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      console.error('Error changing password:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update password.",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const activeKey = apiKeys.find(k => k.is_active);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Account Settings</h1>
        <p className="text-muted-foreground">Manage your profile and API credentials.</p>
      </div>

      {/* Profile Card */}
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Update your personal details and contact information.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input id="fullName" defaultValue={profile?.full_name || ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" defaultValue={user?.email || ""} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" defaultValue={profile?.phone || ""} placeholder="+1 (555) 123-4567" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Input id="company" defaultValue={profile?.company || ""} placeholder="Your Company" />
            </div>
          </div>
          <Button className="gradient-primary">Save Changes</Button>
        </CardContent>
      </Card>

      {/* Company Profile Card (admins only) */}
      {isAdmin && (
        <Card className="bg-card/50 border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Company Profile
            </CardTitle>
            <CardDescription>
              Set your company name and logo. Your logo appears in the navigation bar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Your Company"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyLogo">Company Logo</Label>
              <div className="flex items-center gap-4">
                {logoDataUrl ? (
                  <img
                    src={logoDataUrl}
                    alt="Company logo preview"
                    className="h-16 w-16 rounded-lg object-contain border border-border bg-background/50 p-1"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-lg border border-dashed border-border bg-background/50 flex items-center justify-center text-muted-foreground">
                    <Building2 className="h-6 w-6" />
                  </div>
                )}
                <Input
                  id="companyLogo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleLogoFileChange}
                  className="max-w-xs"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                PNG, JPEG or WebP. Images are automatically resized and compressed.
              </p>
            </div>
            <Button
              className="gradient-primary"
              onClick={saveCompanyProfile}
              disabled={isSavingCompany}
            >
              {isSavingCompany ? "Saving..." : "Save Company Profile"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Change Password Card */}
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update the password you use to sign in.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="hidden md:block" />
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <Button
            className="gradient-primary"
            onClick={updatePassword}
            disabled={isUpdatingPassword}
          >
            {isUpdatingPassword ? "Updating..." : "Update Password"}
          </Button>
        </CardContent>
      </Card>

      {/* Newly Created Key Alert */}
      {newlyCreatedKey && (
        <Card className="bg-amber-500/10 border-amber-500/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="h-5 w-5" />
              Save Your New API Key
            </CardTitle>
            <CardDescription className="text-amber-500/80">
              This is the only time you'll see this key. Copy it now and store it securely.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-background/50 border border-amber-500/30">
              <div className="flex items-center justify-between gap-4">
                <code className="text-sm font-mono flex-1 overflow-x-auto">
                  {showNewKey ? newlyCreatedKey : "sk_live_••••••••••••••••••••••••••••••••"}
                </code>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowNewKey(!showNewKey)}
                  >
                    {showNewKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(newlyCreatedKey, "API Key")}
                  >
                    {keyCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
            <Button 
              variant="outline" 
              onClick={() => setNewlyCreatedKey(null)}
              className="w-full"
            >
              I've saved my key
            </Button>
          </CardContent>
        </Card>
      )}

      {/* API Keys Card */}
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Keys
          </CardTitle>
          <CardDescription>
            Manage your API keys for authentication. Keys are securely hashed - you can only see the full key when you create it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="p-4 rounded-lg bg-secondary/50 border border-border animate-pulse">
              <div className="h-6 bg-muted rounded w-1/3 mb-2"></div>
              <div className="h-4 bg-muted rounded w-2/3"></div>
            </div>
          ) : activeKey ? (
            <div className="p-4 rounded-lg bg-secondary/50 border border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{activeKey.key_name}</span>
                  <Badge variant="default">Active</Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyToClipboard(activeKey.key_prefix, "Key prefix")}
                  title="Copy key prefix"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <code className="text-sm font-mono text-muted-foreground">
                {activeKey.key_prefix}
              </code>
              <p className="text-xs text-muted-foreground mt-2">
                Created: {new Date(activeKey.created_at).toLocaleDateString()}
                {activeKey.last_used_at && ` • Last used: ${new Date(activeKey.last_used_at).toLocaleDateString()}`}
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-secondary/50 border border-border text-center">
              <p className="text-muted-foreground">No active API keys. Create one to get started.</p>
            </div>
          )}
          
          <div className="flex gap-2">
            {activeKey && (
              <Button 
                variant="outline" 
                onClick={() => handleRegenerateClick(activeKey)}
                disabled={isRegenerating}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRegenerating ? 'animate-spin' : ''}`} />
                Regenerate Key
              </Button>
            )}
            <Button 
              variant="outline" 
              onClick={createNewKey}
              disabled={isCreating}
            >
              {isCreating ? 'Creating...' : 'Create New Key'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Usage & Billing */}
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle>Usage & Billing</CardTitle>
          <CardDescription>Your current plan and credit balance.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-secondary/50 border border-border">
              <p className="text-sm text-muted-foreground">Current Plan</p>
              <p className="text-xl font-bold">Professional</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/50 border border-border">
              <p className="text-sm text-muted-foreground">Credits Remaining</p>
              <p className="text-xl font-bold text-primary">8,453</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/50 border border-border">
              <p className="text-sm text-muted-foreground">Next Billing</p>
              <p className="text-xl font-bold">Feb 1, 2024</p>
            </div>
          </div>
          <Button className="mt-4" variant="outline">Upgrade Plan</Button>
        </CardContent>
      </Card>

      {/* Regenerate Confirmation Dialog */}
      <AlertDialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate your current API key and create a new one. 
              Any applications using the old key will stop working immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={regenerateKey} disabled={isRegenerating}>
              {isRegenerating ? 'Regenerating...' : 'Regenerate Key'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
