/**
 * EventInvitationService - Handles token-based event invitations
 * Supports inviting existing users or by email for invite-only events
 *
 * TDD Phase 3.2: GREEN - Implementation to make tests pass
 */

import {
  type EventInvitation,
  type InsertEventInvitation,
  type EventInvitationStatus,
  type EventRegistration,
  type InsertEventRegistration,
} from '@shared/schema';
import crypto from 'crypto';
import type { IStorage } from '../storage';
import { emailService } from './email-service';

export interface CreateInvitationOptions {
  userId?: string;
  email?: string;
  expiresAt?: Date;
}

export interface InvitationFilters {
  status?: EventInvitationStatus;
  limit?: number;
  offset?: number;
}

export interface AcceptInvitationResult {
  invitation: EventInvitation;
  registration: EventRegistration;
}

/**
 * Extended storage interface for invitation operations
 */
export interface IInvitationStorage extends IStorage {
  createEventInvitation(data: InsertEventInvitation): Promise<EventInvitation>;
  getEventInvitation(id: string): Promise<EventInvitation | null>;
  getEventInvitationByToken(token: string): Promise<EventInvitation | null>;
  getEventInvitationByUserAndEvent(eventId: string, userId: string): Promise<EventInvitation | null>;
  getEventInvitationByEmailAndEvent(eventId: string, email: string): Promise<EventInvitation | null>;
  updateEventInvitation(id: string, data: Partial<InsertEventInvitation>): Promise<EventInvitation>;
  listEventInvitations(eventId: string, filters?: InvitationFilters): Promise<EventInvitation[]>;
  // Registration methods (already exist from Phase 1.4)
  createEventRegistration(data: InsertEventRegistration): Promise<EventRegistration>;
  getEventRegistration(eventId: string, userId: string): Promise<EventRegistration | null>;
  getNextRegistrationNumber(eventId: string): Promise<number>;
}

const DEFAULT_EXPIRY_DAYS = 7;

export class EventInvitationService {
  private storage: IInvitationStorage;

  constructor(storage: IStorage) {
    this.storage = storage as IInvitationStorage;
  }

