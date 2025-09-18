import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { 
  TrendData, 
  ChartConfiguration, 
  StatisticalSummary 
} from '@shared/analytics-types';
import { METRIC_CONFIG } from '@shared/analytics-types';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface LineChartProps {
  data: TrendData[];
  config: ChartConfiguration;
  statistics?: Record<string, StatisticalSummary>;
  highlightAthlete?: string;
}

export function LineChart({ 
  data, 
  config, 
  statistics, 
  highlightAthlete 
}: LineChartProps) {
  // Transform trend data for line chart
  const lineData = useMemo(() => {
    if (!data || data.length === 0) return null;

    // Filter to highlighted athlete or show up to 5 athletes
    const trendsToShow = highlightAthlete ? 
      data.filter(trend => trend.athleteId === highlightAthlete) :
      data.slice(0, 5);

    if (trendsToShow.length === 0) return null;

    // Get all unique dates for consistent x-axis
    const allDates = new Set<string>();
    trendsToShow.forEach(trend => {
      trend.data.forEach(point => {
        const date = point.date instanceof Date ? point.date : new Date(point.date);
        allDates.add(date.toISOString().split('T')[0]);
      });
    });

    const sortedDates = Array.from(allDates).sort();
    const labels = sortedDates.map(dateStr => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    });

    const colors = [
      'rgba(59, 130, 246, 1)',
      'rgba(16, 185, 129, 1)',
      'rgba(239, 68, 68, 1)',
      'rgba(245, 158, 11, 1)',
      'rgba(139, 92, 246, 1)'
    ];

    const datasets = trendsToShow.map((trend, index) => {
      // Create data points for each date
      const trendData = sortedDates.map(dateStr => {
        const point = trend.data.find(p => {
          const pointDate = p.date instanceof Date ? p.date : new Date(p.date);
          return pointDate.toISOString().split('T')[0] === dateStr;
        });
        return point ? point.value : null;
      });

      const color = colors[index % colors.length];
      const isHighlighted = trend.athleteId === highlightAthlete;

      return {
        label: trend.athleteName,
        data: trendData,
        borderColor: color,
        backgroundColor: color.replace('1)', '0.1)'),
        borderWidth: isHighlighted ? 3 : 2,
        pointRadius: isHighlighted ? 5 : 3,
        pointHoverRadius: isHighlighted ? 7 : 5,
        pointBackgroundColor: color,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        fill: false,
        tension: 0.1,
        spanGaps: true // Connect line across null values
      };
    });

    // Add group average line if available
    if (trendsToShow.length > 0 && trendsToShow[0].data[0]?.groupAverage !== undefined) {
      const groupAverageData = sortedDates.map(() => {
        // Use first trend's group average (should be same for all)
        return trendsToShow[0].data[0]?.groupAverage || null;
      });

      datasets.push({
        label: 'Group Average',
        data: groupAverageData,
        borderColor: 'rgba(156, 163, 175, 1)',
        backgroundColor: 'rgba(156, 163, 175, 0.1)',
        borderWidth: 2,
        // borderDash: [5, 5], // Comment out for now due to type issues
        pointRadius: 0,
        pointHoverRadius: 4,
        pointBackgroundColor: 'rgba(156, 163, 175, 1)',
        pointBorderColor: '#fff',
        pointBorderWidth: 1,
        fill: false,
        tension: 0.1,
        spanGaps: true
      });
    }

    const metric = trendsToShow[0].metric;
    const unit = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.unit || '';
    const metricLabel = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG]?.label || metric;

    return {
      labels,
      datasets,
      metric,
      unit,
      metricLabel,
      sortedDates
    };
  }, [data, highlightAthlete]);

  // Find personal bests
  const personalBests = useMemo(() => {
    if (!lineData || !data) return [];

    const bests: Array<{
      athleteId: string;
      athleteName: string;
      value: number;
      date: Date;
      datasetIndex: number;
      pointIndex: number;
    }> = [];

    data.forEach((trend, datasetIndex) => {
      if (highlightAthlete && trend.athleteId !== highlightAthlete) return;
      
      const bestPoint = trend.data.find(point => point.isPersonalBest);
      if (bestPoint) {
        const pointIndex = lineData.sortedDates.findIndex(dateStr => {
          const bestPointDate = bestPoint.date instanceof Date ? bestPoint.date : new Date(bestPoint.date);
          return bestPointDate.toISOString().split('T')[0] === dateStr;
        });
        
        if (pointIndex >= 0) {
          bests.push({
            athleteId: trend.athleteId,
            athleteName: trend.athleteName,
            value: bestPoint.value,
            date: bestPoint.date,
            datasetIndex,
            pointIndex
          });
        }
      }
    });

    return bests;
  }, [lineData, data, highlightAthlete]);

  // Chart options
  const options: ChartOptions<'line'> = {
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
            const dateIndex = context[0].dataIndex;
            const dateStr = lineData?.sortedDates[dateIndex];
            return dateStr ? new Date(dateStr).toLocaleDateString() : '';
          },
          label: (context) => {
            const value = context.parsed.y;
            if (value === null) return '';
            
            return `${context.dataset.label}: ${value.toFixed(2)}${lineData?.unit}`;
          },
          afterLabel: (context) => {
            const datasetIndex = context.datasetIndex;
            const pointIndex = context.dataIndex;
            
            // Check if this is a personal best
            const pb = personalBests.find(best => 
              best.datasetIndex === datasetIndex && best.pointIndex === pointIndex
            );
            
            return pb ? ['🏆 Personal Best!'] : [];
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
        title: {
          display: true,
          text: 'Date'
        },
        grid: {
          display: true
        }
      },
      y: {
        title: {
          display: true,
          text: `${lineData?.metricLabel} (${lineData?.unit})`
        },
        grid: {
          display: true
        }
      }
    },
    elements: {
      point: {
        hoverRadius: 8
      },
      line: {
        tension: 0.1
      }
    },
    interaction: {
      intersect: false,
      mode: 'index'
    }
  };

  if (!lineData) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No trend data available for line chart
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <Line data={lineData} options={options} />
      
      {/* Progress indicators */}
      {highlightAthlete && personalBests.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div className="text-center">
            <div className="font-medium">Personal Best</div>
            <div className="text-lg font-bold text-green-600">
              {personalBests[0].value.toFixed(2)}{lineData.unit}
            </div>
            <div className="text-xs text-muted-foreground">
              {(() => {
                const date = personalBests[0].date instanceof Date ? personalBests[0].date : new Date(personalBests[0].date);
                return date.toLocaleDateString();
              })()}
            </div>
          </div>
          
          <div className="text-center">
            <div className="font-medium">Progress Trend</div>
            <div className="text-lg font-bold text-blue-600">
              {/* Calculate simple trend - positive or negative */}
              {(() => {
                const athleteTrend = data.find(t => t.athleteId === highlightAthlete);
                if (!athleteTrend || athleteTrend.data.length < 2) return 'N/A';
                
                const first = athleteTrend.data[0].value;
                const last = athleteTrend.data[athleteTrend.data.length - 1].value;
                const isLowerBetter = METRIC_CONFIG[athleteTrend.metric as keyof typeof METRIC_CONFIG]?.lowerIsBetter;
                
                const improvement = isLowerBetter ? first - last : last - first;
                const trend = improvement > 0 ? '↗️ Improving' : improvement < 0 ? '↘️ Declining' : '→ Stable';
                
                return trend;
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LineChart;