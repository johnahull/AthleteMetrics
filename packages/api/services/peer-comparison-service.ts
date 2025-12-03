/**
 * Peer Comparison Service
 *
 * Phase 2.3: Cross-organization peer percentile comparisons
 *
 * Provides:
 * - Anonymous cross-org percentile calculations
 * - Pre-computed distribution caching
 * - Privacy-respecting peer pool filtering
 * - Integration with benchmark system
 */

import { db } from "../db";
import {
  users, measurements, globalAthletes, userGlobalAthleteLinks,
  peerPercentileCache, siteMetrics, userOrganizations, organizations,
  userTeams,
  type PeerPercentileCache, type User,
} from "@shared/schema";
import { eq, and, inArray, gte, lte, isNotNull, desc, sql } from "drizzle-orm";
import { BaseService } from "./base-service";
import { quantileRank, mean, quantile } from "simple-statistics";

/**
 * Filter criteria for peer pool selection
 */
export interface PeerFilterCriteria {
  ageRange?: [number, number];
  gender?: 'Male' | 'Female';
  orgTypes?: string[];
  sports?: string[];
  teamIds?: string[];  // Filter to specific teams (for "My Team(s)" scope)
}

/**
 * Percentile result for a single metric
 */
export interface PercentileResult {
  metric: string;
  athleteValue: number;
  percentile: number;
  sampleSize: number;
  label: string;
  message: string;
  distribution: {
    p25: number | null;
    p50: number | null;
    p75: number | null;
  };
}

/**
 * Distribution data from cache or computation
 */
export interface DistributionData {
  metricCode: string;
  filterCriteria: PeerFilterCriteria;
  sampleSize: number;
  p10: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  mean: number | null;
  computedAt: Date;
  expiresAt: Date;
}

/**
 * Percentile label configuration
 */
interface PercentileLabel {
  label: string;
  message: string;
  colorClass: string;
}

// Minimum sample size for statistically meaningful comparisons
const MIN_SAMPLE_SIZE = 10;

// Cache TTL in milliseconds (15 minutes default)
const CACHE_TTL_MS = 15 * 60 * 1000;

export class PeerComparisonService extends BaseService {

  // ========================================================================
  // PUBLIC API
  // ========================================================================

  /**
   * Get percentile rankings for an athlete across multiple metrics
   *
   * @param athleteId - The athlete's user ID
   * @param metrics - Array of metric codes to compare
   * @param filters - Optional peer pool filter criteria
   * @returns Array of percentile results for each metric
   */
  async getAthletePercentiles(
    athleteId: string,
    metrics: string[],
    filters?: PeerFilterCriteria
  ): Promise<PercentileResult[]> {
    try {
      // Get athlete details
      const athlete = await this.storage.getUser(athleteId);
      if (!athlete) {
        throw new Error(`Athlete not found: ${athleteId}`);
      }

      // Check if athlete wants to see peer comparisons (display preference)
      // Note: All athletes' data contributes to the peer pool regardless of this setting
      if (!athlete.showPeerComparisons) {
        throw new Error("Athlete has disabled peer comparison display");
      }

      // Get athlete's latest measurements for requested metrics
      const athleteMeasurements = await this.getLatestMeasurements(athleteId, metrics);

      const results: PercentileResult[] = [];

      for (const metric of metrics) {
        const athleteValue = athleteMeasurements.get(metric);
        if (athleteValue === undefined) {
          continue; // Skip metrics without measurements
        }

        // Get or compute distribution for this metric + filter combination
        const distribution = await this.getOrComputeDistribution(metric, filters || {});

        if (distribution.sampleSize < MIN_SAMPLE_SIZE) {
          // Not enough data for meaningful comparison
          results.push({
            metric,
            athleteValue,
            percentile: -1, // Indicates insufficient data
            sampleSize: distribution.sampleSize,
            label: "NOT ENOUGH DATA",
            message: "Not enough peers for comparison",
            distribution: {
              p25: null,
              p50: null,
              p75: null,
            },
          });
          continue;
        }

        // Get metric info to determine if lower is better
        const metricInfo = await this.getMetricInfo(metric);

        // Calculate percentile from peer pool
        const percentile = await this.calculatePercentile(
          athleteValue,
          metric,
          filters || {},
          metricInfo.lowerIsBetter
        );

        // Get label and message for the percentile
        const labelInfo = PeerComparisonService.getPercentileLabel(percentile);

        results.push({
          metric,
          athleteValue,
          percentile,
          sampleSize: distribution.sampleSize,
          label: labelInfo.label,
          message: labelInfo.message,
          distribution: {
            p25: distribution.p25 ? parseFloat(String(distribution.p25)) : null,
            p50: distribution.p50 ? parseFloat(String(distribution.p50)) : null,
            p75: distribution.p75 ? parseFloat(String(distribution.p75)) : null,
          },
        });
      }

      return results;
    } catch (error) {
      return this.handleError(error, "PeerComparisonService.getAthletePercentiles");
    }
  }

