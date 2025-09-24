import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
  TooltipItem,
  ScriptableContext
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Line } from 'react-chartjs-2';
import type {
  TrendData,
  ChartConfiguration,
  StatisticalSummary
} from '@shared/analytics-types';
import type {
  AthleteData,
  ChartPoint,
  ProcessedAthleteData,
  AthleteInfo,
  ChartAnalytics,
  TrendDataPoint,
  GroupAveragePoint
} from '@/types/chart-types';
import { METRIC_CONFIG } from '@shared/analytics-types';
import { CHART_CONFIG, CHART_COLORS, ALGORITHM_CONFIG } from '@/constants/chart-config';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import ChartErrorBoundary from './components/ChartErrorBoundary';
import {
  getPerformanceQuadrantLabels,
  createTooltipCallbacks,
  limitDatasetSize,
  calculateTotalDataPoints,
  calculateCorrelation,
  calculateImprovement,
  processScatterData,
  createChartOptions
} from '@/utils/chart-calculations';
import { getDateKey, safeParseDate } from '@/utils/date-utils';

// Register Chart.js components and annotation plugin
ChartJS.register(
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  annotationPlugin
);

interface ConnectedScatterChartProps {
  data: TrendData[];
  config: ChartConfiguration;
  statistics?: Record<string, StatisticalSummary>;
  highlightAthlete?: string;
  selectedAthleteIds?: string[];
  onAthleteSelectionChange?: (athleteIds: string[]) => void;
}