  /**
   * Generate a secure random token for invitation links
   */
  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create an invitation for an event
   */
  async createInvitation(
    eventId: string,
    invitedBy: string,
    options: CreateInvitationOptions
  ): Promise<EventInvitation> {
    // Validate that either userId or email is provided
    if (!options.userId && !options.email) {
      throw new Error('Either userId or email must be provided');
    }

    // Get the event to validate
    const event = await this.storage.getEvent(eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    // Check if event is frozen
    if (event.isFrozen) {
      throw new Error('Event is frozen and not accepting invitations');
    }

    // Check for duplicate invitation
    if (options.userId) {
      const existingByUser = await this.storage.getEventInvitationByUserAndEvent(eventId, options.userId);
      if (existingByUser && existingByUser.status === 'pending') {
        throw new Error('User has already been invited to this event');
      }
    }
    if (options.email) {
      const existingByEmail = await this.storage.getEventInvitationByEmailAndEvent(eventId, options.email);
      if (existingByEmail && existingByEmail.status === 'pending') {
        throw new Error('This email has already been invited to this event');
      }
    }

    // Set expiration date (default 7 days)
    const expiresAt = options.expiresAt || new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    // Generate secure token
    const token = this.generateToken();

    // Create the invitation
    const invitationData: InsertEventInvitation = {
      eventId,
      userId: options.userId || null,
      email: options.email || null,
      token,
      status: 'pending',
      invitedBy,
      expiresAt,
      emailSent: false,
    };

    const invitation = await this.storage.createEventInvitation(invitationData);

    // Send invitation email
    let emailSent = false;
    let emailSentAt: Date | null = null;

    try {
      // Get inviter details
      const inviter = await this.storage.getUser(invitedBy);
      const inviterName = inviter ? inviter.fullName || `${inviter.firstName} ${inviter.lastName}` : 'Event Organizer';

      // Get organization details if event has an org
      let organizationName: string | undefined;
      if (event.organizationId) {
        const org = await this.storage.getOrganization(event.organizationId);
        organizationName = org?.name;
      }

      // Determine recipient email and name
      let recipientEmail: string;
      let recipientName: string | undefined;

      if (options.email) {
        // External user invited by email
        recipientEmail = options.email;
      } else if (options.userId) {
        // Org member invited by userId
        const user = await this.storage.getUser(options.userId);
        if (!user) {
          throw new Error('Invited user not found');
        }
        recipientEmail = user.emails[0];
        recipientName = user.fullName || `${user.firstName} ${user.lastName}`;
      } else {
        throw new Error('Either userId or email must be provided');
      }

      // Construct accept URL
      const acceptUrl = `${process.env.APP_URL || 'http://localhost:5000'}/events/invite/${token}`;

      // Send the email
      const sendResult = await emailService.sendEventInvitation({
        to: recipientEmail,
        recipientName,
        eventName: event.name,
        eventDate: event.startDate,
        eventLocation: event.location || undefined,
        inviterName,
        organizationName,
        acceptUrl,
        expiresAt,
      });

      if (sendResult) {
        emailSent = true;
        emailSentAt = new Date();
      }
    } catch (error) {
      // Log error but don't fail the invitation creation
      console.error(`Failed to send invitation email for invitation ${invitation.id}:`, error);
    }

    // Update invitation with email status if email was sent
    let finalInvitation = invitation;
    if (emailSent && emailSentAt) {
      finalInvitation = await this.storage.updateEventInvitation(invitation.id, {
        emailSent: true,
        emailSentAt,
      });
    }

    // Create audit log
    await this.storage.createAuditLog({
      userId: invitedBy,
      action: 'event_invitation_created',
      resourceType: 'event',
      resourceId: eventId,
      details: JSON.stringify({
        eventName: event.name,
        invitationId: invitation.id,
        invitedUserId: options.userId,
        invitedEmail: options.email,
        emailSent,
      }),
    });

    return finalInvitation;
  }

  /**
   * Get an invitation by its token
   */
  async getInvitationByToken(token: string): Promise<EventInvitation | null> {
    return this.storage.getEventInvitationByToken(token);
  }

  /**
   * Accept an invitation and create a registration
   */
  async acceptInvitation(token: string, userId: string): Promise<AcceptInvitationResult> {
    const invitation = await this.storage.getEventInvitationByToken(token);
    if (!invitation) {
      throw new Error('Invitation not found');
    }

    // Check invitation status
    if (invitation.status !== 'pending') {
      if (invitation.status === 'accepted') {
        throw new Error('Invitation has already been accepted');
      }
      if (invitation.status === 'cancelled') {
        throw new Error('Invitation has been cancelled');
      }
      if (invitation.status === 'declined') {
        throw new Error('Invitation has been declined');
      }
      throw new Error('Invitation is not pending');
    }

    // Check expiration
    if (new Date(invitation.expiresAt) < new Date()) {
      throw new Error('Invitation has expired');
    }

    // Get event and user info
    const event = await this.storage.getEvent(invitation.eventId);
    if (!event) {
      throw new Error('Event not found');
    }

    // Check if event is frozen
    if (event.isFrozen) {
      throw new Error('Event is frozen and not accepting registrations');
    }

    // Check for existing registration (prevent double-registration)
    const existingReg = await this.storage.getEventRegistration(invitation.eventId, userId);
    if (existingReg) {
      throw new Error('You are already registered for this event');
    }

    const user = await this.storage.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get user's organization for snapshot
    const userOrgs = await this.storage.getUserOrganizations(userId);
    const primaryOrg = userOrgs.length > 0 ? userOrgs[0] : null;

    // Get next registration number
    const registrationNumber = await this.storage.getNextRegistrationNumber(invitation.eventId);

    // Create registration (auto-approved for invitations)
    const registrationData: InsertEventRegistration = {
      eventId: invitation.eventId,
      userId,
      userFullNameSnapshot: user.fullName || `${user.firstName} ${user.lastName}`,
      organizationIdSnapshot: primaryOrg?.organization?.id || null,
      organizationNameSnapshot: primaryOrg?.organization?.name || null,
      status: 'approved',
      registrationNumber,
      discoveryMethod: 'invitation',
    };

    const registration = await this.storage.createEventRegistration(registrationData);

    // Update invitation to accepted
    const updatedInvitation = await this.storage.updateEventInvitation(invitation.id, {
      status: 'accepted',
      acceptedAt: new Date(),
    });

    // Create audit logs
    await this.storage.createAuditLog({
      userId,
      action: 'event_invitation_accepted',
      resourceType: 'event',
      resourceId: invitation.eventId,
      details: JSON.stringify({
        eventName: event.name,
        invitationId: invitation.id,
        registrationId: registration.id,
      }),
    });

    await this.storage.createAuditLog({
      userId,
      action: 'event_registration_created',
      resourceType: 'event',
      resourceId: invitation.eventId,
      details: JSON.stringify({
        eventName: event.name,
        registrationId: registration.id,
        discoveryMethod: 'invitation',
      }),
    });

    return {
      invitation: updatedInvitation,
      registration,
    };
  }

  /**
   * Decline an invitation
   */
  async declineInvitation(token: string): Promise<EventInvitation> {
    const invitation = await this.storage.getEventInvitationByToken(token);
    if (!invitation) {
      throw new Error('Invitation not found');
    }

    if (invitation.status !== 'pending') {
      throw new Error('Invitation is not pending');
    }

    const declined = await this.storage.updateEventInvitation(invitation.id, {
      status: 'declined',
      declinedAt: new Date(),
    });

    // Create audit log
    const event = await this.storage.getEvent(invitation.eventId);
    await this.storage.createAuditLog({
      userId: invitation.userId || 'system',
      action: 'event_invitation_declined',
      resourceType: 'event',
      resourceId: invitation.eventId,
      details: JSON.stringify({
        eventName: event?.name,
        invitationId: invitation.id,
      }),
    });

    return declined;
  }

  /**
   * Cancel an invitation (admin action)
   */
  async cancelInvitation(invitationId: string, cancelledBy: string): Promise<EventInvitation> {
    const invitation = await this.storage.getEventInvitation(invitationId);
    if (!invitation) {
      throw new Error('Invitation not found');
    }

    if (invitation.status !== 'pending') {
      throw new Error('Only pending invitations can be cancelled');
    }

    const cancelled = await this.storage.updateEventInvitation(invitationId, {
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelledBy,
    });

    // Create audit log
    const event = await this.storage.getEvent(invitation.eventId);
    await this.storage.createAuditLog({
      userId: cancelledBy,
      action: 'event_invitation_cancelled',
      resourceType: 'event',
      resourceId: invitation.eventId,
      details: JSON.stringify({
        eventName: event?.name,
        invitationId: invitation.id,
        cancelledUserId: invitation.userId,
        cancelledEmail: invitation.email,
      }),
    });

    return cancelled;
  }

  /**
   * List invitations for an event
   */
  async listInvitations(eventId: string, filters?: InvitationFilters): Promise<EventInvitation[]> {
    return this.storage.listEventInvitations(eventId, filters);
  }

  /**
   * Resend an invitation with a new token and extended expiration
   */
  async resendInvitation(invitationId: string, resentBy: string): Promise<EventInvitation> {
    const invitation = await this.storage.getEventInvitation(invitationId);
    if (!invitation) {
      throw new Error('Invitation not found');
    }

    if (invitation.status === 'accepted') {
      throw new Error('Cannot resend an already accepted invitation');
    }

    if (invitation.status === 'cancelled') {
      throw new Error('Cannot resend a cancelled invitation');
    }

    // Generate new token for security
    const newToken = this.generateToken();

    // Extend expiration by 7 days from now
    const newExpiresAt = new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const updated = await this.storage.updateEventInvitation(invitationId, {
      token: newToken,
      expiresAt: newExpiresAt,
      status: 'pending', // Reset to pending if it was declined
      emailSent: false, // Reset email sent flag
      declinedAt: null,
    });

    // Create audit log
    const event = await this.storage.getEvent(invitation.eventId);
    await this.storage.createAuditLog({
      userId: resentBy,
      action: 'event_invitation_created', // Reusing created action for resend
      resourceType: 'event',
      resourceId: invitation.eventId,
      details: JSON.stringify({
        eventName: event?.name,
        invitationId: invitation.id,
        action: 'resent',
        previousToken: invitation.token.substring(0, 8) + '...',
      }),
    });

    return updated;
  }
}
