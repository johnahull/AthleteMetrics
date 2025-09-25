/**
 * Advanced Analytics Service
 * Handles complex data aggregation and statistical analysis for charts
 */

import { eq, sql, and, gte, lte, inArray, desc, asc } from "drizzle-orm";
import { db } from "./db";
import { measurements, users, teams, userTeams, userOrganizations } from "@shared/schema";
import type {
  AnalyticsRequest,
  AnalyticsResponse,
  AnalyticsFilters,
  ChartDataPoint,
  StatisticalSummary,
  TrendData,
  TrendDataPoint,
  MultiMetricData,
  TimeframeConfig,
  MetricSelection,
  ChartType
} from "@shared/analytics-types";
import { METRIC_CONFIG } from "@shared/analytics-types";

// Type for the database query result from buildBaseQuery
type QueryResult = {
  measurementId: string;
  athleteId: string;
  metric: string;
  value: number;
  date: string;
  teamId: string | null;
  season: string | null;
  athleteName: string;
  teamName: string | null;
  birthDate: string | null;
  gender: string | null;
  school: string | null;
};

export class AnalyticsService {
  /**
   * Main analytics query builder
   */
  async getAnalyticsData(request: AnalyticsRequest): Promise<AnalyticsResponse> {
    const { analysisType, filters, metrics, timeframe, athleteId } = request;
    console.log('ANALYTICS DEBUG: Starting getAnalyticsData with metrics:', metrics);

    // Build base query with filters
    const baseQuery = this.buildBaseQuery(filters, timeframe);
    
    // Get raw data based on analysis type
    let data: ChartDataPoint[] = [];
    if (analysisType === 'individual' && athleteId) {
      data = await this.getIndividualData(athleteId, metrics, timeframe, filters);
    } else {
      data = await this.getGroupData(metrics, timeframe, filters);
    }

    // Calculate statistics for each metric
    const statistics = await this.calculateStatistics(data, metrics);

    // Get trend data if needed
    const trends = timeframe.type === 'trends' ? 
      await this.getTrendData(data, metrics, timeframe) : undefined;

    // Get multi-metric data for radar charts
    const multiMetric = metrics.additional.length > 0 ?
      await this.getMultiMetricData(data, metrics, filters) : undefined;

    // Group data by relevant dimensions
    const groupings = await this.createGroupings(data, filters);

    // Calculate metadata
    const meta = await this.calculateMeta(data, filters);

    return {
      data,
      trends,
      multiMetric,
      statistics,
      groupings,
      meta
    };
  }

  /**
   * Build base SQL query with filters
   */
  private buildBaseQuery(filters: AnalyticsFilters, timeframe: TimeframeConfig, requiredMetrics?: string[]) {
    // Build all conditions at once to avoid multiple .where() calls
    const allConditions = [
      eq(measurements.isVerified, "true"),
      eq(userOrganizations.organizationId, filters.organizationId)
    ];

    // Add metric filtering if specific metrics are required
    if (requiredMetrics && requiredMetrics.length > 0) {
      allConditions.push(inArray(measurements.metric, requiredMetrics));
    }

    // Apply timeframe filters
    if (timeframe.period !== 'all_time') {
      const dateRange = this.calculateDateRange(timeframe);
      allConditions.push(
        gte(measurements.date, dateRange.start.toISOString()),
        lte(measurements.date, dateRange.end.toISOString())
      );
    }

    // Add dimensional filters
    if (filters.teams?.length) {
      allConditions.push(inArray(measurements.teamId!, filters.teams));
    }

    if (filters.genders?.length) {
      allConditions.push(inArray(users.gender!, filters.genders));
    }

    if (filters.athleteIds?.length) {
      allConditions.push(inArray(measurements.userId, filters.athleteIds));
    }

    // Add birth year filtering
    if (filters.birthYears?.length) {
      const birthYearConditions = filters.birthYears.map(year => 
        sql`EXTRACT(YEAR FROM ${users.birthDate}) = ${year}`
      );
      allConditions.push(sql`(${sql.join(birthYearConditions, sql` OR `)})`);
    }

    // Return the complete query with all conditions applied
    return db
      .select({
        measurementId: measurements.id,
        athleteId: measurements.userId,
        metric: measurements.metric,
        value: measurements.value,
        date: measurements.date,
        teamId: measurements.teamId,
        season: measurements.season,
        athleteName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
        teamName: teams.name,
        birthDate: users.birthDate,
        gender: users.gender,
        school: users.school
      })
      .from(measurements)
      .innerJoin(users, eq(measurements.userId, users.id))
      .innerJoin(userOrganizations, eq(users.id, userOrganizations.userId))
      .leftJoin(teams, eq(measurements.teamId, teams.id))
      .where(and(...allConditions));
  }

