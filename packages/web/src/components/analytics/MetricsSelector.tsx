/**
 * Reusable Metrics Selector Component
 * Smart component for selecting primary and additional metrics
 * Now supports dynamic metrics from organization configuration
 */

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, TrendingUp } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { MetricSelection, AnalysisType, DynamicMetricConfig } from '@shared/analytics-types';
import { MetricIndicator } from './MetricIndicator';
import { useAvailableMetrics } from '@/hooks/use-available-metrics';

// Mutually exclusive metrics - selecting one prevents selecting the other
// FLY10_TIME and TOP_SPEED measure the same thing (speed), just in different ways
// Derived metrics are mutually exclusive with their source metrics
// Using tuple approach to ensure symmetric mappings
const MUTUALLY_EXCLUSIVE_PAIRS: Array<[string, string]> = [
  ['FLY10_TIME', 'TOP_SPEED'],
];

interface MetricsSelectorProps {
  metrics: MetricSelection;
  onMetricsChange: (metrics: MetricSelection) => void;
  maxAdditional?: number;
  className?: string;
  /**
   * Type of analysis being performed
   * Controls metric selection behavior:
   * - 'individual' and 'intra_group': Additional metrics can be added (up to maxAdditional)
   * - 'multi_group': Additional metrics disabled (single metric required for fair comparison)
   *
   * Multi-group mode enforces a single metric to ensure:
   * - Consistent measurement across all groups
   * - Fair cross-group comparisons
   * - Clear, interpretable visualizations
   *
   * @default 'individual'
   */
  analysisType?: AnalysisType;
  /**
   * Count of measurements per metric for current filters
   * Used to show data availability indicators
   */
  metricsAvailability?: Record<string, number>;
  /**
   * Maximum count across all metrics (provided by server for normalization)
   * If not provided, will be calculated client-side from metricsAvailability
   */
  maxMetricCount?: number;
}

