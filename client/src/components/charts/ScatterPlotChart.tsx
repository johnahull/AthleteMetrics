import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
  ScatterController,
  LineController,
  Filler
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import type { AnnotationOptions } from 'chartjs-plugin-annotation';
import { Scatter } from 'react-chartjs-2';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { usePerformanceMonitor } from '@/utils/performance-monitor';
import type {
  ChartDataPoint,
  ChartConfiguration,
  StatisticalSummary
} from '@shared/analytics-types';
import { METRIC_CONFIG } from '@shared/analytics-types';
import { CHART_CONFIG } from '@/constants/chart-config';
import { safeNumber } from '@shared/utils/number-conversion';

// Constants for athlete name rendering
const ATHLETE_NAME_CONSTANTS = {
  LABEL_OFFSET_X: 10,
  LABEL_OFFSET_Y: 0,
  BACKGROUND_PADDING: 2,
  BACKGROUND_HEIGHT: 12,
  BACKGROUND_ALPHA: 0.8,
  LABEL_VERTICAL_OFFSET: 6
} as const;

// Interfaces for better type safety
interface ScatterPoint {
  x: number;
  y: number;
  athleteId: string;
  athleteName: string;
  teamName?: string;
}

interface RegressionResult {
  slope: number;
  intercept: number;
}

interface AthleteData {
  athleteId: string;
  athleteName: string;
  teamName?: string;
  metrics: Record<string, number>;
}

// Register Chart.js components
ChartJS.register(
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ScatterController,
  LineController,
  Filler,
  annotationPlugin
);

// Regression calculation helper function
function calculateRegression(points: ScatterPoint[]): RegressionResult | null {
  if (points.length < 2) return null;

  // Validate points have valid x and y values
  const validPoints = points.filter(p =>
    typeof p.x === 'number' && typeof p.y === 'number' &&
    !isNaN(p.x) && !isNaN(p.y) &&
    isFinite(p.x) && isFinite(p.y)
  );

  if (validPoints.length < 2) return null;

  const n = validPoints.length;
  const sumX = validPoints.reduce((sum, p) => sum + p.x, 0);
  const sumY = validPoints.reduce((sum, p) => sum + p.y, 0);
  const sumXY = validPoints.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumX2 = validPoints.reduce((sum, p) => sum + p.x * p.x, 0);

  const denominator = n * sumX2 - sumX * sumX;

  // Check for division by zero (all x values are the same)
  if (denominator === 0 || !isFinite(denominator)) return null;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Validate results
  if (!isFinite(slope) || !isFinite(intercept)) return null;

  return { slope, intercept };
}

