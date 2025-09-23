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
import { Scatter } from 'react-chartjs-2';
import type { 
  TrendData, 
  ChartConfiguration, 
  StatisticalSummary 
} from '@shared/analytics-types';
import { METRIC_CONFIG } from '@shared/analytics-types';

// Register Chart.js components
ChartJS.register(
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
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

    if (!data || data.length === 0) {
      console.log('ConnectedScatterChart: No data provided');
      return null;
    }

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
    const metrics = Array.from(new Set(data.map(trend => trend.metric)));
    console.log('ConnectedScatterChart: Available metrics:', metrics);

    // For connected scatter plot, we need exactly 2 metrics
    // If we have less than 2, check if we can use the config to determine the metrics we should be looking for
    if (metrics.length < 2) {
      console.log('ConnectedScatterChart: Not enough metrics in data, checking config');
      
      // If config specifies additional metrics but we don't have the data, show helpful message
      if (config.subtitle && config.subtitle.includes('vs')) {
        console.log('ConnectedScatterChart: Config indicates two metrics should be available but data only has:', metrics);
        return null;
      }
      
      console.log('ConnectedScatterChart: Not enough metrics', metrics.length);
      return null;
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
        xMean: xValues.length > 0 ? xValues.reduce((a, b) => a + b, 0) / xValues.length : 0,
        yMean: yValues.length > 0 ? yValues.reduce((a, b) => a + b, 0) / yValues.length : 0,
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
      datasets,
      xMetric,
      yMetric,
      xUnit,
      yUnit,
      xLabel,
      yLabel,
      athleteTrends,
      analytics
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
              `${scatterData?.xLabel}: ${point.x?.toFixed(2)}${scatterData?.xUnit}`,
              `${scatterData?.yLabel}: ${point.y?.toFixed(2)}${scatterData?.yUnit}`
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
      }
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
          display: true,
          color: (context: any) => {
            // Highlight mean line
            const xMean = scatterData?.analytics?.xMean || (statistics?.[scatterData?.xMetric]?.mean) || 0;
            return Math.abs(context.tick.value - xMean) < 0.01 ? 'rgba(75, 85, 99, 0.8)' : 'rgba(0, 0, 0, 0.1)';
          },
          lineWidth: (context: any) => {
            const xMean = scatterData?.analytics?.xMean || (statistics?.[scatterData?.xMetric]?.mean) || 0;
            return Math.abs(context.tick.value - xMean) < 0.01 ? 2 : 1;
          }
        }
      },
      y: {
        type: 'linear',
        title: {
          display: true,
          text: `${scatterData?.yLabel} (${scatterData?.yUnit})`
        },
        grid: {
          display: true,
          color: (context: any) => {
            // Highlight mean line
            const yMean = scatterData?.analytics?.yMean || (statistics?.[scatterData?.yMetric]?.mean) || 0;
            return Math.abs(context.tick.value - yMean) < 0.01 ? 'rgba(75, 85, 99, 0.8)' : 'rgba(0, 0, 0, 0.1)';
          },
          lineWidth: (context: any) => {
            const yMean = scatterData?.analytics?.yMean || (statistics?.[scatterData?.yMetric]?.mean) || 0;
            return Math.abs(context.tick.value - yMean) < 0.01 ? 2 : 1;
          }
        }
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
  }), [scatterData]);

  if (!scatterData) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center">
          <div className="text-lg font-medium mb-2">Connected Scatter Plot Unavailable</div>
          <div className="text-sm">
            This chart requires exactly 2 metrics with time series data.
          </div>
          <div className="text-sm mt-1">
            Please ensure both primary and additional metrics have measurement data for the selected time period.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <Scatter data={scatterData} options={options} />
      
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
                <div className="bg-green-100 text-green-800 p-2 rounded">
                  <div className="font-medium">High-High</div>
                  <div>Elite Performance</div>
                </div>
                <div className="bg-yellow-100 text-yellow-800 p-2 rounded">
                  <div className="font-medium">Low-High</div>
                  <div>Focus {scatterData.xLabel}</div>
                </div>
                <div className="bg-orange-100 text-orange-800 p-2 rounded">
                  <div className="font-medium">High-Low</div>
                  <div>Focus {scatterData.yLabel}</div>
                </div>
                <div className="bg-red-100 text-red-800 p-2 rounded">
                  <div className="font-medium">Low-Low</div>
                  <div>Development Needed</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default ConnectedScatterChart;