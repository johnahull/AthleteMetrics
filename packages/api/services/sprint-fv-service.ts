/**
 * SprintFvService - Database integration for sprint F-V profiles.
 *
 * Discovers eligible sessions from existing measurements,
 * generates profiles using the computation engine, and persists results.
 */

import { db } from '../db';
import {
  measurements,
  sprintFvProfiles,
  users,
  teams,
  siteMetrics,
  type SprintFvProfile,
} from '@shared/schema';
import { eq, and, gte, lte, lt, desc, inArray, sql, or, ilike, isNull } from 'drizzle-orm';
import { computeFvProfile } from './sprint-fv-computation';
import { classifyProfile, computeOptimalGap, computeDeltas, analyzeAcceleration, analyzePower, validateParameters } from './sprint-fv-analysis';
import type { SprintFvAnalysisJson } from '@shared/schema/tables/sprint-fv-profiles';

// Hardcoded split metric codes — maps metric code to distance in the code's unit
const SPLIT_METRICS: Record<string, number> = {
  'DASH_5YD': 5,
  'DASH_10YD': 10,
  'DASH_20YD': 20,
  'DASH_30YD': 30,
};

const SPLIT_METRIC_CODES = Object.keys(SPLIT_METRICS);
const YARDS_TO_METERS = 0.9144;
const MIN_SPLITS_REQUIRED = 3;

/**
 * Dynamically find all weight-related metric codes from site_metrics.
 * Falls back to 'WEIGHT' if no site metrics are configured.
 */
async function getWeightMetricCodes(): Promise<string[]> {
  const weightMetrics = await db
    .select({ code: siteMetrics.code })
    .from(siteMetrics)
    .where(and(
      eq(siteMetrics.isActive, true),
      or(
        ilike(siteMetrics.code, '%WEIGHT%'),
        and(
          eq(siteMetrics.category, 'Physical'),
          or(eq(siteMetrics.unit, 'lbs'), eq(siteMetrics.unit, 'kg')),
        ),
      ),
    ));

  const codes = weightMetrics.map(m => m.code);
  return codes.length > 0 ? codes : ['WEIGHT'];
}

/** Thrown for user-facing validation errors (insufficient data, missing weight, etc.) */
export class SprintFvValidationError extends Error {
  public readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'SprintFvValidationError';
  }
}

export interface EligibleSession {
  date: string;
  eventId: string | null;
  eventName: string | null;
  availableSplits: string[];
  hasWeight: boolean;
  profileExists: boolean;
  measurementIds: string[];
  duplicateSplits: number;
}

export interface GenerateProfileOptions {
  eventId?: string;
  bodyMassLbsOverride?: number;
  notes?: string;
}

