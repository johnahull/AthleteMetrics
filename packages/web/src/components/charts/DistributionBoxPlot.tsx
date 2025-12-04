/**
 * DistributionBoxPlot Component
 *
 * A simplified horizontal box plot for peer comparison showing:
 * - Whiskers at p10 and p90
 * - Box from p25 to p75
 * - Median line at p50
 * - Diamond marker for mean
 * - Highlighted marker for athlete's value
 *
 * Designed specifically for peer comparison visualization.
 */

import { useMemo } from 'react';
import { Star, Diamond, CheckCircle, ArrowRight, Circle } from 'lucide-react';
import type { DistributionData } from '@/hooks/usePeerComparison';

export interface DistributionBoxPlotProps {
  distribution: DistributionData;
  athleteValue: number;
  metricName: string;
  lowerIsBetter?: boolean;
  height?: number;
}

/**
 * Calculate position percentage within the distribution range
 */
function getPositionPercent(value: number, min: number, max: number): number {
  if (max === min) return 50;
  return ((value - min) / (max - min)) * 100;
}

export function DistributionBoxPlot({
  distribution,
  athleteValue,
  metricName,
  lowerIsBetter = false,
  height = 80,
}: DistributionBoxPlotProps) {
  const { p10, p25, p50, p75, p90, mean, sampleSize } = distribution;

  // Calculate min/max for scaling (use p10/p90 as boundaries, extend slightly)
  const plotRange = useMemo(() => {
    if (p10 === null || p90 === null) return { min: 0, max: 100 };

    const range = p90 - p10;
    const padding = range * 0.1; // 10% padding on each side

    // Include athlete value in range calculation
    const min = Math.min(p10 - padding, athleteValue - padding);
    const max = Math.max(p90 + padding, athleteValue + padding);

    return { min, max };
  }, [p10, p90, athleteValue]);

  // Check if we have valid distribution data
  if (p10 === null || p25 === null || p50 === null || p75 === null || p90 === null) {
    return (
      <div className="text-sm text-gray-400 text-center py-2">
        Insufficient data for distribution
      </div>
    );
  }

  // Calculate positions
  const whiskerLeft = getPositionPercent(p10, plotRange.min, plotRange.max);
  const boxLeft = getPositionPercent(p25, plotRange.min, plotRange.max);
  const medianPos = getPositionPercent(p50, plotRange.min, plotRange.max);
  const boxRight = getPositionPercent(p75, plotRange.min, plotRange.max);
  const whiskerRight = getPositionPercent(p90, plotRange.min, plotRange.max);
  const meanPos = mean !== null ? getPositionPercent(mean, plotRange.min, plotRange.max) : null;
  const athletePos = getPositionPercent(athleteValue, plotRange.min, plotRange.max);

  // Determine athlete marker color based on percentile position
  const getAthleteColor = () => {
    // For lower-is-better metrics, being below median is good
    if (lowerIsBetter) {
      if (athleteValue <= p10) return 'bg-purple-500 border-purple-600';
      if (athleteValue <= p25) return 'bg-blue-500 border-blue-600';
      if (athleteValue <= p50) return 'bg-green-500 border-green-600';
      if (athleteValue <= p75) return 'bg-yellow-500 border-yellow-600';
      return 'bg-orange-500 border-orange-600';
    } else {
      // For higher-is-better metrics
      if (athleteValue >= p90) return 'bg-purple-500 border-purple-600';
      if (athleteValue >= p75) return 'bg-blue-500 border-blue-600';
      if (athleteValue >= p50) return 'bg-green-500 border-green-600';
      if (athleteValue >= p25) return 'bg-yellow-500 border-yellow-600';
      return 'bg-orange-500 border-orange-600';
    }
  };

  // Get icon for athlete marker (accessibility - not color-only)
  const getAthleteIcon = () => {
    const iconProps = { className: "h-2.5 w-2.5 text-white", strokeWidth: 2.5, "aria-hidden": "true" };
    if (lowerIsBetter) {
      if (athleteValue <= p10) return <Star {...iconProps} />;
      if (athleteValue <= p25) return <Diamond {...iconProps} />;
      if (athleteValue <= p50) return <CheckCircle {...iconProps} />;
      if (athleteValue <= p75) return <ArrowRight {...iconProps} />;
      return <Circle {...iconProps} />;
    } else {
      if (athleteValue >= p90) return <Star {...iconProps} />;
      if (athleteValue >= p75) return <Diamond {...iconProps} />;
      if (athleteValue >= p50) return <CheckCircle {...iconProps} />;
      if (athleteValue >= p25) return <ArrowRight {...iconProps} />;
      return <Circle {...iconProps} />;
    }
  };

  return (
    <div
      className="relative w-full"
      style={{ height }}
      role="img"
      aria-label={`Box plot showing percentile ranges for ${metricName}. Your value is ${athleteValue.toFixed(2)} at the ${Math.round(getPositionPercent(athleteValue, plotRange.min, plotRange.max))}th percentile. The distribution ranges from ${p10.toFixed(1)} (10th percentile) to ${p90.toFixed(1)} (90th percentile) with a median of ${p50.toFixed(1)}.`}
    >
      {/* Container with padding for labels */}
      <div className="absolute inset-0 px-4 py-2">
        {/* Box plot visualization */}
        <div className="relative h-8 flex items-center">
          {/* Whisker line (p10 to p90) */}
          <div
            className="absolute h-0.5 bg-gray-300"
            style={{
              left: `${whiskerLeft}%`,
              right: `${100 - whiskerRight}%`,
            }}
          />

          {/* Left whisker cap (p10) */}
          <div
            className="absolute w-0.5 h-3 bg-gray-400"
            style={{ left: `${whiskerLeft}%`, transform: 'translateX(-50%)' }}
          />

          {/* Right whisker cap (p90) */}
          <div
            className="absolute w-0.5 h-3 bg-gray-400"
            style={{ left: `${whiskerRight}%`, transform: 'translateX(-50%)' }}
          />

          {/* Box (p25 to p75) */}
          <div
            className="absolute h-6 bg-blue-100 border border-blue-300 rounded-sm"
            style={{
              left: `${boxLeft}%`,
              width: `${boxRight - boxLeft}%`,
            }}
          />

          {/* Median line (p50) */}
          <div
            className="absolute w-0.5 h-6 bg-blue-600"
            style={{ left: `${medianPos}%`, transform: 'translateX(-50%)' }}
          />

          {/* Mean marker (diamond) */}
          {meanPos !== null && (
            <div
              className="absolute w-2 h-2 bg-white border-2 border-gray-500 rotate-45"
              style={{ left: `${meanPos}%`, transform: 'translateX(-50%) translateY(-1px)' }}
              title={`Mean: ${mean?.toFixed(2)}`}
            />
          )}

          {/* Athlete value marker (circle with icon) */}
          <div
            className={`absolute w-4 h-4 rounded-full border-2 shadow-md z-10 flex items-center justify-center ${getAthleteColor()}`}
            style={{ left: `${athletePos}%`, transform: 'translateX(-50%)' }}
            title={`Your value: ${athleteValue.toFixed(2)}`}
          >
            {getAthleteIcon()}
          </div>
        </div>

        {/* Labels row */}
        <div className="relative h-6 mt-1 text-xs text-gray-500">
          {/* p10 label */}
          <span
            className="absolute transform -translate-x-1/2"
            style={{ left: `${whiskerLeft}%` }}
          >
            {p10.toFixed(1)}
          </span>

          {/* Median label */}
          <span
            className="absolute transform -translate-x-1/2 font-medium text-blue-600"
            style={{ left: `${medianPos}%` }}
          >
            {p50.toFixed(1)}
          </span>

          {/* p90 label */}
          <span
            className="absolute transform -translate-x-1/2"
            style={{ left: `${whiskerRight}%` }}
          >
            {p90.toFixed(1)}
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-2 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-blue-500 border border-blue-600" />
            <span>You</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-0.5 bg-blue-600" />
            <span>Median</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-white border border-gray-500 rotate-45" />
            <span>Mean</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-3 bg-blue-100 border border-blue-300 rounded-sm" />
            <span>25-75%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DistributionBoxPlot;
