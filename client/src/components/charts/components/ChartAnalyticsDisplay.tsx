/**
 * Chart Analytics Display Component
 *
 * Extracted component that displays performance analytics below charts.
 * Shows correlation, improvement trends, and performance metrics.
 */

import React from 'react';
import { METRIC_CONFIG } from '@shared/analytics-types';
import PerformanceQuadrantOverlay from './PerformanceQuadrantOverlay';

interface Analytics {
  correlation: number;
  xImprovement: number;
  yImprovement: number;
  dataPoints: number;
  athleteName: string;
}

interface ChartAnalyticsDisplayProps {
  analytics: Analytics | null;
  xMetric: string;
  yMetric: string;
  xLabel: string;
  yLabel: string;
  xUnit: string;
  yUnit: string;
  datasets: any[];
  highlightAthlete?: string;
  className?: string;
}

export const ChartAnalyticsDisplay = React.memo(function ChartAnalyticsDisplay({
  analytics,
  xMetric,
  yMetric,
  xLabel,
  yLabel,
  xUnit,
  yUnit,
  datasets,
  highlightAthlete,
  className = ''
}: ChartAnalyticsDisplayProps) {
  if (!analytics) return null;

  return (
    <div className={`mt-4 text-sm ${className}`}>
      <div className="text-center text-muted-foreground mb-2">
        {highlightAthlete
          ? `Analytics for ${analytics.athleteName || 'selected athlete'}`
          : 'Connected points show performance progression over time'
        }
      </div>

      {/* Enhanced Analytics Display */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        <div>
          <div className="font-medium text-xs">Correlation</div>
          <div className="text-lg font-bold text-purple-600">
            {`${(analytics.correlation * 100).toFixed(0)}%`}
          </div>
          <div className="text-xs text-muted-foreground">
            {Math.abs(analytics.correlation) > 0.7
              ? 'Strong'
              : Math.abs(analytics.correlation) > 0.3
              ? 'Moderate'
              : 'Weak'
            }
          </div>
        </div>

        <div>
          <div className="font-medium text-xs">{xLabel} Trend</div>
          <div className="text-lg font-bold text-blue-600">
            {`${analytics.xImprovement > 0 ? '+' : ''}${analytics.xImprovement.toFixed(3)}${xUnit ? `${xUnit}/day` : '/day'}`}
          </div>
          <div className="text-xs text-muted-foreground">
            {METRIC_CONFIG[xMetric as keyof typeof METRIC_CONFIG]?.lowerIsBetter
              ? (analytics.xImprovement < 0 ? '📈 Improving' : '📉 Declining')
              : (analytics.xImprovement > 0 ? '📈 Improving' : '📉 Declining')
            }
          </div>
        </div>

        <div>
          <div className="font-medium text-xs">{yLabel} Trend</div>
          <div className="text-lg font-bold text-green-600">
            {`${analytics.yImprovement > 0 ? '+' : ''}${analytics.yImprovement.toFixed(3)}${yUnit ? `${yUnit}/day` : '/day'}`}
          </div>
          <div className="text-xs text-muted-foreground">
            {METRIC_CONFIG[yMetric as keyof typeof METRIC_CONFIG]?.lowerIsBetter
              ? (analytics.yImprovement < 0 ? '📈 Improving' : '📉 Declining')
              : (analytics.yImprovement > 0 ? '📈 Improving' : '📉 Declining')
            }
          </div>
        </div>

        <div>
          <div className="font-medium text-xs">Personal Bests</div>
          <div className="text-lg font-bold text-yellow-600">
            {(() => {
              const pbCount = datasets[0]?.data?.filter((point: any) => point.isPersonalBest).length || 0;
              return `${pbCount} 🏆`;
            })()}
          </div>
          <div className="text-xs text-muted-foreground">
            {`${analytics.dataPoints} sessions`}
          </div>
        </div>
      </div>

      {/* Performance Quadrants Guide */}
      <PerformanceQuadrantOverlay xMetric={xMetric} yMetric={yMetric} />
    </div>
  );
});

export default ChartAnalyticsDisplay;