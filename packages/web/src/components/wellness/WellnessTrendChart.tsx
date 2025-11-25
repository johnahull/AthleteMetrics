import { useMemo, useRef, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import type { Chart as ChartJS, ChartOptions } from 'chart.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { WellnessResponse, WellnessResponseData, WellnessTrend } from '@shared/wellness-types';
import { WELLNESS_CONSTANTS } from '@shared/wellness-constants';

interface WellnessTrendChartProps {
  trends: WellnessTrend[];
  responses: WellnessResponse[];
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

  // Get unique athletes from responses (instead of separate API call)
  const athletes = useMemo(() => {
    if (!responses || responses.length === 0) return [];

    const athleteMap = new Map<string, { id: string; fullName: string }>();
    responses.forEach((response) => {
      if (!athleteMap.has(response.userId)) {
        athleteMap.set(response.userId, {
          id: response.userId,
          fullName: response.userFullName,
        });
      }
    });

    // Sort alphabetically by name
    return Array.from(athleteMap.values()).sort((a, b) =>
      a.fullName.localeCompare(b.fullName)
    );
  }, [responses]);

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
      const responseData = response.responses as WellnessResponseData;
      Object.keys(responseData).forEach((qId) => questionIds.add(qId));
    });

    const questionIdArray = Array.from(questionIds);

    // Create datasets for each question (limit to max)
    const limitedQuestionIds = questionIdArray.slice(0, WELLNESS_CONSTANTS.CHART_MAX_QUESTIONS);

    const datasets = limitedQuestionIds.map((questionId, index) => {
      const dataPoints = athleteResponses.map((response) => {
        const responseData = response.responses as WellnessResponseData;
        const questionData = responseData[questionId];
        return questionData && typeof questionData.value === 'number'
          ? questionData.value
          : null;
      });

      // Use colorblind-friendly palette from constants
      const color = WELLNESS_CONSTANTS.CHART_COLORS[index % WELLNESS_CONSTANTS.CHART_COLORS.length];

      // Get question label from first response that has this question
      const labelResponse = athleteResponses.find((r) => {
        const responseData = r.responses as WellnessResponseData;
        const data = responseData[questionId];
        return data && data.label;
      });

      const label =
        labelResponse && (labelResponse.responses as WellnessResponseData)[questionId]?.label
          ? (labelResponse.responses as WellnessResponseData)[questionId].label
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
            {athletes.map((athlete) => (
              <SelectItem key={athlete.id} value={athlete.id}>
                {athlete.fullName}
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
          <Line ref={chartRef} data={chartData} options={options} />
        </div>
      )}
    </div>
  );
}
