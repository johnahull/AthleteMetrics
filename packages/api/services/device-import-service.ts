/**
 * Device Import Service
 *
 * Orchestrates the parse → match → review → commit workflow for
 * device data imports (Dashr, OVR, etc.)
 */

import { db } from '../db';
import {
  measurements,
  importBatches,
  users,
  userOrganizations,
  events,
  eventRegistrations,
  eventMetrics,
  siteMetrics,
  type Measurement,
} from '@shared/schema';
import { eq, and, inArray, isNull, sql, desc, ne, or, gt } from 'drizzle-orm';
import { findBestAthleteMatch, type MatchingCriteria } from '../athlete-matching';
import { DashrCsvParser } from './parsers/dashr-csv-parser';
import { DerivedMetricCalculator } from './derived-metric-calculator';
import type { DeviceImportParser, ParsedImportData, ParsedSessionData } from './parsers/types';

// Drizzle transaction type (same query interface as db)
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const PARSE_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Parser registry — add new parsers here
const PARSERS: Record<string, DeviceImportParser> = {
  dashr: new DashrCsvParser(),
};

export interface ParseResult {
  batchId: string;
  preview: NonNullable<typeof importBatches.$inferSelect.parsedPreview>;
  sessions: ParsedSessionData[];
  warnings: string[];
}

export interface CommitOptions {
  batchId: string;
  duplicateStrategy: 'skip' | 'replace';
  addMissingEventMetrics: boolean;
  athletes: Array<{
    csvName: string;
    matchedAthleteId?: string;
    included: boolean;
  }>;
  committedBy: string;
  organizationId: string;
}

export interface CommitResult {
  measurementsCreated: number;
  measurementsSkipped: number;
  measurementsReplaced: number;
  athletesImported: number;
}

export interface BatchSummary {
  id: string;
  source: string;
  fileName: string;
  status: string;
  sessionDate: string | null;
  eventNameSnapshot: string | null;
  measurementsCreated: number | null;
  athletesImported: number | null;
  createdAt: Date;
  committedAt: Date | null;
}

export class DeviceImportService {

  /**
   * Parse a device CSV and match athletes. Returns a preview for review.
   */
  async parseAndMatch(
    file: Buffer,
    fileName: string,
    source: string,
    organizationId: string,
    userId: string,
    eventId?: string,
    sessionDate?: string,
  ): Promise<ParseResult> {
    // Resolve parser
    const parser = PARSERS[source];
    if (!parser) {
      throw new Error(`Unsupported import source: ${source}`);
    }

    if (!parser.detectFormat(file)) {
      throw new Error('File does not match expected format');
    }

    // Get session dates
    const sessions = parser.getSessionDates(file);

    // Parse CSV
    const parsed = parser.parse(file, sessionDate);

    // Build candidate pool for matching
    let candidates: any[];
    const parseWarnings: string[] = [];
    if (eventId) {
      // Narrow to event registrations first
      candidates = await this.getEventRegistrationCandidates(eventId, organizationId);
      if (candidates.length === 0) {
        parseWarnings.push('No athletes registered for this event. Matching against all organization athletes.');
        candidates = await this.getOrgCandidates(organizationId);
      }
    } else {
      candidates = await this.getOrgCandidates(organizationId);
    }

    // Match each parsed athlete
    const previewAthletes = parsed.athletes.map(athlete => {
      const criteria: MatchingCriteria = {
        firstName: athlete.firstName,
        lastName: athlete.lastName,
      };

      const match = findBestAthleteMatch(criteria, candidates);

      return {
        csvName: `${athlete.firstName} ${athlete.lastName}`,
        firstName: athlete.firstName,
        lastName: athlete.lastName,
        matchedAthleteId: match.candidate?.id,
        matchType: match.type,
        matchConfidence: match.confidence,
        alternatives: match.alternatives?.slice(0, 3).map(a => ({
          id: a.id,
          firstName: a.firstName,
          lastName: a.lastName,
          score: a.matchScore,
        })),
        drills: athlete.drills.map(d => ({
          metric: d.metric,
          value: d.value,
          units: d.units,
          splits: d.splits?.map(s => ({ metric: s.metric, value: s.value, units: s.units })),
          isOutlier: d.isOutlier,
          outlierReason: d.outlierReason,
        })),
        included: match.type !== 'none',
      };
    });

    // Build summary
    const summary = {
      totalAthletes: previewAthletes.length,
      exactMatches: previewAthletes.filter(a => a.matchType === 'exact').length,
      fuzzyMatches: previewAthletes.filter(a => a.matchType === 'fuzzy').length,
      partialMatches: previewAthletes.filter(a => a.matchType === 'partial').length,
      unmatched: previewAthletes.filter(a => a.matchType === 'none').length,
      totalDrills: previewAthletes.reduce((sum, a) => sum + a.drills.length, 0),
      outlierCount: previewAthletes.reduce(
        (sum, a) => sum + a.drills.filter(d => d.isOutlier).length, 0
      ),
    };

    // Get event name for snapshot
    let eventNameSnapshot: string | null = null;
    if (eventId) {
      const [event] = await db.select({ name: events.name }).from(events).where(eq(events.id, eventId));
      eventNameSnapshot = event?.name ?? null;
    }

    // Store in import_batches
    const expiresAt = new Date(Date.now() + PARSE_SESSION_TTL_MS);
    const [batch] = await db
      .insert(importBatches)
      .values({
        organizationId,
        source: `${source}_csv`,
        fileName,
        sessionDate: sessionDate ?? null,
        eventId: eventId ?? null,
        eventNameSnapshot,
        parsedPreview: { athletes: previewAthletes, summary },
        status: 'pending',
        createdBy: userId,
        expiresAt,
      })
      .returning({ id: importBatches.id });

    return {
      batchId: batch.id,
      preview: { athletes: previewAthletes, summary },
      sessions,
      warnings: [...parseWarnings, ...parsed.warnings],
    };
  }

