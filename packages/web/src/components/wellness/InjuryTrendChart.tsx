import { useMemo, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Line } from 'react-chartjs-2';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import type { Chart as ChartJS, ChartOptions } from 'chart.js';
import type { WellnessResponse, WellnessTemplate } from '@shared/wellness-types';
import { getCommonInjuries, calculateAthleteStatus } from '@shared/wellness-status-utils';

interface InjuryTrendChartProps {
  template: WellnessTemplate;
  responses: WellnessResponse[];
  filters?: {
    teamIds?: string[];
  };
}

interface DailyInjuryData {
  date: string;
  totalInjuries: number;
  uniqueAthletes: number;
  injuryBreakdown: Map<string, number>;
}

export function InjuryTrendChart({ template, responses, filters }: InjuryTrendChartProps) {
  // Chart ref for cleanup
  const chartRef = useRef<ChartJS<'line'>>(null);

  // Cleanup chart on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, []);
  // Calculate daily injury trends
  const dailyInjuryData = useMemo(() => {
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

    // Calculate injury data for each date
    const data: DailyInjuryData[] = [];
    dateMap.forEach((dateResponses, date) => {
      let totalInjuries = 0;
      const athletesWithInjuries = new Set<string>();
      const injuryBreakdown = new Map<string, number>();

      dateResponses.forEach(response => {
        const status = calculateAthleteStatus(response, template);
        if (status.injuries.length > 0) {
          athletesWithInjuries.add(response.userId);
          totalInjuries += status.injuries.length;

          status.injuries.forEach(injury => {
            if (injury.label) {
              injuryBreakdown.set(
                injury.label,
                (injuryBreakdown.get(injury.label) || 0) + 1
              );
            }
          });
        }
      });

      data.push({
        date,
        totalInjuries,
        uniqueAthletes: athletesWithInjuries.size,
        injuryBreakdown,
      });
    });

    // Sort by date
    data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return data;
  }, [responses, template, filters]);

  // Most common injuries across entire period
  const commonInjuries = useMemo(() => {
    const allInjuryBreakdown = new Map<string, number>();

    dailyInjuryData.forEach(day => {
      day.injuryBreakdown.forEach((count, label) => {
        allInjuryBreakdown.set(
          label,
          (allInjuryBreakdown.get(label) || 0) + count
        );
      });
    });

    return Array.from(allInjuryBreakdown.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 most common
  }, [dailyInjuryData]);

  const chartData = useMemo(() => {
    const labels = dailyInjuryData.map(d => {
      const date = new Date(d.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    return {
      labels,
      datasets: [
        {
          label: 'Total Injuries',
          data: dailyInjuryData.map(d => d.totalInjuries),
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.5)',
          tension: 0.3,
          yAxisID: 'y',
        },
        {
          label: 'Athletes with Injuries',
          data: dailyInjuryData.map(d => d.uniqueAthletes),
          borderColor: 'rgb(249, 115, 22)',
          backgroundColor: 'rgba(249, 115, 22, 0.5)',
          tension: 0.3,
          yAxisID: 'y',
        },
      ],
    };
  }, [dailyInjuryData]);

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
        type: 'linear',
        display: true,
        position: 'left',
        title: {
          display: true,
          text: 'Count',
        },
        min: 0,
      },
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false,
    },
  };

  if (dailyInjuryData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{template.name} - Injury Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-center py-8">No injury data available</p>
        </CardContent>
      </Card>
    );
  }

  const totalInjuryReports = dailyInjuryData.reduce((sum, d) => sum + d.totalInjuries, 0);
  const totalAthletesAffected = new Set(
    dailyInjuryData.flatMap(d =>
      d.uniqueAthletes > 0 ? [d.date] : []
    )
  ).size;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{template.name} - Injury Trends</CardTitle>
        <p className="text-sm text-muted-foreground">
          Track injury patterns and affected body parts over time
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Trend Chart */}
        <div className="h-64 sm:h-80 lg:h-96">
          <Line data={chartData} options={options} />
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
          <div>
            <p className="text-sm text-muted-foreground">Total Injury Reports</p>
            <p className="text-2xl font-bold">{totalInjuryReports}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Days with Injuries</p>
            <p className="text-2xl font-bold">{totalAthletesAffected}</p>
          </div>
        </div>

        {/* Most Common Injuries */}
        {commonInjuries.length > 0 && (
          <div>
            <h3 className="font-semibold mb-3">Most Common Injury Locations</h3>
            <div className="overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs sm:text-sm">Body Part</TableHead>
                    <TableHead className="text-right text-xs sm:text-sm">Reports</TableHead>
                    <TableHead className="hidden md:table-cell text-right text-xs sm:text-sm">% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commonInjuries.map(injury => (
                    <TableRow key={injury.label}>
                      <TableCell className="font-medium">{injury.label}</TableCell>
                      <TableCell className="text-right">{injury.count}</TableCell>
                      <TableCell className="hidden md:table-cell text-right">
                        {((injury.count / totalInjuryReports) * 100).toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
