/**
 * Simplified Analytics Service for initial testing
 */

import { eq, and, inArray, gte, lte, sql, exists } from "drizzle-orm";
import { db } from "./db";
import { measurements, users, userOrganizations, teams, userTeams } from "@shared/schema";
import type {
  AnalyticsRequest,
  AnalyticsResponse,
  ChartDataPoint,
  StatisticalSummary,
  TrendData,
  TrendDataPoint
} from "@shared/analytics-types";
import { METRIC_CONFIG } from "@shared/analytics-types";
import {
  calculateStatistics,
  filterToBestMeasurements,
  filterToBestMeasurementsPerDate,
  calculateDateRange,
  formatDateForDatabase,
  validateAnalyticsFilters
} from "@shared/analytics-utils";
import DOMPurify from "isomorphic-dompurify";

// Type for the database query result
type QueryResult = {
  measurementId: string;
  athleteId: string;
  metric: string;
  value: number;
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
          baseCharts.push('box_swarm_combo', 'distribution', 'bar_chart');
        } else {
          baseCharts.push('line_chart');
        }
      } else if (metricCount === 2) {
        if (timeframeType === 'best') {
          baseCharts.push('scatter_plot');
        } else {
          baseCharts.push('connected_scatter', 'multi_line');
        }
      } else {
        if (timeframeType === 'best') {
          baseCharts.push('radar_chart', 'bar_chart');
        } else {
          baseCharts.push('multi_line', 'radar_chart');
        }
      }
    } else {
      // Group analysis
      if (metricCount === 1) {
        if (timeframeType === 'best') {
          // For intra-group analysis with 1 metric and best timeframe, use same charts as individual
          baseCharts.push('box_swarm_combo', 'distribution', 'bar_chart');
        } else {
          baseCharts.push('time_series_box_swarm', 'line_chart');
        }
      } else if (metricCount === 2) {
        baseCharts.push('scatter_plot', 'connected_scatter');
      } else {
        baseCharts.push('radar_chart', 'multi_line');
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
        eq(measurements.isVerified, "true"),
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
                  eq(userTeams.isActive, "true")
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
        value: typeof row.value === 'string' ? parseFloat(row.value) : (row.value || 0),
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

      // Generate trends data if timeframe type is trends
      let trends: TrendData[] = [];
      if (request.timeframe.type === 'trends') {
        // Check what metrics actually exist in the chart data
        const availableMetrics = Array.from(new Set(chartData.map(point => point.metric)));

        // Generate trends for all metrics (primary + additional)
        for (const metric of allMetrics) {
          const metricTrends = this.generateTrendsData(chartData, metric);
          trends.push(...metricTrends);
        }
      }

      // Calculate total metric count (primary + additional)
      const metricCount = 1 + (request.metrics.additional?.length || 0);

      // Generate dynamic chart recommendations
      const recommendedCharts = this.getRecommendedChartTypes(
        request.analysisType,
        metricCount,
        request.timeframe.type
      );

      // Generate multiMetric data for radar charts when multiple metrics are selected
      const multiMetric = request.metrics.additional.length > 0 
        ? this.generateMultiMetricData(chartData, request.metrics)
        : [];

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
        }
      };
    } catch (error) {
      console.error('Analytics service error:', error);
      throw error;
    }
  }

  /**
   * Generate multi-metric data for radar charts
   */
  private generateMultiMetricData(data: ChartDataPoint[], metrics: any): any[] {
    const allMetrics = [metrics.primary, ...metrics.additional];
    const multiMetricData: any[] = [];


    // Group by athlete
    const athleteGroups: Record<string, ChartDataPoint[]> = {};
    for (const point of data) {
      if (!athleteGroups[point.athleteId]) {
        athleteGroups[point.athleteId] = [];
      }
      athleteGroups[point.athleteId].push(point);
    }


    for (const [athleteId, points] of Object.entries(athleteGroups)) {
      const athleteName = points[0].athleteName;
      const athleteMetrics: Record<string, number> = {};
      const percentileRanks: Record<string, number> = {};

      // Get best value for each metric
      for (const metric of allMetrics) {
        const metricPoints = points.filter(p => p.metric === metric);
        if (metricPoints.length > 0) {
          const metricConfig = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
          const values = metricPoints.map(p => p.value);

          athleteMetrics[metric] = metricConfig?.lowerIsBetter
            ? Math.min(...values)
            : Math.max(...values);
          
          // Calculate percentile rank within group
          const allMetricValues = data
            .filter(d => d.metric === metric)
            .map(d => d.value)
            .sort((a, b) => a - b);
          
          percentileRanks[metric] = this.calculatePercentileRank(
            athleteMetrics[metric], 
            allMetricValues
          );
        }
      }

      // Include athlete if they have data for at least 2 metrics
      const hasMinimumMetrics = Object.keys(athleteMetrics).length >= 2;
      
      if (hasMinimumMetrics) {
        multiMetricData.push({
          athleteId,
          athleteName,
          metrics: athleteMetrics,
          percentileRanks
        });
      }
    }

    return multiMetricData;
  }

  /**
   * Calculate percentile rank for a value within a sorted array
   */
  private calculatePercentileRank(value: number, sortedValues: number[]): number {
    if (sortedValues.length === 0) return 0;
    
    let rank = 0;
    for (const val of sortedValues) {
      if (val < value) rank++;
    }
    
    return (rank / sortedValues.length) * 100;
  }
}