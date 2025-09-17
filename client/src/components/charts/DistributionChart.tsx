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

    // Focus on primary metric for distribution
    const metrics = Object.keys(statistics || {});
    const primaryMetric = metrics[0];
    
    if (!primaryMetric) return null;

    const metricData = data.filter(d => d.metric === primaryMetric);
    const values = metricData.map(d => d.value);
    
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
        const athleteBinIndex = Math.min(
          Math.floor((athleteData.value - min) / binWidth), 
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

    return {
      labels,
      datasets,
      binData: bins,
      unit,
      primaryMetric
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
      {statistics && distributionData.primaryMetric && statistics[distributionData.primaryMetric] && (
        <div className="mt-4 grid grid-cols-4 gap-4 text-sm">
          <div className="text-center">
            <div className="font-medium">Mean</div>
            <div className="text-muted-foreground">
              {statistics[distributionData.primaryMetric].mean.toFixed(2)}{distributionData.unit}
            </div>
          </div>
          <div className="text-center">
            <div className="font-medium">Median</div>
            <div className="text-muted-foreground">
              {statistics[distributionData.primaryMetric].median.toFixed(2)}{distributionData.unit}
            </div>
          </div>
          <div className="text-center">
            <div className="font-medium">Std Dev</div>
            <div className="text-muted-foreground">
              {statistics[distributionData.primaryMetric].std.toFixed(2)}{distributionData.unit}
            </div>
          </div>
          <div className="text-center">
            <div className="font-medium">Range</div>
            <div className="text-muted-foreground">
              {statistics[distributionData.primaryMetric].min.toFixed(2)} - {statistics[distributionData.primaryMetric].max.toFixed(2)}{distributionData.unit}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DistributionChart;