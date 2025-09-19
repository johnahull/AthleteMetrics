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
      console.log('📈 No chart data available for trends generation');
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
      console.log(`📈 No data found for metric: ${metric}`);
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

    console.log(`📈 Generated ${trends.length} trend series for ${trends.reduce((sum, t) => sum + t.data.length, 0)} data points`);

    return trends;
  }

  async getAnalyticsData(request: AnalyticsRequest): Promise<AnalyticsResponse> {
    try {
      // Validate request
      const validation = validateAnalyticsFilters(request.filters);
      if (!validation.isValid) {
        throw new Error(`Invalid filters: ${validation.errors.join(', ')}`);
      }

      console.log('🔍 Analytics request received:', {
        analysisType: request.analysisType,
        metrics: request.metrics,
        timeframe: request.timeframe,
        filters: {
          teams: request.filters.teams,
          genders: request.filters.genders,
          birthYears: request.filters.birthYears,
          organizationId: request.filters.organizationId
        }
      });

      // Calculate date range using utility function
      const { startDate, endDate } = calculateDateRange(
        request.timeframe.period,
        request.timeframe.startDate,
        request.timeframe.endDate
      );

      console.log('📅 Calculated date range:', { 
        startDate: startDate?.toISOString(), 
        endDate: endDate.toISOString(),
        period: request.timeframe.period 
      });

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
        console.log('🏀 Team filtering requested for teams:', request.filters.teams);
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

      // Add birth year filtering if specified
      if (request.filters.birthYears && request.filters.birthYears.length > 0) {
        const birthYearConditions = request.filters.birthYears.map(year =>
          sql`EXTRACT(YEAR FROM ${users.birthDate}) = ${year}`
        );
        whereConditions.push(sql`(${sql.join(birthYearConditions, sql` OR `)})`);
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

      console.log('📊 Query results:', {
        totalRows: data.length,
        uniqueAthletes: new Set(data.map((row: QueryResult) => row.athleteId)).size,
        metrics: [...new Set(data.map((row: QueryResult) => row.metric))],
        teams: [...new Set(data.map((row: QueryResult) => row.teamName).filter(Boolean))],
        teamIds: [...new Set(data.map((row: QueryResult) => row.teamId).filter(Boolean))],
        dateRange: data.length > 0 ? {
          earliest: data.reduce((min: string, row: QueryResult) => row.date < min ? row.date : min, data[0].date),
          latest: data.reduce((max: string, row: QueryResult) => row.date > max ? row.date : max, data[0].date)
        } : null,
        sampleRows: data.slice(0, 3).map((row: QueryResult) => ({
          athlete: row.athleteName,
          teamId: row.teamId,
          teamName: row.teamName,
          metric: row.metric,
          value: row.value
        }))
      });

      // Transform to chart data format
      let chartData: ChartDataPoint[] = data.map((row: QueryResult) => ({
        athleteId: row.athleteId,
        athleteName: row.athleteName || 'Unknown',
        value: typeof row.value === 'string' ? parseFloat(row.value) : (row.value || 0),
        date: new Date(row.date),
        metric: row.metric,
        teamName: row.teamName || 'No Team'
      }));

      // Apply filtering based on timeframe type
      if (request.timeframe.type === 'best') {
        console.log('📊 Filtering to best measurements per athlete');
        const originalCount = chartData.length;
        chartData = filterToBestMeasurements(chartData);
        console.log(`📊 Filtered from ${originalCount} to ${chartData.length} measurements (best per athlete)`);
      } else if (request.timeframe.type === 'trends') {
        console.log('📈 Filtering to best measurements per athlete per date');
        const originalCount = chartData.length;
        chartData = filterToBestMeasurementsPerDate(chartData);
        console.log(`📈 Filtered from ${originalCount} to ${chartData.length} measurements (best per athlete per date)`);
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
        console.log(`🔍 Server statistics calculation for ${metric}:`, {
          valueCount: values.length,
          sampleValues: values.slice(0, 5),
          valueTypes: values.slice(0, 5).map(v => typeof v),
          allValuesValid: values.every(v => typeof v === 'number' && !isNaN(v) && isFinite(v))
        });
        statistics[metric] = calculateStatistics(values);
        console.log(`📊 Server calculated statistics for ${metric}:`, statistics[metric]);
      }

      // Generate trends data if timeframe type is trends
      const trends = request.timeframe.type === 'trends'
        ? this.generateTrendsData(chartData, request.metrics.primary)
        : [];

      // Calculate total metric count (primary + additional)
      const metricCount = 1 + (request.metrics.additional?.length || 0);

      // Generate dynamic chart recommendations
      const recommendedCharts = this.getRecommendedChartTypes(
        request.analysisType,
        metricCount,
        request.timeframe.type
      );

      return {
        data: chartData,
        trends,
        multiMetric: [],
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
}