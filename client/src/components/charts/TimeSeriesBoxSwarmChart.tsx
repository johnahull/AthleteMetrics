import React, { useState, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  ScatterController,
  LineController,
  PointElement,
  LineElement
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import type {
  TrendData,
  ChartConfiguration,
  StatisticalSummary
} from '@shared/analytics-types';
import { useTimeSeriesChartData } from './hooks/useTimeSeriesChartData';
import { createTimeSeriesChartOptions } from './utils/timeSeriesChartOptions';
import { TimeSeriesChartControls } from './components/TimeSeriesChartControls';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  ScatterController,
  LineController,
  PointElement,
  LineElement
);

interface TimeSeriesBoxSwarmProps {
  data: TrendData[];
  config: ChartConfiguration;
  selectedDates: string[];
  metric: string;
  statistics?: Record<string, StatisticalSummary>;
  showAthleteNames?: boolean;
}

export const TimeSeriesBoxSwarmChart = React.memo(function TimeSeriesBoxSwarmChart({
  data,
  config,
  selectedDates,
  metric,
  statistics,
  showAthleteNames = false
}: TimeSeriesBoxSwarmProps) {
  const [localShowAthleteNames, setLocalShowAthleteNames] = useState(showAthleteNames);

  // Process chart data using custom hook
  const chartData = useTimeSeriesChartData({
    data,
    selectedDates,
    metric,
    showAthleteNames: localShowAthleteNames
  });

  // Create chart options with memoization for performance
  const options = useMemo(() => {
    return createTimeSeriesChartOptions(config, metric, chartData.labels);
  }, [config, metric, chartData.labels]);

  if (!data || data.length === 0 || selectedDates.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No data available for the selected dates
      </div>
    );
  }

  return (
    <div className="w-full h-full space-y-4">
      {/* Controls */}
      <TimeSeriesChartControls
        showAthleteNames={localShowAthleteNames}
        onShowAthleteNamesChange={setLocalShowAthleteNames}
      />

      {/* Chart */}
      <div className="h-96">
        <Chart type="scatter" data={chartData} options={options} />
      </div>
    </div>
  );
});