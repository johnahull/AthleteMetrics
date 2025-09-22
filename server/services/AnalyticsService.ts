/**
 * Analytics Service
 *
 * Handles performance data analysis, statistical computations, and chart recommendations.
 * Provides advanced analytics capabilities for athlete performance tracking.
 */

import { BaseService, type ServiceContext, type ServiceConfig } from './base/BaseService';
import type {
  MeasurementFilters,
  AnalyticsRequest,
  AnalyticsResponse,
  ChartRecommendation
} from './types/common';
import { createClient, type RedisClientType } from 'redis';

// Re-export types for external use
export type {
  MeasurementFilters,
  AnalyticsRequest,
  AnalyticsResponse,
  ChartRecommendation
} from './types/common';

export interface AnalyticsServiceInterface {
  // Core Analytics Operations
  getPerformanceAnalytics(filters: MeasurementFilters, context: ServiceContext): Promise<AnalyticsResponse>;
  getStatisticalSummary(filters: MeasurementFilters, context: ServiceContext): Promise<any>;
  getTrendAnalysis(filters: MeasurementFilters, context: ServiceContext): Promise<any>;

  // Chart Recommendations
  recommendChartType(request: AnalyticsRequest, context: ServiceContext): Promise<ChartRecommendation>;
  getChartData(request: AnalyticsRequest, context: ServiceContext): Promise<any>;

  // Comparative Analytics
  getIntraGroupAnalysis(filters: MeasurementFilters, context: ServiceContext): Promise<any>;
  getInterGroupAnalysis(filters: MeasurementFilters, context: ServiceContext): Promise<any>;
  getIndividualAnalysis(athleteId: string, filters: MeasurementFilters, context: ServiceContext): Promise<any>;
}

export class AnalyticsService extends BaseService implements AnalyticsServiceInterface {
  private cacheClient: RedisClientType | null = null;
  private readonly CACHE_TTL = 600; // 10 minutes cache TTL

  constructor(config: ServiceConfig) {
    super(config, 'AnalyticsService');
    this.initializeCache();
  }

