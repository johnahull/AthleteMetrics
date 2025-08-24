import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bar } from "react-chartjs-2";
import { Expand, Download } from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface DistributionChartProps {
  data: number[];
  title: string;
  metric: "FLY10_TIME" | "VERTICAL_JUMP";
}

export default function DistributionChart({ data, title, metric }: DistributionChartProps) {
  const createHistogram = (values: number[], bins: number = 5) => {
    if (values.length === 0) return { labels: [], data: [] };

    const min = Math.min(...values);
    const max = Math.max(...values);
    const binSize = (max - min) / bins;
    
    const histogram = new Array(bins).fill(0);
    const labels = [];

    for (let i = 0; i < bins; i++) {
      const start = min + i * binSize;
      const end = min + (i + 1) * binSize;
      
      if (metric === "FLY10_TIME") {
        labels.push(`${start.toFixed(2)}-${end.toFixed(2)}`);
      } else {
        labels.push(`${Math.round(start)}-${Math.round(end)}`);
      }

      values.forEach(value => {
        if (value >= start && (value < end || (i === bins - 1 && value === end))) {
          histogram[i]++;
        }
      });
    }

    return { labels, data: histogram };
  };

  const { labels, data: histogramData } = createHistogram(data);
  
  const chartData = {
    labels,
    datasets: [
      {
        label: 'Count',
        data: histogramData,
        backgroundColor: metric === "FLY10_TIME" 
          ? 'hsl(203.8863, 88.2845%, 53.1373%)'
          : 'hsl(159.7826, 100%, 36.0784%)',
        borderColor: metric === "FLY10_TIME"
          ? 'hsl(203.8863, 88.2845%, 43.1373%)'
          : 'hsl(159.7826, 100%, 26.0784%)',
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: false,
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: metric === "FLY10_TIME" ? "Time Range (s)" : "Height Range (in)",
        },
      },
      y: {
        title: {
          display: true,
          text: "Number of Athletes",
        },
        beginAtZero: true,
      },
    },
  };

  const stats = data.length > 0 ? {
    min: Math.min(...data),
    max: Math.max(...data),
    mean: data.reduce((sum, val) => sum + val, 0) / data.length,
  } : null;

  return (
    <Card className="bg-white">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <div className="flex space-x-2">
            <Button variant="ghost" size="sm">
              <Expand className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div className="h-64 mb-4">
          <Bar data={chartData} options={options} />
        </div>
        
        {stats && (
          <div className="text-sm text-gray-600">
            <div className="flex justify-between">
              <span>
                Range: {metric === "FLY10_TIME" ? `${stats.min.toFixed(2)}s - ${stats.max.toFixed(2)}s` : `${stats.min.toFixed(1)}in - ${stats.max.toFixed(1)}in`}
              </span>
              <span>
                Mean: {metric === "FLY10_TIME" ? `${stats.mean.toFixed(2)}s` : `${stats.mean.toFixed(1)}in`}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
