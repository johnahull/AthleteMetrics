import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Line } from 'react-chartjs-2';
import type { ChartOptions } from 'chart.js';
import type { WellnessResponse, WellnessTemplate } from '@shared/wellness-types';
import { calculateAthleteStatus } from '@shared/wellness-status-utils';

interface StatusTrendChartProps {
  template: WellnessTemplate;
  responses: WellnessResponse[];
  filters?: {
    teamIds?: string[];
  };
}

interface DailyStatusBreakdown {
  date: string;
  red: number;
  yellow: number;
  green: number;
  total: number;
}

export function StatusTrendChart({ template, responses, filters }: StatusTrendChartProps) {
  // Calculate daily status breakdowns
  const dailyBreakdowns = useMemo(() => {
    if (!responses || responses.length === 0) return [];

    // Filter by team if specified
    let filteredResponses = responses;
    if (filters?.teamIds && filters.teamIds.length > 0) {
      filteredResponses = responses.filter(
        r => r.teamId && filters.teamIds!.includes(r.teamId)
      );
    }

    // Group responses by date
    const dateMap = new Map<string, WellnessResponse[]>();
    filteredResponses.forEach(response => {
      if (!dateMap.has(response.date)) {
        dateMap.set(response.date, []);
      }
      dateMap.get(response.date)!.push(response);
    });

    // Calculate status breakdown for each date
    const breakdowns: DailyStatusBreakdown[] = [];
    dateMap.forEach((dateResponses, date) => {
      const statusCounts = { red: 0, yellow: 0, green: 0 };
      const athleteStatuses = new Map<string, 'red' | 'yellow' | 'green'>();

      dateResponses.forEach(response => {
        const status = calculateAthleteStatus(response, template);
        athleteStatuses.set(response.userId, status.status);
      });

      athleteStatuses.forEach(status => {
        statusCounts[status]++;
      });

      const total = athleteStatuses.size;
      breakdowns.push({
        date,
        red: total > 0 ? (statusCounts.red / total) * 100 : 0,
        yellow: total > 0 ? (statusCounts.yellow / total) * 100 : 0,
        green: total > 0 ? (statusCounts.green / total) * 100 : 0,
        total,
      });
    });

    // Sort by date
    breakdowns.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return breakdowns;
  }, [responses, template, filters]);

  const chartData = useMemo(() => {
    const labels = dailyBreakdowns.map(d => {
      const date = new Date(d.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    return {
      labels,
      datasets: [
        {
          label: 'Green',
          data: dailyBreakdowns.map(d => d.green),
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.2)',
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Yellow',
          data: dailyBreakdowns.map(d => d.yellow),
          borderColor: 'rgb(234, 179, 8)',
          backgroundColor: 'rgba(234, 179, 8, 0.2)',
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Red',
          data: dailyBreakdowns.map(d => d.red),
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.2)',
          fill: true,
          tension: 0.3,
        },
      ],
    };
  }, [dailyBreakdowns]);

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: false,
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y ?? 0;
            const breakdown = dailyBreakdowns[context.dataIndex];
            const count = Math.round((value / 100) * breakdown.total);
            return `${label}: ${value.toFixed(1)}% (${count} athletes)`;
          },
          footer: (tooltipItems) => {
            const index = tooltipItems[0].dataIndex;
            const breakdown = dailyBreakdowns[index];
            return `Total: ${breakdown.total} athletes`;
          },
        },
      },
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Date',
        },
      },
      y: {
        display: true,
        title: {
          display: true,
          text: 'Percentage of Athletes (%)',
        },
        min: 0,
        max: 100,
        ticks: {
          callback: (value) => `${value}%`,
        },
      },
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false,
    },
  };

  // Calculate overall trend
  const overallTrend = useMemo(() => {
    if (dailyBreakdowns.length < 2) return 'stable';

    const recent = dailyBreakdowns.slice(-3);
    const earlier = dailyBreakdowns.slice(0, 3);

    const recentGreen = recent.reduce((sum, d) => sum + d.green, 0) / recent.length;
    const earlierGreen = earlier.reduce((sum, d) => sum + d.green, 0) / earlier.length;

    const diff = recentGreen - earlierGreen;
    if (diff > 5) return 'improving';
    if (diff < -5) return 'declining';
    return 'stable';
  }, [dailyBreakdowns]);

  if (dailyBreakdowns.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{template.name} - Status Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-center py-8">No status data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{template.name} - Status Trend</CardTitle>
        <p className="text-sm text-muted-foreground">
          Percentage of athletes in each status category over time
          {overallTrend !== 'stable' && (
            <span className={`ml-2 font-medium ${overallTrend === 'improving' ? 'text-green-600' : 'text-red-600'}`}>
              Overall trend: {overallTrend}
            </span>
          )}
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <Line data={chartData} options={options} />
        </div>
      </CardContent>
    </Card>
  );
}
