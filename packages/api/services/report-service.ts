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
  events,
  organizations,
  type Report,
  type ReportSnapshot,
  type ReportBenchmark,
} from '@shared/schema';
import { eq, and, gte, lte, inArray, desc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { quantileRank, median, mean, min, max, standardDeviation } from 'simple-statistics';
import { BaseService } from './base-service';
import { evaluateTierBenchmark as evaluateTierBenchmarkPure } from './benchmark-tiers';
import { type MetricExplanation } from '@shared/metric-explanations';
import { getMetricExplanationsMap } from './metric-explanation-service';
import { assembleTrends } from './report-trends';
import { computeDistribution } from './report-distributions';
import { assembleTeamTrends, computeTeamDistribution } from './report-team-charts';
import { buildCohortLabel } from './cohort-label';
import { resolveChartSelection, resolveTeamChartSelection, type ChartSelection } from '@shared/report-charts';
import type { ReportTrends, ReportDistributions, TeamReportTrends, TeamReportDistributions } from '@shared/report-trends-types';
import type { BenchmarkComparison } from '@shared/benchmark-types';

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
  eventId?: string; // Filter measurements to specific event
  includeEventPercentiles?: boolean; // Compare against event participants
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
  showTrends?: boolean; // when true, individual reports include time-series trends
  charts?: Partial<ChartSelection>;
}

interface AthletePerformance {
  userId: string;
  userName: string;
  gender?: 'Male' | 'Female' | 'Not Specified';
  positions?: string[];
  age?: number;
  sports?: string[];
  teams?: string[];
  measurements: Record<string, number>;
  percentiles: Record<string, number>;
  eventPercentiles?: Record<string, number>; // Percentile within event participants
  teamAverages: Record<string, number>;
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

interface EventContext {
  eventId: string;
  eventName: string;
  eventDate: Date;
  participantCount: number;
}

interface OrgBranding {
  tagline?: string | null;
  orgName?: string | null;
}

interface TeamReportData {
  reportType: 'team';
  reportConfig: ReportConfig;
  teamStatistics: TeamStatistics[];
  athleteRankings: AthletePerformance[];
  generatedAt: string;
  teamIds: string[];
  athleteCount: number;
  metricLabels: Record<string, string>;
  metricUnits: Record<string, string>;
  metricExplanations: Record<string, MetricExplanation>;
  eventContext?: EventContext; // Present when eventId filter is used
  orgBranding?: OrgBranding;
  teamTrends?: TeamReportTrends; // present only when chartSelection.trends is true
  teamDistributions?: TeamReportDistributions; // present only when chartSelection.boxSwarm is true
  comparisonLabel?: string; // cohort name when filters narrow the roster (undefined = whole org/report scope)
}

interface IndividualReportData {
  reportType: 'individual';
  reportConfig: ReportConfig;
  athlete: AthletePerformance;
  generatedAt: string;
  metricLabels: Record<string, string>;
  metricUnits: Record<string, string>;
  metricExplanations: Record<string, MetricExplanation>;
  eventContext?: EventContext; // Present when eventId filter is used
  orgBranding?: OrgBranding;
  trends?: ReportTrends; // present only when reportConfig.showTrends is true
  distributions?: ReportDistributions;
  comparisonLabel?: string; // cohort name for the "Where You Stand" caption (undefined = org-wide)
}

export class ReportService extends BaseService {
  // Cache for metric info to prevent N+1 queries
  private metricInfoCache = new Map<string, { lowerIsBetter: boolean; metricType: string; name: string }>();

  /**
   * Get display labels and units for a list of metric codes
   */
  async getMetricLabelsAndUnits(metricCodes: string[]): Promise<{
    labels: Record<string, string>;
    units: Record<string, string>;
  }> {
    const labels: Record<string, string> = {};
    const units: Record<string, string> = {};

    // Fetch all metrics in one query
    const metrics = await db
      .select({
        code: siteMetrics.code,
        label: siteMetrics.label,
        unit: siteMetrics.unit,
      })
      .from(siteMetrics)
      .where(inArray(siteMetrics.code, metricCodes));

    for (const metric of metrics) {
      labels[metric.code] = metric.label;
      units[metric.code] = metric.unit || '';
    }

    // Fallback to code for any missing labels
    for (const code of metricCodes) {
      if (!labels[code]) {
        labels[code] = code;
      }
      if (!units[code]) {
        units[code] = '';
      }
    }

    return { labels, units };
  }

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

    // Calculate date range from timeframe
    const { startDate, endDate } = this.calculateDateRange(config.timeframe);

    // Get measurements based on filters (including eventId if specified)
    const measurementData = await this.getFilteredMeasurements(
      report.organizationId,
      config.metrics,
      config.filters,
      startDate,
      endDate,
      config.eventId
    );

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

