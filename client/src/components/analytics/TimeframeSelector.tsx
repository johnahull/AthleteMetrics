/**
 * Reusable Timeframe Selector Component
 * Smart component for selecting analysis timeframe and type
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar, Clock } from 'lucide-react';
import type { TimeframeConfig, AnalysisType } from '@shared/analytics-types';

interface TimeframeSelectorProps {
  timeframe: TimeframeConfig;
  onTimeframeChange: (timeframe: Partial<TimeframeConfig>) => void;
  analysisType: AnalysisType;
  className?: string;
}

export function TimeframeSelector({
  timeframe,
  onTimeframeChange,
  analysisType,
  className
}: TimeframeSelectorProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Timeframe Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Analysis Type - Best vs Trends */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Analysis Type</Label>
          <RadioGroup
            value={timeframe.type}
            onValueChange={(value) => onTimeframeChange({ type: value as 'best' | 'trends' })}
            className="grid grid-cols-2 gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="best" id="type-best" />
              <Label htmlFor="type-best" className="text-sm cursor-pointer">
                <div>
                  <span className="font-medium">Best Values</span>
                  <div className="text-xs text-muted-foreground">
                    Show peak performance data
                  </div>
                </div>
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="trends" id="type-trends" />
              <Label htmlFor="type-trends" className="text-sm cursor-pointer">
                <div>
                  <span className="font-medium">Trends</span>
                  <div className="text-xs text-muted-foreground">
                    Show progress over time
                  </div>
                </div>
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Time Period */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Time Period</Label>
          <Select
            value={timeframe.period}
            onValueChange={(value) => onTimeframeChange({ period: value as any })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last_7_days">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Last 7 Days
                </div>
              </SelectItem>
              <SelectItem value="last_30_days">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Last 30 Days
                </div>
              </SelectItem>
              <SelectItem value="last_90_days">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Last 90 Days
                </div>
              </SelectItem>
              <SelectItem value="this_year">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  This Year
                </div>
              </SelectItem>
              <SelectItem value="all_time">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  All Time
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Configuration Summary */}
        <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
          <div className="flex justify-between">
            <span>Analysis focus:</span>
            <span className="font-medium">
              {timeframe.type === 'best' ? 'Peak performance' : 'Progress tracking'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Time period:</span>
            <span className="font-medium capitalize">
              {timeframe.period.replace('_', ' ')}
            </span>
          </div>
          {timeframe.type === 'trends' && (
            <div className="text-blue-600 text-xs mt-2">
              Trends view enables time-series analysis and progress tracking.
            </div>
          )}
          {timeframe.type === 'best' && (
            <div className="text-green-600 text-xs mt-2">
              Best values show peak performance achievements.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}