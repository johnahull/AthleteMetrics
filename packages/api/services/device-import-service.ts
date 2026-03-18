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
import { eq, and, inArray, isNull, sql, desc } from 'drizzle-orm';
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
    if (eventId) {
      // Narrow to event registrations first
      candidates = await this.getEventRegistrationCandidates(eventId, organizationId);
      if (candidates.length === 0) {
        // Fallback to org-wide
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
      warnings: parsed.warnings,
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

    // Helper: compute age from athlete birth date and measurement date string
    const computeAge = (athleteId: string, dateStr: string): number => {
      const birthDate = birthDateMap.get(athleteId);
      if (!birthDate) return 0;
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

    // Wrap all measurement operations in a single transaction for atomicity.
    // Measurements are inserted directly via tx (not via MeasurementService which uses its
    // own internal db.transaction and would be outside this transaction boundary).
    await db.transaction(async (tx) => {
      // Process each athlete
      for (const previewAthlete of preview.athletes) {
        const override = overrideMap.get(previewAthlete.csvName);
        const included = override?.included ?? previewAthlete.included;
        if (!included) continue;

        const athleteId = override?.matchedAthleteId ?? previewAthlete.matchedAthleteId;
        if (!athleteId) continue;

        importedAthleteIds.add(athleteId);

        for (const drill of previewAthlete.drills) {
          const date = batch.sessionDate ?? new Date().toISOString().split('T')[0];

          // Check for duplicates
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
            ));

          if (existing.length > 0) {
            if (duplicateStrategy === 'skip') {
              skipped++;
              continue;
            }
            // Replace: delete existing (inside tx for atomicity), then insert replacement below
            await tx.delete(measurements)
              .where(inArray(measurements.id, existing.map(e => e.id)));
            replaced++;
          }

          // Insert measurement directly via tx — stays inside this transaction
          try {
            await tx.insert(measurements).values({
              userId: athleteId,
              submittedBy: committedBy,
              metric: drill.metric,
              value: String(drill.value),
              date,
              age: computeAge(athleteId, date),
              units: unitMap.get(drill.metric) ?? drill.units ?? 'in',
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
                  units: unitMap.get(split.metric) ?? split.units ?? 'in',
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
          } catch (err: any) {
            // Log but continue — don't fail the whole batch for one measurement
            console.error(`Failed to insert measurement for ${previewAthlete.csvName} ${drill.metric}:`, err.message);
            skipped++;
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
      .where(eq(importBatches.organizationId, organizationId))
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
