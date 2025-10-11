/**
 * Simplified Analytics Service for initial testing
 */

import { eq, and, inArray, gte, lte, sql, exists } from "drizzle-orm";
import { db } from "./db";
import { measurements, users, userOrganizations, teams, userTeams } from "@shared/schema";
import type {
  AnalyticsRequest,
  AnalyticsResponse,
  AnalyticsFilters,
  ChartDataPoint,
  StatisticalSummary,
  TrendData,
  TrendDataPoint,
  MultiMetricData
} from "@shared/analytics-types";
import { METRIC_CONFIG } from "@shared/analytics-types";
import {
  calculateStatistics,
  filterToBestMeasurements,
  filterToBestMeasurementsPerDate,
  calculateDateRange,
  formatDateForDatabase,
  validateAnalyticsFilters,
  parseDecimalValue
} from "@shared/analytics-utils";
import DOMPurify from "isomorphic-dompurify";

// Type for the database query result
type QueryResult = {
  measurementId: string;
  athleteId: string;
  metric: string;
  value: string; // Stored as string in database, converted to number when needed
  date: string;
  teamId: string | null;
  athleteName: string;
  teamName: string | null;
  gender: string | null;
  birthYear: number;
};

/**
 * Sanitize string inputs to prevent XSS and ensure data integrity
 */
function sanitizeString(input: string | null | undefined): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Use DOMPurify to sanitize and trim whitespace
  const sanitized = DOMPurify.sanitize(input.trim());

  // Additional validation: ensure it's still a reasonable string
  if (sanitized.length === 0 || sanitized.length > 100) {
    return input === null ? 'Unknown' : 'Invalid Name';
  }

  return sanitized;
}


export class AnalyticsService {
  /**
   * Get recommended chart types based on analysis parameters
   */
  private getRecommendedChartTypes(
    analysisType: string,
    metricCount: number,
    timeframeType: string
  ): string[] {
    const baseCharts = [];

    if (analysisType === 'individual') {
      if (metricCount === 1) {
        if (timeframeType === 'best') {
          baseCharts.push('box_swarm_combo', 'distribution', 'bar_chart', 'violin_plot');
        } else {
          baseCharts.push('line_chart');
        }
      } else if (metricCount === 2) {
        if (timeframeType === 'best') {
          baseCharts.push('scatter_plot');
        } else {
          baseCharts.push('connected_scatter');
        }
      } else {
        if (timeframeType === 'best') {
          baseCharts.push('radar_chart');
        } else {
          baseCharts.push('multi_line', 'radar_chart');
        }
      }
    } else if (analysisType === 'intra_group') {
      // Intra-group analysis (single group comparison)
      if (metricCount === 1) {
        if (timeframeType === 'best') {
          baseCharts.push('box_swarm_combo', 'distribution', 'bar_chart', 'violin_plot');
        } else {
          baseCharts.push('time_series_box_swarm', 'line_chart');
        }
      } else if (metricCount === 2) {
        if (timeframeType === 'best') {
          baseCharts.push('scatter_plot');
        } else {
          baseCharts.push('connected_scatter');
        }
      } else {
        if (timeframeType === 'best') {
          baseCharts.push('radar_chart');
        } else {
          baseCharts.push('multi_line');
        }
      }
    } else {
      // Multi-group analysis
      if (metricCount === 1) {
        if (timeframeType === 'best') {
          // For multi-group analysis with 1 metric and best timeframe, exclude distribution and bar_chart
          baseCharts.push('box_swarm_combo', 'violin_plot');
        } else {
          baseCharts.push('time_series_box_swarm', 'line_chart');
        }
      } else if (metricCount === 2) {
        if (timeframeType === 'best') {
          baseCharts.push('scatter_plot');
        } else {
          baseCharts.push('connected_scatter');
        }
      } else {
        if (timeframeType === 'best') {
          baseCharts.push('radar_chart');
        } else {
          baseCharts.push('multi_line');
        }
      }
    }

    return baseCharts;
  }