// Performance quadrant labels based on metric types
function getPerformanceQuadrantLabels(xMetric: string, yMetric: string) {
  const xConfig = METRIC_CONFIG[xMetric as keyof typeof METRIC_CONFIG];
  const yConfig = METRIC_CONFIG[yMetric as keyof typeof METRIC_CONFIG];

  const xLowerIsBetter = xConfig?.lowerIsBetter || false;
  const yLowerIsBetter = yConfig?.lowerIsBetter || false;

  // Get clean metric names (remove common suffixes)
  const xName = xConfig?.label.replace(/ (Time|Test|Jump|Dash|Index)$/, '') || xMetric;
  const yName = yConfig?.label.replace(/ (Time|Test|Jump|Dash|Index)$/, '') || yMetric;

  // Generate contextual descriptions based on metric combination
  const getDescriptions = () => {
    // Speed vs Power combinations
    if ((xMetric.includes('DASH') || xMetric.includes('FLY')) && yMetric.includes('VERTICAL')) {
      return { elite: 'Fast + Explosive', xGood: 'Strong Speed', yGood: 'Strong Power', development: 'Needs Speed & Power' };
    }
    if ((yMetric.includes('DASH') || yMetric.includes('FLY')) && xMetric.includes('VERTICAL')) {
      return { elite: 'Explosive + Fast', xGood: 'Strong Power', yGood: 'Strong Speed', development: 'Needs Power & Speed' };
    }

    // Speed vs Agility combinations
    if ((xMetric.includes('DASH') || xMetric.includes('FLY')) && (yMetric.includes('AGILITY') || yMetric.includes('T_TEST'))) {
      return { elite: 'Fast + Agile', xGood: 'Strong Speed', yGood: 'Strong Agility', development: 'Needs Speed & Agility' };
    }
    if ((yMetric.includes('DASH') || yMetric.includes('FLY')) && (xMetric.includes('AGILITY') || xMetric.includes('T_TEST'))) {
      return { elite: 'Agile + Fast', xGood: 'Strong Agility', yGood: 'Strong Speed', development: 'Needs Agility & Speed' };
    }

    // Power vs Agility combinations
    if (xMetric.includes('VERTICAL') && (yMetric.includes('AGILITY') || yMetric.includes('T_TEST'))) {
      return { elite: 'Explosive + Agile', xGood: 'Strong Power', yGood: 'Strong Agility', development: 'Needs Power & Agility' };
    }
    if (yMetric.includes('VERTICAL') && (xMetric.includes('AGILITY') || xMetric.includes('T_TEST'))) {
      return { elite: 'Agile + Explosive', xGood: 'Strong Agility', yGood: 'Strong Power', development: 'Needs Agility & Power' };
    }

    // Agility vs Agility combinations
    if ((xMetric.includes('AGILITY') || xMetric.includes('T_TEST')) && (yMetric.includes('AGILITY') || yMetric.includes('T_TEST'))) {
      return { elite: 'Multi-Directional Elite', xGood: `Strong ${xName}`, yGood: `Strong ${yName}`, development: 'Needs Agility Work' };
    }

    // Speed vs Speed combinations
    if ((xMetric.includes('DASH') || xMetric.includes('FLY')) && (yMetric.includes('DASH') || yMetric.includes('FLY'))) {
      return { elite: 'Speed Elite', xGood: `Strong ${xName}`, yGood: `Strong ${yName}`, development: 'Needs Speed Work' };
    }

    // RSI combinations
    if (xMetric.includes('RSI') || yMetric.includes('RSI')) {
      const nonRSI = xMetric.includes('RSI') ? yName : xName;
      return { elite: `Reactive + ${nonRSI} Elite`, xGood: `Strong ${xName}`, yGood: `Strong ${yName}`, development: `Needs ${xName} & ${yName}` };
    }

    // Default generic descriptions with metric names
    return { elite: `${xName} + ${yName} Elite`, xGood: `Strong ${xName}`, yGood: `Strong ${yName}`, development: `Needs ${xName} & ${yName}` };
  };

  const descriptions = getDescriptions();

  if (!xLowerIsBetter && !yLowerIsBetter) {
    // Both higher is better (e.g., vertical jump vs RSI)
    return {
      topRight: { label: descriptions.elite, color: 'green' },
      topLeft: { label: descriptions.yGood, color: 'yellow' },
      bottomRight: { label: descriptions.xGood, color: 'yellow' },
      bottomLeft: { label: descriptions.development, color: 'red' }
    };
  } else if (xLowerIsBetter && !yLowerIsBetter) {
    // X lower is better, Y higher is better (e.g., 40-yard dash vs vertical jump)
    return {
      topLeft: { label: descriptions.elite, color: 'green' },
      topRight: { label: descriptions.yGood, color: 'yellow' },
      bottomLeft: { label: descriptions.xGood, color: 'yellow' },
      bottomRight: { label: descriptions.development, color: 'red' }
    };
  } else if (!xLowerIsBetter && yLowerIsBetter) {
    // X higher is better, Y lower is better (e.g., vertical jump vs 40-yard dash)
    return {
      bottomRight: { label: descriptions.elite, color: 'green' },
      bottomLeft: { label: descriptions.yGood, color: 'yellow' },
      topRight: { label: descriptions.xGood, color: 'yellow' },
      topLeft: { label: descriptions.development, color: 'red' }
    };
  } else {
    // Both lower is better (e.g., 40-yard dash vs agility time)
    return {
      bottomLeft: { label: descriptions.elite, color: 'green' },
      bottomRight: { label: descriptions.yGood, color: 'yellow' },
      topLeft: { label: descriptions.xGood, color: 'yellow' },
      topRight: { label: descriptions.development, color: 'red' }
    };
  }
}

interface ScatterPlotChartProps {
  data: ChartDataPoint[];
  statistics: Record<string, StatisticalSummary>;
  config: ChartConfiguration;
  highlightAthlete?: string;
  showAthleteNames?: boolean;
}

