import { useState, useCallback, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Send, Plus, Trash2, Loader2, Zap, Shield, Globe, Clock, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface KeyValue {
  key: string;
  value: string;
  description: string;
  enabled: boolean;
}

interface TabState {
  id: string;
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  body: string;
  response: { status: number; statusText: string; time: number; body: string } | null;
  error: string | null;
  loading: boolean;
}

interface HistoryEntry {
  id: string;
  tabId: string;
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  body: string;
  response: { status: number; statusText: string; time: number; body: string } | null;
  error: string | null;
  timestamp: number;
}

const HISTORY_KEY = "api_playground_history";
const TABS_KEY = "api_playground_tabs";
const MAX_ENTRIES = 50;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

function createEmptyTab(): TabState {
  return {
    id: crypto.randomUUID(),
    method: "GET",
    url: "",
    params: [{ key: "", value: "", description: "", enabled: true }],
    headers: [{ key: "", value: "", description: "", enabled: true }],
    body: "",
    response: null,
    error: null,
    loading: false,
  };
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const entries: HistoryEntry[] = JSON.parse(raw);
    const cutoff = Date.now() - SEVEN_DAYS;
    return entries.filter((e) => e.timestamp > cutoff).slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {}
}

function loadTabs(): { tabs: TabState[]; activeTabId: string } | null {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.tabs?.length > 0) {
      // Strip loading state
      data.tabs = data.tabs.map((t: TabState) => ({ ...t, loading: false }));
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

function saveTabs(tabs: TabState[], activeTabId: string) {
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify({ tabs, activeTabId }));
  } catch {}
}

const methodColors: Record<HttpMethod, string> = {
  GET: "text-emerald-600",
  POST: "text-amber-600",
  PUT: "text-blue-600",
  PATCH: "text-purple-600",
  DELETE: "text-red-600",
};

const methodBg: Record<HttpMethod, string> = {
  GET: "bg-emerald-100 text-emerald-700",
  POST: "bg-amber-100 text-amber-700",
  PUT: "bg-blue-100 text-blue-700",
  PATCH: "bg-purple-100 text-purple-700",
  DELETE: "bg-red-100 text-red-700",
};

const statusColor = (status: number) => {
  if (status >= 200 && status < 300) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (status >= 300 && status < 400) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-red-100 text-red-700 border-red-200";
};

function KeyValueRows({
  rows,
  onChange,
}: {
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
}) {
  const update = (i: number, field: "key" | "value" | "description", val: string) => {
    const next = [...rows];
    next[i] = { ...next[i], [field]: val };
    onChange(next);
  };
  const toggleEnabled = (i: number) => {
    const next = [...rows];
    next[i] = { ...next[i], enabled: !next[i].enabled };
    onChange(next);
  };
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  const add = () => onChange([...rows, { key: "", value: "", description: "", enabled: true }]);

  return (
    <div className="space-y-0">
      {/* Column Headers */}
      <div className="flex gap-2 items-center px-1 pb-1.5 border-b mb-1.5">
        <div className="w-5 shrink-0" />
        <span className="flex-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Key</span>
        <span className="flex-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Value</span>
        <span className="flex-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Description</span>
        <div className="w-8 shrink-0" />
      </div>
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2 items-center group py-0.5 hover:bg-muted/30 rounded px-1 transition-colors">
          <Checkbox
            checked={row.enabled}
            onCheckedChange={() => toggleEnabled(i)}
            className="shrink-0"
          />
          <Input
            placeholder="Key"
            value={row.key}
            onChange={(e) => update(i, "key", e.target.value)}
            className="flex-1 font-mono text-xs h-8 border-transparent bg-transparent hover:border-border focus:border-border transition-colors"
          />
          <Input
            placeholder="Value"
            value={row.value}
            onChange={(e) => update(i, "value", e.target.value)}
            className="flex-1 font-mono text-xs h-8 border-transparent bg-transparent hover:border-border focus:border-border transition-colors"
          />
          <Input
            placeholder="Description"
            value={row.description}
            onChange={(e) => update(i, "description", e.target.value)}
            className="flex-1 text-xs h-8 border-transparent bg-transparent hover:border-border focus:border-border transition-colors text-muted-foreground"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => remove(i)}
            className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <div className="pt-1.5 px-1">
        <Button variant="ghost" size="sm" onClick={add} className="text-xs gap-1 text-muted-foreground hover:text-foreground h-7">
          <Plus className="h-3 w-3" /> Add Row
        </Button>
      </div>
    </div>
  );
}