export class SprintFvService {
  /**
   * Find sessions where an athlete has enough split data for F-V profiling.
   */
  async findEligibleSessions(
    userId: string,
    orgId?: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<EligibleSession[]> {
    // Query all split measurements for this athlete
    const conditions = [
      eq(measurements.userId, userId),
      inArray(measurements.metric, SPLIT_METRIC_CODES),
    ];
    if (orgId) conditions.push(eq(measurements.organizationId, orgId));
    if (dateFrom) conditions.push(gte(measurements.date, dateFrom));
    if (dateTo) conditions.push(lte(measurements.date, dateTo));

    const splitMeasurements = await db
      .select()
      .from(measurements)
      .where(and(...conditions))
      .orderBy(desc(measurements.date));

    // Group by eventId (primary) or date (fallback)
    const sessionMap = new Map<string, typeof splitMeasurements>();

    for (const m of splitMeasurements) {
      const key = m.eventId || `date:${m.date}`;
      if (!sessionMap.has(key)) sessionMap.set(key, []);
      sessionMap.get(key)!.push(m);
    }

    // Check for existing profiles
    const existingProfiles = await db
      .select({ date: sprintFvProfiles.date, eventId: sprintFvProfiles.eventId })
      .from(sprintFvProfiles)
      .where(eq(sprintFvProfiles.userId, userId));

    const existingKeys = new Set(
      existingProfiles.map(p => p.eventId || `date:${p.date}`)
    );

    // Check for weight: measurement table first, then user profile fallback
    const weightCodes = await getWeightMetricCodes();
    const weightMeasurements = await db
      .select({ date: measurements.date })
      .from(measurements)
      .where(and(
        eq(measurements.userId, userId),
        inArray(measurements.metric, weightCodes),
      ))
      .orderBy(desc(measurements.date))
      .limit(1);
    let hasAnyWeight = weightMeasurements.length > 0;

    if (!hasAnyWeight) {
      const [userProfile] = await db
        .select({ weight: users.weight })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      hasAnyWeight = !!userProfile?.weight;
    }

    // Build eligible sessions
    const sessions: EligibleSession[] = [];

    for (const [key, mList] of sessionMap) {
      const availableSplits = [...new Set(mList.map(m => m.metric))];
      if (availableSplits.length < MIN_SPLITS_REQUIRED) continue;

      const date = mList[0].date;
      const eventId = mList[0].eventId;

      const hasWeight = hasAnyWeight;
      const duplicateSplits = mList.length - availableSplits.length;

      sessions.push({
        date,
        eventId,
        eventName: mList[0].eventNameSnapshot,
        availableSplits,
        hasWeight,
        profileExists: existingKeys.has(key),
        measurementIds: mList.map(m => m.id),
        duplicateSplits,
      });
    }

    // Sort by date descending
    sessions.sort((a, b) => b.date.localeCompare(a.date));

    return sessions;
  }

  /**
   * Generate an F-V profile from existing measurement data.
   */
  async generateProfile(
    userId: string,
    date: string,
    submittedBy: string,
    options: GenerateProfileOptions = {},
  ): Promise<SprintFvProfile> {
    // 1. Fetch split measurements for this athlete on this date/event
    const conditions = [
      eq(measurements.userId, userId),
      inArray(measurements.metric, SPLIT_METRIC_CODES),
    ];
    if (options.eventId) {
      conditions.push(eq(measurements.eventId, options.eventId));
    } else {
      conditions.push(eq(measurements.date, date));
    }

    const splitMeasurements = await db
      .select()
      .from(measurements)
      .where(and(...conditions));

    if (splitMeasurements.length < MIN_SPLITS_REQUIRED) {
      throw new SprintFvValidationError(`Insufficient split data: found ${splitMeasurements.length} splits, need at least ${MIN_SPLITS_REQUIRED}`);
    }

    // 1b. When querying by date (no eventId), check for mixed-event data.
    // Merging splits from different events produces an inaccurate profile.
    if (!options.eventId) {
      const distinctEventIds = new Set(splitMeasurements.map(m => m.eventId).filter(Boolean));
      if (distinctEventIds.size > 1) {
        throw new SprintFvValidationError(
          `Multiple events found on ${date}. Please select a specific event to generate a profile from.`
        );
      }
    }

    // 2. Build split times map — pick fastest time per distance (handles duplicate trials)
    const splitTimes: Record<string, number> = {};
    const usedMeasurementIds: Record<string, string> = {};
    for (const m of splitMeasurements) {
      const distance = SPLIT_METRICS[m.metric];
      if (distance !== undefined) {
        const time = parseFloat(m.value);
        const key = String(distance);
        if (!(key in splitTimes) || time < splitTimes[key]) {
          splitTimes[key] = time;
          usedMeasurementIds[key] = m.id;
        }
      }
    }

    // 2b. Validate deduplicated split count (duplicates for same distance are collapsed above)
    const uniqueSplitCount = Object.keys(splitTimes).length;
    if (uniqueSplitCount < MIN_SPLITS_REQUIRED) {
      throw new SprintFvValidationError(
        `Insufficient unique splits: found ${uniqueSplitCount} distinct distances, need at least ${MIN_SPLITS_REQUIRED}`
      );
    }

    // 3. Determine distance unit (all split metrics are in yards based on code names)
    const distanceUnit = 'yards' as const;

    // 4. Get body mass
    let bodyMassKg: number;
    let weightMeasurementId: string | null = null;

    if (options.bodyMassLbsOverride) {
      bodyMassKg = options.bodyMassLbsOverride * 0.453592;
    } else {
      // Find most recent weight measurement for this athlete (any weight metric)
      const weightCodes = await getWeightMetricCodes();
      const [weightM] = await db
        .select()
        .from(measurements)
        .where(and(
          eq(measurements.userId, userId),
          inArray(measurements.metric, weightCodes),
        ))
        .orderBy(desc(measurements.date))
        .limit(1);

      if (weightM) {
        // Weight measurement found — convert to kg
        const weightValue = parseFloat(weightM.value);
        const unitLower = (weightM.units || '').toLowerCase();
        if (unitLower === 'kg') {
          bodyMassKg = weightValue;
        } else if (unitLower === 'lbs' || unitLower === 'lb') {
          bodyMassKg = weightValue * 0.453592;
        } else {
          throw new SprintFvValidationError(
            `Weight measurement has unrecognized unit '${weightM.units}'. Expected 'kg' or 'lbs'.`
          );
        }
        weightMeasurementId = weightM.id;
      } else {
        // Fallback: check user profile weight (set via general CSV import)
        const [userProfile] = await db
          .select({ weight: users.weight })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (!userProfile?.weight) {
          throw new SprintFvValidationError('No weight data found for this athlete. Enter a weight measurement or provide a manual override.');
        }

        // Profile weight is stored in lbs
        bodyMassKg = userProfile.weight * 0.453592;
      }
    }

    // 5. Compute the F-V profile
    const computed = computeFvProfile(splitTimes, bodyMassKg, distanceUnit);

    // 6. Get team/org context from the first measurement
    const firstM = splitMeasurements[0];
    const orgId = firstM.organizationId;
    const teamId = firstM.teamId;
    const teamNameSnapshot = firstM.teamNameSnapshot;

    // 6b. When eventId is specified, use the measurement's actual date to prevent
    // mismatches between the caller-supplied date and the real event date.
    if (options.eventId && firstM.date !== date) {
      date = firstM.date;
    }

    // 7. Compute sprint distance in meters for analysis
    const maxDistance = Math.max(...Object.keys(splitTimes).map(Number));
    const sprintDistanceM = maxDistance * YARDS_TO_METERS;

    // 8. Run analysis engine
    const classification = classifyProfile(computed.f0Rel, computed.v0, sprintDistanceM);
    const optimalGap = computeOptimalGap(
      computed.f0Rel, computed.v0, computed.pmaxRel, sprintDistanceM,
    );

    // 9. Acceleration and power analysis
    const accelerationProfile = analyzeAcceleration(computed.vmax, computed.tau, sprintDistanceM);
    const powerProfile = analyzePower(
      computed.f0Rel, computed.v0, computed.pmaxRel, computed.rfPeak, computed.drf,
    );

    // 9b. Parameter plausibility validation
    const parameterWarnings = validateParameters({
      f0Rel: computed.f0Rel,
      v0: computed.v0,
      tau: computed.tau,
      pmaxRel: computed.pmaxRel,
    });

    // 10. Atomic transaction: delta computation, duplicate check, delete, insert
    const profile = await db.transaction(async (tx) => {
      // 10a. Delta analysis against previous profile (inside tx for consistent read)
      const [previousProfile] = await tx
        .select()
        .from(sprintFvProfiles)
        .where(and(
          eq(sprintFvProfiles.userId, userId),
          lt(sprintFvProfiles.date, date),
        ))
        .orderBy(desc(sprintFvProfiles.date))
        .limit(1);

      let deltas: SprintFvAnalysisJson['deltas'];
      if (
        previousProfile
        && previousProfile.f0Rel && previousProfile.v0
        && previousProfile.pmaxRel && previousProfile.fvSlope
        && previousProfile.rfPeak && previousProfile.drf
      ) {
        deltas = computeDeltas(
          {
            f0Rel: computed.f0Rel, v0: computed.v0, pmaxRel: computed.pmaxRel,
            fvSlope: computed.fvSlope, rfPeak: computed.rfPeak, drf: computed.drf,
            date,
          },
          {
            f0Rel: parseFloat(previousProfile.f0Rel), v0: parseFloat(previousProfile.v0),
            pmaxRel: parseFloat(previousProfile.pmaxRel), fvSlope: parseFloat(previousProfile.fvSlope),
            rfPeak: parseFloat(previousProfile.rfPeak), drf: parseFloat(previousProfile.drf),
            date: previousProfile.date,
          },
        );
      }

      const analysisJson: SprintFvAnalysisJson = {
        parameterWarnings: parameterWarnings.length > 0 ? parameterWarnings : undefined,
        classification, optimalGap, accelerationProfile, powerProfile, deltas,
      };

      // 10b. Check for existing profile on this date/event.
      // Resolve eventId once: explicit option > measurement's event > null.
      // Use the same resolved value for both duplicate check and insert to
      // prevent mismatches that would create duplicate profiles.
      const resolvedEventId = options.eventId ?? firstM.eventId ?? null;

      const existingConditions = [
        eq(sprintFvProfiles.userId, userId),
        eq(sprintFvProfiles.date, date),
      ];
      if (resolvedEventId) {
        existingConditions.push(eq(sprintFvProfiles.eventId, resolvedEventId));
      } else {
        existingConditions.push(isNull(sprintFvProfiles.eventId));
      }
      const [existing] = await tx
        .select({ id: sprintFvProfiles.id })
        .from(sprintFvProfiles)
        .where(and(...existingConditions));

      if (existing) {
        await tx.delete(sprintFvProfiles).where(eq(sprintFvProfiles.id, existing.id));
      }

      const [inserted] = await tx
        .insert(sprintFvProfiles)
        .values({
          userId,
          submittedBy,
          organizationId: orgId,
          teamId,
          teamNameSnapshot,
          date,
          bodyMassKg: String(bodyMassKg),
          distanceUnit,
          splitTimesJson: splitTimes,
          sourceMeasurementIds: Object.values(usedMeasurementIds),
          weightMeasurementId,
          eventId: resolvedEventId,
          vmax: String(computed.vmax),
          tau: String(computed.tau),
          f0Rel: String(computed.f0Rel),
          v0: String(computed.v0),
          pmaxRel: String(computed.pmaxRel),
          fvSlope: String(computed.fvSlope),
          rfPeak: String(computed.rfPeak),
          drf: String(computed.drf),
          fitR2: String(computed.fitR2),
          fitResiduals: computed.fitResiduals,
          analysisJson,
          notes: options.notes || null,
        })
        .returning();

      return inserted;
    });

    return profile;
  }

  /**
   * For a given org, return each athlete's count of eligible sessions
   * (dates with >= MIN_SPLITS_REQUIRED distinct split metrics).
   * Used by the coach athlete-selector to show who has sprint data.
   */
  async getEligibleSummaryByOrg(orgId: string): Promise<
    Array<{ userId: string; eligibleSessionCount: number; latestDate: string }>
  > {
    // Two-step: Drizzle ORM query for eligible (user, date) pairs, then aggregate in JS.
    // Using inArray() ensures proper parameterization (no raw SQL interpolation).
    // Bounded to last 2 years to prevent unbounded scans on orgs with large histories.
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const dateLowerBound = twoYearsAgo.toISOString().slice(0, 10);

    const eligibleRows = await db
      .select({
        userId: measurements.userId,
        date: measurements.date,
      })
      .from(measurements)
      .where(and(
        eq(measurements.organizationId, orgId),
        inArray(measurements.metric, SPLIT_METRIC_CODES),
        gte(measurements.date, dateLowerBound),
      ))
      .groupBy(measurements.userId, measurements.date)
      .having(sql`COUNT(DISTINCT ${measurements.metric}) >= ${MIN_SPLITS_REQUIRED}`);

    // Aggregate per-user: count sessions and find latest date
    const userMap = new Map<string, { sessionCount: number; latestDate: string }>();
    for (const row of eligibleRows) {
      const existing = userMap.get(row.userId);
      if (!existing) {
        userMap.set(row.userId, { sessionCount: 1, latestDate: row.date });
      } else {
        existing.sessionCount++;
        if (row.date > existing.latestDate) existing.latestDate = row.date;
      }
    }

    return Array.from(userMap.entries()).map(([userId, info]) => ({
      userId,
      eligibleSessionCount: info.sessionCount,
      latestDate: info.latestDate,
    }));
  }

  async getById(id: string): Promise<SprintFvProfile | null> {
    const [profile] = await db
      .select()
      .from(sprintFvProfiles)
      .where(eq(sprintFvProfiles.id, id));
    return profile || null;
  }

  async listByAthlete(
    userId: string,
    filters: { dateFrom?: string; dateTo?: string; limit?: number; offset?: number } = {},
  ): Promise<{ profiles: SprintFvProfile[]; total: number }> {
    const conditions = [eq(sprintFvProfiles.userId, userId)];
    if (filters.dateFrom) conditions.push(gte(sprintFvProfiles.date, filters.dateFrom));
    if (filters.dateTo) conditions.push(lte(sprintFvProfiles.date, filters.dateTo));

    const where = and(...conditions);
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const [profiles, countResult] = await Promise.all([
      db.select().from(sprintFvProfiles).where(where)
        .orderBy(desc(sprintFvProfiles.date))
        .limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(sprintFvProfiles).where(where),
    ]);

    return { profiles, total: Number(countResult[0].count) };
  }

  async listByOrganization(
    orgId: string,
    filters: { userId?: string; dateFrom?: string; dateTo?: string; limit?: number; offset?: number } = {},
  ): Promise<{ profiles: SprintFvProfile[]; total: number }> {
    const conditions = [eq(sprintFvProfiles.organizationId, orgId)];
    if (filters.userId) conditions.push(eq(sprintFvProfiles.userId, filters.userId));
    if (filters.dateFrom) conditions.push(gte(sprintFvProfiles.date, filters.dateFrom));
    if (filters.dateTo) conditions.push(lte(sprintFvProfiles.date, filters.dateTo));

    const where = and(...conditions);
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const [profiles, countResult] = await Promise.all([
      db.select().from(sprintFvProfiles).where(where)
        .orderBy(desc(sprintFvProfiles.date))
        .limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(sprintFvProfiles).where(where),
    ]);

    return { profiles, total: Number(countResult[0].count) };
  }

  async delete(id: string): Promise<boolean> {
    const result = await db
      .delete(sprintFvProfiles)
      .where(eq(sprintFvProfiles.id, id))
      .returning({ id: sprintFvProfiles.id });
    return result.length > 0;
  }
}
