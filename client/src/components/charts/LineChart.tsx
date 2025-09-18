import React, { useMemo, useState } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';

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
  // State for athlete visibility toggles
  const [athleteToggles, setAthleteToggles] = useState<Record<string, boolean>>({});
  const [showGroupAverage, setShowGroupAverage] = useState(true);

  // Initialize athlete toggles when data changes
  const allAthletes = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.slice(0, 9).map((trend, index) => ({
      id: trend.athleteId,
      name: trend.athleteName,
      color: index
    }));
  }, [data]);

  // Initialize toggles with all athletes enabled by default
  React.useEffect(() => {
    const initialToggles: Record<string, boolean> = {};
    allAthletes.forEach(athlete => {
      initialToggles[athlete.id] = true;
    });
    setAthleteToggles(initialToggles);
  }, [allAthletes]);

  // Transform trend data for line chart
  const lineData = useMemo(() => {
    if (!data || data.length === 0) return null;

    // Filter based on highlighted athlete or toggle states
    const trendsToShow = highlightAthlete
      ? data.filter(trend => trend.athleteId === highlightAthlete)
      : data.slice(0, 9).filter(trend => athleteToggles[trend.athleteId]);

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
      'rgba(59, 130, 246, 1)',    // Blue
      'rgba(16, 185, 129, 1)',    // Green
      'rgba(239, 68, 68, 1)',     // Red
      'rgba(245, 158, 11, 1)',    // Amber
      'rgba(139, 92, 246, 1)',    // Purple
      'rgba(236, 72, 153, 1)',    // Pink
      'rgba(20, 184, 166, 1)',    // Teal
      'rgba(251, 146, 60, 1)',    // Orange
      'rgba(124, 58, 237, 1)'     // Violet
    ];

    const datasets = trendsToShow.map((trend) => {
      // Create data points for each date
      const trendData = sortedDates.map(dateStr => {
        const point = trend.data.find(p => {
          const pointDate = p.date instanceof Date ? p.date : new Date(p.date);
          return pointDate.toISOString().split('T')[0] === dateStr;
        });
        return point ? point.value : null;
      });

      // Find original athlete index for consistent color mapping
      const originalIndex = data?.slice(0, 9).findIndex(d => d.athleteId === trend.athleteId) ?? 0;
      const color = colors[originalIndex % colors.length];
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

    // Add group average line if available and enabled
    if (showGroupAverage && trendsToShow.length > 0 && trendsToShow[0].data[0]?.groupAverage !== undefined) {
      const groupAverageData = sortedDates.map(dateStr => {
        // Find the group average for this specific date from any athlete's data
        // Since group average is per-date, we can use any athlete that has data for this date
        for (const trend of trendsToShow) {
          const point = trend.data.find(p => {
            const pointDate = p.date instanceof Date ? p.date : new Date(p.date);
            return pointDate.toISOString().split('T')[0] === dateStr;
          });
          if (point && point.groupAverage !== undefined) {
            return point.groupAverage;
          }
        }
        return null;
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
  }, [data, highlightAthlete, athleteToggles, showGroupAverage]);

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

  if (!lineData) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No trend data available for line chart
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mb-3">
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
                'rgba(124, 58, 237, 1)'     // Violet
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