  /**
   * Get individual athlete data
   */
  private async getIndividualData(
    athleteId: string,
    metrics: MetricSelection,
    timeframe: TimeframeConfig,
    filters: AnalyticsFilters
  ): Promise<ChartDataPoint[]> {
    const allMetrics = [metrics.primary, ...metrics.additional];
    
    const individualFilters = { ...filters, athleteIds: [athleteId] };
    const query = this.buildBaseQuery(individualFilters, timeframe, allMetrics);
    
    const results = await query.execute();

    return this.transformToChartData(results);
  }

  /**
   * Get group comparison data
   */
  private async getGroupData(
    metrics: MetricSelection,
    timeframe: TimeframeConfig,
    filters: AnalyticsFilters
  ): Promise<ChartDataPoint[]> {
    const allMetrics = [metrics.primary, ...metrics.additional];
    console.log('Analytics: Group data requested for metrics:', allMetrics);
    
    const query = this.buildBaseQuery(filters, timeframe, allMetrics);
    
    let results;
    
    // Execute the query
    results = await query.execute();
    console.log('Analytics: Raw query results count:', results.length);
    console.log('Analytics: Raw query result metrics:', Array.from(new Set(results.map((r: any) => r.metric))));

    if (timeframe.type === 'best') {
      // Filter and group by athlete+metric and take best
      results = this.getBestPerAthleteMetric(results.filter((r: QueryResult) => allMetrics.includes(r.metric)));
    } else {
      // Filter for trends
      results = results.filter((r: QueryResult) => allMetrics.includes(r.metric));
    }

    console.log('Analytics: Filtered results count:', results.length);
    console.log('Analytics: Filtered result metrics:', Array.from(new Set(results.map((r: any) => r.metric))));

    return this.transformToChartData(results);
  }

  /**
   * Calculate comprehensive statistics
   */
  private async calculateStatistics(
    data: ChartDataPoint[],
    metrics: MetricSelection
  ): Promise<Record<string, StatisticalSummary>> {
    const statistics: Record<string, StatisticalSummary> = {};
    const allMetrics = [metrics.primary, ...metrics.additional];

    for (const metric of allMetrics) {
      const metricData = data.filter(d => d.metric === metric);
      // Convert decimal values to numbers (Drizzle returns decimals as strings)
      const values = metricData
        .map(d => typeof d.value === 'string' ? parseFloat(d.value) : d.value)
        .filter(v => !isNaN(v))
        .sort((a, b) => a - b);

      if (values.length === 0) continue;

      const count = values.length;
      const sum = values.reduce((a, b) => a + b, 0);
      const mean = sum / count;
      
      const sortedValues = [...values].sort((a, b) => a - b);
      const median = this.calculatePercentile(sortedValues, 50);
      
      const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count;
      const std = Math.sqrt(variance);

      statistics[metric] = {
        count,
        mean,
        median,
        min: Math.min(...values),
        max: Math.max(...values),
        std,
        variance,
        percentiles: {
          p5: this.calculatePercentile(sortedValues, 5),
          p10: this.calculatePercentile(sortedValues, 10),
          p25: this.calculatePercentile(sortedValues, 25),
          p50: median,
          p75: this.calculatePercentile(sortedValues, 75),
          p90: this.calculatePercentile(sortedValues, 90),
          p95: this.calculatePercentile(sortedValues, 95)
        }
      };
    }

    return statistics;
  }

