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
 * Now handles BOTH best and trends data to create comprehensive reports
 */
export function transformAnalyticsToReportData(
  bestResponse: AnalyticsResponse,
  trendsResponse: AnalyticsResponse,
  availableMetrics: string[],
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
  const { data: bestData, statistics: bestStatistics } = bestResponse;
  const { data: trendsData, trends: trendsTimeSeries } = trendsResponse;

  // Extract unique athletes from both best and trends data
  const athleteMap = new Map();
  const processAthletes = (data: any[]) => {
    data.forEach((point) => {
      if (!athleteMap.has(point.athleteId)) {
        athleteMap.set(point.athleteId, {
          id: point.athleteId,
          name: point.athleteName,
          team: point.teamName,
        });
      }
    });
  };
  processAthletes(bestData);
  processAthletes(trendsData);

  const athletes = Array.from(athleteMap.values());

  // Generate sections based on configuration
  const sections: ReportSection[] = [];

  // 1. Statistics Section (from best performances)
  if (config.displayOptions.includeStatistics && bestStatistics) {
    sections.push(createStatisticsSection(bestStatistics, availableMetrics));
  }

  // 2. Generate chart sections for BEST performances
  config.charts.forEach((chartConfig) => {
    // Skip trends-only charts for best section
    if (chartConfig.title.toLowerCase().includes("over time") ||
        chartConfig.title.toLowerCase().includes("progress") ||
        chartConfig.title.toLowerCase().includes("evolution")) {
      return;
    }

    const chartSection = createChartSection(
      chartConfig,
      bestResponse,
      "best",
      availableMetrics
    );
    if (chartSection) {
      sections.push(chartSection);
    }
  });

  // 3. Generate chart sections for TRENDS over time (if data exists)
  if (trendsData && trendsData.length > 0) {
    config.charts.forEach((chartConfig) => {
      // Only include trend charts
      if (!chartConfig.title.toLowerCase().includes("over time") &&
          !chartConfig.title.toLowerCase().includes("progress") &&
          !chartConfig.title.toLowerCase().includes("evolution") &&
          chartConfig.type !== "connected_scatter" &&
          chartConfig.type !== "multi_line" &&
          chartConfig.type !== "time_series_box_swarm") {
        return;
      }

      const chartSection = createChartSection(
        chartConfig,
        trendsResponse,
        "trends",
        availableMetrics
      );
      if (chartSection) {
        sections.push(chartSection);
      }
    });
  }

  // 4. Raw Data Table (if requested)
  if (config.displayOptions.showRawData) {
    sections.push(createRawDataSection(bestData, availableMetrics));
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
  availableMetrics: string[]
): ReportSection {
  const stats = availableMetrics.map((metric) => {
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
    title: "Performance Statistics (Best Performances)",
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
  timeframeType: "best" | "trends",
  availableMetrics: string[]
): ReportSection | null {
  const { type, title, metrics: chartMetrics } = chartConfig;
  const { trends, multiMetric, data, statistics } = analyticsResponse;

  // If chartMetrics includes "ALL_AVAILABLE", replace with actual available metrics
  let metricsToUse = chartMetrics;
  if (chartMetrics.includes("ALL_AVAILABLE")) {
    metricsToUse = availableMetrics;
  }

  // Filter to only metrics that have data
  metricsToUse = metricsToUse.filter(m => availableMetrics.includes(m));

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
          metric: metricsToUse[0],
        };
      }
      break;

    case "radar":
      // Use multi-metric data for radar charts (or best data if multiMetric unavailable)
      if (multiMetric && multiMetric.length > 0) {
        chartData = {
          data: multiMetric.filter((d: any) => metricsToUse.includes(d.metric)),
          config: {
            type,
            title,
            showLegend: true,
            showTooltips: true,
            responsive: true,
          },
          metrics: metricsToUse,
        };
      } else if (data && data.length > 0) {
        // Fallback to regular data for radar if multiMetric is not available
        chartData = {
          data: data.filter((d: any) => metricsToUse.includes(d.metric)),
          config: {
            type,
            title,
            showLegend: true,
            showTooltips: true,
            responsive: true,
          },
          metrics: metricsToUse,
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
          metric: metricsToUse[0],
        };
      }
      break;

    case "bar":
      // Use statistics for bar charts
      if (statistics) {
        const barData = metricsToUse
          .filter(metric => statistics[metric]) // Only include metrics with stats
          .map((metric) => ({
            metric: formatMetricName(metric),
            value: statistics[metric]?.mean || 0,
          }));

        if (barData.length === 0) return null; // No data for chart

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

  if (!chartData || !data || data.length === 0) return null;

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
  availableMetrics: string[]
): ReportSection {
  const headers = ["Athlete", "Date", "Metric", "Value", "Team"];
  const rows = data
    .filter((point) => availableMetrics.includes(point.metric))
    .slice(0, 50)
    .map((point) => [
      point.athleteName,
      new Date(point.date).toLocaleDateString(),
      formatMetricName(point.metric),
      point.value.toFixed(2),
      point.teamName || "N/A",
    ]);

  return {
    type: "table",
    title: "Performance Data (Best Performances)",
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