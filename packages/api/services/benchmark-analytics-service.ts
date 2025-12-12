/**
 * Benchmark Analytics Service
 * Provides analytics and aggregation functionality for benchmark tracking
 */

import { BaseService } from './base-service';
import { db } from '../db';
import {
  users,
  userTeams,
  teams,
  measurements,
  organizationBenchmarks,
  siteBenchmarks,
  customBenchmarks,
} from '@shared/schema';
import { eq, and, inArray, gte, lte, desc, sql } from 'drizzle-orm';

// Query result size limits to prevent OOM errors with large datasets
const MAX_MEASUREMENT_ROWS = 50000; // Maximum measurements to fetch per query
const MAX_DATE_RANGE_DAYS = 365;    // Maximum date range for progress queries (1 year)

export interface TeamBenchmarkAggregation {
  benchmarkId: string;
  benchmarkName: string;
  metricCode: string;
  benchmarkValue: number;
  comparisonOperator: 'lte' | 'gte' | 'eq';
  filters: {
    gender?: string;
    ageMin?: number;
    ageMax?: number;
    position?: string;
  };
  applicableAthletes: number;
  athletesMet: number;
  athletesNoData: number;
  achievementRate: number;
  averageProgress: number;
}

/**
 * Benchmark data formatted for chart overlay display.
 * Returned by getBenchmarksForMetric endpoint.
 */
export interface BenchmarkForMetric {
  /** Unique identifier */
  id: string;
  /** Display name for the benchmark line */
  name: string;
  /** Target value to display as horizontal line */
  benchmarkValue: number;
  /** Comparison operator for determining if benchmark is met */
  comparisonOperator: 'lte' | 'gte' | 'eq';
  /** Metric code this benchmark applies to */
  metricCode: string;
  /** Optional demographic filters for the benchmark */
  filters?: {
    gender?: string;
    ageMin?: number;
    ageMax?: number;
    position?: string;
  };
}

export interface AggregationOptions {
  teamIds?: string[];
  genders?: string[];
  birthYearFrom?: number;
  birthYearTo?: number;
  benchmarkIds?: string[];
}

