import { useState } from 'react';
import { Search, Filter, X, Calendar as CalendarIcon, Archive } from 'lucide-react';
import { format } from 'date-fns';
import { Switch } from '@/components/ui/switch';
import type { ReportFilters } from '@/hooks/use-report-filters';
import { useTeams } from '@/hooks/use-teams';
import { useMetrics } from '@/hooks/use-metrics';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useContextualLabels } from '@/hooks/useContextualLabels';

interface ReportsFilterBarProps {
  organizationId?: string;
  filters: ReportFilters;
  updateFilters: (updates: Partial<ReportFilters>) => void;
  resetFilters: () => void;
  activeFilterCount: number;
}

export function ReportsFilterBar({
  organizationId,
  filters,
  updateFilters,
  resetFilters,
  activeFilterCount
}: ReportsFilterBarProps) {
  const labels = useContextualLabels();
  const { data: teams = [], isLoading: teamsLoading } = useTeams({ organizationId });
  const { data: metrics = [], isLoading: metricsLoading } = useMetrics();

  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateFilters({ search: e.target.value });
  };

  // Handle report type change
  const handleReportTypeChange = (value: string) => {
    updateFilters({ reportType: value as 'all' | 'individual' | 'team' });
  };

  // Handle date range selection
  const handleDateFromSelect = (date: Date | undefined) => {
    updateFilters({ dateFrom: date?.toISOString() });
  };

  const handleDateToSelect = (date: Date | undefined) => {
    updateFilters({ dateTo: date?.toISOString() });
  };

  // Handle team selection
  const handleTeamToggle = (teamId: string) => {
    const currentTeamIds = filters.teamIds || [];
    const newTeamIds = currentTeamIds.includes(teamId)
      ? currentTeamIds.filter((id) => id !== teamId)
      : [...currentTeamIds, teamId];
    updateFilters({ teamIds: newTeamIds });
  };

  // Handle metric selection
  const handleMetricToggle = (metricCode: string) => {
    const currentMetrics = filters.metrics || [];
    const newMetrics = currentMetrics.includes(metricCode)
      ? currentMetrics.filter((code) => code !== metricCode)
      : [...currentMetrics, metricCode];
    updateFilters({ metrics: newMetrics });
  };

  // Format date range display
  const formatDateRange = () => {
    if (filters.dateFrom && filters.dateTo) {
      return `${format(new Date(filters.dateFrom), 'MMM dd')} - ${format(new Date(filters.dateTo), 'MMM dd, yyyy')}`;
    } else if (filters.dateFrom) {
      return `From ${format(new Date(filters.dateFrom), 'MMM dd, yyyy')}`;
    } else if (filters.dateTo) {
      return `Until ${format(new Date(filters.dateTo), 'MMM dd, yyyy')}`;
    }
    return 'Select date range';
  };

  return (
    <div className="space-y-4">
      {/* Top row: Search and Report Type */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search reports by name or description..."
            value={filters.search || ''}
            onChange={handleSearchChange}
            className="pl-10"
            aria-label="Search reports"
          />
        </div>

        {/* Report Type Select */}
        <Select value={filters.reportType || 'all'} onValueChange={handleReportTypeChange}>
          <SelectTrigger className="w-full sm:w-[180px]" aria-label="Report type">
            <SelectValue placeholder="All Reports" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Reports</SelectItem>
            <SelectItem value="individual">Individual</SelectItem>
            <SelectItem value="team">{labels.team}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bottom row: Advanced filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-muted-foreground flex items-center gap-1">
          <Filter className="h-4 w-4" />
          Filters:
        </span>

        {/* Date Range Filter */}
        <Popover open={dateRangeOpen} onOpenChange={setDateRangeOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              aria-label="Date range"
            >
              <CalendarIcon className="h-4 w-4 mr-2" />
              {formatDateRange()}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-4" align="start">
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">From Date</Label>
                <Calendar
                  mode="single"
                  selected={filters.dateFrom ? new Date(filters.dateFrom) : undefined}
                  onSelect={handleDateFromSelect}
                  initialFocus
                />
              </div>
              <Separator />
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">To Date</Label>
                <Calendar
                  mode="single"
                  selected={filters.dateTo ? new Date(filters.dateTo) : undefined}
                  onSelect={handleDateToSelect}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  updateFilters({ dateFrom: undefined, dateTo: undefined });
                  setDateRangeOpen(false);
                }}
              >
                Clear Dates
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Teams Filter */}
        <Popover open={teamsOpen} onOpenChange={setTeamsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              aria-label={labels.teams}
              disabled={teamsLoading || teams.length === 0}
            >
              {labels.teams}
              {filters.teamIds && filters.teamIds.length > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 flex items-center justify-center">
                  {filters.teamIds.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="start">
            <div className="space-y-2">
              <h4 className="font-medium text-sm mb-3">Filter by {labels.teams}</h4>
              <ScrollArea className="h-64">
                <div className="space-y-2">
                  {teams.map((team) => (
                    <div key={team.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`team-${team.id}`}
                        checked={filters.teamIds?.includes(team.id) || false}
                        onCheckedChange={() => handleTeamToggle(team.id)}
                      />
                      <Label
                        htmlFor={`team-${team.id}`}
                        className="text-sm font-normal cursor-pointer flex-1"
                      >
                        {team.name}
                      </Label>
                    </div>
                  ))}
                  {teams.length === 0 && !teamsLoading && (
                    <p className="text-sm text-muted-foreground">No {labels.teams.toLowerCase()} available</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </PopoverContent>
        </Popover>

        {/* Metrics Filter */}
        <Popover open={metricsOpen} onOpenChange={setMetricsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              aria-label="Metrics"
              disabled={metricsLoading || metrics.length === 0}
            >
              Metrics
              {filters.metrics && filters.metrics.length > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 flex items-center justify-center">
                  {filters.metrics.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="start">
            <div className="space-y-2">
              <h4 className="font-medium text-sm mb-3">Filter by Metrics</h4>
              <ScrollArea className="h-64">
                <div className="space-y-2">
                  {metrics.map((metric) => (
                    <div key={metric.code} className="flex items-center space-x-2">
                      <Checkbox
                        id={`metric-${metric.code}`}
                        checked={filters.metrics?.includes(metric.code) || false}
                        onCheckedChange={() => handleMetricToggle(metric.code)}
                      />
                      <Label
                        htmlFor={`metric-${metric.code}`}
                        className="text-sm font-normal cursor-pointer flex-1"
                      >
                        {metric.name}
                      </Label>
                    </div>
                  ))}
                  {metrics.length === 0 && !metricsLoading && (
                    <p className="text-sm text-muted-foreground">No metrics available</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </PopoverContent>
        </Popover>

        {/* Show Archived Toggle */}
        <div className="flex items-center gap-2 ml-2">
          <Switch
            id="show-archived"
            checked={filters.includeArchived || false}
            onCheckedChange={(checked) => updateFilters({ includeArchived: checked })}
            aria-label="Show archived reports"
          />
          <Label
            htmlFor="show-archived"
            className="text-sm font-normal cursor-pointer flex items-center gap-1"
          >
            <Archive className="h-3.5 w-3.5" />
            Show Archived
          </Label>
        </div>

        {/* Active Filter Count Badge */}
        {activeFilterCount > 0 && (
          <>
            <Badge variant="secondary" className="h-8">
              {activeFilterCount}
            </Badge>

            {/* Clear Filters Button */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={resetFilters}
              aria-label="Clear filters"
            >
              <X className="h-4 w-4 mr-1" />
              Clear Filters
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
