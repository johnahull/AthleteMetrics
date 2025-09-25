/**
 * Chart Calculation Utilities
 *
 * Extracted calculation utilities from ConnectedScatterChart to improve
 * performance and maintainability. All calculations are pure functions
 * that can be easily memoized and tested.
 */

import type { TrendData, StatisticalSummary, ChartConfiguration } from '@shared/analytics-types';
import { METRIC_CONFIG, ALGORITHM_CONFIG } from '@shared/analytics-types';
import type { ChartOptions } from 'chart.js';
import type {
  ChartPoint,
  ChartDataset,
  ChartAnalytics,
  ProcessedAthleteData,
  PerformanceQuadrantLabels,
  PerformanceQuadrantLabel
} from '@/types/chart-types';
import { CHART_COLORS, CHART_CONFIG } from '@/constants/chart-config';
import { getDateKey } from '@/utils/date-utils'; // Added this import

// =============================================================================
// PERFORMANCE QUADRANT CALCULATIONS
// =============================================================================

/**
 * Generate performance quadrant labels based on metric types
 *
 * @param xMetric - X-axis metric key
 * @param yMetric - Y-axis metric key
 * @returns Object with quadrant labels and colors based on metric interpretation
 */
export function getPerformanceQuadrantLabels(xMetric: string, yMetric: string): PerformanceQuadrantLabels {
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

    // Agility vs Power combinations
    if ((xMetric.includes('AGILITY') || xMetric.includes('T_TEST')) && yMetric.includes('VERTICAL')) {
      return { elite: 'Agile + Explosive', xGood: 'Strong Agility', yGood: 'Strong Power', development: 'Needs Agility & Power' };
    }
    if ((yMetric.includes('AGILITY') || yMetric.includes('T_TEST')) && xMetric.includes('VERTICAL')) {
      return { elite: 'Explosive + Agile', xGood: 'Strong Power', yGood: 'Strong Agility', development: 'Needs Power & Agility' };
    }

    // Speed vs Agility combinations
    if ((xMetric.includes('DASH') || xMetric.includes('FLY')) && (yMetric.includes('AGILITY') || yMetric.includes('T_TEST'))) {
      return { elite: 'Fast + Agile', xGood: 'Strong Speed', yGood: 'Strong Agility', development: 'Needs Speed & Agility' };
    }
    if ((yMetric.includes('DASH') || yMetric.includes('FLY')) && (xMetric.includes('AGILITY') || xMetric.includes('T_TEST'))) {
      return { elite: 'Agile + Fast', xGood: 'Strong Agility', yGood: 'Strong Speed', development: 'Needs Agility & Speed' };
    }

    // Default generic descriptions
    return {
      elite: 'Elite Performance',
      xGood: `Strong ${xName}`,
      yGood: `Strong ${yName}`,
      development: 'Needs Development'
    };
  };

  const descriptions = getDescriptions();

  if (!xLowerIsBetter && !yLowerIsBetter) {
    // Both higher is better (e.g., vertical jump vs RSI)
    return {
      topRight: { label: descriptions.elite, color: 'green' as const },
      topLeft: { label: descriptions.yGood, color: 'yellow' as const },
      bottomRight: { label: descriptions.xGood, color: 'orange' as const },
      bottomLeft: { label: descriptions.development, color: 'red' as const }
    };
  } else if (xLowerIsBetter && !yLowerIsBetter) {
    // X lower is better, Y higher is better (e.g., 40-yard dash vs vertical jump)
    return {
      topLeft: { label: descriptions.elite, color: 'green' as const },
      topRight: { label: descriptions.yGood, color: 'orange' as const },
      bottomLeft: { label: descriptions.xGood, color: 'yellow' as const },
      bottomRight: { label: descriptions.development, color: 'red' as const }
    };
  } else if (!xLowerIsBetter && yLowerIsBetter) {
    // X higher is better, Y lower is better (e.g., vertical jump vs 40-yard dash)
    return {
      bottomRight: { label: descriptions.elite, color: 'green' as const },
      bottomLeft: { label: descriptions.yGood, color: 'orange' as const },
      topRight: { label: descriptions.xGood, color: 'yellow' as const },
      topLeft: { label: descriptions.development, color: 'red' as const }
    };
  } else {
    // Both lower is better (e.g., 40-yard dash vs agility time)
    return {
      bottomLeft: { label: descriptions.elite, color: 'green' as const },
      bottomRight: { label: descriptions.yGood, color: 'yellow' as const },
      topLeft: { label: descriptions.xGood, color: 'orange' as const },
      topRight: { label: descriptions.development, color: 'red' as const }
    };
  }
}

// =============================================================================
// CORRELATION CALCULATIONS
// =============================================================================

/**
 * Calculate Pearson correlation coefficient between two datasets
 *
 * @param xValues - Array of x-axis values
 * @param yValues - Array of y-axis values (must be same length as xValues)
 * @returns Correlation coefficient between -1 and 1, or 0 if calculation invalid
 *
 * Algorithm: Pearson correlation = Σ((x-x̄)(y-ȳ)) / √(Σ(x-x̄)²Σ(y-ȳ)²)
 */
