/**
 * Report Data Transformer
 * Transforms analytics data into report sections
 */

import type {
  AnalyticsResponse,
  TrendData,
  StatisticalSummary,
  MultiMetricData,
} from "@shared/analytics-types";
import type {
  ReportData,
  ReportSection,
  ReportTemplateConfig,
} from "@shared/report-types";

/**
 * Transform analytics response into report data structure
 */
export function transformAnalyticsToReportData(
  analyticsResponse: AnalyticsResponse,
  config: ReportTemplateConfig,
  reportMeta: {
    title: string;
    organizationName: string;
    generatedBy: string;
    generatedAt: string;
    dateRangeStart: string;
    dateRangeEnd: string;
  }
): ReportData {
  const { data, trends, multiMetric, statistics, meta } = analyticsResponse;

  // Extract unique athletes from data
  const athleteMap = new Map();
  data.forEach((point) => {
    if (!athleteMap.has(point.athleteId)) {
      athleteMap.set(point.athleteId, {
        id: point.athleteId,
        name: point.athleteName,
        team: point.teamName,
      });
    }
  });

  const athletes = Array.from(athleteMap.values());

  // Generate sections based on configuration
  const sections: ReportSection[] = [];

  // 1. Statistics Section
  if (config.displayOptions.includeStatistics && statistics) {
    sections.push(createStatisticsSection(statistics, config.metrics));
  }

  // 2. Chart Sections - one for each configured chart
  config.charts.forEach((chartConfig) => {
    const chartSection = createChartSection(
      chartConfig,
      analyticsResponse,
      config.timeframeType
    );
    if (chartSection) {
      sections.push(chartSection);
    }
  });

  // 3. Raw Data Table (if requested)
  if (config.displayOptions.showRawData) {
    sections.push(createRawDataSection(data, config.metrics));
  }

  return {
    meta: {
      title: reportMeta.title,
      organizationName: reportMeta.organizationName,
      generatedBy: reportMeta.generatedBy,
      generatedAt: reportMeta.generatedAt,
      dateRange: {
        start: reportMeta.dateRangeStart,
        end: reportMeta.dateRangeEnd,
      },
    },
    athletes,
    sections,
  };
}

/**
 * Create statistics section from analytics statistics
 */
function createStatisticsSection(
  statistics: Record<string, StatisticalSummary>,
  metrics: { primary: string; additional: string[] }
): ReportSection {
  const allMetrics = [metrics.primary, ...metrics.additional];

  const stats = allMetrics.map((metric) => {
    const stat = statistics[metric];
    if (!stat) return null;

    return {
      label: formatMetricName(metric),
      value: stat.mean.toFixed(2),
      unit: getMetricUnit(metric),
    };
  }).filter(Boolean);

  return {
    type: "statistics",
    title: "Performance Statistics",
    content: {
      stats,
      totalMeasurements: Object.values(statistics)[0]?.count || 0,
    },
  };
}

/**
 * Create chart section from analytics data
 */
function createChartSection(
  chartConfig: { type: string; title: string; metrics: string[] },
  analyticsResponse: AnalyticsResponse,
  timeframeType: "best" | "trends"
): ReportSection | null {
  const { type, title, metrics: chartMetrics } = chartConfig;
  const { trends, multiMetric, data, statistics } = analyticsResponse;

  let chartData: any = null;

  switch (type) {
    case "connected_scatter":
    case "multi_line":
    case "line":
      // Use trends data for time-series charts
      if (trends && trends.length > 0) {
        chartData = {
          data: trends,
          config: {
            type,
            title,
            showLegend: true,
            showTooltips: true,
            responsive: true,
          },
          selectedDates: [], // Can be populated if needed
          metric: chartMetrics[0],
        };
      }
      break;

    case "radar":
      // Use multi-metric data for radar charts
      if (multiMetric && multiMetric.length > 0) {
        chartData = {
          data: multiMetric,
          config: {
            type,
            title,
            showLegend: true,
            showTooltips: true,
            responsive: true,
          },
          metrics: chartMetrics,
        };
      }
      break;

    case "box_plot":
    case "swarm":
    case "distribution":
    case "box_swarm_combo":
    case "time_series_box_swarm":
      // Use raw data points for distribution charts
      if (data && data.length > 0) {
        chartData = {
          data,
          statistics,
          config: {
            type,
            title,
            showLegend: true,
            showTooltips: true,
            responsive: true,
          },
          metric: chartMetrics[0],
        };
      }
      break;

    case "bar":
      // Use statistics for bar charts
      if (statistics) {
        const barData = chartMetrics.map((metric) => ({
          metric: formatMetricName(metric),
          value: statistics[metric]?.mean || 0,
        }));
        chartData = {
          data: barData,
          config: {
            type,
            title,
            showLegend: false,
            showTooltips: true,
            responsive: true,
          },
        };
      }
      break;
  }

  if (!chartData) return null;

  return {
    type: "chart",
    title,
    content: { chartData },
  };
}

/**
 * Create raw data table section
 */
function createRawDataSection(
  data: any[],
  metrics: { primary: string; additional: string[] }
): ReportSection {
  const headers = ["Athlete", "Date", "Metric", "Value", "Team"];
  const rows = data.slice(0, 50).map((point) => [
    point.athleteName,
    new Date(point.date).toLocaleDateString(),
    formatMetricName(point.metric),
    point.value.toFixed(2),
    point.teamName || "N/A",
  ]);

  return {
    type: "table",
    title: "Performance Data",
    content: {
      headers,
      rows,
    },
  };
}

/**
 * Format metric name for display
 */
function formatMetricName(metric: string): string {
  const names: Record<string, string> = {
    FLY10_TIME: "10-Yard Fly Time",
    VERTICAL_JUMP: "Vertical Jump",
    AGILITY_505: "5-0-5 Agility",
    AGILITY_5105: "5-10-5 Agility",
    T_TEST: "T-Test",
    DASH_40YD: "40-Yard Dash",
    RSI: "Reactive Strength Index",
  };
  return names[metric] || metric;
}

/**
 * Get metric unit
 */
function getMetricUnit(metric: string): string {
  const units: Record<string, string> = {
    FLY10_TIME: "s",
    VERTICAL_JUMP: "in",
    AGILITY_505: "s",
    AGILITY_5105: "s",
    T_TEST: "s",
    DASH_40YD: "s",
    RSI: "",
  };
  return units[metric] || "";
}