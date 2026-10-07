/**
 * MeasurementService - Handles all measurement-related business logic
 * Refactored to use direct database access instead of storage layer
 * This reduces coupling and improves modularity
 */

import {
  measurements,
  teams,
  organizations,
  users,
  userTeams,
  siteMetrics,
  type Measurement,
  type InsertMeasurement,
  type Team,
  type Organization,
} from '@shared/schema';
import { parseDateFilter } from '@shared/date-utils';
import { validateMeasurementValue, MeasurementValueValidationError } from '@shared/measurement-value-validation';
import { isMovementQualityMetric } from '@shared/peer-comparison-exclusions';
import { db } from '../db';
import { eq, and, gte, lte, or, isNull, sql, desc, inArray, arrayContains } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { PAGINATION } from '../constants/pagination';
import { DerivedMetricCalculator, type TriggerContext } from './derived-metric-calculator';
import { AchievementService } from './achievement-service';
import { notifyNewMeasurement } from './measurement-notification-service';
import {
  computePairedInputMeasurement,
  PairedInputValidationError,
  type AuxiliaryInputConfig,
} from './paired-input-compute';

// Singleton achievement service instance for performance
const achievementService = new AchievementService();

/** Thrown when an athlete tries to enter a Movement Quality score (maps to HTTP 403). */
export class MovementQualityPermissionError extends Error {
  constructor(metricCode: string) {
    super(`Athletes cannot enter Movement Quality scores (${metricCode}); a coach must record them`);
    this.name = 'MovementQualityPermissionError';
  }
}

/**
 * MQ scores are coach-entered rubric values (AM-FEAT-015): athletes may not
 * create or edit them on any write path.
 */
export function assertCanEnterMetric(role: string | undefined, metricCode: string): void {
  if (role === 'athlete' && isMovementQualityMetric(metricCode)) {
    throw new MovementQualityPermissionError(metricCode);
  }
}

/** The measurement belongs to another organization than the caller expected (maps to HTTP 403). */
export class MeasurementAccessDeniedError extends Error {
  constructor(message = 'Access denied - measurement belongs to different organization') {
    super(message);
    this.name = 'MeasurementAccessDeniedError';
  }
}

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Trusted server-side event context (set only by the event measurement service after its
 * frozen/permission checks); deliberately NOT read from the request body schema.
 */
export interface MeasurementEventContext {
  eventId: string;
  eventNameSnapshot: string;
  eventDateSnapshot: string; // 'YYYY-MM-DD'
  /** The event's organization; used for the measurement instead of the team-derived one */
  organizationId?: string | null;
  /**
   * One row per (athlete, metric, event): update the existing row instead of inserting
   * (Movement Quality scores). Serialized per key with a transaction-scoped advisory lock.
   */
  upsertPerEvent?: boolean;
}

export interface MeasurementWriteOptions {
  /**
   * Run inside this outer transaction. Derived-metric recalculation, achievements and
   * notifications are then skipped: they must run after the OUTER commit (caller's job).
   */
  tx?: DbTransaction;
  /** Skip athlete notifications and achievement checks (e.g. event results not yet published) */
  suppressSideEffects?: boolean;
}

export interface MeasurementFilters {
  userId?: string;
  athleteId?: string;
  teamIds?: string[];
  organizationId?: string;
  metric?: string;
  dateFrom?: string;
  dateTo?: string;
  birthYearFrom?: number;
  birthYearTo?: number;
  ageFrom?: number;
  ageTo?: number;
  search?: string;
  sport?: string;
  gender?: string;
  position?: string;
  includeUnverified?: boolean;
  includeUnknownBirthYear?: boolean;
  limit?: number;
  offset?: number;
  filterMode?: 'all' | 'personal' | 'org';
  orgIds?: string;
}

export interface PaginatedMeasurements {
  measurements: Measurement[];
  total: number;
  hasMore: boolean;
  limit: number;
  offset: number;
}

export class MeasurementService {
  /**
   * Get a single measurement by ID
   * @param id Measurement ID
   * @returns Measurement or undefined
   */
  async getMeasurement(id: string): Promise<Measurement | undefined> {
    const [measurement] = await db
      .select()
      .from(measurements)
      .where(eq(measurements.id, id));
    return measurement || undefined;
  }

  /**
   * Get athlete's active teams at a specific date
   * Used for auto-assigning team context to measurements
   * @param userId Athlete user ID
   * @param measurementDate Date of measurement
   * @returns Array of active teams
   */
  async getAthleteActiveTeamsAtDate(
    userId: string,
    measurementDate: Date
  ): Promise<
    Array<{
      teamId: string;
      teamName: string;
      season: string | null;
      organizationId: string;
      organizationName: string;
    }>
  > {
    const activeTeams = await db
      .select({
        teamId: teams.id,
        teamName: teams.name,
        season: teams.season,
        organizationId: teams.organizationId,
        organizationName: organizations.name,
      })
      .from(userTeams)
      .innerJoin(teams, eq(userTeams.teamId, teams.id))
      .innerJoin(organizations, eq(teams.organizationId, organizations.id))
      .where(
        and(
          eq(userTeams.userId, userId),
          // Must have joined on or before the measurement date
          lte(userTeams.joinedAt, measurementDate),
          // Must not have left before the measurement date
          or(isNull(userTeams.leftAt), gte(userTeams.leftAt, measurementDate)),
          eq(userTeams.isActive, true),
          eq(teams.isArchived, false) // Only include non-archived teams
        )
      );

    return activeTeams;
  }

