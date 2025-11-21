import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';

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

interface WellnessTrendChartProps {
  trends: any[];
  responses: any[];
  selectedAthleteId: string | null;
  onAthleteSelect: (athleteId: string | null) => void;
  organizationId: string;
}

/**
 * Line chart showing wellness trends over time for individual athlete
 */
export function WellnessTrendChart({
  trends,
  responses,
  selectedAthleteId,
  onAthleteSelect,
  organizationId,
}: WellnessTrendChartProps) {
  // Get list of athletes
  const { data: users = [] } = useQuery({
    queryKey: ['/api/users', organizationId],
    queryFn: async () => {
      const response = await fetch(`/api/users?organizationId=${organizationId}`, {
        credentials: 'include',
      });
      return response.json();
    },
    enabled: !!organizationId,
  });

  const athletes = users.filter((u: any) => u.role === 'athlete');

  // Filter responses for selected athlete
  const athleteResponses = useMemo(() => {
    if (!selectedAthleteId || !responses) return [];

    return responses
      .filter((r) => r.userId === selectedAthleteId)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [selectedAthleteId, responses]);

  // Prepare chart data
  const chartData = useMemo(() => {
    if (athleteResponses.length === 0) {
      return null;
    }

    // Get unique question IDs from responses
    const questionIds = new Set<string>();
    athleteResponses.forEach((response) => {
      Object.keys(response.responses as any).forEach((qId) => questionIds.add(qId));
    });

    const questionIdArray = Array.from(questionIds);

    // Create datasets for each question
    const datasets = questionIdArray.map((questionId, index) => {
      const dataPoints = athleteResponses.map((response) => {
        const responseData = (response.responses as any)[questionId];
        return responseData && typeof responseData.value === 'number'
          ? responseData.value
          : null;
      });

      const colors = [
        'rgb(59, 130, 246)', // Blue
        'rgb(16, 185, 129)', // Green
        'rgb(245, 158, 11)', // Orange
        'rgb(139, 92, 246)', // Purple
        'rgb(236, 72, 153)', // Pink
      ];

      const color = colors[index % colors.length];

      // Get question label from first response that has this question
      const labelResponse = athleteResponses.find((r) => {
        const data = (r.responses as any)[questionId];
        return data && data.label;
      });

      const label =
        labelResponse && (labelResponse.responses as any)[questionId]?.label
          ? (labelResponse.responses as any)[questionId].label
          : questionId;

      return {
        label,
        data: dataPoints,
        borderColor: color,
        backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.1)'),
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        tension: 0.1,
        fill: false,
      };
    });

    return {
      labels: athleteResponses.map((r) =>
        new Date(r.date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })
      ),
      datasets,
    };
  }, [athleteResponses]);

  // Chart options
  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
      },
      tooltip: {
        mode: 'index',
        intersect: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 10,
        title: {
          display: true,
          text: 'Wellness Score',
        },
      },
      x: {
        title: {
          display: true,
          text: 'Date',
        },
      },
    },
  };

  return (
    <div>
      {/* Athlete Selector */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Select Athlete</label>
        <Select
          value={selectedAthleteId || 'none'}
          onValueChange={(value) => onAthleteSelect(value === 'none' ? null : value)}
        >
          <SelectTrigger data-testid="athlete-selector">
            <SelectValue placeholder="Select an athlete..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Select an athlete...</SelectItem>
            {athletes.map((athlete: any) => (
              <SelectItem key={athlete.id} value={athlete.id}>
                {athlete.fullName || athlete.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Chart or Empty State */}
      {!selectedAthleteId ? (
        <div
          data-testid="chart-empty-state"
          className="flex items-center justify-center h-64 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300"
        >
          <p className="text-gray-500">Select an athlete to view wellness trends</p>
        </div>
      ) : chartData === null || athleteResponses.length === 0 ? (
        <div
          data-testid="chart-empty-state"
          className="flex items-center justify-center h-64 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300"
        >
          <p className="text-gray-500">No wellness data available for selected athlete</p>
        </div>
      ) : (
        <div className="h-96">
          <Line data={chartData} options={options} />
        </div>
      )}
    </div>
  );
}
