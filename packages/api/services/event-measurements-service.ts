/**
 * EventMeasurementsService - Handles creating/retrieving measurements for events
 *
 * TDD Phase 6.2: GREEN - Implementation based on passing tests
 *
 * This service wraps the storage layer with event-specific logic:
 * - Validates that events exist and are not frozen
 * - Adds eventId and snapshots to measurements
 * - Respects event freeze status
 */

import { eq, inArray } from "drizzle-orm";
import type { IStorage } from "../storage";
import { measurements, siteMetrics, type Measurement, type Event } from "@shared/schema";
import { MeasurementValueValidationError } from "@shared/measurement-value-validation";
import { db as defaultDb } from "../db";
import { MeasurementService } from "./measurement-service";
import { DerivedMetricCalculator } from "./derived-metric-calculator";
import { PairedInputValidationError } from "./paired-input-compute";

/** site_metrics.category of the ordinal Movement Quality scores (AM-FEAT-015) */
const MQ_CATEGORY = "Movement Quality";

export class EventNotFoundError extends Error {
  constructor(message = "Event not found") {
    super(message);
    this.name = "EventNotFoundError";
  }
}

export class EventFrozenError extends Error {
  constructor(message = "Cannot create measurements for frozen event") {
    super(message);
    this.name = "EventFrozenError";
  }
}

export class EventMeasurementNotFoundError extends Error {
  constructor(message = "Measurement not found for this event") {
    super(message);
    this.name = "EventMeasurementNotFoundError";
  }
}

/** Invalid input for an event write (maps to HTTP 400) */
export class EventMeasurementInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventMeasurementInputError";
  }
}

/** One or more Movement Quality scores failed validation; nothing was saved */
export class MovementQualitySaveError extends Error {
  constructor(public readonly errors: Array<{ metric: string; error: string }>) {
    super(`${errors.length} score${errors.length === 1 ? "" : "s"} could not be saved; no changes were made`);
    this.name = "MovementQualitySaveError";
  }
}

export interface EventMeasurementInput {
  userId: string;
  metric: string;
  value: number;
  date: Date;
  notes?: string;
  /** Validated by the route (mediaUrlSchema); null clears */
  mediaUrl?: string | null;
  /** Secondary input for paired-input metrics (e.g. reps) */
  auxiliaryValue?: number | null;
  /** Optional fly-in distance (FLY10_TIME) */
  flyInDistance?: number;
}

export interface MovementQualityScoreInput {
  metric: string;
  value: number;
  notes?: string;
  mediaUrl?: string | null;
}

export interface BulkCreateResult {
  created: Measurement[];
  errors: Array<{ index: number; error: string }>;
}

type Db = typeof defaultDb;
type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * The event's calendar date ('YYYY-MM-DD').
 *
 * Events are created from a date-only form field, which is stored as UTC midnight
 * (EventForm -> new Date('YYYY-MM-DD')), so the UTC date of start_date IS the event's
 * calendar date. events.timezone is deliberately not applied: converting a UTC-midnight
 * date to e.g. America/New_York would move every date-only event to the previous day.
 */
export function eventCalendarDate(event: Pick<Event, "startDate">): string {
  return new Date(event.startDate).toISOString().split("T")[0];
}

export class EventMeasurementsService {
  private storage: IStorage;

  private measurementService: MeasurementService;

  private db: Db;

  constructor(
    storage: IStorage,
    measurementService: MeasurementService = new MeasurementService(),
    database: Db = defaultDb
  ) {
    this.storage = storage;
    this.measurementService = measurementService;
    this.db = database;
  }

  private async getWritableEvent(eventId: string, frozenMessage?: string): Promise<Event> {
    const event = await this.storage.getEvent(eventId);
    if (!event) {
      throw new EventNotFoundError();
    }
    if (event.isFrozen) {
      throw new EventFrozenError(frozenMessage);
    }
    if (!event.startDate) {
      throw new EventMeasurementInputError("Event must have a start date");
    }
    return event;
  }

  /**
   * Event measurements may only be written for members of the event's organization
   * (a coach must not write into another organization's athlete record).
   */
  private async assertAthleteInEventOrg(event: Event, userId: string): Promise<void> {
    if (!event.organizationId) return;
    const roles = await this.storage.getUserRoles(userId, event.organizationId);
    if (roles.length === 0) {
      throw new EventMeasurementInputError("Athlete is not a member of this event's organization");
    }
  }

