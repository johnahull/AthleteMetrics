import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface PerformanceChartProps {
  organizationId?: string;
}

export default function PerformanceChart({ organizationId }: PerformanceChartProps) {
  const [timeRange, setTimeRange] = useState("thisyear");

  const { data: trendsData, isError, error } = useQuery({
    queryKey: ["/api/analytics/performance-trends", organizationId, timeRange],
    enabled: !!organizationId, // Only run query if organizationId is provided
    queryFn: async () => {
      if (!organizationId) {
        throw new Error("Organization ID is required to fetch performance data");
      }

      // Calculate date range based on timeRange
      const now = new Date();
      let dateFrom = "";

      switch (timeRange) {
        case "last30days":
          dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
          break;
        case "last90days":
          dateFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
          break;
        case "thisyear":
          dateFrom = new Date(now.getFullYear(), 0, 1).toISOString();
          break;
        case "last8weeks":
        default:
          dateFrom = new Date(now.getTime() - 8 * 7 * 24 * 60 * 60 * 1000).toISOString();
          break;
      }

      const url = `/api/analytics/performance-trends?organizationId=${organizationId}&dateFrom=${dateFrom}&metrics=FLY10_TIME,VERTICAL_JUMP`;
      const response = await fetch(url, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
  });

  // Transform server-aggregated data into Chart.js format
  const formatChartData = (data: any) => {
    if (!data || !data.weeks || data.weeks.length === 0) {
      return { labels: [], datasets: [] };
    }

    // Format week labels for display (e.g., "Jan 1" instead of "2025-01-01")
    const labels = data.weeks.map((weekStr: string) => {
      const date = new Date(weekStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    return {
      labels,
      datasets: [
        {
          label: 'Best Fly-10 (s)',
          data: data.metrics.FLY10_TIME || [],
          borderColor: 'hsl(203.8863, 88.2845%, 53.1373%)',
          backgroundColor: 'hsla(203.8863, 88.2845%, 53.1373%, 0.1)',
          tension: 0.4,
          yAxisID: 'y',
          spanGaps: true, // Connect points even if there are null values
        },
        {
          label: 'Best Vertical (in)',
          data: data.metrics.VERTICAL_JUMP || [],
          borderColor: 'hsl(159.7826, 100%, 36.0784%)',
          backgroundColor: 'hsla(159.7826, 100%, 36.0784%, 0.1)',
          tension: 0.4,
          yAxisID: 'y1',
          spanGaps: true, // Connect points even if there are null values
        },
      ],
    };
  };

  const chartData = formatChartData(trendsData);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: false,
      },
    },
    scales: {
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: true,
          text: 'Fly-10 Time (s)',
        },
        grid: {
          drawOnChartArea: false,
        },
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        title: {
          display: true,
          text: 'Vertical Jump (in)',
        },
        grid: {
          drawOnChartArea: false,
        },
      },
    },
  };

  if (isError) {
    return (
      <Card className="bg-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Performance Trends</h3>
          </div>
          <div className="h-64 flex items-center justify-center">
            <div className="text-center">
              <p className="text-red-600 font-medium">Error loading performance data</p>
              <p className="text-sm text-gray-500 mt-2">{error instanceof Error ? error.message : 'Unknown error'}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Performance Trends</h3>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last8weeks">Last 8 Weeks</SelectItem>
              <SelectItem value="last30days">Last 30 Days</SelectItem>
              <SelectItem value="last90days">Last 90 Days</SelectItem>
              <SelectItem value="thisyear">This Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="h-64">
          <Line data={chartData} options={options} />
        </div>
      </CardContent>
    </Card>
  );
}
