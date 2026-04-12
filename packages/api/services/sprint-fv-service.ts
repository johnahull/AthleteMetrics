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
  type SprintFvProfile,
} from '@shared/schema';
import { eq, and, gte, lte, lt, desc, inArray, sql } from 'drizzle-orm';
import { computeFvProfile } from './sprint-fv-computation';
import { classifyProfile, computeOptimalGap, computeDeltas } from './sprint-fv-analysis';
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
    const weightMeasurements = await db
      .select({ date: measurements.date })
      .from(measurements)
      .where(and(
        eq(measurements.userId, userId),
        eq(measurements.metric, 'WEIGHT'),
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

      sessions.push({
        date,
        eventId,
        eventName: mList[0].eventNameSnapshot,
        availableSplits,
        hasWeight,
        profileExists: existingKeys.has(key),
        measurementIds: mList.map(m => m.id),
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

    // 2. Build split times map
    const splitTimes: Record<string, number> = {};
    for (const m of splitMeasurements) {
      const distance = SPLIT_METRICS[m.metric];
      if (distance !== undefined) {
        splitTimes[String(distance)] = parseFloat(m.value);
      }
    }

    // 3. Determine distance unit (all split metrics are in yards based on code names)
    const distanceUnit = 'yards' as const;

    // 4. Get body mass
    let bodyMassKg: number;
    let weightMeasurementId: string | null = null;

    if (options.bodyMassLbsOverride) {
      bodyMassKg = options.bodyMassLbsOverride * 0.453592;
    } else {
      // Find most recent WEIGHT measurement for this athlete
      const [weightM] = await db
        .select()
        .from(measurements)
        .where(and(
          eq(measurements.userId, userId),
          eq(measurements.metric, 'WEIGHT'),
        ))
        .orderBy(desc(measurements.date))
        .limit(1);

      if (weightM) {
        // Weight measurement found — stored in lbs, convert to kg
        const weightValue = parseFloat(weightM.value);
        bodyMassKg = weightM.units === 'kg' ? weightValue : weightValue * 0.453592;
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

    // 7. Compute sprint distance in meters for analysis
    const maxDistance = Math.max(...Object.keys(splitTimes).map(Number));
    const sprintDistanceM = maxDistance * YARDS_TO_METERS;

    // 8. Run analysis engine
    const classification = classifyProfile(computed.f0Rel, computed.v0, sprintDistanceM);
    const optimalGap = computeOptimalGap(
      computed.f0Rel, computed.v0, computed.pmaxRel, bodyMassKg, sprintDistanceM,
    );

    // 9. Delta analysis against previous profile (strictly before current date)
    const [previousProfile] = await db
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

    const analysisJson: SprintFvAnalysisJson = { classification, optimalGap, deltas };

    // 10. Check for existing profile on this date/event (prevent duplicates)
    const existingConditions = [
      eq(sprintFvProfiles.userId, userId),
      eq(sprintFvProfiles.date, date),
    ];
    if (options.eventId) {
      existingConditions.push(eq(sprintFvProfiles.eventId, options.eventId));
    }
    const [existing] = await db
      .select({ id: sprintFvProfiles.id })
      .from(sprintFvProfiles)
      .where(and(...existingConditions))
      .limit(1);

    // 11. Atomic delete-then-insert inside a transaction to prevent data loss on failure
    const profile = await db.transaction(async (tx) => {
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
          sourceMeasurementIds: splitMeasurements.map(m => m.id),
          weightMeasurementId,
          eventId: options.eventId || firstM.eventId,
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
    // Single query: group measurements by (user_id, date), count distinct metrics,
    // then aggregate to per-user eligible session counts.
    const result = await db.execute<{ user_id: string; session_count: string; latest_date: string }>(sql`
      SELECT user_id, COUNT(*) AS session_count, MAX(date)::text AS latest_date
      FROM (
        SELECT user_id, date
        FROM measurements
        WHERE organization_id = ${orgId}
          AND metric IN ('DASH_5YD', 'DASH_10YD', 'DASH_20YD', 'DASH_30YD')
        GROUP BY user_id, date
        HAVING COUNT(DISTINCT metric) >= ${MIN_SPLITS_REQUIRED}
      ) eligible_sessions
      GROUP BY user_id
    `);

    return (result as unknown as Array<{ user_id: string; session_count: string; latest_date: string }>).map(r => ({
      userId: r.user_id,
      eligibleSessionCount: parseInt(r.session_count, 10),
      latestDate: r.latest_date,
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