    // Get athlete rankings with percentiles and benchmark comparisons
    const athleteRankings = await this.calculateAthleteRankings(
      measurementData,
      config.metrics,
      config.compositeIndex,
      reportId,
      benchmarksByMetric,
      config.includeEventPercentiles
    );

    // Get metric display labels and units
    const { labels: metricLabels, units: metricUnits } = await this.getMetricLabelsAndUnits(config.metrics);
    const metricExplanations = await getMetricExplanationsMap(
      config.metrics,
      report.organizationId,
    );

    const chartSelection = resolveTeamChartSelection(config);

    // Per-metric direction, computed unconditionally (getMetricInfo memoizes,
    // so this is cheap) so client components — including the public/anonymous
    // report view, which has no authenticated org context to derive this
    // itself — can evaluate tier standing correctly without a client hook.
    const directionInfos = await Promise.all(config.metrics.map(m => this.getMetricInfo(m)));
    const metricDirections: Record<string, 'higher' | 'lower'> = {};
    config.metrics.forEach((metric, i) => {
      metricDirections[metric] = directionInfos[i].lowerIsBetter ? 'lower' : 'higher';
    });

    // Build team-average time-series trends when the report opts in (additive; off by default)
    let teamTrends: TeamReportTrends | undefined;
    if (chartSelection.trends) {
      // Reuse the per-athlete benchmark comparisons already computed by
      // calculateAthleteRankings above — tier boundaries don't depend on which
      // athlete's value triggered the evaluation, so any athlete with a
      // comparison for the metric supplies the overlay for the whole team.
      const comparisonsByMetric: Record<string, BenchmarkComparison[]> = {};
      for (const metric of config.metrics) {
        const withComparison = athleteRankings.find(a => a.benchmarkComparisons[metric]?.length);
        comparisonsByMetric[metric] = withComparison?.benchmarkComparisons[metric] ?? [];
      }

      teamTrends = assembleTeamTrends(
        // Reuse measurementData already fetched for teamStatistics — do not re-query.
        measurementData.map(m => ({
          athleteId: m.measurement.userId,
          athleteName: m.user?.fullName || 'Unknown',
          metric: m.measurement.metric,
          date: typeof m.measurement.date === 'string'
            ? m.measurement.date
            : new Date(m.measurement.date).toISOString().split('T')[0],
          value: m.measurement.value,
        })),
        config.metrics,
        metricDirections,
        comparisonsByMetric,
      );
    }

    // Build the team-wide five-number-summary + per-athlete dots for box+swarm
    let teamDistributions: TeamReportDistributions | undefined;
    if (chartSelection.boxSwarm) {
      teamDistributions = {};
      for (const metric of config.metrics) {
        const athletesForMetric = athleteRankings
          .filter(a => a.measurements[metric] !== undefined)
          .map(a => ({ athleteId: a.userId, athleteName: a.userName, value: a.measurements[metric] }));
        const dist = computeTeamDistribution(athletesForMetric);
        if (dist) {
          teamDistributions[metric] = { ...dist, direction: metricDirections[metric] };
        }
      }
      if (Object.keys(teamDistributions).length === 0) teamDistributions = undefined;
    }

    // Human label for the roster cohort (names the group when filters narrow it),
    // matching the individual report's "Where You Stand" caption convention.
    const comparisonLabel = await this.resolveComparisonLabel(report.organizationId, config.filters);

    // Get event context if eventId is specified
    let eventContext: EventContext | undefined;
    if (config.eventId) {
      const event = await db
        .select()
        .from(events)
        .where(eq(events.id, config.eventId))
        .limit(1)
        .then((rows) => rows[0]);

      if (event) {
        eventContext = {
          eventId: event.id,
          eventName: event.name,
          eventDate: event.startDate,
          participantCount: athleteRankings.length,
        };
      }
    }

    const result = {
      reportType: 'team' as const,
      reportConfig: config,
      teamStatistics,
      athleteRankings,
      generatedAt: new Date().toISOString(),
      teamIds: config.filters?.teamIds || [],
      athleteCount: athleteRankings.length,
      metricLabels,
      metricUnits,
      metricExplanations,
      metricDirections,
      eventContext,
      teamTrends,
      teamDistributions,
      comparisonLabel,
    };

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

    // Get athlete measurements (filter by eventId if specified)
    const measurementConditions = [
      eq(measurements.userId, athleteId),
      eq(measurements.organizationId, report.organizationId),
      gte(measurements.date, startDate),
      lte(measurements.date, endDate),
      inArray(measurements.metric, config.metrics),
    ];

    if (config.eventId) {
      measurementConditions.push(eq(measurements.eventId, config.eventId));
    }

    const athleteMeasurements = await db
      .select()
      .from(measurements)
      .where(and(...measurementConditions))
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

