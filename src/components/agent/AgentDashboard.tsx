import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, CreditCard, PhoneCall, MessageSquare } from "lucide-react";

export function AgentDashboard() {
  const { profile } = useAuth();

  const stats = [
    { 
      title: "API Calls Today", 
      value: "1,247", 
      change: "+12%", 
      icon: Activity,
      color: "text-primary" 
    },
    { 
      title: "Credits Remaining", 
      value: "8,453", 
      change: "-5%", 
      icon: CreditCard,
      color: "text-success" 
    },
    { 
      title: "Voice Minutes", 
      value: "342", 
      change: "+8%", 
      icon: PhoneCall,
      color: "text-warning" 
    },
    { 
      title: "SMS Sent", 
      value: "905", 
      change: "+15%", 
      icon: MessageSquare,
      color: "text-primary" 
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div>
        <h1 className="text-2xl font-bold">
          Welcome back, {profile?.full_name || "Agent"}
        </h1>
        <p className="text-muted-foreground">
          Here's an overview of your API usage and activity.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="bg-card/50 border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className={`text-xs ${stat.change.startsWith('+') ? 'text-success' : 'text-destructive'}`}>
                {stat.change} from yesterday
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Activity */}
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { type: "SMS", endpoint: "/v1/sms/send", status: "success", time: "2 min ago" },
              { type: "Voice", endpoint: "/v1/voice/call", status: "success", time: "5 min ago" },
              { type: "Verify", endpoint: "/v1/verify/otp", status: "success", time: "12 min ago" },
              { type: "SMS", endpoint: "/v1/sms/send", status: "failed", time: "15 min ago" },
              { type: "Voice", endpoint: "/v1/voice/call", status: "success", time: "22 min ago" },
            ].map((activity, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${activity.status === 'success' ? 'bg-success' : 'bg-destructive'}`} />
                  <div>
                    <p className="text-sm font-medium">{activity.type}</p>
                    <p className="text-xs text-muted-foreground">{activity.endpoint}</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{activity.time}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
