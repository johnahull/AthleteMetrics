/**
 * Reusable Analytics Toolbar Component
 * Unified toolbar with common analytics actions
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Download, Maximize2, Settings, BarChart3, Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ChartType, AnalyticsResponse } from '@shared/analytics-types';

interface AnalyticsToolbarProps {
  // Chart Configuration
  selectedChartType: ChartType;
  availableChartTypes: ChartType[];
  onChartTypeChange: (chartType: ChartType) => void;
  formatChartTypeName: (chartType: string) => string;

  // Data and Actions
  analyticsData: AnalyticsResponse | null;
  isLoading: boolean;
  onRefresh: () => void;
  onExport?: () => void;
  onFullscreen?: () => void;

  // Settings
  showSettings?: boolean;
  onSettingsClick?: () => void;

  // Layout
  layout?: 'horizontal' | 'vertical';
  showDataSummary?: boolean;
  className?: string;
}

export function AnalyticsToolbar({
  selectedChartType,
  availableChartTypes,
  onChartTypeChange,
  formatChartTypeName,
  analyticsData,
  isLoading,
  onRefresh,
  onExport,
  onFullscreen,
  showSettings = false,
  onSettingsClick,
  layout = 'horizontal',
  showDataSummary = true,
  className
}: AnalyticsToolbarProps) {
  const isVerticalLayout = layout === 'vertical';
  const gridCols = isVerticalLayout ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-4';

  return (
    <div className={`grid ${gridCols} gap-4 ${className}`}>
      {/* Chart Type Selection */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Chart Type</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Select value={selectedChartType} onValueChange={onChartTypeChange}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableChartTypes.map((chartType) => (
                <SelectItem key={chartType} value={chartType}>
                  {formatChartTypeName(chartType)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {availableChartTypes.length > 1 && (
            <p className="text-xs text-muted-foreground mt-1">
              {availableChartTypes.length} chart types available
            </p>
          )}
        </CardContent>
      </Card>

      {/* Data Summary */}
      {showDataSummary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1">
              Data Summary
              {analyticsData && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-4 w-4 p-0">
                      <Info className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 text-xs">
                    <div className="space-y-2">
                      <h4 className="font-medium">Data Details</h4>
                      {analyticsData.meta && (
                        <div className="space-y-1">
                          {analyticsData.meta.totalAthletes && (
                            <div className="flex justify-between">
                              <span>Athletes:</span>
                              <span>{analyticsData.meta.totalAthletes}</span>
                            </div>
                          )}
                          {analyticsData.meta.totalMeasurements && (
                            <div className="flex justify-between">
                              <span>Measurements:</span>
                              <span>{analyticsData.meta.totalMeasurements}</span>
                            </div>
                          )}
                          {analyticsData.meta.dateRange && (
                            <div className="flex justify-between">
                              <span>Date range:</span>
                              <span>
                                {new Date(analyticsData.meta.dateRange.start).toLocaleDateString()} - {' '}
                                {new Date(analyticsData.meta.dateRange.end).toLocaleDateString()}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Athletes:</span>
              <Badge variant="secondary" className="text-xs">
                {analyticsData?.meta?.totalAthletes || 0}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span>Measurements:</span>
              <Badge variant="secondary" className="text-xs">
                {analyticsData?.meta?.totalMeasurements || 0}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Actions</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          <div className="flex flex-col gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
              className="h-7 text-xs justify-start"
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {onExport && (
              <Button
                variant="outline"
                size="sm"
                onClick={onExport}
                disabled={!analyticsData || isLoading}
                className="h-7 text-xs justify-start"
              >
                <Download className="h-3 w-3 mr-1" />
                Export
              </Button>
            )}
            {onFullscreen && (
              <Button
                variant="outline"
                size="sm"
                onClick={onFullscreen}
                disabled={!analyticsData || isLoading}
                className="h-7 text-xs justify-start"
              >
                <Maximize2 className="h-3 w-3 mr-1" />
                Fullscreen
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Settings and Quick Stats */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            Quick Stats
            {showSettings && onSettingsClick && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onSettingsClick}
                className="h-6 w-6 p-0"
              >
                <Settings className="h-3 w-3" />
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-1 text-sm">
          {analyticsData?.statistics && Object.keys(analyticsData.statistics).length > 0 ? (
            Object.entries(analyticsData.statistics).slice(0, 2).map(([metric, stats]) => (
              <div key={metric} className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">{metric}:</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs">Avg:</span>
                  <span className="font-mono text-xs">{stats.mean.toFixed(2)}</span>
                </div>
                {Object.keys(analyticsData.statistics).length === 1 && (
                  <div className="flex justify-between">
                    <span className="text-xs">Range:</span>
                    <span className="font-mono text-xs">
                      {stats.min.toFixed(2)} - {stats.max.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-xs text-muted-foreground">No statistics available</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}