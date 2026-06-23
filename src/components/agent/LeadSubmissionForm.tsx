import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { api, ApiError } from "@/lib/api";
import { useActiveApiConfigurations } from "@/hooks/useAdminData";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2, Phone, CheckCircle, Copy, PhoneCall, AlertCircle, DollarSign, ArrowRight, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PhoneInput } from "@/components/ui/phone-input";
import { DuplicateCidNotice } from "@/components/agent/DuplicateCidNotice";
import { ZipInput } from "@/components/ui/zip-input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC"
];

interface ApiConfiguration {
  id: string;
  name: string;
  api_mode: "rtb" | "ping-post" | "ping";
}

interface PingResult {
  external_lead_id: string;
  bid_amount: number;
  lead_id: string; // Database lead ID
}

const leadFormSchema = z.object({
  apiConfigId: z.string().min(1, "Please select a campaign"),
  callerNumber: z.string()
    .refine((val) => val.replace(/\D/g, "").length === 10, "Phone number must be exactly 10 digits"),
  callerState: z.string().min(2, "Please select a state"),
  callerZip: z.string()
    .length(5, "Zip code must be 5 digits")
    .regex(/^\d{5}$/, "Zip code must be 5 digits"),
});

type LeadFormData = z.infer<typeof leadFormSchema>;

// Loading skeleton for the form
function FormSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="bg-primary/5 border-primary/20 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
      </Card>
      <Card className="backdrop-blur-sm bg-card/80">
        <CardHeader>
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-48 mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function toErrorString(val: unknown, fallback: string): string {
  if (typeof val === "string") return val;
  if (val && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    try { return JSON.stringify(val); } catch { return fallback; }
  }
  return fallback;
}