  /**
   * Create a new measurement with auto-calculated fields
   * IMPORTANT: Wrapped in transaction to prevent race conditions
   * @param measurement Measurement data
   * @param submittedBy User ID of submitter
   * @param submitterRole Role of submitter (coach, org_admin, athlete, site_admin)
   * @returns Created measurement
   * @throws Error if user not found, team not found, or transaction fails
   */
  async createMeasurement(
    measurement: InsertMeasurement,
    submittedBy: string,
    submitterRole: string = 'athlete',
    eventContext?: MeasurementEventContext,
    options: MeasurementWriteOptions = {}
  ): Promise<Measurement> {
    assertCanEnterMetric(submitterRole, measurement.metric);

    // Wrap entire operation in transaction to prevent race conditions
    // Race condition scenario: User joins/leaves team between active teams query and measurement insert
    let newMeasurement: Measurement;
    // Set when upsertPerEvent updated an existing row instead of inserting
    let replaced: Measurement | null = null;

    try {
      newMeasurement = await (options.tx ?? db).transaction(async (tx) => {
      // Get user info for age calculation
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, measurement.userId));

      if (!user) throw new Error('User not found');

      const measurementDate = new Date(measurement.date);
      let age = 0;

      // Calculate age from birthDate (source of truth)
      // Note: birthYear field is not reliably maintained
      if (user.birthDate) {
        const birthDate = new Date(user.birthDate);
        age = measurementDate.getFullYear() - birthDate.getFullYear();
        const birthdayThisYear = new Date(
          measurementDate.getFullYear(),
          birthDate.getMonth(),
          birthDate.getDate()
        );
        if (measurementDate < birthdayThisYear) {
          age -= 1;
        }
      }

      // Get units AND paired-input config from siteMetrics table
      // (supports derived metrics, custom metrics, and paired-input metrics)
      const [metricConfig] = await tx
        .select({
          unit: siteMetrics.unit,
          auxiliaryInputConfig: siteMetrics.auxiliaryInputConfig,
          validationMin: siteMetrics.validationMin,
          validationMax: siteMetrics.validationMax,
          decimalPrecision: siteMetrics.decimalPrecision,
          isDerived: siteMetrics.isDerived,
        })
        .from(siteMetrics)
        .where(eq(siteMetrics.code, measurement.metric));

      // MQ totals (MQI_TOTAL, MQ_TRANSITION_TOTAL) are only ever calculated from
      // the base scores; a manual entry would shadow the calculated total.
      if (metricConfig?.isDerived && isMovementQualityMetric(measurement.metric)) {
        throw new MeasurementValueValidationError(
          `${measurement.metric} is calculated automatically and cannot be entered manually`
        );
      }

      // Metric-aware value validation: positive by default, 0-allowed range
      // check for MQ metrics (0-3 scores). Paired-input metrics validate their
      // own inputs, so skip them here.
      if (!metricConfig?.auxiliaryInputConfig) {
        const valueError = validateMeasurementValue(measurement.value, metricConfig, measurement.metric);
        if (valueError) throw new MeasurementValueValidationError(valueError);
      }

      // Use metric's configured unit, or default to 'in' for unknown metrics
      // Use nullish coalescing to allow empty string units (e.g., RSI is a ratio)
      let units = metricConfig?.unit ?? 'in';

      // PAIRED-INPUT METRICS: If the metric defines an auxiliaryInputConfig,
      // the incoming `value` is the primary input (e.g., weight lifted) and
      // `auxiliaryValue` is the secondary input (e.g., reps). The service
      // computes the stored value via the metric's formula (e.g., Epley 1RM).
      // Note: Zod-parsed inputs are numbers; we stringify when persisting
      // to Drizzle's decimal columns (which preserve precision via strings).
      let computedNumericValue: number = measurement.value;
      const auxiliaryNumericValue: number | null = measurement.auxiliaryValue ?? null;
      let pairedInputMetadata: NonNullable<Measurement['calculationMetadata']> | null = null;
      let isCalculatedFromPairedInput = false;

      if (metricConfig?.auxiliaryInputConfig) {
        const config = metricConfig.auxiliaryInputConfig as AuxiliaryInputConfig;
        if (typeof config.computeFormula !== 'string' || !config.computeFormula) {
          throw new PairedInputValidationError('formula', 'Metric has invalid auxiliary input configuration');
        }

        const result = computePairedInputMeasurement(
          config,
          measurement.metric,
          measurement.value,
          auxiliaryNumericValue
        );

        computedNumericValue = result.value;
        units = result.units;
        if (result.calculationMetadata) {
          pairedInputMetadata = {
            ...result.calculationMetadata,
            triggeredBy: {
              event: 'measurement_insert',
              userId: submittedBy,
            },
          };
          isCalculatedFromPairedInput = true;
        }
      }

      // Auto-populate team context if not explicitly provided
      let teamId = measurement.teamId;
      let season = measurement.season;
      let teamContextAuto = true;
      let teamNameSnapshot: string | null = null;
      let organizationId: string | null = null;

      // Check if this is athlete self-entry (personal measurement)
      const isAthleteSelfEntry = submitterRole === 'athlete' && measurement.userId === submittedBy;

      if (!teamId || teamId.trim() === '') {
        // For athlete self-entry without explicit team, keep as personal (no org assignment)
        if (isAthleteSelfEntry) {
          // Personal measurement - no team or organization context
          teamContextAuto = false;
        } else {
          // Get athlete's active teams at measurement date (within transaction)
          // Database Index: idx_user_teams_team_user_active (team_id, user_id WHERE is_active = true)
          // See: migrations/0018_add_org_query_composite_indexes.sql
          const activeTeams = await tx
            .select({
              teamId: teams.id,
              teamName: teams.name,
              season: teams.season,
              organizationId: teams.organizationId,
              organizationName: organizations.name,
            })
            .from(userTeams)
            .innerJoin(teams, eq(userTeams.teamId, teams.id))
            .innerJoin(organizations, eq(teams.organizationId, organizations.id))
            .where(
              and(
                eq(userTeams.userId, measurement.userId),
                lte(userTeams.joinedAt, measurementDate),
                or(isNull(userTeams.leftAt), gte(userTeams.leftAt, measurementDate)),
                eq(userTeams.isActive, true),
                eq(teams.isArchived, false)
              )
            )
            .for('update'); // Prevent race condition with row-level lock

          if (activeTeams.length === 1) {
            // Single team - auto-assign
            teamId = activeTeams[0].teamId;
            // Use undefined for optional fields per TypeScript schema
            season = activeTeams[0].season ?? undefined;
            teamContextAuto = true;
            // Auto-assigned measurement to team: ${activeTeams[0].teamName} (${season || 'no season'})
          } else if (activeTeams.length > 1) {
            // Multiple teams - cannot auto-assign
            // Athlete is on ${activeTeams.length} teams - team context not auto-assigned
            teamContextAuto = false;
          } else {
            // No active teams - measurement without team context
            teamContextAuto = false;
          }
        }
      } else {
        // teamId was explicitly provided
        teamContextAuto = false;
      }

      // If teamId is set (either auto-assigned or explicitly provided), fetch team details for snapshot
      if (teamId && teamId.trim() !== '') {
        const [team] = await tx
          .select()
          .from(teams)
          .innerJoin(organizations, eq(teams.organizationId, organizations.id))
          .where(eq(teams.id, teamId));

        if (team) {
          teamNameSnapshot = team.teams.name;
          organizationId = team.teams.organizationId;
          // Use undefined for optional fields per TypeScript schema
          season = season ?? team.teams.season ?? undefined;
        }
      }

      // Auto-verify measurements from coaches, org admins, and site admins
      // Athletes' self-submitted measurements remain unverified
      const isVerified = submitterRole === 'coach' ||
                        submitterRole === 'org_admin' ||
                        submitterRole === 'site_admin';

      // One score per (athlete, metric, event): edit the existing row in place
      if (eventContext?.upsertPerEvent) {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`event-score:${measurement.userId}:${measurement.metric}:${eventContext.eventId}`}, 0))`
        );
        const [existing] = await tx
          .select()
          .from(measurements)
          .where(
            and(
              eq(measurements.userId, measurement.userId),
              eq(measurements.metric, measurement.metric),
              eq(measurements.eventId, eventContext.eventId),
              eq(measurements.isCalculated, false)
            )
          )
          .orderBy(desc(measurements.createdAt))
          .limit(1)
          .for('update');

        if (existing) {
          if (eventContext.organizationId && existing.organizationId && existing.organizationId !== eventContext.organizationId) {
            throw new MeasurementAccessDeniedError();
          }
          const [txUpdated] = await tx
            .update(measurements)
            .set({
              value: String(computedNumericValue),
              units,
              date: measurementDate.toISOString(),
              ...(measurement.notes !== undefined ? { notes: measurement.notes || null } : {}),
              ...(measurement.mediaUrl !== undefined ? { mediaUrl: measurement.mediaUrl ?? null } : {}),
            })
            .where(eq(measurements.id, existing.id))
            .returning();
          replaced = existing;
          return txUpdated;
        }
      }

      // Create measurement
      const [txMeasurement] = await tx
        .insert(measurements)
        .values({
          userId: measurement.userId,
          submittedBy,
          date: measurementDate.toISOString(),
          metric: measurement.metric,
          value: String(computedNumericValue),
          units,
          age,
          notes: measurement.notes || null,
          mediaUrl: measurement.mediaUrl ?? null,
          flyInDistance: measurement.flyInDistance ? String(measurement.flyInDistance) : null,
          auxiliaryValue: auxiliaryNumericValue !== null ? String(auxiliaryNumericValue) : null,
          teamId: teamId || null,
          season: season || null,
          teamContextAuto,
          teamNameSnapshot,
          // Event writes belong to the event's organization (the athlete's team may be in another)
          organizationId: eventContext?.organizationId || organizationId || null,
          isVerified,
          // Audit trail: an auto-verified entry is verified by its submitter
          verifiedBy: isVerified ? submittedBy : null,
          eventId: eventContext?.eventId ?? null,
          eventNameSnapshot: eventContext?.eventNameSnapshot ?? null,
          eventDateSnapshot: eventContext?.eventDateSnapshot ?? null,
          isCalculated: isCalculatedFromPairedInput,
          calculationMetadata: pairedInputMetadata,
          // Paired-input metrics are computed from inline inputs (not from
          // other measurement rows), but the chk_calculated_measurements_valid
          // CHECK constraint requires this column to be non-null when
          // is_calculated=true. Empty array signals "computed, but no source
          // measurement rows" — semantically distinct from cross-row derived
          // metrics which list their dependencies here.
          calculatedFromMeasurementIds: isCalculatedFromPairedInput ? [] : null,
        })
        .returning();

      return txMeasurement;
      });
    } catch (error) {
      // Preserve error specificity - don't wrap validation errors
      if (
        error instanceof PairedInputValidationError ||
        error instanceof MeasurementValueValidationError ||
        error instanceof MeasurementAccessDeniedError
      ) {
        throw error;
      }
      if (error instanceof Error) {
        // Re-throw validation errors without modification
        if (error.message.includes('User not found') ||
            error.message.includes('Team not found') ||
            error.message.includes('not found')) {
          throw error;
        }
        // Database constraint violations - preserve original message
        if (error.message.includes('constraint') ||
            error.message.includes('foreign key') ||
            error.message.includes('unique')) {
          throw error;
        }
        // Transaction rollback or deadlock - preserve details
        if (error.message.includes('deadlock') ||
            error.message.includes('serialization') ||
            error.message.includes('rollback')) {
          throw error;
        }
        // Generic database error - preserve original message for debugging
        throw new Error(`Failed to create measurement: ${error.message}`);
      }
      // Unknown error type - wrap with context
      throw new Error(`Failed to create measurement due to unexpected error: ${String(error)}`);
    }

    // Inside a caller's transaction nothing is committed yet: derived metrics,
    // achievements and notifications are the caller's job after its commit.
    if (options.tx) {
      return newMeasurement;
    }

    // DERIVED METRICS: Trigger automatic calculation of derived metrics.
    // Must run AFTER the transaction commits: the calculator reads through its own
    // connection, so inside the transaction it cannot see the row just inserted
    // (the last source measurement would never produce its derived total).
    // Failures are logged, not thrown: the source measurement is already persisted.
    try {
      const calculator = new DerivedMetricCalculator(db);
      await calculator.processNewMeasurement(newMeasurement, {
        event: 'measurement_insert',
        userId: submittedBy,
        sourceMeasurementId: newMeasurement.id,
      });
      const previous = replaced as Measurement | null;
      if (previous && previous.date !== newMeasurement.date) {
        // An upsert moved the score to another date: refresh the old date's totals too
        await calculator.recalculateForAthlete(previous.userId, previous.metric, previous.date, {
          triggerContext: { event: 'measurement_update', sourceMeasurementId: newMeasurement.id },
        });
      }
    } catch (derivedError) {
      console.error('Derived metric calculation failed after measurement create:', {
        measurementId: newMeasurement.id,
        userId: newMeasurement.userId,
        metric: newMeasurement.metric,
        date: newMeasurement.date,
        error: derivedError,
      });
    }

    // Event entries before results are published (and in-place score edits) do not
    // notify the athlete or award achievements.
    if (options.suppressSideEffects || replaced) {
      return newMeasurement;
    }

    // ACHIEVEMENTS: Check for newly unlocked achievements AFTER transaction commits
    // This ensures measurement data is persisted before checking achievements
    // Wrapped in try/catch so achievement failures don't affect measurement creation
    if (newMeasurement.organizationId) {
      try {
        await achievementService.checkAchievements(
          newMeasurement.userId,
          newMeasurement.organizationId,
          newMeasurement
        );
      } catch (achievementError) {
        // Log but don't fail - measurement was already created successfully
        console.error('Achievement check failed:', achievementError);
      }
    }

    // NOTIFICATIONS: Notify athlete when a coach/admin records their measurement
    // Fire-and-forget to avoid adding latency to the request path
    const actualSubmitter = newMeasurement.submittedBy ?? submittedBy;
    if (actualSubmitter !== newMeasurement.userId) {
      notifyNewMeasurement({
        measurementId: newMeasurement.id,
        userId: newMeasurement.userId,
        submittedBy: actualSubmitter,
        metric: newMeasurement.metric,
        value: newMeasurement.value,
        units: newMeasurement.units,
        organizationId: newMeasurement.organizationId,
        date: newMeasurement.date,
      }).catch(err => console.error('Measurement notification failed:', err));
    }

    return newMeasurement;
  }

  /**
   * Batch create measurements (coaches and org admins only)
   * Processes each measurement independently to allow partial success
   * IMPORTANT: Each measurement is in its own transaction for atomicity per-measurement
   * This allows the batch to continue processing if individual measurements fail
   *
   * SECURITY: Validates organization access for each athlete in batch to prevent cross-org data creation
   * @param measurements Array of measurements to create
   * @param user Session user for authorization
   * @param isSiteAdmin Whether user is a site admin (bypasses org checks)
   * @returns Result with created count and errors
   */
  async createMeasurementsBatch(
    measurements: InsertMeasurement[],
    user: { id: string; role: string; primaryOrganizationId?: string },
    isSiteAdmin: boolean = false
  ): Promise<{ created: number; failed: number; errors: Array<{ index: number; message: string }> }> {
    const errors: Array<{ index: number; message: string }> = [];
    let created = 0;

    // SECURITY: Pre-validate all athletes belong to user's organization (non-site-admins only)
    // This prevents coaches from creating measurements for athletes in other organizations
    if (!isSiteAdmin && user.primaryOrganizationId) {
      const uniqueUserIds = [...new Set(measurements.map(m => m.userId))];

      // Query all athletes' team memberships to verify organization access
      const athleteTeams = await db
        .select({
          userId: userTeams.userId,
          organizationId: teams.organizationId
        })
        .from(userTeams)
        .innerJoin(teams, eq(userTeams.teamId, teams.id))
        .where(and(
          inArray(userTeams.userId, uniqueUserIds),
          eq(userTeams.isActive, true),
          eq(teams.isArchived, false)
        ));

      // Build map of userId -> organizations
      const userOrgsMap = new Map<string, Set<string>>();
      athleteTeams.forEach(at => {
        if (!userOrgsMap.has(at.userId)) {
          userOrgsMap.set(at.userId, new Set());
        }
        userOrgsMap.get(at.userId)!.add(at.organizationId);
      });

      // Check each athlete has access to user's organization
      for (let i = 0; i < measurements.length; i++) {
        const userOrgs = userOrgsMap.get(measurements[i].userId);
        if (!userOrgs || !userOrgs.has(user.primaryOrganizationId)) {
          errors.push({
            index: i,
            message: `Unauthorized: athlete not in your organization`
          });
        }
      }

      // If pre-validation found unauthorized athletes, return early
      if (errors.length > 0) {
        return {
          created: 0,
          failed: errors.length,
          errors,
        };
      }
    }

    // SECURITY: Validate teamIds if provided (all users including site admins)
    // Pre-validate all team IDs exist and are accessible
    const teamIds = measurements
      .map(m => m.teamId)
      .filter((id): id is string => !!id && id.trim() !== '');

    if (teamIds.length > 0) {
      const uniqueTeamIds = [...new Set(teamIds)];
      const teamsData = await db
        .select({
          id: teams.id,
          organizationId: teams.organizationId
        })
        .from(teams)
        .where(inArray(teams.id, uniqueTeamIds));

      const teamMap = new Map(teamsData.map(t => [t.id, t.organizationId]));

      // Validate each teamId exists and is accessible
      for (let i = 0; i < measurements.length; i++) {
        if (measurements[i].teamId && measurements[i].teamId!.trim() !== '') {
          const teamOrgId = teamMap.get(measurements[i].teamId!);

          if (!teamOrgId) {
            errors.push({ index: i, message: 'Team not found' });
            continue;
          }

          // Non-site-admins can only assign to teams in their organization
          if (!isSiteAdmin && teamOrgId !== user.primaryOrganizationId) {
            errors.push({
              index: i,
              message: 'Cannot assign measurements to teams in different organizations'
            });
          }
        }
      }

      // If team validation found errors, return early
      if (errors.length > 0) {
        return {
          created: 0,
          failed: errors.length,
          errors,
        };
      }
    }

    // Process each measurement in its own transaction for atomicity per-measurement
    // This prevents a single failure from rolling back all measurements
    for (let i = 0; i < measurements.length; i++) {
      // Skip measurements that failed pre-validation
      if (errors.some(e => e.index === i)) {
        continue;
      }

      try {
        await this.createMeasurement(measurements[i], user.id, user.role);
        created++;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ index: i, message });
      }
    }

    return {
      created,
      failed: errors.length,
      errors,
    };
  }

  /**
   * Update measurement fields
   * Note: submittedBy cannot be updated after creation
   * IMPORTANT: Wrapped in transaction with FOR UPDATE lock to prevent race conditions
   * @param id Measurement ID
   * @param measurement Partial measurement data
   * @param expectedOrganizationId Optional organization ID for defense-in-depth validation (IDOR prevention)
   * @param updaterRole Role of the user making the change (athletes cannot edit MQ scores)
   * @returns Updated measurement
   * @throws Error if measurement not found, org mismatch, or transaction fails
   */
  async updateMeasurement(
    id: string,
    measurement: Partial<InsertMeasurement>,
    expectedOrganizationId?: string,
    updaterRole?: string,
    options: Pick<MeasurementWriteOptions, 'tx'> = {}
  ): Promise<Measurement> {
    // Wrap in transaction to prevent race conditions during concurrent updates
    // Race condition scenario: Two users update same measurement simultaneously
    try {
      const { updated: txUpdated, previous } = await (options.tx ?? db).transaction(async (tx) => {
        // Lock the row with FOR UPDATE to prevent concurrent modifications
        const [existing] = await tx
          .select()
          .from(measurements)
          .where(eq(measurements.id, id))
          .for('update');

        if (!existing) {
          throw new Error('Measurement not found');
        }

        // Defense-in-depth: Verify organizationId if provided (IDOR prevention)
        // This provides service-layer validation even if route-layer checks are bypassed
        if (expectedOrganizationId && existing.organizationId !== expectedOrganizationId) {
          throw new MeasurementAccessDeniedError();
        }

        // Both the stored metric and a new one: an athlete may neither edit an
        // MQ score nor move a measurement onto an MQ metric.
        assertCanEnterMetric(updaterRole, existing.metric);
        if (measurement.metric) assertCanEnterMetric(updaterRole, measurement.metric);

        const updateData: Partial<typeof measurements.$inferInsert> = {};

        if (measurement.userId) updateData.userId = measurement.userId;
        // submittedBy cannot be updated after creation (intentionally excluded)
        if (measurement.date) updateData.date = measurement.date;
        if (measurement.metric) updateData.metric = measurement.metric;
        if (measurement.value !== undefined)
          updateData.value = String(measurement.value);
        if (measurement.notes !== undefined) updateData.notes = measurement.notes;
        // null (or empty string, normalized to null by the Zod schema) clears the link
        if (measurement.mediaUrl !== undefined) updateData.mediaUrl = measurement.mediaUrl;
        if (measurement.flyInDistance !== undefined)
          updateData.flyInDistance = measurement.flyInDistance ? String(measurement.flyInDistance) : null;
        // auxiliaryValue is intentionally NOT written here unconditionally.
        // It is only set inside the paired-input recompute block (below) or
        // the clearing branch, so non-paired-input measurements cannot
        // accidentally persist a stale auxiliary value.

        // Determine the effective metric code for unit/auxiliary lookup
        // (could be the new one if metric is changing, or the existing one)
        const effectiveMetricCode = measurement.metric ?? existing.metric;

        // Fetch the metric's unit + auxiliaryInputConfig for unit refresh AND
        // potential paired-input recompute. We always fetch when the metric
        // changes (to refresh units / detect new paired-input shape), or when
        // value/auxiliary changes (to recompute for an existing paired-input).
        const metricIsChanging = !!measurement.metric;
        const valueOrAuxChanged =
          measurement.value !== undefined || measurement.auxiliaryValue !== undefined;
        const needsMetricLookup = metricIsChanging || valueOrAuxChanged;

        if (needsMetricLookup) {
          const [metricConfig] = await tx
            .select({
              unit: siteMetrics.unit,
              auxiliaryInputConfig: siteMetrics.auxiliaryInputConfig,
              validationMin: siteMetrics.validationMin,
              validationMax: siteMetrics.validationMax,
              decimalPrecision: siteMetrics.decimalPrecision,
            })
            .from(siteMetrics)
            .where(eq(siteMetrics.code, effectiveMetricCode));

          // Metric-aware value validation (see createMeasurement). When only the
          // metric changes, re-validate the existing stored value against the new metric.
          if (!metricConfig?.auxiliaryInputConfig) {
            const valueToCheck = measurement.value !== undefined ? measurement.value : Number(existing.value);
            const valueError = validateMeasurementValue(valueToCheck, metricConfig, effectiveMetricCode);
            if (valueError) throw new MeasurementValueValidationError(valueError);
          }

          if (metricIsChanging) {
            updateData.units = metricConfig?.unit ?? 'in';
          }

          // Paired-input recompute: fires whenever the effective metric is
          // paired-input AND something relevant changed (metric switched to
          // paired-input, or one of the inputs was edited). Uses merged
          // (incoming + existing) inputs so partial updates work.
          if (metricConfig?.auxiliaryInputConfig && (valueOrAuxChanged || metricIsChanging)) {
            const config = metricConfig.auxiliaryInputConfig as AuxiliaryInputConfig;
            if (typeof config.computeFormula !== 'string' || !config.computeFormula) {
              throw new PairedInputValidationError('formula', 'Metric has invalid auxiliary input configuration');
            }

            // For an existing paired-input measurement, `existing.value` is the
            // already-computed result (e.g., 346.5 lb 1RM estimate) — NOT the
            // original primary input (315 lb load). The original load lives in
            // calculationMetadata.sourceValues.load. Use it when the caller
            // didn't supply a new value, so partial updates (e.g. just changing
            // reps) recompute against the original load, not the prior estimate.
            const existingSourceLoad =
              existing.calculationMetadata?.sourceValues?.load ?? null;

            if (existing.calculationMetadata && existingSourceLoad === null && measurement.value === undefined) {
              console.warn(
                `[updateMeasurement] id=${id}: calculationMetadata present but sourceValues.load missing — falling back to existing.value, which may cause drift`
              );
            }

            const primaryRaw = measurement.value !== undefined
              ? measurement.value
              : (existingSourceLoad !== null ? existingSourceLoad : existing.value);
            const auxRaw = measurement.auxiliaryValue !== undefined
              ? measurement.auxiliaryValue
              : existing.auxiliaryValue;
            const primaryNum = primaryRaw !== null && primaryRaw !== undefined
              ? Number(primaryRaw)
              : null;
            const auxNum = auxRaw !== null && auxRaw !== undefined ? Number(auxRaw) : null;

            const result = computePairedInputMeasurement(
              config,
              effectiveMetricCode,
              primaryNum,
              auxNum
            );

            updateData.value = String(result.value);
            updateData.auxiliaryValue = auxNum !== null ? String(auxNum) : null;
            updateData.units = result.units;
            updateData.isCalculated = !!result.calculationMetadata;
            if (result.calculationMetadata) {
              updateData.calculationMetadata = {
                ...result.calculationMetadata,
                triggeredBy: { event: 'measurement_update' },
              };
              // Paired-input: computed from inline inputs, not from other
              // measurement rows. Empty array satisfies the
              // chk_calculated_measurements_valid CHECK constraint while
              // signalling "no source rows". Cross-row derived metrics
              // list their dependencies here instead.
              updateData.calculatedFromMeasurementIds = [];
            }
          } else if (
            metricIsChanging &&
            !metricConfig?.auxiliaryInputConfig &&
            existing.isCalculated
          ) {
            // Metric is being changed AWAY from a paired-input (or any calculated)
            // metric — clear stale state so the new measurement reads cleanly.
            // Without this, isCalculated would stay true and the "est." chip
            // would render incorrectly on the new (non-computed) metric.
            updateData.isCalculated = false;
            updateData.calculationMetadata = null;
            updateData.calculatedFromMeasurementIds = null;
            updateData.auxiliaryValue = null;
          }
        }

        // Check if there are any valid fields to update
        if (Object.keys(updateData).length === 0) {
          throw new Error('No valid fields to update');
        }

        const [updated] = await tx
          .update(measurements)
          .set(updateData)
          .where(eq(measurements.id, id))
          .returning();

        return { updated, previous: existing };
      });

      // DERIVED METRICS: Trigger recalculation if value (incl. a paired-input
      // auxiliaryValue that recomputes the value), date, metric or athlete changed.
      // Runs AFTER the transaction commits so the calculator (separate connection)
      // sees the updated row. Failures are logged: the update is already persisted.
      // recalculateForAthlete also creates a total that does not exist yet, so a
      // source moved onto a date/metric that completes a set produces its total.
      if (
        !options.tx &&
        (measurement.value !== undefined ||
          measurement.auxiliaryValue !== undefined ||
          measurement.date !== undefined ||
          measurement.metric !== undefined ||
          measurement.userId !== undefined)
      ) {
        try {
          const calculator = new DerivedMetricCalculator(db);
          const triggerContext = {
            event: 'measurement_update' as const,
            sourceMeasurementId: txUpdated.id,
          };
          await calculator.recalculateForAthlete(
            txUpdated.userId,
            txUpdated.metric,
            txUpdated.date,
            { triggerContext }
          );
          // If the source moved (date, metric or athlete), the derived value it
          // used to feed must be recalculated/invalidated too, otherwise a stale
          // total remains on the old date/metric/athlete.
          if (
            previous.date !== txUpdated.date ||
            previous.metric !== txUpdated.metric ||
            previous.userId !== txUpdated.userId
          ) {
            await calculator.recalculateForAthlete(
              previous.userId,
              previous.metric,
              previous.date,
              { triggerContext }
            );
          }
        } catch (derivedError) {
          console.error('Derived metric recalculation failed after measurement update:', {
            measurementId: txUpdated.id,
            userId: txUpdated.userId,
            metric: txUpdated.metric,
            date: txUpdated.date,
            error: derivedError,
          });
        }
      }

      return txUpdated;
    } catch (error) {
      // Preserve error specificity
      if (
        error instanceof PairedInputValidationError ||
        error instanceof MeasurementValueValidationError ||
        error instanceof MeasurementAccessDeniedError ||
        error instanceof MovementQualityPermissionError
      ) {
        throw error;
      }
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          throw error;
        }
        // Transaction rollback or deadlock - preserve details
        if (error.message.includes('deadlock') ||
            error.message.includes('serialization') ||
            error.message.includes('rollback')) {
          throw error;
        }
        throw new Error(`Failed to update measurement: ${error.message}`);
      }
      throw new Error(`Failed to update measurement due to unexpected error: ${String(error)}`);
    }
  }

  /**
   * Delete a measurement
   * IMPORTANT: Wrapped in transaction with FOR UPDATE lock to prevent race conditions
   * @param id Measurement ID
   * @param expectedOrganizationId Optional organization ID for defense-in-depth validation (IDOR prevention)
   * @throws Error if measurement not found, org mismatch, or transaction fails
   */
  async deleteMeasurement(
    id: string,
    expectedOrganizationId?: string,
    options: Pick<MeasurementWriteOptions, 'tx'> = {}
  ): Promise<void> {
    // Wrap in transaction to prevent race conditions during concurrent operations
    // Race condition scenario: User deletes measurement while another user verifies/updates it
    try {
      const deleted = await (options.tx ?? db).transaction(async (tx) => {
        // Lock the row with FOR UPDATE to prevent concurrent modifications
        const [existing] = await tx
          .select()
          .from(measurements)
          .where(eq(measurements.id, id))
          .for('update');

        if (!existing) {
          throw new Error('Measurement not found');
        }

        // Defense-in-depth: Verify organizationId if provided (IDOR prevention)
        // This provides service-layer validation even if route-layer checks are bypassed
        if (expectedOrganizationId && existing.organizationId !== expectedOrganizationId) {
          throw new MeasurementAccessDeniedError();
        }

        // Store info for derived metric recalculation before deleting
        const { userId, metric, date, id: measurementId } = existing;

        // Delete the measurement
        await tx.delete(measurements).where(eq(measurements.id, id));

        return { userId, metric, date, measurementId };
      });

      // Inside a caller's transaction the deletion is not committed yet: the caller
      // recalculates derived metrics after its commit.
      if (options.tx) {
        return;
      }

      // DERIVED METRICS: Trigger recalculation after the deletion has committed.
      // Inside the transaction the calculator (separate connection) would still
      // see the deleted row, leaving a stale derived total. Failures are logged:
      // the deletion is already persisted.
      try {
        const calculator = new DerivedMetricCalculator(db);
        await calculator.recalculateForAthlete(deleted.userId, deleted.metric, deleted.date, {
          triggerContext: {
            event: 'measurement_delete',
            sourceMeasurementId: deleted.measurementId,
          },
        });
      } catch (derivedError) {
        console.error('Derived metric recalculation failed after measurement delete:', {
          measurementId: deleted.measurementId,
          userId: deleted.userId,
          metric: deleted.metric,
          date: deleted.date,
          error: derivedError,
        });
      }
    } catch (error) {
      // Preserve error specificity
      if (error instanceof MeasurementAccessDeniedError) {
        throw error;
      }
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          throw error;
        }
        // Transaction rollback or deadlock - preserve details
        if (error.message.includes('deadlock') ||
            error.message.includes('serialization') ||
            error.message.includes('rollback')) {
          throw error;
        }
        throw new Error(`Failed to delete measurement: ${error.message}`);
      }
      throw new Error(`Failed to delete measurement due to unexpected error: ${String(error)}`);
    }
  }

  /**
   * Mark measurement as verified
   * IMPORTANT: Wrapped in transaction with FOR UPDATE lock to prevent race conditions
   * Idempotent operation - can be called multiple times safely
   *
   * Defense-in-depth: When expectedOrganizationId provided, validates organization
   * ownership to prevent IDOR attacks even if route-level checks are bypassed.
   *
   * @param id Measurement ID
   * @param verifiedBy User ID of verifier
   * @param expectedOrganizationId Optional organization ID for IDOR protection
   * @returns Updated measurement
   * @throws Error if measurement not found, org mismatch, or transaction fails
   */
  async verifyMeasurement(
    id: string,
    verifiedBy: string,
    expectedOrganizationId?: string
  ): Promise<Measurement> {
    // Wrap in transaction to prevent race conditions during concurrent verifications
    // Race condition scenario: Two admins verify same measurement simultaneously, overwriting audit trail
    try {
      return await db.transaction(async (tx) => {
        // Lock the row with FOR UPDATE to prevent concurrent modifications
        const [existing] = await tx
          .select()
          .from(measurements)
          .where(eq(measurements.id, id))
          .for('update');

        if (!existing) {
          throw new Error('Measurement not found');
        }

        // Defense-in-depth: Verify organization ownership at service layer
        // This prevents IDOR attacks even if route-level checks are bypassed
        if (expectedOrganizationId && existing.organizationId !== expectedOrganizationId) {
          throw new Error('Access denied - measurement belongs to different organization');
        }

        // Idempotency check: if already verified by this user, return existing record
        if (existing.isVerified && existing.verifiedBy === verifiedBy) {
          return existing;
        }

        // Update verification status
        const [updated] = await tx
          .update(measurements)
          .set({
            isVerified: true,
            verifiedBy,
          })
          .where(eq(measurements.id, id))
          .returning();

        return updated;
      });
    } catch (error) {
      // Preserve error specificity
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          throw error;
        }
        // Transaction rollback or deadlock - preserve details
        if (error.message.includes('deadlock') ||
            error.message.includes('serialization') ||
            error.message.includes('rollback')) {
          throw error;
        }
        throw new Error(`Failed to verify measurement: ${error.message}`);
      }
      throw new Error(`Failed to verify measurement due to unexpected error: ${String(error)}`);
    }
  }

  /**
   * Bulk verify measurements
   * IMPORTANT: Uses single transaction with batch update for performance
   * Validates all measurements before updating to allow partial success on validation failures
   *
   * @param measurementIds Array of measurement IDs to verify
   * @param verifiedByUserId User ID of verifier
   * @param expectedOrganizationId Optional organization ID for IDOR protection (site admins pass undefined)
   * @returns Result with success count and errors
   */
  async bulkVerify(
    measurementIds: string[],
    verifiedByUserId: string,
    expectedOrganizationId?: string
  ): Promise<{ success: number; failed: number; errors: Array<{ id: string; message: string }> }> {
    const errors: Array<{ id: string; message: string }> = [];

    try {
      return await db.transaction(async (tx) => {
        // Lock and validate all measurements with FOR UPDATE
        const existingMeasurements = await tx
          .select()
          .from(measurements)
          .where(inArray(measurements.id, measurementIds))
          .for('update');

        // Build map of found measurements
        const foundMap = new Map(existingMeasurements.map(m => [m.id, m]));

        // Validate each measurement and collect valid IDs
        const validIds: string[] = [];
        for (const id of measurementIds) {
          const measurement = foundMap.get(id);

          if (!measurement) {
            errors.push({ id, message: 'Measurement not found' });
            continue;
          }

          // Defense-in-depth: Verify organization ownership
          if (expectedOrganizationId && measurement.organizationId !== expectedOrganizationId) {
            errors.push({ id, message: 'Access denied - measurement belongs to different organization' });
            continue;
          }

          validIds.push(id);
        }

        // Batch update all valid measurements
        let actualUpdated = 0;
        if (validIds.length > 0) {
          const result = await tx
            .update(measurements)
            .set({
              isVerified: true,
              verifiedBy: verifiedByUserId,
            })
            .where(inArray(measurements.id, validIds))
            .returning({ id: measurements.id });

          actualUpdated = result.length;

          // Verify all expected measurements were updated (race condition check)
          if (actualUpdated !== validIds.length) {
            const missingIds = validIds.filter(id => !result.some(r => r.id === id));
            missingIds.forEach(id => {
              errors.push({ id, message: 'Measurement was deleted or modified during operation' });
            });
          }
        }

        return {
          success: actualUpdated,
          failed: errors.length,
          errors,
        };
      });
    } catch (error) {
      // Transaction failed - all measurements failed
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: 0,
        failed: measurementIds.length,
        errors: measurementIds.map(id => ({ id, message })),
      };
    }
  }

  /**
   * Bulk unverify measurements
   * IMPORTANT: Uses single transaction with batch update for performance
   * Validates all measurements before updating to allow partial success on validation failures
   *
   * @param measurementIds Array of measurement IDs to unverify
   * @param expectedOrganizationId Optional organization ID for IDOR protection (site admins pass undefined)
   * @returns Result with success count and errors
   */
  async bulkUnverify(
    measurementIds: string[],
    expectedOrganizationId?: string
  ): Promise<{ success: number; failed: number; errors: Array<{ id: string; message: string }> }> {
    const errors: Array<{ id: string; message: string }> = [];

    try {
      return await db.transaction(async (tx) => {
        // Lock and validate all measurements with FOR UPDATE
        const existingMeasurements = await tx
          .select()
          .from(measurements)
          .where(inArray(measurements.id, measurementIds))
          .for('update');

        // Build map of found measurements
        const foundMap = new Map(existingMeasurements.map(m => [m.id, m]));

        // Validate each measurement and collect valid IDs
        const validIds: string[] = [];
        for (const id of measurementIds) {
          const measurement = foundMap.get(id);

          if (!measurement) {
            errors.push({ id, message: 'Measurement not found' });
            continue;
          }

          // Defense-in-depth: Verify organization ownership
          if (expectedOrganizationId && measurement.organizationId !== expectedOrganizationId) {
            errors.push({ id, message: 'Access denied - measurement belongs to different organization' });
            continue;
          }

          validIds.push(id);
        }

        // Batch update all valid measurements
        let actualUpdated = 0;
        if (validIds.length > 0) {
          const result = await tx
            .update(measurements)
            .set({
              isVerified: false,
              verifiedBy: null,
            })
            .where(inArray(measurements.id, validIds))
            .returning({ id: measurements.id });

          actualUpdated = result.length;

          // Verify all expected measurements were updated (race condition check)
          if (actualUpdated !== validIds.length) {
            const missingIds = validIds.filter(id => !result.some(r => r.id === id));
            missingIds.forEach(id => {
              errors.push({ id, message: 'Measurement was deleted or modified during operation' });
            });
          }
        }

        return {
          success: actualUpdated,
          failed: errors.length,
          errors,
        };
      });
    } catch (error) {
      // Transaction failed - all measurements failed
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: 0,
        failed: measurementIds.length,
        errors: measurementIds.map(id => ({ id, message })),
      };
    }
  }

  /**
   * Bulk delete measurements
   *
   * Per-row best-effort: rows missing or belonging to another organization are
   * collected into errors[] and the rest are deleted. Mirrors bulkVerify semantics.
   *
   * After deletion, derived metrics for each affected (athlete, metric, date) are
   * recalculated post-transaction so dependent calculated values stay consistent.
   *
   * @param measurementIds IDs to delete
   * @param expectedOrganizationId IDOR scope (undefined = site admin, no org restriction)
   * @returns Per-row result with successes, failures, and error details
   */
  async bulkDelete(
    measurementIds: string[],
    expectedOrganizationId?: string
  ): Promise<{ deleted: number; failed: number; errors: Array<{ id: string; message: string }> }> {
    type RecalcKey = { userId: string; metric: string; date: string };
    type TxResult = {
      deleted: number;
      errors: Array<{ id: string; message: string }>;
      recalcKeys: RecalcKey[];
    };

    let txResult: TxResult;
    try {
      // All mutable state lives inside the closure so a transaction retry
      // (e.g. on serialization failure) starts from a clean slate.
      txResult = await db.transaction(async (tx): Promise<TxResult> => {
        const errors: Array<{ id: string; message: string }> = [];

        const existingMeasurements = await tx
          .select()
          .from(measurements)
          .where(inArray(measurements.id, measurementIds))
          .for('update');

        const foundMap = new Map(existingMeasurements.map(m => [m.id, m]));

        const validIds: string[] = [];
        for (const id of measurementIds) {
          const measurement = foundMap.get(id);

          if (!measurement) {
            errors.push({ id, message: 'Measurement not found' });
            continue;
          }

          if (expectedOrganizationId && measurement.organizationId !== expectedOrganizationId) {
            errors.push({ id, message: 'Access denied - measurement belongs to different organization' });
            continue;
          }

          validIds.push(id);
        }

        if (validIds.length === 0) {
          return { deleted: 0, errors, recalcKeys: [] };
        }

        const deletedRows = await tx
          .delete(measurements)
          .where(inArray(measurements.id, validIds))
          .returning({
            id: measurements.id,
            userId: measurements.userId,
            metric: measurements.metric,
            date: measurements.date,
          });

        const deletedIdSet = new Set(deletedRows.map(r => r.id));
        const missingIds = validIds.filter(id => !deletedIdSet.has(id));
        missingIds.forEach(id => {
          errors.push({ id, message: 'Measurement was deleted or modified during operation' });
        });

        const recalcKeys: RecalcKey[] = deletedRows.map(r => ({
          userId: r.userId,
          metric: r.metric,
          date: r.date,
        }));

        return { deleted: deletedRows.length, errors, recalcKeys };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        deleted: 0,
        failed: measurementIds.length,
        errors: measurementIds.map(id => ({ id, message })),
      };
    }

    if (txResult.recalcKeys.length > 0) {
      const calculator = new DerivedMetricCalculator(db);
      const seen = new Set<string>();
      for (const key of txResult.recalcKeys) {
        const dedupeKey = `${key.userId}|${key.metric}|${key.date}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        try {
          await calculator.recalculateForAthlete(key.userId, key.metric, key.date, {
            triggerContext: { event: 'measurement_delete' },
          });
        } catch (e) {
          // Recalc failures must not roll back successful deletions; log and continue
          console.error('Derived metric recalc failed after bulk delete', {
            userId: key.userId,
            metric: key.metric,
            date: key.date,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    return {
      deleted: txResult.deleted,
      failed: txResult.errors.length,
      errors: txResult.errors,
    };
  }

  /**
   * Get measurements with filters and pagination
   * @param filters Measurement filters including pagination options
   * @param allowCrossOrganization Whether to allow queries without organizationId (site admin only)
   * @returns Paginated measurements with metadata
   * @throws Error if organizationId not provided and allowCrossOrganization is false
   */
  async getMeasurements(
    filters?: MeasurementFilters,
    allowCrossOrganization: boolean = false
  ): Promise<PaginatedMeasurements> {
    // Defense-in-depth: Enforce organizationId requirement for non-site-admin contexts
    // Exception: filterMode queries bypass this requirement (they have their own filtering logic)
    // This prevents accidental data leakage if route-layer authorization is bypassed
    if (!filters?.organizationId && !allowCrossOrganization && !filters?.filterMode) {
      throw new Error('organizationId is required for organization-scoped queries');
    }

    // Build query conditions
    const conditions = [];

    if (filters?.userId) {
      conditions.push(eq(measurements.userId, filters.userId));
    }

    if (filters?.athleteId) {
      conditions.push(eq(measurements.userId, filters.athleteId));
    }

    if (filters?.metric) {
      conditions.push(eq(measurements.metric, filters.metric));
    }

    // CROSS-ORG MEASUREMENT QUERIES (filterMode parameter)
    // Handle new filter modes: 'personal', 'all', 'org'
    if (filters?.filterMode === 'personal') {
      // Only self-entered measurements (organizationId IS NULL)
      conditions.push(isNull(measurements.organizationId));
    } else if (filters?.filterMode === 'all') {
      // Measurements from any of specified org IDs OR personal (NULL)
      const orgIdArray = filters.orgIds
        ? filters.orgIds.split(',').map(id => id.trim()).filter(Boolean)
        : [];

      // Defensive check: enforce MAX_ORG_IDS limit even if route validation is bypassed
      // Route layer validates this via Zod schema, but defense-in-depth requires service-layer check
      if (orgIdArray.length > 100) {
        throw new Error('orgIds cannot exceed 100 organizations');
      }

      if (orgIdArray.length > 0) {
        // Include measurements from specified orgs OR personal measurements (NULL)
        // NOTE: The OR isNull() pattern is suboptimal for index usage, but required for functionality.
        // The composite index (user_id, organization_id, date DESC) WITH WHERE is_verified=true
        // helps PostgreSQL use index scans more efficiently than before.
        // For maximum performance (3-10x faster), consider refactoring to UNION ALL:
        //   SELECT ... WHERE org_id IN (orgIds) UNION ALL SELECT ... WHERE org_id IS NULL
        // However, this requires significant query restructuring and is deferred for now.
        conditions.push(
          or(
            inArray(measurements.organizationId, orgIdArray),
            isNull(measurements.organizationId)
          )!
        );
      } else {
        // Empty orgIds = only personal measurements
        conditions.push(isNull(measurements.organizationId));
      }
    } else if (filters?.organizationId) {
      // Default 'org' mode: existing organizationId filter
      // STRICT ORGANIZATION ISOLATION (SECURITY FIX - 2025-12-22)
      // Only include measurements that explicitly belong to the specified organization.
      //
      // HISTORICAL NOTE:
      // Previously, this code included `isNull(measurements.organizationId)` to show
      // legacy measurements (with NULL organization_id) to all organizations.
      // This was a multi-tenant data isolation vulnerability.
      //
      // Migration 0087_backfill_measurements_org_final.sql backfills organization_id
      // for legacy measurements. After backfill, measurements with NULL organization_id
      // are considered orphaned and should NOT be visible to any organization.
      //
      // CURRENT BEHAVIOR:
      // - Organization A sees: ONLY measurements with org_id = A
      // - Measurements with NULL org_id are invisible (orphaned data)
      // - Site admins see: all measurements (allowCrossOrganization = true bypasses this filter)
      conditions.push(eq(measurements.organizationId, filters.organizationId));
    }

    if (filters?.dateFrom) {
      // Convert ISO datetime to date-only string (YYYY-MM-DD) for comparison with date column
      // PostgreSQL date column only stores date part, not time
      // Defense-in-depth: Parse and validate even though validated at route layer
      const dateOnly = parseDateFilter(filters.dateFrom);
      conditions.push(gte(measurements.date, dateOnly));
    }

    if (filters?.dateTo) {
      // Convert ISO datetime to date-only string (YYYY-MM-DD) for comparison with date column
      // PostgreSQL date column only stores date part, not time
      // Defense-in-depth: Parse and validate even though validated at route layer
      const dateOnly = parseDateFilter(filters.dateTo);
      conditions.push(lte(measurements.date, dateOnly));
    }

    if (!filters?.includeUnverified) {
      conditions.push(eq(measurements.isVerified, true));
    }

    // Team filtering (teamIds array)
    if (filters?.teamIds && filters.teamIds.length > 0) {
      conditions.push(inArray(measurements.teamId, filters.teamIds));
    }

    // Gender filtering (applied to users table)
    // Note: Gender is validated as enum at route level (Zod schema)
    if (filters?.gender) {
      conditions.push(eq(users.gender, filters.gender as "Male" | "Female" | "Not Specified"));
    }

    // Sport filtering (applied to users table with array containment)
    // PostgreSQL array operator @> checks if left array contains right array
    // SECURITY: Using Drizzle's arrayContains() function for proper parameterization
    if (filters?.sport) {
      // Validate BEFORE using in query for clarity and safety
      if (filters.sport.length > 100) {
        throw new Error('Sport parameter exceeds maximum length');
      }
      conditions.push(arrayContains(users.sports, [filters.sport]));
    }

    // Birth year filtering (applied to users table)
    // Note: Only include NULL birthDate users if explicitly requested via includeUnknownBirthYear
    // Uses EXTRACT(YEAR FROM birthDate) as birthDate is the source of truth (birthYear is computed field)
    if (filters?.birthYearFrom !== undefined && filters?.birthYearTo !== undefined) {
      // When both from and to are specified, combine them into a single OR condition
      // to avoid redundant NULL checks
      if (filters?.includeUnknownBirthYear) {
        conditions.push(
          or(
            and(
              sql`EXTRACT(YEAR FROM ${users.birthDate})::integer >= ${filters.birthYearFrom}`,
              sql`EXTRACT(YEAR FROM ${users.birthDate})::integer <= ${filters.birthYearTo}`
            )!,
            isNull(users.birthDate)
          )!
        );
      } else {
        conditions.push(
          and(
            sql`EXTRACT(YEAR FROM ${users.birthDate})::integer >= ${filters.birthYearFrom}`,
            sql`EXTRACT(YEAR FROM ${users.birthDate})::integer <= ${filters.birthYearTo}`
          )!
        );
      }
    } else if (filters?.birthYearFrom !== undefined) {
      if (filters?.includeUnknownBirthYear) {
        conditions.push(
          or(
            sql`EXTRACT(YEAR FROM ${users.birthDate})::integer >= ${filters.birthYearFrom}`,
            isNull(users.birthDate)
          )!
        );
      } else {
        conditions.push(sql`EXTRACT(YEAR FROM ${users.birthDate})::integer >= ${filters.birthYearFrom}`);
      }
    } else if (filters?.birthYearTo !== undefined) {
      if (filters?.includeUnknownBirthYear) {
        conditions.push(
          or(
            sql`EXTRACT(YEAR FROM ${users.birthDate})::integer <= ${filters.birthYearTo}`,
            isNull(users.birthDate)
          )!
        );
      } else {
        conditions.push(sql`EXTRACT(YEAR FROM ${users.birthDate})::integer <= ${filters.birthYearTo}`);
      }
    }

    // Age filtering (applied to measurements table)
    // Age is stored in the measurements table, calculated at measurement creation time
    if (filters?.ageFrom !== undefined && filters?.ageTo !== undefined) {
      conditions.push(
        and(
          gte(measurements.age, filters.ageFrom),
          lte(measurements.age, filters.ageTo)
        )!
      );
    } else if (filters?.ageFrom !== undefined) {
      conditions.push(gte(measurements.age, filters.ageFrom));
    } else if (filters?.ageTo !== undefined) {
      conditions.push(lte(measurements.age, filters.ageTo));
    }

    // Pagination parameters with safety limits to prevent memory exhaustion
    const limit = Math.min(filters?.limit || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
    const offset = Math.min(filters?.offset || 0, PAGINATION.MAX_OFFSET);

    // Build WHERE clause
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Create aliases for submitter and verifier users
    const submitterUser = alias(users, 'submitter_user');
    const verifierUser = alias(users, 'verifier_user');

    // Execute query with pagination and count in parallel
    const [results, countResult] = await Promise.all([
      db.select({
        // Measurement fields
        id: measurements.id,
        userId: measurements.userId,
        submittedBy: measurements.submittedBy,
        verifiedBy: measurements.verifiedBy,
        isVerified: measurements.isVerified,
        date: measurements.date,
        age: measurements.age,
        metric: measurements.metric,
        value: measurements.value,
        units: measurements.units,
        flyInDistance: measurements.flyInDistance,
        auxiliaryValue: measurements.auxiliaryValue,
        notes: measurements.notes,
        mediaUrl: measurements.mediaUrl,
        teamId: measurements.teamId,
        teamNameSnapshot: measurements.teamNameSnapshot,
        organizationId: measurements.organizationId,
        season: measurements.season,
        teamContextAuto: measurements.teamContextAuto,
        createdAt: measurements.createdAt,
        globalAthleteId: measurements.globalAthleteId,
        // Derived/calculated measurement fields
        isCalculated: measurements.isCalculated,
        calculatedFromMeasurementIds: measurements.calculatedFromMeasurementIds,
        calculationMetadata: measurements.calculationMetadata,
        // Device import tracking
        importSource: measurements.importSource,
        importBatchId: measurements.importBatchId,
        // Event context (if measurement was recorded at an event)
        eventId: measurements.eventId,
        eventNameSnapshot: measurements.eventNameSnapshot,
        eventDateSnapshot: measurements.eventDateSnapshot,
        // User data (athlete)
        user: sql<{
          id: string;
          firstName: string;
          lastName: string;
          fullName: string;
          birthYear: number | null;
          birthDate: string | null;
          sports: string[] | null;
          gender: string | null;
          positions: string[] | null;
        }>`jsonb_build_object(
          'id', ${users.id},
          'firstName', ${users.firstName},
          'lastName', ${users.lastName},
          'fullName', ${users.fullName},
          'birthYear', ${users.birthYear},
          'birthDate', ${users.birthDate},
          'sports', ${users.sports},
          'gender', ${users.gender},
          'positions', ${users.positions}
        )`,
        // Submitter user data
        submittedByUser: sql<{
          id: string;
          firstName: string;
          lastName: string;
          fullName: string;
        } | null>`CASE WHEN ${submitterUser.id} IS NOT NULL THEN jsonb_build_object(
          'id', ${submitterUser.id},
          'firstName', ${submitterUser.firstName},
          'lastName', ${submitterUser.lastName},
          'fullName', ${submitterUser.fullName}
        ) ELSE NULL END`,
        // Verifier user data
        verifiedByUser: sql<{
          id: string;
          firstName: string;
          lastName: string;
          fullName: string;
        } | null>`CASE WHEN ${verifierUser.id} IS NOT NULL THEN jsonb_build_object(
          'id', ${verifierUser.id},
          'firstName', ${verifierUser.firstName},
          'lastName', ${verifierUser.lastName},
          'fullName', ${verifierUser.fullName}
        ) ELSE NULL END`,
        // Organization name (prevents N+1 queries for org badge display)
        organizationName: organizations.name,
      })
        .from(measurements)
        .leftJoin(users, eq(measurements.userId, users.id))
        .leftJoin(submitterUser, eq(measurements.submittedBy, submitterUser.id))
        .leftJoin(verifierUser, eq(measurements.verifiedBy, verifierUser.id))
        .leftJoin(organizations, eq(measurements.organizationId, organizations.id))
        .where(whereClause)
        .orderBy(desc(measurements.date))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` })
        .from(measurements)
        .leftJoin(users, eq(measurements.userId, users.id))
        .where(whereClause)
    ]);

    const total = countResult[0]?.count || 0;

    // Enrich with team data
    const uniqueUserIds = [...new Set(results.map((r: any) => r.userId))];
    let measurementsWithTeams = results;

    // Safety check: prevent memory exhaustion from large user sets
    // This should never happen with pagination, but defensive programming is good practice
    if (uniqueUserIds.length > 10000) {
      console.warn(`getMeasurements: Large user set detected (${uniqueUserIds.length} users). Consider reducing page size.`);
    }

    if (uniqueUserIds.length > 0) {
      // Query user teams
      const allUserTeams = await db
        .select({
          userId: userTeams.userId,
          teamId: teams.id,
          teamName: teams.name,
          joinedAt: userTeams.joinedAt,
          leftAt: userTeams.leftAt,
          organizationId: organizations.id,
          organizationName: organizations.name,
        })
        .from(userTeams)
        .innerJoin(teams, eq(userTeams.teamId, teams.id))
        .innerJoin(organizations, eq(teams.organizationId, organizations.id))
        .where(and(
          inArray(userTeams.userId, uniqueUserIds),
          eq(userTeams.isActive, true),
          eq(teams.isArchived, false)
        ));

      // Build map of userId -> teams
      const userTeamsMap = new Map<string, typeof allUserTeams>();
      allUserTeams.forEach((ut) => {
        if (!userTeamsMap.has(ut.userId)) {
          userTeamsMap.set(ut.userId, []);
        }
        userTeamsMap.get(ut.userId)!.push(ut);
      });

      // Attach teams to measurements
      measurementsWithTeams = results.map((measurement: any) => {
        const userMemberships = userTeamsMap.get(measurement.userId) || [];

        // Show currently active teams
        const activeTeams = userMemberships.filter((membership) => {
          const leftDate = membership.leftAt ? new Date(membership.leftAt) : null;
          const now = new Date();
          return (!leftDate || leftDate >= now);
        });

        const teams = activeTeams.map((membership) => ({
          id: membership.teamId,
          name: membership.teamName,
          organization: {
            id: membership.organizationId,
            name: membership.organizationName,
          },
        }));

        return {
          ...measurement,
          user: {
            ...measurement.user,
            teams,
          },
        };
      });
    }

    return {
      measurements: measurementsWithTeams,
      total,
      hasMore: offset + results.length < total,
      limit,
      offset,
    };
  }
}