  /**
   * Commit a previously parsed batch — create measurements.
   */
  async commitBatch(options: CommitOptions): Promise<CommitResult> {
    const { batchId, duplicateStrategy, addMissingEventMetrics, athletes, committedBy, organizationId } = options;

    // Load batch
    const [batch] = await db
      .select()
      .from(importBatches)
      .where(and(
        eq(importBatches.id, batchId),
        eq(importBatches.organizationId, organizationId),
      ));

    if (!batch) throw new Error('Import batch not found');
    if (batch.status !== 'pending') throw new Error(`Batch is ${batch.status}, not pending`);

    // Check TTL
    if (new Date() > batch.expiresAt) {
      await db.update(importBatches)
        .set({ status: 'expired' })
        .where(eq(importBatches.id, batchId));
      throw new Error('Import session has expired. Please re-upload the file.');
    }

    const preview = batch.parsedPreview;
    if (!preview) throw new Error('Batch has no parsed data');

    // Runtime shape check: parsedPreview is a JSONB column with only compile-time
    // typing (.$type). Validate before opening a transaction so a malformed blob
    // fails fast with a clear error instead of throwing mid-transaction.
    if (!Array.isArray(preview.athletes)) {
      throw new Error('Batch preview data is malformed (missing athletes array)');
    }

    // Check event not frozen (if linked)
    if (batch.eventId) {
      const [event] = await db.select({ isFrozen: events.isFrozen })
        .from(events)
        .where(eq(events.id, batch.eventId));
      if (event?.isFrozen) throw new Error('Cannot import to a frozen event');
    }

    // Build athlete override map from client selections
    const overrideMap = new Map<string, { matchedAthleteId?: string; included: boolean }>();
    for (const a of athletes) {
      overrideMap.set(a.csvName, { matchedAthleteId: a.matchedAthleteId, included: a.included });
    }

    // Pre-fetch all included athlete IDs (for bulk birth date + metric unit lookups)
    const allAthleteIds = new Set<string>();
    const allMetricCodes = new Set<string>();
    for (const previewAthlete of preview.athletes) {
      const override = overrideMap.get(previewAthlete.csvName);
      const included = override?.included ?? previewAthlete.included;
      if (!included) continue;
      const athleteId = override?.matchedAthleteId ?? previewAthlete.matchedAthleteId;
      if (athleteId) allAthleteIds.add(athleteId);
      for (const drill of previewAthlete.drills) {
        allMetricCodes.add(drill.metric);
        if (drill.splits) drill.splits.forEach(s => allMetricCodes.add(s.metric));
      }
    }

    // Security: validate all client-supplied athlete IDs belong to this organization.
    // This prevents a coach from assigning measurements to athletes from a different org
    // by supplying a foreign athleteId in the override map.
    if (allAthleteIds.size > 0) {
      const orgMembers = await db
        .select({ userId: userOrganizations.userId })
        .from(userOrganizations)
        .where(and(
          eq(userOrganizations.organizationId, organizationId),
          inArray(userOrganizations.userId, [...allAthleteIds]),
        ));
      const orgMemberIds = new Set(orgMembers.map(m => m.userId));
      for (const id of allAthleteIds) {
        if (!orgMemberIds.has(id)) {
          throw new Error(`Athlete ${id} does not belong to organization ${organizationId}`);
        }
      }
    }

    // Bulk-fetch birth dates and metric units before opening the transaction
    const [userRows, metricRows] = await Promise.all([
      allAthleteIds.size > 0
        ? db.select({ id: users.id, birthDate: users.birthDate }).from(users)
            .where(inArray(users.id, [...allAthleteIds]))
        : Promise.resolve([]),
      allMetricCodes.size > 0
        ? db.select({ code: siteMetrics.code, unit: siteMetrics.unit }).from(siteMetrics)
            .where(inArray(siteMetrics.code, [...allMetricCodes]))
        : Promise.resolve([]),
    ]);

    const birthDateMap = new Map(userRows.map(u => [u.id, u.birthDate]));
    const unitMap = new Map(metricRows.map(m => [m.code, m.unit]));

    const missingBirthDateAthletes = new Set<string>();

    // Helper: compute age from athlete birth date and measurement date string.
    // Returns 0 when birth date is unknown (schema requires non-null integer); the caller
    // tracks which athletes were affected so a warning can be surfaced to the user.
    const computeAge = (athleteId: string, dateStr: string): number => {
      const birthDate = birthDateMap.get(athleteId);
      if (!birthDate) {
        missingBirthDateAthletes.add(athleteId);
        return 0;
      }
      const measurementDate = new Date(dateStr);
      const bd = new Date(birthDate);
      let age = measurementDate.getFullYear() - bd.getFullYear();
      const birthdayThisYear = new Date(measurementDate.getFullYear(), bd.getMonth(), bd.getDate());
      if (measurementDate < birthdayThisYear) age -= 1;
      return age;
    };

    let created = 0;
    let skipped = 0;
    let replaced = 0;
    const importedAthleteIds = new Set<string>();
    const recalcPairs = new Set<string>(); // "userId|metric" pairs

    // Wrap all measurement operations in a single transaction so that either all succeed
    // or all are rolled back together. Individual measurement insert failures are caught
    // and counted as skipped (best-effort) rather than aborting the entire batch.
    // Measurements are inserted directly via tx (not via MeasurementService which uses its
    // own internal db.transaction and would be outside this transaction boundary).
    await db.transaction(async (tx) => {
      // Re-check TTL and status inside the transaction to close the race window
      // between the outer check and this point. Uses FOR UPDATE to lock the row
      // so no concurrent commit can proceed on the same batch.
      const [freshBatch] = await tx.execute(
        sql`SELECT status, expires_at FROM import_batches WHERE id = ${batchId} FOR UPDATE`
      ) as any[];
      if (freshBatch?.status !== 'pending') {
        throw new Error(`Batch is ${freshBatch?.status ?? 'unknown'}, not pending`);
      }
      if (new Date() > new Date(freshBatch.expires_at)) {
        await tx.update(importBatches)
          .set({ status: 'expired' })
          .where(eq(importBatches.id, batchId));
        throw new Error('Import session has expired. Please re-upload the file.');
      }

      // Process each athlete
      for (const previewAthlete of preview.athletes) {
        const override = overrideMap.get(previewAthlete.csvName);
        const included = override?.included ?? previewAthlete.included;
        if (!included) continue;

        const athleteId = override?.matchedAthleteId ?? previewAthlete.matchedAthleteId;
        if (!athleteId) continue;

        importedAthleteIds.add(athleteId);

        for (const drill of previewAthlete.drills) {
          // Fall back to the batch creation date (upload time) rather than commit time,
          // so the measurement date reflects when the data was uploaded, not when it was confirmed.
          const date = batch.sessionDate ?? batch.createdAt.toISOString().split('T')[0];

          // Check for duplicates — only consider device-imported measurements.
          // Manual (hand-entered) measurements have importSource = NULL and are
          // never overwritten by a device import to prevent silent data loss.
          const existing = await tx
            .select({ id: measurements.id })
            .from(measurements)
            .where(and(
              eq(measurements.userId, athleteId),
              eq(measurements.metric, drill.metric),
              eq(measurements.date, date),
              batch.eventId
                ? eq(measurements.eventId, batch.eventId)
                : isNull(measurements.eventId),
              sql`${measurements.importSource} IS NOT NULL`,
            ));

          if (existing.length > 0) {
            if (duplicateStrategy === 'skip') {
              skipped++;
              continue;
            }
            // Replace: delete parent measurement and any orphaned split measurements
            // for this drill (same athlete/date/event). Splits have distinct metric
            // codes (e.g. DASH_10YD, DASH_20YD) so they don't appear in `existing`
            // but must be cleaned up to prevent duplicates on re-import.
            const splitMetrics = drill.splits?.map(s => s.metric) ?? [];
            const metricsToDelete = [drill.metric, ...splitMetrics];
            await tx.delete(measurements)
              .where(and(
                eq(measurements.userId, athleteId),
                inArray(measurements.metric, metricsToDelete),
                eq(measurements.date, date),
                batch.eventId
                  ? eq(measurements.eventId, batch.eventId)
                  : isNull(measurements.eventId),
                sql`${measurements.importSource} IS NOT NULL`,
              ));
            replaced++;
          }

          // Insert measurement directly via tx — stays inside this transaction.
          // No inner try/catch: any error here aborts the PostgreSQL transaction
          // (the tx enters an error state and all subsequent statements fail), so we
          // let it propagate and the outer db.transaction() will roll back atomically.
          await tx.insert(measurements).values({
            userId: athleteId,
            submittedBy: committedBy,
            metric: drill.metric,
            value: String(drill.value),
            date,
            age: computeAge(athleteId, date),
            units: (() => {
              const u = unitMap.get(drill.metric) ?? drill.units;
              if (!u) throw new Error(`No unit configured for metric ${drill.metric}`);
              return u;
            })(),
            eventId: batch.eventId ?? null,
            organizationId,
            importSource: batch.source,
            importBatchId: batchId,
            notes: `Imported from ${batch.fileName}`,
            isCalculated: false,
            isVerified: false,
            teamContextAuto: false,
            calculationMetadata: {
              formula: 'direct_import',
              sourceValues: {},
              calculatedAt: new Date().toISOString(),
              triggeredBy: {
                event: 'bulk_import',
                userId: committedBy,
              },
            },
          });
          created++;
          recalcPairs.add(`${athleteId}|${drill.metric}`);

          // Also insert split measurements inside the same transaction
          if (drill.splits) {
            for (const split of drill.splits) {
              await tx.insert(measurements).values({
                userId: athleteId,
                submittedBy: committedBy,
                metric: split.metric,
                value: String(split.value),
                date,
                age: computeAge(athleteId, date),
                units: (() => {
                  const u = unitMap.get(split.metric) ?? split.units;
                  if (!u) throw new Error(`No unit configured for metric ${split.metric}`);
                  return u;
                })(),
                eventId: batch.eventId ?? null,
                organizationId,
                importSource: batch.source,
                importBatchId: batchId,
                notes: `Split from ${drill.metric} — imported from ${batch.fileName}`,
                isCalculated: false,
                isVerified: false,
                teamContextAuto: false,
              });
              created++;
              recalcPairs.add(`${athleteId}|${split.metric}`);
            }
          }
        }
      }

      // Add missing event metrics inside the same transaction
      if (addMissingEventMetrics && batch.eventId) {
        await this.addMissingEventMetrics(batch.eventId, preview.athletes, tx);
      }

      // Update batch status within the same transaction
      await tx.update(importBatches)
        .set({
          status: 'completed',
          committedBy,
          committedAt: new Date(),
          measurementsCreated: created,
          measurementsSkipped: skipped,
          measurementsReplaced: replaced,
          athletesImported: importedAthleteIds.size,
          parsedPreview: null, // Clear preview data to save space
        })
        .where(eq(importBatches.id, batchId));
    });

    // Recalculate derived metrics per unique athlete/metric pair
    const calculator = new DerivedMetricCalculator(db);
    for (const pair of recalcPairs) {
      const [userId, metric] = pair.split('|');
      try {
        await calculator.recalculateForAthlete(userId, metric, undefined, {
          triggerContext: { event: 'bulk_import', userId: committedBy },
        });
      } catch (err: any) {
        console.error(`Failed to recalculate derived metrics for ${userId}/${metric}:`, err.message);
      }
    }

    return {
      measurementsCreated: created,
      measurementsSkipped: skipped,
      measurementsReplaced: replaced,
      athletesImported: importedAthleteIds.size,
      ...(missingBirthDateAthletes.size > 0
        ? { warnings: [`${missingBirthDateAthletes.size} athlete(s) had no birth date on file; age was recorded as 0.`] }
        : {}),
    };
  }