export function LeadSubmissionForm() {
  const { user } = useAuth();
  const { data: apiConfigs, isLoading: isLoadingConfigs } = useActiveApiConfigurations();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [returnedDid, setReturnedDid] = useState<string | null>(null);
  const [selectedApiName, setSelectedApiName] = useState<string>("");
  const [selectedApiMode, setSelectedApiMode] = useState<"rtb" | "ping-post" | "ping">("rtb");
  
  // Ping/Post specific state
  const [pingResult, setPingResult] = useState<PingResult | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  
  // API response display state (for when no DID is returned)
  const [apiResponse, setApiResponse] = useState<Record<string, unknown> | null>(null);
  const [isResponseOpen, setIsResponseOpen] = useState(false);

  const form = useForm<LeadFormData>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      apiConfigId: "",
      callerNumber: "",
      callerState: "",
      callerZip: "",
    },
  });

  // Auto-select if only one option
  const singleApiId = apiConfigs?.length === 1 ? apiConfigs[0].id : null;
  if (singleApiId && !form.getValues("apiConfigId")) {
    form.setValue("apiConfigId", singleApiId);
    if (apiConfigs?.[0]) {
      setSelectedApiName(apiConfigs[0].name);
      setSelectedApiMode(apiConfigs[0].api_mode);
    }
  }

  const cleanPhoneNumber = useCallback((phone: string): string => {
    return phone.replace(/\D/g, "");
  }, []);

  const copyToClipboard = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "Phone number copied to clipboard",
    });
  }, []);

  const handleCampaignChange = useCallback((configId: string) => {
    const config = apiConfigs?.find(c => c.id === configId);
    setSelectedApiName(config?.name || "");
    setSelectedApiMode(config?.api_mode || "rtb");
    // Reset ping result when campaign changes
    setPingResult(null);
  }, [apiConfigs]);

  const onSubmit = async (data: LeadFormData) => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to submit leads",
        variant: "destructive",
      });
      return;
    }

    // Resolve the campaign config from the loaded list.
    const freshConfig = apiConfigs?.find((c) => c.id === data.apiConfigId);

    if (!freshConfig) {
      toast({
        title: "Error",
        description: "Failed to load campaign configuration",
        variant: "destructive",
      });
      return;
    }

    const cleanedNumber = cleanPhoneNumber(data.callerNumber);

    // Use fresh config mode for submission routing
    console.log("Submitting with api_mode:", freshConfig.api_mode);
    
    // Determine submission mode: RTB, Ping Only, or Ping/Post
    if (freshConfig.api_mode === "ping-post") {
      await handlePingSubmit(data, cleanedNumber, freshConfig as ApiConfiguration);
    } else if (freshConfig.api_mode === "ping") {
      await handlePingOnlySubmit(data, cleanedNumber, freshConfig as ApiConfiguration);
    } else {
      await handleRtbSubmit(data, cleanedNumber, freshConfig as ApiConfiguration);
    }
  };

  const handleRtbSubmit = async (data: LeadFormData, cleanedNumber: string, selectedConfig: ApiConfiguration | undefined) => {
    setIsSubmitting(true);
    setReturnedDid(null);
    setApiResponse(null);

    try {
      // Backend persists the lead as part of the submit call.
      const responseData = await api.post<any>('/api/leads/submit', {
        api_configuration_id: data.apiConfigId,
        caller_number: cleanedNumber,
        caller_state: data.callerState,
        caller_zip: data.callerZip,
      });

      if (responseData.ok && responseData.did) {
        setReturnedDid(responseData.did);
        setSelectedApiName(selectedConfig?.name || "");
        // Store API response even on success
        setApiResponse(responseData.raw || responseData);
        toast({
          title: "Success!",
          description: "Lead submitted successfully",
        });
      } else {
        // Store API response for display
        setApiResponse(responseData.raw || responseData);
        setIsResponseOpen(true);

        const errorMessage = responseData.error === "no-target"
          ? "No buyer available for this location at this time"
          : responseData.error || "Failed to get tracking number";

        toast({
          title: "No Target Available",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("API error:", error);
      if (error instanceof ApiError && error.body && typeof error.body === "object") {
        setApiResponse(error.body as Record<string, unknown>);
        setIsResponseOpen(true);
      }
      toast({
        title: "Error",
        description: "Failed to submit lead. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePingOnlySubmit = async (data: LeadFormData, cleanedNumber: string, selectedConfig: ApiConfiguration | undefined) => {
    setIsSubmitting(true);
    setReturnedDid(null);
    setApiResponse(null);

    try {
      const responseData = await api.post<any>('/api/leads/ping-post', {
        action: "ping-only",
        api_configuration_id: data.apiConfigId,
        caller_number: cleanedNumber,
        caller_state: data.callerState,
        caller_zip: data.callerZip,
      });

      if (responseData.ok && responseData.did) {
        setReturnedDid(responseData.did);
        setSelectedApiName(selectedConfig?.name || "");
        // Store API response even on success
        setApiResponse(responseData.raw || responseData);
        toast({
          title: "Success!",
          description: "Lead submitted successfully",
        });
      } else {
        // Store API response for display
        setApiResponse(responseData.raw || responseData);
        setIsResponseOpen(true);

        const errorMessage = responseData.error || "Failed to get tracking number";

        toast({
          title: "No Target Available",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Ping-only API error:", error);
      if (error instanceof ApiError && error.body && typeof error.body === "object") {
        setApiResponse(error.body as Record<string, unknown>);
        setIsResponseOpen(true);
      }
      toast({
        title: "Error",
        description: "Failed to submit lead. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePingSubmit = async (data: LeadFormData, cleanedNumber: string, selectedConfig: ApiConfiguration | undefined) => {
    setIsSubmitting(true);
    setPingResult(null);

    try {
      // Backend persists the pending lead and returns its id.
      const responseData = await api.post<any>('/api/leads/ping-post', {
        action: "ping",
        api_configuration_id: data.apiConfigId,
        caller_number: cleanedNumber,
        caller_state: data.callerState,
        caller_zip: data.callerZip,
      });

      if (responseData.ok && responseData.has_bid) {
        setPingResult({
          external_lead_id: responseData.external_lead_id,
          bid_amount: responseData.bid_amount || 0,
          lead_id: responseData.lead_id || "",
        });

        toast({
          title: "Bid Received!",
          description: `Buyer interested at $${responseData.bid_amount || "TBD"}`,
        });
      } else {
        toast({
          title: "No Buyer Available",
          description: toErrorString(responseData.error, "No bids received for this lead"),
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Ping error:", error);
      toast({
        title: "Error",
        description: "Failed to ping buyer. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmPost = async () => {
    if (!pingResult || !user) return;

    const data = form.getValues();
    const cleanedNumber = cleanPhoneNumber(data.callerNumber);
    
    setIsPosting(true);

    try {
      // Backend updates the lead record (via lead_id) as part of the post call.
      const responseData = await api.post<any>('/api/leads/ping-post', {
        action: "post",
        api_configuration_id: data.apiConfigId,
        caller_number: cleanedNumber,
        caller_state: data.callerState,
        caller_zip: data.callerZip,
        external_lead_id: pingResult.external_lead_id,
        lead_id: pingResult.lead_id,
      });

      if (responseData.ok && responseData.did) {
        setReturnedDid(responseData.did);
        setPingResult(null);
        toast({
          title: "Success!",
          description: "Lead submitted successfully",
        });
      } else {
        toast({
          title: "Post Failed",
          description: toErrorString(responseData.error, "Failed to complete lead submission"),
          variant: "destructive",
        });
        setPingResult(null);
      }
    } catch (error) {
      console.error("Post error:", error);
      toast({
        title: "Error",
        description: "Failed to submit lead. Please try again.",
        variant: "destructive",
      });
      setPingResult(null);
    } finally {
      setIsPosting(false);
    }
  };

  const handleCancelPost = async () => {
    // The pending lead (if any) is left as-is server-side; just clear local UI state.
    setPingResult(null);
    toast({
      title: "Cancelled",
      description: "Lead submission cancelled",
    });
  };

  const handleNewLead = useCallback(() => {
    setReturnedDid(null);
    setPingResult(null);
    setApiResponse(null);
    setIsResponseOpen(false);
    form.reset({
      apiConfigId: apiConfigs?.length === 1 ? apiConfigs[0].id : "",
      callerNumber: "",
      callerState: "",
      callerZip: "",
    });
  }, [apiConfigs, form]);

  // Show skeleton while loading - form appears immediately
  if (isLoadingConfigs) {
    return <FormSkeleton />;
  }

  if (!apiConfigs || apiConfigs.length === 0) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No campaigns are available. Please contact an administrator to set up API configurations.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="relative space-y-6">
      <Card className="bg-primary/5 border-primary/20 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            Lead Submission Form
            {selectedApiMode === "ping-post" && (
              <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                Ping/Post
              </Badge>
            )}
            {selectedApiMode === "ping" && (
              <Badge variant="outline" className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                Ping Only
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {selectedApiMode === "ping-post" 
              ? "Two-step process: Check buyer interest, then confirm submission"
              : "Select a campaign and enter caller details to get a tracking DID"
            }
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Ping Result - Awaiting Confirmation */}
      {pingResult && !returnedDid && (
        <Card className="border-blue-500/50 bg-blue-500/10 backdrop-blur-sm">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/20">
              <DollarSign className="h-10 w-10 text-blue-400" />
            </div>
            <CardTitle className="text-xl text-blue-400">Bid Received!</CardTitle>
            <CardDescription>
              A buyer is interested in this lead
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-6">
            <div className="p-6 rounded-lg bg-card border border-border">
              <p className="text-sm text-muted-foreground mb-2">Bid Amount</p>
              <p className="text-4xl font-bold text-primary">
                ${pingResult.bid_amount.toFixed(2)}
              </p>
            </div>
            
            <div className="flex gap-3 justify-center">
              <Button
                variant="outline"
                onClick={handleCancelPost}
                disabled={isPosting}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleConfirmPost} 
                disabled={isPosting}
                className="gap-2"
              >
                {isPosting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    Confirm & Submit
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {returnedDid ? (
        <Card className="border-emerald-500/50 bg-emerald-500/10 backdrop-blur-sm">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
              <CheckCircle className="h-10 w-10 text-emerald-500" />
            </div>
            <CardTitle className="text-xl text-emerald-400">Success!</CardTitle>
            <CardDescription>
              Your tracking number is ready
              {selectedApiName && (
                <span className="block mt-1 text-xs">
                  Campaign: <span className="font-medium">{selectedApiName}</span>
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-6">
            <div className="p-6 rounded-lg bg-card border border-border">
              <p className="text-sm text-muted-foreground mb-2">Click to Call</p>
              <a
                href={`tel:${returnedDid}`}
                className="text-4xl font-bold text-primary hover:text-primary/80 transition-colors flex items-center justify-center gap-3"
              >
                <PhoneCall className="h-8 w-8" />
                {returnedDid}
              </a>
            </div>
            
            <div className="flex gap-3 justify-center">
              <Button
                variant="outline"
                onClick={() => copyToClipboard(returnedDid)}
                className="gap-2"
              >
                <Copy className="h-4 w-4" />
                Copy Number
              </Button>
              <Button onClick={handleNewLead} className="gap-2">
                <Phone className="h-4 w-4" />
                Submit Another Lead
              </Button>
            </div>
            
            {/* Show API Response on Success */}
            {apiResponse && (
              <Collapsible open={isResponseOpen} onOpenChange={setIsResponseOpen} className="w-full">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between text-muted-foreground hover:text-foreground">
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      View API Response
                    </span>
                    {isResponseOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 p-4 rounded-lg bg-card border border-border text-left">
                    <pre className="text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                      {JSON.stringify(apiResponse, null, 2)}
                    </pre>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* API Response Display - when no DID returned */}
      {!returnedDid && !pingResult && apiResponse && (
        <Card className="border-amber-500/50 bg-amber-500/10 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-amber-400">
              <FileText className="h-5 w-5" />
              API Response
            </CardTitle>
            <CardDescription>
              No tracking number was returned. Here is the full API response:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-card border border-border">
              <pre className="text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                {JSON.stringify(apiResponse, null, 2)}
              </pre>
            </div>
            <Button onClick={handleNewLead} className="w-full gap-2">
              <Phone className="h-4 w-4" />
              Submit Another Lead
            </Button>
          </CardContent>
        </Card>
      )}

      {!returnedDid && !pingResult && !apiResponse && (
        <Card className="backdrop-blur-sm bg-card/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Lead Information
            </CardTitle>
            <CardDescription>
              Fill in the caller details to {selectedApiMode === "ping-post" ? "check buyer interest" : "receive a tracking DID"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Campaign Selection */}
                <FormField
                  control={form.control}
                  name="apiConfigId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Campaign *</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          handleCampaignChange(value);
                        }}
                        value={field.value}
                        disabled={isSubmitting}
                      >
                        <FormControl>
                          <SelectTrigger className="bg-card">
                            <SelectValue placeholder="Select a campaign" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-card border-border">
                          {apiConfigs.map((config) => (
                            <SelectItem key={config.id} value={config.id}>
                              <div className="flex items-center gap-2">
                                {config.name}
                                {config.api_mode === "ping-post" && (
                                  <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/20">
                                    P/P
                                  </Badge>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="callerNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Caller Number *</FormLabel>
                      <FormControl>
                        <PhoneInput
                          placeholder="(555) 123-4567"
                          value={field.value}
                          onChange={field.onChange}
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <DuplicateCidNotice callerNumber={field.value} className="mt-2" />
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="callerState"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isSubmitting}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a state" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-card border-border">
                          {US_STATES.map((state) => (
                            <SelectItem key={state} value={state}>
                              {state}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="callerZip"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Zip Code *</FormLabel>
                      <FormControl>
                        <ZipInput
                          placeholder="12345"
                          value={field.value}
                          onChange={field.onChange}
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {selectedApiMode === "ping-post" ? "Checking..." : "Submitting..."}
                    </>
                  ) : (
                    <>
                      <Phone className="mr-2 h-4 w-4" />
                      {selectedApiMode === "ping-post" ? "Check Buyer Interest" : "Submit Lead"}
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
