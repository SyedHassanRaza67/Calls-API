import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Rocket,
  Users,
  Zap,
  PhoneCall,
  ListChecks,
  LayoutDashboard,
  KeyRound,
  LifeBuoy,
} from "lucide-react";

export function Instructions() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Help & Instructions</h1>
        <p className="text-muted-foreground">
          A quick guide to setting up campaigns, managing your agents, and routing calls to buyers.
        </p>
      </div>

      {/* 1. Getting Started */}
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Getting Started
          </CardTitle>
          <CardDescription>Set up your admin account and bring your team on board</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Calls API</strong> is a lead-routing and pay-per-call
            platform. You connect to buyer integrations, your agents run callers through them, and the
            platform returns a tracking or forwarding number so the call can be routed and paid for.
          </p>
          <div className="space-y-2">
            <h3 className="font-semibold text-foreground">Roles at a glance</h3>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Super Admin</strong> — platform-wide oversight and configuration.</li>
              <li><strong>Admin</strong> — that's you. You sign up for the account, configure campaigns, and create agent logins.</li>
              <li><strong>Agent</strong> — runs callers through your campaigns from the Agent Portal.</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-foreground">First steps</h3>
            <ol className="list-decimal list-inside space-y-1">
              <li>Sign up for an Admin account (only Admins self-register).</li>
              <li>Create logins for your agents under <strong>Agents</strong> — they do not sign up themselves.</li>
              <li>Add your buyer integrations under <strong>APIs</strong> as campaigns.</li>
              <li>Have agents run callers through those campaigns from the <strong>Agent Portal</strong>.</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* 2. Managing Agents */}
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Managing Agents
          </CardTitle>
          <CardDescription>Create and maintain logins for your team</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Agents cannot register on their own. As an Admin, you create and manage every agent login
            from the <strong>Agents</strong> section.
          </p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Open the <strong>Agents</strong> section.</li>
            <li>Click <strong>Add Agent</strong> and enter their name, email, and a password.</li>
            <li>Share those credentials so the agent can sign in to the Agent Portal.</li>
            <li>Edit or remove an agent at any time as your team changes.</li>
          </ol>
          <p>
            <strong className="text-foreground">Tip:</strong> Agents automatically see the active
            campaigns associated with your account — no per-agent assignment is required.
          </p>
        </CardContent>
      </Card>

      {/* 3. Setting up APIs / Campaigns */}
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Setting Up APIs &amp; Campaigns
          </CardTitle>
          <CardDescription>Connect buyer integrations under APIs / Integrations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            Each entry under <strong>APIs</strong> is a <strong>campaign</strong> — an outbound
            integration with a buyer. Campaigns support providers such as Retreaver, Ringba,
            TrackDrive, LeadsPedia, and Service Direct.
          </p>

          <div className="space-y-2">
            <h3 className="font-semibold text-foreground">Add a campaign</h3>
            <ol className="list-decimal list-inside space-y-1">
              <li>Click <strong>Add API</strong>.</li>
              <li>Give it a <strong>Campaign Name</strong> (this is what agents see).</li>
              <li>Pick the provider and paste the buyer&apos;s endpoint URL and credentials.</li>
              <li>Select the <strong>Request Mode</strong> (see below).</li>
              <li>Map caller fields (phone, state, zip) and any provider-specific parameters.</li>
              <li>Save, then <strong>test</strong> it before going live.</li>
            </ol>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-foreground">Request Modes</h3>
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <Badge variant="outline" className="mt-0.5 shrink-0">Ping/Post</Badge>
                <p>
                  Two-step flow. A <strong>ping</strong> checks whether the buyer wants the call and at
                  what price; if accepted, a <strong>post</strong> confirms it and returns the
                  forwarding/tracking number.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Badge variant="outline" className="mt-0.5 shrink-0">Ping Only</Badge>
                <p>
                  A single request that submits the caller and returns the response in one step — no
                  separate confirmation call.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Badge variant="outline" className="mt-0.5 shrink-0">RTB</Badge>
                <p>
                  Real-Time Bidding. Buyers bid on the call in real time and the winning bid returns a
                  tracking number (DID) to route the caller to.
                </p>
              </div>
            </div>
          </div>

          <div className="p-3 bg-muted/30 rounded-lg border border-border">
            <p className="text-xs">
              <strong className="text-foreground">Always test a new campaign.</strong> Use the test
              action in the campaign dialog to send a sample caller and confirm you get a valid
              response and number before agents rely on it.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 4. Running Calls from the Agent Portal */}
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PhoneCall className="h-5 w-5 text-primary" />
            Running Calls from the Agent Portal
          </CardTitle>
          <CardDescription>How agents turn a caller into a routed, paid call</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ol className="list-decimal list-inside space-y-1">
            <li>Enter the caller&apos;s <strong>Phone Number</strong>, <strong>State</strong>, and <strong>Zip Code</strong>.</li>
            <li>Choose a campaign and <strong>trigger</strong> it to send the caller to the buyer.</li>
            <li>
              On success, a <strong>tracking / forwarding number</strong> is returned — route the caller
              to that number to complete and bill the call.
            </li>
            <li>If the buyer declines or the campaign isn&apos;t a fit, try another campaign.</li>
          </ol>
          <div className="p-3 bg-muted/30 rounded-lg border border-border">
            <p className="text-xs">
              <strong className="text-foreground">Reading the response:</strong> A success shows the
              returned number and status. On a <strong>failure</strong>, open the result to view the
              <strong> raw response</strong> from the buyer — it usually explains the reason (out of
              hours, cap reached, missing field, no bid) and tells you what to fix or try next.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 5. Leads & Submissions */}
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            Leads &amp; Submissions
          </CardTitle>
          <CardDescription>Track every lead and what the buyer returned</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            The <strong>Leads</strong> section lists every submission your agents run, with the caller
            details, the campaign used, and a status of <strong>success</strong> or <strong>failed</strong>.
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>Open a lead to see the full response returned by the buyer.</li>
            <li>Use failed submissions to spot configuration issues or buyer-side rejections.</li>
            <li>Successful submissions show the tracking/forwarding number that was returned.</li>
          </ul>
        </CardContent>
      </Card>

      {/* 6. Dashboard & Analytics */}
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-primary" />
            Dashboard &amp; Analytics
          </CardTitle>
          <CardDescription>Measure performance over time</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ul className="list-disc list-inside space-y-1">
            <li>
              The <strong>Dashboard</strong> shows headline stats — submissions, successes, and other
              key metrics — with a <strong>date filter</strong> so you can focus on any period.
            </li>
            <li>
              <strong>Analytics</strong> goes deeper into performance trends across campaigns and agents
              to help you see what&apos;s converting.
            </li>
          </ul>
          <p>
            <strong className="text-foreground">Tip:</strong> Adjust the date filter to compare recent
            performance against earlier periods and catch drop-offs early.
          </p>
        </CardContent>
      </Card>

      {/* 7. Account & Password */}
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Account &amp; Password
          </CardTitle>
          <CardDescription>Manage your sign-in and API keys</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Open <strong>Account Settings</strong> from the avatar menu in the top-right corner to:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Change your password</strong> — do this periodically to keep your account secure.</li>
            <li><strong>Manage API keys</strong> used to authenticate with the platform.</li>
          </ul>
          <p>
            <strong className="text-foreground">Reminder:</strong> Each agent has their own login.
            Never share a single account across your team.
          </p>
        </CardContent>
      </Card>

      {/* 8. Getting Help / Support */}
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-primary" />
            Getting Help &amp; Support
          </CardTitle>
          <CardDescription>Know who to contact for which issue</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Buyer-specific issues</strong> (rejections, caps, payouts, hours of operation):
              contact your <strong>Service Direct</strong> or buyer representative for that campaign.
            </li>
            <li>
              <strong>Platform issues</strong> (sign-in, agents, campaign setup, errors in the app):
              contact your <strong>platform administrator</strong>.
            </li>
          </ul>
          <p>
            When reporting a problem, include the campaign name, the caller details used, and the raw
            response shown on a failed submission — it makes troubleshooting much faster.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