  /**
   * Get distribution data for a metric (anonymous aggregate only)
   */
  async getDistribution(
    metric: string,
    filters?: PeerFilterCriteria
  ): Promise<DistributionData> {
    try {
      return await this.getOrComputeDistribution(metric, filters || {});
    } catch (error) {
      return this.handleError(error, "PeerComparisonService.getDistribution");
    }
  }

  /**
   * Update user's peer comparison display preference
   * Note: This controls whether the user SEES peer comparisons, not whether they contribute data
   */
  async updateShowPeerComparisons(
    userId: string,
    showComparisons: boolean,
    requestingUserId: string
  ): Promise<void> {
    try {
      // Users can only update their own preference (or site admin can update any)
      const isSiteAdmin = await this.isSiteAdmin(requestingUserId);
      if (requestingUserId !== userId && !isSiteAdmin) {
        throw new Error("Unauthorized: Can only update your own peer comparison preference");
      }

      await db.update(users)
        .set({ showPeerComparisons: showComparisons })
        .where(eq(users.id, userId));

    } catch (error) {
      return this.handleError(error, "PeerComparisonService.updateShowPeerComparisons");
    }
  }

  /**
   * Get user's peer comparison display status
   * Note: This returns the display preference, not data sharing status (all data is shared)
   */
  async getPeerComparisonDisplayStatus(userId: string): Promise<{
    optedIn: boolean;  // Kept as 'optedIn' for API compatibility
    consentedAt: Date | null;  // Legacy field, kept for compatibility
  }> {
    try {
      const user = await this.storage.getUser(userId);
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      return {
        optedIn: user.showPeerComparisons,  // Maps showPeerComparisons to optedIn for API compatibility
        consentedAt: user.peerComparisonConsentedAt,  // Legacy field
      };
    } catch (error) {
      return this.handleError(error, "PeerComparisonService.getPeerComparisonDisplayStatus");
    }
  }

  // Backwards compatibility aliases
  async updatePeerComparisonOptIn(userId: string, optIn: boolean, requestingUserId: string): Promise<void> {
    return this.updateShowPeerComparisons(userId, optIn, requestingUserId);
  }

  async getPeerComparisonOptInStatus(userId: string): Promise<{ optedIn: boolean; consentedAt: Date | null }> {
    return this.getPeerComparisonDisplayStatus(userId);
  }

  // ========================================================================
  // PERCENTILE LABELS
  // ========================================================================

  /**
   * Translate percentile to user-friendly label and message
   */
  static getPercentileLabel(percentile: number): PercentileLabel {
    if (percentile >= 90) {
      return {
        label: "TOP 10%",
        message: "You're one of the best!",
        colorClass: "text-purple-600",
      };
    }
    if (percentile >= 75) {
      return {
        label: "TOP 25%",
        message: "Better than 3 out of 4 peers",
        colorClass: "text-blue-600",
      };
    }
    if (percentile >= 50) {
      return {
        label: "ABOVE AVERAGE",
        message: "Above the group average",
        colorClass: "text-green-600",
      };
    }
    if (percentile >= 25) {
      return {
        label: "BUILDING",
        message: "On track - keep pushing!",
        colorClass: "text-yellow-600",
      };
    }
    return {
      label: "DEVELOPING",
      message: "Every session counts!",
      colorClass: "text-orange-600",
    };
  }

  // ========================================================================
  // PRIVATE: PEER POOL & DISTRIBUTION
  // ========================================================================