  /**
   * Rollback a committed batch — delete all measurements and recalculate.
   */
  async rollbackBatch(batchId: string, userId: string, organizationId: string): Promise<void> {
    const [batch] = await db
      .select()
      .from(importBatches)
      .where(and(
        eq(importBatches.id, batchId),
        eq(importBatches.organizationId, organizationId),
      ));

    if (!batch) throw new Error('Import batch not found');
    if (batch.status !== 'completed') throw new Error('Can only rollback completed batches');

    // Step 1: Find all measurements from this batch
    const batchMeasurements = await db
      .select({
        id: measurements.id,
        userId: measurements.userId,
        metric: measurements.metric,
        date: measurements.date,
      })
      .from(measurements)
      .where(eq(measurements.importBatchId, batchId));

    // Collect unique userId/metric pairs for recalculation
    const recalcPairs = new Set<string>();
    for (const m of batchMeasurements) {
      recalcPairs.add(`${m.userId}|${m.metric}`);
    }

    // Step 2: Bulk delete + status update in a single transaction
    await db.transaction(async (tx) => {
      if (batchMeasurements.length > 0) {
        await tx.delete(measurements)
          .where(eq(measurements.importBatchId, batchId));
      }

      await tx.update(importBatches)
        .set({
          status: 'rolled_back',
          rolledBackBy: userId,
          rolledBackAt: new Date(),
        })
        .where(eq(importBatches.id, batchId));
    });

    // Step 3: Recalculate derived metrics
    const calculator = new DerivedMetricCalculator(db);
    for (const pair of recalcPairs) {
      const [athleteId, metric] = pair.split('|');
      try {
        await calculator.recalculateForAthlete(athleteId, metric, undefined, {
          triggerContext: { event: 'measurement_delete', userId },
        });
      } catch (err: any) {
        console.error(`Failed to recalculate after rollback for ${athleteId}/${metric}:`, err.message);
      }
    }
  }

