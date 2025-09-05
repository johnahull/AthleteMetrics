import { useQuery } from "@tanstack/react-query";
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

export default function PerformanceChart() {
  const { data: measurements } = useQuery({
    queryKey: ["/api/measurements"],
  });

  // Process data for weekly trends
  const processWeeklyData = (measurements: any[]) => {
    if (!measurements || measurements.length === 0) return { labels: [], datasets: [] };

    // Group by week and find best performances
    const weeklyData = new Map();
    
    measurements.forEach(measurement => {
      const date = new Date(measurement.date);
      const weekStart = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];
      
      if (!weeklyData.has(weekKey)) {
        weeklyData.set(weekKey, {
          date: weekStart,
          bestFly10: null,
          bestVertical: null,
        });
      }
      
      const week = weeklyData.get(weekKey);
      const value = parseFloat(measurement.value);
      
      if (measurement.metric === "FLY10_TIME") {
        if (!week.bestFly10 || value < week.bestFly10) {
          week.bestFly10 = value;
        }
      } else if (measurement.metric === "VERTICAL_JUMP") {
        if (!week.bestVertical || value > week.bestVertical) {
          week.bestVertical = value;
        }
      }
    });

    // Sort by date and prepare chart data
    const sortedWeeks = Array.from(weeklyData.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(-8); // Last 8 weeks

    const labels = sortedWeeks.map(week => 
      week.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    );

    const fly10Data = sortedWeeks.map(week => week.bestFly10);
    const verticalData = sortedWeeks.map(week => week.bestVertical);

    return {
      labels,
      datasets: [
        {
          label: 'Best Fly-10 (s)',
          data: fly10Data,
          borderColor: 'hsl(203.8863, 88.2845%, 53.1373%)',
          backgroundColor: 'hsla(203.8863, 88.2845%, 53.1373%, 0.1)',
          tension: 0.4,
          yAxisID: 'y',
        },
        {
          label: 'Best Vertical (in)',
          data: verticalData,
          borderColor: 'hsl(159.7826, 100%, 36.0784%)',
          backgroundColor: 'hsla(159.7826, 100%, 36.0784%, 0.1)',
          tension: 0.4,
          yAxisID: 'y1',
        },
      ],
    };
  };

  const chartData = processWeeklyData((measurements as any[]) || []);

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

  return (
    <Card className="bg-white">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Performance Trends</h3>
          <Select defaultValue="last8weeks">
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last8weeks">Last 8 Weeks</SelectItem>
              <SelectItem value="last30days">Last 30 Days</SelectItem>
              <SelectItem value="last90days">Last 90 Days</SelectItem>
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
