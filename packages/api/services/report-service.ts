/**
 * ReportService - Handles report generation, calculations, and snapshots
 * Supports coach reports (team-level aggregations) and individual reports (athlete-level)
 */

import { db } from '../db';
import {
  reports,
  reportSnapshots,
  reportBenchmarks,
  measurements,
  users,
  teams,
  userTeams,
  siteBenchmarks,
  customBenchmarks,
  organizationBenchmarks,
  siteMetrics,
  type Report,
  type ReportSnapshot,
  type ReportBenchmark,
} from '@shared/schema';
import { eq, and, gte, lte, inArray, desc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { quantileRank, median, mean, min, max, standardDeviation } from 'simple-statistics';
import { BaseService } from './base-service';

interface TimeframeConfig {
  type: 'preset' | 'custom';
  preset?: 'season' | 'year' | 'all_time';
  customStart?: string;
  customEnd?: string;
}

interface CompositeIndexConfig {
  enabled: boolean;
  weights: Record<string, number>;
}

interface ReportFilters {
  teamIds?: string[];
  gender?: 'Male' | 'Female' | 'Not Specified';
  positions?: string[];
}

interface ReportConfig {
  timeframe: TimeframeConfig;
  metrics: string[];
  benchmarks?: {
    site?: string[];
    custom?: string[];
    userDefined?: Array<{
      metricCode: string;
      value: number;
      label: string;
    }>;
  };
  compositeIndex?: CompositeIndexConfig;
  filters?: ReportFilters;
}

interface AthletePerformance {
  userId: string;
  userName: string;
  gender?: 'Male' | 'Female' | 'Not Specified';
  positions?: string[];
  age?: number;
  teams?: string[];
  measurements: Record<string, number>;
  percentiles: Record<string, number>;
  compositeIndex?: number;
  benchmarkComparisons: Record<string, BenchmarkComparison[]>;
}

interface TeamStatistics {
  metric: string;
  average: number;
  median: number;
  min: number;
  max: number;
  standardDeviation: number;
  units: string;
  topPerformer?: {
    userId: string;
    userName: string;
    value: number;
  };
  benchmarks?: Array<{
    name: string;
    value: number;
  }>;
}

interface BenchmarkComparison {
  benchmarkName: string;
  benchmarkValue: number;
  athleteValue: number;
  meetsTarget: boolean;
  percentageDiff: number;
  comparisonOperator: string;
}

interface TeamReportData {
  reportType: 'team';
  reportConfig: ReportConfig;
  teamStatistics: TeamStatistics[];
  athleteRankings: AthletePerformance[];
  generatedAt: string;
  teamIds: string[];
  athleteCount: number;
}

interface IndividualReportData {
  reportType: 'individual';
  reportConfig: ReportConfig;
  athlete: AthletePerformance;
  generatedAt: string;
}

export class ReportService extends BaseService {
  /**
   * Generate a team report with team-level aggregations and athlete rankings
   */
  async generateTeamReport(
    reportId: string,
    userId: string
  ): Promise<TeamReportData> {
    // Get report configuration
    const report = await db
      .select()
      .from(reports)
      .where(eq(reports.id, reportId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!report) {
      throw new Error('Report not found');
    }

    // Validate organization access
    const hasAccess = await this.validateOrganizationAccess(
      userId,
      report.organizationId
    );
    if (!hasAccess) {
      throw new Error('Access denied to this report');
    }

    const config = report.config as ReportConfig;

    console.log('[ReportService] Generating team report:', {
      reportId,
      reportName: report.name,
      organizationId: report.organizationId,
      metrics: config.metrics,
      timeframe: config.timeframe,
      filters: config.filters,
      compositeIndex: config.compositeIndex
    });

    // Calculate date range from timeframe
    const { startDate, endDate } = this.calculateDateRange(config.timeframe);
    console.log('[ReportService] Date range:', { startDate, endDate });

    // Get measurements based on filters
    const measurementData = await this.getFilteredMeasurements(
      report.organizationId,
      config.metrics,
      config.filters,
      startDate,
      endDate
    );

    console.log('[ReportService] Fetched measurements:', {
      count: measurementData.length,
      uniqueUsers: new Set(measurementData.map(m => m.measurement.userId)).size,
      metrics: [...new Set(measurementData.map(m => m.measurement.metric))]
    });

    // Get benchmarks for the report
    const benchmarksByMetric = await this.getBenchmarksForReport(
      config.benchmarks,
      report.organizationId,
      reportId
    );

    // Calculate team statistics
    const teamStatistics = await this.calculateTeamStatistics(
      measurementData,
      config.metrics,
      config.benchmarks,
      report.organizationId,
      reportId
    );

    console.log('[ReportService] Calculated team statistics:', {
      count: teamStatistics.length,
      stats: teamStatistics
    });

    // Get athlete rankings with percentiles and benchmark comparisons
    const athleteRankings = await this.calculateAthleteRankings(
      measurementData,
      config.metrics,
      config.compositeIndex,
      reportId,
      benchmarksByMetric
    );

    console.log('[ReportService] Calculated athlete rankings:', {
      count: athleteRankings.length,
      rankings: athleteRankings
    });

    const result = {
      reportType: 'team' as const,
      reportConfig: config,
      teamStatistics,
      athleteRankings,
      generatedAt: new Date().toISOString(),
      teamIds: config.filters?.teamIds || [],
      athleteCount: athleteRankings.length,
    };

    console.log('[ReportService] Returning coach report data:', {
      teamStatisticsCount: result.teamStatistics.length,
      athleteRankingsCount: result.athleteRankings.length
    });

    return result;
  }

  /**
   * Generate an individual athlete report with percentiles and benchmarks
   */
  async generateIndividualReport(
    reportId: string,
    userId: string,
    athleteId: string
  ): Promise<IndividualReportData> {
    // Get report configuration
    const report = await db
      .select()
      .from(reports)
      .where(eq(reports.id, reportId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!report) {
      throw new Error('Report not found');
    }

    // Validate organization access
    const hasAccess = await this.validateOrganizationAccess(
      userId,
      report.organizationId
    );
    if (!hasAccess) {
      throw new Error('Access denied to this report');
    }

    const config = report.config as ReportConfig;

    // Calculate date range
    const { startDate, endDate } = this.calculateDateRange(config.timeframe);

    // Get athlete data
    const athlete = await db
      .select()
      .from(users)
      .where(eq(users.id, athleteId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!athlete) {
      throw new Error('Athlete not found');
    }

    // Get athlete's active teams
    const athleteTeams = await db
      .select({
        teamName: teams.name,
      })
      .from(userTeams)
      .innerJoin(teams, eq(teams.id, userTeams.teamId))
      .where(
        and(
          eq(userTeams.userId, athleteId),
          eq(userTeams.isActive, true)
        )
      );

    const teamNames = athleteTeams.map(t => t.teamName);

    // Get athlete measurements
    const athleteMeasurements = await db
      .select()
      .from(measurements)
      .where(
        and(
          eq(measurements.userId, athleteId),
          eq(measurements.organizationId, report.organizationId),
          gte(measurements.date, startDate),
          lte(measurements.date, endDate),
          inArray(measurements.metric, config.metrics)
        )
      )
      .orderBy(desc(measurements.date));

    // Get best performance for each metric
    const bestPerformances: Record<string, number> = {};
    for (const metric of config.metrics) {
      const metricMeasurements = athleteMeasurements.filter(
        (m) => m.metric === metric
      );
      if (metricMeasurements.length > 0) {
        const metricInfo = await this.getMetricInfo(metric);
        const values = metricMeasurements.map((m) => parseFloat(m.value));
        bestPerformances[metric] = metricInfo.lowerIsBetter
          ? Math.min(...values)
          : Math.max(...values);
      }
    }

    // Calculate percentiles against all athletes in organization
    const percentiles = await this.calculatePercentiles(
      athleteId,
      report.organizationId,
      config.metrics,
      bestPerformances,
      startDate,
      endDate
    );

    // Get benchmark comparisons
    const benchmarkComparisons = await this.getBenchmarkComparisons(
      athleteId,
      report.organizationId,
      reportId,
      bestPerformances,
      config
    );

    const athletePerformance: AthletePerformance = {
      userId: athlete.id,
      userName: athlete.fullName,
      gender: athlete.gender || undefined,
      positions: athlete.positions || undefined,
      age: athlete.birthYear
        ? new Date().getFullYear() - athlete.birthYear
        : undefined,
      teams: teamNames.length > 0 ? teamNames : undefined,
      measurements: bestPerformances,
      percentiles,
      benchmarkComparisons,
    };

    return {
      reportType: 'individual',
      reportConfig: config,
      athlete: athletePerformance,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Calculate composite index from weighted metrics
   */
  calculateCompositeIndex(
    athletePerformances: Record<string, number>,
    weights: Record<string, number>,
    percentiles: Record<string, number>
  ): number {
    let totalWeight = 0;
    let weightedSum = 0;

    for (const [metric, weight] of Object.entries(weights)) {
      if (percentiles[metric] !== undefined) {
        totalWeight += weight;
        weightedSum += percentiles[metric] * weight;
      }
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Calculate percentiles for an athlete's performances
   */
  async calculatePercentiles(
    athleteId: string,
    organizationId: string,
    metrics: string[],
    athletePerformances: Record<string, number>,
    startDate: string,
    endDate: string
  ): Promise<Record<string, number>> {
    const percentiles: Record<string, number> = {};

    for (const metric of metrics) {
      if (athletePerformances[metric] === undefined) {
        continue;
      }

      // Get all measurements for this metric in the organization
      const allMeasurements = await db
        .select({
          value: measurements.value,
          userId: measurements.userId,
        })
        .from(measurements)
        .where(
          and(
            eq(measurements.organizationId, organizationId),
            eq(measurements.metric, metric),
            gte(measurements.date, startDate),
            lte(measurements.date, endDate)
          )
        );

      // Get best performance per athlete
      const athleteBestMap = new Map<string, number>();
      const metricInfo = await this.getMetricInfo(metric);

      for (const m of allMeasurements) {
        const value = parseFloat(m.value);
        const current = athleteBestMap.get(m.userId);

        if (current === undefined) {
          athleteBestMap.set(m.userId, value);
        } else {
          if (metricInfo.lowerIsBetter) {
            if (value < current) athleteBestMap.set(m.userId, value);
          } else {
            if (value > current) athleteBestMap.set(m.userId, value);
          }
        }
      }

      const allValues = Array.from(athleteBestMap.values());

      if (allValues.length > 0) {
        const athleteValue = athletePerformances[metric];

        // Calculate percentile rank (returns 0-1, so multiply by 100)
        // For "lower is better" metrics, invert the percentile
        const rank = quantileRank(allValues, athleteValue) * 100;
        percentiles[metric] = metricInfo.lowerIsBetter ? 100 - rank : rank;
      }
    }

    return percentiles;
  }

  /**
   * Get benchmark comparisons for an athlete
   */
  async getBenchmarkComparisons(
    athleteId: string,
    organizationId: string,
    reportId: string,
    athletePerformances: Record<string, number>,
    reportConfig: ReportConfig
  ): Promise<Record<string, BenchmarkComparison[]>> {
    const comparisons: Record<string, BenchmarkComparison[]> = {};

    // Get athlete details for filtering
    const athlete = await db
      .select()
      .from(users)
      .where(eq(users.id, athleteId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!athlete) {
      return comparisons;
    }

    const athleteAge = athlete.birthYear
      ? new Date().getFullYear() - athlete.birthYear
      : undefined;

    // Get report-specific user-defined benchmarks
    const userDefinedBenchmarks = await db
      .select()
      .from(reportBenchmarks)
      .where(eq(reportBenchmarks.reportId, reportId));

    // Get selected site benchmark IDs from report config
    const selectedSiteBenchmarkIds = reportConfig.benchmarks?.site || [];

    // Get site benchmarks enabled for this organization AND selected in the report
    let siteBenchmarksList: Array<{ benchmark: typeof siteBenchmarks.$inferSelect }> = [];
    if (selectedSiteBenchmarkIds.length > 0) {
      siteBenchmarksList = await db
        .select({
          benchmark: siteBenchmarks,
        })
        .from(siteBenchmarks)
        .innerJoin(
          organizationBenchmarks,
          and(
            eq(organizationBenchmarks.benchmarkId, siteBenchmarks.id),
            eq(organizationBenchmarks.benchmarkType, 'site'),
            eq(organizationBenchmarks.organizationId, organizationId),
            eq(organizationBenchmarks.isEnabled, true)
          )
        )
        .where(
          and(
            eq(siteBenchmarks.isActive, true),
            inArray(siteBenchmarks.id, selectedSiteBenchmarkIds)
          )
        );
    }

    // Get selected custom benchmark IDs from report config
    const selectedCustomBenchmarkIds = reportConfig.benchmarks?.custom || [];

    // Get custom benchmarks for this organization AND selected in the report
    let customBenchmarksList: Array<{ benchmark: typeof customBenchmarks.$inferSelect }> = [];
    if (selectedCustomBenchmarkIds.length > 0) {
      customBenchmarksList = await db
        .select({
          benchmark: customBenchmarks,
        })
        .from(customBenchmarks)
        .innerJoin(
          organizationBenchmarks,
          and(
            eq(organizationBenchmarks.benchmarkId, customBenchmarks.id),
            eq(organizationBenchmarks.benchmarkType, 'custom'),
            eq(organizationBenchmarks.organizationId, organizationId),
            eq(organizationBenchmarks.isEnabled, true)
          )
        )
        .where(
          and(
            eq(customBenchmarks.organizationId, organizationId),
            eq(customBenchmarks.isActive, true),
            inArray(customBenchmarks.id, selectedCustomBenchmarkIds)
          )
        );
    }

    // Process all benchmarks
    for (const [metricCode, athleteValue] of Object.entries(
      athletePerformances
    )) {
      comparisons[metricCode] = [];

      // User-defined benchmarks
      for (const benchmark of userDefinedBenchmarks) {
        if (benchmark.metricCode === metricCode) {
          if (this.benchmarkMatchesAthlete(benchmark, athlete, athleteAge)) {
            const comparison = this.createBenchmarkComparison(
              benchmark.name,
              parseFloat(benchmark.benchmarkValue),
              athleteValue,
              benchmark.comparisonOperator
            );
            comparisons[metricCode].push(comparison);
          }
        }
      }

      // Site benchmarks
      for (const { benchmark } of siteBenchmarksList) {
        if (benchmark.metricCode === metricCode) {
          if (this.benchmarkMatchesAthlete(benchmark, athlete, athleteAge)) {
            const comparison = this.createBenchmarkComparison(
              benchmark.name,
              parseFloat(benchmark.benchmarkValue),
              athleteValue,
              benchmark.comparisonOperator
            );
            comparisons[metricCode].push(comparison);
          }
        }
      }

      // Custom benchmarks
      for (const { benchmark } of customBenchmarksList) {
        if (benchmark.metricCode === metricCode) {
          if (this.benchmarkMatchesAthlete(benchmark, athlete, athleteAge)) {
            const comparison = this.createBenchmarkComparison(
              benchmark.name,
              parseFloat(benchmark.benchmarkValue),
              athleteValue,
              benchmark.comparisonOperator
            );
            comparisons[metricCode].push(comparison);
          }
        }
      }
    }

    return comparisons;
  }

  /**
   * Create a public snapshot of a report
   */
  async createSnapshot(
    reportId: string,
    userId: string,
    expirationDays: number = 30
  ): Promise<ReportSnapshot> {
    // Get report
    const report = await db
      .select()
      .from(reports)
      .where(eq(reports.id, reportId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!report) {
      throw new Error('Report not found');
    }

    // Validate access
    const hasAccess = await this.validateOrganizationAccess(
      userId,
      report.organizationId
    );
    if (!hasAccess) {
      throw new Error('Access denied to this report');
    }

    // Generate report data
    let snapshotData: TeamReportData | IndividualReportData;
    if (report.reportType === 'team') {
      snapshotData = await this.generateTeamReport(reportId, userId);
    } else {
      // For individual reports, we need an athleteId
      // This should be passed in the config or as a parameter
      const config = report.config as ReportConfig;
      const athleteId = (config as any).athleteId;
      if (!athleteId) {
        throw new Error('Athlete ID required for individual report');
      }
      snapshotData = await this.generateIndividualReport(
        reportId,
        userId,
        athleteId
      );
    }

    // Generate secure token
    const publicToken = nanoid(21);

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    // Create snapshot
    const [snapshot] = await db
      .insert(reportSnapshots)
      .values({
        reportId,
        publicToken,
        snapshotData: snapshotData as any,
        createdBy: userId,
        expiresAt,
        isActive: true,
        viewCount: 0,
      })
      .returning();

    return snapshot;
  }

  /**
   * Get a public snapshot by token
   */
  async getPublicSnapshot(token: string): Promise<ReportSnapshot | null> {
    const snapshot = await db
      .select()
      .from(reportSnapshots)
      .where(eq(reportSnapshots.publicToken, token))
      .limit(1)
      .then((rows) => rows[0]);

    if (!snapshot) {
      return null;
    }

    // Check if snapshot is active and not expired
    if (!snapshot.isActive || snapshot.revokedAt) {
      throw new Error('Snapshot has been revoked');
    }

    if (new Date() > new Date(snapshot.expiresAt)) {
      throw new Error('Snapshot has expired');
    }

    // Increment view count
    await db
      .update(reportSnapshots)
      .set({
        viewCount: snapshot.viewCount + 1,
        lastViewedAt: new Date(),
      })
      .where(eq(reportSnapshots.id, snapshot.id));

    return {
      ...snapshot,
      viewCount: snapshot.viewCount + 1,
    };
  }

  /**
   * Revoke a snapshot
   */
  async revokeSnapshot(
    snapshotId: string,
    userId: string
  ): Promise<void> {
    const snapshot = await db
      .select()
      .from(reportSnapshots)
      .where(eq(reportSnapshots.id, snapshotId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!snapshot) {
      throw new Error('Snapshot not found');
    }

    // Get report to validate access
    const report = await db
      .select()
      .from(reports)
      .where(eq(reports.id, snapshot.reportId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!report) {
      throw new Error('Report not found');
    }

    const hasAccess = await this.validateOrganizationAccess(
      userId,
      report.organizationId
    );
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    // Revoke snapshot
    await db
      .update(reportSnapshots)
      .set({
        isActive: false,
        revokedAt: new Date(),
        revokedBy: userId,
      })
      .where(eq(reportSnapshots.id, snapshotId));
  }

  // Private helper methods

  private calculateDateRange(timeframe: TimeframeConfig): {
    startDate: string;
    endDate: string;
  } {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    if (timeframe.type === 'custom') {
      startDate = new Date(timeframe.customStart!);
      return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: new Date(timeframe.customEnd!).toISOString().split('T')[0],
      };
    }

    switch (timeframe.preset) {
      case 'season':
        // Current season (assume Sep-May for academic year)
        const month = now.getMonth();
        if (month >= 8) {
          // Sep-Dec: current year season
          startDate = new Date(now.getFullYear(), 8, 1);
        } else {
          // Jan-Aug: previous year season
          startDate = new Date(now.getFullYear() - 1, 8, 1);
        }
        break;
      case 'year':
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      case 'all_time':
      default:
        startDate = new Date('2000-01-01');
        // For all_time, include future dates
        endDate = new Date('2099-12-31');
        break;
    }

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    };
  }

  private async getFilteredMeasurements(
    organizationId: string,
    metrics: string[],
    filters: ReportFilters | undefined,
    startDate: string,
    endDate: string
  ) {
    let whereConditions = [
      eq(measurements.organizationId, organizationId),
      inArray(measurements.metric, metrics),
      gte(measurements.date, startDate),
      lte(measurements.date, endDate),
    ];

    // Apply team filter
    if (filters?.teamIds && filters.teamIds.length > 0) {
      whereConditions.push(
        inArray(measurements.teamId, filters.teamIds)
      );
    }

    // Get measurements with user data for filtering
    const results = await db
      .select({
        measurement: measurements,
        user: users,
      })
      .from(measurements)
      .leftJoin(users, eq(measurements.userId, users.id))
      .where(and(...whereConditions));

    // Filter by gender and positions
    let filteredResults = results;

    if (filters?.gender) {
      filteredResults = filteredResults.filter(
        (r) => r.user?.gender === filters.gender
      );
    }

    if (filters?.positions && filters.positions.length > 0) {
      filteredResults = filteredResults.filter((r) =>
        r.user?.positions?.some((p) => filters.positions!.includes(p))
      );
    }

    return filteredResults;
  }

  private async calculateTeamStatistics(
    measurementData: any[],
    metrics: string[],
    benchmarkConfig: ReportConfig['benchmarks'],
    organizationId: string,
    reportId: string
  ): Promise<TeamStatistics[]> {
    const stats: TeamStatistics[] = [];

    // Fetch all relevant benchmarks
    const benchmarksByMetric = await this.getBenchmarksForReport(
      benchmarkConfig,
      organizationId,
      reportId
    );

    for (const metric of metrics) {
      const metricMeasurements = measurementData
        .filter((m) => m.measurement.metric === metric)
        .map((m) => ({
          value: parseFloat(m.measurement.value),
          userId: m.measurement.userId,
          userName: m.user?.fullName || 'Unknown',
          units: m.measurement.units,
        }))
        .filter((m) => !isNaN(m.value));

      if (metricMeasurements.length === 0) {
        continue;
      }

      const values = metricMeasurements.map((m) => m.value);
      const units = metricMeasurements[0]?.units || '';

      // Find best performer (depends on metric type)
      // For now, assume lower is better for time-based, higher for jumps
      const isLowerBetter = metric.includes('TIME') || metric.includes('TEST');
      const bestValue = isLowerBetter ? Math.min(...values) : Math.max(...values);
      const topPerformer = metricMeasurements.find((m) => m.value === bestValue);

      // Get benchmarks for this metric
      const metricBenchmarks = benchmarksByMetric[metric] || [];

      stats.push({
        metric,
        average: mean(values),
        median: median(values),
        min: Math.min(...values),
        max: Math.max(...values),
        standardDeviation: values.length > 1 ? standardDeviation(values) : 0,
        topPerformer: topPerformer
          ? {
              userId: topPerformer.userId,
              userName: topPerformer.userName,
              value: topPerformer.value,
            }
          : undefined,
        benchmarks: metricBenchmarks.length > 0 ? metricBenchmarks : undefined,
        units,
      } as any);
    }

    return stats;
  }

  private async calculateAthleteRankings(
    measurementData: any[],
    metrics: string[],
    compositeIndexConfig: CompositeIndexConfig | undefined,
    reportId: string,
    benchmarksByMetric?: Record<string, Array<{ name: string; value: number }>>
  ): Promise<AthletePerformance[]> {
    // Group measurements by athlete
    const athleteMap = new Map<string, any>();

    for (const item of measurementData) {
      const userId = item.measurement.userId;
      if (!athleteMap.has(userId)) {
        athleteMap.set(userId, {
          userId,
          userName: item.user?.fullName || 'Unknown',
          gender: item.user?.gender,
          positions: item.user?.positions,
          age: item.user?.birthYear
            ? new Date().getFullYear() - item.user?.birthYear
            : undefined,
          measurements: {},
          percentiles: {},
          benchmarkComparisons: {},
        });
      }

      const athlete = athleteMap.get(userId);
      const metric = item.measurement.metric;
      const value = parseFloat(item.measurement.value);

      // Keep best performance
      if (!athlete.measurements[metric]) {
        athlete.measurements[metric] = value;
      } else {
        const metricInfo = await this.getMetricInfo(metric);
        if (metricInfo.lowerIsBetter) {
          athlete.measurements[metric] = Math.min(
            athlete.measurements[metric],
            value
          );
        } else {
          athlete.measurements[metric] = Math.max(
            athlete.measurements[metric],
            value
          );
        }
      }
    }

    // Calculate percentiles for each athlete
    const athletes = Array.from(athleteMap.values());

    for (const metric of metrics) {
      const values = athletes
        .filter((a) => a.measurements[metric] !== undefined)
        .map((a) => a.measurements[metric]);

      if (values.length === 0) continue;

      const metricInfo = await this.getMetricInfo(metric);

      for (const athlete of athletes) {
        if (athlete.measurements[metric] !== undefined) {
          const rank = quantileRank(values, athlete.measurements[metric]) * 100;
          athlete.percentiles[metric] = metricInfo.lowerIsBetter
            ? 100 - rank
            : rank;
        }
      }
    }

    // Populate benchmark comparisons if benchmarks are provided
    if (benchmarksByMetric) {
      for (const athlete of athletes) {
        for (const metric of metrics) {
          const value = athlete.measurements[metric];
          if (value === undefined) continue;

          const benchmarks = benchmarksByMetric[metric];
          if (!benchmarks || benchmarks.length === 0) continue;

          const metricInfo = await this.getMetricInfo(metric);

          athlete.benchmarkComparisons[metric] = benchmarks.map(benchmark => ({
            benchmarkName: benchmark.name,
            benchmarkValue: benchmark.value,
            meetsOrExceeds: metricInfo.lowerIsBetter
              ? value <= benchmark.value
              : value >= benchmark.value
          }));
        }
      }
    }

    // Calculate composite index if enabled
    if (compositeIndexConfig?.enabled && compositeIndexConfig.weights) {
      for (const athlete of athletes) {
        athlete.compositeIndex = this.calculateCompositeIndex(
          athlete.measurements,
          compositeIndexConfig.weights,
          athlete.percentiles
        );
      }

      // Sort by composite index
      athletes.sort((a, b) => (b.compositeIndex || 0) - (a.compositeIndex || 0));
    }

    return athletes;
  }

  private benchmarkMatchesAthlete(
    benchmark: any,
    athlete: any,
    athleteAge: number | undefined
  ): boolean {
    // Check gender filter
    if (benchmark.gender && benchmark.gender !== athlete.gender) {
      return false;
    }

    // Check age filter
    if (athleteAge !== undefined) {
      if (benchmark.ageMin && athleteAge < benchmark.ageMin) {
        return false;
      }
      if (benchmark.ageMax && athleteAge > benchmark.ageMax) {
        return false;
      }
    }

    // Check position filter
    if (
      benchmark.position &&
      athlete.positions &&
      !athlete.positions.includes(benchmark.position)
    ) {
      return false;
    }

    return true;
  }

  private createBenchmarkComparison(
    name: string,
    benchmarkValue: number,
    athleteValue: number,
    comparisonOperator: string
  ): BenchmarkComparison {
    let meetsTarget = false;

    switch (comparisonOperator) {
      case 'lte':
        meetsTarget = athleteValue <= benchmarkValue;
        break;
      case 'gte':
        meetsTarget = athleteValue >= benchmarkValue;
        break;
      case 'eq':
        meetsTarget = Math.abs(athleteValue - benchmarkValue) < 0.01;
        break;
    }

    const percentageDiff =
      benchmarkValue !== 0
        ? ((athleteValue - benchmarkValue) / benchmarkValue) * 100
        : 0;

    return {
      benchmarkName: name,
      benchmarkValue,
      athleteValue,
      meetsTarget,
      percentageDiff,
      comparisonOperator,
    };
  }

  private async getBenchmarksForReport(
    benchmarkConfig: ReportConfig['benchmarks'],
    organizationId: string,
    reportId: string
  ): Promise<Record<string, Array<{ name: string; value: number }>>> {
    console.log('[getBenchmarksForReport] Starting benchmark fetch:', {
      benchmarkConfig,
      organizationId,
      reportId
    });

    const benchmarksByMetric: Record<string, Array<{ name: string; value: number }>> = {};

    if (!benchmarkConfig) {
      console.log('[getBenchmarksForReport] No benchmark config provided');
      return benchmarksByMetric;
    }

    // Get user-defined benchmarks from the report
    if (benchmarkConfig.userDefined && benchmarkConfig.userDefined.length > 0) {
      for (const benchmark of benchmarkConfig.userDefined) {
        if (!benchmarksByMetric[benchmark.metricCode]) {
          benchmarksByMetric[benchmark.metricCode] = [];
        }
        benchmarksByMetric[benchmark.metricCode].push({
          name: benchmark.label,
          value: benchmark.value,
        });
      }
    }

    // Get site benchmarks
    if (benchmarkConfig.site && benchmarkConfig.site.length > 0) {
      const siteBenchmarksList = await db
        .select({
          benchmark: siteBenchmarks,
        })
        .from(siteBenchmarks)
        .innerJoin(
          organizationBenchmarks,
          and(
            eq(organizationBenchmarks.benchmarkId, siteBenchmarks.id),
            eq(organizationBenchmarks.benchmarkType, 'site'),
            eq(organizationBenchmarks.organizationId, organizationId),
            eq(organizationBenchmarks.isEnabled, true)
          )
        )
        .where(
          and(
            eq(siteBenchmarks.isActive, true),
            inArray(siteBenchmarks.id, benchmarkConfig.site)
          )
        );

      for (const { benchmark } of siteBenchmarksList) {
        if (!benchmarksByMetric[benchmark.metricCode]) {
          benchmarksByMetric[benchmark.metricCode] = [];
        }
        benchmarksByMetric[benchmark.metricCode].push({
          name: benchmark.name,
          value: parseFloat(benchmark.benchmarkValue),
        });
      }
    }

    // Get custom benchmarks
    if (benchmarkConfig.custom && benchmarkConfig.custom.length > 0) {
      console.log('[getBenchmarksForReport] Fetching custom benchmarks:', {
        benchmarkIds: benchmarkConfig.custom,
        organizationId,
        reportId
      });

      // Debug: Check if benchmarks exist in custom_benchmarks table
      const customBenchmarksCheck = await db
        .select()
        .from(customBenchmarks)
        .where(inArray(customBenchmarks.id, benchmarkConfig.custom));

      console.log('[getBenchmarksForReport] DEBUG - Custom benchmarks in custom_benchmarks table:', {
        count: customBenchmarksCheck.length,
        benchmarks: customBenchmarksCheck.map(b => ({ id: b.id, name: b.name, isActive: b.isActive, orgId: b.organizationId }))
      });

      // Debug: Check if benchmarks exist in organization_benchmarks table
      const orgBenchmarksCheck = await db
        .select()
        .from(organizationBenchmarks)
        .where(
          and(
            inArray(organizationBenchmarks.benchmarkId, benchmarkConfig.custom),
            eq(organizationBenchmarks.benchmarkType, 'custom'),
            eq(organizationBenchmarks.organizationId, organizationId)
          )
        );

      console.log('[getBenchmarksForReport] DEBUG - Custom benchmarks in organization_benchmarks table:', {
        count: orgBenchmarksCheck.length,
        benchmarks: orgBenchmarksCheck.map(b => ({ id: b.id, benchmarkId: b.benchmarkId, isEnabled: b.isEnabled }))
      });

      const customBenchmarksList = await db
        .select({
          benchmark: customBenchmarks,
        })
        .from(customBenchmarks)
        .innerJoin(
          organizationBenchmarks,
          and(
            eq(organizationBenchmarks.benchmarkId, customBenchmarks.id),
            eq(organizationBenchmarks.benchmarkType, 'custom'),
            eq(organizationBenchmarks.organizationId, organizationId),
            eq(organizationBenchmarks.isEnabled, true)
          )
        )
        .where(
          and(
            eq(customBenchmarks.organizationId, organizationId),
            eq(customBenchmarks.isActive, true),
            inArray(customBenchmarks.id, benchmarkConfig.custom)
          )
        );

      console.log('[getBenchmarksForReport] Custom benchmarks found:', {
        count: customBenchmarksList.length,
        benchmarks: customBenchmarksList.map(b => ({ id: b.benchmark.id, name: b.benchmark.name, metricCode: b.benchmark.metricCode }))
      });

      for (const { benchmark } of customBenchmarksList) {
        if (!benchmarksByMetric[benchmark.metricCode]) {
          benchmarksByMetric[benchmark.metricCode] = [];
        }
        benchmarksByMetric[benchmark.metricCode].push({
          name: benchmark.name,
          value: parseFloat(benchmark.benchmarkValue),
        });
      }
    }

    console.log('[getBenchmarksForReport] Final benchmarks by metric:', {
      totalMetrics: Object.keys(benchmarksByMetric).length,
      benchmarksByMetric
    });

    return benchmarksByMetric;
  }

  private async getMetricInfo(metricCode: string) {
    const metric = await db
      .select()
      .from(siteMetrics)
      .where(eq(siteMetrics.code, metricCode))
      .limit(1)
      .then((rows) => rows[0]);

    return (
      metric || {
        code: metricCode,
        lowerIsBetter: true,
      }
    );
  }
}
