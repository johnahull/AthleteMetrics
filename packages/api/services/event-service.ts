/**
 * EventService - Handles all event-related business logic
 * Supports combines, camps, testing days, and similar athletic events
 *
 * TDD Phase 1.2: GREEN - Implementation to make tests pass
 *
 * Uses storage layer for database operations to enable mocking in unit tests.
 */

import {
  type Event,
  type InsertEvent,
  type EventVisibility,
  type EventStatus,
} from '@shared/schema';
import crypto from 'crypto';
import type { IStorage } from '../storage';

export interface EventFilters {
  organizationId?: string;
  visibility?: EventVisibility;
  status?: EventStatus;
  startDateFrom?: Date;
  startDateTo?: Date;
  limit?: number;
  offset?: number;
}

export interface CreateEventData {
  name: string;
  description?: string | null;
  location?: string | null;
  eventType?: string | null;
  startDate: Date;
  endDate?: Date | null;
  timezone?: string;
  visibility?: EventVisibility;
  registrationMode?: 'open' | 'request_approval' | 'invitation_only';
  status?: EventStatus;
  registrationOpensAt?: Date | null;
  registrationClosesAt?: Date | null;
  maxRegistrations?: number | null;
  resultsVisibility?: 'immediate' | 'after_event' | 'manual';
  organizationId?: string | null;
}

export interface UpdateEventData {
  name?: string;
  description?: string | null;
  location?: string | null;
  eventType?: string | null;
  startDate?: Date;
  endDate?: Date | null;
  visibility?: EventVisibility;
  registrationMode?: 'open' | 'request_approval' | 'invitation_only';
  status?: EventStatus;
  registrationOpensAt?: Date | null;
  registrationClosesAt?: Date | null;
  maxRegistrations?: number | null;
  resultsVisibility?: 'immediate' | 'after_event' | 'manual';
}

/**
 * Extended storage interface for event operations
 * These methods need to be added to IStorage
 */
export interface IEventStorage extends IStorage {
  createEvent(data: InsertEvent): Promise<Event>;
  getEvent(id: string): Promise<Event | null>;
  updateEvent(id: string, data: Partial<Event>): Promise<Event>;
  deleteEvent(id: string): Promise<void>;
  listEvents(filters: EventFilters): Promise<Event[]>;
  getEventByCode(code: string): Promise<Event | null>;
}

export class EventService {
  private storage: IEventStorage;

  constructor(storage: IStorage) {
    this.storage = storage as IEventStorage;
  }

  /**
   * Generate an 8-character alphanumeric event code
   * Similar to organization join codes
   */
  generateEventCode(): string {
    const bytes = crypto.randomBytes(5);
    return bytes.toString('hex').toUpperCase().substring(0, 8);
  }

  /**
   * Create a new event
   */
  async createEvent(data: CreateEventData, createdBy: string): Promise<Event> {
    const eventCode = this.generateEventCode();

    // Note: isFrozen defaults to false in the database schema
    const eventData: InsertEvent = {
      name: data.name,
      description: data.description ?? undefined,
      location: data.location ?? undefined,
      eventType: data.eventType ?? undefined,
      startDate: data.startDate,
      endDate: data.endDate ?? undefined,
      timezone: data.timezone || 'America/New_York',
      visibility: data.visibility || 'org_private',
      registrationMode: data.registrationMode || 'open',
      status: data.status || 'draft',
      registrationOpensAt: data.registrationOpensAt ?? undefined,
      registrationClosesAt: data.registrationClosesAt ?? undefined,
      maxRegistrations: data.maxRegistrations ?? undefined,
      resultsVisibility: data.resultsVisibility || 'after_event',
      organizationId: data.organizationId ?? null,
      eventCode,
      createdBy,
    };

    const createdEvent = await this.storage.createEvent(eventData);

    // Create audit log
    await this.storage.createAuditLog({
      userId: createdBy,
      action: 'event_created',
      resourceType: 'event',
      resourceId: createdEvent.id,
      details: JSON.stringify({
        eventName: createdEvent.name,
        eventCode: createdEvent.eventCode,
        visibility: createdEvent.visibility,
        organizationId: createdEvent.organizationId,
      }),
    });

    return createdEvent;
  }

  /**
   * Get event by ID with access control
   */
  async getEvent(eventId: string, requestingUserId: string): Promise<Event | null> {
    const event = await this.storage.getEvent(eventId);

    if (!event) {
      return null;
    }

    // Public events are accessible to anyone
    if (event.visibility === 'public') {
      return event;
    }

    // For org-private events, check user's org membership
    if (event.organizationId) {
      const hasAccess = await this.checkUserOrgAccess(requestingUserId, event.organizationId);
      if (!hasAccess) {
        throw new Error('Access denied: You are not a member of this organization');
      }
    }

    return event;
  }

