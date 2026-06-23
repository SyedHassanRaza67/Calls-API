import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Copy, Eye, EyeOff, RefreshCw, Key, AlertTriangle, Check } from "lucide-react";
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

export function AccountSettings() {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [showNewKey, setShowNewKey] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [keyToRegenerate, setKeyToRegenerate] = useState<ApiKeyRecord | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

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
