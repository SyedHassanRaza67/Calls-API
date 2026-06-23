import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, Users, FlaskConical, PhoneCall, Copy, Trash2, Settings } from "lucide-react";

export function Instructions() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Help & Instructions</h1>
        <p className="text-muted-foreground">Reference guide for setting up APIs and managing agents.</p>
      </div>

      {/* How to Add APIs */}
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            How to Add an API
          </CardTitle>
          <CardDescription>Postman-style interface — works with any API provider</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* General Flow */}
          <div className="space-y-2">
            <h3 className="font-semibold">General Setup</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li>Click <strong>Add API</strong></li>
              <li>Enter a <strong>Campaign Name</strong> (what agents see)</li>
              <li>Choose <strong>HTTP Method</strong> (GET or POST) from the top bar</li>
              <li>Paste the <strong>API Endpoint URL</strong> in the URL field</li>
              <li>Select <strong>Request Mode</strong> — Ping Only, Ping/Post, or RTB</li>
              <li>If the API doesn't return a phone number, enter the <strong>Forwarding Number</strong></li>
              <li>Add <strong>parameter rows</strong> with exact keys the API expects</li>
              <li>Use the <strong>checkbox</strong> on each row to enable/disable individual params</li>
              <li>Use the <strong>👤 Ask Agent</strong> toggle to make a field agent-fillable at call time</li>
              <li>Set <strong>Body Format</strong> (JSON or Form Data) as required</li>
              <li>Assign to an admin and click <strong>Create</strong></li>
            </ol>
          </div>

          {/* Template Variables */}
          <div className="space-y-2 p-3 bg-muted/30 rounded-lg border border-border">
            <h3 className="font-semibold text-sm">Template Variables Reference</h3>
            <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
              <div><code className="bg-muted px-1 rounded text-xs">{"{{phone}}"}</code> — Caller phone number</div>
              <div><code className="bg-muted px-1 rounded text-xs">{"{{state}}"}</code> — Caller state (e.g., CA)</div>
              <div><code className="bg-muted px-1 rounded text-xs">{"{{zip}}"}</code> — Caller zip code</div>
              <div><code className="bg-muted px-1 rounded text-xs">{"{{api_key}}"}</code> — API Key field value</div>
              <div><code className="bg-muted px-1 rounded text-xs">{"{{publisher_id}}"}</code> — Publisher ID field value</div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">When any param uses a template, custom fields become the <strong>entire</strong> request body (no default fields added).</p>
          </div>

          {/* Leadspedia */}
          <div className="space-y-2">
            <h3 className="font-semibold flex items-center gap-2">
              <Badge variant="outline">Leadspedia</Badge>
              Walk-In Tubs, D30, etc.
            </h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li>Set method to <strong>POST</strong>, mode to <strong>Ping Only</strong></li>
              <li>Paste the <strong>API Endpoint URL</strong> from the buyer</li>
              <li>Add params: <code className="text-xs bg-muted px-1 rounded">lp_campaign_id</code>, <code className="text-xs bg-muted px-1 rounded">lp_campaign_key</code></li>
              <li>Add caller fields: <code className="text-xs bg-muted px-1 rounded">phone</code> = <code className="text-xs bg-muted px-1 rounded">{"{{phone}}"}</code>, <code className="text-xs bg-muted px-1 rounded">state</code> = <code className="text-xs bg-muted px-1 rounded">{"{{state}}"}</code>, <code className="text-xs bg-muted px-1 rounded">zip</code> = <code className="text-xs bg-muted px-1 rounded">{"{{zip}}"}</code></li>
              <li>Body format is auto-detected as <strong>Form Data</strong> for Leadspedia URLs</li>
              <li>Add the <strong>Forwarding Number</strong> if the API doesn't return one</li>
            </ol>
          </div>

          {/* Trackdrive */}
          <div className="space-y-2">
            <h3 className="font-semibold flex items-center gap-2">
              <Badge variant="outline">Trackdrive</Badge>
              Ping/Post
            </h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li>Set mode to <strong>Ping/Post</strong></li>
              <li>Paste the <strong>Buyer API Link</strong> (posting_instructions URL) — the system auto-parses ping/post URLs and fields</li>
              <li>Enter the <strong>Forwarding Number</strong> provided by the buyer</li>
              <li>Add HOO, caps, payout info in the <strong>Notes</strong> field</li>
            </ol>
          </div>

          {/* Ringba RTB */}
          <div className="space-y-2">
            <h3 className="font-semibold flex items-center gap-2">
              <Badge variant="outline">Ringba</Badge>
              RTB (Real-Time Bidding)
            </h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li>Set provider to <strong>Ringba</strong>, mode to <strong>RTB</strong></li>
              <li>Enter the <strong>RTB ID</strong> in the Publisher / Source ID field</li>
              <li>The system sends CID, zipcode, state, and exposeCallerId automatically</li>
              <li>On success, the agent sees the returned <strong>tracking number (DID)</strong></li>
              <li>Add HOO and payout info in the <strong>Notes</strong> field</li>
            </ol>
            <div className="mt-2 p-3 bg-muted/50 rounded-lg text-xs space-y-1">
              <p className="font-medium text-foreground">Auto-sent fields:</p>
              <p><code>CID</code> = caller phone number</p>
              <p><code>zipcode</code> = caller zip</p>
              <p><code>state</code> = caller state</p>
              <p><code>exposeCallerId</code> = yes</p>
            </div>
          </div>

          {/* Custom GET */}
          <div className="space-y-2">
            <h3 className="font-semibold flex items-center gap-2">
              <Badge variant="outline">Custom GET</Badge>
              Ringba Display/Enrich or similar
            </h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li>Set HTTP Method to <strong>GET</strong>, Mode to <strong>Ping Only</strong></li>
              <li>Paste the full URL with parameter templates in the <strong>URL</strong> field</li>
              <li>The system detects parameter names and maps caller data automatically</li>
              <li>Put the <strong>static DID</strong> in the "Forwarding Number" field</li>
            </ol>
          </div>

          {/* QuoteWizard */}
          <div className="space-y-2">
            <h3 className="font-semibold flex items-center gap-2">
              <Badge variant="outline">QuoteWizard</Badge>
              Partial Lead Ping
            </h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li>Set provider to <strong>QuoteWizard</strong></li>
              <li>Enter <strong>Campaign ID</strong> and <strong>ApiKey</strong> in the respective fields</li>
              <li>The system builds the required nested JSON structure automatically</li>
              <li>If accepted, the buyer's <strong>phoneNumber</strong> is shown as the DID</li>
            </ol>
          </div>

          {/* Intelhouse */}
          <div className="space-y-2">
            <h3 className="font-semibold flex items-center gap-2">
              <Badge variant="outline">Intelhouse / Call Platform</Badge>
              Ping/Post RTB
            </h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li>Set mode to <strong>Ping/Post</strong></li>
              <li>Enter the <strong>Campaign ID</strong> (UUID) in the <code className="text-xs bg-muted px-1 rounded">campaign_id</code> param</li>
              <li>Enter the <strong>Publisher ID</strong> in the Publisher / Source ID field</li>
              <li>The system extracts the <strong>token</strong> from ping and passes it to post automatically</li>
              <li>On success, the agent sees the <strong>routing number</strong> from the post response</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* Assign APIs */}
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Assigning APIs to Agents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>APIs are assigned to <strong>admins</strong>, not directly to agents. The flow is:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Super Admin creates an API config and assigns it to an <strong>Admin</strong></li>
            <li>The Admin's agents automatically see that API in their workspace</li>
            <li>Go to <strong>Users</strong> tab to manage which agents belong to which admin</li>
          </ol>
          <p className="mt-2">
            <strong>Tip:</strong> An agent sees all active APIs assigned to their managing admin.
          </p>
        </CardContent>
      </Card>

      {/* Test Tool */}
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            Using the Test Tool
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <ol className="list-decimal list-inside space-y-1">
            <li>Open the Add/Edit API dialog</li>
            <li>Fill in all required fields</li>
            <li>Click the <strong>Send</strong> button in the top bar</li>
            <li>The system sends a sample lead (CA / 90210 / +15551234567) to the API</li>
            <li>Review the result — green = success, red = check the error details</li>
          </ol>
          <p className="mt-2">
            <strong>All modes are testable:</strong> Ping Only, Ping/Post, and RTB campaigns can all be tested directly from the API config dialog. For RTB, make sure the Publisher/RTB ID is filled in.
          </p>
        </CardContent>
      </Card>

      {/* Managing Configs */}
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Managing API Configs
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <Copy className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <p className="font-medium text-foreground">Duplicate</p>
              <p>Click the copy icon to duplicate a config. The copy is created as <strong>inactive</strong> with " (Copy)" appended to the name. Edit it to customize.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Trash2 className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
            <div>
              <p className="font-medium text-foreground">Delete</p>
              <p>Click the trash icon to <strong>permanently delete</strong> a config. This action cannot be undone.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agent Workflow */}
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PhoneCall className="h-5 w-5 text-primary" />
            Agent Workflow
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <ol className="list-decimal list-inside space-y-1">
            <li>Agent enters caller's <strong>Phone Number</strong>, <strong>State</strong>, and <strong>Zip Code</strong></li>
            <li>Clicks <strong>Submit Lead</strong> — this creates a row with all available campaigns</li>
            <li>Agent clicks each campaign button to trigger the API call</li>
            <li>If a campaign has <strong>Ask Agent</strong> fields, a dialog prompts for those values first</li>
            <li>On success, the agent sees the <strong>DID/tracking number</strong> — click to call or copy</li>
            <li>On failure, the agent can click the <strong>retry</strong> button to try again</li>
            <li>Click any result to view the full API response and admin notes</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