export function calculateCorrelation(xValues: number[], yValues: number[]): number {
  if (xValues.length !== yValues.length || xValues.length < 2) {
    return 0;
  }

  const n = xValues.length;
  const sumX = xValues.reduce((a, b) => a + b, 0);
  const sumY = yValues.reduce((a, b) => a + b, 0);
  const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
  const sumXX = xValues.reduce((sum, x) => sum + x * x, 0);
  const sumYY = yValues.reduce((sum, y) => sum + y * y, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));

  return denominator === 0 ? 0 : numerator / denominator;
}

// =============================================================================
// TREND ANALYSIS
// =============================================================================

/**
 * Calculate rate of improvement (slope) over time
 *
 * @param values - Array of {value, date} points
 * @returns Rate of change per day, positive indicates improvement direction
 *
 * Algorithm: (lastValue - firstValue) / daysBetween
 * Note: For "lower is better" metrics, negative slopes indicate improvement
 */
export function calculateImprovement(values: {value: number, date: Date}[]): number {
  if (values.length < 2) return 0;

  const sortedValues = [...values].sort((a, b) => a.date.getTime() - b.date.getTime());
  const firstValue = sortedValues[0].value;
  const lastValue = sortedValues[sortedValues.length - 1].value;
  const timeSpan = sortedValues[sortedValues.length - 1].date.getTime() - sortedValues[0].date.getTime();
  const daySpan = timeSpan / (1000 * 60 * 60 * 24); // Convert milliseconds to days

  return daySpan > 0 ? (lastValue - firstValue) / daySpan : 0;
}


// =============================================================================
// PERFORMANCE OPTIMIZATIONS
// =============================================================================

/**
 * Limit dataset size for performance optimization
 *
 * @param data - Array of data points to limit
 * @param maxPoints - Maximum number of points to keep
 * @returns Optimized dataset with most recent points prioritized
 */
export function limitDatasetSize<T extends { date: Date | string }>(
  data: T[],
  maxPoints: number
): T[] {
  if (!Array.isArray(data) || data.length <= maxPoints) {
    return data;
  }

  // Sort by date (newest first) and take the most recent points
  const sortedData = data.sort((a, b) => {
    const dateA = a.date instanceof Date ? a.date : new Date(a.date);
    const dateB = b.date instanceof Date ? b.date : new Date(b.date);
    return dateB.getTime() - dateA.getTime();
  });

  return sortedData.slice(0, maxPoints);
}

/**
 * Calculate total data points across all athletes for performance monitoring
 *
 * @param athletes - Array of athlete data
 * @param xMetric - X-axis metric
 * @param yMetric - Y-axis metric
 * @returns Total number of data points
 */
export function calculateTotalDataPoints(
  athletes: ProcessedAthleteData[],
  xMetric: string,
  yMetric: string
): number {
  return athletes.reduce((total, athlete) => {
    const xData = athlete.metrics[xMetric] || [];
    const yData = athlete.metrics[yMetric] || [];
    return total + xData.length + yData.length;
  }, 0);
}

/**
 * Optimize point rendering by reducing density for large datasets
 * Uses spatial sampling to maintain visual representation while reducing rendering load
 *
 * @param points - Array of chart points
 * @param maxPoints - Maximum points to render
 * @returns Optimized point array
 */
export function optimizePointRendering(points: ChartPoint[], maxPoints: number): ChartPoint[] {
  if (!Array.isArray(points) || points.length <= maxPoints) {
    return points;
  }

  // Sort by date to maintain temporal coherence
  const sortedPoints = [...points].sort((a, b) => {
    if (!a.date || !b.date) return 0;
    const dateA = a.date instanceof Date ? a.date : new Date(a.date);
    const dateB = b.date instanceof Date ? b.date : new Date(b.date);
    return dateA.getTime() - dateB.getTime();
  });

  // Use systematic sampling to distribute points evenly across time
  const step = Math.floor(sortedPoints.length / maxPoints);
  const optimizedPoints: ChartPoint[] = [];

  for (let i = 0; i < sortedPoints.length; i += step) {
    optimizedPoints.push(sortedPoints[i]);
  }

  return optimizedPoints;
}

// =============================================================================
// DATA PROCESSING UTILITIES
// =============================================================================

/**
 * Process trend data points to create connected scatter plot datasets
 *
 * @param athleteTrends - Grouped athlete trend data
 * @param xMetric - X-axis metric key
 * @param yMetric - Y-axis metric key
 * @param colors - Array of colors for datasets
 * @param highlightAthlete - Optional athlete ID to highlight
 * @returns Array of Chart.js dataset objects with connected points
 *
 * Algorithm: Creates time-series connected points using interpolation for missing data
 * - Combines all unique dates from both metrics
 * - Uses last known values for missing data points (forward fill)
 * - Marks interpolated vs actual data points for visual distinction
 */