  /**
   * Get all import batches for an organization
   */
  async getBatches(organizationId: string): Promise<BatchSummary[]> {
    const batches = await db
      .select({
        id: importBatches.id,
        source: importBatches.source,
        fileName: importBatches.fileName,
        status: importBatches.status,
        sessionDate: importBatches.sessionDate,
        eventNameSnapshot: importBatches.eventNameSnapshot,
        measurementsCreated: importBatches.measurementsCreated,
        athletesImported: importBatches.athletesImported,
        createdAt: importBatches.createdAt,
        committedAt: importBatches.committedAt,
      })
      .from(importBatches)
      .where(and(
        eq(importBatches.organizationId, organizationId),
        // Exclude pending batches whose TTL has elapsed — they are unusable stale entries
        or(
          ne(importBatches.status, 'pending'),
          gt(importBatches.expiresAt, sql`NOW()`),
        ),
      ))
      .orderBy(desc(importBatches.createdAt))
      .limit(50);

    return batches;
  }

  /**
   * Get detail for a single batch
   */
  async getBatchDetail(batchId: string, organizationId: string) {
    const [batch] = await db
      .select()
      .from(importBatches)
      .where(and(
        eq(importBatches.id, batchId),
        eq(importBatches.organizationId, organizationId),
      ));

    return batch ?? null;
  }

