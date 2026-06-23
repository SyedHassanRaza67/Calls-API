import { CreditCard, LogOut, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

const SUPPORT_EMAIL = "support@callsrtb.com";

export function PausedAccountScreen({ reason }: { reason?: string | null }) {
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <Card className="max-w-md w-full shadow-lg border-border">
        <CardContent className="p-8 text-center space-y-5">
          <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <CreditCard className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-slate-900">Payment Issue Detected</h1>
            <p className="text-sm text-slate-600">
              {reason ||
                "Your account access has been temporarily restricted due to an outstanding billing issue. Please contact administration to settle your payment or upgrade your plan to restore access."}
            </p>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <Button asChild className="w-full">
              <a href={`mailto:${SUPPORT_EMAIL}?subject=Payment%20Issue%20-%20Restore%20Access`}>
                <Mail className="h-4 w-4 mr-2" /> Contact Billing & Administration
              </a>
            </Button>
            <Button variant="outline" className="w-full" onClick={() => signOut()}>
              <LogOut className="h-4 w-4 mr-2" /> Sign Out
            </Button>
          </div>
          <p className="text-xs text-slate-500 pt-2">
            For billing questions, email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
              {SUPPORT_EMAIL}
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
