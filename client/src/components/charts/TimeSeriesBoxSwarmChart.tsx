import React, { useMemo, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  ScatterController,
  PointElement,
  LineElement
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
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
  Title,
  Tooltip,
  Legend,
  ScatterController,
  PointElement,
  LineElement
);

interface TimeSeriesBoxSwarmProps {
  data: TrendData[];
  config: ChartConfiguration;
  selectedDates: string[];
  metric: string;
  statistics?: Record<string, StatisticalSummary>;
}

// Color palette for athletes
const ATHLETE_COLORS = [
  'rgba(59, 130, 246, 0.8)',    // Blue
  'rgba(16, 185, 129, 0.8)',    // Green
  'rgba(239, 68, 68, 0.8)',     // Red
  'rgba(245, 158, 11, 0.8)',    // Amber
  'rgba(139, 92, 246, 0.8)',    // Purple
  'rgba(236, 72, 153, 0.8)',    // Pink
  'rgba(20, 184, 166, 0.8)',    // Teal
  'rgba(251, 146, 60, 0.8)',    // Orange
  'rgba(124, 58, 237, 0.8)',    // Violet
  'rgba(34, 197, 94, 0.8)'      // Emerald
];

export function TimeSeriesBoxSwarmChart({
  data,
  config,
  selectedDates,
  metric,
  statistics
}: TimeSeriesBoxSwarmProps) {
  const chartRef = useRef<any>(null);

  // Process data for time-series box+swarm visualization
  const chartData = useMemo(() => {
    if (!data || data.length === 0 || selectedDates.length === 0) {
      return {
        labels: [],
        datasets: []
      };
    }

    const metricConfig = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
    const unit = metricConfig?.unit || '';

    // Sort selected dates chronologically
    const sortedDates = [...selectedDates].sort();

    // Group data by date
    const dateDataMap = new Map<string, { athleteId: string; athleteName: string; value: number; isPersonalBest?: boolean }[]>();

    data.forEach(trend => {
      trend.data.forEach(point => {
        const date = point.date instanceof Date ? point.date : new Date(point.date);
        const dateStr = date.toISOString().split('T')[0];

        if (selectedDates.includes(dateStr)) {
          if (!dateDataMap.has(dateStr)) {
            dateDataMap.set(dateStr, []);
          }
          dateDataMap.get(dateStr)!.push({
            athleteId: trend.athleteId,
            athleteName: trend.athleteName,
            value: point.value,
            isPersonalBest: point.isPersonalBest
          });
        }
      });
    });

    // Create athlete color mapping
    const uniqueAthletes = [...new Set(data.map(trend => trend.athleteId))];
    const athleteColorMap = new Map<string, string>();
    uniqueAthletes.forEach((athleteId, index) => {
      athleteColorMap.set(athleteId, ATHLETE_COLORS[index % ATHLETE_COLORS.length]);
    });

    const datasets: any[] = [];
    const dateLabels = sortedDates.map(dateStr => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    // Create box plot and swarm plot datasets for each date
    sortedDates.forEach((dateStr, dateIndex) => {
      const dateData = dateDataMap.get(dateStr) || [];
      if (dateData.length === 0) return;

      const values = dateData.map(d => d.value);
      values.sort((a, b) => a - b);
      const dateLabel = dateLabels[dateIndex];

      if (values.length > 0) {
        // Calculate box plot statistics
        const q1Index = Math.floor(values.length * 0.25);
        const medianIndex = Math.floor(values.length * 0.5);
        const q3Index = Math.floor(values.length * 0.75);

        const min = values[0];
        const max = values[values.length - 1];
        const q1 = values[q1Index];
        const median = values[medianIndex];
        const q3 = values[q3Index];
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;

        // Box plot components as separate line datasets

        // 1. Box rectangle (Q1 to Q3)
        datasets.push({
          label: `Box-${dateIndex}`,
          data: [
            { x: dateLabel, y: q1 },
            { x: dateLabel, y: q3 },
            { x: dateLabel, y: q3 },
            { x: dateLabel, y: q1 },
            { x: dateLabel, y: q1 }
          ],
          type: 'line',
          borderColor: 'rgba(75, 85, 99, 0.8)',
          backgroundColor: 'rgba(75, 85, 99, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          showLine: true,
          fill: true,
          order: 2,
          tension: 0
        });

        // 2. Median line
        datasets.push({
          label: `Median-${dateIndex}`,
          data: [
            { x: dateLabel, y: median },
            { x: dateLabel, y: median }
          ],
          type: 'line',
          borderColor: 'rgba(75, 85, 99, 1)',
          backgroundColor: 'transparent',
          borderWidth: 3,
          pointRadius: 0,
          showLine: true,
          order: 1
        });

        // 3. Mean line
        datasets.push({
          label: `Mean-${dateIndex}`,
          data: [
            { x: dateLabel, y: mean },
            { x: dateLabel, y: mean }
          ],
          type: 'line',
          borderColor: 'rgba(239, 68, 68, 1)',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          showLine: true,
          order: 1
        });

        // 4. Whiskers (min to Q1, Q3 to max)
        datasets.push({
          label: `Whiskers-${dateIndex}`,
          data: [
            { x: dateLabel, y: min },
            { x: dateLabel, y: q1 },
            { x: dateLabel, y: q3 },
            { x: dateLabel, y: max }
          ],
          type: 'line',
          borderColor: 'rgba(75, 85, 99, 0.6)',
          backgroundColor: 'transparent',
          borderWidth: 1,
          pointRadius: 0,
          showLine: false,
          order: 2
        });

        // 5. Whisker caps
        const capWidth = 0.1;
        datasets.push({
          label: `WhiskerCaps-${dateIndex}`,
          data: [
            { x: dateLabel, y: min },
            { x: dateLabel, y: max }
          ],
          type: 'scatter',
          borderColor: 'rgba(75, 85, 99, 0.8)',
          backgroundColor: 'rgba(75, 85, 99, 0.8)',
          pointStyle: 'line',
          pointRadius: 8,
          pointBorderWidth: 2,
          order: 2
        });

        // 6. Swarm plot - individual athlete points
        dateData.forEach((athleteData) => {
          const jitter = (Math.random() - 0.5) * 0.3; // Small horizontal jitter for visibility
          const color = athleteColorMap.get(athleteData.athleteId) || 'rgba(75, 85, 99, 0.8)';

          datasets.push({
            label: athleteData.athleteName,
            data: [{ x: dateLabel, y: athleteData.value }],
            type: 'scatter',
            backgroundColor: color,
            borderColor: athleteData.isPersonalBest ? 'gold' : color,
            borderWidth: athleteData.isPersonalBest ? 3 : 1,
            pointRadius: 6,
            order: 0
          });
        });
      }
    });

    return {
      labels: dateLabels,
      datasets
    };
  }, [data, selectedDates, metric]);

  const chartOptions = useMemo(() => {
    const metricConfig = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
    const unit = metricConfig?.unit || '';
    const metricLabel = metricConfig?.label || metric;

    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: !!config.title,
          text: config.title
        },
        legend: {
          display: false // Too many athletes for useful legend
        },
        tooltip: {
          filter: (tooltipItem: any) => {
            // Only show tooltips for athlete points, not box plot components
            return tooltipItem.dataset.type === 'scatter' &&
                   !tooltipItem.dataset.label.includes('-') &&
                   !tooltipItem.dataset.label.includes('Box') &&
                   !tooltipItem.dataset.label.includes('Median') &&
                   !tooltipItem.dataset.label.includes('Mean') &&
                   !tooltipItem.dataset.label.includes('Whiskers');
          },
          callbacks: {
            label: (context: any) => {
              const datasetLabel = context.dataset.label;
              const value = context.parsed.y;
              return `${datasetLabel}: ${value}${unit}`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'category' as const,
          title: {
            display: true,
            text: 'Measurement Date'
          },
          grid: {
            display: false
          },
          ticks: {
            maxRotation: 45,
            minRotation: 0
          },
          // Add padding to prevent edge rendering
          offset: true
        },
        y: {
          type: 'linear' as const,
          title: {
            display: true,
            text: `${metricLabel} (${unit})`
          },
          grid: {
            color: 'rgba(75, 85, 99, 0.1)'
          },
          // Add padding to y-axis to prevent edge rendering
          grace: '5%'
        }
      },
      interaction: {
        mode: 'nearest' as const,
        intersect: false
      },
      animation: {
        duration: 750
      },
      // Add layout padding to prevent edge rendering
      layout: {
        padding: {
          left: 10,
          right: 10,
          top: 10,
          bottom: 10
        }
      }
    };
  }, [config, metric]);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="text-center">
          <p className="text-lg font-medium">No Data Available</p>
          <p className="text-sm">Select measurement dates to view the time-series box+swarm chart.</p>
        </div>
      </div>
    );
  }

  if (selectedDates.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="text-center">
          <p className="text-lg font-medium">No Dates Selected</p>
          <p className="text-sm">Please select measurement dates to view the chart.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <Chart
        ref={chartRef}
        type="line"
        data={chartData}
        options={chartOptions}
      />

      {/* Legend for understanding the visualization */}
      <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-600">
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span>Athlete Performance</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full border-2 border-yellow-500 bg-blue-500"></div>
            <span>Personal Best</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-3 border border-gray-600 bg-gray-100"></div>
            <span>Box Plot (Q1-Q3)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-gray-800"></div>
            <span>Median</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-red-500" style={{ borderTop: '1px dashed' }}></div>
            <span>Mean</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-gray-500"></div>
            <span>Whiskers (Min/Max)</span>
          </div>
        </div>
      </div>
    </div>
  );
}