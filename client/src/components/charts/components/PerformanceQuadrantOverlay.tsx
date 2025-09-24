/**
 * Performance Quadrant Overlay Component
 *
 * Extracted component that displays the performance zone guide below scatter charts.
 * Shows contextual quadrant descriptions based on the selected metrics.
 */

import React from 'react';
import { getPerformanceQuadrantLabels } from '@/utils/chart-calculations';

interface PerformanceQuadrantOverlayProps {
  xMetric: string;
  yMetric: string;
  className?: string;
}

export const PerformanceQuadrantOverlay = React.memo(function PerformanceQuadrantOverlay({
  xMetric,
  yMetric,
  className = ''
}: PerformanceQuadrantOverlayProps) {
  const labels = getPerformanceQuadrantLabels(xMetric, yMetric);

  const colorClasses = {
    green: 'bg-green-50 border-green-200 text-green-800',
    yellow: 'bg-amber-50 border-amber-200 text-amber-800',
    orange: 'bg-orange-50 border-orange-200 text-orange-800',
    red: 'bg-red-50 border-red-200 text-red-800'
  };

  return (
    <div className={`mt-4 text-center ${className}`}>
      <div className="text-xs font-medium text-muted-foreground mb-2">
        Performance Zones (relative to athlete's mean)
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div
          key="topLeft"
          className={`${colorClasses[labels.topLeft.color as keyof typeof colorClasses]} border p-2 rounded`}
        >
          <div className="font-medium">Top Left</div>
          <div>{labels.topLeft.label}</div>
        </div>
        <div
          key="topRight"
          className={`${colorClasses[labels.topRight.color as keyof typeof colorClasses]} border p-2 rounded`}
        >
          <div className="font-medium">Top Right</div>
          <div>{labels.topRight.label}</div>
        </div>
        <div
          key="bottomLeft"
          className={`${colorClasses[labels.bottomLeft.color as keyof typeof colorClasses]} border p-2 rounded`}
        >
          <div className="font-medium">Bottom Left</div>
          <div>{labels.bottomLeft.label}</div>
        </div>
        <div
          key="bottomRight"
          className={`${colorClasses[labels.bottomRight.color as keyof typeof colorClasses]} border p-2 rounded`}
        >
          <div className="font-medium">Bottom Right</div>
          <div>{labels.bottomRight.label}</div>
        </div>
      </div>
    </div>
  );
});

export default PerformanceQuadrantOverlay;