  /**
   * Generate trends data from filtered chart data points
   */
  private generateTrendsData(chartData: ChartDataPoint[], metric: string): TrendData[] {
    // Early return if no data
    if (!chartData || chartData.length === 0) {
      return [];
    }

    // Group chart data by athlete
    const athleteGroups = chartData.reduce((groups, point) => {
      if (point.metric === metric) {
        if (!groups[point.athleteId]) {
          groups[point.athleteId] = {
            athleteId: point.athleteId,
            athleteName: point.athleteName,
            teamName: point.teamName,
            points: []
          };
        }
        groups[point.athleteId].points.push(point);
      }
      return groups;
    }, {} as Record<string, { athleteId: string; athleteName: string; teamName?: string; points: ChartDataPoint[] }>);

    // Early return if no athletes have data for this metric
    if (Object.keys(athleteGroups).length === 0) {
      return [];
    }

    // Calculate per-date group averages for comparison
    const dateGroupedData = chartData
      .filter(p => p.metric === metric)
      .reduce((acc, point) => {
        const date = point.date instanceof Date ? point.date : new Date(point.date);
        const dateStr = date.toISOString().split('T')[0];
        if (!acc[dateStr]) acc[dateStr] = [];
        acc[dateStr].push(point.value);
        return acc;
      }, {} as Record<string, number[]>);

    // Calculate average and median for each date
    const perDateStats = Object.entries(dateGroupedData).reduce((acc, [dateStr, values]) => {
      const stats = calculateStatistics(values);
      acc[dateStr] = stats;
      return acc;
    }, {} as Record<string, { mean: number; median: number }>);

    // Convert to TrendData format
    const trends: TrendData[] = Object.values(athleteGroups).map(group => {
      // Sort points by date
      const sortedPoints = group.points.sort((a, b) => a.date.getTime() - b.date.getTime());

      // Early return if no points for this athlete
      if (sortedPoints.length === 0) {
        return {
          athleteId: group.athleteId,
          athleteName: group.athleteName,
          metric: metric,
          teamName: group.teamName,
          data: []
        };
      }

      // Track personal bests for this athlete
      let personalBest = sortedPoints[0].value;
      const metricConfig = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
      const lowerIsBetter = metricConfig?.lowerIsBetter || false;

      const trendDataPoints: TrendDataPoint[] = sortedPoints.map((point, index) => {
        // First point is always a personal best, then check subsequent points
        let isPersonalBest = index === 0;
        if (index > 0) {
          if (lowerIsBetter) {
            if (point.value < personalBest) {
              personalBest = point.value;
              isPersonalBest = true;
            }
          } else {
            if (point.value > personalBest) {
              personalBest = point.value;
              isPersonalBest = true;
            }
          }
        }

        // Get per-date group statistics
        const date = point.date instanceof Date ? point.date : new Date(point.date);
        const dateStr = date.toISOString().split('T')[0];
        const dateStats = perDateStats[dateStr];

        return {
          date,
          value: point.value,
          isPersonalBest,
          groupAverage: dateStats?.mean || 0,
          groupMedian: dateStats?.median || 0
        };
      });

      return {
        athleteId: group.athleteId,
        athleteName: group.athleteName,
        metric: metric,
        teamName: group.teamName,
        data: trendDataPoints
      };
    });

    return trends;
  }

  /**
   * Generate trends data for all selected metrics
   */
  private generateTrendsDataForAllMetrics(chartData: ChartDataPoint[], metrics: string[]): TrendData[] {
    // Generate trends data for each metric and combine
    const allTrends: TrendData[] = [];

    for (const metric of metrics) {
      const metricTrends = this.generateTrendsData(chartData, metric);
      allTrends.push(...metricTrends);
    }

    return allTrends;
  }

