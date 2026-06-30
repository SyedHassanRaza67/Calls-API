import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, CreditCard } from "lucide-react";

export function SystemSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">System Settings</h1>
        <p className="text-muted-foreground">Configure pricing tiers.</p>
      </div>

      {/* Billing Settings */}
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Billing & Pricing
          </CardTitle>
          <CardDescription>Configure pricing tiers.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-secondary/50 border border-border">
              <Label className="text-muted-foreground">Starter Plan</Label>
              <p className="text-2xl font-bold">$29/mo</p>
              <p className="text-xs text-muted-foreground">1,000 credits</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/50 border border-primary">
              <Label className="text-muted-foreground">Professional</Label>
              <p className="text-2xl font-bold text-primary">$99/mo</p>
              <p className="text-xs text-muted-foreground">5,000 credits</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/50 border border-border">
              <Label className="text-muted-foreground">Enterprise</Label>
              <p className="text-2xl font-bold">$299/mo</p>
              <p className="text-xs text-muted-foreground">25,000 credits</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button className="gradient-primary">
          <Save className="h-4 w-4 mr-2" />
          Save All Settings
        </Button>
      </div>
    </div>
  );
}
