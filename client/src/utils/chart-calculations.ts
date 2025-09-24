/**
 * Chart Calculation Utilities
 *
 * Extracted calculation utilities from ConnectedScatterChart to improve
 * performance and maintainability. All calculations are pure functions
 * that can be easily memoized and tested.
 */

import type { TrendData, StatisticalSummary } from '@shared/analytics-types';
import { METRIC_CONFIG } from '@shared/analytics-types';
import type {
  ChartPoint,
  ChartDataset,
  ChartAnalytics,
  ProcessedAthleteData,
  PerformanceQuadrantLabels,
  PerformanceQuadrantLabel
} from '@/types/chart-types';
import { CHART_COLORS } from '@/constants/chart-config';

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
        const xDate = xPoint.date instanceof Date ? xPoint.date : new Date(xPoint.date);
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