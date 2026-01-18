/**
 * BenchmarkDashboardWidget Component
 * Team benchmark achievement dashboard for coach analytics
 */

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTeamBenchmarkAggregation } from '@/lib/benchmarks-api';
import { useBenchmarkSets, useBenchmarkSet } from '@/lib/benchmark-sets-api';
import { BenchmarkCard } from './BenchmarkCard';
import { cn } from '@/lib/utils';
import { getBenchmarkProgressColor } from '@/utils/benchmark-colors';
import { Layers } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface BenchmarkDashboardWidgetProps {
  organizationId: string;
  teamIds?: string[];
  genders?: string[];
  /** Optional benchmark set ID to filter by (if provided, no dropdown shown) */
  benchmarkSetId?: string;
  onBenchmarkClick?: (benchmarkId: string, status: 'met' | 'unmet') => void;
  className?: string;
}

export function BenchmarkDashboardWidget({
  organizationId,
  teamIds,
  genders,
  benchmarkSetId: externalSetId,
  onBenchmarkClick,
  className
}: BenchmarkDashboardWidgetProps) {
  // Internal state for set filter (only used when externalSetId not provided)
  const [internalSetId, setInternalSetId] = useState<string>("all");
  const activeSetId = externalSetId || (internalSetId !== "all" ? internalSetId : undefined);

  const { data: benchmarks, isLoading, error } = useTeamBenchmarkAggregation(
    organizationId,
    { teamIds, genders }
  );

  // Fetch available benchmark sets for filtering (only when no external set ID)
  const { data: benchmarkSets } = useBenchmarkSets(organizationId);
  const { data: selectedSet } = useBenchmarkSet(
    organizationId,
    activeSetId || ""
  );

  // Filter benchmarks by set membership
  const filteredBenchmarks = useMemo(() => {
    if (!activeSetId || !selectedSet?.items) return benchmarks;
    const setIds = new Set(selectedSet.items.map(item => item.benchmarkId));
    return benchmarks?.filter(b => setIds.has(b.benchmarkId));
  }, [benchmarks, activeSetId, selectedSet]);

  // Calculate overall achievement rate from filtered benchmarks
  const overallAchievementRate = filteredBenchmarks && filteredBenchmarks.length > 0
    ? Math.round(
        filteredBenchmarks.reduce((sum, b) => sum + b.achievementRate, 0) / filteredBenchmarks.length
      )
    : 0;

  // Loading state
  if (isLoading) {
    return (
      <Card className={cn(className)}>
        <CardHeader>
          <CardTitle>Benchmark Achievement Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading benchmarks...</p>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className={cn(className)}>
        <CardHeader>
          <CardTitle>Benchmark Achievement Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive">Error loading benchmarks. Please try again.</p>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (!filteredBenchmarks || filteredBenchmarks.length === 0) {
    return (
      <Card className={cn(className)}>
        <CardHeader>
          <CardTitle>Benchmark Achievement Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {activeSetId
              ? "No benchmarks in this set are enabled for the selected filters."
              : "No benchmarks enabled for this organization. Enable benchmarks in settings to track team progress."
            }
          </p>
        </CardContent>
      </Card>
    );
  }

  // Determine overall progress bar color using shared utility
  const overallProgressColor = getBenchmarkProgressColor(overallAchievementRate).bg;

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle>Benchmark Achievement Dashboard</CardTitle>
          {/* Show filter dropdown only when no external set ID provided */}
          {!externalSetId && benchmarkSets && benchmarkSets.length > 0 && (
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <Select value={internalSetId} onValueChange={setInternalSetId}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Benchmarks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Benchmarks</SelectItem>
                  {benchmarkSets.map((set) => (
                    <SelectItem key={set.id} value={set.id}>
                      {set.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Overall Achievement Summary */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold">
              Overall: {overallAchievementRate}% of benchmarks met
              {activeSetId && selectedSet && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  (in {selectedSet.name})
                </span>
              )}
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={overallAchievementRate}
            aria-valuemin={0}
            aria-valuemax={100}
            className="relative h-4 w-full overflow-hidden rounded-full bg-secondary"
          >
            <div
              className={cn('h-full transition-all', overallProgressColor)}
              style={{ width: `${overallAchievementRate}%` }}
            />
          </div>
        </div>

        {/* Individual Benchmark Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredBenchmarks.map((benchmark) => (
            <BenchmarkCard
              key={benchmark.benchmarkId}
              benchmark={benchmark}
              onBenchmarkClick={onBenchmarkClick}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
