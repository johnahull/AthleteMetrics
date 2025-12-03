/**
 * MeasurementProgressChart Component
 *
 * Displays measurement progress over time as a line chart.
 * Shows values on Y-axis and dates on X-axis.
 */

import React, { useMemo, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import type { ChartOptions } from 'chart.js';
import { Skeleton } from '@/components/ui/skeleton';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { AlertCircle } from 'lucide-react';
import type { Measurement } from '@shared/schema';
import { getMetricDisplayName, getMetricUnit, isLowerBetter } from '@/constants/metrics';

// Import chart setup to register Chart.js components
import '@/lib/chart-setup';

export interface MeasurementProgressChartProps {
  measurements: Measurement[];
  isLoading?: boolean;
  showBestOnly?: boolean;
  onShowBestOnlyChange?: (value: boolean) => void;
}

export function MeasurementProgressChart({
  measurements,
  isLoading = false,
  showBestOnly = false,
  onShowBestOnlyChange,
}: MeasurementProgressChartProps) {
  // Check if measurements have mixed metrics
  const uniqueMetrics = useMemo(() => {
    const metrics = new Set(measurements.map(m => m.metric));
    return Array.from(metrics);
  }, [measurements]);

  const hasMixedMetrics = uniqueMetrics.length > 1;

  // Track the displayed measurements for tooltip lookup
  const displayedMeasurementsRef = useRef<Measurement[]>([]);

  // Sort measurements by date (oldest first) and prepare chart data
  const chartData = useMemo(() => {
    if (measurements.length === 0) {
      return null;
    }

    let sorted = [...measurements].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Filter to best per date if showBestOnly is true
    if (showBestOnly) {
      const metric = sorted[0]?.metric || '';
      const lowerIsBetter = isLowerBetter(metric);
      const bestByDate = new Map<string, Measurement>();

      for (const m of sorted) {
        const existing = bestByDate.get(m.date);
        if (!existing) {
          bestByDate.set(m.date, m);
        } else {
          const existingValue = parseFloat(existing.value);
          const currentValue = parseFloat(m.value);
          const isBetter = lowerIsBetter
            ? currentValue < existingValue
            : currentValue > existingValue;
          if (isBetter) {
            bestByDate.set(m.date, m);
          }
        }
      }

      sorted = Array.from(bestByDate.values()).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
    }

    // Store displayed measurements for tooltip lookup
    displayedMeasurementsRef.current = sorted;

    const labels = sorted.map(m => {
      const date = new Date(m.date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const data = sorted.map(m => parseFloat(m.value));
    const metric = sorted[0]?.metric || '';
    const units = sorted[0]?.units || '';

    return {
      labels,
      datasets: [
        {
          label: `${getMetricDisplayName(metric)} (${getMetricUnit(metric, units)})`,
          data,
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.5)',
          pointBackgroundColor: sorted.map(m =>
            m.isVerified ? 'rgb(59, 130, 246)' : 'rgb(245, 158, 11)'
          ),
          pointBorderColor: sorted.map(m =>
            m.isVerified ? 'rgb(59, 130, 246)' : 'rgb(245, 158, 11)'
          ),
          pointRadius: 6,
          tension: 0.3,
        },
      ],
    };
  }, [measurements, showBestOnly]);

  const chartOptions: ChartOptions<'line'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top' as const,
        },
        tooltip: {
          callbacks: {
            afterLabel: (context) => {
              // Use displayed measurements ref for correct index after filtering
              const measurement = displayedMeasurementsRef.current[context.dataIndex];
              return measurement?.isVerified ? 'Official' : 'Self-entered';
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
            text: 'Value',
          },
        },
      },
    }),
    [] // Static options - tooltip uses ref for measurement lookup
  );

  // Loading state
  if (isLoading) {
    return (
      <div data-testid="chart-loading-skeleton" className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Mixed metrics warning
  if (hasMixedMetrics) {
    return (
      <div
        data-testid="measurement-progress-chart"
        className="flex flex-col items-center justify-center py-12 text-center"
      >
        <AlertCircle className="h-12 w-12 text-amber-500 mb-4" />
        <p className="text-gray-600">
          Please select a single metric to view the progress chart.
        </p>
      </div>
    );
  }

  // Empty state
  if (measurements.length === 0 || !chartData) {
    return (
      <div
        data-testid="measurement-progress-chart"
        className="flex flex-col items-center justify-center py-12 text-center"
      >
        <p className="text-gray-500">No measurements to display.</p>
      </div>
    );
  }

  return (
    <div data-testid="measurement-progress-chart" className="space-y-4">
      {/* Toggle for Best/All - only show if controlled externally */}
      {onShowBestOnlyChange && (
        <div className="flex items-center gap-4">
          <span id="chart-filter-label" className="text-sm font-medium text-gray-700">Show:</span>
          <RadioGroup
            aria-labelledby="chart-filter-label"
            value={showBestOnly ? 'best' : 'all'}
            onValueChange={(value) => onShowBestOnlyChange(value === 'best')}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="best" id="show-best" />
              <Label htmlFor="show-best" className="text-sm cursor-pointer">
                Best per date
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="all" id="show-all" />
              <Label htmlFor="show-all" className="text-sm cursor-pointer">
                All entries
              </Label>
            </div>
          </RadioGroup>
        </div>
      )}

      {/* Chart */}
      <div className="h-80">
        <Line data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}

export default MeasurementProgressChart;
