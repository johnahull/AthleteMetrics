/**
 * BenchmarkLineSelector Component
 * Multi-select dropdown for choosing which benchmark lines to display on charts
 */

import React, { useCallback, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useBenchmarksForMetric } from '@/lib/benchmarks-api';
import { useMetricConfig } from '@/hooks/use-metric-config';
import { formatMeasurement } from '@shared/duration-format';
import { BenchmarkSetQuickLoad } from '@/components/benchmark-sets';
import { BenchmarkChecklist } from '@/components/benchmarks/BenchmarkChecklist';
import type { FilterContext } from '@/components/benchmarks/benchmark-filtering';

type LineBenchmark = NonNullable<ReturnType<typeof useBenchmarksForMetric>['data']>[number];

// Module-level so BenchmarkChecklist's memos keep stable accessor props across renders
const getBenchmarkKey = (b: LineBenchmark) => b.id;
const getBenchmarkLabel = (b: LineBenchmark) => b.name;
const getBenchmarkMeta = (b: LineBenchmark) => ({ gender: b.filters?.gender });
const noGroup = () => '';

interface BenchmarkLineSelectorProps {
  organizationId: string;
  metricCode: string;
  selectedBenchmarkIds: string[];
  onSelectionChange: (benchmarkIds: string[]) => void;
  /** Optional label prefix (e.g., "Y-Axis" or "X-Axis") */
  labelPrefix?: string;
  /** Smart-default filter chips (e.g. the athlete's gender) */
  context?: FilterContext;
}

/**
 * BenchmarkLineSelector - Allows users to select benchmark lines to display on charts.
 * Memoized to prevent unnecessary re-renders when parent components update.
 */
export const BenchmarkLineSelector = React.memo(function BenchmarkLineSelector({
  organizationId,
  metricCode,
  selectedBenchmarkIds,
  onSelectionChange,
  labelPrefix,
  context
}: BenchmarkLineSelectorProps) {
  const { data: benchmarks, isLoading, error } = useBenchmarksForMetric(organizationId, metricCode);
  const { getMetricConfig } = useMetricConfig();

  const metricConfig = getMetricConfig(metricCode);
  const durationConfig = metricConfig?.displayFormat === 'duration' ? metricConfig : null;
  // A duration target prints as m:ss, which carries no unit
  const unit = durationConfig ? '' : metricConfig?.unit || '';
  const target = (v: number | string) => (durationConfig ? formatMeasurement(Number(v), durationConfig) : v);
  const metricLabel = metricConfig?.label || metricCode;

  // Build the display label
  const displayLabel = labelPrefix
    ? `${labelPrefix} Benchmarks (${metricLabel})`
    : `Benchmarks for ${metricLabel}`;

  // Generate unique IDs for accessibility (supports multiple selectors on same page)
  const selectorId = useMemo(() => {
    const base = metricCode.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return `benchmark-selector-${base}`;
  }, [metricCode]);

  // Handle loading benchmarks from a set - filters to only include benchmarks available for this metric
  const handleLoadFromSet = useCallback((setBenchmarkIds: { id: string; type: 'site' | 'custom' }[]) => {
    if (benchmarks) {
      // Get benchmark IDs from the set (these are the benchmark identifiers)
      const setIds = new Set(setBenchmarkIds.map(b => b.id));

      // Filter to only benchmarks available for this metric
      // The benchmark's `id` is the identifier we need to match against
      const validBenchmarkIds = benchmarks
        .filter(b => setIds.has(b.id))
        .map(b => b.id);

      // Keep existing selections from other metrics, add matching benchmarks from set
      const currentMetricIds = new Set(benchmarks.map(b => b.id));
      const existingOtherMetrics = selectedBenchmarkIds.filter(id => !currentMetricIds.has(id));
      onSelectionChange([...existingOtherMetrics, ...validBenchmarkIds]);
    }
  }, [benchmarks, selectedBenchmarkIds, onSelectionChange]);

  // Format demographic filters for display - memoized for performance
  const formatFilters = useCallback((filters?: {
    gender?: string;
    ageMin?: number;
    ageMax?: number;
    position?: string;
  }) => {
    if (!filters) return [];

    const badges: string[] = [];
    if (filters.gender) {
      badges.push(filters.gender);
    }
    if (filters.ageMin !== undefined && filters.ageMax !== undefined) {
      badges.push(`${filters.ageMin}-${filters.ageMax}`);
    } else if (filters.ageMin !== undefined) {
      badges.push(`${filters.ageMin}+`);
    } else if (filters.ageMax !== undefined) {
      badges.push(`≤${filters.ageMax}`);
    }
    if (filters.position) {
      badges.push(filters.position);
    }

    return badges;
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-2" role="status" aria-label="Loading benchmarks">
        <div className="text-sm font-medium" id={selectorId}>{displayLabel}</div>
        <Skeleton className="h-10 w-full" aria-hidden="true" />
        <div className="text-sm text-muted-foreground">Loading benchmarks...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-2" role="alert">
        <div className="text-sm font-medium">{displayLabel}</div>
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load benchmarks: {error.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Empty state
  if (!benchmarks || benchmarks.length === 0) {
    return (
      <div className="space-y-2">
        <div className="text-sm font-medium">{displayLabel}</div>
        <Alert>
          <AlertDescription>
            No benchmarks available for {metricLabel}. Create benchmarks in the Benchmarks page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Count how many of this metric's benchmarks are selected
  const selectedCount = benchmarks.filter(b => selectedBenchmarkIds.includes(b.id)).length;

  return (
    <div className="space-y-3">
      {/* Header with controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm font-medium" id={selectorId}>
          {displayLabel} ({selectedCount} of {benchmarks.length} selected)
        </div>
        <div className="flex gap-2 flex-wrap" role="group" aria-label="Benchmark selection actions">
          <BenchmarkSetQuickLoad
            organizationId={organizationId}
            onLoadSet={handleLoadFromSet}
            context={context}
          />
        </div>
      </div>

      {/* Benchmark list */}
      <div role="group" aria-labelledby={selectorId} aria-describedby={`${selectorId}-hint`}>
        <span id={`${selectorId}-hint`} className="sr-only">
          Select benchmarks to display as horizontal lines on the chart
        </span>
        <BenchmarkChecklist
          items={benchmarks}
          getKey={getBenchmarkKey}
          getLabel={getBenchmarkLabel}
          getMeta={getBenchmarkMeta}
          groupBy={noGroup}
          selected={selectedBenchmarkIds}
          onChange={onSelectionChange}
          context={context}
          renderDetail={(benchmark) => {
            const filterBadges = formatFilters(benchmark.filters);
            return (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-muted-foreground">
                  {benchmark.comparisonOperator === 'range' && benchmark.minValue != null && benchmark.maxValue != null
                    ? `Target: ${target(benchmark.minValue)} - ${target(benchmark.maxValue)}${unit}`
                    : benchmark.benchmarkValue != null
                      ? `Target: ${target(benchmark.benchmarkValue)}${unit} (${benchmark.comparisonOperator === 'lte' ? '≤' : benchmark.comparisonOperator === 'gte' ? '≥' : '='})`
                      : 'Range benchmark'
                  }
                </span>
                {filterBadges.length > 0 && (
                  <div className="flex gap-1" aria-label="Demographic filters">
                    {filterBadges.map((badge, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {badge}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            );
          }}
        />
      </div>
    </div>
  );
});