  /**
   * Get global peer pool filtered by criteria
   * All active users' BEST measurements per metric are included (privacy-respecting via anonymization)
   * Note: No opt-in required - all active athletes contribute to the anonymous peer pool
   */
  private async getGlobalPeerPool(
    metric: string,
    filters: PeerFilterCriteria
  ): Promise<{ userId: string; value: number }[]> {
    const metricInfo = await this.getMetricInfo(metric);

    // Build filter conditions for users - all active users are included
    const userConditions: any[] = [
      eq(users.isActive, true),
    ];

    // Gender filter
    if (filters.gender) {
      userConditions.push(eq(users.gender, filters.gender));
    }

    // Age filter (requires birth date)
    if (filters.ageRange) {
      const [minAge, maxAge] = filters.ageRange;
      const today = new Date();
      const minBirthDate = new Date(today.getFullYear() - maxAge - 1, today.getMonth(), today.getDate());
      const maxBirthDate = new Date(today.getFullYear() - minAge, today.getMonth(), today.getDate());
      userConditions.push(
        isNotNull(users.birthDate),
        gte(users.birthDate, minBirthDate.toISOString().split('T')[0]),
        lte(users.birthDate, maxBirthDate.toISOString().split('T')[0])
      );
    }

    // Sports filter - check if user's sports array contains any of the filter sports
    // users.sports is a text[] column - we check for overlap with the filter (case-insensitive)
    if (filters.sports && filters.sports.length > 0) {
      // Use EXISTS with ILIKE for case-insensitive matching
      userConditions.push(
        sql`EXISTS (
          SELECT 1 FROM unnest(${users.sports}) AS user_sport
          WHERE user_sport ILIKE ANY(ARRAY[${sql.join(filters.sports.map(s => sql`${s}`), sql`, `)}])
        )`
      );
    }

    // Get users matching filters
    let eligibleUserIds: string[];

    // Team filter takes priority - if specified, only include users on those teams
    if (filters.teamIds && filters.teamIds.length > 0) {
      const eligibleUsers = await db
        .selectDistinct({ userId: users.id })
        .from(users)
        .innerJoin(userTeams, eq(users.id, userTeams.userId))
        .where(
          and(
            ...userConditions,
            inArray(userTeams.teamId, filters.teamIds)
          )
        );
      eligibleUserIds = eligibleUsers.map(u => u.userId);
    }
    // If org type filter is specified, we need to join through userOrganizations
    else if (filters.orgTypes && filters.orgTypes.length > 0) {
      // Cast to the enum type expected by the organizations.orgType column
      const orgTypeValues = filters.orgTypes as Array<'youth' | 'high_school' | 'college' | 'club' | 'private_facility' | 'elite_academy'>;
      const eligibleUsers = await db
        .selectDistinct({ userId: users.id })
        .from(users)
        .innerJoin(userOrganizations, eq(users.id, userOrganizations.userId))
        .innerJoin(organizations, eq(userOrganizations.organizationId, organizations.id))
        .where(
          and(
            ...userConditions,
            inArray(organizations.orgType, orgTypeValues)
          )
        );
      eligibleUserIds = eligibleUsers.map(u => u.userId);
    } else {
      // No team or org filter - include all active users
      const eligibleUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(and(...userConditions));
      eligibleUserIds = eligibleUsers.map(u => u.id);
    }

    if (eligibleUserIds.length === 0) {
      return [];
    }

    // Get all VERIFIED measurements for eligible users for this metric
    // Only verified (coach-entered) measurements are included in the peer pool
    // Self-entered (unverified) measurements are for personal tracking only
    const allMeasurements = await db
      .select({
        userId: measurements.userId,
        value: measurements.value,
      })
      .from(measurements)
      .where(
        and(
          eq(measurements.metric, metric),
          inArray(measurements.userId, eligibleUserIds),
          eq(measurements.isVerified, true)
        )
      );

    // Get best value per user (deduplicate for multi-org athletes)
    const bestByUser = new Map<string, number>();

    for (const m of allMeasurements) {
      const value = typeof m.value === 'string' ? parseFloat(m.value) : Number(m.value);
      const current = bestByUser.get(m.userId);

      if (current === undefined) {
        bestByUser.set(m.userId, value);
      } else {
        // For lower-is-better metrics, keep the lower value
        // For higher-is-better metrics, keep the higher value
        if (metricInfo.lowerIsBetter) {
          if (value < current) bestByUser.set(m.userId, value);
        } else {
          if (value > current) bestByUser.set(m.userId, value);
        }
      }
    }

    // Handle cross-org athletes via globalAthletes
    // Group by globalAthleteId if linked, otherwise by userId
    const linkedUsers = await db
      .select({
        userId: userGlobalAthleteLinks.userId,
        globalAthleteId: userGlobalAthleteLinks.globalAthleteId,
      })
      .from(userGlobalAthleteLinks)
      .where(
        and(
          eq(userGlobalAthleteLinks.linkStatus, 'confirmed'),
          inArray(userGlobalAthleteLinks.userId, eligibleUserIds)
        )
      );

    const userToGlobal = new Map(linkedUsers.map(l => [l.userId, l.globalAthleteId]));

    // Deduplicate by global athlete ID (take best across all linked accounts)
    const bestByGlobalOrUser = new Map<string, number>();

    for (const [userId, value] of bestByUser) {
      const key = userToGlobal.get(userId) || userId;
      const current = bestByGlobalOrUser.get(key);

      if (current === undefined) {
        bestByGlobalOrUser.set(key, value);
      } else {
        if (metricInfo.lowerIsBetter) {
          if (value < current) bestByGlobalOrUser.set(key, value);
        } else {
          if (value > current) bestByGlobalOrUser.set(key, value);
        }
      }
    }

    // Return as array (using key as userId identifier for privacy)
    return Array.from(bestByGlobalOrUser.entries()).map(([key, value]) => ({
      userId: key,
      value,
    }));
  }