export class BenchmarkAnalyticsService extends BaseService {
  /**
   * Get team benchmark aggregation for all enabled benchmarks
   * Returns achievement rates and progress metrics
   */
  async getTeamBenchmarkAggregation(
    organizationId: string,
    options?: AggregationOptions
  ): Promise<TeamBenchmarkAggregation[]> {
    try {
      // Get all enabled benchmarks for the organization
      const orgBenchmarks = await db
        .select()
        .from(organizationBenchmarks)
        .where(
          and(
            eq(organizationBenchmarks.organizationId, organizationId),
            eq(organizationBenchmarks.isEnabled, true)
          )
        );

      // If benchmarkIds filter is provided, filter the enabled benchmarks
      const filteredOrgBenchmarks = options?.benchmarkIds
        ? orgBenchmarks.filter((ob) => options.benchmarkIds!.includes(ob.benchmarkId))
        : orgBenchmarks;

      // Separate site and custom benchmark IDs
      const siteBenchmarkIds = filteredOrgBenchmarks
        .filter((ob) => ob.benchmarkType === 'site')
        .map((ob) => ob.benchmarkId);
      const customBenchmarkIds = filteredOrgBenchmarks
        .filter((ob) => ob.benchmarkType === 'custom')
        .map((ob) => ob.benchmarkId);

      // Fetch benchmark details
      const siteBenchmarksData =
        siteBenchmarkIds.length > 0
          ? await db.select().from(siteBenchmarks).where(inArray(siteBenchmarks.id, siteBenchmarkIds))
          : [];
      const customBenchmarksData =
        customBenchmarkIds.length > 0
          ? await db.select().from(customBenchmarks).where(inArray(customBenchmarks.id, customBenchmarkIds))
          : [];

      const allBenchmarks = [
        ...siteBenchmarksData.map((b) => ({ ...b, type: 'site' as const })),
        ...customBenchmarksData.map((b) => ({ ...b, type: 'custom' as const })),
      ];

      // Get all athletes in the organization
      const athletesQuery = db
        .selectDistinct({
          userId: users.id,
          birthDate: users.birthDate,
          gender: users.gender,
          positions: users.positions,
        })
        .from(users)
        .innerJoin(userTeams, eq(users.id, userTeams.userId))
        .innerJoin(teams, eq(userTeams.teamId, teams.id))
        .where(
          and(
            eq(teams.organizationId, organizationId),
            eq(userTeams.isActive, true),
            options?.teamIds ? inArray(teams.id, options.teamIds) : undefined,
            options?.genders && options.genders.length > 0
              ? inArray(users.gender, options.genders as ('Male' | 'Female' | 'Not Specified')[])
              : undefined
          )
        );

      const athletes = await athletesQuery;

      // Filter by birth year if specified
      const filteredAthletes = athletes.filter((athlete) => {
        if (!athlete.birthDate) return true; // Include athletes without birthDate

        const birthYear = new Date(athlete.birthDate).getFullYear();
        if (options?.birthYearFrom && birthYear < options.birthYearFrom) return false;
        if (options?.birthYearTo && birthYear > options.birthYearTo) return false;

        return true;
      });

      // Get all measurements for these athletes (filter by metric codes for efficiency)
      const athleteIds = filteredAthletes.map((a) => a.userId);
      const metricCodes = [...new Set(allBenchmarks.map(b => b.metricCode))];
      const allMeasurements =
        athleteIds.length > 0
          ? await db
              .select()
              .from(measurements)
              .where(
                and(
                  inArray(measurements.userId, athleteIds),
                  inArray(measurements.metric, metricCodes)
                )
              )
              .orderBy(desc(measurements.date))
              .limit(MAX_MEASUREMENT_ROWS) // Limit query result size to prevent OOM
          : [];

      // Group measurements by userId and metric (latest first)
      const latestMeasurementsByUserMetric = new Map<string, number>();
      for (const measurement of allMeasurements) {
        const key = `${measurement.userId}:${measurement.metric}`;
        if (!latestMeasurementsByUserMetric.has(key)) {
          const value =
            typeof measurement.value === 'string'
              ? parseFloat(measurement.value)
              : measurement.value;
          latestMeasurementsByUserMetric.set(key, value);
        }
      }

      // Process each benchmark
      const results: TeamBenchmarkAggregation[] = [];

      for (const benchmark of allBenchmarks) {
        // Filter athletes applicable to this benchmark
        const applicableAthletes = filteredAthletes.filter((athlete) =>
          this.isAthleteApplicableToBenchmark(athlete, benchmark)
        );

        let athletesMet = 0;
        let athletesNoData = 0;
        let totalProgress = 0;
        let athletesWithData = 0;

        for (const athlete of applicableAthletes) {
          const key = `${athlete.userId}:${benchmark.metricCode}`;
          const athleteValue = latestMeasurementsByUserMetric.get(key);

          if (athleteValue === undefined) {
            athletesNoData++;
          } else {
            athletesWithData++;
            const benchmarkValue =
              typeof benchmark.benchmarkValue === 'string'
                ? parseFloat(benchmark.benchmarkValue)
                : benchmark.benchmarkValue;

            const isMet = this.evaluateBenchmark(
              athleteValue,
              benchmarkValue,
              benchmark.comparisonOperator as 'lte' | 'gte' | 'eq'
            );

            if (isMet) {
              athletesMet++;
            }

            const progress = this.getBenchmarkProgress(
              athleteValue,
              benchmarkValue,
              benchmark.comparisonOperator as 'lte' | 'gte' | 'eq'
            );
            totalProgress += progress;
          }
        }

        const applicableCount = applicableAthletes.length;
        const achievementRate =
          applicableCount > 0 ? (athletesMet / applicableCount) * 100 : 0;
        const averageProgress = athletesWithData > 0 ? totalProgress / athletesWithData : 0;

        results.push({
          benchmarkId: benchmark.id,
          benchmarkName: benchmark.name,
          metricCode: benchmark.metricCode,
          benchmarkValue:
            typeof benchmark.benchmarkValue === 'string'
              ? parseFloat(benchmark.benchmarkValue)
              : benchmark.benchmarkValue,
          comparisonOperator: benchmark.comparisonOperator as 'lte' | 'gte' | 'eq',
          filters: {
            gender: benchmark.gender || undefined,
            ageMin: benchmark.ageMin || undefined,
            ageMax: benchmark.ageMax || undefined,
            position: benchmark.position || undefined,
          },
          applicableAthletes: applicableCount,
          athletesMet,
          athletesNoData,
          achievementRate,
          averageProgress,
        });
      }

      return results;
    } catch (error) {
      return this.handleError(error, 'BenchmarkAnalyticsService.getTeamBenchmarkAggregation');
    }
  }

