import React, { useMemo, useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
  TooltipItem
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Line } from 'react-chartjs-2';
import type {
  TrendData,
  ChartConfiguration,
  StatisticalSummary
} from '@shared/analytics-types';
import { METRIC_CONFIG } from '@shared/analytics-types';
import { CHART_CONFIG } from '@/constants/chart-config';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

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
      topRight: { label: descriptions.elite, color: 'green' },
      topLeft: { label: descriptions.yGood, color: 'yellow' },
      bottomRight: { label: descriptions.xGood, color: 'orange' },
      bottomLeft: { label: descriptions.development, color: 'red' }
    };
  } else if (xLowerIsBetter && !yLowerIsBetter) {
    // X lower is better, Y higher is better (e.g., 40-yard dash vs vertical jump)
    return {
      topLeft: { label: descriptions.elite, color: 'green' },
      topRight: { label: descriptions.yGood, color: 'orange' },
      bottomLeft: { label: descriptions.xGood, color: 'yellow' },
      bottomRight: { label: descriptions.development, color: 'red' }
    };
  } else if (!xLowerIsBetter && yLowerIsBetter) {
    // X higher is better, Y lower is better (e.g., vertical jump vs 40-yard dash)
    return {
      bottomRight: { label: descriptions.elite, color: 'green' },
      bottomLeft: { label: descriptions.yGood, color: 'orange' },
      topRight: { label: descriptions.xGood, color: 'yellow' },
      topLeft: { label: descriptions.development, color: 'red' }
    };
  } else {
    // Both lower is better (e.g., 40-yard dash vs agility time)
    return {
      bottomLeft: { label: descriptions.elite, color: 'green' },
      bottomRight: { label: descriptions.yGood, color: 'yellow' },
      topLeft: { label: descriptions.xGood, color: 'orange' },
      topRight: { label: descriptions.development, color: 'red' }
    };
  }
}

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
  // Internal state for athlete selection and toggles
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>([]);
  const [athleteToggles, setAthleteToggles] = useState<Record<string, boolean>>({});
  const [showGroupAverage, setShowGroupAverage] = useState(true);

  // Get effective athlete selection (external prop or internal state)
  const effectiveSelectedIds = selectedAthleteIds || internalSelectedIds;
  const handleSelectionChange = onAthleteSelectionChange || setInternalSelectedIds;

  // Process all athletes from data
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

  // Set up initial athlete selection
  const maxAthletes = 10; // Limit for performance
  useEffect(() => {
    if (!selectedAthleteIds && allAthletes.length > 0 && effectiveSelectedIds.length === 0) {
      const initialSelection = allAthletes.slice(0, maxAthletes).map(a => a.id);
      handleSelectionChange(initialSelection);
    }
  }, [allAthletes, maxAthletes, selectedAthleteIds, effectiveSelectedIds.length]);

  // Initialize athlete toggles when athletes change
  useEffect(() => {
    const newToggles: Record<string, boolean> = {};
    allAthletes.forEach(athlete => {
      newToggles[athlete.id] = effectiveSelectedIds.includes(athlete.id);
    });
    setAthleteToggles(newToggles);
  }, [allAthletes, effectiveSelectedIds]);

  // Filter displayed athletes based on selection and toggles
  const displayedAthletes = useMemo(() => {
    return allAthletes.filter(athlete =>
      effectiveSelectedIds.includes(athlete.id) && athleteToggles[athlete.id]
    );
  }, [allAthletes, effectiveSelectedIds, athleteToggles]);

  // Helper function to calculate correlation coefficient
  const calculateCorrelation = (xValues: number[], yValues: number[]): number => {
    if (xValues.length !== yValues.length || xValues.length < 2) return 0;

    const n = xValues.length;
    const sumX = xValues.reduce((a, b) => a + b, 0);
    const sumY = yValues.reduce((a, b) => a + b, 0);
    const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
    const sumXX = xValues.reduce((sum, x) => sum + x * x, 0);
    const sumYY = yValues.reduce((sum, y) => sum + y * y, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));

    return denominator === 0 ? 0 : numerator / denominator;
  };

  // Helper function to calculate rate of improvement (slope)
  const calculateImprovement = (values: {value: number, date: Date}[]): number => {
    if (values.length < 2) return 0;

    const sortedValues = [...values].sort((a, b) => a.date.getTime() - b.date.getTime());
    const firstValue = sortedValues[0].value;
    const lastValue = sortedValues[sortedValues.length - 1].value;
    const timeSpan = sortedValues[sortedValues.length - 1].date.getTime() - sortedValues[0].date.getTime();
    const daySpan = timeSpan / (1000 * 60 * 60 * 24); // Convert to days

    return daySpan > 0 ? (lastValue - firstValue) / daySpan : 0;
  };

  // Transform trend data for connected scatter plot
  const scatterData = useMemo(() => {

    // Early validation but don't return null yet - we need to maintain hook consistency
    let hasValidData = true;
    let validationMessage = '';
    let metrics: string[] = [];

    if (!data || data.length === 0) {
      hasValidData = false;
      validationMessage = 'No data provided';
      metrics = []; // Ensure metrics is always defined
    } else {
      // Get unique metrics from all data
      metrics = Array.from(new Set(data.map(trend => trend.metric)));

      // For connected scatter plot, we need exactly 2 metrics
      if (metrics.length < 2) {
        hasValidData = false;
        validationMessage = `Not enough metrics: ${metrics.length} (need 2)`;
      }
    }

    // Return early if validation failed, but with a consistent structure
    if (!hasValidData) {
      return {
        isValid: false,
        validationMessage,
        datasets: [],
        xMetric: metrics[0] || '',
        yMetric: metrics[1] || '',
        xUnit: '',
        yUnit: '',
        xLabel: metrics[0] || '',
        yLabel: metrics[1] || '',
        athleteTrends: {},
        analytics: null,
        chartData: { datasets: [], analytics: null }
      };
    }

    const [xMetric, yMetric] = metrics;

    // Group ALL trends by athlete FIRST
    const allAthleteTrends = data.reduce((acc, trend) => {
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

    if (validAthletes.length === 0) {
      return null;
    }

    // Use valid athletes for chart data
    const athleteTrends = validAthletes.reduce((acc, athlete: any) => {
      acc[athlete.athleteId] = athlete;
      return acc;
    }, {} as Record<string, any>);

    const colors = [
      'rgba(59, 130, 246, 1)',
      'rgba(16, 185, 129, 1)',
      'rgba(239, 68, 68, 1)'
    ];

    const datasets = Object.values(athleteTrends).map((athlete: any, index) => {
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

      const connectedPoints = allDataPoints;

      const color = colors[index % colors.length] || 'rgba(75, 85, 99, 1)';
      const isHighlighted = athlete.athleteId === highlightAthlete;

      return {
        label: athlete.athleteName,
        data: connectedPoints,
        backgroundColor: color.replace('1)', '0.6)'),
        borderColor: color,
        borderWidth: isHighlighted ? 3 : 2,
        pointHoverRadius: isHighlighted ? 10 : 8,
        pointBackgroundColor: (context: any) => {
          const point = context.raw;
          if (point?.isPersonalBest) return 'rgba(255, 215, 0, 1)';

          // Different styling for interpolated vs actual data points
          if (point?.isInterpolated) {
            // Interpolated points are more transparent
            return color.replace('1)', '0.4)');
          }

          // Time-based color coding - newer points are more saturated
          if (point?.date && connectedPoints.length > 1) {
            const pointDate = new Date(point.date).getTime();
            const oldestDate = Math.min(...connectedPoints.map((p: any) => new Date(p.date).getTime()));
            const newestDate = Math.max(...connectedPoints.map((p: any) => new Date(p.date).getTime()));
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
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        showLine: true,
        fill: false,
        tension: 0.1
      };
    });

    const xUnit = METRIC_CONFIG[xMetric as keyof typeof METRIC_CONFIG]?.unit || '';
    const yUnit = METRIC_CONFIG[yMetric as keyof typeof METRIC_CONFIG]?.unit || '';
    const xLabel = METRIC_CONFIG[xMetric as keyof typeof METRIC_CONFIG]?.label || xMetric;
    const yLabel = METRIC_CONFIG[yMetric as keyof typeof METRIC_CONFIG]?.label || yMetric;

    // Calculate analytics for the highlighted athlete or first available athlete
    const analytics = validAthletes.length > 0 ? (() => {
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
    })() : null;

    // Add group average trend line using groupAverage data from TrendDataPoints
    if (validAthletes.length > 0) {
      const athlete = validAthletes[0];
      const xData = athlete.metrics[xMetric] || [];
      const yData = athlete.metrics[yMetric] || [];


      // Create group average points for dates where both metrics have group averages
      const groupAveragePoints = xData
        .map((xPoint: any) => {
          const yPoint = yData.find((y: any) => {
            const yDate = y.date instanceof Date ? y.date : new Date(y.date);
            const xDate = xPoint.date instanceof Date ? xPoint.date : new Date(xPoint.date);
            return yDate.toISOString().split('T')[0] === xDate.toISOString().split('T')[0];
          });


          // Only include if both points exist and have group averages
          if (yPoint && xPoint.groupAverage !== undefined && yPoint.groupAverage !== undefined) {
            return {
              x: xPoint.groupAverage,
              y: yPoint.groupAverage,
              date: xPoint.date instanceof Date ? xPoint.date : new Date(xPoint.date)
            };
          }
          return null;
        })
        .filter(Boolean)
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
                const date = point.date instanceof Date ? point.date : new Date(point.date);
                allDatesSet.add(date.toISOString().split('T')[0]);
              } catch (error) {
                console.warn('Date parsing error in synthetic trend:', error);
              }
            });
          });

          const syntheticGroupPoints = Array.from(allDatesSet)
            .sort()
            .map(dateStr => {
              // For each date, calculate group average from all athletes who have data for both metrics
              const athleteValuesForDate: Array<{x: number, y: number}> = [];

              allAthletesForGroupCalc.forEach((athlete: any) => {
                const xData = athlete.metrics[xMetric] || [];
                const yData = athlete.metrics[yMetric] || [];

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

                if (xPoint && yPoint) {
                  athleteValuesForDate.push({
                    x: typeof xPoint.value === 'string' ? parseFloat(xPoint.value) : xPoint.value,
                    y: typeof yPoint.value === 'string' ? parseFloat(yPoint.value) : yPoint.value
                  });
                }
              });

              // Calculate group average for this date if we have at least 2 athletes
              if (athleteValuesForDate.length >= 2) {
                const avgX = athleteValuesForDate.reduce((sum, val) => sum + val.x, 0) / athleteValuesForDate.length;
                const avgY = athleteValuesForDate.reduce((sum, val) => sum + val.y, 0) / athleteValuesForDate.length;

                return {
                  x: avgX,
                  y: avgY,
                  date: new Date(dateStr)
                };
              }

              return null;
            })
            .filter(Boolean);

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

    // Add overall group average point if statistics available
    if (statistics && statistics[xMetric]?.mean && statistics[yMetric]?.mean) {
      datasets.push({
        label: 'Overall Group Average',
        data: [{
          x: statistics[xMetric].mean,
          y: statistics[yMetric].mean
        }],
        backgroundColor: 'rgba(156, 163, 175, 1)',
        borderColor: 'rgba(156, 163, 175, 1)',
        borderWidth: 3,
        pointRadius: () => 8,
        pointHoverRadius: 10,
        pointBackgroundColor: () => 'rgba(156, 163, 175, 1)',
        pointBorderColor: 'rgba(156, 163, 175, 1)',
        pointBorderWidth: 2,
        showLine: false,
        fill: false,
        tension: 0
      });
    }

    return {
      isValid: true,
      validationMessage: '',
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
  }, [data, statistics, highlightAthlete, displayedAthletes]);

  // Chart options (always define this hook to maintain consistent hook order)
  const options = useMemo(() => {
    // Ensure we have fallback values for invalid data to maintain hook consistency
    const safeScatterData = scatterData || {
      xLabel: 'X Axis',
      yLabel: 'Y Axis', 
      xUnit: '',
      yUnit: '',
      analytics: null,
      chartData: { datasets: [], analytics: null }
    };
    
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
        callbacks: {
          title: (context: TooltipItem<'line'>[]) => {
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
          },
          label: (context: TooltipItem<'line'>) => {
            const point = context.raw as any;
            return [
              `${scatterData?.xLabel || 'X'}: ${point.x?.toFixed(2)}${scatterData?.xUnit || ''}`,
              `${scatterData?.yLabel || 'Y'}: ${point.y?.toFixed(2)}${scatterData?.yUnit || ''}`
            ];
          },
          afterLabel: (context: TooltipItem<'line'>) => {
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
          }
        }
      },
      legend: {
        display: config.showLegend,
        position: 'top' as const
      },
      annotation: safeScatterData.analytics ? {
        annotations: (() => {
          const xMean = safeScatterData.analytics.xMean;
          const yMean = safeScatterData.analytics.yMean;

          // Get dynamic quadrant labels based on metric types
          const labels = getPerformanceQuadrantLabels(scatterData?.xMetric || '', scatterData?.yMetric || '');

          // Calculate chart bounds for full background coverage
          const datasets = safeScatterData.chartData.datasets;
          if (!datasets || datasets.length === 0) return {};

          const allPoints = datasets.flatMap(dataset => dataset.data || []);
          if (allPoints.length === 0) return {};

          const xValues = allPoints.map((p: any) => p.x).filter(x => typeof x === 'number' && !isNaN(x));
          const yValues = allPoints.map((p: any) => p.y).filter(y => typeof y === 'number' && !isNaN(y));

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
          text: `${safeScatterData.xLabel || 'X Axis'} (${safeScatterData.xUnit || ''})`
        },
        grid: {
          display: true,
          color: 'rgba(0, 0, 0, 0.1)'
        },
        // Set explicit bounds to match quadrant coverage
        ...(safeScatterData?.analytics ? (() => {
          const datasets = safeScatterData.chartData.datasets;
          if (!datasets || datasets.length === 0) return {};

          const allPoints = datasets.flatMap(dataset => dataset.data || []);
          const xValues = allPoints.map((p: any) => p.x).filter(x => typeof x === 'number' && !isNaN(x));

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
          text: `${safeScatterData.yLabel || 'Y Axis'} (${safeScatterData.yUnit || ''})`
        },
        grid: {
          display: true,
          color: (context: any) => {
            // Highlight mean line
            const yMean = safeScatterData?.analytics?.yMean || (scatterData?.yMetric && statistics?.[scatterData?.yMetric]?.mean) || 0;
            return Math.abs(context.tick.value - yMean) < 0.01 ? 'rgba(75, 85, 99, 0.8)' : 'rgba(0, 0, 0, 0.1)';
          },
          lineWidth: (context: any) => {
            const yMean = safeScatterData?.analytics?.yMean || (scatterData?.yMetric && statistics?.[scatterData?.yMetric]?.mean) || 0;
            return Math.abs(context.tick.value - yMean) < 0.01 ? 2 : 1;
          }
        },
        // Set explicit bounds to match quadrant coverage
        ...(safeScatterData?.analytics ? (() => {
          const datasets = safeScatterData.chartData.datasets;
          if (!datasets || datasets.length === 0) return {};

          const allPoints = datasets.flatMap(dataset => dataset.data || []);
          const yValues = allPoints.map((p: any) => p.y).filter(y => typeof y === 'number' && !isNaN(y));

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
        hoverRadius: 10
      },
      line: {
        tension: 0.1
      }
    },
    interaction: {
      intersect: false,
      mode: 'point'
    }
  } satisfies ChartOptions<'line'>;
  }, [scatterData, config, statistics]);

  // Helper functions for athlete toggles
  const toggleAthlete = (athleteId: string) => {
    setAthleteToggles(prev => ({
      ...prev,
      [athleteId]: !prev[athleteId]
    }));
  };

  const selectAllAthletes = () => {
    const allEnabled: Record<string, boolean> = {};
    allAthletes.forEach(athlete => {
      allEnabled[athlete.id] = true;
    });
    setAthleteToggles(allEnabled);
  };

  const clearAllAthletes = () => {
    const allDisabled: Record<string, boolean> = {};
    allAthletes.forEach(athlete => {
      allDisabled[athlete.id] = false;
    });
    setAthleteToggles(allDisabled);
  };

  const visibleAthleteCount = Object.values(athleteToggles).filter(Boolean).length;

  // Early return check - moved after all hooks are defined to maintain hook order
  if (!scatterData?.isValid) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center">
          <div className="text-lg font-medium mb-2">Connected Scatter Plot Unavailable</div>
          <div className="text-sm">
            This chart requires exactly 2 metrics with time series data.
          </div>
          <div className="text-sm mt-1">
            {scatterData?.validationMessage || 'Please ensure both primary and additional metrics have measurement data for the selected time period.'}
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

      <Line data={scatterData.chartData} options={options} />
      
      {/* Progress indicators */}
      {scatterData.analytics && (
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