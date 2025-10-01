/**
 * Team management service
 */

import { BaseService } from "./base-service";
import { insertTeamSchema, archiveTeamSchema, updateTeamMembershipSchema } from "@shared/schema";
import type { Team, InsertTeam } from "@shared/schema";
import { AuthorizationError } from "../utils/errors";

export interface TeamFilters {
  organizationId?: string;
  isActive?: string;
  season?: string;
  search?: string;
}

export class TeamService extends BaseService {
  /**
   * Get teams with filtering and organization access validation
   */
  async getTeams(filters: TeamFilters, requestingUserId: string): Promise<Team[]> {
    try {
      this.logger.debug('Getting teams', { userId: requestingUserId, filters });

      // Site admins can see all teams
      if (await this.isSiteAdmin(requestingUserId)) {
        const teams = await this.executeQuery(
          'getTeams',
          () => this.storage.getTeams(filters.organizationId),
          { userId: requestingUserId, filters }
        );
        return teams;
      }

      // Get user's accessible organizations
      const userOrgs = await this.getUserOrganizations(requestingUserId);

      if (userOrgs.length === 0) {
        this.logger.security('User with no organizations attempted to access teams', {
          userId: requestingUserId,
        });
        return [];
      }

      // Use the first accessible organization ID
      const teams = await this.executeQuery(
        'getTeams',
        () => this.storage.getTeams(userOrgs[0].organizationId),
        { userId: requestingUserId, organizationId: userOrgs[0].organizationId }
      );

      return teams;
    } catch (error) {
      this.handleError(error, "getTeams", requestingUserId);
    }
  }

  /**
   * Create a new team
   */
  async createTeam(teamData: InsertTeam, requestingUserId: string): Promise<Team> {
    try {
      const validatedData = insertTeamSchema.parse(teamData);

      this.logger.info('Creating new team', {
        userId: requestingUserId,
        teamName: validatedData.name,
        organizationId: validatedData.organizationId,
      });

      // Validate organization access
      if (validatedData.organizationId) {
        await this.requireOrganizationAccess(requestingUserId, validatedData.organizationId);
      }

      const team = await this.executeQuery(
        'createTeam',
        () => this.storage.createTeam(validatedData),
        { userId: requestingUserId, teamName: validatedData.name }
      );

      this.logger.audit('Team created', {
        userId: requestingUserId,
        teamId: team.id,
        teamName: team.name,
        organizationId: team.organizationId,
      });

      return team;
    } catch (error) {
      this.handleError(error, "createTeam", requestingUserId);
    }
  }

  /**
   * Update team with access validation
   */
  async updateTeam(
    teamId: string,
    teamData: Partial<InsertTeam>,
    requestingUserId: string
  ): Promise<Team> {
    try {
      const existingTeam = await this.getOneOrFail(
        () => this.storage.getTeam(teamId),
        'Team',
        teamId
      );

      this.logger.info('Updating team', {
        userId: requestingUserId,
        teamId,
        teamName: existingTeam.name,
      });

      // Validate access to current organization
      await this.requireOrganizationAccess(requestingUserId, existingTeam.organizationId);

      // Validate new organization if changing
      if (teamData.organizationId && teamData.organizationId !== existingTeam.organizationId) {
        await this.requireOrganizationAccess(requestingUserId, teamData.organizationId);
      }

      const team = await this.executeQuery(
        'updateTeam',
        () => this.storage.updateTeam(teamId, teamData),
        { userId: requestingUserId, teamId }
      );

      this.logger.audit('Team updated', {
        userId: requestingUserId,
        teamId,
        teamName: team.name,
      });

      return team;
    } catch (error) {
      this.handleError(error, "updateTeam", requestingUserId);
    }
  }

  /**
   * Delete team with access validation
   */
  async deleteTeam(teamId: string, requestingUserId: string): Promise<void> {
    try {
      const existingTeam = await this.getOneOrFail(
        () => this.storage.getTeam(teamId),
        'Team',
        teamId
      );

      this.logger.warn('Deleting team', {
        userId: requestingUserId,
        teamId,
        teamName: existingTeam.name,
      });

      await this.requireOrganizationAccess(requestingUserId, existingTeam.organizationId);

      await this.executeQuery(
        'deleteTeam',
        () => this.storage.deleteTeam(teamId),
        { userId: requestingUserId, teamId }
      );

      this.logger.audit('Team deleted', {
        userId: requestingUserId,
        teamId,
        teamName: existingTeam.name,
      });
    } catch (error) {
      this.handleError(error, "deleteTeam", requestingUserId);
    }
  }

  /**
   * Archive team
   */
  async archiveTeam(
    teamId: string,
    archiveData: any,
    requestingUserId: string
  ): Promise<void> {
    try {
      const validatedData = archiveTeamSchema.parse(archiveData);

      const existingTeam = await this.getOneOrFail(
        () => this.storage.getTeam(teamId),
        'Team',
        teamId
      );

      this.logger.info('Archiving team', {
        userId: requestingUserId,
        teamId,
        teamName: existingTeam.name,
        season: validatedData.season,
      });

      await this.requireOrganizationAccess(requestingUserId, existingTeam.organizationId);

      await this.executeQuery(
        'archiveTeam',
        () => this.storage.archiveTeam(teamId, validatedData.archiveDate || new Date(), validatedData.season),
        { userId: requestingUserId, teamId, season: validatedData.season }
      );

      this.logger.audit('Team archived', {
        userId: requestingUserId,
        teamId,
        teamName: existingTeam.name,
        season: validatedData.season,
      });
    } catch (error) {
      this.handleError(error, "archiveTeam", requestingUserId);
    }
  }

  /**
   * Unarchive team
   */
  async unarchiveTeam(teamId: string, requestingUserId: string): Promise<void> {
    try {
      const existingTeam = await this.getOneOrFail(
        () => this.storage.getTeam(teamId),
        'Team',
        teamId
      );

      this.logger.info('Unarchiving team', {
        userId: requestingUserId,
        teamId,
        teamName: existingTeam.name,
      });

      await this.requireOrganizationAccess(requestingUserId, existingTeam.organizationId);

      await this.executeQuery(
        'unarchiveTeam',
        () => this.storage.unarchiveTeam(teamId),
        { userId: requestingUserId, teamId }
      );

      this.logger.audit('Team unarchived', {
        userId: requestingUserId,
        teamId,
        teamName: existingTeam.name,
      });
    } catch (error) {
      this.handleError(error, "unarchiveTeam", requestingUserId);
    }
  }

  /**
   * Update team membership
   */
  async updateTeamMembership(
    teamId: string,
    userId: string,
    membershipData: any,
    requestingUserId: string
  ): Promise<void> {
    try {
      const validatedData = updateTeamMembershipSchema.parse(membershipData);

      const existingTeam = await this.getOneOrFail(
        () => this.storage.getTeam(teamId),
        'Team',
        teamId
      );

      this.logger.info('Updating team membership', {
        userId: requestingUserId,
        teamId,
        targetUserId: userId,
      });

      await this.requireOrganizationAccess(requestingUserId, existingTeam.organizationId);

      await this.executeQuery(
        'updateTeamMembership',
        () => this.storage.updateTeamMembership(teamId, userId, validatedData),
        { userId: requestingUserId, teamId, targetUserId: userId }
      );

      this.logger.audit('Team membership updated', {
        userId: requestingUserId,
        teamId,
        targetUserId: userId,
        teamName: existingTeam.name,
      });
    } catch (error) {
      this.handleError(error, "updateTeamMembership", requestingUserId);
    }
  }
}