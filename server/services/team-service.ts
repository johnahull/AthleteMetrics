/**
 * Team management service
 */

import { BaseService } from "./base-service";
import { insertTeamSchema, archiveTeamSchema, updateTeamMembershipSchema } from "@shared/schema";
import type { Team, InsertTeam } from "@shared/schema";

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
      // Get user's accessible organizations
      const userOrgs = await this.getUserOrganizations(requestingUserId);
      const requestingUser = await this.storage.getUserById(requestingUserId);
      
      // Site admins can see all teams
      if (requestingUser?.isSiteAdmin === "true") {
        return await this.storage.getTeams(filters);
      }

      // Filter teams by user's organizations
      const accessibleOrgIds = userOrgs.map(org => org.organizationId);
      const teams = await this.storage.getTeams({
        ...filters,
        organizationIds: accessibleOrgIds
      });

      return teams;
    } catch (error) {
      this.handleError(error, "TeamService.getTeams");
    }
  }

  /**
   * Create a new team
   */
  async createTeam(teamData: InsertTeam, requestingUserId: string): Promise<Team> {
    try {
      // Validate input
      const validatedData = insertTeamSchema.parse(teamData);

      // Validate organization access if organizationId provided
      if (validatedData.organizationId) {
        const hasAccess = await this.validateOrganizationAccess(
          requestingUserId, 
          validatedData.organizationId
        );
        
        if (!hasAccess) {
          const requestingUser = await this.storage.getUserById(requestingUserId);
          if (!requestingUser?.isSiteAdmin) {
            throw new Error("Unauthorized: Access denied to this organization");
          }
        }
      }

      return await this.storage.createTeam(validatedData);
    } catch (error) {
      this.handleError(error, "TeamService.createTeam");
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
      const existingTeam = await this.storage.getTeamById(teamId);
      if (!existingTeam) {
        throw new Error("Team not found");
      }

      // Validate access
      if (existingTeam.organizationId) {
        const hasAccess = await this.validateOrganizationAccess(
          requestingUserId, 
          existingTeam.organizationId
        );
        
        if (!hasAccess) {
          const requestingUser = await this.storage.getUserById(requestingUserId);
          if (!requestingUser?.isSiteAdmin) {
            throw new Error("Unauthorized: Access denied to this team");
          }
        }
      }

      // Validate new organization if changing
      if (teamData.organizationId && teamData.organizationId !== existingTeam.organizationId) {
        const hasNewOrgAccess = await this.validateOrganizationAccess(
          requestingUserId, 
          teamData.organizationId
        );
        
        if (!hasNewOrgAccess) {
          const requestingUser = await this.storage.getUserById(requestingUserId);
          if (!requestingUser?.isSiteAdmin) {
            throw new Error("Unauthorized: Access denied to target organization");
          }
        }
      }

      return await this.storage.updateTeam(teamId, teamData);
    } catch (error) {
      this.handleError(error, "TeamService.updateTeam");
    }
  }

  /**
   * Delete team with access validation
   */
  async deleteTeam(teamId: string, requestingUserId: string): Promise<void> {
    try {
      // Get existing team
      const existingTeam = await this.storage.getTeamById(teamId);
      if (!existingTeam) {
        throw new Error("Team not found");
      }

      // Validate access
      if (existingTeam.organizationId) {
        const hasAccess = await this.validateOrganizationAccess(
          requestingUserId, 
          existingTeam.organizationId
        );
        
        if (!hasAccess) {
          const requestingUser = await this.storage.getUserById(requestingUserId);
          if (!requestingUser?.isSiteAdmin) {
            throw new Error("Unauthorized: Access denied to this team");
          }
        }
      }

      await this.storage.deleteTeam(teamId);
    } catch (error) {
      this.handleError(error, "TeamService.deleteTeam");
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
      const existingTeam = await this.storage.getTeamById(teamId);
      if (!existingTeam) {
        throw new Error("Team not found");
      }

      if (existingTeam.organizationId) {
        const hasAccess = await this.validateOrganizationAccess(
          requestingUserId, 
          existingTeam.organizationId
        );
        
        if (!hasAccess) {
          const requestingUser = await this.storage.getUserById(requestingUserId);
          if (!requestingUser?.isSiteAdmin) {
            throw new Error("Unauthorized: Access denied to this team");
          }
        }
      }

      await this.storage.archiveTeam(teamId, validatedData.reason);
    } catch (error) {
      this.handleError(error, "TeamService.archiveTeam");
    }
  }

  /**
   * Unarchive team
   */
  async unarchiveTeam(teamId: string, requestingUserId: string): Promise<void> {
    try {
      // Get existing team and validate access
      const existingTeam = await this.storage.getTeamById(teamId);
      if (!existingTeam) {
        throw new Error("Team not found");
      }

      if (existingTeam.organizationId) {
        const hasAccess = await this.validateOrganizationAccess(
          requestingUserId, 
          existingTeam.organizationId
        );
        
        if (!hasAccess) {
          const requestingUser = await this.storage.getUserById(requestingUserId);
          if (!requestingUser?.isSiteAdmin) {
            throw new Error("Unauthorized: Access denied to this team");
          }
        }
      }

      await this.storage.unarchiveTeam(teamId);
    } catch (error) {
      this.handleError(error, "TeamService.unarchiveTeam");
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
      const existingTeam = await this.storage.getTeamById(teamId);
      if (!existingTeam) {
        throw new Error("Team not found");
      }

      if (existingTeam.organizationId) {
        const hasAccess = await this.validateOrganizationAccess(
          requestingUserId, 
          existingTeam.organizationId
        );
        
        if (!hasAccess) {
          const requestingUser = await this.storage.getUserById(requestingUserId);
          if (!requestingUser?.isSiteAdmin) {
            throw new Error("Unauthorized: Access denied to this team");
          }
        }
      }

      await this.storage.updateTeamMembership(teamId, userId, validatedData);
    } catch (error) {
      this.handleError(error, "TeamService.updateTeamMembership");
    }
  }
}