  /**
   * Get trend data for time-series analysis
   */
  private async getTrendData(
    data: ChartDataPoint[],
    metrics: MetricSelection,
    timeframe: TimeframeConfig
  ): Promise<TrendData[]> {
    const trends: TrendData[] = [];
    const allMetrics = [metrics.primary, ...metrics.additional];

    console.log('Analytics: Creating trend data for metrics:', allMetrics);
    console.log('Analytics: Raw data count:', data.length);
    console.log('Analytics: Data metrics available:', Array.from(new Set(data.map(d => d.metric))));

    // Group by athlete and metric
    const athleteMetricGroups = this.groupBy(data, ['athleteId', 'metric']);

    for (const [key, points] of Object.entries(athleteMetricGroups)) {
      const [athleteId, metric] = key.split('|');
      if (!allMetrics.includes(metric)) continue;

      const sortedPoints = points.sort((a, b) => a.date.getTime() - b.date.getTime());
      
      // Get best value per day
      const dailyBests = this.getBestPerDay(sortedPoints);
      
      // Calculate group averages for comparison
      const groupData = data.filter(d => d.metric === metric && d.athleteId !== athleteId);
      const groupAverage = groupData.length > 0 ? 
        groupData.reduce((sum, d) => sum + d.value, 0) / groupData.length : undefined;

      const trendPoints: TrendDataPoint[] = dailyBests.map(point => ({
        date: point.date,
        value: point.value,
        isPersonalBest: this.isPersonalBest(point, sortedPoints),
        groupAverage,
        groupMedian: this.calculateMedian(groupData.map(d => d.value))
      }));

      trends.push({
        athleteId,
        athleteName: points[0].athleteName,
        metric,
        data: trendPoints
      });
    }

    return trends;
  }

  /**
   * Get multi-metric data for radar charts
   */
  private async getMultiMetricData(
    data: ChartDataPoint[],
    metrics: MetricSelection,
    filters: AnalyticsFilters
  ): Promise<MultiMetricData[]> {
    const allMetrics = [metrics.primary, ...metrics.additional];
    const multiMetricData: MultiMetricData[] = [];

    console.log('getMultiMetricData: Starting with data length:', data.length);
    console.log('getMultiMetricData: All metrics:', allMetrics);
    console.log('getMultiMetricData: Sample data points:', data.slice(0, 3));

    // Group by athlete
    const athleteGroups = this.groupBy(data, ['athleteId']);
    console.log('getMultiMetricData: Athlete groups:', Object.keys(athleteGroups).length);

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

      // Include athlete if they have data for at least 2 metrics (primary + 1 additional)
      const hasMinimumMetrics = Object.keys(athleteMetrics).length >= 2;
      console.log(`Athlete ${athleteName}: has ${Object.keys(athleteMetrics).length} metrics, minimum required: 2`);
      
      if (hasMinimumMetrics) {
        multiMetricData.push({
          athleteId,
          athleteName,
          metrics: athleteMetrics,
          percentileRanks
        });
      }
    }