  /**
   * Get or compute distribution for a metric + filter combination
   */
  async getOrComputeDistribution(
    metric: string,
    filters: PeerFilterCriteria
  ): Promise<DistributionData> {
    // Check cache first
    const cached = await this.getCachedDistribution(metric, filters);
    if (cached && new Date(cached.expiresAt) > new Date()) {
      return {
        metricCode: cached.metricCode,
        filterCriteria: cached.filterCriteria as PeerFilterCriteria,
        sampleSize: cached.sampleSize,
        p10: cached.p10 ? parseFloat(String(cached.p10)) : null,
        p25: cached.p25 ? parseFloat(String(cached.p25)) : null,
        p50: cached.p50 ? parseFloat(String(cached.p50)) : null,
        p75: cached.p75 ? parseFloat(String(cached.p75)) : null,
        p90: cached.p90 ? parseFloat(String(cached.p90)) : null,
        mean: cached.mean ? parseFloat(String(cached.mean)) : null,
        computedAt: new Date(cached.computedAt),
        expiresAt: new Date(cached.expiresAt),
      };
    }

    // Compute new distribution
    const peerPool = await this.getGlobalPeerPool(metric, filters);
    const values = peerPool.map(p => p.value).sort((a, b) => a - b);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + CACHE_TTL_MS);

    const distribution: DistributionData = {
      metricCode: metric,
      filterCriteria: filters,
      sampleSize: values.length,
      p10: values.length >= MIN_SAMPLE_SIZE ? quantile(values, 0.1) : null,
      p25: values.length >= MIN_SAMPLE_SIZE ? quantile(values, 0.25) : null,
      p50: values.length >= MIN_SAMPLE_SIZE ? quantile(values, 0.5) : null,
      p75: values.length >= MIN_SAMPLE_SIZE ? quantile(values, 0.75) : null,
      p90: values.length >= MIN_SAMPLE_SIZE ? quantile(values, 0.9) : null,
      mean: values.length >= MIN_SAMPLE_SIZE ? mean(values) : null,
      computedAt: now,
      expiresAt,
    };

    // Cache the result
    await this.cacheDistribution(distribution);

