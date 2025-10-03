/**
 * Invitation service handling athlete invitations
 */

import { BaseService } from "./base-service";
import type { Invitation, InsertInvitation } from "@shared/schema";
import { ValidationError, NotFoundError } from "../utils/errors";

export class InvitationService extends BaseService {
  /**
   * Create an invitation
   */
  async createInvitation(
    data: Omit<InsertInvitation, 'token' | 'createdAt'>,
    userId: string
  ): Promise<Invitation> {
    try {
      this.logger.info('Creating invitation', {
        userId,
        organizationId: data.organizationId,
        email: data.email
      });

      // Check access to organization
      await this.requireOrganizationAccess(userId, data.organizationId);

      const invitation = await this.executeQuery(
        'createInvitation',
        () => this.storage.createInvitation({
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          organizationId: data.organizationId,
          teamIds: data.teamIds,
          role: data.role,
          invitedBy: userId,
          playerId: data.playerId || undefined,
          expiresAt: data.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days default
        }),
        { userId, data }
      );

      this.logger.info('Invitation created', {
        userId,
        invitationId: invitation.id,
        email: data.email
      });

      return invitation;
    } catch (error) {
      this.handleError(error, 'createInvitation');
    }
  }

  /**
   * Get athlete invitations for organization
   */
  async getOrganizationInvitations(
    organizationId: string,
    userId: string
  ): Promise<Invitation[]> {
    try {
      this.logger.info('Getting organization invitations', {
        userId,
        organizationId
      });

      if (!organizationId) {
        throw new ValidationError('Organization ID is required');
      }

      // Check access to organization
      await this.requireOrganizationAccess(userId, organizationId);

      const invitations = await this.executeQuery(
        'getOrganizationInvitations',
        () => this.storage.getOrganizationInvitations(organizationId),
        { userId, organizationId }
      );

      this.logger.info('Organization invitations retrieved', {
        userId,
        organizationId,
        count: invitations.length
      });

      return invitations;
    } catch (error) {
      this.handleError(error, 'getOrganizationInvitations');
    }
  }

  /**
   * Get invitation by token (public - no auth check)
   */
  async getInvitationByToken(token: string): Promise<Invitation | null> {
    try {
      this.logger.info('Getting invitation by token', { token });

      const invitation = await this.executeQuery(
        'getInvitationByToken',
        () => this.storage.getInvitation(token),
        { token }
      );

      if (!invitation) {
        this.logger.warn('Invitation not found', { token });
        return null;
      }

      return invitation;
    } catch (error) {
      this.handleError(error, 'getInvitationByToken');
    }
  }

  /**
   * Delete invitation
   */
  async deleteInvitation(
    invitationId: string,
    userId: string
  ): Promise<void> {
    try {
      this.logger.info('Deleting invitation', {
        userId,
        invitationId
      });

      // Get the invitation to check organization access
      const invitation = await this.storage.getInvitation(invitationId);

      if (!invitation) {
        throw new NotFoundError('Invitation not found');
      }

      // Check access to the invitation's organization
      await this.requireOrganizationAccess(userId, invitation.organizationId);

      await this.executeQuery(
        'deleteInvitation',
        () => this.storage.deleteInvitation(invitationId),
        { userId, invitationId }
      );

      this.logger.info('Invitation deleted', {
        userId,
        invitationId
      });
    } catch (error) {
      this.handleError(error, 'deleteInvitation');
    }
  }

  /**
   * Accept invitation
   */
  async acceptInvitation(
    token: string,
    password: string
  ): Promise<{ message: string }> {
    try {
      this.logger.info('Accepting invitation', { token });

      const invitation = await this.storage.getInvitation(token);

      if (!invitation) {
        throw new NotFoundError('Invitation not found or expired');
      }

      // Invitation acceptance logic would go here
      // For now, just acknowledge the acceptance

      this.logger.info('Invitation accepted', {
        token
      });

      return { message: "Invitation accepted successfully" };
    } catch (error) {
      this.handleError(error, 'acceptInvitation');
    }
  }
}