  /**
   * Get event by event code (for discovery)
   */
  async getEventByCode(eventCode: string): Promise<Event | null> {
    return this.storage.getEventByCode(eventCode);
  }

  /**
   * Update an event
   */
  async updateEvent(
    eventId: string,
    updates: UpdateEventData,
    updatedBy: string
  ): Promise<Event> {
    // Get current event
    const currentEvent = await this.storage.getEvent(eventId);

    if (!currentEvent) {
      throw new Error('Event not found');
    }

    // Check if frozen
    if (currentEvent.isFrozen) {
      throw new Error('Event is frozen and cannot be modified');
    }

    // Apply updates
    const updatedEvent = await this.storage.updateEvent(eventId, {
      ...updates,
      updatedAt: new Date(),
    });

    // Create audit log
    await this.storage.createAuditLog({
      userId: updatedBy,
      action: 'event_updated',
      resourceType: 'event',
      resourceId: eventId,
      details: JSON.stringify({
        eventName: updatedEvent.name,
        changes: Object.keys(updates),
      }),
    });

    return updatedEvent;
  }

  /**
   * List events with filters
   */
  async listEvents(
    filters: EventFilters,
    requestingUserId: string
  ): Promise<Event[]> {
    return this.storage.listEvents(filters);
  }

  /**
   * Freeze an event
   */
  async freezeEvent(
    eventId: string,
    frozenBy: string,
    reason: string
  ): Promise<Event> {
    const currentEvent = await this.storage.getEvent(eventId);

    if (!currentEvent) {
      throw new Error('Event not found');
    }

    if (currentEvent.isFrozen) {
      throw new Error('Event is already frozen');
    }

    const frozenAt = new Date();

    const frozenEvent = await this.storage.updateEvent(eventId, {
      isFrozen: true,
      frozenAt,
      frozenBy,
      frozenReason: reason,
      updatedAt: frozenAt,
    });

    // Create audit log
    await this.storage.createAuditLog({
      userId: frozenBy,
      action: 'event_frozen',
      resourceType: 'event',
      resourceId: eventId,
      details: JSON.stringify({
        eventName: frozenEvent.name,
        reason,
        frozenAt: frozenAt.toISOString(),
      }),
    });

    return frozenEvent;
  }

  /**
   * Unfreeze an event
   */
  async unfreezeEvent(eventId: string, unfrozenBy: string): Promise<Event> {
    const currentEvent = await this.storage.getEvent(eventId);

    if (!currentEvent) {
      throw new Error('Event not found');
    }

    if (!currentEvent.isFrozen) {
      throw new Error('Event is not frozen');
    }

    const unfrozenEvent = await this.storage.updateEvent(eventId, {
      isFrozen: false,
      frozenAt: null,
      frozenBy: null,
      frozenReason: null,
      updatedAt: new Date(),
    });

    // Create audit log
    await this.storage.createAuditLog({
      userId: unfrozenBy,
      action: 'event_unfrozen',
      resourceType: 'event',
      resourceId: eventId,
      details: JSON.stringify({
        eventName: unfrozenEvent.name,
        previousFreezeReason: currentEvent.frozenReason,
      }),
    });

    return unfrozenEvent;
  }

  /**
   * Delete an event (soft delete or hard delete)
   */
  async deleteEvent(eventId: string, deletedBy: string): Promise<void> {
    const currentEvent = await this.storage.getEvent(eventId);

    if (!currentEvent) {
      throw new Error('Event not found');
    }

    if (currentEvent.isFrozen) {
      throw new Error('Frozen event cannot be deleted');
    }

    // Delete the event
    await this.storage.deleteEvent(eventId);

    // Create audit log
    await this.storage.createAuditLog({
      userId: deletedBy,
      action: 'event_deleted',
      resourceType: 'event',
      resourceId: eventId,
      details: JSON.stringify({
        eventName: currentEvent.name,
        eventCode: currentEvent.eventCode,
      }),
    });
  }

  /**
   * Check if user has access to an organization
   */
  private async checkUserOrgAccess(userId: string, organizationId: string): Promise<boolean> {
    // Check if user is site admin
    const user = await this.storage.getUser(userId);
    if (user?.isSiteAdmin) {
      return true;
    }

    // Check user's organization membership via getUserRoles
    const roles = await this.storage.getUserRoles(userId, organizationId);
    return roles.length > 0;
  }
}
