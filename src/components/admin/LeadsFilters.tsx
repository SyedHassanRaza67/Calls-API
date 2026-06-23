import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, X } from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC"
];

interface Agent {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

interface ApiConfig {
  id: string;
  name: string;
}

export interface LeadsFilterState {
  dateRange: DateRange | undefined;
  status: string;
  agentId: string;
  state: string;
  apiConfigId: string;
}

interface LeadsFiltersProps {
  filters: LeadsFilterState;
  onFiltersChange: (filters: LeadsFilterState) => void;
  agents: Agent[];
  apiConfigs: ApiConfig[];
}

export function LeadsFilters({ filters, onFiltersChange, agents, apiConfigs }: LeadsFiltersProps) {
  const handleDatePreset = (preset: string) => {
    const today = new Date();
    let range: DateRange | undefined;

    switch (preset) {
      case "today":
        range = { from: startOfDay(today), to: endOfDay(today) };
        break;
      case "7days":
        range = { from: startOfDay(subDays(today, 7)), to: endOfDay(today) };
        break;
      case "30days":
        range = { from: startOfDay(subDays(today, 30)), to: endOfDay(today) };
        break;
      default:
        range = undefined;
    }

    onFiltersChange({ ...filters, dateRange: range });
  };

  const clearFilters = () => {
    onFiltersChange({
      dateRange: undefined,
      status: "all",
      agentId: "all",
      state: "all",
      apiConfigId: "all",
    });
  };

  const hasActiveFilters = 
    filters.dateRange || 
    filters.status !== "all" || 
    filters.agentId !== "all" || 
    filters.state !== "all" ||
    filters.apiConfigId !== "all";

  return (
    <div className="flex flex-wrap gap-3 items-center p-4 bg-card/30 rounded-lg border border-border">
      {/* Date Range */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleDatePreset("today")}
          className={cn(
            filters.dateRange?.from && 
            format(filters.dateRange.from, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd") &&
            "bg-primary/10 border-primary"
          )}
        >
          Today
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleDatePreset("7days")}
        >
          Last 7 Days
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleDatePreset("30days")}
        >
          Last 30 Days
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "justify-start text-left font-normal",
                filters.dateRange && "bg-primary/10 border-primary"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {filters.dateRange?.from ? (
                filters.dateRange.to ? (
                  <>
                    {format(filters.dateRange.from, "LLL dd")} -{" "}
                    {format(filters.dateRange.to, "LLL dd")}
                  </>
                ) : (
                  format(filters.dateRange.from, "LLL dd, y")
                )
              ) : (
                "Custom"
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={filters.dateRange?.from}
              selected={filters.dateRange}
              onSelect={(range) => onFiltersChange({ ...filters, dateRange: range })}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Status Filter */}
      <Select
        value={filters.status}
        onValueChange={(value) => onFiltersChange({ ...filters, status: value })}
      >
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="success">Success</SelectItem>
          <SelectItem value="failed">Failed</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
        </SelectContent>
      </Select>

      {/* Agent Filter */}
      <Select
        value={filters.agentId}
        onValueChange={(value) => onFiltersChange({ ...filters, agentId: value })}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Agent" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Agents</SelectItem>
          {agents.map((agent) => (
            <SelectItem key={agent.user_id} value={agent.user_id}>
              {agent.full_name || agent.email || "Unknown"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* State Filter */}
      <Select
        value={filters.state}
        onValueChange={(value) => onFiltersChange({ ...filters, state: value })}
      >
        <SelectTrigger className="w-[120px]">
          <SelectValue placeholder="State" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All States</SelectItem>
          {US_STATES.map((state) => (
            <SelectItem key={state} value={state}>
              {state}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* API/Campaign Filter */}
      {apiConfigs.length > 0 && (
        <Select
          value={filters.apiConfigId}
          onValueChange={(value) => onFiltersChange({ ...filters, apiConfigId: value })}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Campaign" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Campaigns</SelectItem>
            {apiConfigs.map((config) => (
              <SelectItem key={config.id} value={config.id}>
                {config.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}