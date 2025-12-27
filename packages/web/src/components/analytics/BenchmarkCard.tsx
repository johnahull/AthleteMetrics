/**
 * BenchmarkCard Component
 * Displays individual benchmark achievement card with progress bar and demographic filters
 */

import { useMemo } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TeamBenchmarkAggregation } from '@/lib/benchmarks-api';
import { getBenchmarkProgressColorName } from '@/utils/benchmark-colors';

interface BenchmarkCardProps {
  benchmark: TeamBenchmarkAggregation;
  onBenchmarkClick?: (benchmarkId: string, status: 'met' | 'unmet') => void;
  className?: string;
}

export function BenchmarkCard({ benchmark, onBenchmarkClick, className }: BenchmarkCardProps) {
  const {
    benchmarkId,
    benchmarkName,
    metricCode,
    benchmarkValue,
    comparisonOperator,
    filters = {},
    applicableAthletes,
    athletesMet,
    achievementRate,
  } = benchmark;

  // Determine operator symbol
  const operatorSymbols: Record<string, string> = {
    lte: '≤',
    gte: '≥',
    eq: '=',
    range: '↔'
  };
  const operatorSymbol = operatorSymbols[comparisonOperator] || '=';

  // Memoize unit calculation to prevent recalculation on every render
  const unit = useMemo(() => {
    if (metricCode.includes('TIME') || metricCode.includes('DASH')) return 's';
    if (metricCode.includes('JUMP') || metricCode.includes('HEIGHT')) return 'in';
    if (metricCode.includes('SPEED')) return 'mph';
    if (metricCode.includes('WEIGHT')) return 'lbs';
    return '';
  }, [metricCode]);

  // Determine progress bar color based on achievement rate (using shared utility)
  const progressColor = useMemo(() => {
    return getBenchmarkProgressColorName(achievementRate);
  }, [achievementRate]);

  const progressColorClass = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    orange: 'bg-orange-500'
  }[progressColor];

  // Memoize filter badges to prevent recalculation on every render
  const filterBadges = useMemo(() => {
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
  }, [filters.gender, filters.ageMin, filters.ageMax, filters.position]);

  const hasFilters = filterBadges.length > 0;

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader>
        <CardTitle className="text-lg">{benchmarkName}</CardTitle>
        <div className="text-sm text-muted-foreground">
          {metricCode} {operatorSymbol} {benchmarkValue}{unit}
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {hasFilters ? (
            filterBadges.map((badge, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {badge}
              </Badge>
            ))
          ) : (
            <Badge variant="outline" className="text-xs">
              All athletes
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold">{achievementRate}%</span>
            <span className="text-sm text-muted-foreground">
              {athletesMet}/{applicableAthletes} applicable
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={achievementRate}
            aria-valuemin={0}
            aria-valuemax={100}
            className="relative h-3 w-full overflow-hidden rounded-full bg-secondary"
            data-color={progressColor}
          >
            <div
              className={cn('h-full transition-all', progressColorClass)}
              style={{ width: `${achievementRate}%` }}
              data-color={progressColor}
            />
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onBenchmarkClick?.(benchmarkId, 'met')}
          disabled={!onBenchmarkClick}
          className="flex-1"
        >
          View Met
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onBenchmarkClick?.(benchmarkId, 'unmet')}
          disabled={!onBenchmarkClick}
          className="flex-1"
        >
          View Unmet
        </Button>
      </CardFooter>
    </Card>
  );
}
