import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { 
  ChartDataPoint, 
  ChartConfiguration, 
  StatisticalSummary 
} from '@shared/analytics-types';
import { METRIC_CONFIG } from '@shared/analytics-types';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface DistributionChartProps {
  data: ChartDataPoint[];
  config: ChartConfiguration;
  statistics?: Record<string, StatisticalSummary>;
  highlightAthlete?: string;
}

export function DistributionChart({ 
  data, 
  config, 
  statistics, 
  highlightAthlete 
}: DistributionChartProps) {
  // Transform data for histogram visualization
  const distributionData = useMemo(() => {
    if (!data || data.length === 0) return null;

    // Get metrics from actual data (like BoxPlotChart does)
    const availableMetrics = Array.from(new Set(data.map(d => d.metric)));
    const primaryMetric = availableMetrics[0];

    if (!primaryMetric) return null;

    const metricData = data.filter(d => d.metric === primaryMetric);
    // Convert values to numbers to handle string values
    const values = metricData.map(d => typeof d.value === 'string' ? parseFloat(d.value) : d.value).filter(v => !isNaN(v));
    
    if (values.length === 0) return null;

    // Calculate histogram bins
    const binCount = Math.min(Math.ceil(Math.sqrt(values.length)), 20);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binWidth = (max - min) / binCount;

    const bins = Array.from({ length: binCount }, (_, i) => ({
      min: min + i * binWidth,
      max: min + (i + 1) * binWidth,
      count: 0,
      athletes: [] as string[]
    }));

    // Populate bins
    values.forEach((value, index) => {
      const binIndex = Math.min(Math.floor((value - min) / binWidth), binCount - 1);
      bins[binIndex].count++;
      bins[binIndex].athletes.push(metricData[index].athleteName);
    });

    // Create chart data
    const labels = bins.map(bin => 
      `${bin.min.toFixed(2)} - ${bin.max.toFixed(2)}`
    );

    const unit = METRIC_CONFIG[primaryMetric as keyof typeof METRIC_CONFIG]?.unit || '';
    
    const datasets = [{
      label: `${METRIC_CONFIG[primaryMetric as keyof typeof METRIC_CONFIG]?.label || primaryMetric} Distribution`,
      data: bins.map(bin => bin.count),
      backgroundColor: 'rgba(59, 130, 246, 0.6)',
      borderColor: 'rgba(59, 130, 246, 1)',
      borderWidth: 1
    }];

    // Highlight athlete's bin if specified
    if (highlightAthlete) {
      const athleteData = metricData.find(d => d.athleteId === highlightAthlete);
      if (athleteData) {
        // Convert value to number to handle string values
        const numericValue = typeof athleteData.value === 'string' ? parseFloat(athleteData.value) : athleteData.value;
        const athleteBinIndex = Math.min(
          Math.floor((numericValue - min) / binWidth),
          binCount - 1
        );
        
        // Create overlay dataset for highlighted bin
        const highlightData = bins.map((_, index) => 
          index === athleteBinIndex ? bins[index].count : 0
        );
        
        datasets.push({
          label: `${athleteData.athleteName}`,
          data: highlightData,
          backgroundColor: 'rgba(16, 185, 129, 0.8)',
          borderColor: 'rgba(16, 185, 129, 1)',
          borderWidth: 2
        });
      }
    }

    // Simple fallback: use server statistics if available, otherwise calculate from data
    let validatedStats = statistics?.[primaryMetric];

    // Use server stats if they exist and have a valid mean
    if (!validatedStats || typeof validatedStats.mean !== 'number' || isNaN(validatedStats.mean)) {
      console.log('🔧 DistributionChart: Calculating client-side stats for', primaryMetric);

      if (values.length > 0) {
        // Calculate statistics on client side as fallback
        const sortedValues = [...values].sort((a, b) => a - b);
        const count = sortedValues.length;
        const sum = sortedValues.reduce((acc, val) => acc + val, 0);
        const mean = sum / count;
        const min = Math.min(...sortedValues);
        const max = Math.max(...sortedValues);

        // Calculate median and std dev
        const median = count % 2 === 1
          ? sortedValues[Math.floor(count / 2)]
          : (sortedValues[count / 2 - 1] + sortedValues[count / 2]) / 2;

        console.log('📊 DistributionChart median calculation:', {
          primaryMetric,
          count,
          sortedValues: sortedValues.slice(0, 5),
          median,
          medianType: typeof median
        });
        const variance = sortedValues.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count;
        const std = Math.sqrt(variance);

        // Calculate percentiles (like the server does)
        const getPercentile = (p: number) => {
          const index = (p / 100) * (count - 1);
          const lower = Math.floor(index);
          const upper = Math.ceil(index);
          if (lower === upper) return sortedValues[lower];
          const weight = index - lower;
          return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
        };

        validatedStats = {
          count,
          mean,
          median,
          min,
          max,
          std,
          variance,
          percentiles: {
            p5: getPercentile(5),
            p10: getPercentile(10),
            p25: getPercentile(25),
            p50: median,
            p75: getPercentile(75),
            p90: getPercentile(90),
            p95: getPercentile(95)
          }
        };
      }
    }

    return {
      labels,
      datasets,
      binData: bins,
      unit,
      primaryMetric,
      validatedStats
    };
  }, [data, statistics, highlightAthlete]);

  // Chart options
  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        text: config.title,
        font: {
          size: 16,
          weight: 'bold'
        }
      },
      subtitle: {
        display: !!config.subtitle,
        text: config.subtitle
      },
      tooltip: {
        callbacks: {
          title: (context) => {
            const binIndex = context[0].dataIndex;
            const binData = distributionData?.binData[binIndex];
            return binData ? 
              `Range: ${binData.min.toFixed(2)} - ${binData.max.toFixed(2)}${distributionData?.unit}` : 
              '';
          },
          label: (context) => {
            return `Athletes: ${context.parsed.y}`;
          },
          afterLabel: (context) => {
            const binIndex = context.dataIndex;
            const binData = distributionData?.binData[binIndex];
            if (binData && binData.athletes.length > 0) {
              return binData.athletes.slice(0, 5).map(name => `• ${name}`);
            }
            return [];
          }
        }
      },
      legend: {
        display: config.showLegend,
        position: 'top' as const
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: `${distributionData?.primaryMetric ? 
            METRIC_CONFIG[distributionData.primaryMetric as keyof typeof METRIC_CONFIG]?.label : 
            'Value'} (${distributionData?.unit})`
        },
        ticks: {
          maxRotation: 45
        }
      },
      y: {
        title: {
          display: true,
          text: 'Number of Athletes'
        },
        beginAtZero: true,
        ticks: {
          stepSize: 1
        }
      }
    },
    elements: {
      bar: {
        borderRadius: 2
      }
    }
  };

  if (!distributionData) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No data available for distribution chart
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <Bar data={distributionData} options={options} />
      
      {/* Summary statistics */}
      {distributionData.validatedStats && (
        <div className="mt-4 grid grid-cols-4 gap-4 text-sm">
          <div className="text-center">
            <div className="font-medium">Mean</div>
            <div className="text-muted-foreground">
              {distributionData.validatedStats.mean?.toFixed(2) || 'N/A'}{distributionData.unit}
            </div>
          </div>
          <div className="text-center">
            <div className="font-medium">Median</div>
            <div className="text-muted-foreground">
              {distributionData.validatedStats.median?.toFixed(2) || 'N/A'}{distributionData.unit}
            </div>
          </div>
          <div className="text-center">
            <div className="font-medium">Std Dev</div>
            <div className="text-muted-foreground">
              {distributionData.validatedStats.std?.toFixed(2) || 'N/A'}{distributionData.unit}
            </div>
          </div>
          <div className="text-center">
            <div className="font-medium">Range</div>
            <div className="text-muted-foreground">
              {distributionData.validatedStats.min?.toFixed(2) || 'N/A'} - {distributionData.validatedStats.max?.toFixed(2) || 'N/A'}{distributionData.unit}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DistributionChart;