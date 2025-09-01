import { Card, CardContent } from "@/components/ui/card";
import { Info } from "lucide-react";
import { Scatter } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend);

interface ScatterChartProps {
  data: any[];
}

export default function ScatterChart({ data }: ScatterChartProps) {
  const processScatterData = (measurements: any[]) => {
    if (!measurements || measurements.length === 0) return { datasets: [] };

    // Group measurements by player to get their best performances
    const playerData = new Map();
    
    measurements.forEach(measurement => {
      const playerId = measurement.user.id;
      const playerName = measurement.user.fullName;
      const teamName = measurement.user.teams && measurement.user.teams.length > 0 
        ? measurement.user.teams.map((team: any) => team.name).join(", ")
        : "Independent Player";
      const value = parseFloat(measurement.value);
      
      if (!playerData.has(playerId)) {
        playerData.set(playerId, {
          name: playerName,
          team: teamName,
          fly10: null,
          vertical: null,
        });
      }
      
      const player = playerData.get(playerId);
      
      if (measurement.metric === "FLY10_TIME") {
        if (!player.fly10 || value < player.fly10) {
          player.fly10 = value;
        }
      } else if (measurement.metric === "VERTICAL_JUMP") {
        if (!player.vertical || value > player.vertical) {
          player.vertical = value;
        }
      }
    });

    // Create scatter points for players with both metrics
    const scatterPoints = Array.from(playerData.values())
      .filter(player => player.fly10 !== null && player.vertical !== null)
      .map(player => ({
        x: player.fly10,
        y: player.vertical,
        playerName: player.name,
        teamName: player.team,
      }));

    return {
      datasets: [
        {
          label: 'Athletes',
          data: scatterPoints,
          backgroundColor: 'hsl(203.8863, 88.2845%, 53.1373%)',
          borderColor: 'hsl(203.8863, 88.2845%, 43.1373%)',
          pointRadius: 6,
          pointHoverRadius: 8,
        },
      ],
    };
  };

  const chartData = processScatterData(data);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const point = context.raw;
            return `${point.playerName} (${point.teamName}): ${point.x}s, ${point.y}in`;
          },
        },
      },
    },
    scales: {
      x: {
        type: 'linear' as const,
        position: 'bottom' as const,
        title: {
          display: true,
          text: 'Fly-10 Time (s)',
        },
        reverse: true, // Lower times (better performance) on the right
      },
      y: {
        type: 'linear' as const,
        title: {
          display: true,
          text: 'Vertical Jump (in)',
        },
        beginAtZero: false,
      },
    },
  };

  // Calculate correlation if we have data
  const calculateCorrelation = (points: any[]) => {
    if (points.length < 2) return null;
    
    const n = points.length;
    const sumX = points.reduce((sum, p) => sum + p.x, 0);
    const sumY = points.reduce((sum, p) => sum + p.y, 0);
    const sumXY = points.reduce((sum, p) => sum + (p.x * p.y), 0);
    const sumXX = points.reduce((sum, p) => sum + (p.x * p.x), 0);
    const sumYY = points.reduce((sum, p) => sum + (p.y * p.y), 0);
    
    const correlation = (n * sumXY - sumX * sumY) / 
      Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
    
    return correlation;
  };

  const correlation = chartData.datasets[0]?.data.length > 0 
    ? calculateCorrelation(chartData.datasets[0].data) 
    : null;

  return (
    <Card className="bg-white">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Fly-10 vs Vertical Jump</h3>
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-500">Hover for details</span>
            <Info className="h-4 w-4 text-gray-400" />
          </div>
        </div>
        
        <div className="h-64 mb-4">
          <Scatter data={chartData} options={options} />
        </div>
        
        {correlation !== null && (
          <div className="text-sm text-gray-600">
            <p>
              Correlation: {correlation.toFixed(2)} 
              {Math.abs(correlation) > 0.5 && (
                <span className="text-gray-800">
                  {correlation > 0 ? ' (Positive' : ' (Negative'} correlation - 
                  {Math.abs(correlation) > 0.7 ? ' strong' : ' moderate'})
                </span>
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
