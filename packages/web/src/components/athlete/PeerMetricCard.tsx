/**
 * PeerMetricCard Component
 *
 * Displays peer comparison percentile for a single metric with:
 * - Metric name + athlete's latest value
 * - Percentile progress bar with color coding
 * - Percentile label (TOP 10%, ABOVE AVERAGE, etc.)
 * - Sample size display
 * - Benchmark status (if applicable)
 * - Expandable distribution box plot
 */

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, Target, Check, X, Users, Star, Diamond, CheckCircle, ArrowRight, Circle } from 'lucide-react';
import {
  getPercentileLabel,
  usePeerDistribution,
  type PercentileResult,
  type PeerFilterCriteria,
} from '@/hooks/usePeerComparison';
import { DistributionBoxPlot } from '@/components/charts/DistributionBoxPlot';
import { getMetricDisplayName, getMetricUnits } from '@/lib/metrics';

export interface BenchmarkStatus {
  metricCode: string;
  benchmarkName: string;
  targetValue: number;
  currentValue: number;
  isMet: boolean;
  progress: number;  // 0-100 percentage
  source: string;    // "Global" for site benchmarks, org name for custom
}

export interface PeerMetricCardProps {
  result: PercentileResult;
  benchmark?: BenchmarkStatus;
  filters?: PeerFilterCriteria;
  lowerIsBetter?: boolean;
}

/**
 * Get progress bar color based on percentile
 */
function getProgressColor(percentile: number): string {
  if (percentile >= 90) return 'bg-purple-500';
  if (percentile >= 75) return 'bg-blue-500';
  if (percentile >= 50) return 'bg-green-500';
  if (percentile >= 25) return 'bg-yellow-500';
  return 'bg-orange-500';
}

/**
 * Get badge variant based on percentile
 */
function getBadgeClass(percentile: number): string {
  if (percentile >= 90) return 'bg-purple-100 text-purple-700 border-purple-200';
  if (percentile >= 75) return 'bg-blue-100 text-blue-700 border-blue-200';
  if (percentile >= 50) return 'bg-green-100 text-green-700 border-green-200';
  if (percentile >= 25) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
  return 'bg-orange-100 text-orange-700 border-orange-200';
}

/**
 * Get icon component based on percentile (for accessibility - not color-only)
 */
function getPercentileIcon(percentile: number): JSX.Element {
  const iconProps = { className: "h-3 w-3 mr-1", "aria-hidden": true as const };
  if (percentile >= 90) return <Star {...iconProps} />;
  if (percentile >= 75) return <Diamond {...iconProps} />;
  if (percentile >= 50) return <CheckCircle {...iconProps} />;
  if (percentile >= 25) return <ArrowRight {...iconProps} />;
  return <Circle {...iconProps} />;
}

export function PeerMetricCard({
  result,
  benchmark,
  filters,
  lowerIsBetter = false,
}: PeerMetricCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Fetch detailed distribution data when expanded
  const {
    data: distribution,
    isLoading: distributionLoading,
  } = usePeerDistribution(
    result.metric,
    filters,
    { enabled: isExpanded && result.percentile >= 0 }
  );

  const displayName = getMetricDisplayName(result.metric);
  const units = getMetricUnits(result.metric);
  const percentileLabel = getPercentileLabel(result.percentile);

  // Safe formatting helper for numeric values
  const formatValue = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value)) return '—';
    return value.toFixed(2);
  };

  // Handle insufficient data state
  if (result.percentile < 0) {
    return (
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-gray-900">{displayName}</h3>
            <span className="text-sm text-gray-500">
              {formatValue(result.athleteValue)} {units}
            </span>
          </div>
          <div className="text-sm text-gray-400 text-center py-4">
            <Users className="h-6 w-6 mx-auto mb-2 opacity-50" />
            <p>Not enough peers for comparison</p>
            <p className="text-xs mt-1">({result.sampleSize ?? 0} athletes in pool)</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        {/* Header: Metric name and value */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-900">{displayName}</h3>
          <span className="text-lg font-semibold text-gray-800">
            {formatValue(result.athleteValue)} {units}
          </span>
        </div>

        {/* Percentile bar */}
        <div className="space-y-2 mb-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Percentile</span>
            <span className="font-medium">{Math.round(result.percentile)}%</span>
          </div>
          <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${getProgressColor(result.percentile)} transition-all duration-300`}
              style={{ width: `${Math.max(result.percentile, 3)}%` }}
            />
          </div>
        </div>

        {/* Percentile label badge */}
        <div className="flex items-center justify-between mb-3">
          <Badge
            variant="outline"
            className={`text-xs font-medium flex items-center ${getBadgeClass(result.percentile)}`}
          >
            {getPercentileIcon(result.percentile)}
            {percentileLabel.label}
          </Badge>
          <span className="text-xs text-gray-500">
            vs {result.sampleSize.toLocaleString()} athletes
          </span>
        </div>

        {/* Benchmark status (if available) */}
        {benchmark && (
          <div className="flex items-center gap-2 py-2 px-3 bg-gray-50 rounded-lg mb-3">
            <Target className="h-4 w-4 text-gray-500" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-700 truncate">
                  {benchmark.benchmarkName}
                </p>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-gray-100 text-gray-600 border-gray-200">
                  {benchmark.source}
                </Badge>
              </div>
              <p className="text-xs text-gray-500">
                Target: {formatValue(benchmark.targetValue)} {units}
              </p>
            </div>
            {benchmark.isMet ? (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                <Check className="h-3 w-3 mr-1" />
                Met
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
                <span className="text-xs">{benchmark.progress != null ? benchmark.progress.toFixed(0) : 0}%</span>
              </Badge>
            )}
          </div>
        )}

        {/* Expandable distribution section */}
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between text-gray-600 hover:text-gray-900"
            >
              <span className="text-sm">
                {isExpanded ? 'Hide Distribution' : 'Show Distribution'}
              </span>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pt-3 border-t mt-2">
              {distributionLoading ? (
                <div className="h-20 flex items-center justify-center text-sm text-gray-400">
                  Loading distribution...
                </div>
              ) : distribution ? (
                <DistributionBoxPlot
                  distribution={distribution}
                  athleteValue={result.athleteValue}
                  metricName={displayName}
                  lowerIsBetter={lowerIsBetter}
                  height={100}
                />
              ) : (
                <div className="h-20 flex items-center justify-center text-sm text-gray-400">
                  Distribution data unavailable
                </div>
              )}

              {/* Distribution stats summary */}
              {distribution && result.distribution?.p25 != null && (
                <div className="grid grid-cols-3 gap-2 mt-3 text-center text-xs">
                  <div>
                    <p className="text-gray-500">25th %ile</p>
                    <p className="font-medium">{formatValue(result.distribution.p25)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Median</p>
                    <p className="font-medium">{formatValue(result.distribution.p50)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">75th %ile</p>
                    <p className="font-medium">{formatValue(result.distribution.p75)}</p>
                  </div>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

export default PeerMetricCard;