  /**
   * Generate multi-metric data for radar charts from filtered chart data points
   */
  private generateMultiMetricData(chartData: ChartDataPoint[], metrics: string[]): MultiMetricData[] {
    // Early return if no data or less than 2 metrics
    if (!chartData || chartData.length === 0 || metrics.length < 2) {
      return [];
    }

    // Group chart data by athlete
    const athleteGroups = chartData.reduce((groups, point) => {
      if (metrics.includes(point.metric)) {
        if (!groups[point.athleteId]) {
          groups[point.athleteId] = {
            athleteId: point.athleteId,
            athleteName: point.athleteName,
            teamName: point.teamName,
            measurements: {}
          };
        }

        // Store the best value for each metric per athlete
        const currentBest = groups[point.athleteId].measurements[point.metric];
        const metricConfig = METRIC_CONFIG[point.metric as keyof typeof METRIC_CONFIG];
        const lowerIsBetter = metricConfig?.lowerIsBetter || false;

        if (!currentBest ||
            (lowerIsBetter && point.value < currentBest) ||
            (!lowerIsBetter && point.value > currentBest)) {
          groups[point.athleteId].measurements[point.metric] = point.value;
        }
      }
      return groups;
    }, {} as Record<string, {
      athleteId: string;
      athleteName: string;
      teamName?: string;
      measurements: Record<string, number>
    }>);

    // Filter to only include athletes who have data for all metrics
    const completeAthletes = Object.values(athleteGroups).filter(athlete =>
      metrics.every(metric => athlete.measurements[metric] !== undefined)
    );

    // Debug logging
    console.log(`MultiMetric Debug: Total athletes with some data: ${Object.keys(athleteGroups).length}`);
    console.log(`MultiMetric Debug: Athletes with complete data for all ${metrics.length} metrics: ${completeAthletes.length}`);
    console.log('MultiMetric Debug: Required metrics:', metrics);

    if (completeAthletes.length === 0) {
      console.log('MultiMetric Debug: No athletes have complete data for all metrics');
      return [];
    }

    // Calculate percentile ranks for each metric
    const metricPercentiles: Record<string, Record<string, number>> = {};

    metrics.forEach(metric => {
      const values = completeAthletes.map(athlete => athlete.measurements[metric]);
      const sortedValues = [...values].sort((a, b) => a - b);

      metricPercentiles[metric] = {};
      completeAthletes.forEach(athlete => {
        const value = athlete.measurements[metric];
        const rank = sortedValues.findIndex(v => v === value);
        // Handle edge case where there's only one athlete
        const percentile = sortedValues.length === 1 ? 50 : (rank / (sortedValues.length - 1)) * 100;
        metricPercentiles[metric][athlete.athleteId] = percentile;
      });
    });

    // Convert to MultiMetricData format
    const multiMetricData: MultiMetricData[] = completeAthletes.map(athlete => ({
      athleteId: athlete.athleteId,
      athleteName: athlete.athleteName,
      metrics: athlete.measurements,
      percentileRanks: Object.fromEntries(
        metrics.map(metric => [metric, metricPercentiles[metric][athlete.athleteId]])
      )
    }));

    return multiMetricData;
  }

  /**
   * Get count of measurements per metric for given filters
   * Used to show data availability in metric selector
   */
  async getMetricsAvailability(filters: AnalyticsFilters): Promise<Record<string, number>> {
    const conditions = [
      eq(measurements.isVerified, true),
      eq(userOrganizations.organizationId, filters.organizationId)
    ];

    // Apply team filter - filter by athlete team membership
    if (filters.teams && filters.teams.length > 0) {
      conditions.push(
        exists(
          db.select().from(userTeams)
            .where(
              and(
                eq(userTeams.userId, users.id),
                inArray(userTeams.teamId, filters.teams),
                eq(userTeams.isActive, true)
              )
            )
        )
      );
    }

    // Apply athlete filter
    if (filters.athleteIds && filters.athleteIds.length > 0) {
      conditions.push(inArray(measurements.userId, filters.athleteIds));
    }

    // Note: No date range filter in AnalyticsFilters interface
    // Date filtering is handled by timeframe configuration in the query layer

    // Query measurement counts per metric
    const results = await db
      .select({
        metric: measurements.metric,
        count: sql<number>`count(*)::int`
      })
      .from(measurements)
      .innerJoin(users, eq(measurements.userId, users.id))
      .innerJoin(userOrganizations, eq(users.id, userOrganizations.userId))
      .where(and(...conditions))
      .groupBy(measurements.metric);

    // Convert to Record<string, number>
    const metricsAvailability: Record<string, number> = {};

    // Initialize all metrics to 0
    Object.keys(METRIC_CONFIG).forEach(metric => {
      metricsAvailability[metric] = 0;
    });

    // Fill in actual counts
    results.forEach((row: { metric: string; count: number }) => {
      metricsAvailability[row.metric] = row.count;
    });

    return metricsAvailability;
  }

