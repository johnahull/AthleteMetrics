import React, { useMemo } from 'react';
import type { ChartOptions } from 'chart.js';
import { Line } from 'react-chartjs-2';

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
        borderColor: 'rgba(59, 130, 246, 1)', // Blue
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: 'rgba(59, 130, 246, 1)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        fill: true,
        tension: 0.1,
      },
    ];

    // Add target line if specified
    if (targetRate !== undefined) {
      datasets.push({
        label: `Target (${targetRate}%)`,
        data: data.snapshots.map(() => targetRate),
        borderColor: 'rgba(239, 68, 68, 1)', // Red
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderWidth: 2,
        borderDash: [5, 5] as number[],
        pointRadius: 0,
        pointHoverRadius: 0,
        pointBackgroundColor: 'rgba(239, 68, 68, 1)',
        pointBorderColor: '#fff',
        pointBorderWidth: 1,
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

  return (
    <div className="w-full" style={{ height: `${height}px` }}>
      <Line data={chartData} options={options} />
    </div>
  );
}

export default BenchmarkProgressChart;