  /**
   * Get all enabled benchmarks for a specific metric
   * Used for chart overlay feature
   */
  async getBenchmarksForMetric(
    organizationId: string,
    metricCode: string
  ): Promise<BenchmarkForMetric[]> {
    try {
      // Get all enabled benchmarks for the organization
      const orgBenchmarks = await db
        .select()
        .from(organizationBenchmarks)
        .where(
          and(
            eq(organizationBenchmarks.organizationId, organizationId),
            eq(organizationBenchmarks.isEnabled, true)
          )
        );

      // Separate site and custom benchmark IDs
      const siteBenchmarkIds = orgBenchmarks
        .filter((ob) => ob.benchmarkType === 'site')
        .map((ob) => ob.benchmarkId);
      const customBenchmarkIds = orgBenchmarks
        .filter((ob) => ob.benchmarkType === 'custom')
        .map((ob) => ob.benchmarkId);

      // Fetch benchmark details for the specified metric
      const siteBenchmarksData =
        siteBenchmarkIds.length > 0
          ? await db
              .select()
              .from(siteBenchmarks)
              .where(
                and(
                  inArray(siteBenchmarks.id, siteBenchmarkIds),
                  eq(siteBenchmarks.metricCode, metricCode)
                )
              )
          : [];

      const customBenchmarksData =
        customBenchmarkIds.length > 0
          ? await db
              .select()
              .from(customBenchmarks)
              .where(
                and(
                  inArray(customBenchmarks.id, customBenchmarkIds),
                  eq(customBenchmarks.metricCode, metricCode)
                )
              )
          : [];

      const allBenchmarks = [...siteBenchmarksData, ...customBenchmarksData];

      return allBenchmarks.map((benchmark) => ({
        id: benchmark.id,
        name: benchmark.name,
        benchmarkValue:
          typeof benchmark.benchmarkValue === 'string'
            ? parseFloat(benchmark.benchmarkValue)
            : benchmark.benchmarkValue,
        comparisonOperator: benchmark.comparisonOperator as 'lte' | 'gte' | 'eq',
        metricCode: benchmark.metricCode,
        filters: {
          gender: benchmark.gender ?? undefined,
          ageMin: benchmark.ageMin ?? undefined,
          ageMax: benchmark.ageMax ?? undefined,
          position: benchmark.position ?? undefined,
        },
      }));
    } catch (error) {
      return this.handleError(error, 'BenchmarkAnalyticsService.getBenchmarksForMetric');
    }
  }