    // Calculate percentiles and team averages against the report's peer cohort
    // (narrowed by config.filters — team/gender/positions — or the whole org when
    // no filters are set). eventId is intentionally NOT passed: the cohort spans
    // all events so the athlete is ranked against every comparable performance.
    const { percentiles, teamAverages, peerValues } = await this.calculatePercentilesAndAverages(
      athleteId,
      report.organizationId,
      config.metrics,
      bestPerformances,
      startDate,
      endDate,
      undefined, // eventId intentionally not passed - cohort spans all events
      config.filters
    );

    // Calculate event percentiles if requested
    let eventPercentiles: Record<string, number> | undefined;
    if (config.includeEventPercentiles && config.eventId) {
      const { percentiles: evtPercentiles } = await this.calculateEventPercentiles(
        athleteId,
        config.eventId,
        config.metrics,
        bestPerformances
      );
      eventPercentiles = evtPercentiles;
    }

    // Get benchmark comparisons
    const benchmarkComparisons = await this.getBenchmarkComparisons(
      athleteId,
      report.organizationId,
      reportId,
      bestPerformances,
      config
    );

    const chartSelection = resolveChartSelection(config);

    // Build time-series trends when the report opts in (additive; off by default)
    let trends: ReportTrends | undefined;
    if (chartSelection.trends) {
      const directions: Record<string, 'higher' | 'lower'> = {};
      // getMetricInfo memoizes, but a selected metric with no measurements in
      // range was not pre-warmed by the bestPerformances loop above — resolve
      // any remaining cold lookups concurrently instead of serially.
      const infos = await Promise.all(config.metrics.map(m => this.getMetricInfo(m)));
      config.metrics.forEach((metric, i) => {
        directions[metric] = infos[i].lowerIsBetter ? 'lower' : 'higher';
      });
      trends = assembleTrends(
        athleteMeasurements.map(m => ({
          metric: m.metric,
          date: typeof m.date === 'string' ? m.date : new Date(m.date).toISOString().split('T')[0],
          value: m.value,
        })),
        config.metrics,
        directions,
        benchmarkComparisons,
      );
    }

    let distributions: ReportDistributions | undefined;
    if (chartSelection.distribution) {
      distributions = {};
      for (const metric of config.metrics) {
        const athleteValue = bestPerformances[metric];
        if (athleteValue === undefined) continue;
        const dist = computeDistribution(peerValues[metric] ?? [], athleteValue);
        if (dist) {
          // getMetricInfo memoizes (warmed by the bestPerformances loop), so this
          // is a cache hit; direction lets the histogram annotate the "better" side.
          const info = await this.getMetricInfo(metric);
          distributions[metric] = { ...dist, direction: info.lowerIsBetter ? 'lower' : 'higher' };
        }
      }
      if (Object.keys(distributions).length === 0) distributions = undefined;
    }

    // Human label for the peer cohort (names the group in the "Where You Stand"
    // caption). Undefined when no filter narrows the cohort → frontend says "your group".
    const comparisonLabel = await this.resolveComparisonLabel(report.organizationId, config.filters);

    const athletePerformance: AthletePerformance = {
      userId: athlete.id,
      userName: athlete.fullName,
      gender: athlete.gender || undefined,
      positions: athlete.positions || undefined,
      age: athlete.birthYear
        ? new Date().getFullYear() - athlete.birthYear
        : undefined,
      sports: athlete.sports || undefined,
      teams: teamNames.length > 0 ? teamNames : undefined,
      measurements: bestPerformances,
      percentiles,
      eventPercentiles,
      teamAverages,
      benchmarkComparisons,
    };

    // Get metric display labels and units
    const { labels: metricLabels, units: metricUnits } = await this.getMetricLabelsAndUnits(config.metrics);
    const metricExplanations = await getMetricExplanationsMap(
      config.metrics,
      report.organizationId,
    );

    // Get event context if eventId is specified
    let eventContext: EventContext | undefined;
    if (config.eventId) {
      const event = await db
        .select()
        .from(events)
        .where(eq(events.id, config.eventId))
        .limit(1)
        .then((rows) => rows[0]);

      if (event) {
        // Count total participants in the event
        const participantCount = await db
          .select({ count: sql<number>`count(distinct ${measurements.userId})` })
          .from(measurements)
          .where(eq(measurements.eventId, config.eventId))
          .then((rows) => rows[0]?.count || 0);

        eventContext = {
          eventId: event.id,
          eventName: event.name,
          eventDate: event.startDate,
          participantCount,
        };
      }
    }