  // ────────────────── Private helpers ──────────────────

  /**
   * Get athletes registered for a specific event
   */
  private async getEventRegistrationCandidates(eventId: string, organizationId: string) {
    // Security: join through events to verify the event belongs to this organization.
    // Without this, a coach in Org A who knows an event ID from Org B could leak
    // athlete names from Org B's registrations.
    const registrations = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        emails: users.emails,
        birthYear: users.birthYear,
        username: users.username,
      })
      .from(eventRegistrations)
      .innerJoin(users, eq(eventRegistrations.userId, users.id))
      .innerJoin(events, eq(eventRegistrations.eventId, events.id))
      .where(and(
        eq(eventRegistrations.eventId, eventId),
        eq(events.organizationId, organizationId), // Verify event belongs to this org
        inArray(eventRegistrations.status, ['approved', 'checked_in', 'completed']),
      ));

    return registrations;
  }

  /**
   * Get all athletes in an organization
   */
  private async getOrgCandidates(organizationId: string) {
    const orgAthletes = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        emails: users.emails,
        birthYear: users.birthYear,
        username: users.username,
      })
      .from(userOrganizations)
      .innerJoin(users, eq(userOrganizations.userId, users.id))
      .where(and(
        eq(userOrganizations.organizationId, organizationId),
        eq(userOrganizations.role, 'athlete'),
      ));

    return orgAthletes;
  }

  /**
   * Add missing event metrics for metrics found in the import.
   * Accepts a transaction so additions are part of the same atomic commit as measurements.
   */
  private async addMissingEventMetrics(eventId: string, athletes: any[], tx: Tx) {
    // Collect all unique metric codes from the import
    const metricCodes = new Set<string>();
    for (const athlete of athletes) {
      for (const drill of athlete.drills) {
        metricCodes.add(drill.metric);
        if (drill.splits) {
          for (const split of drill.splits) {
            metricCodes.add(split.metric);
          }
        }
      }
    }

    if (metricCodes.size === 0) return;

    // Get existing event metrics and verify metric codes — both inside the transaction
    const [existingMetrics, validMetrics] = await Promise.all([
      tx.select({ metricCode: eventMetrics.metricCode })
        .from(eventMetrics)
        .where(eq(eventMetrics.eventId, eventId)),
      tx.select({ code: siteMetrics.code })
        .from(siteMetrics)
        .where(inArray(siteMetrics.code, [...metricCodes])),
    ]);

    const existingCodes = new Set(existingMetrics.map(m => m.metricCode));
    const validCodes = new Set(validMetrics.map(m => m.code));

    // Add missing valid metrics in one batch insert
    const toAdd = [...metricCodes].filter(code => !existingCodes.has(code) && validCodes.has(code));
    if (toAdd.length > 0) {
      await tx.insert(eventMetrics)
        .values(toAdd.map(code => ({ eventId, metricCode: code })))
        .onConflictDoNothing();
    }
  }
}
