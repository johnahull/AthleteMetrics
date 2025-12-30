/**
 * EventRegistrationService - Handles event registration workflows
 * Supports self-registration, approval workflows, waitlists, and check-in
 *
 * TDD Phase 1.4: GREEN - Implementation to make tests pass
 */

import {
  type EventRegistration,
  type InsertEventRegistration,
  type RegistrationStatus,
} from '@shared/schema';
import type { IStorage } from '../storage';

export interface RegisterOptions {
  discoveryMethod?: 'event_code' | 'direct_link' | 'invitation' | 'org_roster' | null;
  athleteNotes?: string | null;
}

export interface RegistrationFilters {
  status?: RegistrationStatus;
  limit?: number;
  offset?: number;
}

/**
 * Extended storage interface for registration operations
 */
export interface IRegistrationStorage extends IStorage {
  createEventRegistration(data: InsertEventRegistration): Promise<EventRegistration>;
  getEventRegistration(eventId: string, userId: string): Promise<EventRegistration | null>;
  getEventRegistrationById(id: string): Promise<EventRegistration | null>;
  updateEventRegistration(id: string, data: Partial<InsertEventRegistration>): Promise<EventRegistration>;
  deleteEventRegistration(id: string): Promise<void>;
  listEventRegistrations(eventId: string, filters?: RegistrationFilters): Promise<EventRegistration[]>;
  countEventRegistrations(eventId: string, excludeStatuses?: RegistrationStatus[]): Promise<number>;
  getNextRegistrationNumber(eventId: string): Promise<number>;
  getNextWaitlistPosition(eventId: string): Promise<number>;
  getFirstWaitlistedRegistration(eventId: string): Promise<EventRegistration | null>;
}

export class EventRegistrationService {
  private storage: IRegistrationStorage;

  constructor(storage: IStorage) {
    this.storage = storage as IRegistrationStorage;
  }