export function MetricsSelector({
  metrics,
  onMetricsChange,
  maxAdditional = 5,
  className,
  analysisType = 'individual',
  metricsAvailability = {},
  maxMetricCount
}: MetricsSelectorProps) {
  // Get available metrics using centralized hook (filters by active+enabled)
  const { metrics: availableMetricsList } = useAvailableMetrics();

  // Build dynamic metric configs
  const dynamicMetrics = useMemo((): DynamicMetricConfig[] => {
    return availableMetricsList.map(m => ({
      code: m.code,
      label: m.label,
      category: m.category,
      unit: m.unit,
      metricType: m.metricType,
      isActive: true, // Already filtered by hook
      isSystemDefault: false, // Not exposed by hook, but not needed for display
      isDerived: m.isDerived,
      formula: m.formula,
      dependentMetrics: m.dependentMetrics,
    }));
  }, [availableMetricsList]);

  const availableMetrics = dynamicMetrics.map(m => m.code);
  const metricConfigMap = useMemo(
    () => Object.fromEntries(dynamicMetrics.map(m => [m.code, m])),
    [dynamicMetrics]
  );

  // Build mutually exclusive metrics map including derived metrics and their sources
  const MUTUALLY_EXCLUSIVE_METRICS = useMemo(() => {
    const exclusions: Record<string, string[]> = {};

    // Add static pairs
    MUTUALLY_EXCLUSIVE_PAIRS.forEach(([a, b]) => {
      if (!exclusions[a]) exclusions[a] = [];
      if (!exclusions[b]) exclusions[b] = [];
      exclusions[a].push(b);
      exclusions[b].push(a);
    });

    // Add derived metrics and their dependencies
    dynamicMetrics.forEach(metric => {
      if (metric.isDerived && metric.dependentMetrics) {
        if (!exclusions[metric.code]) exclusions[metric.code] = [];

        metric.dependentMetrics.forEach(depCode => {
          // Derived metric excludes its sources
          if (!exclusions[metric.code].includes(depCode)) {
            exclusions[metric.code].push(depCode);
          }

          // Sources exclude the derived metric
          if (!exclusions[depCode]) exclusions[depCode] = [];
          if (!exclusions[depCode].includes(metric.code)) {
            exclusions[depCode].push(metric.code);
          }
        });
      }
    });

    return exclusions;
  }, [dynamicMetrics]);

  // Memoize multi-group check to avoid recalculating in map loop
  const isMultiGroupMode = analysisType === 'multi_group';

  // Use server-provided maxCount if available, otherwise calculate client-side
  const maxCount = useMemo(() => {
    if (maxMetricCount !== undefined) {
      return maxMetricCount;
    }
    const counts = Object.values(metricsAvailability);
    return counts.length > 0 ? Math.max(...counts) : 0;
  }, [metricsAvailability, maxMetricCount]);

  const handlePrimaryMetricChange = (metric: string) => {
    // Remove from additional if it was there
    let newAdditional = metrics.additional.filter(m => m !== metric);

    // Check for mutually exclusive metrics
    const exclusiveMetrics = MUTUALLY_EXCLUSIVE_METRICS[metric] || [];
    if (exclusiveMetrics.length > 0) {
      // Remove all mutually exclusive metrics from additional
      newAdditional = newAdditional.filter(m => !exclusiveMetrics.includes(m));
    }

    onMetricsChange({
      primary: metric,
      additional: newAdditional
    });
  };

  const handleAdditionalMetricToggle = (metric: string, checked: boolean) => {
    if (checked) {
      // Don't add if it's the primary metric or we're at the limit
      if (metric === metrics.primary || metrics.additional.length >= maxAdditional) {
        return;
      }

      // Check for mutual exclusion
      const exclusiveMetrics = MUTUALLY_EXCLUSIVE_METRICS[metric] || [];
      const hasExclusiveMetric = exclusiveMetrics.some(em =>
        metrics.primary === em || metrics.additional.includes(em)
      );
      if (hasExclusiveMetric) {
        // Don't add if any mutually exclusive metric is already selected
        return;
      }

      onMetricsChange({
        ...metrics,
        additional: [...metrics.additional, metric]
      });
    } else {
      onMetricsChange({
        ...metrics,
        additional: metrics.additional.filter(m => m !== metric)
      });
    }
  };

  const removeAdditionalMetric = (metric: string) => {
    onMetricsChange({
      ...metrics,
      additional: metrics.additional.filter(m => m !== metric)
    });
  };

  const clearAdditionalMetrics = () => {
    onMetricsChange({
      ...metrics,
      additional: []
    });
  };


  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Metrics Selection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Primary Metric Selection */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Primary Metric *</Label>
          <Select value={metrics.primary} onValueChange={handlePrimaryMetricChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select primary metric..." />
            </SelectTrigger>
            <SelectContent>
              {availableMetrics.map(metric => {
                const config = metricConfigMap[metric];
                const count = metricsAvailability[metric] || 0;
                const hasData = count > 0;

                const selectItem = (
                  <SelectItem key={metric} value={metric} disabled={!hasData}>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className={!hasData ? 'text-muted-foreground' : ''}>
                          {config?.label || metric}
                          {!hasData && <span className="text-xs ml-1">(no data)</span>}
                        </span>
                        {config?.isDerived && (
                          <Badge variant="outline" className="text-xs py-0 px-1">fx</Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground flex items-center gap-2">
                        <span>
                          {config?.unit} • {config?.metricType === 'tracking' ? 'Tracking' : config?.metricType === 'lower_is_better' ? 'Lower is better' : 'Higher is better'}
                        </span>
                        {hasData && <MetricIndicator count={count} maxCount={maxCount} />}
                      </span>
                    </div>
                  </SelectItem>
                );

                // Wrap derived metrics in a tooltip
                if (config?.isDerived && config?.formula && config?.dependentMetrics) {
                  return (
                    <TooltipProvider key={metric}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          {selectItem}
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="text-xs">
                            <div>Formula: {config.formula}</div>
                            <div>Depends on: {config.dependentMetrics.map(m => metricConfigMap[m]?.label || m).join(', ')}</div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                }

                return selectItem;
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Selected Additional Metrics */}
        {metrics.additional.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Additional Metrics</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAdditionalMetrics}
                className="h-6 px-2 text-xs"
              >
                Clear all
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {metrics.additional.map(metric => {
                const config = metricConfigMap[metric];
                return (
                  <Badge key={metric} variant="secondary" className="flex items-center gap-1">
                    {config?.label || metric}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAdditionalMetric(metric)}
                      className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                );
              })}
            </div>
          </div>
        )}


        {/* Additional Metrics Selection */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">
            Add More Metrics ({metrics.additional.length}/{maxAdditional})
          </Label>
          {isMultiGroupMode && (
            <p
              id="multi-group-metrics-help"
              className="text-xs text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              Multi-group mode requires a single metric for fair comparison.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
            {availableMetrics
              .filter((metric: string) =>
                metric !== metrics.primary &&
                !metrics.additional.includes(metric)
              )
              .map((metric: string) => {
                const config = metricConfigMap[metric];
                const count = metricsAvailability[metric] || 0;
                const hasData = count > 0;

                // Check if this metric is mutually exclusive with a selected metric
                const exclusiveMetrics = MUTUALLY_EXCLUSIVE_METRICS[metric] || [];
                const conflictingMetric = exclusiveMetrics.find(em =>
                  metrics.primary === em || metrics.additional.includes(em)
                );
                const isExcluded = !!conflictingMetric;

                const isDisabled = !hasData ||
                                   metrics.additional.length >= maxAdditional ||
                                   isMultiGroupMode ||
                                   isExcluded;

                return (
                  <div key={metric} className="flex items-start space-x-2">
                    <Checkbox
                      id={`metric-${metric}`}
                      checked={false}
                      onCheckedChange={(checked) =>
                        handleAdditionalMetricToggle(metric, checked as boolean)
                      }
                      disabled={isDisabled}
                      aria-describedby={isMultiGroupMode ? 'multi-group-metrics-help' : undefined}
                    />
                    <label
                      htmlFor={`metric-${metric}`}
                      className={`text-xs leading-tight cursor-pointer flex flex-col gap-0.5 ${
                        !hasData || isExcluded ? 'text-muted-foreground' : ''
                      }`}
                      title={isExcluded && conflictingMetric ? `Cannot select with ${metricConfigMap[conflictingMetric]?.label}` : !hasData ? 'No data available' : undefined}
                    >
                      <span>
                        {config?.label || metric}
                        {isExcluded && <span className="text-xs ml-1">(conflicts)</span>}
                        {!hasData && <span className="text-xs ml-1">(no data)</span>}
                      </span>
                      {hasData && <MetricIndicator count={count} maxCount={maxCount} />}
                    </label>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Metrics Summary */}
        <div className="pt-2 border-t text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Total metrics selected:</span>
            <span className="font-medium">{metrics.additional.length + 1}</span>
          </div>
          {metrics.additional.length > 0 && (
            <div className="mt-1 text-amber-600">
              Multiple metrics enable advanced visualizations like radar charts and scatter plots.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}