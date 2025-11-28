/**
 * MetricContextTooltip Component
 * Week 3: Metric Education & Context
 *
 * Provides contextual information about a metric value on hover/focus:
 * - Percentile ranking
 * - Benchmark comparison
 * - Personal best comparison
 * - Recent average comparison
 */

import React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  Star,
  Target,
} from 'lucide-react';
import {
  getMetricContext,
  getMetricEducation,
  AthleteMetricData,
} from '@/utils/metric-education-utils';

interface MetricContextTooltipProps {
  metric: string;
  value: number;
  children: React.ReactNode;
  athleteData?: AthleteMetricData | null;
  gender?: 'male' | 'female';
  compact?: boolean;
}

export function MetricContextTooltip({
  metric,
  value,
  children,
  athleteData = null,
  gender,
  compact = false,
}: MetricContextTooltipProps) {
  const education = getMetricEducation(metric);
  const context = getMetricContext(value, metric, athleteData, gender);

  // For unknown metrics, just render children without tooltip
  if (!education || !context) {
    return (
      <span data-testid="tooltip-trigger">{children}</span>
    );
  }

  const getBenchmarkColor = (level: string) => {
    switch (level) {
      case 'elite':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'college':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'above_average':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'average':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'developing':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return <TrendingUp className="h-3 w-3 text-green-600" />;
      case 'declining':
        return <TrendingDown className="h-3 w-3 text-red-600" />;
      default:
        return <Minus className="h-3 w-3 text-gray-600" />;
    }
  };

  const formatBenchmarkLevel = (level: string) => {
    return level
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Compact mode - minimal tooltip
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <span data-testid="tooltip-trigger" className="cursor-help">
              {children}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-[200px]">
            <div className="text-xs space-y-1">
              {context.percentile && (
                <p>
                  <span className="font-medium">{context.percentile.percentile}th</span> percentile
                </p>
              )}
              {context.benchmark && (
                <Badge
                  variant="outline"
                  className={cn('text-xs', getBenchmarkColor(context.benchmark.level))}
                >
                  {formatBenchmarkLevel(context.benchmark.level)}
                </Badge>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full tooltip content
  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <span data-testid="tooltip-trigger" className="cursor-help">
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[280px] p-3">
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between border-b pb-2">
              <span className="font-medium text-sm">{education.name}</span>
              {context.benchmark && (
                <Badge
                  variant="outline"
                  className={cn('text-xs', getBenchmarkColor(context.benchmark.level))}
                >
                  {formatBenchmarkLevel(context.benchmark.level)}
                </Badge>
              )}
            </div>

            {/* Percentile */}
            {context.percentile && (
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-sm font-medium">
                    {context.percentile.percentile}th Percentile
                  </p>
                  <p className="text-xs text-gray-500">{context.percentile.label}</p>
                </div>
              </div>
            )}

            {/* Personal Best Comparison */}
            {context.comparisonToPR && (
              <div className="flex items-center gap-2">
                {context.comparisonToPR.isNewPersonalBest ? (
                  <>
                    <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                    <div>
                      <p className="text-sm font-medium text-yellow-700">
                        New Personal Best!
                      </p>
                      <p className="text-xs text-gray-500">
                        {Math.abs(context.comparisonToPR.percentDiff).toFixed(1)}% improvement
                      </p>
                    </div>
                  </>
                ) : context.comparisonToPR.isPersonalBest ? (
                  <>
                    <Trophy className="h-4 w-4 text-yellow-600" />
                    <div>
                      <p className="text-sm font-medium text-yellow-700">
                        Matches your Personal Best!
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <Trophy className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-sm">vs PR</p>
                      <p className="text-xs text-gray-500">
                        {context.comparisonToPR.text}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Recent Average Comparison */}
            {context.comparisonToRecent && (
              <div className="flex items-center gap-2">
                {getTrendIcon(context.comparisonToRecent.trend)}
                <div>
                  <p className="text-sm">vs Recent Average</p>
                  <p className="text-xs text-gray-500">
                    {context.comparisonToRecent.text}
                  </p>
                </div>
              </div>
            )}

            {/* Benchmark Description */}
            {context.benchmark && (
              <p className="text-xs text-gray-600 border-t pt-2">
                {context.benchmark.description}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