    return {
      reportType: 'individual',
      reportConfig: config,
      athlete: athletePerformance,
      generatedAt: new Date().toISOString(),
      metricLabels,
      metricUnits,
      metricExplanations,
      eventContext,
      trends,
      distributions,
      comparisonLabel,
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
   * Calculate percentiles and team averages for an athlete's performances
   */
  async calculatePercentilesAndAverages(
    athleteId: string,
    organizationId: string,
    metrics: string[],
    athletePerformances: Record<string, number>,
    startDate: string,
    endDate: string,
    eventId?: string,
    filters?: ReportFilters
  ): Promise<{ percentiles: Record<string, number>; teamAverages: Record<string, number>; peerValues: Record<string, number[]> }> {
    const percentiles: Record<string, number> = {};
    const teamAverages: Record<string, number> = {};
    const peerValues: Record<string, number[]> = {};

    // Peer cohort = org athletes narrowed by the report's filters (team / gender /
    // positions). With no filters this is the whole org (unchanged behavior). One
    // query for all metrics; grouped per metric below. This peer set feeds the
    // percentile, team average, AND the distribution, so they stay consistent.
    const cohortMeasurements = await this.getFilteredMeasurements(
      organizationId,
      metrics,
      filters,
      startDate,
      endDate,
      eventId
    );

    for (const metric of metrics) {
      if (athletePerformances[metric] === undefined) {
        continue;
      }

      // Get best performance per athlete within the cohort
      const athleteBestMap = new Map<string, number>();
      const metricInfo = await this.getMetricInfo(metric);

      for (const r of cohortMeasurements) {
        if (r.measurement.metric !== metric) continue;
        const value = parseFloat(r.measurement.value);
        const userId = r.measurement.userId;
        const current = athleteBestMap.get(userId);

        if (current === undefined) {
          athleteBestMap.set(userId, value);
        } else {
          if (metricInfo.lowerIsBetter) {
            if (value < current) athleteBestMap.set(userId, value);
          } else {
            if (value > current) athleteBestMap.set(userId, value);
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

        // Calculate team average (using best performance per athlete, same as team reports)
        teamAverages[metric] = mean(allValues);

        // Expose the per-metric peer best-values (EXCLUDING the focal athlete by
        // id) so callers (e.g. distributions) reuse this peer set without a second
        // query, and the athlete is never counted among their own peers — correct
        // even when an event filter makes the athlete's shown value differ from
        // their org-wide best.
        peerValues[metric] = Array.from(athleteBestMap.entries())
          .filter(([userId]) => userId !== athleteId)
          .map(([, value]) => value);
      }
    }

    return { percentiles, teamAverages, peerValues };
  }

  /**
   * Calculate event-specific percentiles (compare athlete to event participants only)
   */
  async calculateEventPercentiles(
    athleteId: string,
    eventId: string,
    metrics: string[],
    athletePerformances: Record<string, number>
  ): Promise<{ percentiles: Record<string, number> }> {
    const percentiles: Record<string, number> = {};

    for (const metric of metrics) {
      if (athletePerformances[metric] === undefined) {
        continue;
      }

      // Get all measurements for this metric in the event
      const eventMeasurements = await db
        .select({
          value: measurements.value,
          userId: measurements.userId,
        })
        .from(measurements)
        .where(
          and(
            eq(measurements.eventId, eventId),
            eq(measurements.metric, metric)
          )
        );

      // Get best performance per athlete in the event
      const athleteBestMap = new Map<string, number>();
      const metricInfo = await this.getMetricInfo(metric);

      for (const m of eventMeasurements) {
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

        // Calculate percentile rank within event participants
        const rank = quantileRank(allValues, athleteValue) * 100;
        percentiles[metric] = metricInfo.lowerIsBetter ? 100 - rank : rank;
      }
    }

    return { percentiles };
  }

  /**
   * Get benchmark comparisons for an athlete.
   * Called once per individual report (not per athlete in team reports —
   * team reports use calculateAthleteRankings with pre-fetched benchmarksByMetric).
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

    // Collect all benchmarks from all sources for unified processing.
    // Tag each with _source so tier group map keys are namespaced by table,
    // preventing theoretical cross-table tierGroupId collisions.
    // userDefinedBenchmarks (from reportBenchmarks table) don't have tier fields —
    // accessing .tierGroupId yields undefined, falling through to single-value path.
    const allBenchmarks: any[] = [
      ...userDefinedBenchmarks.map(b => ({ ...b, _source: 'report' })),
      ...siteBenchmarksList.map(({ benchmark }) => ({ ...benchmark, _source: 'site' })),
      ...customBenchmarksList.map(({ benchmark }) => ({ ...benchmark, _source: 'custom' })),
    ];

    // Collect tier group IDs and fetch all sibling tiers for distance-to-next calculation
    const tierGroupIds = [...new Set(
      allBenchmarks
        .filter(b => b.tierGroupId)
        .map(b => b.tierGroupId as string)
    )];

    // Build a map of source:tierGroupId -> all tiers in that group (sorted by tierOrder)
    const tierGroupMap = new Map<string, typeof allBenchmarks>();
    if (tierGroupIds.length > 0) {
      // Fetch all tiers from both tables in parallel
      const [siteTierRows, customTierRows] = await Promise.all([
        db.select().from(siteBenchmarks).where(and(
          inArray(siteBenchmarks.tierGroupId, tierGroupIds),
          eq(siteBenchmarks.isActive, true)
        )),
        db.select().from(customBenchmarks).where(and(
          inArray(customBenchmarks.tierGroupId, tierGroupIds),
          eq(customBenchmarks.isActive, true)
        )),
      ]);

      for (const tier of siteTierRows) {
        if (!tier.tierGroupId) continue;
        const key = `site:${tier.tierGroupId}`;
        const group = tierGroupMap.get(key) || [];
        group.push(tier);
        tierGroupMap.set(key, group);
      }

      for (const tier of customTierRows) {
        if (!tier.tierGroupId) continue;
        const key = `custom:${tier.tierGroupId}`;
        const group = tierGroupMap.get(key) || [];
        group.push(tier);
        tierGroupMap.set(key, group);
      }

      // Sort each group by tierOrder
      for (const [, tiers] of tierGroupMap) {
        tiers.sort((a, b) => (a.tierOrder || 0) - (b.tierOrder || 0));
      }
    }

    // Track which tier groups we've already processed per metric (avoid duplicate entries)
    const processedTierGroups = new Set<string>();

    // Process all benchmarks
    for (const [metricCode, athleteValue] of Object.entries(athletePerformances)) {
      comparisons[metricCode] = [];
      processedTierGroups.clear();

      for (const benchmark of allBenchmarks) {
        if (benchmark.metricCode !== metricCode) continue;
        // Note: we intentionally do NOT filter by benchmarkMatchesAthlete() here.
        // This applies to ALL benchmarks (both tier and single-value).
        // These benchmarks were explicitly selected by the user for this report,
        // so they should always appear regardless of athlete attribute filters
        // (gender, age, position). This means a coach may see a "Males 18+"
        // benchmark on a female athlete's report if they selected it — this is
        // a deliberate design choice: user selection overrides demographic filters.

        // Tier/range benchmark — use source-namespaced key to avoid cross-table collisions
        const tierMapKey = benchmark.tierGroupId ? `${benchmark._source}:${benchmark.tierGroupId}` : null;
        if (tierMapKey && tierGroupMap.has(tierMapKey)) {
          // Only process each tier group once per metric
          const groupKey = `${metricCode}:${tierMapKey}`;
          if (processedTierGroups.has(groupKey)) continue;
          processedTierGroups.add(groupKey);

          const allTiers = tierGroupMap.get(tierMapKey)!;
          const tierComparison = await this.evaluateTierBenchmark(
            athleteValue,
            metricCode,
            allTiers
          );
          if (tierComparison) {
            comparisons[metricCode].push(tierComparison);
          }
          continue;
        }

        // Single-value benchmark (existing behavior)
        if (!benchmark.benchmarkValue) continue;
        const comparison = this.createBenchmarkComparison(
          benchmark.name,
          parseFloat(benchmark.benchmarkValue),
          athleteValue,
          benchmark.comparisonOperator
        );
        comparisons[metricCode].push(comparison);
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

    // Embed org branding so the public report page can display org-specific tagline
    const org = await db
      .select({ name: organizations.name, brandTagline: organizations.brandTagline })
      .from(organizations)
      .where(eq(organizations.id, report.organizationId))
      .limit(1)
      .then((rows) => rows[0]);

    snapshotData = {
      ...snapshotData,
      orgBranding: {
        orgName: org?.name ?? null,
        tagline: org?.brandTagline ?? null,
      },
    };

    // Generate secure token
    const publicToken = nanoid(21);

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    // COPPA: detect minor athlete data at snapshot creation time.
    // IMPORTANT: use isMinor field (set at registration based on birthDate) —
    // NOT current age — because we need age-at-collection, not current age.
    // This flag is immutable after snapshot creation.
    let containsMinorData = false;
    try {
      const data = snapshotData as any;
      const athleteIds: string[] = [];

      // Collect athlete IDs from team or individual report
      if (report.reportType === 'individual') {
        const config = report.config as any;
        if (config?.athleteId) athleteIds.push(config.athleteId);
      } else if (data?.athletes) {
        for (const a of data.athletes) {
          if (a?.userId || a?.id) athleteIds.push(a.userId || a.id);
        }
      }

      if (athleteIds.length > 0) {
        const minorCheck = await db
          .select({ isMinor: users.isMinor })
          .from(users)
          .where(inArray(users.id, athleteIds));
        containsMinorData = minorCheck.some(u => u.isMinor === true);
      }
    } catch (err) {
      // Fail-closed: if we can't determine whether the snapshot contains minor
      // data, conservatively restrict public access. Better to over-restrict
      // than to expose COPPA-protected data publicly.
      console.error('[COPPA] Failed to check minor data in snapshot:', err);
      containsMinorData = true;
    }

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
        containsMinorData,
        publicAccessRestricted: containsMinorData,
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
    endDate: string,
    eventId?: string
  ) {
    let whereConditions = [
      eq(measurements.organizationId, organizationId),
      inArray(measurements.metric, metrics),
      gte(measurements.date, startDate),
      lte(measurements.date, endDate),
    ];

    // Apply event filter (when specified, ONLY include event measurements)
    if (eventId) {
      whereConditions.push(eq(measurements.eventId, eventId));
    }

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

    // Pre-fetch all metric configs to warm the cache and avoid N+1 queries
    await Promise.all(metrics.map(m => this.getMetricInfo(m)));

    // Performance optimization: Pre-group measurements by metric to avoid O(n×m) complexity
    // This reduces from O(n×m) to O(n+m) where n=measurements, m=metrics
    const measurementsByMetric = new Map<string, typeof measurementData>();
    for (const item of measurementData) {
      const metricCode = item.measurement.metric;
      if (!measurementsByMetric.has(metricCode)) {
        measurementsByMetric.set(metricCode, []);
      }
      measurementsByMetric.get(metricCode)!.push(item);
    }

    for (const metric of metrics) {
      // Get metric configuration to determine lowerIsBetter (from cache)
      const metricInfo = await this.getMetricInfo(metric);

      // Get only measurements for this specific metric (already filtered)
      const metricMeasurements = measurementsByMetric.get(metric) || [];

      // Group measurements by athlete to get best performance per athlete
      // This ensures each athlete contributes equally to statistics regardless of test frequency
      const athleteBestPerformances = new Map<string, { value: number; userName: string; units: string }>();

      for (const item of metricMeasurements) {
        const value = parseFloat(item.measurement.value);
        if (isNaN(value)) continue;

        const userId = item.measurement.userId;
        const userName = item.user?.fullName || 'Unknown';
        const units = item.measurement.units;

        if (!athleteBestPerformances.has(userId)) {
          // First measurement for this athlete
          athleteBestPerformances.set(userId, { value, userName, units });
        } else {
          // Update with best performance (userName updated to match best measurement)
          const current = athleteBestPerformances.get(userId)!;
          const shouldUpdate = metricInfo.lowerIsBetter
            ? value < current.value
            : value > current.value;

          if (shouldUpdate) {
            athleteBestPerformances.set(userId, { value, userName, units });
          }
        }
      }

      if (athleteBestPerformances.size === 0) {
        continue;
      }

      // Extract aggregated values (one per athlete)
      const aggregatedPerformances = Array.from(athleteBestPerformances.entries()).map(
        ([userId, perf]) => ({
          userId,
          userName: perf.userName,
          value: perf.value,
          units: perf.units,
        })
      );

      const values = aggregatedPerformances.map((p) => p.value);

      // Explicit check for empty values array for safety
      if (values.length === 0) {
        console.warn(`No valid values for metric ${metric} after aggregation`);
        continue;
      }

      // Find best overall performer from aggregated data
      const bestValue = metricInfo.lowerIsBetter ? Math.min(...values) : Math.max(...values);
      const topPerformer = aggregatedPerformances.find((p) => p.value === bestValue);

      // Use units from top performer for consistency, fallback to first athlete's units
      const units = topPerformer?.units || aggregatedPerformances[0]?.units || '';

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
    benchmarksByMetric?: Record<string, Array<{
      name: string;
      value: number | null;
      minValue?: number;
      maxValue?: number;
      comparisonOperator?: 'lte' | 'gte' | 'eq' | 'range';
      tierName?: string;
      tierColor?: string;
      tierGroupId?: string;
      tierOrder?: number;
      coachingNote?: string | null;
    }>>,
    includeEventPercentiles?: boolean
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
          eventPercentiles: {}, // Will be populated if includeEventPercentiles is true
          teamAverages: {},
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

    // Calculate percentiles and team averages for each athlete
    const athletes = Array.from(athleteMap.values());

    for (const metric of metrics) {
      const values = athletes
        .filter((a) => a.measurements[metric] !== undefined)
        .map((a) => a.measurements[metric]);

      if (values.length === 0) continue;

      const metricInfo = await this.getMetricInfo(metric);
      const teamAverage = mean(values);

      for (const athlete of athletes) {
        if (athlete.measurements[metric] !== undefined) {
          const rank = quantileRank(values, athlete.measurements[metric]) * 100;
          athlete.percentiles[metric] = metricInfo.lowerIsBetter
            ? 100 - rank
            : rank;
          athlete.teamAverages[metric] = teamAverage;

          // Calculate event percentiles if requested
          // For team reports with event filter, percentiles are already event-based
          // This adds explicit event percentiles for comparison
          if (includeEventPercentiles) {
            athlete.eventPercentiles[metric] = athlete.percentiles[metric];
          }
        }
      }
    }

    // Populate benchmark comparisons if benchmarks are provided
    if (benchmarksByMetric) {
      // Pre-group tier benchmarks by tierGroupId for evaluateTierBenchmark
      const tierGroupsByMetric = new Map<string, Map<string, any[]>>();
      // INVARIANT: benchmarksByMetric must contain ALL tiers for each tier group.
      // The ReportWizard enforces this by selecting all tier IDs atomically.
      // If a future caller provides partial tier groups, evaluateTierBenchmark
      // will produce incorrect results (missing tiers in the evaluation).
      // The individual report path (getBenchmarkComparisons) separately fetches
      // complete groups from the DB, so it's not affected.
      for (const [metric, benchmarks] of Object.entries(benchmarksByMetric)) {
        const tierGroups = new Map<string, any[]>();
        for (const b of benchmarks) {
          if (b.tierGroupId) {
            const group = tierGroups.get(b.tierGroupId) || [];
            group.push(b);
            tierGroups.set(b.tierGroupId, group);
          }
        }
        // Sort each group by tierOrder
        for (const [, tiers] of tierGroups) {
          tiers.sort((a, b) => (a.tierOrder || 0) - (b.tierOrder || 0));
        }
        if (tierGroups.size > 0) {
          tierGroupsByMetric.set(metric, tierGroups);
        }
      }

      // Pre-warm metric info cache to avoid sequential DB hits in the nested loop
      await Promise.all(metrics.map(m => this.getMetricInfo(m)));

      for (const athlete of athletes) {
        for (const metric of metrics) {
          const value = athlete.measurements[metric];
          if (value === undefined) continue;

          const benchmarks = benchmarksByMetric[metric];
          if (!benchmarks || benchmarks.length === 0) continue;

          const metricInfo = await this.getMetricInfo(metric); // cached from pre-warm
          const comparisons: any[] = [];
          const processedGroups = new Set<string>();

          for (const benchmark of benchmarks) {
            // Tier group benchmark — use evaluateTierBenchmark for proper tier assignment
            if (benchmark.tierGroupId) {
              if (processedGroups.has(benchmark.tierGroupId)) continue;
              processedGroups.add(benchmark.tierGroupId);

              const tierGroup = tierGroupsByMetric.get(metric)?.get(benchmark.tierGroupId);
              if (tierGroup) {
                const tierComparison = await this.evaluateTierBenchmark(value, metric, tierGroup);
                if (tierComparison) {
                  comparisons.push(tierComparison);
                }
              }
              continue;
            }

            // Single-value benchmark
            if (benchmark.value == null) continue;

            comparisons.push({
              benchmarkName: benchmark.name,
              benchmarkValue: benchmark.value,
              meetsOrExceeds: metricInfo.lowerIsBetter
                ? value <= benchmark.value
                : value >= benchmark.value,
              percentageDiff: benchmark.value !== 0
                ? ((value - benchmark.value) / benchmark.value) * 100
                : 0,
              comparisonOperator: benchmark.comparisonOperator || 'gte',
            });
          }

          athlete.benchmarkComparisons[metric] = comparisons;
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
      meetsOrExceeds: meetsTarget,
      percentageDiff,
      comparisonOperator,
    };
  }

  /**
   * Evaluate which tier an athlete's value falls into within a tier group,
   * and calculate distance to the next tier up.
   */
  private async evaluateTierBenchmark(
    athleteValue: number,
    metricCode: string,
    allTiers: any[]
  ): Promise<BenchmarkComparison | null> {
    const info = await this.getMetricInfo(metricCode);
    return evaluateTierBenchmarkPure(athleteValue, info.lowerIsBetter, allTiers);
  }

  private async getBenchmarksForReport(
    benchmarkConfig: ReportConfig['benchmarks'],
    organizationId: string,
    reportId: string
  ): Promise<Record<string, Array<{
    name: string;
    value: number | null;
    minValue?: number;
    maxValue?: number;
    comparisonOperator?: 'lte' | 'gte' | 'eq' | 'range';
    tierName?: string;
    tierColor?: string;
    tierGroupId?: string;
    tierOrder?: number;
    coachingNote?: string | null;
  }>>> {
    const benchmarksByMetric: Record<string, Array<{
      name: string;
      value: number | null;
      minValue?: number;
      maxValue?: number;
      comparisonOperator?: 'lte' | 'gte' | 'eq' | 'range';
      tierName?: string;
      tierColor?: string;
      tierGroupId?: string;
      tierOrder?: number;
      coachingNote?: string | null;
    }>> = {};

    if (!benchmarkConfig) {
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

        // Handle tier groups and range benchmarks (minValue/maxValue)
        if (benchmark.minValue != null && benchmark.maxValue != null) {
          benchmarksByMetric[benchmark.metricCode].push({
            name: benchmark.tierName || benchmark.name,
            value: null, // No single value for range benchmarks
            minValue: parseFloat(String(benchmark.minValue)),
            maxValue: parseFloat(String(benchmark.maxValue)),
            comparisonOperator: 'range',
            tierName: benchmark.tierName ?? undefined,
            tierColor: benchmark.tierColor ?? undefined,
            tierGroupId: benchmark.tierGroupId ?? undefined,
            tierOrder: benchmark.tierOrder ?? undefined,
            coachingNote: benchmark.coachingNote ?? null,
          });
        }
        // Handle single-value benchmarks (may also be part of a tier group with lte/gte operator)
        else if (benchmark.benchmarkValue != null) {
          benchmarksByMetric[benchmark.metricCode].push({
            name: benchmark.name,
            value: parseFloat(String(benchmark.benchmarkValue)),
            comparisonOperator: (benchmark.comparisonOperator as 'lte' | 'gte' | 'eq') ?? 'gte',
            tierName: benchmark.tierName ?? undefined,
            tierColor: benchmark.tierColor ?? undefined,
            tierGroupId: benchmark.tierGroupId ?? undefined,
            tierOrder: benchmark.tierOrder ?? undefined,
            coachingNote: benchmark.coachingNote ?? null,
          });
        }
        // Skip benchmarks with neither (invalid data)
      }
    }

    // Get custom benchmarks
    if (benchmarkConfig.custom && benchmarkConfig.custom.length > 0) {
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

      for (const { benchmark } of customBenchmarksList) {
        if (!benchmarksByMetric[benchmark.metricCode]) {
          benchmarksByMetric[benchmark.metricCode] = [];
        }

        // Handle tier groups and range benchmarks (minValue/maxValue)
        if (benchmark.minValue != null && benchmark.maxValue != null) {
          benchmarksByMetric[benchmark.metricCode].push({
            name: benchmark.tierName || benchmark.name,
            value: null, // No single value for range benchmarks
            minValue: parseFloat(String(benchmark.minValue)),
            maxValue: parseFloat(String(benchmark.maxValue)),
            comparisonOperator: 'range',
            tierName: benchmark.tierName ?? undefined,
            tierColor: benchmark.tierColor ?? undefined,
            tierGroupId: benchmark.tierGroupId ?? undefined,
            tierOrder: benchmark.tierOrder ?? undefined,
            // customBenchmarks doesn't carry coaching_note (site-level only)
            coachingNote: null,
          });
        }
        // Handle single-value benchmarks (may also be part of a tier group with lte/gte operator)
        else if (benchmark.benchmarkValue != null) {
          benchmarksByMetric[benchmark.metricCode].push({
            name: benchmark.name,
            value: parseFloat(String(benchmark.benchmarkValue)),
            comparisonOperator: (benchmark.comparisonOperator as 'lte' | 'gte' | 'eq') ?? 'gte',
            tierName: benchmark.tierName ?? undefined,
            tierColor: benchmark.tierColor ?? undefined,
            tierGroupId: benchmark.tierGroupId ?? undefined,
            tierOrder: benchmark.tierOrder ?? undefined,
            coachingNote: null,
          });
        }
        // Skip benchmarks with neither (invalid data)
      }
    }

    return benchmarksByMetric;
  }

  /**
   * Human label for a filter-narrowed cohort (e.g. "the Varsity Squad, Male"),
   * shared by both the individual "Where You Stand" caption and the team
   * report's roster caption. Undefined when no filter narrows the cohort.
   */
  private async resolveComparisonLabel(
    organizationId: string,
    filters: { teamIds?: string[]; gender?: string; positions?: string[] } | undefined,
  ): Promise<string | undefined> {
    if (!filters || !(filters.teamIds?.length || filters.gender || filters.positions?.length)) {
      return undefined;
    }
    let filterTeamNames: string[] = [];
    if (filters.teamIds?.length) {
      const rows = await db
        .select({ name: teams.name })
        .from(teams)
        // Scope to this report's org so a crafted cross-org teamId can't leak
        // another org's team name into the caption.
        .where(and(eq(teams.organizationId, organizationId), inArray(teams.id, filters.teamIds)))
        .orderBy(teams.name); // deterministic label order for multi-team cohorts
      filterTeamNames = rows.map((r) => r.name);
    }
    return buildCohortLabel(filterTeamNames, filters.gender, filters.positions);
  }

  private async getMetricInfo(metricCode: string) {
    // Check cache first to prevent N+1 queries
    if (this.metricInfoCache.has(metricCode)) {
      return this.metricInfoCache.get(metricCode)!;
    }

    const metric = await db
      .select()
      .from(siteMetrics)
      .where(eq(siteMetrics.code, metricCode))
      .limit(1)
      .then((rows) => rows[0]);

    const lowerIsBetter = metric?.metricType === 'lower_is_better';
    const result = metric
      ? { lowerIsBetter, metricType: metric.metricType, name: metric.label }
      : { lowerIsBetter: true, metricType: 'lower_is_better' as const, name: metricCode };

    // Cache the result
    this.metricInfoCache.set(metricCode, result);
    return result;
  }
}