function formatTime(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function HistorySidebar({
  history,
  activeId,
  onSelect,
  onDelete,
  onClear,
}: {
  history: HistoryEntry[];
  activeId: string | null;
  onSelect: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="w-[250px] shrink-0 border-r flex flex-col bg-muted/20">
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">History</span>
        </div>
        {history.length > 0 && (
          <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground hover:text-destructive px-1.5" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
      <ScrollArea className="flex-1">
        {history.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-xs text-muted-foreground">No history yet</p>
            <p className="text-[10px] text-muted-foreground mt-1">Send a request to see it here</p>
          </div>
        ) : (
          <div className="p-1.5 space-y-0.5">
            {history.map((entry) => (
              <div
                key={entry.id}
                onClick={() => onSelect(entry)}
                className={`group relative rounded-md px-2.5 py-2 cursor-pointer transition-colors ${
                  activeId === entry.id
                    ? "bg-primary/10 border border-primary/20"
                    : "hover:bg-muted/60 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-bold font-mono ${methodColors[entry.method]}`}>
                    {entry.method}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{formatTime(entry.timestamp)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
                  >
                    <X className="h-2.5 w-2.5" />
                  </Button>
                </div>
                <p className="text-[10px] text-foreground/80 font-mono truncate mt-0.5">
                  {(() => {
                    try {
                      return new URL(entry.url).pathname + new URL(entry.url).search;
                    } catch {
                      return entry.url;
                    }
                  })()}
                </p>
                {entry.response && (
                  <Badge variant="outline" className={`mt-1 text-[9px] px-1.5 py-0 h-4 ${statusColor(entry.response.status)}`}>
                    {entry.response.status}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
      <div className="p-2 border-t">
        <p className="text-[10px] text-muted-foreground text-center">
          History is saved locally for 7 days
        </p>
      </div>
    </div>
  );
}

function TabLabel({ tab }: { tab: TabState }) {
  if (tab.url) {
    try {
      const u = new URL(tab.url);
      const path = u.pathname === "/" ? u.hostname : u.pathname;
      return (
        <span className="flex items-center gap-1 max-w-[120px]">
          <span className={`text-[10px] font-bold font-mono ${methodColors[tab.method]}`}>{tab.method}</span>
          <span className="truncate text-xs">{path}</span>
        </span>
      );
    } catch {}
  }
  return (
    <span className="flex items-center gap-1">
      <span className={`text-[10px] font-bold font-mono ${methodColors[tab.method]}`}>{tab.method}</span>
      <span className="text-xs text-muted-foreground">New Request</span>
    </span>
  );
}

export function ApiTesterSection() {
  const [tabs, setTabs] = useState<TabState[]>(() => {
    const saved = loadTabs();
    return saved ? saved.tabs : [createEmptyTab()];
  });
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    const saved = loadTabs();
    return saved ? saved.activeTabId : tabs[0]?.id ?? "";
  });

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const syncingRef = useRef(false);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  // Load history on mount
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Persist tabs on change
  useEffect(() => {
    saveTabs(tabs, activeTabId);
  }, [tabs, activeTabId]);

  const updateActiveTab = useCallback((updates: Partial<TabState>) => {
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, ...updates } : t)));
  }, [activeTabId]);

  const addNewTab = useCallback(() => {
    const newTab = createEmptyTab();
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
    setActiveHistoryId(null);
  }, []);

  const closeTab = useCallback((tabId: string) => {
    setTabs((prev) => {
      if (prev.length <= 1) return prev; // Keep at least one tab
      const next = prev.filter((t) => t.id !== tabId);
      if (activeTabId === tabId) {
        const idx = prev.findIndex((t) => t.id === tabId);
        const newActive = next[Math.min(idx, next.length - 1)];
        setActiveTabId(newActive.id);
      }
      return next;
    });
  }, [activeTabId]);

  const handleSelectHistory = useCallback((entry: HistoryEntry) => {
    // Load history entry into active tab
    updateActiveTab({
      method: entry.method,
      url: entry.url,
      params: entry.params,
      headers: entry.headers,
      body: entry.body,
      response: entry.response,
      error: entry.error,
    });
    setActiveHistoryId(entry.id);
  }, [updateActiveTab]);

  const handleDeleteHistory = useCallback((id: string) => {
    setHistory((prev) => {
      const next = prev.filter((e) => e.id !== id);
      saveHistory(next);
      return next;
    });
    if (activeHistoryId === id) setActiveHistoryId(null);
  }, [activeHistoryId]);

  const handleClearHistory = useCallback(() => {
    setHistory([]);
    saveHistory([]);
    setActiveHistoryId(null);
  }, []);

  const handleUrlChange = useCallback((newUrl: string) => {
    updateActiveTab({ url: newUrl });
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      const urlObj = new URL(newUrl);
      const newParams: KeyValue[] = [];
      urlObj.searchParams.forEach((value, key) => {
        newParams.push({ key, value, description: "", enabled: true });
      });
      if (newParams.length === 0) newParams.push({ key: "", value: "", description: "", enabled: true });
      updateActiveTab({ url: newUrl, params: newParams });
    } catch {}
    syncingRef.current = false;
  }, [updateActiveTab]);

  const handleParamsChange = useCallback((newParams: KeyValue[]) => {
    updateActiveTab({ params: newParams });
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      const urlObj = new URL(activeTab.url);
      const existingKeys = Array.from(urlObj.searchParams.keys());
      existingKeys.forEach((k) => urlObj.searchParams.delete(k));
      newParams.forEach((p) => {
        if (p.key.trim() && p.enabled) urlObj.searchParams.set(p.key.trim(), p.value);
      });
      updateActiveTab({ params: newParams, url: urlObj.toString() });
    } catch {}
    syncingRef.current = false;
  }, [activeTab.url, updateActiveTab]);

  const handleSend = useCallback(async () => {
    if (!activeTab.url.trim()) return;
    updateActiveTab({ loading: true, response: null, error: null });

    try {
      const finalUrl = new URL(activeTab.url);
      const existingKeys = Array.from(finalUrl.searchParams.keys());
      existingKeys.forEach((k) => finalUrl.searchParams.delete(k));
      activeTab.params.forEach((p) => {
        if (p.key.trim() && p.enabled) finalUrl.searchParams.set(p.key.trim(), p.value);
      });

      const reqHeaders: Record<string, string> = {};
      activeTab.headers.forEach((h) => {
        if (h.key.trim() && h.enabled) reqHeaders[h.key.trim()] = h.value;
      });

      let newResponse: HistoryEntry["response"] = null;
      let newError: string | null = null;

      try {
        const data = await api.post<{ status: number; statusText: string; time: number; body: string; error?: string }>(
          "/api/proxy-request",
          {
            url: finalUrl.toString(),
            method: activeTab.method,
            headers: Object.keys(reqHeaders).length ? reqHeaders : undefined,
            body: ["POST", "PUT", "PATCH"].includes(activeTab.method) && activeTab.body.trim() ? activeTab.body : undefined,
          }
        );
        if (data?.error) {
          newError = data.error;
        } else {
          newResponse = {
            status: data.status,
            statusText: data.statusText,
            time: data.time,
            body: data.body,
          };
        }
      } catch (fnError) {
        newError = fnError instanceof ApiError ? fnError.message : "Request failed";
      }

      updateActiveTab({ response: newResponse, error: newError, loading: false });

      // Save to history with tabId
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        tabId: activeTabId,
        method: activeTab.method,
        url: finalUrl.toString(),
        params: activeTab.params,
        headers: activeTab.headers,
        body: activeTab.body,
        response: newResponse,
        error: newError,
        timestamp: Date.now(),
      };
      setActiveHistoryId(entry.id);
      setHistory((prev) => {
        // Keep only the last request per tab (replace existing entry for this tab)
        const withoutThisTab = prev.filter((e) => e.tabId !== activeTabId);
        const next = [entry, ...withoutThisTab].slice(0, MAX_ENTRIES);
        saveHistory(next);
        return next;
      });
    } catch (err: any) {
      updateActiveTab({ error: err.message || "An unexpected error occurred.", loading: false });
    }
  }, [activeTab, activeTabId, updateActiveTab]);

  const showBody = ["POST", "PUT", "PATCH"].includes(activeTab.method);

  return (
    <section className="py-16 px-4" id="api-tester">
      <div className="max-w-6xl mx-auto">
        {/* Hero Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-4">
            <Zap className="h-3.5 w-3.5" />
            API Playground
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
            Test Any API <span className="text-gradient">Instantly</span>
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto text-sm">
            Send HTTP requests, inspect responses, and debug APIs — right from your browser. No setup required.
          </p>
        </div>

        <Card className="border shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="flex min-h-[500px]">
              {/* History Sidebar */}
              <HistorySidebar
                history={history}
                activeId={activeHistoryId}
                onSelect={handleSelectHistory}
                onDelete={handleDeleteHistory}
                onClear={handleClearHistory}
              />

              {/* Main panel */}
              <div className="flex-1 flex flex-col min-w-0">
                {/* Request Tabs Bar */}
                <div className="flex items-center border-b bg-muted/30 overflow-x-auto">
                  {tabs.map((tab) => (
                    <div
                      key={tab.id}
                      onClick={() => { setActiveTabId(tab.id); setActiveHistoryId(null); }}
                      className={`group flex items-center gap-1.5 px-3 py-2 cursor-pointer border-r text-xs shrink-0 transition-colors ${
                        activeTabId === tab.id
                          ? "bg-background border-b-2 border-b-primary"
                          : "hover:bg-muted/50 border-b-2 border-b-transparent"
                      }`}
                    >
                      <TabLabel tab={tab} />
                      {tabs.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive ml-1"
                          onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                        >
                          <X className="h-2.5 w-2.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={addNewTab}
                    title="New tab"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Request bar */}
                <div className="flex items-center gap-2 p-3 border-b">
                  <Select value={activeTab.method} onValueChange={(v) => updateActiveTab({ method: v as HttpMethod })}>
                    <SelectTrigger className={`w-[110px] font-mono font-bold text-sm h-10 border-r rounded-r-none ${methodColors[activeTab.method]}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["GET", "POST", "PUT", "PATCH", "DELETE"] as HttpMethod[]).map((m) => (
                        <SelectItem key={m} value={m}>
                          <span className={`font-mono font-bold ${methodColors[m]}`}>{m}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    placeholder="Enter URL or paste text"
                    value={activeTab.url}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    className="flex-1 font-mono text-sm h-10 rounded-none border-x-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  />

                  <Button
                    onClick={handleSend}
                    disabled={activeTab.loading || !activeTab.url.trim()}
                    className="gap-2 px-6 h-10 shrink-0 rounded-l-none bg-primary hover:bg-primary/90 font-semibold text-sm"
                  >
                    {activeTab.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Send
                  </Button>
                </div>

                {/* Tabs: Params / Headers / Body */}
                <div className="border-b">
                  <Tabs defaultValue="params" className="w-full">
                    <TabsList className="bg-transparent border-b rounded-none h-auto p-0 px-3">
                      <TabsTrigger
                        value="params"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2 text-sm"
                      >
                        Params
                      </TabsTrigger>
                      <TabsTrigger
                        value="headers"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2 text-sm"
                      >
                        Headers
                      </TabsTrigger>
                      {showBody && (
                        <TabsTrigger
                          value="body"
                          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2 text-sm"
                        >
                          Body
                        </TabsTrigger>
                      )}
                    </TabsList>

                    <div className="p-3">
                      <TabsContent value="params" className="mt-0">
                        <KeyValueRows rows={activeTab.params} onChange={handleParamsChange} />
                      </TabsContent>
                      <TabsContent value="headers" className="mt-0">
                        <KeyValueRows rows={activeTab.headers} onChange={(h) => updateActiveTab({ headers: h })} />
                      </TabsContent>
                      {showBody && (
                        <TabsContent value="body" className="mt-0">
                          <Textarea
                            placeholder='{"key": "value"}'
                            value={activeTab.body}
                            onChange={(e) => updateActiveTab({ body: e.target.value })}
                            className="font-mono text-xs min-h-[100px]"
                          />
                        </TabsContent>
                      )}
                    </div>
                  </Tabs>
                </div>

                {/* Response */}
                <div className="flex-1 flex flex-col">
                  <div className="flex items-center gap-3 px-3 py-2 border-t bg-muted/20">
                    <span className="text-sm font-medium text-foreground">Body</span>
                    {activeTab.response && (
                      <div className="flex items-center gap-3 ml-auto">
                        <Badge variant="outline" className={`font-mono font-semibold ${statusColor(activeTab.response.status)}`}>
                          {activeTab.response.status} {activeTab.response.statusText}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">{activeTab.response.time} ms</span>
                        {activeTab.response.body && (
                          <span className="text-xs text-muted-foreground font-mono">
                            {new Blob([activeTab.response.body]).size} B
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 relative">
                    <ScrollArea className="absolute inset-0">
                      <div className="flex">
                        {/* Line numbers */}
                        {(activeTab.response?.body || activeTab.error) && (
                          <div className="py-3 px-2 text-right select-none border-r bg-muted/20 shrink-0">
                            {(activeTab.response?.body || activeTab.error || "").split("\n").map((_, i) => (
                              <div key={i} className="font-mono text-[11px] text-muted-foreground/50 leading-5">{i + 1}</div>
                            ))}
                          </div>
                        )}
                        <pre className="p-3 font-mono text-xs text-foreground/90 min-h-[120px] max-h-[350px] whitespace-pre-wrap break-words flex-1 leading-5">
                          {activeTab.loading && (
                            <span className="text-muted-foreground italic">Sending request…</span>
                          )}
                          {activeTab.error && <span className="text-destructive">{activeTab.error}</span>}
                          {activeTab.response && activeTab.response.body}
                          {!activeTab.loading && !activeTab.error && !activeTab.response && (
                            <span className="text-muted-foreground italic">
                              Enter a URL and click Send to see the response here.
                            </span>
                          )}
                        </pre>
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Feature highlights */}
        <div className="grid grid-cols-3 gap-6 mt-10 max-w-2xl mx-auto">
          <div className="flex flex-col items-center text-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <span className="text-xs font-medium text-foreground">Fast & Reliable</span>
            <span className="text-xs text-muted-foreground">Server-side proxy, no CORS issues</span>
          </div>
          <div className="flex flex-col items-center text-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <span className="text-xs font-medium text-foreground">Secure</span>
            <span className="text-xs text-muted-foreground">Your keys stay in the request</span>
          </div>
          <div className="flex flex-col items-center text-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Globe className="h-4 w-4 text-primary" />
            </div>
            <span className="text-xs font-medium text-foreground">Any API</span>
            <span className="text-xs text-muted-foreground">Works with any REST endpoint</span>
          </div>
        </div>
      </div>
    </section>
  );
}
