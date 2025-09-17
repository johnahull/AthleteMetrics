import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, X, Filter, RotateCcw, AlertTriangle, Info } from 'lucide-react';
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
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

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
    setValidationErrors([]);
    onReset();
  }, [onReset]);

  // Validation logic
  const validateFilters = useCallback(() => {
    const errors: string[] = [];

    // Birth year range validation
    const fromYear = filters.birthYearFrom;
    const toYear = filters.birthYearTo;
    if (fromYear && toYear && fromYear > toYear) {
      errors.push('Birth year "From" must be less than or equal to "To"');
    }
    if (fromYear && fromYear > new Date().getFullYear()) {
      errors.push('Birth year "From" cannot be in the future');
    }
    if (toYear && toYear > new Date().getFullYear()) {
      errors.push('Birth year "To" cannot be in the future');
    }

    // Custom date range validation
    if (timeframe.period === 'custom') {
      if (!customDateRange.from && !customDateRange.to) {
        errors.push('Custom date range requires at least one date to be selected');
      }
      if (customDateRange.from && customDateRange.to && customDateRange.from > customDateRange.to) {
        errors.push('Start date must be before end date');
      }
      if (customDateRange.from && customDateRange.from > new Date()) {
        errors.push('Start date cannot be in the future');
      }
      if (customDateRange.to && customDateRange.to > new Date()) {
        errors.push('End date cannot be in the future');
      }
    }

    // Team and athlete selection validation
    if (analysisType === 'individual' && !availableAthletes.length) {
      errors.push('No athletes available for individual analysis');
    }

    // Metric combination validation
    if (metrics.additional.length > 5) {
      errors.push('Maximum of 5 additional metrics allowed');
    }

    // Data availability warning (not an error, but useful feedback)
    const totalFilters = [
      filters.teams?.length || 0,
      filters.genders?.length || 0,
      filters.birthYears?.length || 0
    ].reduce((sum, count) => sum + count, 0);

    if (totalFilters > 10) {
      errors.push('Warning: Very specific filters may result in limited data');
    }

    setValidationErrors(errors);
    return errors.length === 0;
  }, [filters, timeframe, customDateRange, analysisType, availableAthletes, metrics]);

  // Run validation when filters change
  useEffect(() => {
    validateFilters();
  }, [validateFilters]);

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

      <CardContent>
        {/* Validation Feedback */}
        {validationErrors.length > 0 && (
          <div className="mb-4 space-y-2">
            {validationErrors.map((error, index) => (
              <Alert
                key={index}
                variant={error.startsWith('Warning:') ? 'default' : 'destructive'}
                className="py-2"
              >
                {error.startsWith('Warning:') ? (
                  <Info className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                <AlertDescription className="text-sm">
                  {error}
                </AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        {/* Main filters in horizontal layout */}
        <div className="flex flex-wrap gap-6 items-end">
          {/* Primary Metric */}
          <div className="min-w-48">
            <Label className="text-sm font-medium">Primary Metric</Label>
            <Select value={metrics.primary} onValueChange={(value) => handleMetricChange('primary', value)}>
              <SelectTrigger className="mt-2">
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

          {/* Timeframe Type */}
          <div className="min-w-36">
            <Label className="text-sm font-medium">Data Type</Label>
            <div className="grid grid-cols-2 gap-1 mt-2">
              <Button
                variant={timeframe.type === 'best' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleTimeframeChange({ type: 'best' })}
                className="text-xs"
              >
                Best
              </Button>
              <Button
                variant={timeframe.type === 'trends' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleTimeframeChange({ type: 'trends' })}
                className="text-xs"
              >
                Trends
              </Button>
            </div>
          </div>

          {/* Time Period */}
          <div className="min-w-40">
            <Label className="text-sm font-medium">Period</Label>
            <Select
              value={timeframe.period}
              onValueChange={(value) => handleTimeframeChange({
                period: value as TimeframeConfig['period']
              })}
            >
              <SelectTrigger className="mt-2">
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
          </div>

          {/* Custom Date Range */}
          {timeframe.period === 'custom' && (
            <div className="flex gap-2">
              <div>
                <Label className="text-sm font-medium">From</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-start text-left font-normal mt-2 w-36">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customDateRange.from ? format(customDateRange.from, "MMM d") : "From"}
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
              </div>

              <div>
                <Label className="text-sm font-medium">To</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-start text-left font-normal mt-2 w-36">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customDateRange.to ? format(customDateRange.to, "MMM d") : "To"}
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
            </div>
          )}
        </div>

        {/* Additional Metrics - shown horizontally when expanded */}
        {metrics.additional.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <Label className="text-sm font-medium">Additional Metrics</Label>
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
          </div>
        )}

        {/* Expandable section for additional metrics and advanced filters */}
        {isExpanded && (
          <div className="mt-6 pt-6 border-t space-y-6">
            {/* Additional Metrics Selection */}
            <div>
              <Label className="text-sm font-medium mb-3 block">
                Add More Metrics (up to 5 total)
              </Label>
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
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
            </div>

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
                    placeholder="2000"
                    min="1950"
                    max="2020"
                    value={filters.birthYearFrom || ''}
                    className={
                      validationErrors.some(error =>
                        error.includes('Birth year "From"') ||
                        (error.includes('Birth year') && error.includes('less than'))
                      ) ? 'border-red-500 focus:border-red-500' : ''
                    }
                    onChange={(e) => {
                      const fromYear = parseInt(e.target.value) || undefined;
                      const toYear = filters.birthYearTo;

                      // Update the from year
                      updateFilter('birthYearFrom', fromYear);

                      // Create range if both from and to are set
                      if (fromYear && toYear && fromYear <= toYear) {
                        const range = [];
                        for (let y = fromYear; y <= toYear; y++) {
                          range.push(y);
                        }
                        updateFilter('birthYears', range);
                      } else if (fromYear && !toYear) {
                        // If only from is set, include all years from that year onwards (up to current year)
                        const currentYear = new Date().getFullYear();
                        const range = [];
                        for (let y = fromYear; y <= currentYear; y++) {
                          range.push(y);
                        }
                        updateFilter('birthYears', range);
                      } else {
                        // Clear birth years if invalid range
                        updateFilter('birthYears', []);
                      }
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">To</Label>
                  <Input
                    type="number"
                    placeholder="2020"
                    min="1950"
                    max="2020"
                    value={filters.birthYearTo || ''}
                    className={
                      validationErrors.some(error =>
                        error.includes('Birth year "To"') ||
                        (error.includes('Birth year') && error.includes('less than'))
                      ) ? 'border-red-500 focus:border-red-500' : ''
                    }
                    onChange={(e) => {
                      const toYear = parseInt(e.target.value) || undefined;
                      const fromYear = filters.birthYearFrom;

                      // Update the to year
                      updateFilter('birthYearTo', toYear);

                      // Create range if both from and to are set
                      if (fromYear && toYear && fromYear <= toYear) {
                        const range = [];
                        for (let y = fromYear; y <= toYear; y++) {
                          range.push(y);
                        }
                        updateFilter('birthYears', range);
                      } else if (!fromYear && toYear) {
                        // If only to is set, include all years up to that year (from 1950)
                        const range = [];
                        for (let y = 1950; y <= toYear; y++) {
                          range.push(y);
                        }
                        updateFilter('birthYears', range);
                      } else {
                        // Clear birth years if invalid range
                        updateFilter('birthYears', []);
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
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