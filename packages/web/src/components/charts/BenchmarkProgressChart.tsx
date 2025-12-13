import React, { useMemo } from 'react';
import type { ChartOptions } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { ChartErrorBoundary } from './ChartErrorBoundary';
import { ResponsiveChartWrapper } from './responsive-chart-wrapper';
import { CHART_CONFIG } from '@/constants/chart-config';

// Chart.js components are registered globally in lib/chart-setup.ts

interface BenchmarkProgressChartProps {
  data: {
    benchmarkName: string;
    snapshots: Array<{
      date: string;
      achievementRate: number;
      athletesMet: number;
      applicableAthletes: number;
    }>;
  };
  targetRate?: number; // Optional target line (e.g., 80 for 80% goal)
  height?: number;
}

export function BenchmarkProgressChart({
  data,
  targetRate,
  height = 300,
}: BenchmarkProgressChartProps) {
  // Transform data for Chart.js
  const chartData = useMemo(() => {
    if (!data || !data.snapshots || data.snapshots.length === 0) {
      return null;
    }

    const labels = data.snapshots.map((snapshot) => {
      const date = new Date(snapshot.date);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    });

    const datasets = [
      {
        label: 'Achievement Rate',
        data: data.snapshots.map((s) => s.achievementRate),
        borderColor: CHART_CONFIG.COLORS.PRIMARY,
        backgroundColor: CHART_CONFIG.COLORS.PRIMARY_LIGHT,
        borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.DEFAULT,
        pointRadius: CHART_CONFIG.STYLING.POINT_RADIUS.SMALL,
        pointHoverRadius: CHART_CONFIG.STYLING.POINT_HOVER_RADIUS.SMALL,
        pointBackgroundColor: CHART_CONFIG.COLORS.PRIMARY,
        pointBorderColor: CHART_CONFIG.COLORS.WHITE,
        pointBorderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.DEFAULT,
        fill: true,
        tension: CHART_CONFIG.STYLING.LINE_TENSION,
      },
    ];

    // Add target line if specified
    if (targetRate !== undefined) {
      datasets.push({
        label: `Target (${targetRate}%)`,
        data: data.snapshots.map(() => targetRate),
        borderColor: CHART_CONFIG.COLORS.AVERAGE,
        backgroundColor: CHART_CONFIG.COLORS.AVERAGE_ALPHA,
        borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.DEFAULT,
        borderDash: CHART_CONFIG.STYLING.DASHED_LINE as number[],
        pointRadius: 0,
        pointHoverRadius: 0,
        pointBackgroundColor: CHART_CONFIG.COLORS.AVERAGE,
        pointBorderColor: CHART_CONFIG.COLORS.WHITE,
        pointBorderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THIN,
        fill: false,
        tension: 0,
      });
    }

    return {
      labels,
      datasets,
    };
  }, [data, targetRate]);

  // Chart options
  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        text: `Benchmark Progress: ${data.benchmarkName}`,
        font: {
          size: 16,
          weight: 'bold',
        },
      },
      subtitle: {
        display: true,
        text: 'Achievement rate over time',
      },
      tooltip: {
        callbacks: {
          title: (context) => {
            const dataIndex = context[0].dataIndex;
            const snapshot = data.snapshots[dataIndex];
            return new Date(snapshot.date).toLocaleDateString();
          },
          label: (context) => {
            const dataIndex = context.dataIndex;
            const snapshot = data.snapshots[dataIndex];

            if (context.dataset.label === 'Achievement Rate') {
              return [
                `Achievement Rate: ${snapshot.achievementRate.toFixed(1)}%`,
                `Athletes Met: ${snapshot.athletesMet} / ${snapshot.applicableAthletes}`,
              ];
            }

            const value = context.parsed.y ?? 0;
            return `${context.dataset.label}: ${value.toFixed(1)}%`;
          },
        },
      },
      legend: {
        display: true,
        position: 'top' as const,
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Date',
        },
        grid: {
          display: true,
        },
      },
      y: {
        title: {
          display: true,
          text: 'Achievement Rate (%)',
        },
        min: 0,
        max: 100,
        ticks: {
          callback: (value) => `${value}%`,
        },
        grid: {
          display: true,
        },
      },
    },
    elements: {
      point: {
        hoverRadius: 8,
      },
      line: {
        tension: 0.1,
      },
    },
    interaction: {
      intersect: false,
      mode: 'index',
    },
  };

  if (!chartData) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No progress data available for this benchmark
      </div>
    );
  }

  // Calculate accessibility description
  const firstSnapshot = data.snapshots[0];
  const lastSnapshot = data.snapshots[data.snapshots.length - 1];
  const ariaDescription = `Line chart showing ${data.benchmarkName} achievement rate over time. ` +
    `Starting at ${firstSnapshot.achievementRate.toFixed(1)}% on ${new Date(firstSnapshot.date).toLocaleDateString()}, ` +
    `ending at ${lastSnapshot.achievementRate.toFixed(1)}% on ${new Date(lastSnapshot.date).toLocaleDateString()} ` +
    `across ${data.snapshots.length} data points.`;

  return (
    <ResponsiveChartWrapper mobileHeight={300} desktopHeight={height}>
      <ChartErrorBoundary
        fallbackTitle="Benchmark Progress Chart Error"
        fallbackMessage="Failed to render benchmark progress chart. Please try refreshing the page."
      >
        <div
          role="img"
          aria-label={`Benchmark progress chart: ${data.benchmarkName} achievement rate over time`}
          aria-describedby="benchmark-progress-chart-desc"
        >
          <span id="benchmark-progress-chart-desc" className="sr-only">
            {ariaDescription}
          </span>
          <Line data={chartData} options={options} />
        </div>
      </ChartErrorBoundary>
    </ResponsiveChartWrapper>
  );
}

export default BenchmarkProgressChart;