export function processAthleteDatasets(
  athleteTrends: Record<string, any>,
  xMetric: string,
  yMetric: string,
  colors: string[],
  highlightAthlete?: string
) {
  return Object.values(athleteTrends).map((athlete: any, index) => {
    const xData = athlete.metrics[xMetric] || [];
    const yData = athlete.metrics[yMetric] || [];

    // Create all points from both metrics, using last known values for missing data
    const allDataPoints: any[] = [];

    // Combine all unique dates from both metrics
    const allDates = new Set<string>();

    [...xData, ...yData].forEach((point: any) => {
      try {
        const date = point.date instanceof Date ? point.date : new Date(point.date);
        allDates.add(date.toISOString().split('T')[0]);
      } catch (error) {
        console.warn('Date parsing error:', error);
      }
    });

    const sortedDates = Array.from(allDates).sort();

    let lastXValue: number | null = null;
    let lastYValue: number | null = null;

    // Create connected points for each date, using interpolation/last known values
    sortedDates.forEach(dateStr => {
      const currentDate = new Date(dateStr);

      // Find exact matches for this date
      const xPoint = xData.find((x: any) => {
        try {
          const xDate = x.date instanceof Date ? x.date : new Date(x.date);
          return xDate.toISOString().split('T')[0] === dateStr;
        } catch {
          return false;
        }
      });

      const yPoint = yData.find((y: any) => {
        try {
          const yDate = y.date instanceof Date ? y.date : new Date(y.date);
          return yDate.toISOString().split('T')[0] === dateStr;
        } catch {
          return false;
        }
      });

      // Update last known values
      if (xPoint) {
        lastXValue = typeof xPoint.value === 'string' ? parseFloat(xPoint.value) : xPoint.value;
      }
      if (yPoint) {
        lastYValue = typeof yPoint.value === 'string' ? parseFloat(yPoint.value) : yPoint.value;
      }

      // Only add point if we have both values (either current or last known)
      if (lastXValue !== null && lastYValue !== null) {
        allDataPoints.push({
          x: lastXValue,
          y: lastYValue,
          date: currentDate,
          isPersonalBest: xPoint?.isPersonalBest || yPoint?.isPersonalBest || false,
          hasActualData: !!xPoint && !!yPoint, // Track if this point has real data for both metrics
          isInterpolated: !xPoint || !yPoint // Track if this point uses interpolated/last known values
        });
      }
    });

    const color = colors[index % colors.length] || CHART_COLORS.NEUTRAL;
    const isHighlighted = athlete.athleteId === highlightAthlete;

    return {
      label: athlete.athleteName,
      data: allDataPoints,
      backgroundColor: color.replace('1)', '0.6)'),
      borderColor: color,
      borderWidth: isHighlighted ? 3 : 2,
      pointHoverRadius: isHighlighted ? 10 : 8,
      pointBackgroundColor: (context: any) => {
        const point = context.raw;
        if (point?.isPersonalBest) return CHART_COLORS.PERSONAL_BEST;

        // Different styling for interpolated vs actual data points
        if (point?.isInterpolated) {
          // Interpolated points are more transparent
          return color.replace('1)', '0.4)');
        }

        // Time-based color coding - newer points are more saturated
        if (point?.date && allDataPoints.length > 1) {
          const pointDate = new Date(point.date).getTime();
          const oldestDate = Math.min(...allDataPoints.map((p: any) => new Date(p.date).getTime()));
          const newestDate = Math.max(...allDataPoints.map((p: any) => new Date(p.date).getTime()));
          const dateRange = newestDate - oldestDate;

          if (dateRange > 0) {
            const recency = (pointDate - oldestDate) / dateRange;
            const opacity = 0.6 + (recency * 0.4); // Range from 0.6 to 1.0 for actual data
            return color.replace('1)', `${opacity})`);
          }
        }

        return color;
      },
      pointRadius: (context: any) => {
        const point = context.raw;
        if (point?.isPersonalBest) return isHighlighted ? 8 : 6;
        if (point?.isInterpolated) return isHighlighted ? 3 : 2; // Smaller for interpolated points
        return isHighlighted ? 6 : 4; // Normal size for actual data
      },
      pointBorderColor: CHART_COLORS.WHITE,
      pointBorderWidth: 2,
      showLine: true,
      fill: false,
      tension: 0.1
    };
  });
}

/**
 * Calculate analytics for athlete performance
 *
 * @param validAthletes - Array of athletes with valid data
 * @param xMetric - X-axis metric key
 * @param yMetric - Y-axis metric key
 * @param statistics - Optional statistical summary data
 * @param highlightAthlete - Optional athlete ID to focus analytics on
 * @returns Analytics object with correlation, improvement rates, and metadata
 */
