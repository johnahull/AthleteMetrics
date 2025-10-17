/**
 * Metric Indicator Component
 * Shows data availability with dot indicators and count badge
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';

interface MetricIndicatorProps {
  count: number;
  maxCount: number;
  className?: string;
}

/**
 * Calculate dot level (1-5) based on percentile
 */
function calculateDotLevel(count: number, maxCount: number): number {
  if (count === 0 || maxCount === 0) return 0;

  const percentile = (count / maxCount) * 100;

  if (percentile <= 20) return 1;
  if (percentile <= 40) return 2;
  if (percentile <= 60) return 3;
  if (percentile <= 80) return 4;
  return 5;
}

export function MetricIndicator({ count, maxCount, className = '' }: MetricIndicatorProps) {
  const dotLevel = calculateDotLevel(count, maxCount);

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {/* Dot indicators - Using filled/outlined dots for colorblind accessibility */}
      <span className="inline-flex gap-0.5" aria-label={`Data availability: ${dotLevel} out of 5`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className={i < dotLevel ? 'text-green-600 font-bold' : 'text-gray-300'}
            aria-hidden="true"
          >
            {i < dotLevel ? '●' : '○'}
          </span>
        ))}
      </span>

      {/* Count badge */}
      <Badge
        variant="outline"
        className="text-xs px-1 py-0 h-auto font-normal"
        aria-label={`${count} measurements available`}
      >
        {count}
      </Badge>
    </span>
  );
}