  private async initializeCache(): Promise<void> {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.cacheClient = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: 60000
        }
      });

      this.cacheClient.on('error', (err) => {
        this.logger.warn('Analytics cache error:', err);
        this.cacheClient = null;
      });

      await this.cacheClient.connect();
      this.logger.info('Analytics cache initialized successfully');
    } catch (error) {
      this.logger.warn('Could not initialize analytics cache:', error);
      this.cacheClient = null;
    }
  }

  /**
   * Get comprehensive performance analytics
   */
  async getPerformanceAnalytics(
    filters: MeasurementFilters,
    context: ServiceContext
  ): Promise<AnalyticsResponse> {
    return this.executeWithContext('getPerformanceAnalytics', context, async () => {
      this.validatePermissions(context, { requireAuth: true });

      // Apply organization context for non-site admins
      const organizationAwareFilters = this.applyOrganizationFilter(filters, context);

      // Apply default pagination limits for performance
      const paginatedFilters = this.applyPaginationLimits(organizationAwareFilters);

      // Check cache first
      const cacheKey = this.generateCacheKey('performance_analytics', paginatedFilters, context);
      const cached = await this.getFromCache(cacheKey);
      if (cached) {
        this.logger.debug('Returning cached performance analytics', { cacheKey });
        return cached;
      }

      // Get measurements with filters and pagination
      const measurements = await this.storage.getMeasurements(paginatedFilters);

      // Perform statistical analysis
      const statisticalSummary = this.calculateStatisticalSummary(measurements);
      const trendAnalysis = this.calculateTrendAnalysis(measurements);
      const percentileData = this.calculatePercentiles(measurements);

      // Generate insights
      const insights = this.generateInsights(measurements, statisticalSummary, trendAnalysis);

      // Recommend optimal chart type
      const chartRecommendation = this.determineOptimalChartType(measurements, filters);

      const result = {
        data: measurements,
        statistics: statisticalSummary,
        groupings: {
          trends: trendAnalysis,
          percentiles: percentileData,
          chartRecommendation
        },
        meta: {
          totalRecords: measurements.length,
          filters: organizationAwareFilters,
          generatedAt: new Date().toISOString()
        }
      };

      // Cache the result
      await this.setCache(cacheKey, result);

      return result;
    });
  }

  /**
   * Get statistical summary for measurements
   */
  async getStatisticalSummary(
    filters: MeasurementFilters,
    context: ServiceContext
  ): Promise<any> {
    return this.executeWithContext('getStatisticalSummary', context, async () => {
      this.validatePermissions(context, { requireAuth: true });

      const organizationAwareFilters = this.applyOrganizationFilter(filters, context);
      const paginatedFilters = this.applyPaginationLimits(organizationAwareFilters);
      const measurements = await this.storage.getMeasurements(paginatedFilters);

      return this.calculateStatisticalSummary(measurements);
    });
  }

  /**
   * Get trend analysis over time
   */
  async getTrendAnalysis(
    filters: MeasurementFilters,
    context: ServiceContext
  ): Promise<any> {
    return this.executeWithContext('getTrendAnalysis', context, async () => {
      this.validatePermissions(context, { requireAuth: true });

      const organizationAwareFilters = this.applyOrganizationFilter(filters, context);
      const paginatedFilters = this.applyPaginationLimits(organizationAwareFilters);
      const measurements = await this.storage.getMeasurements(paginatedFilters);

      return this.calculateTrendAnalysis(measurements);
    });
  }

  /**
   * Recommend optimal chart type based on data characteristics
   */
  async recommendChartType(
    request: AnalyticsRequest,
    context: ServiceContext
  ): Promise<ChartRecommendation> {
    return this.executeWithContext('recommendChartType', context, async () => {
      this.validatePermissions(context, { requireAuth: true });

      const filters = this.convertRequestToFilters(request);
      const organizationAwareFilters = this.applyOrganizationFilter(filters, context);
      const measurements = await this.storage.getMeasurements(organizationAwareFilters);

      return this.determineOptimalChartType(measurements, filters);
    });
  }

  /**
   * Get formatted data for specific chart type
   */
  async getChartData(
    request: AnalyticsRequest,
    context: ServiceContext
  ): Promise<any> {
    return this.executeWithContext('getChartData', context, async () => {
      this.validatePermissions(context, { requireAuth: true });

      const filters = this.convertRequestToFilters(request);
      const organizationAwareFilters = this.applyOrganizationFilter(filters, context);
      const measurements = await this.storage.getMeasurements(organizationAwareFilters);

      // Format data based on requested chart type
      switch (request.chartType || 'scatter') {
        case 'boxplot':
          return this.formatBoxPlotData(measurements, request);
        case 'scatter':
          return this.formatScatterPlotData(measurements, request);
        case 'line':
          return this.formatLineChartData(measurements, request);
        case 'radar':
          return this.formatRadarChartData(measurements, request);
        case 'distribution':
          return this.formatDistributionData(measurements, request);
        default:
          return this.formatGenericChartData(measurements, request);
      }
    });
  }

  /**
   * Get intra-group analysis (within same group/team)
   */
  async getIntraGroupAnalysis(
    filters: MeasurementFilters,
    context: ServiceContext
  ): Promise<any> {
    return this.executeWithContext('getIntraGroupAnalysis', context, async () => {
      this.validatePermissions(context, { requireAuth: true });

      const organizationAwareFilters = this.applyOrganizationFilter(filters, context);
      const measurements = await this.storage.getMeasurements(organizationAwareFilters);

      // Group by teams/cohorts and analyze within groups
      const groupedData = this.groupMeasurementsByTeam(measurements);
      const intraGroupAnalysis: Record<string, any> = {};

      for (const [groupId, groupMeasurements] of Object.entries(groupedData)) {
        intraGroupAnalysis[groupId] = {
          statistical: this.calculateStatisticalSummary(groupMeasurements),
          trends: this.calculateTrendAnalysis(groupMeasurements),
          percentiles: this.calculatePercentiles(groupMeasurements),
          memberCount: this.getUniqueAthletes(groupMeasurements).length
        };
      }

      return intraGroupAnalysis;
    });
  }

  /**
   * Get inter-group analysis (between different groups/teams)
   */
  async getInterGroupAnalysis(
    filters: MeasurementFilters,
    context: ServiceContext
  ): Promise<any> {
    return this.executeWithContext('getInterGroupAnalysis', context, async () => {
      this.validatePermissions(context, { requireAuth: true });

      const organizationAwareFilters = this.applyOrganizationFilter(filters, context);
      const measurements = await this.storage.getMeasurements(organizationAwareFilters);

      const groupedData = this.groupMeasurementsByTeam(measurements);
      const groupComparisons: any[] = [];

      // Compare each group against others
      const groupIds = Object.keys(groupedData);
      for (let i = 0; i < groupIds.length; i++) {
        for (let j = i + 1; j < groupIds.length; j++) {
          const groupA = groupedData[groupIds[i]];
          const groupB = groupedData[groupIds[j]];

          groupComparisons.push({
            groupA: groupIds[i],
            groupB: groupIds[j],
            comparison: this.compareGroups(groupA, groupB),
            statisticalTests: this.performStatisticalTests(groupA, groupB)
          });
        }
      }

      return {
        groupSummaries: Object.fromEntries(
          Object.entries(groupedData).map(([id, data]) => [
            id,
            this.calculateStatisticalSummary(data)
          ])
        ),
        comparisons: groupComparisons
      };
    });
  }

  /**
   * Get individual athlete analysis
   */
  async getIndividualAnalysis(
    athleteId: string,
    filters: MeasurementFilters,
    context: ServiceContext
  ): Promise<any> {
    return this.executeWithContext('getIndividualAnalysis', context, async () => {
      this.validatePermissions(context, { requireAuth: true });

      // Add athlete filter
      const athleteFilters = { ...filters, athleteId };
      const organizationAwareFilters = this.applyOrganizationFilter(athleteFilters, context);

      const measurements = await this.storage.getMeasurements(organizationAwareFilters);
      const athlete = await this.storage.getAthlete(athleteId);

      if (!athlete) {
        throw new Error(`Athlete not found: ${athleteId}`);
      }

      // Get athlete's team context for comparisons
      const athleteTeams = await this.storage.getUserTeams(athleteId);
      const teamMeasurements = await this.getTeamMeasurementsForComparison(athleteTeams, filters);

      return {
        athlete: {
          id: athlete.id,
          name: `${athlete.firstName} ${athlete.lastName}`,
          teams: athleteTeams.map(ut => ut.team.name)
        },
        personalStats: {
          statistical: this.calculateStatisticalSummary(measurements),
          trends: this.calculateTrendAnalysis(measurements),
          personalBests: this.calculatePersonalBests(measurements),
          progressMetrics: this.calculateProgressMetrics(measurements)
        },
        teamComparison: this.compareAthleteToTeam(measurements, teamMeasurements),
        insights: this.generateIndividualInsights(measurements, teamMeasurements)
      };
    });
  }

  // Private helper methods

  private applyOrganizationFilter(
    filters: MeasurementFilters,
    context: ServiceContext
  ): MeasurementFilters {
    // Site admins can access all data
    if (context.isSiteAdmin) {
      return filters;
    }

    // Non-site admins are restricted to their organization
    if (context.organizationId) {
      return {
        ...filters,
        organizationId: context.organizationId
      };
    }

    throw new Error('Organization context required for analytics access');
  }

  private applyPaginationLimits(filters: MeasurementFilters): MeasurementFilters {
    const DEFAULT_LIMIT = 1000;
    const MAX_LIMIT = 10000;

    // Apply default limit if not specified
    let limit = filters.limit || DEFAULT_LIMIT;

    // Enforce maximum limit for performance
    if (limit > MAX_LIMIT) {
      this.logger.warn('Requested limit exceeds maximum, applying max limit', {
        requested: limit,
        applied: MAX_LIMIT
      });
      limit = MAX_LIMIT;
    }

    return {
      ...filters,
      limit,
      offset: filters.offset || 0
    };
  }

  private calculateStatisticalSummary(measurements: any[]): any {
    if (measurements.length === 0) {
      return { count: 0, metrics: {} };
    }

    const metricGroups = this.groupMeasurementsByMetric(measurements);
    const statisticalSummary: Record<string, any> = {};

    for (const [metric, values] of Object.entries(metricGroups)) {
      const numericValues = (values as any[])
        .map(m => parseFloat(m.value))
        .filter(v => !isNaN(v))
        .sort((a, b) => a - b);

      if (numericValues.length > 0) {
        statisticalSummary[metric] = {
          count: numericValues.length,
          mean: this.calculateMean(numericValues),
          median: this.calculateMedian(numericValues),
          std: this.calculateStandardDeviation(numericValues),
          min: Math.min(...numericValues),
          max: Math.max(...numericValues),
          q1: this.calculatePercentile(numericValues, 25),
          q3: this.calculatePercentile(numericValues, 75),
          range: Math.max(...numericValues) - Math.min(...numericValues)
        };
      }
    }

    return {
      count: measurements.length,
      uniqueAthletes: this.getUniqueAthletes(measurements).length,
      dateRange: this.getDateRange(measurements),
      metrics: statisticalSummary
    };
  }

  private calculateTrendAnalysis(measurements: any[]): any {
    if (measurements.length === 0) {
      return { trends: {} };
    }

    const metricGroups = this.groupMeasurementsByMetric(measurements);
    const trends: Record<string, any> = {};

    for (const [metric, values] of Object.entries(metricGroups)) {
      const sortedByDate = (values as any[])
        .filter(m => m.measurementDate)
        .sort((a, b) => new Date(a.measurementDate).getTime() - new Date(b.measurementDate).getTime());

      if (sortedByDate.length >= 2) {
        trends[metric] = {
          direction: this.calculateTrendDirection(sortedByDate),
          slope: this.calculateTrendSlope(sortedByDate),
          correlation: this.calculateTimeCorrelation(sortedByDate),
          periods: this.analyzePeriods(sortedByDate)
        };
      }
    }

    return { trends };
  }

  private calculatePercentiles(measurements: any[]): any {
    const metricGroups = this.groupMeasurementsByMetric(measurements);
    const percentiles: Record<string, any> = {};

    for (const [metric, values] of Object.entries(metricGroups)) {
      const numericValues = (values as any[])
        .map(m => parseFloat(m.value))
        .filter(v => !isNaN(v))
        .sort((a, b) => a - b);

      if (numericValues.length > 0) {
        percentiles[metric] = {
          p10: this.calculatePercentile(numericValues, 10),
          p25: this.calculatePercentile(numericValues, 25),
          p50: this.calculatePercentile(numericValues, 50),
          p75: this.calculatePercentile(numericValues, 75),
          p90: this.calculatePercentile(numericValues, 90),
          p95: this.calculatePercentile(numericValues, 95),
          p99: this.calculatePercentile(numericValues, 99)
        };
      }
    }

    return percentiles;
  }

  private determineOptimalChartType(measurements: any[], filters: MeasurementFilters): ChartRecommendation {
    const uniqueAthletes = this.getUniqueAthletes(measurements).length;
    const uniqueMetrics = this.getUniqueMetrics(measurements).length;
    const timeSpan = this.getTimeSpanDays(measurements);
    const dataPoints = measurements.length;

    // Decision tree for chart recommendations
    if (uniqueMetrics > 3 && uniqueAthletes >= 5) {
      return {
        type: 'radar',
        confidence: 0.85,
        reasoning: 'Multiple metrics with sufficient athletes for radar comparison',
        alternatives: ['scatter', 'boxplot']
      };
    }

    if (timeSpan > 30 && dataPoints > 10) {
      return {
        type: 'line',
        confidence: 0.9,
        reasoning: 'Time series data with sufficient temporal coverage',
        alternatives: ['scatter', 'distribution']
      };
    }

    if (uniqueAthletes > 20 && uniqueMetrics <= 2) {
      return {
        type: 'boxplot',
        confidence: 0.8,
        reasoning: 'Large athlete population suitable for distribution analysis',
        alternatives: ['distribution', 'scatter']
      };
    }

    if (uniqueMetrics === 2 && uniqueAthletes >= 5) {
      return {
        type: 'scatter',
        confidence: 0.75,
        reasoning: 'Two-dimensional data suitable for correlation analysis',
        alternatives: ['line', 'boxplot']
      };
    }

    return {
      type: 'distribution',
      confidence: 0.6,
      reasoning: 'Default visualization for general data exploration',
      alternatives: ['boxplot', 'scatter']
    };
  }

  // Statistical calculation helpers
  private calculateMean(values: number[]): number {
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private calculateMedian(values: number[]): number {
    const mid = Math.floor(values.length / 2);
    return values.length % 2 === 0
      ? (values[mid - 1] + values[mid]) / 2
      : values[mid];
  }

  private calculateStandardDeviation(values: number[]): number {
    const mean = this.calculateMean(values);
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private calculatePercentile(values: number[], percentile: number): number {
    const index = (percentile / 100) * (values.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    return values[lower] * (1 - weight) + values[upper] * weight;
  }

  // Data grouping and analysis helpers
  private groupMeasurementsByMetric(measurements: any[]): Record<string, any[]> {
    return measurements.reduce((groups, measurement) => {
      const metric = measurement.metric;
      if (!groups[metric]) groups[metric] = [];
      groups[metric].push(measurement);
      return groups;
    }, {} as Record<string, any[]>);
  }

  private groupMeasurementsByTeam(measurements: any[]): Record<string, any[]> {
    return measurements.reduce((groups, measurement) => {
      const teamId = measurement.teamId || 'independent';
      if (!groups[teamId]) groups[teamId] = [];
      groups[teamId].push(measurement);
      return groups;
    }, {} as Record<string, any[]>);
  }

  private getUniqueAthletes(measurements: any[]): string[] {
    return [...new Set(measurements.map(m => m.athleteId))];
  }

  private getUniqueMetrics(measurements: any[]): string[] {
    return [...new Set(measurements.map(m => m.metric))];
  }

  private getUniqueOrganizations(measurements: any[]): string[] {
    return [...new Set(measurements.map(m => m.organizationId).filter(Boolean))];
  }

  private getDateRange(measurements: any[]): { start: string; end: string } | null {
    const dates = measurements
      .map(m => m.measurementDate)
      .filter(Boolean)
      .sort();

    return dates.length > 0
      ? { start: dates[0], end: dates[dates.length - 1] }
      : null;
  }

  private getTimeSpanDays(measurements: any[]): number {
    const dateRange = this.getDateRange(measurements);
    if (!dateRange) return 0;

    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  }

  // Additional helper methods would be implemented here...
  private convertRequestToFilters(request: AnalyticsRequest): MeasurementFilters {
    // Convert analytics request to measurement filters
    return {
      // Implementation details...
    } as MeasurementFilters;
  }

  private formatBoxPlotData(measurements: any[], request: AnalyticsRequest): any {
    // Format data for box plot visualization
    return {};
  }

  private formatScatterPlotData(measurements: any[], request: AnalyticsRequest): any {
    // Format data for scatter plot visualization
    return {};
  }

  private formatLineChartData(measurements: any[], request: AnalyticsRequest): any {
    // Format data for line chart visualization
    return {};
  }

  private formatRadarChartData(measurements: any[], request: AnalyticsRequest): any {
    // Format data for radar chart visualization
    return {};
  }

  private formatDistributionData(measurements: any[], request: AnalyticsRequest): any {
    // Format data for distribution visualization
    return {};
  }

  private formatGenericChartData(measurements: any[], request: AnalyticsRequest): any {
    // Format data for generic chart visualization
    return {};
  }

  private generateInsights(measurements: any[], statistical: any, trends: any): string[] {
    // Generate actionable insights from the data
    return [];
  }

  private calculateTrendDirection(measurements: any[]): 'improving' | 'declining' | 'stable' {
    // Calculate trend direction
    return 'stable';
  }

  private calculateTrendSlope(measurements: any[]): number {
    // Calculate trend slope
    return 0;
  }

  private calculateTimeCorrelation(measurements: any[]): number {
    // Calculate correlation with time
    return 0;
  }

  private analyzePeriods(measurements: any[]): any {
    // Analyze performance periods
    return {};
  }

  private compareGroups(groupA: any[], groupB: any[]): any {
    // Compare two groups statistically
    return {};
  }

  private performStatisticalTests(groupA: any[], groupB: any[]): any {
    // Perform statistical significance tests
    return {};
  }

  private getTeamMeasurementsForComparison(teams: any[], filters: MeasurementFilters): Promise<any[]> {
    // Get team measurements for individual comparison
    return Promise.resolve([]);
  }

  private calculatePersonalBests(measurements: any[]): any {
    // Calculate personal best performances
    return {};
  }

  private calculateProgressMetrics(measurements: any[]): any {
    // Calculate progress metrics over time
    return {};
  }

  private compareAthleteToTeam(individualMeasurements: any[], teamMeasurements: any[]): any {
    // Compare individual athlete to team averages
    return {};
  }

  private generateIndividualInsights(individualMeasurements: any[], teamMeasurements: any[]): string[] {
    // Generate insights for individual athlete
    return [];
  }

  // Cache helper methods

  private generateCacheKey(operation: string, filters: MeasurementFilters, context: ServiceContext): string {
    // Create a deterministic cache key based on operation, filters, and context
    const keyData = {
      operation,
      filters: {
        ...filters,
        // Sort arrays for consistent keys
        teamIds: filters.teamIds?.sort(),
      },
      organizationId: context.organizationId,
      userId: context.userId
    };

    const keyString = JSON.stringify(keyData);
    const hash = this.hashString(keyString);
    return `analytics:${operation}:${hash}`;
  }

  private hashString(str: string): string {
    // Simple hash function for cache keys
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private async getFromCache(key: string): Promise<any | null> {
    if (!this.cacheClient) {
      return null;
    }

    try {
      const cached = await this.cacheClient.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn('Error reading from cache', { key, error });
    }

    return null;
  }

  private async setCache(key: string, data: any): Promise<void> {
    if (!this.cacheClient) {
      return;
    }

    try {
      const serialized = JSON.stringify(data);
      await this.cacheClient.setEx(key, this.CACHE_TTL, serialized);
      this.logger.debug('Data cached successfully', { key, ttl: this.CACHE_TTL });
    } catch (error) {
      this.logger.warn('Error writing to cache', { key, error });
    }
  }

  private async invalidateCache(pattern: string): Promise<void> {
    if (!this.cacheClient) {
      return;
    }

    try {
      const keys = await this.cacheClient.keys(`analytics:${pattern}*`);
      if (keys.length > 0) {
        await this.cacheClient.del(keys);
        this.logger.debug('Cache invalidated', { pattern, keysRemoved: keys.length });
      }
    } catch (error) {
      this.logger.warn('Error invalidating cache', { pattern, error });
    }
  }
}