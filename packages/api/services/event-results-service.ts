/**
 * EventResultsService - Handles event results visibility and publishing
 * Controls when and who can see event results
 *
 * TDD Phase 4.3: GREEN - Implementation to make tests pass
 */

import {
  type Event,
  type ResultsVisibility,
  type InsertAuditLog,
  type AuditLog,
} from '@shared/schema';
// IResultsStorage is a subset of IStorage methods needed for this service

export interface ResultsVisibilityStatus {
  visibility: ResultsVisibility;
  isPublished: boolean;
  publishedAt: Date | null;
  publishedBy: string | null;
  eventStatus: string;
}

/**
 * Extended storage interface for results operations
 * Uses Pick to only define the methods we need from IStorage,
 * plus our event-specific methods
 */
export interface IResultsStorage {
  getEvent(id: string): Promise<Event | null>;
  updateEvent(id: string, data: Partial<Event>): Promise<Event>;
  getUserOrganizations(userId: string): Promise<Array<{ organization: { id: string }, role: string }>>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
}

export class EventResultsService {
  private storage: IResultsStorage;

  constructor(storage: IResultsStorage) {
    this.storage = storage;
  }

  /**
   * Check if user is a coach or admin in the event's organization
   */
  private async isCoachOrAdmin(eventId: string, userId: string): Promise<boolean> {
    const event = await this.storage.getEvent(eventId);
    if (!event || !event.organizationId) {
      return false;
    }

    const userOrgs = await this.storage.getUserOrganizations(userId);
    const orgMembership = userOrgs.find(uo => uo.organization.id === event.organizationId);

    if (!orgMembership) {
      return false;
    }

    return ['org_admin', 'coach'].includes(orgMembership.role);
  }

  /**
   * Publish results for an event
   */
  async publishResults(eventId: string, userId: string): Promise<Event> {
    const event = await this.storage.getEvent(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    // Check if event is frozen
    if (event.isFrozen) {
      throw new Error('Event is frozen and cannot be modified');
    }

    // Check if already published
    if (event.resultsPublishedAt) {
      throw new Error('Results are already published');
    }

    // Update the event with publish info
    const updated = await this.storage.updateEvent(eventId, {
      resultsPublishedAt: new Date(),
      resultsPublishedBy: userId,
    });

    // Create audit log
    await this.storage.createAuditLog({
      userId,
      action: 'event_results_published',
      resourceType: 'event',
      resourceId: eventId,
      details: JSON.stringify({
        eventName: event.name,
        visibility: event.resultsVisibility,
      }),
    });

    return updated;
  }

  /**
   * Unpublish results for an event
   */
  async unpublishResults(eventId: string, userId: string): Promise<Event> {
    const event = await this.storage.getEvent(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    // Check if event is frozen
    if (event.isFrozen) {
      throw new Error('Event is frozen and cannot be modified');
    }

    // Check if published
    if (!event.resultsPublishedAt) {
      throw new Error('Results are not published');
    }

    // Update the event to unpublish
    const updated = await this.storage.updateEvent(eventId, {
      resultsPublishedAt: null,
      resultsPublishedBy: null,
    });

    // Create audit log
    await this.storage.createAuditLog({
      userId,
      action: 'event_results_unpublished',
      resourceType: 'event',
      resourceId: eventId,
      details: JSON.stringify({
        eventName: event.name,
        previouslyPublishedBy: event.resultsPublishedBy,
      }),
    });

    return updated;
  }

  /**
   * Check if results are visible to a specific user
   *
   * Visibility rules:
   * - 'immediate': Always visible to everyone
   * - 'after_event': Visible when event status is 'completed', or to coaches/admins always
   * - 'manual': Visible only after explicit publish, or to coaches/admins always
   */
  async areResultsVisible(eventId: string, userId: string): Promise<boolean> {
    const event = await this.storage.getEvent(eventId);
    if (!event) {
      return false;
    }

    // Coaches and admins always see results
    const isStaff = await this.isCoachOrAdmin(eventId, userId);
    if (isStaff) {
      return true;
    }

    switch (event.resultsVisibility) {
      case 'immediate':
        // Always visible
        return true;

      case 'after_event':
        // Visible when event is completed
        return event.status === 'completed';

      case 'manual':
        // Only visible when explicitly published
        return event.resultsPublishedAt !== null;

      default:
        return false;
    }
  }

  /**
   * Check if a user can view their own results
   * Athletes can always view their own results regardless of visibility settings
   */
  async canViewOwnResults(eventId: string, userId: string): Promise<boolean> {
    const event = await this.storage.getEvent(eventId);
    if (!event) {
      return false;
    }

    // Athletes can always see their own results
    return true;
  }

  /**
   * Get the visibility status for an event
   */
  async getResultsVisibilityStatus(eventId: string): Promise<ResultsVisibilityStatus> {
    const event = await this.storage.getEvent(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    return {
      visibility: event.resultsVisibility,
      isPublished: event.resultsPublishedAt !== null,
      publishedAt: event.resultsPublishedAt,
      publishedBy: event.resultsPublishedBy,
      eventStatus: event.status,
    };
  }

  /**
   * Update the results visibility mode for an event
   */
  async updateResultsVisibility(
    eventId: string,
    userId: string,
    visibility: ResultsVisibility
  ): Promise<Event> {
    const event = await this.storage.getEvent(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    // Check if event is frozen
    if (event.isFrozen) {
      throw new Error('Event is frozen and cannot be modified');
    }

    const previousVisibility = event.resultsVisibility;

    // Update the visibility
    const updated = await this.storage.updateEvent(eventId, {
      resultsVisibility: visibility,
    });

    // Create audit log
    await this.storage.createAuditLog({
      userId,
      action: 'event_results_visibility_changed',
      resourceType: 'event',
      resourceId: eventId,
      details: JSON.stringify({
        eventName: event.name,
        previousVisibility,
        newVisibility: visibility,
      }),
    });

    return updated;
  }
}