export function calculateAthleteAnalytics(
  validAthletes: any[],
  xMetric: string,
  yMetric: string,
  statistics?: Record<string, StatisticalSummary>,
  highlightAthlete?: string
) {
  if (validAthletes.length === 0) return null;

  // Use highlighted athlete if available, otherwise first athlete
  const targetAthlete = highlightAthlete ?
    validAthletes.find((a: any) => a.athleteId === highlightAthlete) || validAthletes[0] :
    validAthletes[0];

  const xData = targetAthlete.metrics[xMetric] || [];
  const yData = targetAthlete.metrics[yMetric] || [];

  // Match points by date for correlation calculation - only use actual measurement points
  const matchedPoints = xData
    .map((xPoint: any) => {
      const yPoint = yData.find((y: any) => {
        const yDate = y.date instanceof Date ? y.date : new Date(y.date);
        const xDate = xPoint.date instanceof Date ? x.date : new Date(x.date);
        return yDate.toISOString().split('T')[0] === xDate.toISOString().split('T')[0];
      });
      return yPoint ? {
        x: typeof xPoint.value === 'string' ? parseFloat(xPoint.value) : xPoint.value,
        y: typeof yPoint.value === 'string' ? parseFloat(yPoint.value) : yPoint.value,
        date: xPoint.date instanceof Date ? xPoint.date : new Date(xPoint.date)
      } : null;
    })
    .filter(Boolean);

  const xValues = matchedPoints.map((p: any) => p.x);
  const yValues = matchedPoints.map((p: any) => p.y);

  return {
    correlation: calculateCorrelation(xValues, yValues),
    xImprovement: calculateImprovement(xData.map((p: any) => ({
      value: typeof p.value === 'string' ? parseFloat(p.value) : p.value,
      date: p.date instanceof Date ? p.date : new Date(p.date)
    }))),
    yImprovement: calculateImprovement(yData.map((p: any) => ({
      value: typeof p.value === 'string' ? parseFloat(p.value) : p.value,
      date: p.date instanceof Date ? p.date : new Date(p.date)
    }))),
    xMean: statistics?.[xMetric]?.mean ?? (xValues.length > 0 ? xValues.reduce((a: number, b: number) => a + b, 0) / xValues.length : 0),
    yMean: statistics?.[yMetric]?.mean ?? (yValues.length > 0 ? yValues.reduce((a: number, b: number) => a + b, 0) / yValues.length : 0),
    dataPoints: matchedPoints.length,
    athleteName: targetAthlete.athleteName
  };
}

// =============================================================================
// TOOLTIP UTILITIES
// =============================================================================

/**
 * Create tooltip title callback for scatter plot charts
 */
export function createTooltipTitleCallback() {
  return (context: any[]) => {
    const point = context[0].raw as any;
    const datasetLabel = context[0].dataset.label;

    if (datasetLabel === 'Group Average') {
      return 'Group Average';
    }

    try {
      if (point.date) {
        const date = point.date instanceof Date ? point.date : new Date(point.date);
        return `${datasetLabel} - ${date.toLocaleDateString()}`;
      }
    } catch (error) {
      console.warn('Date formatting error:', error, point.date);
    }
    return datasetLabel;
  };
}

/**
 * Create tooltip label callback for scatter plot charts
 */
export function createTooltipLabelCallback(xLabel: string, yLabel: string, xUnit: string, yUnit: string) {
  return (context: any) => {
    const point = context.raw as any;
    return [
      `${xLabel}: ${point.x?.toFixed(2)}${xUnit}`,
      `${yLabel}: ${point.y?.toFixed(2)}${yUnit}`
    ];
  };
}

/**
 * Create tooltip after-label callback for scatter plot charts
 */
export function createTooltipAfterLabelCallback() {
  return (context: any) => {
    const point = context.raw as any;
    const labels = [];

    if (point.isPersonalBest) {
      labels.push('🏆 Personal Best!');
    }

    if (point.isInterpolated) {
      labels.push('📊 Interpolated data point');
    } else if (point.hasActualData) {
      labels.push('📈 Actual measurement');
    }

    try {
      if (point.date) {
        const date = point.date instanceof Date ? point.date : new Date(point.date);
        labels.push(`Date: ${date.toLocaleDateString()}`);
      }
    } catch (error) {
      console.warn('Date formatting error in afterLabel:', error, point.date);
    }

    return labels;
  };
}

/**
 * Create complete tooltip callbacks object for scatter plot charts
 */
export function createTooltipCallbacks(xLabel: string, yLabel: string, xUnit: string, yUnit: string) {
  return {
    title: createTooltipTitleCallback(),
    label: createTooltipLabelCallback(xLabel, yLabel, xUnit, yUnit),
    afterLabel: createTooltipAfterLabelCallback()
  };
}

// =============================================================================
// BROWSER COMPATIBILITY UTILITIES
// =============================================================================

/**
 * Cross-browser safe Math.trunc polyfill
 * @param value - Number to truncate
 * @returns Truncated number
 */
export function safeMathTrunc(value: number): number {
  if (typeof Math.trunc === 'function') {
    return Math.trunc(value);
  }
  // Polyfill for older browsers
  return value < 0 ? Math.ceil(value) : Math.floor(value);
}

/**
 * Cross-browser safe Date.now polyfill
 * @returns Current timestamp in milliseconds
 */
export function safeDateNow(): number {
  if (typeof Date.now === 'function') {
    return Date.now();
  }
  // Polyfill for older browsers
  return new Date().getTime();
}

/**
 * Cross-browser safe Object.assign polyfill
 * @param target - Target object
 * @param sources - Source objects
 * @returns Merged object
 */
export function safeObjectAssign<T extends object, U extends object>(target: T, ...sources: U[]): T & U {
  if (typeof Object.assign === 'function') {
    return Object.assign(target, ...sources) as T & U;
  }

  // Polyfill for older browsers
  const result = target as T & U;
  for (const source of sources) {
    if (source != null) {
      for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          (result as any)[key] = (source as any)[key];
        }
      }
    }
  }
  return result;
}

