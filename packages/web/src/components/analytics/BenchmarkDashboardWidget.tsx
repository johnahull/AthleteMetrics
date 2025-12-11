/**
 * BenchmarkDashboardWidget Component
 * Team benchmark achievement dashboard for coach analytics
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTeamBenchmarkAggregation } from '@/lib/benchmarks-api';
import { BenchmarkCard } from './BenchmarkCard';
import { cn } from '@/lib/utils';

interface BenchmarkDashboardWidgetProps {
  organizationId: string;
  teamIds?: string[];
  genders?: string[];
  onBenchmarkClick?: (benchmarkId: string, status: 'met' | 'unmet') => void;
  className?: string;
}

export function BenchmarkDashboardWidget({
  organizationId,
  teamIds,
  genders,
  onBenchmarkClick,
  className
}: BenchmarkDashboardWidgetProps) {
  const { data: benchmarks, isLoading, error } = useTeamBenchmarkAggregation(
    organizationId,
    { teamIds, genders }
  );

  // Calculate overall achievement rate
  const overallAchievementRate = benchmarks && benchmarks.length > 0
    ? Math.round(
        benchmarks.reduce((sum, b) => sum + b.achievementRate, 0) / benchmarks.length
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
  if (!benchmarks || benchmarks.length === 0) {
    return (
      <Card className={cn(className)}>
        <CardHeader>
          <CardTitle>Benchmark Achievement Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            No benchmarks enabled for this organization. Enable benchmarks in settings to track team progress.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Determine overall progress bar color
  const getProgressColor = (rate: number): string => {
    if (rate >= 75) return 'bg-green-500';
    if (rate >= 50) return 'bg-yellow-500';
    return 'bg-orange-500';
  };

  const overallProgressColor = getProgressColor(overallAchievementRate);

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>Benchmark Achievement Dashboard</CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Overall Achievement Summary */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold">
              Overall: {overallAchievementRate}% of benchmarks met
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
          {benchmarks.map((benchmark) => (
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
