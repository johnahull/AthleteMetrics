/**
 * Reusable Metrics Selector Component
 * Smart component for selecting primary and additional metrics
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, TrendingUp } from 'lucide-react';
import { METRIC_CONFIG } from '@shared/analytics-types';
import type { MetricSelection } from '@shared/analytics-types';

interface MetricsSelectorProps {
  metrics: MetricSelection;
  onMetricsChange: (metrics: MetricSelection) => void;
  maxAdditional?: number;
  showRecommendations?: boolean;
  className?: string;
}

export function MetricsSelector({
  metrics,
  onMetricsChange,
  maxAdditional = 5,
  showRecommendations = true,
  className
}: MetricsSelectorProps) {
  const availableMetrics = Object.keys(METRIC_CONFIG);

  const handlePrimaryMetricChange = (metric: string) => {
    // Remove from additional if it was there
    const newAdditional = metrics.additional.filter(m => m !== metric);
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

  // Get recommended metrics based on primary metric
  const getRecommendedMetrics = () => {
    // TODO: Implement metric recommendations based on sport science principles
    // For now, return some common combinations
    const recommendations: Record<string, string[]> = {
      FLY10_TIME: ['DASH_40YD', 'AGILITY_505'],
      VERTICAL_JUMP: ['RSI', 'FLY10_TIME'],
      AGILITY_505: ['AGILITY_5105', 'T_TEST'],
      AGILITY_5105: ['AGILITY_505', 'T_TEST'],
      T_TEST: ['AGILITY_505', 'AGILITY_5105'],
      DASH_40YD: ['FLY10_TIME', 'VERTICAL_JUMP'],
      RSI: ['VERTICAL_JUMP', 'FLY10_TIME']
    };

    const primaryRecs = recommendations[metrics.primary] || [];
    return primaryRecs.filter(metric =>
      metric !== metrics.primary && !metrics.additional.includes(metric)
    );
  };

  const recommendedMetrics = showRecommendations ? getRecommendedMetrics() : [];

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
                const config = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
                return (
                  <SelectItem key={metric} value={metric}>
                    <div className="flex flex-col">
                      <span>{config?.label || metric}</span>
                      <span className="text-xs text-muted-foreground">
                        {config?.unit} • {config?.lowerIsBetter ? 'Lower is better' : 'Higher is better'}
                      </span>
                    </div>
                  </SelectItem>
                );
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
                const config = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
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

        {/* Recommended Metrics */}
        {recommendedMetrics.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium text-blue-700">Recommended Metrics</Label>
            <div className="flex flex-wrap gap-2">
              {recommendedMetrics.slice(0, 3).map(metric => {
                const config = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
                return (
                  <Button
                    key={metric}
                    variant="outline"
                    size="sm"
                    onClick={() => handleAdditionalMetricToggle(metric, true)}
                    disabled={metrics.additional.length >= maxAdditional}
                    className="h-7 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
                  >
                    + {config?.label || metric}
                  </Button>
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
          <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
            {availableMetrics
              .filter((metric: string) =>
                metric !== metrics.primary &&
                !metrics.additional.includes(metric)
              )
              .map((metric: string) => {
                const config = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
                const isRecommended = recommendedMetrics.includes(metric);
                return (
                  <div key={metric} className="flex items-start space-x-2">
                    <Checkbox
                      id={`metric-${metric}`}
                      checked={false}
                      onCheckedChange={(checked) =>
                        handleAdditionalMetricToggle(metric, checked as boolean)
                      }
                      disabled={metrics.additional.length >= maxAdditional}
                    />
                    <label
                      htmlFor={`metric-${metric}`}
                      className={`text-xs leading-tight cursor-pointer ${
                        isRecommended ? 'text-blue-700 font-medium' : ''
                      }`}
                    >
                      {config?.label || metric}
                      {isRecommended && (
                        <span className="text-blue-500 text-[10px] block">recommended</span>
                      )}
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