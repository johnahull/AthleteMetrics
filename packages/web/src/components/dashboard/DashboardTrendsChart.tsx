/**
 * DashboardTrendsChart - Enhanced performance trends with dynamic metric selection
 *
 * Features:
 * - Multi-metric selector (select 1-3 metrics)
 * - Integrates with dashboard scope (organization/team/athlete view)
 * - Integrates with dashboard timeframe filter
 * - Responsive chart design
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlertCircle, RefreshCw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { useAvailableMetrics } from "@/hooks/use-available-metrics";
import type { TimeframePreset } from "@shared/dashboard-timeframe";

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

interface DashboardTrendsChartProps {
  organizationId: string;
  teamId?: string;
  athleteId?: string;
  timeframe?: TimeframePreset | "custom" | "all";
  dateFrom?: string;
  dateTo?: string;
  scopeLabel?: string;
}

// Chart colors for different metrics
const METRIC_COLORS = [
  { border: "rgb(59, 130, 246)", bg: "rgba(59, 130, 246, 0.1)" }, // Blue
  { border: "rgb(16, 185, 129)", bg: "rgba(16, 185, 129, 0.1)" }, // Green
  { border: "rgb(245, 158, 11)", bg: "rgba(245, 158, 11, 0.1)" }, // Amber
];

export function DashboardTrendsChart({
  organizationId,
  teamId,
  athleteId,
  timeframe = "30d",
  dateFrom,
  dateTo,
  scopeLabel,
}: DashboardTrendsChartProps) {
  // Get available metrics
  const { metrics, isLoading: metricsLoading } = useAvailableMetrics();

  // State for selected metrics (max 3)
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);

  // Auto-select first 2 metrics when metrics load
  const effectiveMetrics = useMemo(() => {
    if (selectedMetrics.length > 0) return selectedMetrics;
    if (metrics.length > 0) {
      return metrics.slice(0, 2).map((m) => m.code);
    }
    return [];
  }, [selectedMetrics, metrics]);

  // Fetch trends data
  const {
    data: trendsData,
    isLoading: trendsLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      "/api/analytics/performance-trends",
      organizationId,
      teamId,
      athleteId,
      timeframe,
      dateFrom,
      dateTo,
      effectiveMetrics,
    ],
    queryFn: async () => {
      if (!organizationId || effectiveMetrics.length === 0) {
        return null;
      }

      // Build URL with query params
      const params = new URLSearchParams({
        organizationId,
        metrics: effectiveMetrics.join(","),
      });

      if (teamId) params.append("teamId", teamId);
      if (athleteId) params.append("athleteId", athleteId);

      // Calculate date range from timeframe
      const now = new Date();
      let calculatedDateFrom: string | undefined;
      let calculatedDateTo: string | undefined;

      if (timeframe === "custom" && dateFrom && dateTo) {
        calculatedDateFrom = new Date(dateFrom).toISOString();
        calculatedDateTo = new Date(dateTo).toISOString();
      } else if (timeframe === "all") {
        // For "All Time", use a date far in the past (10 years ago)
        calculatedDateFrom = new Date(
          now.getFullYear() - 10, 0, 1
        ).toISOString();
        calculatedDateTo = now.toISOString();
      } else {
        calculatedDateTo = now.toISOString();
        switch (timeframe) {
          case "7d":
            calculatedDateFrom = new Date(
              now.getTime() - 7 * 24 * 60 * 60 * 1000
            ).toISOString();
            break;
          case "30d":
            calculatedDateFrom = new Date(
              now.getTime() - 30 * 24 * 60 * 60 * 1000
            ).toISOString();
            break;
          case "90d":
            calculatedDateFrom = new Date(
              now.getTime() - 90 * 24 * 60 * 60 * 1000
            ).toISOString();
            break;
          case "180d":
            calculatedDateFrom = new Date(
              now.getTime() - 180 * 24 * 60 * 60 * 1000
            ).toISOString();
            break;
          case "1y":
            calculatedDateFrom = new Date(
              now.getFullYear() - 1,
              now.getMonth(),
              now.getDate()
            ).toISOString();
            break;
          case "ytd":
            calculatedDateFrom = new Date(
              now.getFullYear(),
              0,
              1
            ).toISOString();
            break;
        }
      }

      if (calculatedDateFrom) params.append("dateFrom", calculatedDateFrom);
      if (calculatedDateTo) params.append("dateTo", calculatedDateTo);

      const response = await fetch(
        `/api/analytics/performance-trends?${params.toString()}`,
        { credentials: "include" }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      return response.json();
    },
    enabled: !!organizationId && effectiveMetrics.length > 0,
  });

  const isLoading = metricsLoading || trendsLoading;

  // Handle metric toggle
  const toggleMetric = (metricCode: string) => {
    setSelectedMetrics((current) => {
      if (current.includes(metricCode)) {
        // Remove metric
        return current.filter((m) => m !== metricCode);
      } else if (current.length < 3) {
        // Add metric (max 3)
        return [...current, metricCode];
      }
      return current;
    });
  };

  // Format chart data
  const chartData = useMemo(() => {
    if (!trendsData || !trendsData.weeks || trendsData.weeks.length === 0) {
      return { labels: [], datasets: [] };
    }

    // Format week labels
    const labels = trendsData.weeks.map((weekStr: string) => {
      const date = new Date(weekStr);
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    });

    // Build datasets for each selected metric
    const datasets = effectiveMetrics.map((metricCode, index) => {
      const metricInfo = metrics.find((m) => m.code === metricCode);
      const color = METRIC_COLORS[index % METRIC_COLORS.length];

      return {
        label: metricInfo?.label || metricCode,
        data: trendsData.metrics[metricCode] || [],
        borderColor: color.border,
        backgroundColor: color.bg,
        tension: 0.4,
        spanGaps: true,
        pointRadius: 4,
        pointHoverRadius: 6,
        yAxisID: `y${index}`, // Each metric gets its own y-axis
      };
    });

    return { labels, datasets };
  }, [trendsData, effectiveMetrics, metrics]);

  // Build dynamic chart options with multiple y-axes for proper scaling
  const chartOptions = useMemo(() => {
    // Create a y-axis configuration for each selected metric
    const scales: Record<string, object> = {
      x: {
        grid: {
          display: true,
        },
      },
    };

    // Add a y-axis for each metric with independent scaling
    effectiveMetrics.forEach((metricCode, index) => {
      const metricInfo = metrics.find((m) => m.code === metricCode);
      const color = METRIC_COLORS[index % METRIC_COLORS.length];

      scales[`y${index}`] = {
        type: "linear" as const,
        display: true,
        position: index === 0 ? "left" : "right",
        beginAtZero: false,
        grid: {
          drawOnChartArea: index === 0, // Only show grid lines for first axis
        },
        ticks: {
          color: color.border,
        },
        title: {
          display: effectiveMetrics.length > 1,
          text: metricInfo?.label || metricCode,
          color: color.border,
        },
      };
    });

    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top" as const,
        },
        tooltip: {
          mode: "index" as const,
          intersect: false,
        },
      },
      scales,
      interaction: {
        mode: "nearest" as const,
        axis: "x" as const,
        intersect: false,
      },
    };
  }, [effectiveMetrics, metrics]);

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <h3 className="text-lg font-semibold text-gray-900">
            Performance Trends
          </h3>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            <div className="animate-pulse flex flex-col items-center">
              <div className="w-full h-40 bg-gray-200 rounded mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-48"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <h3 className="text-lg font-semibold text-gray-900">
            Performance Trends
          </h3>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center flex-col py-8 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mb-3" />
            <p className="text-sm text-gray-600 mb-4">Failed to load trends</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Empty/no data state
  if (
    !trendsData ||
    !trendsData.weeks ||
    trendsData.weeks.length === 0 ||
    effectiveMetrics.length === 0
  ) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <h3 className="text-lg font-semibold text-gray-900">
            Performance Trends
          </h3>
          {scopeLabel && (
            <p className="text-sm text-gray-500">{scopeLabel}</p>
          )}
        </CardHeader>
        <CardContent>
          {/* Metric selector */}
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-700 mb-2">
              Select metrics to display (max 3):
            </p>
            <div className="flex flex-wrap gap-4">
              {metrics.map((metric) => (
                <div key={metric.code} className="flex items-center space-x-2">
                  <Checkbox
                    id={`metric-${metric.code}`}
                    checked={
                      selectedMetrics.length > 0
                        ? selectedMetrics.includes(metric.code)
                        : effectiveMetrics.includes(metric.code)
                    }
                    onCheckedChange={() => toggleMetric(metric.code)}
                    disabled={
                      !selectedMetrics.includes(metric.code) &&
                      selectedMetrics.length >= 3
                    }
                  />
                  <Label
                    htmlFor={`metric-${metric.code}`}
                    className="text-sm cursor-pointer"
                  >
                    {metric.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center flex-col py-8 text-center">
            <TrendingUp className="h-12 w-12 text-gray-400 mb-3" />
            <p className="text-sm font-medium text-gray-900 mb-1">
              No trend data available
            </p>
            <p className="text-xs text-gray-500">
              Record measurements to see performance trends
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <h3 className="text-lg font-semibold text-gray-900">
          Performance Trends
        </h3>
        {scopeLabel && (
          <p className="text-sm text-gray-500">{scopeLabel}</p>
        )}
      </CardHeader>
      <CardContent>
        {/* Metric selector */}
        <div className="mb-4">
          <p className="text-sm font-medium text-gray-700 mb-2">
            Select metrics to display (max 3):
          </p>
          <div className="flex flex-wrap gap-4">
            {metrics.map((metric) => (
              <div key={metric.code} className="flex items-center space-x-2">
                <Checkbox
                  id={`metric-${metric.code}`}
                  checked={
                    selectedMetrics.length > 0
                      ? selectedMetrics.includes(metric.code)
                      : effectiveMetrics.includes(metric.code)
                  }
                  onCheckedChange={() => toggleMetric(metric.code)}
                  disabled={
                    !selectedMetrics.includes(metric.code) &&
                    selectedMetrics.length >= 3
                  }
                />
                <Label
                  htmlFor={`metric-${metric.code}`}
                  className="text-sm cursor-pointer"
                >
                  {metric.label}
                </Label>
              </div>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div
          className="h-64"
          role="img"
          aria-label={`Performance trends chart showing ${effectiveMetrics.length} metric${effectiveMetrics.length > 1 ? 's' : ''} over time for ${scopeLabel || 'organization'}`}
        >
          <Line data={chartData} options={chartOptions} />
        </div>

        {/* Hidden data table for screen readers */}
        <table className="sr-only" aria-label="Performance trends data">
          <caption>Weekly performance data for selected metrics</caption>
          <thead>
            <tr>
              <th scope="col">Week</th>
              {effectiveMetrics.map((metricCode) => {
                const metricInfo = metrics.find((m) => m.code === metricCode);
                return <th key={metricCode} scope="col">{metricInfo?.label || metricCode}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {chartData.labels.map((week: string, i: number) => (
              <tr key={i}>
                <td>{week}</td>
                {chartData.datasets.map((ds, j) => (
                  <td key={j}>{ds.data[i] !== null && ds.data[i] !== undefined ? ds.data[i] : 'N/A'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
