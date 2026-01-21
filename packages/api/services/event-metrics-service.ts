/**
 * EventMetricsService - Handles event-specific metric configuration
 * Manages which metrics/tests are available at a particular event
 *
 * TDD Phase 4.2: GREEN - Implementation to make tests pass
 */

import {
  type EventMetric,
  type InsertEventMetric,
  type SiteMetric,
} from '@shared/schema';
import type { IStorage } from '../storage';

export interface AddMetricOptions {
  displayOrder?: number;
  isRequired?: boolean;
  customLabel?: string;
}

export interface UpdateMetricOptions {
  displayOrder?: number;
  isRequired?: boolean;
  customLabel?: string | null;
}

export interface ListMetricsOptions {
  includeMetricDetails?: boolean;
}

export interface BulkAddMetricItem {
  metricCode: string;
  displayOrder?: number;
  isRequired?: boolean;
  customLabel?: string;
}

export interface BulkAddOptions {
  skipExisting?: boolean;
}

export interface EventMetricWithDetails extends EventMetric {
  metricDetails?: SiteMetric | null;
}

/**
 * Extended storage interface for metrics operations
 */
export interface IMetricsStorage extends IStorage {
  createEventMetric(data: InsertEventMetric): Promise<EventMetric>;
  getEventMetric(eventId: string, metricCode: string): Promise<EventMetric | null>;
  updateEventMetric(eventId: string, metricCode: string, data: Partial<InsertEventMetric>): Promise<EventMetric>;
  deleteEventMetric(eventId: string, metricCode: string): Promise<void>;
  listEventMetrics(eventId: string): Promise<EventMetric[]>;
  getMaxDisplayOrder(eventId: string): Promise<number>;
  getSiteMetricByCode(code: string): Promise<SiteMetric | null>;
}

export class EventMetricsService {
  private storage: IMetricsStorage;

  constructor(storage: IStorage) {
    this.storage = storage as IMetricsStorage;
  }

