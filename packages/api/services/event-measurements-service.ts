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

import { and, eq } from "drizzle-orm";
import type { IStorage } from "../storage";
import { measurements, siteMetrics, type Measurement, type Event } from "@shared/schema";
import { db } from "../db";
import { MeasurementService } from "./measurement-service";

/** site_metrics.category of the ordinal Movement Quality scores (AM-FEAT-015) */
const MQ_CATEGORY = "Movement Quality";

export interface EventMeasurementInput {
  userId: string;
  metric: string;
  value: number;
  date: Date;
  notes?: string;
  /** Validated by the route (mediaUrlSchema); null clears */
  mediaUrl?: string | null;
}

export interface BulkCreateResult {
  created: Measurement[];
  errors: Array<{ index: number; error: string }>;
}

export class EventMeasurementsService {
  private storage: IStorage;

  private measurementService: MeasurementService;

  constructor(storage: IStorage, measurementService: MeasurementService = new MeasurementService()) {
    this.storage = storage;
    this.measurementService = measurementService;
  }

  /**
   * Write one measurement through MeasurementService (units from site_metrics, metric-aware
   * value validation, coach auto-verify, derived-metric calculator) with event context.
   *
   * Movement Quality scores are one-per-athlete-per-event: writing again edits the existing
   * row instead of creating a duplicate. All other metrics keep append semantics.
   */
  private async writeEventMeasurement(
    event: Event,
    data: EventMeasurementInput,
    createdBy: string,
    submitterRole: string
  ): Promise<Measurement> {
    const date = data.date.toISOString().split("T")[0];

    const [metricRow] = await db
      .select({ category: siteMetrics.category })
      .from(siteMetrics)
      .where(eq(siteMetrics.code, data.metric));

    if (metricRow?.category === MQ_CATEGORY) {
      const [existing] = await db
        .select({ id: measurements.id })
        .from(measurements)
        .where(
          and(
            eq(measurements.userId, data.userId),
            eq(measurements.metric, data.metric),
            eq(measurements.eventId, event.id)
          )
        )
        .limit(1);

      if (existing) {
        return this.measurementService.updateMeasurement(existing.id, {
          value: data.value,
          date,
          notes: data.notes,
          mediaUrl: data.mediaUrl,
        });
      }
    }

    return this.measurementService.createMeasurement(
      {
        userId: data.userId,
        metric: data.metric,
        value: data.value,
        date,
        notes: data.notes,
        mediaUrl: data.mediaUrl,
      } as any,
      createdBy,
      submitterRole,
      {
        eventId: event.id,
        eventNameSnapshot: event.name,
        eventDateSnapshot: event.startDate.toISOString().split("T")[0],
      }
    );
  }

  /**
   * Delete a measurement that belongs to an event (e.g. clearing a Movement Quality score).
   * Frozen events stay frozen. Derived totals are recalculated by MeasurementService.
   */
  async deleteEventMeasurement(eventId: string, measurementId: string): Promise<void> {
    const event = await this.storage.getEvent(eventId);
    if (!event) {
      throw new Error("Event not found");
    }
    if (event.isFrozen) {
      throw new Error("Cannot delete measurements for frozen event");
    }
    const [existing] = await db
      .select({ id: measurements.id, eventId: measurements.eventId })
      .from(measurements)
      .where(eq(measurements.id, measurementId));
    if (!existing || existing.eventId !== eventId) {
      throw new Error("Measurement not found for this event");
    }
    await this.measurementService.deleteMeasurement(measurementId);
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
    submitterRole: string = "coach"
  ): Promise<Measurement> {
    // Get event to check frozen status and for snapshots
    const event = await this.storage.getEvent(eventId);
    if (!event) {
      throw new Error("Event not found");
    }

    if (event.isFrozen) {
      throw new Error("Cannot create measurements for frozen event");
    }

    // Validate metric code format
    if (!data.metric || typeof data.metric !== 'string') {
      throw new Error('Invalid metric code');
    }

    // Validate event has a start date
    if (!event.startDate) {
      throw new Error('Event must have a start date');
    }

    const measurement = await this.writeEventMeasurement(event, data, createdBy, submitterRole);

    return measurement;
  }

  /**
   * Create multiple measurements for an event (bulk entry)
   */
  async createEventMeasurementsBulk(
    eventId: string,
    measurementsData: EventMeasurementInput[],
    createdBy: string,
    submitterRole: string = "coach"
  ): Promise<BulkCreateResult> {
    const event = await this.storage.getEvent(eventId);
    if (!event) {
      throw new Error("Event not found");
    }

    if (event.isFrozen) {
      throw new Error("Cannot create measurements for frozen event");
    }

    // Validate event has a start date before bulk operation
    if (!event.startDate) {
      throw new Error('Event must have a start date');
    }

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