  private async isMovementQualityScore(metric: string, dbOrTx: Db | DbTransaction = this.db): Promise<boolean> {
    return (await this.movementQualityCodes([metric], dbOrTx)).has(metric);
  }

  /** The subset of `metrics` that are Movement Quality base scores, in one query */
  private async movementQualityCodes(metrics: string[], dbOrTx: Db | DbTransaction = this.db): Promise<Set<string>> {
    const codes = [...new Set(metrics)];
    if (codes.length === 0) return new Set();
    const rows = await dbOrTx
      .select({ code: siteMetrics.code, category: siteMetrics.category, isDerived: siteMetrics.isDerived })
      .from(siteMetrics)
      .where(inArray(siteMetrics.code, codes));
    return new Set(rows.filter((r) => r.category === MQ_CATEGORY && !r.isDerived).map((r) => r.code));
  }

  /**
   * Write one measurement through MeasurementService (units from site_metrics, metric-aware
   * value validation, coach auto-verify, derived-metric calculator) with event context.
   *
   * Movement Quality scores are one-per-athlete-per-event (written again = edited in place,
   * serialized inside MeasurementService's transaction) and always use the event's date, so
   * every score of an event lines up for the derived totals whatever date the client sent.
   * All other metrics keep append semantics and the client's date.
   * Before results are published the athlete is not notified and no achievements run.
   */
  private async writeEventMeasurement(
    event: Event,
    data: EventMeasurementInput,
    createdBy: string,
    /** No role fails closed: MeasurementService then treats the writer as an athlete */
    submitterRole: string | undefined,
    tx?: DbTransaction,
    /** Already known by a caller that batch-checked the metrics */
    knownIsMq?: boolean
  ): Promise<Measurement> {
    await this.assertAthleteInEventOrg(event, data.userId);
    const eventDate = eventCalendarDate(event);
    const isMq = knownIsMq ?? (await this.isMovementQualityScore(data.metric, tx));

    return this.measurementService.createMeasurement(
      {
        userId: data.userId,
        metric: data.metric,
        value: data.value,
        date: isMq ? eventDate : data.date.toISOString().split("T")[0],
        notes: data.notes,
        mediaUrl: data.mediaUrl,
        auxiliaryValue: data.auxiliaryValue ?? undefined,
        flyInDistance: data.flyInDistance,
      },
      createdBy,
      submitterRole,
      {
        eventId: event.id,
        eventNameSnapshot: event.name,
        eventDateSnapshot: eventDate,
        organizationId: event.organizationId,
        upsertPerEvent: isMq,
      },
      { tx, suppressSideEffects: !event.resultsPublishedAt }
    );
  }

  /**
   * Delete a measurement that belongs to an event (e.g. clearing a Movement Quality score).
   * Frozen events stay frozen. Derived totals are recalculated by MeasurementService.
   */
  async deleteEventMeasurement(eventId: string, measurementId: string): Promise<void> {
    const event = await this.getWritableEvent(eventId, "Cannot delete measurements for frozen event");
    const [existing] = await this.db
      .select({ id: measurements.id, eventId: measurements.eventId })
      .from(measurements)
      .where(eq(measurements.id, measurementId));
    if (!existing || existing.eventId !== eventId) {
      throw new EventMeasurementNotFoundError();
    }
    await this.measurementService.deleteMeasurement(measurementId, event.organizationId ?? undefined);
  }