  /**
   * Get benchmark progress over time
   * Returns time-series snapshots of benchmark achievement rates
   */
  async getBenchmarkProgressOverTime(
    organizationId: string,
    benchmarkId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      interval?: 'day' | 'week' | 'month';
      teamIds?: string[];
      genders?: string[];
    }
  ): Promise<{
    benchmarkId: string;
    benchmarkName: string;
    metricCode: string;
    benchmarkValue: number;
    snapshots: Array<{
      date: string;
      applicableAthletes: number;
      athletesMet: number;
      achievementRate: number;
    }>;
  }> {
    try {
      // Fetch the benchmark (try both site and custom)
      const siteBenchmark = await db
        .select()
        .from(siteBenchmarks)
        .where(eq(siteBenchmarks.id, benchmarkId))
        .limit(1);

      const customBenchmark = await db
        .select()
        .from(customBenchmarks)
        .where(eq(customBenchmarks.id, benchmarkId))
        .limit(1);

      const benchmark = siteBenchmark[0] || customBenchmark[0];
      if (!benchmark) {
        throw new Error(`Benchmark with id ${benchmarkId} not found`);
      }

      // Verify the benchmark is enabled for this organization
      const orgBenchmark = await db
        .select()
        .from(organizationBenchmarks)
        .where(
          and(
            eq(organizationBenchmarks.organizationId, organizationId),
            eq(organizationBenchmarks.benchmarkId, benchmarkId),
            eq(organizationBenchmarks.isEnabled, true)
          )
        )
        .limit(1);

      if (orgBenchmark.length === 0) {
        throw new Error(`Benchmark ${benchmarkId} is not enabled for organization ${organizationId}`);
      }

      // Set default date range (last 3 months if not specified)
      const endDate = options?.endDate || new Date();
      const startDate = options?.startDate || new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
      const interval = options?.interval || 'week';

      // Validate date range to prevent excessive data queries
      const daysDiff = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff > MAX_DATE_RANGE_DAYS) {
        throw new Error(`Date range exceeds maximum of ${MAX_DATE_RANGE_DAYS} days. Requested: ${daysDiff} days.`);
      }

      // Get all athletes in the organization
      const athletesQuery = db
        .selectDistinct({
          userId: users.id,
          birthDate: users.birthDate,
          gender: users.gender,
          positions: users.positions,
        })
        .from(users)
        .innerJoin(userTeams, eq(users.id, userTeams.userId))
        .innerJoin(teams, eq(userTeams.teamId, teams.id))
        .where(
          and(
            eq(teams.organizationId, organizationId),
            eq(userTeams.isActive, true),
            options?.teamIds ? inArray(teams.id, options.teamIds) : undefined,
            options?.genders && options.genders.length > 0
              ? inArray(users.gender, options.genders as ('Male' | 'Female' | 'Not Specified')[])
              : undefined
          )
        );

      const athletes = await athletesQuery;

      // Filter athletes applicable to this benchmark
      const applicableAthletes = athletes.filter((athlete) =>
        this.isAthleteApplicableToBenchmark(athlete, benchmark)
      );

      // Get all measurements for this metric in date range
      const athleteIds = applicableAthletes.map((a) => a.userId);
      const allMeasurements =
        athleteIds.length > 0
          ? await db
              .select()
              .from(measurements)
              .where(
                and(
                  inArray(measurements.userId, athleteIds),
                  eq(measurements.metric, benchmark.metricCode),
                  gte(measurements.date, startDate.toISOString()),
                  lte(measurements.date, endDate.toISOString())
                )
              )
              .orderBy(measurements.date)
              .limit(MAX_MEASUREMENT_ROWS) // Limit query result size to prevent OOM
          : [];

      // Generate time intervals
      const snapshots = this.generateTimeSnapshots(
        startDate,
        endDate,
        interval,
        applicableAthletes,
        allMeasurements,
        benchmark
      );

      return {
        benchmarkId: benchmark.id,
        benchmarkName: benchmark.name,
        metricCode: benchmark.metricCode,
        benchmarkValue:
          typeof benchmark.benchmarkValue === 'string'
            ? parseFloat(benchmark.benchmarkValue)
            : benchmark.benchmarkValue,
        snapshots,
      };
    } catch (error) {
      return this.handleError(error, 'BenchmarkAnalyticsService.getBenchmarkProgressOverTime');
    }
  }

  /**
   * Get athletes filtered by benchmark status (met/unmet/no_data)
   * Only returns athletes matching the benchmark's demographic filters
   */
  async getAthletesByBenchmarkStatus(
    organizationId: string,
    benchmarkId: string,
    status: 'met' | 'unmet' | 'no_data',
    options?: Omit<AggregationOptions, 'benchmarkIds'>
  ): Promise<string[]> {
    try {
      // Fetch the benchmark (try both site and custom)
      const siteBenchmark = await db
        .select()
        .from(siteBenchmarks)
        .where(eq(siteBenchmarks.id, benchmarkId))
        .limit(1);

      const customBenchmark = await db
        .select()
        .from(customBenchmarks)
        .where(eq(customBenchmarks.id, benchmarkId))
        .limit(1);

      const benchmark = siteBenchmark[0] || customBenchmark[0];
      if (!benchmark) {
        throw new Error(`Benchmark with id ${benchmarkId} not found`);
      }

      // Verify the benchmark is enabled for this organization
      const orgBenchmark = await db
        .select()
        .from(organizationBenchmarks)
        .where(
          and(
            eq(organizationBenchmarks.organizationId, organizationId),
            eq(organizationBenchmarks.benchmarkId, benchmarkId),
            eq(organizationBenchmarks.isEnabled, true)
          )
        )
        .limit(1);

      if (orgBenchmark.length === 0) {
        throw new Error(`Benchmark ${benchmarkId} is not enabled for organization ${organizationId}`);
      }

      // Get all athletes in the organization
      const athletesQuery = db
        .selectDistinct({
          userId: users.id,
          birthDate: users.birthDate,
          gender: users.gender,
          positions: users.positions,
        })
        .from(users)
        .innerJoin(userTeams, eq(users.id, userTeams.userId))
        .innerJoin(teams, eq(userTeams.teamId, teams.id))
        .where(
          and(
            eq(teams.organizationId, organizationId),
            eq(userTeams.isActive, true),
            options?.teamIds ? inArray(teams.id, options.teamIds) : undefined,
            options?.genders && options.genders.length > 0
              ? inArray(users.gender, options.genders as ('Male' | 'Female' | 'Not Specified')[])
              : undefined
          )
        );

      const athletes = await athletesQuery;

      // Filter by birth year if specified
      const filteredAthletes = athletes.filter((athlete) => {
        if (!athlete.birthDate) return true;

        const birthYear = new Date(athlete.birthDate).getFullYear();
        if (options?.birthYearFrom && birthYear < options.birthYearFrom) return false;
        if (options?.birthYearTo && birthYear > options.birthYearTo) return false;

        return true;
      });

      // Filter athletes applicable to this benchmark
      const applicableAthletes = filteredAthletes.filter((athlete) =>
        this.isAthleteApplicableToBenchmark(athlete, benchmark)
      );

      // Get latest measurements for these athletes for this metric
      const athleteIds = applicableAthletes.map((a) => a.userId);
      const allMeasurements =
        athleteIds.length > 0
          ? await db
              .select()
              .from(measurements)
              .where(
                and(
                  inArray(measurements.userId, athleteIds),
                  eq(measurements.metric, benchmark.metricCode)
                )
              )
              .orderBy(desc(measurements.date))
          : [];

      // Get latest measurement for each athlete
      const latestMeasurementByUser = new Map<string, number>();
      for (const measurement of allMeasurements) {
        if (!latestMeasurementByUser.has(measurement.userId)) {
          const value =
            typeof measurement.value === 'string'
              ? parseFloat(measurement.value)
              : measurement.value;
          latestMeasurementByUser.set(measurement.userId, value);
        }
      }

      // Filter athletes by status
      const resultAthleteIds: string[] = [];

      for (const athlete of applicableAthletes) {
        const athleteValue = latestMeasurementByUser.get(athlete.userId);

        if (athleteValue === undefined) {
          // No data
          if (status === 'no_data') {
            resultAthleteIds.push(athlete.userId);
          }
        } else {
          // Has data
          const benchmarkValue =
            typeof benchmark.benchmarkValue === 'string'
              ? parseFloat(benchmark.benchmarkValue)
              : benchmark.benchmarkValue;

          const isMet = this.evaluateBenchmark(
            athleteValue,
            benchmarkValue,
            benchmark.comparisonOperator as 'lte' | 'gte' | 'eq'
          );

          if (status === 'met' && isMet) {
            resultAthleteIds.push(athlete.userId);
          } else if (status === 'unmet' && !isMet) {
            resultAthleteIds.push(athlete.userId);
          }
        }
      }

      return resultAthleteIds;
    } catch (error) {
      return this.handleError(error, 'BenchmarkAnalyticsService.getAthletesByBenchmarkStatus');
    }
  }

  // ========================================================================
  // HELPER METHODS
  // ========================================================================

  /**
   * Check if an athlete is applicable to a benchmark based on demographic filters
   */
  private isAthleteApplicableToBenchmark(
    athlete: {
      birthDate: string | null;
      gender: string | null;
      positions: string[] | null;
    },
    benchmark: {
      gender: string | null;
      ageMin: number | null;
      ageMax: number | null;
      position: string | null;
    }
  ): boolean {
    // Gender filter
    if (benchmark.gender !== null && athlete.gender !== benchmark.gender) {
      return false;
    }

    // Age filter
    if (benchmark.ageMin !== null || benchmark.ageMax !== null) {
      if (!athlete.birthDate) {
        return false; // Cannot determine age
      }

      const age = this.calculateAge(athlete.birthDate);

      if (benchmark.ageMin !== null && age < benchmark.ageMin) {
        return false;
      }

      if (benchmark.ageMax !== null && age > benchmark.ageMax) {
        return false;
      }
    }

    // Position filter
    if (benchmark.position !== null) {
      if (!athlete.positions || athlete.positions.length === 0) {
        return false;
      }

      if (!athlete.positions.includes(benchmark.position)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Calculate age from birthDate
   */
  private calculateAge(birthDate: string): number {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  /**
   * Evaluate if an athlete's value meets a benchmark
   */
  private evaluateBenchmark(
    athleteValue: number,
    benchmarkValue: number,
    operator: 'lte' | 'gte' | 'eq'
  ): boolean {
    switch (operator) {
      case 'lte':
        return athleteValue <= benchmarkValue;
      case 'gte':
        return athleteValue >= benchmarkValue;
      case 'eq':
        return athleteValue === benchmarkValue;
      default:
        throw new Error(`Invalid comparison operator: ${operator}`);
    }
  }

  /**
   * Calculate progress percentage towards a benchmark
   */
  private getBenchmarkProgress(
    athleteValue: number,
    benchmarkValue: number,
    operator: 'lte' | 'gte' | 'eq'
  ): number {
    if (operator === 'eq') {
      return athleteValue === benchmarkValue ? 100 : 0;
    }

    if (benchmarkValue === 0) {
      return athleteValue === 0 ? 100 : 0;
    }

    if (operator === 'lte') {
      // Lower is better - cap at 100% for overachievement
      return Math.min((benchmarkValue / athleteValue) * 100, 100);
    } else {
      // gte: Higher is better - cap at 100% for overachievement
      return Math.min((athleteValue / benchmarkValue) * 100, 100);
    }
  }

  /**
   * Generate time snapshots for benchmark progress
   * For each interval, compute how many applicable athletes had met the benchmark by that date
   * Uses each athlete's best measurement up to that date
   */
  private generateTimeSnapshots(
    startDate: Date,
    endDate: Date,
    interval: 'day' | 'week' | 'month',
    applicableAthletes: Array<{
      userId: string;
      birthDate: string | null;
      gender: string | null;
      positions: string[] | null;
    }>,
    allMeasurements: Array<{
      id: string;
      userId: string;
      date: string;
      metric: string;
      value: string | number;
      units: string;
      age: number | null;
      submittedBy: string;
      isVerified: boolean;
    }>,
    benchmark: {
      id: string;
      name: string;
      metricCode: string;
      benchmarkValue: string | number;
      comparisonOperator: string;
      gender: string | null;
      ageMin: number | null;
      ageMax: number | null;
      position: string | null;
    }
  ): Array<{
    date: string;
    applicableAthletes: number;
    athletesMet: number;
    achievementRate: number;
  }> {
    const snapshots: Array<{
      date: string;
      applicableAthletes: number;
      athletesMet: number;
      achievementRate: number;
    }> = [];

    // Generate interval dates
    const intervalDates: Date[] = [];
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      intervalDates.push(new Date(currentDate));

      // Increment by interval
      if (interval === 'day') {
        currentDate.setDate(currentDate.getDate() + 1);
      } else if (interval === 'week') {
        currentDate.setDate(currentDate.getDate() + 7);
      } else if (interval === 'month') {
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
    }

    // Pre-sort measurements by date for efficient processing
    // O(n log n) sorting once instead of O(n*m) nested loops
    const sortedMeasurements = allMeasurements
      .map(m => ({
        ...m,
        dateTime: new Date(m.date).getTime(),
        numericValue: typeof m.value === 'string' ? parseFloat(m.value) : m.value,
      }))
      .sort((a, b) => a.dateTime - b.dateTime);

    const benchmarkValue =
      typeof benchmark.benchmarkValue === 'string'
        ? parseFloat(benchmark.benchmarkValue)
        : benchmark.benchmarkValue;
    const operator = benchmark.comparisonOperator as 'lte' | 'gte' | 'eq';

    // For each interval, compute achievement rate
    for (const snapshotDate of intervalDates) {
      const snapshotTime = snapshotDate.getTime();

      // Get best measurement for each athlete up to this date
      const bestMeasurementsByAthlete = new Map<string, number>();

      // Single pass through sorted measurements - break early when future dates reached
      for (const measurement of sortedMeasurements) {
        // Since measurements are sorted by date, we can break once we exceed snapshot date
        if (measurement.dateTime > snapshotTime) break;

        const athleteId = measurement.userId;
        const value = measurement.numericValue;

        const currentBest = bestMeasurementsByAthlete.get(athleteId);

        // Update if this is the first measurement or a better one
        if (currentBest === undefined) {
          bestMeasurementsByAthlete.set(athleteId, value);
        } else {
          // Determine if new value is better
          const isBetter = this.isBetterValue(value, currentBest, operator);
          if (isBetter) {
            bestMeasurementsByAthlete.set(athleteId, value);
          }
        }
      }

      // Count how many athletes met the benchmark
      let athletesMet = 0;

      for (const athlete of applicableAthletes) {
        const bestValue = bestMeasurementsByAthlete.get(athlete.userId);
        if (bestValue !== undefined) {
          const isMet = this.evaluateBenchmark(
            bestValue,
            benchmarkValue,
            operator
          );

          if (isMet) {
            athletesMet++;
          }
        }
      }

      const applicableCount = applicableAthletes.length;
      const achievementRate = applicableCount > 0 ? (athletesMet / applicableCount) * 100 : 0;

      snapshots.push({
        date: snapshotDate.toISOString().split('T')[0],
        applicableAthletes: applicableCount,
        athletesMet,
        achievementRate,
      });
    }

    return snapshots;
  }

  /**
   * Determine if a new value is better than the current best based on operator
   */
  private isBetterValue(newValue: number, currentBest: number, operator: 'lte' | 'gte' | 'eq'): boolean {
    if (operator === 'lte') {
      // Lower is better
      return newValue < currentBest;
    } else if (operator === 'gte') {
      // Higher is better
      return newValue > currentBest;
    } else {
      // 'eq': not really a "better" concept, but we'll keep the new value
      return true;
    }
  }
}