/**
 * Check if browser supports canvas
 * @returns true if canvas is supported
 */
export function supportsCanvas(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext && canvas.getContext('2d'));
  } catch {
    return false;
  }
}

/**
 * Get device pixel ratio with fallback
 * @returns Device pixel ratio or 1 if not supported
 */
export function getDevicePixelRatio(): number {
  if (typeof window === 'undefined') return 1;
  return window.devicePixelRatio || 1;
}

/**
 * Check if user prefers reduced motion
 * @returns true if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// =============================================================================
// SCATTER DATA PROCESSING
// =============================================================================

/**
 * Process scatter plot data for ConnectedScatterChart
 * This function handles all the complex data processing for scatter plots including:
 * - Data validation and filtering
 * - Performance optimization for large datasets
 * - Group average calculations
 * - Analytics generation
 * - Dataset creation for Chart.js
 */
export function processScatterData(params: {
  data: any[]; // TrendData[]
  displayedAthletes: Array<{ id: string; name: string; color: number }>;
  highlightAthlete?: string;
  statistics?: Record<string, any>; // StatisticalSummary
}) {
  const { data, displayedAthletes, highlightAthlete, statistics } = params;

  // Data validation already done at component level, safe to proceed
  const metrics = Array.from(new Set(data.map((trend: any) => trend.metric)));
  const [xMetric, yMetric] = metrics;

  // All required utilities are now imported at the top of the file

  // Group ALL trends by athlete FIRST
  const allAthleteTrends = data.reduce((acc: any, trend: any) => {
    if (!acc[trend.athleteId]) {
      acc[trend.athleteId] = {
        athleteId: trend.athleteId,
        athleteName: trend.athleteName,
        metrics: {}
      };
    }
    acc[trend.athleteId].metrics[trend.metric] = trend.data;
    return acc;
  }, {} as Record<string, any>);

  // Filter to highlighted athlete or use displayedAthletes for multi-athlete selection
  const athletesToShow = highlightAthlete ?
    [allAthleteTrends[highlightAthlete]].filter(Boolean) :
    displayedAthletes.map(athlete => allAthleteTrends[athlete.id]).filter(Boolean);

  // Keep all athletes for group average calculations
  const allAthletesForGroupCalc = Object.values(allAthleteTrends);

  // Ensure we have athletes with both metrics and valid data
  const validAthletes = athletesToShow.filter((athlete: any) => {
    if (!athlete) return false;

    // Only require the specific two metrics being used for X and Y axes
    const hasXMetric = athlete.metrics[xMetric]?.length > 0;
    const hasYMetric = athlete.metrics[yMetric]?.length > 0;

    return hasXMetric && hasYMetric;
  });

  // Performance optimization: Check total data points and limit if necessary
  const totalDataPoints = calculateTotalDataPoints(validAthletes, xMetric, yMetric);
  const isLargeDataset = totalDataPoints > ALGORITHM_CONFIG.MAX_DATA_POINTS;

  // Apply data limiting for performance if dataset is large
  const optimizedAthletes = isLargeDataset ? validAthletes.map((athlete: any) => ({
    ...athlete,
    metrics: {
      ...athlete.metrics,
      [xMetric]: limitDatasetSize(athlete.metrics[xMetric] || [], Math.floor(ALGORITHM_CONFIG.MAX_DATA_POINTS / validAthletes.length / 2)),
      [yMetric]: limitDatasetSize(athlete.metrics[yMetric] || [], Math.floor(ALGORITHM_CONFIG.MAX_DATA_POINTS / validAthletes.length / 2))
    }
  })) : validAthletes;

  if (optimizedAthletes.length === 0) {
    return null;
  }

  const colors = [...CHART_COLORS.SERIES];
  const datasets: any[] = [];

  // Create dataset for each athlete
  optimizedAthletes.forEach((athlete: any, athleteIndex: number) => {
    const xData = athlete.metrics[xMetric] || [];
    const yData = athlete.metrics[yMetric] || [];

    // Match points by date for scatter plot
    const scatterPoints: any[] = xData
      .map((xPoint: any) => {
        const yPoint = yData.find((y: any) => {
          return getDateKey(y.date) === getDateKey(xPoint.date);
        });

        if (!yPoint) return null;

        return {
          x: typeof xPoint.value === 'string' ? parseFloat(xPoint.value) : xPoint.value,
          y: typeof yPoint.value === 'string' ? parseFloat(yPoint.value) : yPoint.value,
          date: xPoint.date instanceof Date ? xPoint.date : new Date(xPoint.date),
          isPersonalBest: xPoint.isPersonalBest || yPoint.isPersonalBest || false,
          hasActualData: !xPoint.isInterpolated && !yPoint.isInterpolated,
          isInterpolated: xPoint.isInterpolated || yPoint.isInterpolated || false
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const dateA = a.date instanceof Date ? a.date : new Date(a.date);
        const dateB = b.date instanceof Date ? b.date : new Date(b.date);
        return dateA.getTime() - dateB.getTime();
      });

    if (scatterPoints.length === 0) return;

    const athleteColor = colors[athleteIndex % colors.length];
    const isHighlighted = highlightAthlete === athlete.athleteId;

    datasets.push({
      label: athlete.athleteName,
      data: scatterPoints,
      backgroundColor: (context: any) => {
        const point = context.raw;
        if (point?.isPersonalBest) return CHART_COLORS.PERSONAL_BEST;
        if (isHighlighted) return CHART_COLORS.HIGHLIGHT;
        return athleteColor;
      },
      borderColor: athleteColor,
      borderWidth: 2,
      pointRadius: (context: any) => {
        const point = context.raw;
        if (point?.isPersonalBest) return 6;
        if (isHighlighted) return 8;
        return 5;
      },
      pointHoverRadius: (context: any) => {
        const point = context.raw;
        if (point?.isPersonalBest) return 8;
        if (isHighlighted) return 10;
        return 7;
      },
      pointBackgroundColor: (context: any) => {
        const point = context.raw;
        if (point?.isPersonalBest) return CHART_COLORS.PERSONAL_BEST;
        if (isHighlighted) return CHART_COLORS.HIGHLIGHT_ALPHA;
        return athleteColor;
      },
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      showLine: true,
      fill: false,
      tension: 0.1,
    });
  });

  // Calculate analytics for highlighted athlete
  const analytics = highlightAthlete ? (() => {
    const targetAthlete = optimizedAthletes.find((a: any) => a.athleteId === highlightAthlete);
    if (!targetAthlete) return null;

    const xData = targetAthlete.metrics[xMetric] || [];
    const yData = targetAthlete.metrics[yMetric] || [];

    // Match points by date for correlation calculation - only use actual measurement points
    const matchedPoints = xData
      .map((xPoint: any) => {
        const yPoint = yData.find((y: any) => {
          return getDateKey(y.date) === getDateKey(xPoint.date);
        });
        return yPoint ? {
          x: typeof xPoint.value === 'string' ? parseFloat(xPoint.value) : xPoint.value,
          y: typeof yPoint.value === 'string' ? parseFloat(yPoint.value) : yPoint.value,
          date: xPoint.date instanceof Date ? xPoint.date : new Date(xPoint.date)
        } : null;
      })
      .filter(Boolean);

    const xValues = matchedPoints.map((p: any) => p.x);
    const yValues = matchedPoints.map((p: any) => p.y);

    return {
      correlation: calculateCorrelation(xValues, yValues),
      xImprovement: calculateImprovement(xData.map((p: any) => ({
        value: typeof p.value === 'string' ? parseFloat(p.value) : p.value,
        date: p.date instanceof Date ? p.date : new Date(p.date)
      }))),
      yImprovement: calculateImprovement(yData.map((p: any) => ({
        value: typeof p.value === 'string' ? parseFloat(p.value) : p.value,
        date: p.date instanceof Date ? p.date : new Date(p.date)
      }))),
      xMean: statistics?.[xMetric]?.mean ?? (xValues.length > 0 ? xValues.reduce((a: number, b: number) => a + b, 0) / xValues.length : 0),
      yMean: statistics?.[yMetric]?.mean ?? (yValues.length > 0 ? yValues.reduce((a: number, b: number) => a + b, 0) / yValues.length : 0),
      dataPoints: matchedPoints.length,
      athleteName: targetAthlete.athleteName
    };
  })() : null;

  // Add group average trend line using groupAverage data from TrendDataPoints
  if (optimizedAthletes.length > 0) {
    const athlete = optimizedAthletes[0];
    const xData = athlete.metrics[xMetric] || [];
    const yData = athlete.metrics[yMetric] || [];

    // Create group average points for dates where both metrics have group averages
    const groupAveragePoints: any[] = xData
      .map((xPoint: any) => {
        const yPoint = yData.find((y: any) => {
          return getDateKey(y.date) === getDateKey(xPoint.date);
        });

        // Only include if both points exist and have group averages
        if (yPoint && xPoint.groupAverage !== undefined && yPoint.groupAverage !== undefined) {
          return {
            x: xPoint.groupAverage,
            y: yPoint.groupAverage,
            date: xPoint.date instanceof Date ? xPoint.date : new Date(xPoint.date),
            isPersonalBest: false,
            hasActualData: true,
            isInterpolated: false
          };
        }
        return null;
      })
      .filter((point: any): point is ChartPoint => point !== null)
      .sort((a: any, b: any) => {
        const dateA = a.date instanceof Date ? a.date : new Date(a.date);
        const dateB = b.date instanceof Date ? b.date : new Date(b.date);
        return dateA.getTime() - dateB.getTime();
      });

    // Add group average trend line if we have data points
    if (groupAveragePoints.length > 0) {
      datasets.push({
        label: 'Group Average Trend',
        data: groupAveragePoints,
        backgroundColor: 'rgba(99, 102, 241, 0.2)',
        borderColor: 'rgba(99, 102, 241, 1)',
        borderWidth: 3,
        pointRadius: () => 6,
        pointHoverRadius: 8,
        pointBackgroundColor: () => 'rgba(99, 102, 241, 1)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        showLine: true,
        fill: false,
        tension: 0.1,
      });
    } else {
      // Fallback: Create synthetic group average trend line from all athlete data
      if (allAthletesForGroupCalc.length > 1) {
        // Collect all unique dates across all athletes
        const allDatesSet = new Set<string>();
        allAthletesForGroupCalc.forEach((athlete: any) => {
          const xData = athlete.metrics[xMetric] || [];
          const yData = athlete.metrics[yMetric] || [];
          [...xData, ...yData].forEach((point: any) => {
            try {
              const dateKey = getDateKey(point.date);
              if (dateKey) allDatesSet.add(dateKey);
            } catch (error) {
              console.warn('Error processing date for group average:', error);
            }
          });
        });

        const sortedDates = Array.from(allDatesSet).sort();

        // Calculate group averages for each date
        const syntheticGroupPoints: any[] = [];
        for (const dateKey of sortedDates) {
          const xValues: number[] = [];
          const yValues: number[] = [];

          allAthletesForGroupCalc.forEach((athlete: any) => {
            const xData = athlete.metrics[xMetric] || [];
            const yData = athlete.metrics[yMetric] || [];

            const xPoint = xData.find((p: any) => getDateKey(p.date) === dateKey);
            const yPoint = yData.find((p: any) => getDateKey(p.date) === dateKey);

            if (xPoint && yPoint) {
              const xVal = typeof xPoint.value === 'string' ? parseFloat(xPoint.value) : xPoint.value;
              const yVal = typeof yPoint.value === 'string' ? parseFloat(yPoint.value) : yPoint.value;
              if (!isNaN(xVal) && !isNaN(yVal)) {
                xValues.push(xVal);
                yValues.push(yVal);
              }
            }
          });

          // Only add point if we have data from at least 2 athletes
          if (xValues.length >= 2 && yValues.length >= 2) {
            const avgX = xValues.reduce((sum, val) => sum + val, 0) / xValues.length;
            const avgY = yValues.reduce((sum, val) => sum + val, 0) / yValues.length;

            syntheticGroupPoints.push({
              x: avgX,
              y: avgY,
              date: new Date(dateKey),
              isPersonalBest: false,
              hasActualData: true,
              isInterpolated: false
            });
          }
        }

        if (syntheticGroupPoints.length > 0) {
          datasets.push({
            label: 'Group Average Trend',
            data: syntheticGroupPoints,
            backgroundColor: 'rgba(99, 102, 241, 0.2)',
            borderColor: 'rgba(99, 102, 241, 1)',
            borderWidth: 3,
            pointRadius: () => 6,
            pointHoverRadius: 8,
            pointBackgroundColor: () => 'rgba(99, 102, 241, 1)',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            showLine: true,
            fill: false,
            tension: 0.1,
          });
        }
      }
    }
  }

  // Get metric configuration
  const xUnit = METRIC_CONFIG[xMetric as keyof typeof METRIC_CONFIG]?.unit || '';
  const yUnit = METRIC_CONFIG[yMetric as keyof typeof METRIC_CONFIG]?.unit || '';
  const xLabel = METRIC_CONFIG[xMetric as keyof typeof METRIC_CONFIG]?.label || xMetric;
  const yLabel = METRIC_CONFIG[yMetric as keyof typeof METRIC_CONFIG]?.label || yMetric;

  const athleteTrends = optimizedAthletes.reduce((acc: any, athlete: any) => {
    acc[athlete.athleteId] = athlete;
    return acc;
  }, {} as Record<string, any>);

  return {
    datasets,
    xMetric,
    yMetric,
    xUnit,
    yUnit,
    xLabel,
    yLabel,
    athleteTrends,
    analytics,
    // Add analytics to chart data for plugin access
    chartData: {
      datasets,
      analytics
    }
  };
}

// =============================================================================
// CHART OPTIONS CONFIGURATION
// =============================================================================

/**
 * Create chart options configuration for connected scatter plot
 *
 * @param scatterData - Processed scatter chart data
 * @param config - Chart configuration from props
 * @param statistics - Optional statistical summary data
 * @returns Chart.js options configuration object
 */
export function createChartOptions(
  scatterData: any | null,
  config: ChartConfiguration,
  statistics?: Record<string, StatisticalSummary>
): ChartOptions<'line'> {
  if (!scatterData) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: config.title || 'Chart Loading...',
          font: {
            size: 16,
            weight: 'bold'
          }
        }
      }
    } satisfies ChartOptions<'line'>;
  }

  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        text: config.title,
        font: {
          size: 16,
          weight: 'bold'
        }
      },
      subtitle: {
        display: !!config.subtitle,
        text: config.subtitle
      },
      tooltip: {
        callbacks: createTooltipCallbacks(
          scatterData.xLabel,
          scatterData.yLabel,
          scatterData.xUnit,
          scatterData.yUnit
        )
      },
      legend: {
        display: config.showLegend,
        position: 'top' as const
      },
      annotation: scatterData?.analytics ? {
        annotations: (() => {
          const xMean = scatterData.analytics.xMean;
          const yMean = scatterData.analytics.yMean;

          // Get dynamic quadrant labels based on metric types
          const labels = getPerformanceQuadrantLabels(scatterData.xMetric, scatterData.yMetric);

          // Calculate chart bounds for full background coverage
          const datasets = scatterData.chartData.datasets;
          if (!datasets || datasets.length === 0) return {};

          const allPoints = datasets.flatMap((dataset: any) => dataset.data || []);
          if (allPoints.length === 0) return {};

          const xValues = allPoints.map((p: any) => p.x).filter((x: any) => typeof x === 'number' && !isNaN(x));
          const yValues = allPoints.map((p: any) => p.y).filter((y: any) => typeof y === 'number' && !isNaN(y));

          if (xValues.length === 0 || yValues.length === 0) return {};

          const xMin = Math.min(...xValues) - (Math.max(...xValues) - Math.min(...xValues)) * CHART_CONFIG.SCATTER.CHART_PADDING;
          const xMax = Math.max(...xValues) + (Math.max(...xValues) - Math.min(...xValues)) * CHART_CONFIG.SCATTER.CHART_PADDING;
          const yMin = Math.min(...yValues) - (Math.max(...yValues) - Math.min(...yValues)) * CHART_CONFIG.SCATTER.CHART_PADDING;
          const yMax = Math.max(...yValues) + (Math.max(...yValues) - Math.min(...yValues)) * CHART_CONFIG.SCATTER.CHART_PADDING;

          // Color mapping for dynamic colors
          const colorMap = {
            green: CHART_CONFIG.COLORS.QUADRANTS.ELITE,
            yellow: CHART_CONFIG.COLORS.QUADRANTS.GOOD,
            orange: 'rgba(249, 115, 22, 0.1)', // Orange color for distinction
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
              borderColor: 'rgba(75, 85, 99, 0.6)',
              borderWidth: 1,
              borderDash: [5, 5],
              z: 1
            },
            // Horizontal line at y mean
            yMeanLine: {
              type: 'line' as const,
              xMin: xMin,
              xMax: xMax,
              yMin: yMean,
              yMax: yMean,
              borderColor: 'rgba(75, 85, 99, 0.6)',
              borderWidth: 1,
              borderDash: [5, 5],
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
          text: `${scatterData.xLabel} (${scatterData.xUnit})`
        },
        grid: {
          display: true,
          color: 'rgba(0, 0, 0, 0.1)'
        },
        // Set explicit bounds to match quadrant coverage
        ...(scatterData?.analytics ? (() => {
          const datasets = scatterData.chartData.datasets;
          if (!datasets || datasets.length === 0) return {};

          const allPoints = datasets.flatMap((dataset: any) => dataset.data || []);
          const xValues = allPoints.map((p: any) => p.x).filter((x: any) => typeof x === 'number' && !isNaN(x));

          if (xValues.length > 0) {
            const xMin = Math.min(...xValues) - (Math.max(...xValues) - Math.min(...xValues)) * CHART_CONFIG.SCATTER.CHART_PADDING;
            const xMax = Math.max(...xValues) + (Math.max(...xValues) - Math.min(...xValues)) * CHART_CONFIG.SCATTER.CHART_PADDING;
            return { min: xMin, max: xMax };
          }
          return {};
        })() : {})
      },
      y: {
        type: 'linear',
        title: {
          display: true,
          text: `${scatterData.yLabel} (${scatterData.yUnit})`
        },
        grid: {
          display: true,
          color: (context: any) => {
            // Highlight mean line
            const yMean = scatterData?.analytics?.yMean || (statistics?.[scatterData.yMetric]?.mean) || 0;
            return Math.abs(context.tick.value - yMean) < 0.01 ? 'rgba(75, 85, 99, 0.8)' : 'rgba(0, 0, 0, 0.1)';
          },
          lineWidth: (context: any) => {
            const yMean = scatterData?.analytics?.yMean || (statistics?.[scatterData.yMetric]?.mean) || 0;
            return Math.abs(context.tick.value - yMean) < 0.01 ? 2 : 1;
          }
        },
        // Set explicit bounds to match quadrant coverage
        ...(scatterData?.analytics ? (() => {
          const datasets = scatterData.chartData.datasets;
          if (!datasets || datasets.length === 0) return {};

          const allPoints = datasets.flatMap((dataset: any) => dataset.data || []);
          const yValues = allPoints.map((p: any) => p.y).filter((y: any) => typeof y === 'number' && !isNaN(y));

          if (yValues.length > 0) {
            const yMin = Math.min(...yValues) - (Math.max(...yValues) - Math.min(...yValues)) * CHART_CONFIG.SCATTER.CHART_PADDING;
            const yMax = Math.max(...yValues) + (Math.max(...yValues) - Math.min(...yValues)) * CHART_CONFIG.SCATTER.CHART_PADDING;
            return { min: yMin, max: yMax };
          }
          return {};
        })() : {})
      }
    },
    elements: {
      point: {
        hoverRadius: CHART_CONFIG.STYLING.POINT_HOVER_RADIUS.DEFAULT
      },
      line: {
        tension: CHART_CONFIG.STYLING.LINE_TENSION
      }
    },
    interaction: {
      intersect: false,
      mode: 'point'
    }
  } satisfies ChartOptions<'line'>;
}