  /**
   * Add a metric to an event
   */
  async addMetricToEvent(
    eventId: string,
    metricCode: string,
    userId: string,
    options?: AddMetricOptions
  ): Promise<EventMetric> {
    // Get the event to validate
    const event = await this.storage.getEvent(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    // Check if event is frozen
    if (event.isFrozen) {
      throw new Error('Event is frozen and cannot be modified');
    }

    // Validate the metric exists
    const siteMetric = await this.storage.getSiteMetricByCode(metricCode);
    if (!siteMetric) {
      throw new Error(`Metric '${metricCode}' not found`);
    }

    // Check if metric is already on the event
    const existing = await this.storage.getEventMetric(eventId, metricCode);
    if (existing) {
      throw new Error(`Metric '${metricCode}' is already added to this event`);
    }

    // Determine display order
    let displayOrder = options?.displayOrder;
    if (displayOrder === undefined) {
      const maxOrder = await this.storage.getMaxDisplayOrder(eventId);
      displayOrder = maxOrder + 1;
    }

    // Create the event metric
    const eventMetric = await this.storage.createEventMetric({
      eventId,
      metricCode,
      displayOrder,
      isRequired: options?.isRequired ?? false,
      customLabel: options?.customLabel ?? null,
    });

    // Create audit log
    await this.storage.createAuditLog({
      userId,
      action: 'event_metric_added',
      resourceType: 'event',
      resourceId: eventId,
      details: JSON.stringify({
        eventName: event.name,
        metricCode,
        metricLabel: siteMetric.label,
        displayOrder,
        isRequired: options?.isRequired ?? false,
      }),
    });

    return eventMetric;
  }

  /**
   * Remove a metric from an event
   */
  async removeMetricFromEvent(
    eventId: string,
    metricCode: string,
    userId: string
  ): Promise<void> {
    // Get the event to validate
    const event = await this.storage.getEvent(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    // Check if event is frozen
    if (event.isFrozen) {
      throw new Error('Event is frozen and cannot be modified');
    }

    // Check if metric exists on the event
    const existing = await this.storage.getEventMetric(eventId, metricCode);
    if (!existing) {
      throw new Error(`Metric '${metricCode}' is not configured for this event`);
    }

    // Delete the event metric
    await this.storage.deleteEventMetric(eventId, metricCode);

    // Create audit log
    await this.storage.createAuditLog({
      userId,
      action: 'event_metric_removed',
      resourceType: 'event',
      resourceId: eventId,
      details: JSON.stringify({
        eventName: event.name,
        metricCode,
      }),
    });
  }

  /**
   * List all metrics configured for an event
   */
  async listEventMetrics(
    eventId: string,
    options?: ListMetricsOptions
  ): Promise<EventMetricWithDetails[]> {
    const metrics = await this.storage.listEventMetrics(eventId);

    if (options?.includeMetricDetails) {
      const metricsWithDetails: EventMetricWithDetails[] = [];
      for (const metric of metrics) {
        const details = await this.storage.getSiteMetricByCode(metric.metricCode);
        metricsWithDetails.push({
          ...metric,
          metricDetails: details,
        });
      }
      return metricsWithDetails;
    }

    return metrics;
  }

  /**
   * Update an event metric configuration
   */
  async updateEventMetric(
    eventId: string,
    metricCode: string,
    userId: string,
    updates: UpdateMetricOptions
  ): Promise<EventMetric> {
    // Get the event to validate
    const event = await this.storage.getEvent(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    // Check if event is frozen
    if (event.isFrozen) {
      throw new Error('Event is frozen and cannot be modified');
    }

    // Check if metric exists on the event
    const existing = await this.storage.getEventMetric(eventId, metricCode);
    if (!existing) {
      throw new Error(`Metric '${metricCode}' is not configured for this event`);
    }

    // Build update data
    const updateData: Partial<InsertEventMetric> = {};
    if (updates.displayOrder !== undefined) {
      updateData.displayOrder = updates.displayOrder;
    }
    if (updates.isRequired !== undefined) {
      updateData.isRequired = updates.isRequired;
    }
    if (updates.customLabel !== undefined) {
      updateData.customLabel = updates.customLabel;
    }

    const updated = await this.storage.updateEventMetric(eventId, metricCode, updateData);

    // Create audit log
    await this.storage.createAuditLog({
      userId,
      action: 'event_metric_updated',
      resourceType: 'event',
      resourceId: eventId,
      details: JSON.stringify({
        eventName: event.name,
        metricCode,
        updates,
      }),
    });

    return updated;
  }

  /**
   * Reorder all metrics for an event
   */
  async reorderEventMetrics(
    eventId: string,
    userId: string,
    orderedMetricCodes: string[]
  ): Promise<void> {
    // Get the event to validate
    const event = await this.storage.getEvent(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    // Check if event is frozen
    if (event.isFrozen) {
      throw new Error('Event is frozen and cannot be modified');
    }

    // Update each metric's display order
    for (let i = 0; i < orderedMetricCodes.length; i++) {
      const metricCode = orderedMetricCodes[i];
      await this.storage.updateEventMetric(eventId, metricCode, {
        displayOrder: i + 1,
      });
    }

    // Create audit log
    await this.storage.createAuditLog({
      userId,
      action: 'event_metrics_reordered',
      resourceType: 'event',
      resourceId: eventId,
      details: JSON.stringify({
        eventName: event.name,
        newOrder: orderedMetricCodes,
      }),
    });
  }

  /**
   * Add multiple metrics to an event at once
   */
  async bulkAddMetrics(
    eventId: string,
    userId: string,
    metricsToAdd: BulkAddMetricItem[],
    options?: BulkAddOptions
  ): Promise<EventMetric[]> {
    // Get the event to validate
    const event = await this.storage.getEvent(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    // Check if event is frozen
    if (event.isFrozen) {
      throw new Error('Event is frozen and cannot be modified');
    }

    const addedMetrics: EventMetric[] = [];

    for (const item of metricsToAdd) {
      // Check if already exists
      const existing = await this.storage.getEventMetric(eventId, item.metricCode);
      if (existing) {
        if (options?.skipExisting) {
          continue; // Skip this one
        }
        throw new Error(`Metric '${item.metricCode}' is already added to this event`);
      }

      // Validate the metric exists
      const siteMetric = await this.storage.getSiteMetricByCode(item.metricCode);
      if (!siteMetric) {
        throw new Error(`Metric '${item.metricCode}' not found`);
      }

      // Determine display order if not provided
      let displayOrder = item.displayOrder;
      if (displayOrder === undefined) {
        const maxOrder = await this.storage.getMaxDisplayOrder(eventId);
        displayOrder = maxOrder + 1;
      }

      // Create the event metric
      const eventMetric = await this.storage.createEventMetric({
        eventId,
        metricCode: item.metricCode,
        displayOrder,
        isRequired: item.isRequired ?? false,
        customLabel: item.customLabel ?? null,
      });

      addedMetrics.push(eventMetric);
    }

    // Create audit log for bulk add
    if (addedMetrics.length > 0) {
      await this.storage.createAuditLog({
        userId,
        action: 'event_metrics_bulk_added',
        resourceType: 'event',
        resourceId: eventId,
        details: JSON.stringify({
          eventName: event.name,
          metricsAdded: addedMetrics.map(m => m.metricCode),
          count: addedMetrics.length,
        }),
      });
    }

    return addedMetrics;
  }
}