  async getAnalyticsData(request: AnalyticsRequest): Promise<AnalyticsResponse> {
    try {
      // Validate request
      const validation = validateAnalyticsFilters(request.filters);
      if (!validation.isValid) {
        throw new Error(`Invalid filters: ${validation.errors.join(', ')}`);
      }

      // Analytics request validation completed

      // Calculate date range using utility function
      const { startDate, endDate } = calculateDateRange(
        request.timeframe.period,
        request.timeframe.startDate,
        request.timeframe.endDate
      );

      // Date range calculated for analytics query

      // Build list of all metrics to query
      const allMetrics = [request.metrics.primary];
      if (request.metrics.additional && request.metrics.additional.length > 0) {
        allMetrics.push(...request.metrics.additional);
      }

      // Build where conditions
      const whereConditions = [
        eq(measurements.isVerified, true),
        eq(userOrganizations.organizationId, request.filters.organizationId),
        inArray(measurements.metric, allMetrics),
      ];

      // Add team filtering if specified - filter by athlete team membership
      if (request.filters.teams && request.filters.teams.length > 0) {
        // Filter to only include measurements from athletes who belong to the selected teams
        // This narrows down the comparison group, regardless of individual athlete being analyzed
        whereConditions.push(
          exists(
            db.select().from(userTeams)
              .where(
                and(
                  eq(userTeams.userId, users.id),
                  inArray(userTeams.teamId, request.filters.teams),
                  eq(userTeams.isActive, true)
                )
              )
          )
        );
      }

      // Add gender filtering if specified
      if (request.filters.genders && request.filters.genders.length > 0) {
        whereConditions.push(inArray(users.gender, request.filters.genders));
      }

      // Add birth year range filtering if specified
      if (request.filters.birthYearFrom) {
        whereConditions.push(sql`EXTRACT(YEAR FROM ${users.birthDate}) >= ${request.filters.birthYearFrom}`);
      }
      if (request.filters.birthYearTo) {
        whereConditions.push(sql`EXTRACT(YEAR FROM ${users.birthDate}) <= ${request.filters.birthYearTo}`);
      }

      // Add date range filtering if specified
      if (startDate) {
        whereConditions.push(gte(measurements.date, formatDateForDatabase(startDate)));
      }
      whereConditions.push(lte(measurements.date, formatDateForDatabase(endDate)));

      // Query to get basic data
      const data: QueryResult[] = await db
        .select({
          measurementId: measurements.id,
          athleteId: measurements.userId,
          metric: measurements.metric,
          value: measurements.value,
          date: measurements.date,
          teamId: measurements.teamId,
          athleteName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
          teamName: teams.name,
          gender: users.gender,
          birthYear: sql<number>`EXTRACT(YEAR FROM ${users.birthDate})`
        })
        .from(measurements)
        .innerJoin(users, eq(measurements.userId, users.id))
        .innerJoin(userOrganizations, eq(users.id, userOrganizations.userId))
        .leftJoin(teams, eq(measurements.teamId, teams.id))
        .where(and(...whereConditions))
        .limit(10000); // Increased limit with proper safeguards

      // Database query completed, processing results
      
      // Transform to chart data format with input sanitization
      let chartData: ChartDataPoint[] = data.map((row: QueryResult) => ({
        athleteId: row.athleteId,
        athleteName: sanitizeString(row.athleteName) || 'Unknown',
        // Use type-safe helper for decimal value conversion
        value: parseDecimalValue(row.value || 0),
        date: new Date(row.date),
        metric: row.metric,
        teamName: sanitizeString(row.teamName) || 'No Team'
      }));

      // Apply filtering based on timeframe type
      if (request.timeframe.type === 'best') {
        chartData = filterToBestMeasurements(chartData);
      } else if (request.timeframe.type === 'trends') {
        chartData = filterToBestMeasurementsPerDate(chartData);
      }

      // Robust statistics calculation using utility functions
      const statistics: Record<string, StatisticalSummary> = {};
      const metricGroups = chartData.reduce((groups, point) => {
        if (!groups[point.metric]) {
          groups[point.metric] = [];
        }
        // Ensure value is a number before adding to statistics
        const numValue = typeof point.value === 'string' ? parseFloat(point.value) : point.value;
        if (!isNaN(numValue) && isFinite(numValue)) {
          groups[point.metric].push(numValue);
        }
        return groups;
      }, {} as Record<string, number[]>);

      for (const [metric, values] of Object.entries(metricGroups)) {
        statistics[metric] = calculateStatistics(values);
      }

      // Calculate total metric count (primary + additional) and prepare metrics list
      const metricCount = 1 + (request.metrics.additional?.length || 0);
      const allSelectedMetrics = [request.metrics.primary, ...(request.metrics.additional || [])];

      // Generate trends data if timeframe type is 'trends'
      const trends: TrendData[] = [];
      if (request.timeframe?.type === 'trends' && chartData.length > 0) {
        // Use the generateTrendsDataForAllMetrics method instead of inline logic
        const generatedTrends = this.generateTrendsDataForAllMetrics(chartData, allSelectedMetrics);
        trends.push(...generatedTrends);
        
        console.log(`Trends Debug: Generated ${trends.length} trend series for ${allSelectedMetrics.length} metrics`);
      }

      // Generate multi-metric data for radar charts when multiple metrics are selected
      // Generate multiMetric data when we have 2+ metrics (not just 3+) to support radar charts
      const shouldGenerateMultiMetric = metricCount >= 2;
      const multiMetric = shouldGenerateMultiMetric
        ? this.generateMultiMetricData(chartData, allSelectedMetrics)
        : [];

      console.log(`Analytics Debug: metricCount=${metricCount}, allSelectedMetrics=${JSON.stringify(allSelectedMetrics)}, shouldGenerateMultiMetric=${shouldGenerateMultiMetric}, multiMetric.length=${multiMetric.length}`);

      // Generate dynamic chart recommendations
      const recommendedCharts = this.getRecommendedChartTypes(
        request.analysisType,
        metricCount,
        request.timeframe.type
      );

      console.log('Analytics recommendations:', {
        analysisType: request.analysisType,
        metricCount,
        timeframeType: request.timeframe.type,
        recommendedCharts,
        dataLength: chartData.length,
        trendsLength: trends.length,
        multiMetricLength: multiMetric.length
      });

      // Get metrics availability for metric selector
      // Note: We don't pass date range here because we want to show ALL available data
      // regardless of the current timeframe selection
      let metricsAvailability: Record<string, number> = {};
      let metricsAvailabilityError = false;
      try {
        // Create filters object without date range to show all available data
        const availabilityFilters: AnalyticsFilters = {
          organizationId: request.filters.organizationId,
          teams: request.filters.teams,
          athleteIds: request.filters.athleteIds
          // Intentionally omit dateRange to show all available data
        };
        metricsAvailability = await this.getMetricsAvailability(availabilityFilters);
      } catch (error) {
        console.error('ERROR in getMetricsAvailability:', error);
        metricsAvailabilityError = true;
        // Initialize with zeros if there's an error
        Object.keys(METRIC_CONFIG).forEach(metric => {
          metricsAvailability[metric] = 0;
        });
      }

      // Calculate max count for client-side normalization
      const counts = Object.values(metricsAvailability);
      const maxMetricCount = counts.length > 0 ? Math.max(...counts) : 0;

      return {
        data: chartData,
        trends,
        multiMetric,
        statistics,
        groupings: {},
        meta: {
          totalAthletes: new Set(chartData.map(d => d.athleteId)).size,
          totalMeasurements: chartData.length,
          dateRange: {
            start: chartData.length > 0
              ? new Date(Math.min(...chartData.map(d => d.date.getTime())))
              : startDate || new Date(),
            end: chartData.length > 0
              ? new Date(Math.max(...chartData.map(d => d.date.getTime())))
              : endDate || new Date()
          },
          appliedFilters: request.filters,
          recommendedCharts: recommendedCharts as any
        },
        metricsAvailability,
        maxMetricCount,
        metricsAvailabilityError
      };
    } catch (error) {
      console.error('Analytics service error:', error);
      throw error;
    }
  }
}