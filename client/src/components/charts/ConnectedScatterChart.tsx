import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Scatter } from 'react-chartjs-2';
import type {
  TrendData,
  ChartConfiguration,
  StatisticalSummary
} from '@shared/analytics-types';
import { METRIC_CONFIG } from '@shared/analytics-types';
import { CHART_CONFIG } from '@/constants/chart-config';

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
}

export const ConnectedScatterChart = React.memo(function ConnectedScatterChart({
  data,
  config,
  statistics,
  highlightAthlete
}: ConnectedScatterChartProps) {
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
    console.log('ConnectedScatterChart: Full data received:', data);
    console.log('ConnectedScatterChart: Data length:', data?.length);

    // Early validation but don't return null yet - we need to maintain hook consistency
    let hasValidData = true;
    let validationMessage = '';
    let metrics: string[] = [];

    if (!data || data.length === 0) {
      console.log('ConnectedScatterChart: No data provided');
      hasValidData = false;
      validationMessage = 'No data provided';
    } else {
      // Log each trend data item to understand the structure
      data.forEach((trend, index) => {
        console.log(`ConnectedScatterChart: Trend ${index}:`, {
          metric: trend.metric,
          athleteId: trend.athleteId,
          athleteName: trend.athleteName,
          dataLength: trend.data?.length
        });
      });

      // Get unique metrics from all data
      metrics = Array.from(new Set(data.map(trend => trend.metric)));
      console.log('ConnectedScatterChart: Available metrics:', metrics);

      // For connected scatter plot, we need exactly 2 metrics
      // If we have less than 2, check if we can use the config to determine the metrics we should be looking for
      if (metrics.length < 2) {
        console.log('ConnectedScatterChart: Not enough metrics in data, checking config');
        
        // If config specifies additional metrics but we don't have the data, show helpful message
        if (config.subtitle && config.subtitle.includes('vs')) {
          console.log('ConnectedScatterChart: Config indicates two metrics should be available but data only has:', metrics);
        }
        
        console.log('ConnectedScatterChart: Not enough metrics', metrics.length);
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
        xMetric: '',
        yMetric: '',
        xUnit: '',
        yUnit: '',
        xLabel: '',
        yLabel: '',
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

    // Filter to highlighted athlete or show up to 3 athletes
    const athletesToShow = highlightAthlete ?
      [allAthleteTrends[highlightAthlete]].filter(Boolean) :
      Object.values(allAthleteTrends).slice(0, 3);

    console.log('ConnectedScatterChart: Athletes to show:', athletesToShow.length);
    console.log('ConnectedScatterChart: Athletes data:', athletesToShow.map((a: any) => ({
      id: a?.athleteId,
      name: a?.athleteName,
      metrics: Object.keys(a?.metrics || {})
    })));

    // Ensure we have athletes with both metrics and valid data
    const validAthletes = athletesToShow.filter((athlete: any) => {
      if (!athlete) return false;

      // Only require the specific two metrics being used for X and Y axes
      const hasXMetric = athlete.metrics[xMetric]?.length > 0;
      const hasYMetric = athlete.metrics[yMetric]?.length > 0;

      console.log(`ConnectedScatterChart: Athlete ${athlete.athleteName} has ${xMetric}:`, hasXMetric, athlete.metrics[xMetric]?.length);
      console.log(`ConnectedScatterChart: Athlete ${athlete.athleteName} has ${yMetric}:`, hasYMetric, athlete.metrics[yMetric]?.length);

      return hasXMetric && hasYMetric;
    });

    console.log('ConnectedScatterChart: Valid athletes:', validAthletes.length);

    if (validAthletes.length === 0) {
      console.log('ConnectedScatterChart: No valid athletes found');
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

      // Create connected points by matching dates
      const connectedPoints = xData
        .map((xPoint: any) => {
          const yPoint = yData.find((y: any) => {
            try {
              const yDate = y.date instanceof Date ? y.date : new Date(y.date);
              const xDate = xPoint.date instanceof Date ? xPoint.date : new Date(xPoint.date);
              return yDate.toISOString().split('T')[0] === xDate.toISOString().split('T')[0];
            } catch (error) {
              console.warn('Date parsing error:', error, 'x:', xPoint.date, 'y:', y.date);
              return false;
            }
          });
          
          return yPoint ? {
            // Convert values to numbers to handle string values
            x: typeof xPoint.value === 'string' ? parseFloat(xPoint.value) : xPoint.value,
            y: typeof yPoint.value === 'string' ? parseFloat(yPoint.value) : yPoint.value,
            date: xPoint.date instanceof Date ? xPoint.date : new Date(xPoint.date),
            isPersonalBest: xPoint.isPersonalBest || yPoint.isPersonalBest
          } : null;
        })
        .filter(Boolean)
        .sort((a: any, b: any) => {
          const dateA = a.date instanceof Date ? a.date : new Date(a.date);
          const dateB = b.date instanceof Date ? b.date : new Date(b.date);
          return dateA.getTime() - dateB.getTime();
        });

      const color = colors[index % colors.length] || 'rgba(75, 85, 99, 1)';
      const isHighlighted = athlete.athleteId === highlightAthlete;

      return {
        label: athlete.athleteName,
        data: connectedPoints,
        backgroundColor: color.replace('1)', '0.6)'),
        borderColor: color,
        borderWidth: isHighlighted ? 3 : 2,
        pointRadius: isHighlighted ? 6 : 4,
        pointHoverRadius: isHighlighted ? 10 : 8,
        pointBackgroundColor: (context: any) => {
          const point = context.raw;
          if (point?.isPersonalBest) return 'rgba(255, 215, 0, 1)';

          // Time-based color coding - newer points are more saturated
          if (point?.date && connectedPoints.length > 1) {
            const pointDate = new Date(point.date).getTime();
            const oldestDate = Math.min(...connectedPoints.map((p: any) => new Date(p.date).getTime()));
            const newestDate = Math.max(...connectedPoints.map((p: any) => new Date(p.date).getTime()));
            const dateRange = newestDate - oldestDate;

            if (dateRange > 0) {
              const recency = (pointDate - oldestDate) / dateRange;
              const opacity = 0.4 + (recency * 0.6); // Range from 0.4 to 1.0
              return color.replace('1)', `${opacity})`);
            }
          }

          return color;
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

    // Calculate analytics for the first athlete (individual view)
    const analytics = validAthletes.length > 0 ? (() => {
      const athlete = validAthletes[0];
      const xData = athlete.metrics[xMetric] || [];
      const yData = athlete.metrics[yMetric] || [];

      // Match points by date for correlation calculation
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
        xMean: xValues.length > 0 ? xValues.reduce((a: number, b: number) => a + b, 0) / xValues.length : 0,
        yMean: yValues.length > 0 ? yValues.reduce((a: number, b: number) => a + b, 0) / yValues.length : 0,
        dataPoints: matchedPoints.length
      };
    })() : null;

    // Add group averages if statistics available
    if (statistics && statistics[xMetric]?.mean && statistics[yMetric]?.mean) {
      datasets.push({
        label: 'Group Average',
        data: [{
          x: statistics[xMetric].mean,
          y: statistics[yMetric].mean
        }],
        backgroundColor: 'rgba(156, 163, 175, 1)',
        borderColor: 'rgba(156, 163, 175, 1)',
        borderWidth: 3,
        pointRadius: 8,
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
  }, [data, statistics, highlightAthlete]);


  // Chart options (always define this hook to maintain consistent hook order)
  const options: ChartOptions<'scatter'> = useMemo(() => ({
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
          title: (context) => {
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
          label: (context) => {
            const point = context.raw as any;
            return [
              `${scatterData?.xLabel || 'X'}: ${point.x?.toFixed(2)}${scatterData?.xUnit || ''}`,
              `${scatterData?.yLabel || 'Y'}: ${point.y?.toFixed(2)}${scatterData?.yUnit || ''}`
            ];
          },
          afterLabel: (context) => {
            const point = context.raw as any;
            const labels = [];
            
            if (point.isPersonalBest) {
              labels.push('🏆 Personal Best!');
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
      annotation: scatterData?.analytics ? {
        annotations: (() => {
          const xMean = scatterData.analytics.xMean;
          const yMean = scatterData.analytics.yMean;

          // Get dynamic quadrant labels based on metric types
          const labels = getPerformanceQuadrantLabels(scatterData.xMetric, scatterData.yMetric);

          // Calculate chart bounds for full background coverage
          const datasets = scatterData.chartData.datasets;
          if (!datasets || datasets.length === 0) return {};

          const allPoints = datasets.flatMap(dataset => dataset.data || []);
          if (allPoints.length === 0) return {};

          const xValues = allPoints.map((p: any) => p.x).filter(x => typeof x === 'number' && !isNaN(x));
          const yValues = allPoints.map((p: any) => p.y).filter(y => typeof y === 'number' && !isNaN(y));

          if (xValues.length === 0 || yValues.length === 0) return {};

          const xMin = Math.min(...xValues) - (Math.max(...xValues) - Math.min(...xValues)) * 0.1;
          const xMax = Math.max(...xValues) + (Math.max(...xValues) - Math.min(...xValues)) * 0.1;
          const yMin = Math.min(...yValues) - (Math.max(...yValues) - Math.min(...yValues)) * 0.1;
          const yMax = Math.max(...yValues) + (Math.max(...yValues) - Math.min(...yValues)) * 0.1;

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
          text: `${scatterData?.xLabel || 'X Axis'} (${scatterData?.xUnit || ''})`
        },
        grid: {
          display: true,
          color: 'rgba(0, 0, 0, 0.1)'
        },
        // Set explicit bounds to prevent infinite scaling
        ...(scatterData?.chartData?.datasets && scatterData.chartData.datasets.length > 0 ? (() => {
          const allPoints = scatterData.chartData.datasets.flatMap(dataset => dataset.data || []);
          const xValues = allPoints.map((p: any) => p.x).filter(x => typeof x === 'number' && !isNaN(x));
          if (xValues.length > 0) {
            const xMin = Math.min(...xValues);
            const xMax = Math.max(...xValues);
            const xRange = xMax - xMin;
            const padding = Math.max(xRange * 0.1, 0.1); // At least 0.1 padding
            return {
              min: xMin - padding,
              max: xMax + padding
            };
          }
          return {};
        })() : {})
      },
      y: {
        type: 'linear',
        title: {
          display: true,
          text: `${scatterData?.yLabel || 'Y Axis'} (${scatterData?.yUnit || ''})`
        },
        grid: {
          display: true,
          color: (context: any) => {
            // Highlight mean line
            const yMean = scatterData?.analytics?.yMean || (scatterData?.yMetric && statistics?.[scatterData.yMetric]?.mean) || 0;
            return Math.abs(context.tick.value - yMean) < 0.01 ? 'rgba(75, 85, 99, 0.8)' : 'rgba(0, 0, 0, 0.1)';
          },
          lineWidth: (context: any) => {
            const yMean = scatterData?.analytics?.yMean || (scatterData?.yMetric && statistics?.[scatterData.yMetric]?.mean) || 0;
            return Math.abs(context.tick.value - yMean) < 0.01 ? 2 : 1;
          }
        },
        // Set explicit bounds to prevent infinite scaling
        ...(scatterData?.chartData?.datasets && scatterData.chartData.datasets.length > 0 ? (() => {
          const allPoints = scatterData.chartData.datasets.flatMap(dataset => dataset.data || []);
          const yValues = allPoints.map((p: any) => p.y).filter(y => typeof y === 'number' && !isNaN(y));
          if (yValues.length > 0) {
            const yMin = Math.min(...yValues);
            const yMax = Math.max(...yValues);
            const yRange = yMax - yMin;
            const padding = Math.max(yRange * 0.1, 0.1); // At least 0.1 padding
            return {
              min: yMin - padding,
              max: yMax + padding
            };
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
  }), [scatterData, config, statistics]);

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
      <Scatter data={scatterData.chartData} options={options} />
      
      {/* Progress indicators */}
      {highlightAthlete && (
        <div className="mt-4 text-sm">
          <div className="text-center text-muted-foreground mb-2">
            Connected points show performance progression over time
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
              <div className="font-medium text-xs">X-Axis Trend</div>
              <div className="text-lg font-bold text-blue-600">
                {scatterData.analytics ?
                  `${scatterData.analytics.xImprovement > 0 ? '+' : ''}${scatterData.analytics.xImprovement.toFixed(3)}/day` : 'N/A'}
              </div>
              <div className="text-xs text-muted-foreground">
                {scatterData.xMetric && METRIC_CONFIG[scatterData.xMetric as keyof typeof METRIC_CONFIG]?.lowerIsBetter ?
                  (scatterData.analytics && scatterData.analytics.xImprovement < 0 ? '📈 Improving' : '📉 Declining') :
                  (scatterData.analytics && scatterData.analytics.xImprovement > 0 ? '📈 Improving' : '📉 Declining')}
              </div>
            </div>

            <div>
              <div className="font-medium text-xs">Y-Axis Trend</div>
              <div className="text-lg font-bold text-green-600">
                {scatterData.analytics ?
                  `${scatterData.analytics.yImprovement > 0 ? '+' : ''}${scatterData.analytics.yImprovement.toFixed(3)}/day` : 'N/A'}
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