  /**
   * Register a user for an event
   * Handles different registration modes (open, request_approval, invitation_only)
   * and capacity/waitlist management
   */
  async registerForEvent(
    eventId: string,
    userId: string,
    options: RegisterOptions = {}
  ): Promise<EventRegistration> {
    // Get the event to check registration rules
    const event = await this.storage.getEvent(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    // Check if event is frozen
    if (event.isFrozen) {
      throw new Error('Event is frozen and not accepting registrations');
    }

    // Check registration mode - invitation_only requires explicit invitation
    if (event.registrationMode === 'invitation_only' && options.discoveryMethod !== 'invitation') {
      throw new Error('This event is invite-only. Self-registration is not allowed.');
    }

    // Check for duplicate registration
    const existingReg = await this.storage.getEventRegistration(eventId, userId);
    if (existingReg) {
      throw new Error('You are already registered for this event');
    }

    // Get user info for snapshot
    const user = await this.storage.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get user's organization for snapshot (if any)
    const userOrgs = await this.storage.getUserOrganizations(userId);
    const primaryOrg = userOrgs.length > 0 ? userOrgs[0] : null;

    // Determine initial status based on registration mode
    let status: RegistrationStatus = 'approved';
    let waitlistPosition: number | null = null;

    if (event.registrationMode === 'request_approval') {
      status = 'pending';
    } else if (event.registrationMode === 'open') {
      // Check capacity for open events
      if (event.maxRegistrations !== null) {
        const currentCount = await this.storage.countEventRegistrations(
          eventId,
          ['cancelled', 'declined']
        );

        if (currentCount >= event.maxRegistrations) {
          // Add to waitlist
          status = 'waitlisted';
          waitlistPosition = await this.storage.getNextWaitlistPosition(eventId);
        }
      }
    }

    // Get next registration number
    const registrationNumber = await this.storage.getNextRegistrationNumber(eventId);

    // Create the registration
    const registrationData: InsertEventRegistration = {
      eventId,
      userId,
      userFullNameSnapshot: user.fullName || `${user.firstName} ${user.lastName}`,
      organizationIdSnapshot: primaryOrg?.organization?.id || null,
      organizationNameSnapshot: primaryOrg?.organization?.name || null,
      status,
      registrationNumber,
      discoveryMethod: options.discoveryMethod || null,
      waitlistPosition,
      athleteNotes: options.athleteNotes || null,
    };

    const registration = await this.storage.createEventRegistration(registrationData);

    // Create audit log
    await this.storage.createAuditLog({
      userId,
      action: 'event_registration_created',
      resourceType: 'event',
      resourceId: eventId,
      details: JSON.stringify({
        eventName: event.name,
        registrationId: registration.id,
        status: registration.status,
        discoveryMethod: options.discoveryMethod,
      }),
    });

    return registration;
  }

  /**
   * Get a user's own registration for an event
   */
  async getMyRegistration(eventId: string, userId: string): Promise<EventRegistration | null> {
    return this.storage.getEventRegistration(eventId, userId);
  }

  /**
   * Cancel a registration
   * Promotes first waitlisted person if capacity opens up
   */
  async cancelRegistration(
    eventId: string,
    userId: string,
    cancelledBy: string
  ): Promise<EventRegistration> {
    const event = await this.storage.getEvent(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    if (event.isFrozen) {
      throw new Error('Event is frozen and registrations cannot be modified');
    }

    const registration = await this.storage.getEventRegistration(eventId, userId);
    if (!registration) {
      throw new Error('Registration not found');
    }

    // Check authorization - user can cancel their own, admins can cancel any
    if (registration.userId !== cancelledBy) {
      if (!event.organizationId) {
        throw new Error('Not authorized to cancel this registration');
      }
      const roles = await this.storage.getUserRoles(cancelledBy, event.organizationId);
      const isAdmin = roles.includes('org_admin') || roles.includes('coach');
      if (!isAdmin) {
        throw new Error('Not authorized to cancel this registration');
      }
    }

    const wasApproved = registration.status === 'approved';

    // Update registration to cancelled
    const cancelledReg = await this.storage.updateEventRegistration(registration.id, {
      status: 'cancelled',
    });

    // Create audit log
    await this.storage.createAuditLog({
      userId: cancelledBy,
      action: 'event_registration_cancelled',
      resourceType: 'event',
      resourceId: eventId,
      details: JSON.stringify({
        eventName: event.name,
        registrationId: registration.id,
        cancelledUserId: userId,
        previousStatus: registration.status,
      }),
    });

    // Promote from waitlist if a spot opened up
    if (wasApproved && event.maxRegistrations !== null) {
      await this.promoteFromWaitlist(eventId, event.name);
    }

    return cancelledReg;
  }

  /**
   * List all registrations for an event (admin view)
   */
  async listRegistrations(
    eventId: string,
    requestingUserId: string,
    filters?: RegistrationFilters
  ): Promise<EventRegistration[]> {
    // We could add permission checks here
    return this.storage.listEventRegistrations(eventId, filters);
  }

  /**
   * Approve a pending registration
   */
  async approveRegistration(
    eventId: string,
    userId: string,
    approvedBy: string
  ): Promise<EventRegistration> {
    const event = await this.storage.getEvent(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    const registration = await this.storage.getEventRegistration(eventId, userId);
    if (!registration) {
      throw new Error('Registration not found');
    }

    if (registration.status !== 'pending') {
      throw new Error('Registration is not pending - already approved or declined');
    }

    const approved = await this.storage.updateEventRegistration(registration.id, {
      status: 'approved',
      approvedAt: new Date(),
      approvedBy,
    });

    // Create audit log
    await this.storage.createAuditLog({
      userId: approvedBy,
      action: 'event_registration_approved',
      resourceType: 'event',
      resourceId: eventId,
      details: JSON.stringify({
        eventName: event.name,
        registrationId: registration.id,
        approvedUserId: userId,
      }),
    });

    return approved;
  }

  /**
   * Decline a pending registration
   */
  async declineRegistration(
    eventId: string,
    userId: string,
    declinedBy: string,
    reason?: string
  ): Promise<EventRegistration> {
    const event = await this.storage.getEvent(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    const registration = await this.storage.getEventRegistration(eventId, userId);
    if (!registration) {
      throw new Error('Registration not found');
    }

    if (registration.status !== 'pending') {
      throw new Error('Registration is not pending');
    }

    const declined = await this.storage.updateEventRegistration(registration.id, {
      status: 'declined',
      declinedAt: new Date(),
      declinedBy,
      declineReason: reason || null,
    });

    // Create audit log
    await this.storage.createAuditLog({
      userId: declinedBy,
      action: 'event_registration_declined',
      resourceType: 'event',
      resourceId: eventId,
      details: JSON.stringify({
        eventName: event.name,
        registrationId: registration.id,
        declinedUserId: userId,
        reason,
      }),
    });

    return declined;
  }

  /**
   * Check in an approved registration at the event
   */
  async checkIn(
    eventId: string,
    userId: string,
    checkedInBy: string
  ): Promise<EventRegistration> {
    const event = await this.storage.getEvent(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    const registration = await this.storage.getEventRegistration(eventId, userId);
    if (!registration) {
      throw new Error('Registration not found');
    }

    // Check for already checked in first (before status check)
    if (registration.status === 'checked_in' || registration.checkedInAt) {
      throw new Error('Athlete is already checked in');
    }

    if (registration.status !== 'approved') {
      throw new Error('Registration must be approved before check-in');
    }

    const checkedIn = await this.storage.updateEventRegistration(registration.id, {
      status: 'checked_in',
      checkedInAt: new Date(),
      checkedInBy,
    });

    // Create audit log
    await this.storage.createAuditLog({
      userId: checkedInBy,
      action: 'event_registration_checked_in',
      resourceType: 'event',
      resourceId: eventId,
      details: JSON.stringify({
        eventName: event.name,
        registrationId: registration.id,
        checkedInUserId: userId,
      }),
    });

    return checkedIn;
  }

  /**
   * Promote the first person from the waitlist when a spot opens
   */
  private async promoteFromWaitlist(eventId: string, eventName: string): Promise<void> {
    const firstWaitlisted = await this.storage.getFirstWaitlistedRegistration(eventId);

    if (firstWaitlisted) {
      await this.storage.updateEventRegistration(firstWaitlisted.id, {
        status: 'approved',
        waitlistPosition: null,
        approvedAt: new Date(),
      });

      // Create audit log
      await this.storage.createAuditLog({
        userId: firstWaitlisted.userId,
        action: 'event_registration_promoted',
        resourceType: 'event',
        resourceId: eventId,
        details: JSON.stringify({
          eventName,
          registrationId: firstWaitlisted.id,
          promotedFromWaitlistPosition: firstWaitlisted.waitlistPosition,
        }),
      });
    }
  }
}
