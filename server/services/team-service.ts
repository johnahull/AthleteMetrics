/**
 * Team management service
 */

import { BaseService } from "./base-service";
import { insertTeamSchema, archiveTeamSchema, updateTeamMembershipSchema } from "@shared/schema";
import type { Team, InsertTeam } from "@shared/schema";
import { AuthorizationError, NotFoundError, ValidationError } from "../utils/errors";

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
      this.logger.info('Getting teams', {
        userId: requestingUserId,
        filters,
      });

      // Site admins can see all teams
      if (await this.isSiteAdmin(requestingUserId)) {
        return await this.executeQuery(
          'getTeams',
          () => this.storage.getTeams(filters.organizationId),
          { userId: requestingUserId, filters }
        );
      }

      // Filter teams by user's accessible organizations
      const userOrgs = await this.getUserOrganizations(requestingUserId);
      const accessibleOrgIds = userOrgs.map(org => org.organizationId);

      // For now, use the first accessible organization ID
      return await this.executeQuery(
        'getTeams',
        () => this.storage.getTeams(accessibleOrgIds[0]),
        { userId: requestingUserId, organizationId: accessibleOrgIds[0] }
      );
    } catch (error) {
      this.handleError(error, 'getTeams');
    }
  }

  /**
   * Create a new team
   */
  async createTeam(teamData: InsertTeam, requestingUserId: string): Promise<Team> {
    try {
      // Validate input
      const validatedData = insertTeamSchema.parse(teamData);

      this.logger.info('Creating team', {
        userId: requestingUserId,
        teamName: validatedData.name,
        organizationId: validatedData.organizationId,
      });

      // Validate organization access if organizationId provided
      if (validatedData.organizationId) {
        // Site admins bypass organization access checks
        if (!(await this.isSiteAdmin(requestingUserId))) {
          await this.requireOrganizationAccess(requestingUserId, validatedData.organizationId);
        }
      }

      const team = await this.executeQuery(
        'createTeam',
        () => this.storage.createTeam(validatedData),
        { userId: requestingUserId, organizationId: validatedData.organizationId }
      );

      this.logger.audit('Team created', {
        userId: requestingUserId,
        teamId: team.id,
        teamName: team.name,
        organizationId: team.organizationId,
      });

      return team;
    } catch (error) {
      this.handleError(error, 'createTeam');
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
      // Get existing team
      const existingTeam = await this.getOneOrFail(
        () => this.storage.getTeam(teamId),
        'Team'
      );

      this.logger.info('Updating team', {
        userId: requestingUserId,
        teamId,
        teamName: existingTeam.name,
      });

      // Validate access to current organization
      if (existingTeam.organizationId) {
        if (!(await this.isSiteAdmin(requestingUserId))) {
          await this.requireOrganizationAccess(requestingUserId, existingTeam.organizationId);
        }
      }

      // Validate access to new organization if changing
      if (teamData.organizationId && teamData.organizationId !== existingTeam.organizationId) {
        if (!(await this.isSiteAdmin(requestingUserId))) {
          await this.requireOrganizationAccess(requestingUserId, teamData.organizationId);
        }
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
      this.handleError(error, 'updateTeam');
    }
  }

  /**
   * Delete team with access validation
   */
  async deleteTeam(teamId: string, requestingUserId: string): Promise<void> {
    try {
      // Get existing team
      const existingTeam = await this.getOneOrFail(
        () => this.storage.getTeam(teamId),
        'Team'
      );

      this.logger.info('Deleting team', {
        userId: requestingUserId,
        teamId,
        teamName: existingTeam.name,
      });

      // Validate access
      if (existingTeam.organizationId) {
        if (!(await this.isSiteAdmin(requestingUserId))) {
          await this.requireOrganizationAccess(requestingUserId, existingTeam.organizationId);
        }
      }

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
      this.handleError(error, 'deleteTeam');
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
      // Validate archive data
      const validatedData = archiveTeamSchema.parse(archiveData);

      // Get existing team and validate access
      const existingTeam = await this.getOneOrFail(
        () => this.storage.getTeam(teamId),
        'Team'
      );

      this.logger.info('Archiving team', {
        userId: requestingUserId,
        teamId,
        teamName: existingTeam.name,
        season: validatedData.season,
      });

      if (existingTeam.organizationId) {
        if (!(await this.isSiteAdmin(requestingUserId))) {
          await this.requireOrganizationAccess(requestingUserId, existingTeam.organizationId);
        }
      }

      await this.executeQuery(
        'archiveTeam',
        () => this.storage.archiveTeam(teamId, validatedData.archiveDate || new Date(), validatedData.season),
        { userId: requestingUserId, teamId }
      );

      this.logger.audit('Team archived', {
        userId: requestingUserId,
        teamId,
        teamName: existingTeam.name,
        season: validatedData.season,
      });
    } catch (error) {
      this.handleError(error, 'archiveTeam');
    }
  }

  /**
   * Unarchive team
   */
  async unarchiveTeam(teamId: string, requestingUserId: string): Promise<void> {
    try {
      // Get existing team and validate access
      const existingTeam = await this.getOneOrFail(
        () => this.storage.getTeam(teamId),
        'Team'
      );

      this.logger.info('Unarchiving team', {
        userId: requestingUserId,
        teamId,
        teamName: existingTeam.name,
      });

      if (existingTeam.organizationId) {
        if (!(await this.isSiteAdmin(requestingUserId))) {
          await this.requireOrganizationAccess(requestingUserId, existingTeam.organizationId);
        }
      }

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
      this.handleError(error, 'unarchiveTeam');
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
      // Validate membership data
      const validatedData = updateTeamMembershipSchema.parse(membershipData);

      // Get existing team and validate access
      const existingTeam = await this.getOneOrFail(
        () => this.storage.getTeam(teamId),
        'Team'
      );

      this.logger.info('Updating team membership', {
        userId: requestingUserId,
        teamId,
        targetUserId: userId,
        teamName: existingTeam.name,
      });

      if (existingTeam.organizationId) {
        if (!(await this.isSiteAdmin(requestingUserId))) {
          await this.requireOrganizationAccess(requestingUserId, existingTeam.organizationId);
        }
      }

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
      this.handleError(error, 'updateTeamMembership');
    }
  }
}