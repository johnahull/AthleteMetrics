/**
 * SelectMetricsStep Component
 * Step 3: Select metrics for measurement template (measurements only)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ChevronLeft, ChevronRight, AlertCircle, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAvailableMetrics } from '@/hooks/use-available-metrics';
import { COMMON_METRICS } from '@shared/import-types';

interface SelectMetricsStepProps {
  selectedMetricCodes: string[];
  onNext: (metricCodes: string[]) => void;
  onBack: () => void;
  onCancel: () => void;
}

export function SelectMetricsStep({
  selectedMetricCodes,
  onNext,
  onBack,
  onCancel
}: SelectMetricsStepProps) {
  const [localSelectedCodes, setLocalSelectedCodes] = useState<string[]>(selectedMetricCodes);
  const { metrics, isLoading, error } = useAvailableMetrics();

  // Initialize with common metrics if nothing selected
  useEffect(() => {
    if (selectedMetricCodes.length === 0 && metrics.length > 0) {
      const commonMetricsAvailable = metrics
        .filter((m) => COMMON_METRICS.includes(m.code as any))
        .map((m) => m.code);
      setLocalSelectedCodes(commonMetricsAvailable);
    } else {
      setLocalSelectedCodes(selectedMetricCodes);
    }
  }, [selectedMetricCodes, metrics]);

  // Group metrics by category
  const groupedMetrics = useMemo(() => {
    const groups: Record<string, typeof metrics> = {};
    metrics.forEach((metric) => {
      const category = metric.category || 'Other';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(metric);
    });
    return groups;
  }, [metrics]);

  const handleToggle = (code: string) => {
    setLocalSelectedCodes((prev) =>
      prev.includes(code)
        ? prev.filter((c) => c !== code)
        : [...prev, code]
    );
  };

  const handleSelectAll = () => {
    setLocalSelectedCodes(metrics.map((m) => m.code));
  };

  const handleSelectCommon = () => {
    const commonMetricsAvailable = metrics
      .filter((m) => COMMON_METRICS.includes(m.code as any))
      .map((m) => m.code);
    setLocalSelectedCodes(commonMetricsAvailable);
  };

  const handleClearAll = () => {
    setLocalSelectedCodes([]);
  };

  const handleNext = () => {
    onNext(localSelectedCodes);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading metrics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load metrics. Please try again.
        </AlertDescription>
      </Alert>
    );
  }

  if (!metrics || metrics.length === 0) {
    return (
      <div className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No metrics available. Please contact your administrator to enable metrics for your organization.
          </AlertDescription>
        </Alert>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Select Metrics</h3>
        <p className="text-sm text-muted-foreground">
          Choose which metrics to include in your template. The most commonly used metrics are pre-selected.
        </p>
      </div>

      {/* Bulk actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSelectCommon}
          className="gap-2"
        >
          <Zap className="h-3 w-3" />
          Common Metrics
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSelectAll}
          disabled={localSelectedCodes.length === metrics.length}
        >
          Select All
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClearAll}
          disabled={localSelectedCodes.length === 0}
        >
          Clear All
        </Button>
        <div className="ml-auto text-sm text-muted-foreground">
          {localSelectedCodes.length} selected
        </div>
      </div>

      {/* Metrics grouped by category */}
      <div className="border rounded-lg max-h-[400px] overflow-y-auto">
        {Object.entries(groupedMetrics).map(([category, categoryMetrics]) => (
          <div key={category} className="border-b last:border-b-0">
            {/* Category header */}
            <div className="bg-muted/50 px-3 py-2 font-medium text-sm sticky top-0">
              {category}
            </div>

            {/* Metrics in category */}
            <div className="divide-y">
              {categoryMetrics.map((metric) => {
                const isSelected = localSelectedCodes.includes(metric.code);
                const isCommon = COMMON_METRICS.includes(metric.code as any);
                return (
                  <div
                    key={metric.code}
                    className={cn(
                      'flex items-start gap-3 p-3 hover:bg-muted/50 cursor-pointer transition-colors',
                      isSelected && 'bg-muted/30'
                    )}
                    onClick={() => handleToggle(metric.code)}
                  >
                    <Checkbox
                      id={`metric-${metric.code}`}
                      checked={isSelected}
                      onCheckedChange={() => handleToggle(metric.code)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1"
                    />
                    <Label
                      htmlFor={`metric-${metric.code}`}
                      className="flex-1 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{metric.label}</span>
                        {isCommon && (
                          <Badge variant="secondary" className="text-xs">
                            Common
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {metric.description || `Unit: ${metric.unit || 'N/A'}`}
                      </div>
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Navigation buttons */}
      <div className="flex gap-2 pt-4">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button
          onClick={handleNext}
          disabled={localSelectedCodes.length === 0}
          className="ml-auto"
        >
          Next
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