    console.log('getMultiMetricData: Returning', multiMetricData.length, 'items');
    if (multiMetricData.length > 0) {
      console.log('getMultiMetricData: Sample multiMetric item:', multiMetricData[0]);
    }
    return multiMetricData;
  }

  /**
   * Create data groupings for analysis
   */
  private async createGroupings(
    data: ChartDataPoint[],
    filters: AnalyticsFilters
  ): Promise<Record<string, ChartDataPoint[]>> {
    const groupings: Record<string, ChartDataPoint[]> = {};

    // Group by team
    if (filters.teams?.length) {
      const teamGroups = this.groupDataBy(data, 'teamName');
      groupings.byTeam = Object.values(teamGroups).flat();
    }

    // Group by gender - gender is not available in ChartDataPoint, skip for now
    // if (filters.genders?.length) {
    //   groupings.byGender = this.groupDataBy(data, 'gender');
    // }

    return groupings;
  }

  /**
   * Calculate metadata for the response
   */
  private async calculateMeta(
    data: ChartDataPoint[],
    filters: AnalyticsFilters
  ) {
    const uniqueAthletes = new Set(data.map(d => d.athleteId));
    const dates = data.map(d => d.date).sort();

    return {
      totalAthletes: uniqueAthletes.size,
      totalMeasurements: data.length,
      dateRange: {
        start: dates[0] || new Date(),
        end: dates[dates.length - 1] || new Date()
      },
      appliedFilters: filters,
      recommendedCharts: this.getRecommendedCharts(data, filters)
    };
  }

  // Utility methods
  private calculateDateRange(timeframe: TimeframeConfig): { start: Date; end: Date } {
    const now = new Date();
    const end = new Date(now);
    let start = new Date();

    switch (timeframe.period) {
      case 'this_year':
        start = new Date(now.getFullYear(), 0, 1);
        break;
      case 'last_7_days':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'last_30_days':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'last_90_days':
        start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'custom':
        start = timeframe.startDate || start;
        end.setTime(timeframe.endDate?.getTime() || end.getTime());
        break;
    }

    return { start, end };
  }

  private transformToChartData(results: any[]): ChartDataPoint[] {
    return results.map(row => ({
      athleteId: row.athleteId,
      athleteName: row.athleteName,
      // Convert decimal values to numbers (Drizzle returns decimals as strings)
      value: typeof row.value === 'string' ? parseFloat(row.value) : row.value,
      date: row.date,
      metric: row.metric,
      teamName: row.teamName,
      grouping: row.teamName // Default grouping by team
    }));
  }

  private calculatePercentile(sortedValues: number[], percentile: number): number {
    const index = (percentile / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;

    if (upper >= sortedValues.length) return sortedValues[sortedValues.length - 1];
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }

  private calculatePercentileRank(value: number, allValues: number[]): number {
    const belowCount = allValues.filter(v => v < value).length;
    return (belowCount / allValues.length) * 100;
  }

  private calculateMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    return this.calculatePercentile(sorted, 50);
  }

  private groupBy<T>(array: T[], keys: (keyof T)[]): Record<string, T[]> {
    return array.reduce((groups, item) => {
      const key = keys.map(k => String(item[k])).join('|');
      groups[key] = groups[key] || [];
      groups[key].push(item);
      return groups;
    }, {} as Record<string, T[]>);
  }

  private groupDataBy(data: ChartDataPoint[], key: keyof ChartDataPoint): Record<string, ChartDataPoint[]> {
    return data.reduce((groups, item) => {
      const groupKey = String(item[key]) || 'Unknown';
      groups[groupKey] = groups[groupKey] || [];
      groups[groupKey].push(item);
      return groups;
    }, {} as Record<string, ChartDataPoint[]>);
  }

  private getBestPerAthleteMetric(results: QueryResult[]): QueryResult[] {
    const bestResults: Record<string, QueryResult> = {};

    for (const result of results) {
      const key = `${result.athleteId}|${result.metric}`;
      const metricConfig = METRIC_CONFIG[result.metric as keyof typeof METRIC_CONFIG];

      if (!bestResults[key]) {
        bestResults[key] = result;
      } else {
        const isBetter = metricConfig?.lowerIsBetter
          ? result.value < bestResults[key].value
          : result.value > bestResults[key].value;

        if (isBetter) {
          bestResults[key] = result;
        }
      }
    }

    return Object.values(bestResults);
  }

  private getBestPerDay(points: ChartDataPoint[]): ChartDataPoint[] {
    const dailyBests: Record<string, ChartDataPoint> = {};

    for (const point of points) {
      const dateKey = point.date.toISOString().split('T')[0];
      const metricConfig = METRIC_CONFIG[point.metric as keyof typeof METRIC_CONFIG];

      if (!dailyBests[dateKey]) {
        dailyBests[dateKey] = point;
      } else {
        const isBetter = metricConfig?.lowerIsBetter
          ? point.value < dailyBests[dateKey].value
          : point.value > dailyBests[dateKey].value;

        if (isBetter) {
          dailyBests[dateKey] = point;
        }
      }
    }

    return Object.values(dailyBests);
  }

  private isPersonalBest(point: ChartDataPoint, allPoints: ChartDataPoint[]): boolean {
    const metricConfig = METRIC_CONFIG[point.metric as keyof typeof METRIC_CONFIG];
    const allValues = allPoints.map(p => p.value);

    if (metricConfig?.lowerIsBetter) {
      return point.value === Math.min(...allValues);
    } else {
      return point.value === Math.max(...allValues);
    }
  }

  private getRecommendedCharts(data: ChartDataPoint[], filters: AnalyticsFilters): ChartType[] {
    const uniqueMetrics = new Set(data.map(d => d.metric));
    const metricCount = uniqueMetrics.size;
    
    if (metricCount === 1) {
      return ['box_swarm_combo', 'distribution', 'bar_chart'] as ChartType[];
    } else if (metricCount === 2) {
      return ['scatter_plot', 'connected_scatter'] as ChartType[];
    } else {
      return ['radar_chart', 'multi_line'] as ChartType[];
    }
  }
}