  /**
   * Save one athlete's Movement Quality scores for an event in ONE transaction:
   * upserts (one row per metric) and deletes (cleared scores) either all apply or none do.
   * Deletes are scoped to this event and athlete. Derived totals are recalculated once
   * after the commit.
   */
  async saveMovementQuality(
    eventId: string,
    userId: string,
    input: { upserts: MovementQualityScoreInput[]; deletes: string[] },
    submittedBy: string,
    submitterRole: string
  ): Promise<{ saved: Measurement[]; deleted: string[] }> {
    const event = await this.getWritableEvent(eventId, "Cannot modify measurements for frozen event");
    const eventDate = eventCalendarDate(event);

    const upsertMqCodes = await this.movementQualityCodes(input.upserts.map((u) => u.metric));
    for (const u of input.upserts) {
      if (!upsertMqCodes.has(u.metric)) {
        throw new EventMeasurementInputError(`${u.metric} is not a Movement Quality score`);
      }
    }

    const saved: Measurement[] = [];
    const touched = new Set<string>();

    await this.db.transaction(async (tx) => {
      const deleteRows = input.deletes.length
        ? await tx
            .select({ id: measurements.id, eventId: measurements.eventId, userId: measurements.userId, metric: measurements.metric })
            .from(measurements)
            .where(inArray(measurements.id, input.deletes))
        : [];
      const deleteRowsById = new Map(deleteRows.map((r) => [r.id, r]));
      const deleteMqCodes = await this.movementQualityCodes(deleteRows.map((r) => r.metric), tx);
      for (const measurementId of input.deletes) {
        const row = deleteRowsById.get(measurementId);
        if (!row || row.eventId !== eventId || row.userId !== userId || !deleteMqCodes.has(row.metric)) {
          throw new EventMeasurementNotFoundError();
        }
        await this.measurementService.deleteMeasurement(measurementId, event.organizationId ?? undefined, { tx });
        touched.add(row.metric);
      }

      const errors: Array<{ metric: string; error: string }> = [];
      for (const u of input.upserts) {
        try {
          saved.push(
            await this.writeEventMeasurement(
              event,
              { userId, metric: u.metric, value: u.value, date: new Date(eventDate), notes: u.notes, mediaUrl: u.mediaUrl },
              submittedBy,
              submitterRole,
              tx,
              true // checked above: every upsert is a Movement Quality score
            )
          );
          touched.add(u.metric);
        } catch (err) {
          // Validation failures roll back only their own savepoint; collect them all, then abort
          if (err instanceof MeasurementValueValidationError || err instanceof PairedInputValidationError) {
            errors.push({ metric: u.metric, error: err.message });
          } else {
            throw err;
          }
        }
      }
      if (errors.length > 0) {
        throw new MovementQualitySaveError(errors);
      }
    });

    // Recalculate (create, update or remove) the totals fed by the touched scores
    const calculator = new DerivedMetricCalculator(this.db);
    for (const metric of touched) {
      try {
        await calculator.recalculateForAthlete(userId, metric, eventDate, {
          triggerContext: { event: "measurement_update", userId: submittedBy },
        });
      } catch (derivedError) {
        console.error("Derived metric recalculation failed after Movement Quality save:", {
          eventId,
          userId,
          metric,
          date: eventDate,
          error: derivedError,
        });
      }
    }

    return { saved, deleted: input.deletes };
  }

  /**
   * Get all measurements for an event
   */
  async getEventMeasurements(
    eventId: string,
    options?: {
      userId?: string;
      metricCode?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<Measurement[]> {
    // Get measurements filtered by eventId
    const allMeasurements = await this.storage.getMeasurements({
      userId: options?.userId,
    });

    // Filter by eventId - measurements have optional eventId field
    return allMeasurements.filter((m) => m.eventId === eventId);
  }

  /**
   * Create a single measurement for an event
   */
  async createEventMeasurement(
    eventId: string,
    data: EventMeasurementInput,
    createdBy: string,
    submitterRole?: string
  ): Promise<Measurement> {
    const event = await this.getWritableEvent(eventId);

    // Validate metric code format
    if (!data.metric || typeof data.metric !== 'string') {
      throw new EventMeasurementInputError('Invalid metric code');
    }

    return this.writeEventMeasurement(event, data, createdBy, submitterRole);
  }

  /**
   * Create multiple measurements for an event (bulk entry)
   */
  async createEventMeasurementsBulk(
    eventId: string,
    measurementsData: EventMeasurementInput[],
    createdBy: string,
    submitterRole?: string
  ): Promise<BulkCreateResult> {
    const event = await this.getWritableEvent(eventId);

    const created: Measurement[] = [];
    const errors: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < measurementsData.length; i++) {
      try {
        const m = measurementsData[i];

        // Validate metric code
        if (!m.metric || typeof m.metric !== 'string') {
          throw new Error('Invalid metric code');
        }

        const measurement = await this.writeEventMeasurement(event, m, createdBy, submitterRole);
        created.push(measurement);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        errors.push({ index: i, error: errorMessage });
      }
    }

    return { created, errors };
  }

  /**
   * Get summary statistics for an event's measurements
   */
  async getEventMeasurementStats(eventId: string): Promise<{
    totalMeasurements: number;
    uniqueAthletes: number;
    metricsRecorded: string[];
  }> {
    const measurements = await this.getEventMeasurements(eventId);

    const uniqueAthletes = new Set(measurements.map((m: any) => m.userId)).size;
    const metricsRecorded = [...new Set(measurements.map((m: any) => m.metric))];

    return {
      totalMeasurements: measurements.length,
      uniqueAthletes,
      metricsRecorded,
    };
  }
}