export const ConnectedScatterChart = React.memo(function ConnectedScatterChart({
  data,
  config,
  statistics,
  highlightAthlete,
  selectedAthleteIds,
  onAthleteSelectionChange
}: ConnectedScatterChartProps) {
  // ALL HOOKS MUST BE CALLED FIRST - No early returns before hooks!
  // Track mounted state to prevent memory leaks
  const isMountedRef = useRef(true);

  // Internal state for athlete selection and toggles
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>([]);
  const [athleteToggles, setAthleteToggles] = useState<Record<string, boolean>>({});
  const [showGroupAverage, setShowGroupAverage] = useState(true);

  // Get effective athlete selection (external prop or internal state)
  const effectiveSelectedIds = selectedAthleteIds || internalSelectedIds;
  const handleSelectionChange = onAthleteSelectionChange || setInternalSelectedIds;

  // Process all athletes from data - safe even if data is null/undefined
  const allAthletes = useMemo(() => {
    if (!data || data.length === 0) return [];

    const athleteMap = new Map();
    data.forEach(trend => {
      if (!athleteMap.has(trend.athleteId)) {
        athleteMap.set(trend.athleteId, {
          id: trend.athleteId,
          name: trend.athleteName,
          color: athleteMap.size
        });
      }
    });

    return Array.from(athleteMap.values());
  }, [data]);

  // Cleanup on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Set up initial athlete selection
  const maxAthletes = ALGORITHM_CONFIG.MAX_ATHLETES_DEFAULT;
  useEffect(() => {
    if (!selectedAthleteIds && allAthletes.length > 0 && effectiveSelectedIds.length === 0) {
      const initialSelection = allAthletes.slice(0, maxAthletes).map(a => a.id);
      if (isMountedRef.current) {
        handleSelectionChange(initialSelection);
      }
    }
  }, [allAthletes, maxAthletes, selectedAthleteIds, effectiveSelectedIds.length, handleSelectionChange]);

  // Initialize athlete toggles when athletes change
  useEffect(() => {
    const newToggles: Record<string, boolean> = {};
    allAthletes.forEach(athlete => {
      newToggles[athlete.id] = effectiveSelectedIds.includes(athlete.id);
    });
    if (isMountedRef.current) {
      setAthleteToggles(newToggles);
    }
  }, [allAthletes, effectiveSelectedIds]);

  // Filter displayed athletes based on selection and toggles
  const displayedAthletes = useMemo(() => {
    return allAthletes.filter(athlete =>
      effectiveSelectedIds.includes(athlete.id) && athleteToggles[athlete.id]
    );
  }, [allAthletes, effectiveSelectedIds, athleteToggles]);


  // Transform trend data for connected scatter plot using extracted utility
  const scatterData = useMemo(() => {
    if (!data || data.length === 0) return null;

    return processScatterData({
      data,
      displayedAthletes,
      highlightAthlete,
      statistics
    });
  }, [data, displayedAthletes, highlightAthlete, statistics]);

  // Chart options using extracted configuration utility
  const options = useMemo(() => {
    return createChartOptions(scatterData, config, statistics);
  }, [scatterData, config, statistics]);

  // Helper functions for athlete toggles - wrapped in useCallback to prevent memory leaks
  const toggleAthlete = useCallback((athleteId: string) => {
    setAthleteToggles(prev => ({
      ...prev,
      [athleteId]: !prev[athleteId]
    }));
  }, []);

  const selectAllAthletes = useCallback(() => {
    const allEnabled: Record<string, boolean> = {};
    allAthletes.forEach(athlete => {
      allEnabled[athlete.id] = true;
    });
    setAthleteToggles(allEnabled);
  }, [allAthletes]);

  const clearAllAthletes = useCallback(() => {
    const allDisabled: Record<string, boolean> = {};
    allAthletes.forEach(athlete => {
      allDisabled[athlete.id] = false;
    });
    setAthleteToggles(allDisabled);
  }, [allAthletes]);

  const visibleAthleteCount = Object.values(athleteToggles).filter(Boolean).length;

  // Validation logic - moved AFTER all hooks to prevent hooks order violations
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center">
          <div className="text-lg font-medium mb-2">Connected Scatter Plot Unavailable</div>
          <div className="text-sm">
            This chart requires exactly 2 metrics with time series data.
          </div>
          <div className="text-sm mt-1">
            No data provided
          </div>
        </div>
      </div>
    );
  }

  // Get unique metrics from all data for validation
  const availableMetrics = Array.from(new Set(data.map(trend => trend.metric)));
  if (availableMetrics.length < 2) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center">
          <div className="text-lg font-medium mb-2">Connected Scatter Plot Unavailable</div>
          <div className="text-sm">
            This chart requires exactly 2 metrics with time series data.
          </div>
          <div className="text-sm mt-1">
            Not enough metrics: {availableMetrics.length} (need 2)
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      {/* Athlete Controls Panel - Only show when not in highlight mode */}
      {!highlightAthlete && allAthletes.length > 0 && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-900">
              Athletes ({visibleAthleteCount} of {allAthletes.length} visible)
            </h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={selectAllAthletes}
                disabled={visibleAthleteCount === allAthletes.length}
              >
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearAllAthletes}
                disabled={visibleAthleteCount === 0}
              >
                Clear All
              </Button>
            </div>
          </div>

          {/* Athletes Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 mb-3">
            {allAthletes.map(athlete => {
              const colors = [
                'rgba(59, 130, 246, 1)',    // Blue
                'rgba(16, 185, 129, 1)',    // Green
                'rgba(239, 68, 68, 1)',     // Red
                'rgba(245, 158, 11, 1)',    // Amber
                'rgba(139, 92, 246, 1)',    // Purple
                'rgba(236, 72, 153, 1)',    // Pink
                'rgba(20, 184, 166, 1)',    // Teal
                'rgba(251, 146, 60, 1)',    // Orange
                'rgba(124, 58, 237, 1)',    // Violet
                'rgba(34, 197, 94, 1)'      // Emerald - 10th color
              ];
              const athleteColor = colors[athlete.color % colors.length];

              return (
                <div key={athlete.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`athlete-${athlete.id}`}
                    checked={athleteToggles[athlete.id] || false}
                    onCheckedChange={() => toggleAthlete(athlete.id)}
                  />
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: athleteColor }}
                  />
                  <label
                    htmlFor={`athlete-${athlete.id}`}
                    className="text-sm cursor-pointer flex-1 truncate"
                  >
                    {athlete.name}
                  </label>
                </div>
              );
            })}
          </div>

          {/* Group Average Toggle */}
          <div className="flex items-center space-x-2 pt-2 border-t">
            <Checkbox
              id="group-average"
              checked={showGroupAverage}
              onCheckedChange={(checked) => setShowGroupAverage(checked === true)}
            />
            <div className="w-3 h-3 rounded-full flex-shrink-0 bg-gray-400" />
            <label htmlFor="group-average" className="text-sm cursor-pointer">
              Group Average
            </label>
          </div>
        </div>
      )}

      {scatterData ? (
        <ChartErrorBoundary>
          <Line data={scatterData.chartData} options={options} />
        </ChartErrorBoundary>
      ) : (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <div className="text-center">
            <div className="text-lg font-medium mb-2">No Data Available</div>
            <div className="text-sm">
              No athletes have data for both selected metrics.
            </div>
          </div>
        </div>
      )}
      
      {/* Progress indicators */}
      {scatterData && scatterData.analytics && (
        <div className="mt-4 text-sm">
          <div className="text-center text-muted-foreground mb-2">
            {highlightAthlete ?
              `Analytics for ${scatterData.analytics?.athleteName || 'selected athlete'}` :
              `Connected points show performance progression over time`}
          </div>
          
          {/* Enhanced Analytics Display */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="font-medium text-xs">Correlation</div>
              <div className="text-lg font-bold text-purple-600">
                {scatterData.analytics ?
                  `${(scatterData.analytics.correlation * 100).toFixed(0)}%` : 'N/A'}
              </div>
              <div className="text-xs text-muted-foreground">
                {scatterData.analytics && Math.abs(scatterData.analytics.correlation) > 0.7 ?
                  'Strong' : scatterData.analytics && Math.abs(scatterData.analytics.correlation) > 0.3 ?
                  'Moderate' : 'Weak'}
              </div>
            </div>

            <div>
              <div className="font-medium text-xs">{scatterData.xLabel} Trend</div>
              <div className="text-lg font-bold text-blue-600">
                {scatterData.analytics ?
                  `${scatterData.analytics.xImprovement > 0 ? '+' : ''}${scatterData.analytics.xImprovement.toFixed(3)}${scatterData.xUnit ? `${scatterData.xUnit}/day` : '/day'}` : 'N/A'}
              </div>
              <div className="text-xs text-muted-foreground">
                {scatterData.xMetric && METRIC_CONFIG[scatterData.xMetric as keyof typeof METRIC_CONFIG]?.lowerIsBetter ?
                  (scatterData.analytics && scatterData.analytics.xImprovement < 0 ? '📈 Improving' : '📉 Declining') :
                  (scatterData.analytics && scatterData.analytics.xImprovement > 0 ? '📈 Improving' : '📉 Declining')}
              </div>
            </div>

            <div>
              <div className="font-medium text-xs">{scatterData.yLabel} Trend</div>
              <div className="text-lg font-bold text-green-600">
                {scatterData.analytics ?
                  `${scatterData.analytics.yImprovement > 0 ? '+' : ''}${scatterData.analytics.yImprovement.toFixed(3)}${scatterData.yUnit ? `${scatterData.yUnit}/day` : '/day'}` : 'N/A'}
              </div>
              <div className="text-xs text-muted-foreground">
                {scatterData.yMetric && METRIC_CONFIG[scatterData.yMetric as keyof typeof METRIC_CONFIG]?.lowerIsBetter ?
                  (scatterData.analytics && scatterData.analytics.yImprovement < 0 ? '📈 Improving' : '📉 Declining') :
                  (scatterData.analytics && scatterData.analytics.yImprovement > 0 ? '📈 Improving' : '📉 Declining')}
              </div>
            </div>

            <div>
              <div className="font-medium text-xs">Personal Bests</div>
              <div className="text-lg font-bold text-yellow-600">
                {(() => {
                  const pbCount = scatterData.datasets[0]?.data?.filter((point: any) =>
                    point.isPersonalBest
                  ).length || 0;

                  return `${pbCount} 🏆`;
                })()}
              </div>
              <div className="text-xs text-muted-foreground">
                {scatterData.analytics ? `${scatterData.analytics.dataPoints} sessions` : ''}
              </div>
            </div>
          </div>

          {/* Performance Quadrants Guide */}
          {scatterData.analytics && (
            <div className="mt-4 text-center">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Performance Zones (relative to athlete's mean)
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {(() => {
                  const labels = getPerformanceQuadrantLabels(scatterData.xMetric, scatterData.yMetric);
                  const colorClasses = {
                    green: 'bg-green-50 border-green-200 text-green-800',
                    yellow: 'bg-amber-50 border-amber-200 text-amber-800',
                    orange: 'bg-orange-50 border-orange-200 text-orange-800',
                    red: 'bg-red-50 border-red-200 text-red-800'
                  };

                  return [
                    <div key="topLeft" className={`${colorClasses[labels.topLeft.color as keyof typeof colorClasses]} border p-2 rounded`}>
                      <div className="font-medium">Top Left</div>
                      <div>{labels.topLeft.label}</div>
                    </div>,
                    <div key="topRight" className={`${colorClasses[labels.topRight.color as keyof typeof colorClasses]} border p-2 rounded`}>
                      <div className="font-medium">Top Right</div>
                      <div>{labels.topRight.label}</div>
                    </div>,
                    <div key="bottomLeft" className={`${colorClasses[labels.bottomLeft.color as keyof typeof colorClasses]} border p-2 rounded`}>
                      <div className="font-medium">Bottom Left</div>
                      <div>{labels.bottomLeft.label}</div>
                    </div>,
                    <div key="bottomRight" className={`${colorClasses[labels.bottomRight.color as keyof typeof colorClasses]} border p-2 rounded`}>
                      <div className="font-medium">Bottom Right</div>
                      <div>{labels.bottomRight.label}</div>
                    </div>
                  ];
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default ConnectedScatterChart;