export const ScatterPlotChart = React.memo(function ScatterPlotChart({
  data,
  statistics,
  config,
  highlightAthlete,
  showAthleteNames = false
}: ScatterPlotChartProps) {
  const monitor = usePerformanceMonitor('ScatterPlotChart');
  const chartRef = useRef<any>(null);
  const namesRenderedRef = useRef<boolean>(false);
  const [showRegressionLine, setShowRegressionLine] = useState(true);
  const [showQuadrants, setShowQuadrants] = useState(true);
  const [localShowAthleteNames, setLocalShowAthleteNames] = useState(showAthleteNames);

  // Cleanup chart on unmount
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy?.();
      }
    };
  }, []);

  // Reset names rendered flag when athlete names toggle changes
  useEffect(() => {
    namesRenderedRef.current = false;
  }, [localShowAthleteNames]);

  // Transform data for scatter plot
  const scatterData = useMemo(() => {
    monitor.startTiming('dataTransformation');
    try {
      if (!data || data.length === 0) {
        return null;
      }

    // Get metrics from actual data (like BoxPlotChart does)
    const availableMetrics = Array.from(new Set(data.map(d => d.metric)));

    if (availableMetrics.length < 2) {
      return null;
    }

    const [xMetric, yMetric] = availableMetrics;

    // Group data by athlete (backend already provides best measurements per athlete)
    const athleteData = data.reduce((acc, point) => {
      if (!acc[point.athleteId]) {
        acc[point.athleteId] = {
          athleteId: point.athleteId,
          athleteName: point.athleteName,
          teamName: point.teamName,
          metrics: {}
        };
      }
      acc[point.athleteId].metrics[point.metric] = point.value;
      return acc;
    }, {} as Record<string, AthleteData>);

    // Create scatter points for athletes with both metrics
    const scatterPoints: ScatterPoint[] = Object.values(athleteData)
      .filter((athlete) => athlete.metrics[xMetric] !== undefined && athlete.metrics[yMetric] !== undefined)
      .map((athlete): ScatterPoint => {
        // Convert values to numbers safely
        const xValue = safeNumber(athlete.metrics[xMetric]);
        const yValue = safeNumber(athlete.metrics[yMetric]);
        return {
          x: xValue,
          y: yValue,
          athleteId: athlete.athleteId,
          athleteName: athlete.athleteName,
          teamName: athlete.teamName
        };
      })
      .filter((point) => !isNaN(point.x) && !isNaN(point.y)); // Filter out invalid numeric conversions

    if (scatterPoints.length === 0) return null;

    // Simple fallback: use server statistics if available, otherwise calculate from data
    const validatedStats: Record<string, any> = {};

    for (const metric of [xMetric, yMetric]) {
      let stats = statistics?.[metric];

      // Use server stats if they exist and have a mean value
      if (stats && typeof stats.mean === 'number' && !isNaN(stats.mean)) {
        validatedStats[metric] = stats;
      } else {
        // Calculate statistics on client side as fallback
        const metricData = data.filter(d => d.metric === metric);
        // Convert values to numbers safely
        const values = metricData.map(d => safeNumber(d.value)).filter(v => !isNaN(v));

        if (values.length > 0) {
          const count = values.length;
          const sum = values.reduce((acc, val) => acc + val, 0);
          const mean = sum / count;
          const min = Math.min(...values);
          const max = Math.max(...values);

          validatedStats[metric] = {
            count,
            mean,
            min,
            max
          };
        }
      }
    }


    const datasets = [];

    // Main dataset
    const mainPoints = highlightAthlete ?
      scatterPoints.filter(p => p.athleteId !== highlightAthlete) :
      scatterPoints;

    if (mainPoints.length > 0) {
      datasets.push({
        type: 'scatter' as const,
        label: 'Athletes',
        data: mainPoints,
        backgroundColor: CHART_CONFIG.COLORS.PRIMARY_ALPHA,
        borderColor: CHART_CONFIG.COLORS.PRIMARY,
        borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THIN,
        pointRadius: CHART_CONFIG.STYLING.POINT_RADIUS.DEFAULT,
        pointHoverRadius: CHART_CONFIG.STYLING.POINT_HOVER_RADIUS.DEFAULT
      });
    }

    // Highlighted athlete
    if (highlightAthlete) {
      const highlightedPoint = scatterPoints.find(p => p.athleteId === highlightAthlete);
      if (highlightedPoint) {
        datasets.push({
          type: 'scatter' as const,
          label: highlightedPoint.athleteName,
          data: [highlightedPoint],
          backgroundColor: CHART_CONFIG.COLORS.HIGHLIGHT,
          borderColor: CHART_CONFIG.COLORS.HIGHLIGHT,
          borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THICK,
          pointRadius: CHART_CONFIG.STYLING.POINT_RADIUS.HIGHLIGHTED,
          pointHoverRadius: CHART_CONFIG.STYLING.POINT_HOVER_RADIUS.HIGHLIGHTED,
          pointStyle: 'star'
        });
      }
    }

    // Add group averages using validated statistics
    if (validatedStats[xMetric]?.mean !== undefined && validatedStats[yMetric]?.mean !== undefined) {
      datasets.push({
        type: 'scatter' as const,
        label: 'Group Average',
        data: [{
          x: validatedStats[xMetric]?.mean || 0,
          y: validatedStats[yMetric]?.mean || 0
        }],
        backgroundColor: CHART_CONFIG.COLORS.AVERAGE,
        borderColor: CHART_CONFIG.COLORS.AVERAGE,
        borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THICK,
        pointRadius: CHART_CONFIG.STYLING.POINT_RADIUS.LARGE,
        pointStyle: 'crossRot'
      });
    }

    // Memoize regression calculation to avoid expensive recalculations
    const regression = useMemo(() => {
      return calculateRegression(scatterPoints);
    }, [scatterPoints]);

    // Add regression line if enabled and we have enough points
    if (showRegressionLine && regression && scatterPoints.length >= 2) {
      const xValues = scatterPoints.map(p => p.x);
      const minX = Math.min(...xValues);
      const maxX = Math.max(...xValues);

      datasets.push({
        label: 'Trend Line',
        type: 'line' as const,
        data: [
          { x: minX, y: regression.slope * minX + regression.intercept },
          { x: maxX, y: regression.slope * maxX + regression.intercept }
        ],
        borderColor: CHART_CONFIG.COLORS.NEUTRAL_ALPHA,
        backgroundColor: CHART_CONFIG.COLORS.NEUTRAL_LIGHT,
        borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.DEFAULT,
        borderDash: [...CHART_CONFIG.STYLING.DASHED_LINE],
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        showLine: true,
        tension: 0
      });
    }

    const xUnit = METRIC_CONFIG[xMetric as keyof typeof METRIC_CONFIG]?.unit || '';
    const yUnit = METRIC_CONFIG[yMetric as keyof typeof METRIC_CONFIG]?.unit || '';
    const xLabel = METRIC_CONFIG[xMetric as keyof typeof METRIC_CONFIG]?.label || xMetric;
    const yLabel = METRIC_CONFIG[yMetric as keyof typeof METRIC_CONFIG]?.label || yMetric;

    return {
      datasets,
      xMetric,
      yMetric,
      xUnit,
      yUnit,
      xLabel,
      yLabel,
      points: scatterPoints,
      regression,
      validatedStats
    } as any;
    } finally {
      monitor.endTiming('dataTransformation');
    }
  }, [data, statistics, highlightAthlete, showRegressionLine, showQuadrants, localShowAthleteNames]);

  // Memoize correlation coefficient calculation
  const correlation = useMemo(() => {
    if (!scatterData || scatterData.points.length < 2) return null;

    const points = scatterData.points;
    const n = points.length;

    // Validate that all points have valid numeric values
    const validPoints = points.filter((p: ScatterPoint) =>
      typeof p.x === 'number' && typeof p.y === 'number' &&
      !isNaN(p.x) && !isNaN(p.y) &&
      isFinite(p.x) && isFinite(p.y)
    );

    if (validPoints.length < 2) return null;

    const sumX = validPoints.reduce((sum: number, p: ScatterPoint) => sum + p.x, 0);
    const sumY = validPoints.reduce((sum: number, p: ScatterPoint) => sum + p.y, 0);
    const sumXY = validPoints.reduce((sum: number, p: ScatterPoint) => sum + p.x * p.y, 0);
    const sumX2 = validPoints.reduce((sum: number, p: ScatterPoint) => sum + p.x * p.x, 0);
    const sumY2 = validPoints.reduce((sum: number, p: ScatterPoint) => sum + p.y * p.y, 0);

    const numerator = validPoints.length * sumXY - sumX * sumY;
    const denominator = Math.sqrt((validPoints.length * sumX2 - sumX * sumX) * (validPoints.length * sumY2 - sumY * sumY));

    if (denominator === 0 || !isFinite(denominator)) return null;

    const result = numerator / denominator;
    return isNaN(result) || !isFinite(result) ? null : result;
  }, [scatterData?.points]);

  // Chart options
  const options: ChartOptions<'scatter'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        text: scatterData ? `${scatterData.xLabel} vs ${scatterData.yLabel}` : config.title,
        font: {
          size: CHART_CONFIG.RESPONSIVE.MOBILE_FONT_SIZE + 6, // Slightly larger for title
          weight: 'bold'
        }
      },
      subtitle: {
        display: !!config.subtitle,
        text: config.subtitle
      },
      tooltip: {
        callbacks: {
          title: (context) => {
            if (!context || context.length === 0) return 'Unknown';
            const point = context[0].raw as any;
            return point?.athleteName || 'Group Average';
          },
          label: (context) => {
            const point = context.raw as any;
            if (!point) return ['No data'];
            return [
              `${scatterData?.xLabel}: ${point.x}${scatterData?.xUnit}`,
              `${scatterData?.yLabel}: ${point.y}${scatterData?.yUnit}`
            ];
          },
          afterLabel: (context) => {
            const point = context.raw as any;
            return point?.teamName ? [`Team: ${point.teamName}`] : [];
          }
        }
      },
      legend: {
        display: config.showLegend,
        position: 'top' as const
      },
      annotation: showQuadrants && scatterData ? {
        annotations: (() => {
          const xMean = scatterData.validatedStats[scatterData.xMetric]?.mean || 0;
          const yMean = scatterData.validatedStats[scatterData.yMetric]?.mean || 0;
          const labels = getPerformanceQuadrantLabels(scatterData.xMetric, scatterData.yMetric);

          // Calculate chart bounds for full background coverage
          const xValues = scatterData.points.map((p: ScatterPoint) => p.x);
          const yValues = scatterData.points.map((p: ScatterPoint) => p.y);

          // Safety check for empty arrays
          if (xValues.length === 0 || yValues.length === 0) {
            return {};
          }

          const xMin = Math.min(...xValues) - (Math.max(...xValues) - Math.min(...xValues)) * CHART_CONFIG.SCATTER.CHART_PADDING;
          const xMax = Math.max(...xValues) + (Math.max(...xValues) - Math.min(...xValues)) * CHART_CONFIG.SCATTER.CHART_PADDING;
          const yMin = Math.min(...yValues) - (Math.max(...yValues) - Math.min(...yValues)) * CHART_CONFIG.SCATTER.CHART_PADDING;
          const yMax = Math.max(...yValues) + (Math.max(...yValues) - Math.min(...yValues)) * CHART_CONFIG.SCATTER.CHART_PADDING;

          const colorMap = {
            green: CHART_CONFIG.COLORS.QUADRANTS.ELITE,
            yellow: CHART_CONFIG.COLORS.QUADRANTS.GOOD,
            orange: CHART_CONFIG.COLORS.QUADRANTS.GOOD,
            red: CHART_CONFIG.COLORS.QUADRANTS.NEEDS_WORK
          };

          return {
            // Top Right Quadrant
            topRight: {
              type: 'box' as const,
              xMin: xMean,
              xMax: xMax,
              yMin: yMean,
              yMax: yMax,
              backgroundColor: colorMap[labels.topRight.color as keyof typeof colorMap],
              borderWidth: 0,
              z: 0
            },
            // Top Left Quadrant
            topLeft: {
              type: 'box' as const,
              xMin: xMin,
              xMax: xMean,
              yMin: yMean,
              yMax: yMax,
              backgroundColor: colorMap[labels.topLeft.color as keyof typeof colorMap],
              borderWidth: 0,
              z: 0
            },
            // Bottom Right Quadrant
            bottomRight: {
              type: 'box' as const,
              xMin: xMean,
              xMax: xMax,
              yMin: yMin,
              yMax: yMean,
              backgroundColor: colorMap[labels.bottomRight.color as keyof typeof colorMap],
              borderWidth: 0,
              z: 0
            },
            // Bottom Left Quadrant
            bottomLeft: {
              type: 'box' as const,
              xMin: xMin,
              xMax: xMean,
              yMin: yMin,
              yMax: yMean,
              backgroundColor: colorMap[labels.bottomLeft.color as keyof typeof colorMap],
              borderWidth: 0,
              z: 0
            },
            // Vertical line at x mean
            xMeanLine: {
              type: 'line' as const,
              xMin: xMean,
              xMax: xMean,
              yMin: yMin,
              yMax: yMax,
              borderColor: CHART_CONFIG.COLORS.NEUTRAL_ALPHA,
              borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THIN,
              borderDash: [...CHART_CONFIG.STYLING.DOTTED_LINE],
              z: 1
            },
            // Horizontal line at y mean
            yMeanLine: {
              type: 'line' as const,
              xMin: xMin,
              xMax: xMax,
              yMin: yMean,
              yMax: yMean,
              borderColor: CHART_CONFIG.COLORS.NEUTRAL_ALPHA,
              borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THIN,
              borderDash: [...CHART_CONFIG.STYLING.DOTTED_LINE],
              z: 1
            }
          };
        })()
      } : undefined
    },
    scales: {
      x: {
        type: 'linear',
        position: 'bottom',
        title: {
          display: true,
          text: `${scatterData?.xLabel} (${scatterData?.xUnit})`
        },
        grid: {
          display: true
        }
      },
      y: {
        type: 'linear',
        title: {
          display: true,
          text: `${scatterData?.yLabel} (${scatterData?.yUnit})`
        },
        grid: {
          display: true
        }
      }
    },
    elements: {
      point: {
        hoverRadius: CHART_CONFIG.STYLING.POINT_HOVER_RADIUS.LARGE
      }
    },
    interaction: {
      intersect: false,
      mode: 'point'
    },
    onHover: (event, elements) => {
      if (event.native?.target) {
        (event.native.target as HTMLElement).style.cursor = elements.length > 0 ? 'pointer' : 'default';
      }
    },
    animation: {
      onComplete: function() {
        // Performance optimization: only render names if enabled and not already rendered
        if (localShowAthleteNames && chartRef.current && !namesRenderedRef.current) {
          const chart = chartRef.current;
          const ctx = chart.ctx;
          const chartArea = chart.chartArea;

          if (ctx && chartArea && scatterData?.points) {
            // Save current context state
            ctx.save();

            // Set text styling
            ctx.font = `${CHART_CONFIG.RESPONSIVE.MOBILE_FONT_SIZE}px Arial`;
            ctx.fillStyle = CHART_CONFIG.ACCESSIBILITY.WCAG_COLORS.TEXT_ON_LIGHT;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

            // Render athlete names for each point
            scatterData.points.forEach((point: ScatterPoint) => {
              const meta = chart.getDatasetMeta(0); // Get first dataset metadata
              if (meta && meta.data) {
                // Find the corresponding chart element for this point
                const chartElement = meta.data.find((element: any) => {
                  if (element && element.$context && element.$context.raw) {
                    const rawData = element.$context.raw;
                    return rawData.x === point.x && rawData.y === point.y;
                  }
                  return false;
                });

                if (chartElement && point.athleteName) {
                  const x = chartElement.x + ATHLETE_NAME_CONSTANTS.LABEL_OFFSET_X;
                  const y = chartElement.y + ATHLETE_NAME_CONSTANTS.LABEL_OFFSET_Y;

                  // Add a subtle background for better readability
                  const textWidth = ctx.measureText(point.athleteName).width;

                  ctx.fillStyle = `rgba(255, 255, 255, ${ATHLETE_NAME_CONSTANTS.BACKGROUND_ALPHA})`;
                  ctx.fillRect(
                    x - ATHLETE_NAME_CONSTANTS.BACKGROUND_PADDING,
                    y - ATHLETE_NAME_CONSTANTS.LABEL_VERTICAL_OFFSET,
                    textWidth + 2 * ATHLETE_NAME_CONSTANTS.BACKGROUND_PADDING,
                    ATHLETE_NAME_CONSTANTS.BACKGROUND_HEIGHT
                  );

                  // Restore text color and draw text
                  ctx.fillStyle = CHART_CONFIG.ACCESSIBILITY.WCAG_COLORS.TEXT_ON_LIGHT;
                  ctx.fillText(point.athleteName, x, y);
                }
              }
            });

            // Mark as rendered to prevent redundant operations
            namesRenderedRef.current = true;

            // Restore context state
            ctx.restore();
          }
        }
      }
    }
  }), [scatterData, config, showQuadrants, localShowAthleteNames]);

  // Generate quadrant legend data (must be before early return to avoid hooks violation)
  const quadrantLegend = useMemo(() => {
    if (!scatterData || !showQuadrants) return null;

    const labels = getPerformanceQuadrantLabels(scatterData.xMetric, scatterData.yMetric);
    const colorMap = {
      green: { bg: CHART_CONFIG.COLORS.QUADRANTS.ELITE, border: 'rgba(16, 185, 129, 0.3)' },
      yellow: { bg: CHART_CONFIG.COLORS.QUADRANTS.GOOD, border: 'rgba(245, 158, 11, 0.3)' },
      orange: { bg: CHART_CONFIG.COLORS.QUADRANTS.GOOD, border: 'rgba(245, 158, 11, 0.3)' },
      red: { bg: CHART_CONFIG.COLORS.QUADRANTS.NEEDS_WORK, border: 'rgba(239, 68, 68, 0.3)' }
    };

    return [
      {
        label: labels.topRight.label,
        color: labels.topRight.color,
        position: 'Top Right',
        ...colorMap[labels.topRight.color as keyof typeof colorMap]
      },
      {
        label: labels.topLeft.label,
        color: labels.topLeft.color,
        position: 'Top Left',
        ...colorMap[labels.topLeft.color as keyof typeof colorMap]
      },
      {
        label: labels.bottomRight.label,
        color: labels.bottomRight.color,
        position: 'Bottom Right',
        ...colorMap[labels.bottomRight.color as keyof typeof colorMap]
      },
      {
        label: labels.bottomLeft.label,
        color: labels.bottomLeft.color,
        position: 'Bottom Left',
        ...colorMap[labels.bottomLeft.color as keyof typeof colorMap]
      }
    ];
  }, [scatterData, showQuadrants]);

  if (!scatterData) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No data available for scatter plot
      </div>
    );
  }

  return (
    <div className="w-full h-full space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center space-x-2">
          <Switch
            id="regression-line"
            checked={showRegressionLine}
            onCheckedChange={setShowRegressionLine}
          />
          <Label htmlFor="regression-line">Show Trend Line</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id="quadrants"
            checked={showQuadrants}
            onCheckedChange={setShowQuadrants}
          />
          <Label htmlFor="quadrants">Show Performance Quadrants</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id="athlete-names"
            checked={localShowAthleteNames}
            onCheckedChange={setLocalShowAthleteNames}
          />
          <Label htmlFor="athlete-names">Show Athlete Names</Label>
        </div>
        {correlation !== null && typeof correlation === 'number' && (
          <div className="text-muted-foreground">
            Correlation: <span className="font-mono">{correlation.toFixed(3)}</span>
          </div>
        )}
      </div>

      {/* Quadrant Legend */}
      {quadrantLegend && (
        <div
          className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
          role="region"
          aria-labelledby="quadrant-legend-title"
        >
          <h4 id="quadrant-legend-title" className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
            Performance Quadrants
          </h4>
          <div className="grid grid-cols-2 gap-3 text-xs" role="list">
            {quadrantLegend.map((item, index) => (
              <div key={index} className="flex items-center space-x-2" role="listitem">
                <div
                  className="w-4 h-4 rounded border-2 flex-shrink-0"
                  style={{
                    backgroundColor: item.bg,
                    borderColor: item.border
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                    {item.label}
                  </div>
                  <div className="text-gray-500 dark:text-gray-400">
                    {item.position}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Quadrants are based on the mean values of {scatterData?.xLabel} and {scatterData?.yLabel}
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="h-96">
        <Scatter ref={chartRef} data={scatterData} options={options} />
      </div>
    </div>
  );
});