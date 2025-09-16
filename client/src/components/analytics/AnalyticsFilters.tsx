import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, X, Filter, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import type { 
  AnalyticsFilters as FilterType,
  MetricSelection,
  TimeframeConfig,
  AnalysisType 
} from '@shared/analytics-types';
import { METRIC_CONFIG } from '@shared/analytics-types';

interface AnalyticsFiltersProps {
  filters: FilterType;
  metrics: MetricSelection;
  timeframe: TimeframeConfig;
  analysisType: AnalysisType;
  availableTeams: Array<{ id: string; name: string }>;
  availableAthletes: Array<{ id: string; name: string; teamName?: string }>;
  onFiltersChange: (filters: FilterType) => void;
  onMetricsChange: (metrics: MetricSelection) => void;
  onTimeframeChange: (timeframe: TimeframeConfig) => void;
  onAnalysisTypeChange: (type: AnalysisType) => void;
  onReset: () => void;
  className?: string;
}

export function AnalyticsFilters({
  filters,
  metrics,
  timeframe,
  analysisType,
  availableTeams,
  availableAthletes,
  onFiltersChange,
  onMetricsChange,
  onTimeframeChange,
  onAnalysisTypeChange,
  onReset,
  className
}: AnalyticsFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [customDateRange, setCustomDateRange] = useState<{
    from?: Date;
    to?: Date;
  }>({});

  // Handle filter updates
  const updateFilter = useCallback(<K extends keyof FilterType>(
    key: K,
    value: FilterType[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  }, [filters, onFiltersChange]);

  // Handle multi-select updates
  const updateMultiSelect = useCallback(<K extends keyof FilterType>(
    key: K,
    value: string,
    checked: boolean
  ) => {
    const currentValues = (filters[key] as string[]) || [];
    const newValues = checked
      ? [...currentValues, value]
      : currentValues.filter(v => v !== value);
    
    updateFilter(key, newValues as FilterType[K]);
  }, [filters, updateFilter]);

  // Handle metric changes
  const handleMetricChange = useCallback((type: 'primary' | 'additional', value: string) => {
    if (type === 'primary') {
      onMetricsChange({ ...metrics, primary: value });
    } else {
      const newAdditional = metrics.additional.includes(value)
        ? metrics.additional.filter(m => m !== value)
        : [...metrics.additional, value].slice(0, 5); // Max 5 additional
      onMetricsChange({ ...metrics, additional: newAdditional });
    }
  }, [metrics, onMetricsChange]);

  // Handle timeframe changes
  const handleTimeframeChange = useCallback((updates: Partial<TimeframeConfig>) => {
    const newTimeframe = { ...timeframe, ...updates };
    
    // Handle custom date range
    if (updates.period === 'custom') {
      newTimeframe.startDate = customDateRange.from;
      newTimeframe.endDate = customDateRange.to;
    }
    
    onTimeframeChange(newTimeframe);
  }, [timeframe, customDateRange, onTimeframeChange]);

  // Reset all filters
  const handleReset = useCallback(() => {
    setCustomDateRange({});
    onReset();
  }, [onReset]);

  // Get active filter count
  const activeFilterCount = Object.entries(filters).reduce((count, [key, value]) => {
    if (key === 'organizationId') return count;
    if (Array.isArray(value) && value.length > 0) return count + value.length;
    if (value && !Array.isArray(value)) return count + 1;
    return count;
  }, 0);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Analytics Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {activeFilterCount}
              </Badge>
            )}
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? 'Collapse' : 'Expand'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={activeFilterCount === 0}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Analysis Type Selection */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Analysis Type</Label>
          <div className="grid grid-cols-3 gap-2">
            {(['individual', 'intra_group', 'inter_group'] as const).map((type) => (
              <Button
                key={type}
                variant={analysisType === type ? 'default' : 'outline'}
                size="sm"
                onClick={() => onAnalysisTypeChange(type)}
                className="justify-start"
              >
                {type === 'individual' ? 'Individual' :
                 type === 'intra_group' ? 'Intra-Group' : 'Inter-Group'}
              </Button>
            ))}
          </div>
        </div>

        {/* Metrics Selection */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Metrics</Label>
          
          {/* Primary Metric */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Primary Metric</Label>
            <Select value={metrics.primary} onValueChange={(value) => handleMetricChange('primary', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(METRIC_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Additional Metrics */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Additional Metrics (up to 5)
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(METRIC_CONFIG).map(([key, config]) => (
                <div key={key} className="flex items-center space-x-2">
                  <Checkbox
                    id={`metric-${key}`}
                    checked={metrics.additional.includes(key)}
                    onCheckedChange={(checked) => 
                      handleMetricChange('additional', key)
                    }
                    disabled={
                      key === metrics.primary || 
                      (!metrics.additional.includes(key) && metrics.additional.length >= 5)
                    }
                  />
                  <Label
                    htmlFor={`metric-${key}`}
                    className="text-xs leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {config.label}
                  </Label>
                </div>
              ))}
            </div>
            
            {/* Selected Additional Metrics */}
            {metrics.additional.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {metrics.additional.map((metric) => (
                  <Badge key={metric} variant="secondary" className="text-xs">
                    {METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 ml-1"
                      onClick={() => handleMetricChange('additional', metric)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Timeframe Configuration */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Timeframe</Label>
          
          {/* Analysis Type */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={timeframe.type === 'best' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleTimeframeChange({ type: 'best' })}
            >
              Best Values
            </Button>
            <Button
              variant={timeframe.type === 'trends' ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleTimeframeChange({ type: 'trends' })}
            >
              Trends
            </Button>
          </div>

          {/* Time Period */}
          <Select
            value={timeframe.period}
            onValueChange={(value) => handleTimeframeChange({ 
              period: value as TimeframeConfig['period'] 
            })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_time">All Time</SelectItem>
              <SelectItem value="this_year">This Year</SelectItem>
              <SelectItem value="last_90_days">Last 90 Days</SelectItem>
              <SelectItem value="last_30_days">Last 30 Days</SelectItem>
              <SelectItem value="last_7_days">Last 7 Days</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>

          {/* Custom Date Range */}
          {timeframe.period === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customDateRange.from ? format(customDateRange.from, "MMM d, yyyy") : "From"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customDateRange.from}
                    onSelect={(date) => setCustomDateRange(prev => ({ ...prev, from: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customDateRange.to ? format(customDateRange.to, "MMM d, yyyy") : "To"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customDateRange.to}
                    onSelect={(date) => setCustomDateRange(prev => ({ ...prev, to: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>

        {/* Expandable Filters */}
        {isExpanded && (
          <>
            {/* Team Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Teams</Label>
              <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                {availableTeams.map((team) => (
                  <div key={team.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`team-${team.id}`}
                      checked={(filters.teams || []).includes(team.id)}
                      onCheckedChange={(checked) => 
                        updateMultiSelect('teams', team.id, !!checked)
                      }
                    />
                    <Label
                      htmlFor={`team-${team.id}`}
                      className="text-xs leading-none"
                    >
                      {team.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Gender Selection */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Gender</Label>
              <div className="flex gap-4">
                {(['Male', 'Female', 'Not Specified'] as const).map((gender) => (
                  <div key={gender} className="flex items-center space-x-2">
                    <Checkbox
                      id={`gender-${gender}`}
                      checked={(filters.genders || []).includes(gender)}
                      onCheckedChange={(checked) => 
                        updateMultiSelect('genders', gender, !!checked)
                      }
                    />
                    <Label htmlFor={`gender-${gender}`} className="text-sm">
                      {gender}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Birth Year Range */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Birth Year Range</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">From</Label>
                  <Input
                    type="number"
                    placeholder="1990"
                    min="1950"
                    max="2020"
                    onChange={(e) => {
                      const year = parseInt(e.target.value);
                      if (!isNaN(year)) {
                        const currentYears = filters.birthYears || [];
                        const maxYear = Math.max(...currentYears, year);
                        const range = [];
                        for (let y = year; y <= maxYear; y++) {
                          range.push(y);
                        }
                        updateFilter('birthYears', range);
                      }
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">To</Label>
                  <Input
                    type="number"
                    placeholder="2010"
                    min="1950"
                    max="2020"
                    onChange={(e) => {
                      const year = parseInt(e.target.value);
                      if (!isNaN(year)) {
                        const currentYears = filters.birthYears || [];
                        const minYear = Math.min(...currentYears, year);
                        const range = [];
                        for (let y = minYear; y <= year; y++) {
                          range.push(y);
                        }
                        updateFilter('birthYears', range);
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {/* Applied Filters Summary */}
        {activeFilterCount > 0 && (
          <div className="pt-3 border-t">
            <Label className="text-sm font-medium mb-2 block">Applied Filters</Label>
            <div className="flex flex-wrap gap-1">
              {filters.teams && filters.teams.map((teamId) => {
                const team = availableTeams.find(t => t.id === teamId);
                return team ? (
                  <Badge key={teamId} variant="outline" className="text-xs">
                    Team: {team.name}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 ml-1"
                      onClick={() => updateMultiSelect('teams', teamId, false)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ) : null;
              })}
              
              {filters.genders && filters.genders.map((gender) => (
                <Badge key={gender} variant="outline" className="text-xs">
                  {gender}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 ml-1"
                    onClick={() => updateMultiSelect('genders', gender, false)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AnalyticsFilters;