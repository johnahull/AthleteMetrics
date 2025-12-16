/**
 * BenchmarkLineSelector Component
 * Multi-select dropdown for choosing which benchmark lines to display on charts
 */

import React, { useCallback, useMemo } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useBenchmarksForMetric } from '@/lib/benchmarks-api';
import { useMetricConfig } from '@/hooks/use-metric-config';

interface BenchmarkLineSelectorProps {
  organizationId: string;
  metricCode: string;
  selectedBenchmarkIds: string[];
  onSelectionChange: (benchmarkIds: string[]) => void;
}

/**
 * BenchmarkLineSelector - Allows users to select benchmark lines to display on charts.
 * Memoized to prevent unnecessary re-renders when parent components update.
 */
export const BenchmarkLineSelector = React.memo(function BenchmarkLineSelector({
  organizationId,
  metricCode,
  selectedBenchmarkIds,
  onSelectionChange
}: BenchmarkLineSelectorProps) {
  const { data: benchmarks, isLoading, error } = useBenchmarksForMetric(organizationId, metricCode);
  const { getMetricConfig } = useMetricConfig();

  const metricConfig = getMetricConfig(metricCode);
  const unit = metricConfig?.unit || '';

  // Handle individual checkbox toggle - memoized for performance
  const handleToggle = useCallback((benchmarkId: string) => {
    const isSelected = selectedBenchmarkIds.includes(benchmarkId);
    const newSelection = isSelected
      ? selectedBenchmarkIds.filter(id => id !== benchmarkId)
      : [...selectedBenchmarkIds, benchmarkId];
    onSelectionChange(newSelection);
  }, [selectedBenchmarkIds, onSelectionChange]);

  // Handle "Select All" - memoized for performance
  const handleSelectAll = useCallback(() => {
    if (benchmarks) {
      onSelectionChange(benchmarks.map(b => b.id));
    }
  }, [benchmarks, onSelectionChange]);

  // Handle "Clear All" - memoized for performance
  const handleClearAll = useCallback(() => {
    onSelectionChange([]);
  }, [onSelectionChange]);

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

  // Memoize selection state calculations
  const { allSelected, noneSelected } = useMemo(() => ({
    allSelected: benchmarks ? benchmarks.length === selectedBenchmarkIds.length : false,
    noneSelected: selectedBenchmarkIds.length === 0
  }), [benchmarks, selectedBenchmarkIds]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-2" role="status" aria-label="Loading benchmarks">
        <div className="text-sm font-medium" id="benchmark-selector-label">Benchmark Lines</div>
        <Skeleton className="h-10 w-full" aria-hidden="true" />
        <div className="text-sm text-muted-foreground">Loading benchmarks...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-2" role="alert">
        <div className="text-sm font-medium">Benchmark Lines</div>
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
        <div className="text-sm font-medium">Benchmark Lines</div>
        <Alert>
          <AlertDescription>
            No benchmarks available for this metric. Create benchmarks in the Benchmarks page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header with controls */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium" id="benchmark-selector-label">
          Benchmark Lines ({selectedBenchmarkIds.length} of {benchmarks.length} selected)
        </div>
        <div className="flex gap-2" role="group" aria-label="Benchmark selection actions">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectAll}
            disabled={allSelected}
            aria-label="Select all benchmarks"
          >
            Select All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            disabled={noneSelected}
            aria-label="Clear all benchmark selections"
          >
            Clear All
          </Button>
        </div>
      </div>

      {/* Benchmark list */}
      <div
        className="space-y-2 max-h-64 overflow-y-auto border rounded-md p-3 bg-gray-50"
        role="group"
        aria-labelledby="benchmark-selector-label"
        aria-describedby="benchmark-selection-hint"
      >
        <span id="benchmark-selection-hint" className="sr-only">
          Select benchmarks to display as horizontal lines on the chart
        </span>
        {benchmarks.map((benchmark) => {
          const isSelected = selectedBenchmarkIds.includes(benchmark.id);
          const filterBadges = formatFilters(benchmark.filters);

          return (
            <div
              key={benchmark.id}
              className="flex items-start space-x-3 p-2 rounded hover:bg-gray-100"
            >
              <Checkbox
                id={`benchmark-${benchmark.id}`}
                checked={isSelected}
                onCheckedChange={() => handleToggle(benchmark.id)}
                className="mt-1"
                aria-describedby={`benchmark-desc-${benchmark.id}`}
              />
              <div className="flex-1">
                <label
                  htmlFor={`benchmark-${benchmark.id}`}
                  className="text-sm font-medium cursor-pointer"
                >
                  {benchmark.name}
                </label>
                <div
                  id={`benchmark-desc-${benchmark.id}`}
                  className="flex items-center gap-2 mt-1"
                >
                  <span className="text-sm text-muted-foreground">
                    {benchmark.comparisonOperator === 'range' && benchmark.minValue !== undefined && benchmark.maxValue !== undefined
                      ? `Target: ${benchmark.minValue} - ${benchmark.maxValue}${unit}`
                      : `Target: ${benchmark.benchmarkValue}${unit} (${benchmark.comparisonOperator === 'lte' ? '≤' : benchmark.comparisonOperator === 'gte' ? '≥' : '='})`
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
