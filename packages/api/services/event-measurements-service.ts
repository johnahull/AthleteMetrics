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

import type { IStorage } from "../storage";
import type { Measurement, Event } from "@shared/schema";

export interface EventMeasurementInput {
  userId: string;
  metric: string;
  value: number;
  date: Date;
  notes?: string;
}

export interface BulkCreateResult {
  created: Measurement[];
  errors: Array<{ index: number; error: string }>;
}

export class EventMeasurementsService {
  private storage: IStorage;

  constructor(storage: IStorage) {
    this.storage = storage;
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
    createdBy: string
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

    // Create measurement with event context
    const measurement = await this.storage.createMeasurement(
      {
        userId: data.userId,
        metric: data.metric,
        value: data.value,
        date: data.date.toISOString().split('T')[0],
        notes: data.notes,
        eventId: eventId,
        eventNameSnapshot: event.name,
        eventDateSnapshot: event.startDate.toISOString().split('T')[0],
      },
      createdBy
    );

    return measurement;
  }

  /**
   * Create multiple measurements for an event (bulk entry)
   */
  async createEventMeasurementsBulk(
    eventId: string,
    measurementsData: EventMeasurementInput[],
    createdBy: string
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

        const measurement = await this.storage.createMeasurement(
          {
            userId: m.userId,
            metric: m.metric,
            value: m.value,
            date: m.date.toISOString().split('T')[0],
            notes: m.notes,
            eventId: eventId,
            eventNameSnapshot: event.name,
            eventDateSnapshot: event.startDate.toISOString().split('T')[0],
          },
          createdBy
        );
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
