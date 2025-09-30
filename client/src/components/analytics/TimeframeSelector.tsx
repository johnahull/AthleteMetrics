/**
 * Reusable Timeframe Selector Component
 * Smart component for configuring analysis timeframes
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Clock } from 'lucide-react';
import { format } from 'date-fns';
import type { TimeframeConfig, TimeframeType, TimePeriod } from '@shared/analytics-types';

interface TimeframeSelectorProps {
  timeframe: TimeframeConfig;
  onTimeframeChange: (timeframe: TimeframeConfig) => void;
  /**
   * Type of analysis being performed
   * Controls which timeframe types are available:
   * - 'individual' and 'intra_group': All timeframe types available
   * - 'multi_group': Only 'best' values allowed (trends disabled for fair comparison)
   * @default 'individual'
   */
  analysisType?: 'individual' | 'intra_group' | 'multi_group';
  showRecommendations?: boolean;
  className?: string;
}

export function TimeframeSelector({
  timeframe,
  onTimeframeChange,
  analysisType = 'individual',
  showRecommendations = true,
  className
}: TimeframeSelectorProps) {
  const [customDateRange, setCustomDateRange] = useState<{
    from?: Date;
    to?: Date;
  }>({
    from: timeframe.startDate,
    to: timeframe.endDate
  });

  const handleTypeChange = (type: TimeframeType) => {
    const newTimeframe = { ...timeframe, type };

    // Auto-adjust period based on type
    if (type === 'best' && timeframe.period === 'custom') {
      newTimeframe.period = 'all_time';
    } else if (type === 'trends' && !timeframe.period) {
      newTimeframe.period = 'all_time';
    }

    onTimeframeChange(newTimeframe);
  };

  const handlePeriodChange = (period: TimePeriod) => {
    const newTimeframe = { ...timeframe, period };

    if (period === 'custom') {
      newTimeframe.startDate = customDateRange.from;
      newTimeframe.endDate = customDateRange.to;
    } else {
      // Clear custom dates when not using custom period
      delete newTimeframe.startDate;
      delete newTimeframe.endDate;
    }

    onTimeframeChange(newTimeframe);
  };

  const handleCustomDateChange = (range: { from?: Date; to?: Date }) => {
    setCustomDateRange(range);

    if (timeframe.period === 'custom') {
      onTimeframeChange({
        ...timeframe,
        startDate: range.from,
        endDate: range.to
      });
    }
  };

  // Get period options based on timeframe type
  const getPeriodOptions = (): { value: TimePeriod; label: string; description?: string }[] => {
    const baseOptions = [
      { value: 'last_7_days' as TimePeriod, label: 'Last 7 Days', description: 'Recent performance' },
      { value: 'last_30_days' as TimePeriod, label: 'Last 30 Days', description: 'Monthly trend' },
      { value: 'last_90_days' as TimePeriod, label: 'Last 90 Days', description: 'Quarterly analysis' },
      { value: 'this_year' as TimePeriod, label: 'This Year', description: 'Current year data' },
      { value: 'all_time' as TimePeriod, label: 'All Time', description: 'Complete history' },
      { value: 'custom' as TimePeriod, label: 'Custom Range', description: 'Select specific dates' }
    ];

    // Filter based on timeframe type
    if (timeframe.type === 'best') {
      // For best values, shorter periods might not make sense
      return baseOptions.filter(option =>
        !['last_7_days'].includes(option.value)
      );
    }

    return baseOptions;
  };

  // Get recommendations based on analysis type
  const getRecommendations = () => {
    if (!showRecommendations) return [];

    switch (analysisType) {
      case 'individual':
        return [
          { type: 'trends' as TimeframeType, period: 'all_time' as TimePeriod, reason: 'Shows complete progress over time' },
          { type: 'best' as TimeframeType, period: 'all_time' as TimePeriod, reason: 'Personal records' }
        ];
      case 'intra_group':
        return [
          { type: 'best' as TimeframeType, period: 'this_year' as TimePeriod, reason: 'Current season comparison' },
          { type: 'trends' as TimeframeType, period: 'all_time' as TimePeriod, reason: 'Complete group dynamics' }
        ];
      case 'multi_group':
        return [
          { type: 'best' as TimeframeType, period: 'this_year' as TimePeriod, reason: 'Fair group comparison' },
          { type: 'best' as TimeframeType, period: 'all_time' as TimePeriod, reason: 'Historical comparison' }
        ];
      default:
        return [];
    }
  };

  const recommendations = getRecommendations();
  const periodOptions = getPeriodOptions();

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Timeframe Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Analysis Type Selection */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Analysis Type *</Label>
          <Select value={timeframe.type} onValueChange={handleTypeChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="best">
                <div className="flex flex-col">
                  <span>Best Values</span>
                  <span className="text-xs text-muted-foreground">
                    Peak performance analysis
                  </span>
                </div>
              </SelectItem>
              {analysisType !== 'multi_group' && (
                <SelectItem value="trends">
                  <div className="flex flex-col">
                    <span>Trends Over Time</span>
                    <span className="text-xs text-muted-foreground">
                      Progress and change analysis
                    </span>
                  </div>
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          {analysisType === 'multi_group' && (
            <p id="multi-group-timeframe-help" className="text-xs text-muted-foreground">
              Multi-group mode uses best values for fair comparison. Trends unavailable in this mode.
            </p>
          )}
        </div>

        {/* Time Period Selection */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Time Period *</Label>
          <Select value={timeframe.period} onValueChange={handlePeriodChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periodOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex flex-col">
                    <span>{option.label}</span>
                    {option.description && (
                      <span className="text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Custom Date Range */}
        {timeframe.period === 'custom' && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Custom Date Range</Label>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex-1 justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customDateRange.from ? (
                      format(customDateRange.from, "PPP")
                    ) : (
                      <span>Start date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={customDateRange.from}
                    onSelect={(date) => handleCustomDateChange({ ...customDateRange, from: date })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex-1 justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customDateRange.to ? (
                      format(customDateRange.to, "PPP")
                    ) : (
                      <span>End date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={customDateRange.to}
                    onSelect={(date) => handleCustomDateChange({ ...customDateRange, to: date })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            {(!customDateRange.from || !customDateRange.to) && (
              <p className="text-xs text-amber-600">
                Please select both start and end dates for custom range
              </p>
            )}
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium text-blue-700">Recommended Settings</Label>
            <div className="space-y-2">
              {recommendations.map((rec, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => onTimeframeChange({ type: rec.type, period: rec.period })}
                  className="w-full justify-start h-auto p-3 border-blue-200 text-blue-700 hover:bg-blue-50"
                >
                  <div className="flex flex-col items-start">
                    <span className="font-medium">
                      {rec.type === 'best' ? 'Best Values' : 'Trends'} • {
                        periodOptions.find(p => p.value === rec.period)?.label
                      }
                    </span>
                    <span className="text-xs text-blue-600">{rec.reason}</span>
                  </div>
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Configuration Summary */}
        <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
          <div className="flex justify-between">
            <span>Configuration:</span>
            <span className="font-medium">
              {timeframe.type === 'best' ? 'Best Values' : 'Trends'} • {
                periodOptions.find(p => p.value === timeframe.period)?.label
              }
            </span>
          </div>
          {timeframe.period === 'custom' && customDateRange.from && customDateRange.to && (
            <div className="flex justify-between">
              <span>Date range:</span>
              <span className="font-medium">
                {format(customDateRange.from, "MMM dd")} - {format(customDateRange.to, "MMM dd")}
              </span>
            </div>
          )}
          <div className="text-blue-600 mt-2">
            {timeframe.type === 'best'
              ? 'Analyzing peak performance values within the selected period'
              : 'Analyzing performance changes over time'
            }
          </div>
        </div>
      </CardContent>
    </Card>
  );
}