    return distribution;
  }

  /**
   * Calculate percentile for a specific value within the peer pool
   */
  private async calculatePercentile(
    athleteValue: number,
    metric: string,
    filters: PeerFilterCriteria,
    lowerIsBetter: boolean
  ): Promise<number> {
    const peerPool = await this.getGlobalPeerPool(metric, filters);
    const values = peerPool.map(p => p.value);

    if (values.length < MIN_SAMPLE_SIZE) {
      return -1;
    }

    // quantileRank returns a value from 0 to 1
    const rank = quantileRank(values, athleteValue) * 100;

    // For "lower is better" metrics, invert the percentile
    // So a faster time (lower value) gets a higher percentile
    return lowerIsBetter ? 100 - rank : rank;
  }

  // ========================================================================
  // PRIVATE: CACHE MANAGEMENT
  // ========================================================================

  /**
   * Get cached distribution if exists
   */
  private async getCachedDistribution(
    metric: string,
    filters: PeerFilterCriteria
  ): Promise<PeerPercentileCache | null> {
    const filterJson = JSON.stringify(this.normalizeFilters(filters));

    const cached = await db
      .select()
      .from(peerPercentileCache)
      .where(
        and(
          eq(peerPercentileCache.metricCode, metric),
          eq(sql`${peerPercentileCache.filterCriteria}::text`, filterJson)
        )
      )
      .limit(1);

    return cached[0] || null;
  }

  /**
   * Store distribution in cache
   */
  private async cacheDistribution(distribution: DistributionData): Promise<void> {
    const filterJson = this.normalizeFilters(distribution.filterCriteria);

    // Upsert the cache entry
    await db
      .insert(peerPercentileCache)
      .values({
        metricCode: distribution.metricCode,
        filterCriteria: filterJson,
        sampleSize: distribution.sampleSize,
        p10: distribution.p10?.toString(),
        p25: distribution.p25?.toString(),
        p50: distribution.p50?.toString(),
        p75: distribution.p75?.toString(),
        p90: distribution.p90?.toString(),
        mean: distribution.mean?.toString(),
        computedAt: distribution.computedAt,
        expiresAt: distribution.expiresAt,
      })
      .onConflictDoUpdate({
        target: [peerPercentileCache.metricCode, peerPercentileCache.filterCriteria],
        set: {
          sampleSize: distribution.sampleSize,
          p10: distribution.p10?.toString(),
          p25: distribution.p25?.toString(),
          p50: distribution.p50?.toString(),
          p75: distribution.p75?.toString(),
          p90: distribution.p90?.toString(),
          mean: distribution.mean?.toString(),
          computedAt: distribution.computedAt,
          expiresAt: distribution.expiresAt,
        },
      });
  }

  /**
   * Normalize filters for consistent cache keys
   */
  private normalizeFilters(filters: PeerFilterCriteria): PeerFilterCriteria {
    const normalized: PeerFilterCriteria = {};

    if (filters.ageRange) {
      normalized.ageRange = filters.ageRange;
    }
    if (filters.gender) {
      normalized.gender = filters.gender;
    }
    if (filters.orgTypes && filters.orgTypes.length > 0) {
      normalized.orgTypes = [...filters.orgTypes].sort();
    }
    if (filters.sports && filters.sports.length > 0) {
      // Normalize sports to uppercase for consistent cache keys
      normalized.sports = [...filters.sports].map(s => s.toUpperCase()).sort();
    }
    if (filters.teamIds && filters.teamIds.length > 0) {
      normalized.teamIds = [...filters.teamIds].sort();
    }

    return normalized;
  }

  /**
   * Clean up expired cache entries
   */
  async cleanupExpiredCache(): Promise<number> {
    const deleted = await db
      .delete(peerPercentileCache)
      .where(lte(peerPercentileCache.expiresAt, new Date()))
      .returning({ id: peerPercentileCache.id });

    return deleted.length;
  }

  // ========================================================================
  // PRIVATE: HELPERS
  // ========================================================================

  /**
   * Get metric info including lowerIsBetter flag
   */
  private async getMetricInfo(metricCode: string): Promise<{ lowerIsBetter: boolean }> {
    const metric = await db
      .select({ metricType: siteMetrics.metricType })
      .from(siteMetrics)
      .where(eq(siteMetrics.code, metricCode))
      .limit(1);

    return {
      // Default to lower_is_better for time-based metrics
      lowerIsBetter: metric[0]?.metricType === 'lower_is_better',
    };
  }

  /**
   * Get athlete's latest measurements for specified metrics
   */
  private async getLatestMeasurements(
    athleteId: string,
    metrics: string[]
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();

    // Get all measurements for the athlete for these metrics
    const athleteMeasurements = await db
      .select({
        metric: measurements.metric,
        value: measurements.value,
        date: measurements.date,
      })
      .from(measurements)
      .where(
        and(
          eq(measurements.userId, athleteId),
          inArray(measurements.metric, metrics)
        )
      )
      .orderBy(desc(measurements.date));

    // Keep only the latest for each metric
    for (const m of athleteMeasurements) {
      if (!result.has(m.metric)) {
        const value = typeof m.value === 'string' ? parseFloat(m.value) : Number(m.value);
        result.set(m.metric, value);
      }
    }

    return result;
  }
}

// Singleton export
export const peerComparisonService = new PeerComparisonService();
