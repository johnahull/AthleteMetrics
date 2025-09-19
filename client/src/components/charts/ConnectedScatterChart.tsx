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

export function ConnectedScatterChart({ 
  data, 
  config, 
  statistics, 
  highlightAthlete 
}: ConnectedScatterChartProps) {
  // Transform trend data for connected scatter plot
  const scatterData = useMemo(() => {
    if (!data || data.length === 0) return null;

    // Get unique metrics
    const metrics = Array.from(new Set(data.map(trend => trend.metric)));
    if (metrics.length < 2) return null;

    const [xMetric, yMetric] = metrics;

    // Filter to highlighted athlete or show up to 3 athletes
    const trendsToShow = highlightAthlete ? 
      data.filter(trend => trend.athleteId === highlightAthlete) :
      data.slice(0, 3);

    if (trendsToShow.length === 0) return null;

    // Group trends by athlete
    const athleteTrends = trendsToShow.reduce((acc, trend) => {
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
            const yDate = y.date instanceof Date ? y.date : new Date(y.date);
            const xDate = xPoint.date instanceof Date ? xPoint.date : new Date(xPoint.date);
            return yDate.toISOString().split('T')[0] === xDate.toISOString().split('T')[0];
          });
          
          return yPoint ? {
            x: xPoint.value,
            y: yPoint.value,
            date: xPoint.date,
            isPersonalBest: xPoint.isPersonalBest || yPoint.isPersonalBest
          } : null;
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.date.getTime() - b.date.getTime());

      const color = colors[index % colors.length];
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
          return point?.isPersonalBest ? 'rgba(255, 215, 0, 1)' : color;
        },
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        showLine: true,
        fill: false,
        tension: 0.1
      };
    });

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
      athleteTrends
    };
  }, [data, statistics, highlightAthlete]);

  // Chart options
  const options: ChartOptions<'scatter'> = {
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
            
            return point.date ? 
              `${datasetLabel} - ${new Date(point.date).toLocaleDateString()}` :
              datasetLabel;
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
            
            if (point.date) {
              labels.push(`Date: ${new Date(point.date).toLocaleDateString()}`);
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
  };

  if (!scatterData) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No trend data available for connected scatter plot (requires 2+ metrics with time series data)
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
          
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="font-medium">Trajectory</div>
              <div className="text-lg font-bold text-blue-600">
                {/* Calculate overall improvement direction */}
                {(() => {
                  const athleteData = Object.values(scatterData.athleteTrends)[0] as any;
                  if (!athleteData) return 'N/A';
                  
                  const xData = athleteData.metrics[scatterData.xMetric] || [];
                  const yData = athleteData.metrics[scatterData.yMetric] || [];
                  
                  if (xData.length < 2 || yData.length < 2) return 'N/A';
                  
                  const xImprovement = xData[xData.length - 1].value - xData[0].value;
                  const yImprovement = yData[yData.length - 1].value - yData[0].value;
                  
                  const xBetter = METRIC_CONFIG[scatterData.xMetric as keyof typeof METRIC_CONFIG]?.lowerIsBetter ? 
                    xImprovement < 0 : xImprovement > 0;
                  const yBetter = METRIC_CONFIG[scatterData.yMetric as keyof typeof METRIC_CONFIG]?.lowerIsBetter ? 
                    yImprovement < 0 : yImprovement > 0;
                  
                  if (xBetter && yBetter) return '↗️ Improving Both';
                  if (xBetter || yBetter) return '↕️ Mixed Progress';
                  return '↘️ Needs Focus';
                })()}
              </div>
            </div>
            
            <div>
              <div className="font-medium">Personal Bests</div>
              <div className="text-lg font-bold text-yellow-600">
                {/* Count personal bests in the data */}
                {(() => {
                  const pbCount = scatterData.datasets[0]?.data?.filter((point: any) => 
                    point.isPersonalBest
                  ).length || 0;
                  
                  return `${pbCount} 🏆`;
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConnectedScatterChart;