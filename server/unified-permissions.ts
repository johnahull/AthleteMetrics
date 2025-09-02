import { storage } from "./storage";

export interface PermissionContext {
  userId?: string;
  organizationId?: string;
  teamId?: string;
  athleteId?: string;
  role?: string;
}

export type Resource = 
  | 'organization' 
  | 'team' 
  | 'athlete' 
  | 'measurement' 
  | 'invitation'
  | 'user';

export type Action = 
  | 'create' 
  | 'read' 
  | 'update' 
  | 'delete' 
  | 'invite' 
  | 'verify';

class UnifiedPermissionService {
  private async isSiteAdmin(userId: string): Promise<boolean> {
    const user = await storage.getUser(userId);
    return user?.isSiteAdmin === "true";
  }

  private async getUserRolesInOrg(userId: string, organizationId: string): Promise<string[]> {
    return await storage.getUserRoles(userId, organizationId);
  }

  private async canAccessOrganization(userId: string, organizationId: string): Promise<boolean> {
    if (await this.isSiteAdmin(userId)) return true;
    
    const userOrgs = await storage.getUserOrganizations(userId);
    return userOrgs.some(org => org.organizationId === organizationId);
  }

  async checkPermission(
    userId: string, 
    resource: Resource, 
    action: Action, 
    context: PermissionContext = {}
  ): Promise<{ allowed: boolean; reason?: string }> {
    if (!userId) {
      return { allowed: false, reason: "User ID required" };
    }

    // Site admins have access to everything
    if (await this.isSiteAdmin(userId)) {
      return { allowed: true };
    }

    // Get user roles based on context
    let userRoles: string[] = [];
    if (context.organizationId) {
      userRoles = await this.getUserRolesInOrg(userId, context.organizationId);
    }

    // Resource-specific permission logic
    switch (resource) {
      case 'organization':
        return this.checkOrganizationPermission(userId, action, context, userRoles);
      
      case 'team':
        return this.checkTeamPermission(userId, action, context, userRoles);
      
      case 'athlete':
        return this.checkAthletePermission(userId, action, context, userRoles);
      
      case 'measurement':
        return this.checkMeasurementPermission(userId, action, context, userRoles);
      
      case 'invitation':
        return this.checkInvitationPermission(userId, action, context, userRoles);
      
      case 'user':
        return this.checkUserPermission(userId, action, context, userRoles);
      
      default:
        return { allowed: false, reason: "Unknown resource" };
    }
  }

  private async checkOrganizationPermission(
    userId: string, 
    action: Action, 
    context: PermissionContext, 
    userRoles: string[]
  ): Promise<{ allowed: boolean; reason?: string }> {
    if (!context.organizationId) {
      return { allowed: false, reason: "Organization ID required" };
    }

    const hasAccess = await this.canAccessOrganization(userId, context.organizationId);
    if (!hasAccess) {
      return { allowed: false, reason: "No access to organization" };
    }

    switch (action) {
      case 'read':
        return { allowed: true };
      
      case 'update':
      case 'delete':
        return { 
          allowed: userRoles.includes('org_admin'), 
          reason: "Organization admin required" 
        };
      
      default:
        return { allowed: false, reason: `Action ${action} not supported for organizations` };
    }
  }

  private async checkTeamPermission(
    userId: string, 
    action: Action, 
    context: PermissionContext, 
    userRoles: string[]
  ): Promise<{ allowed: boolean; reason?: string }> {
    if (context.teamId) {
      const team = await storage.getTeam(context.teamId);
      if (!team) {
        return { allowed: false, reason: "Team not found" };
      }
      context.organizationId = team.organizationId;
    }

    if (!context.organizationId) {
      return { allowed: false, reason: "Organization context required" };
    }

    const hasOrgAccess = await this.canAccessOrganization(userId, context.organizationId);
    if (!hasOrgAccess) {
      return { allowed: false, reason: "No access to team's organization" };
    }

    switch (action) {
      case 'read':
        return { allowed: true };
      
      case 'create':
      case 'update':
      case 'delete':
        if (userRoles.includes('athlete')) {
          return { allowed: false, reason: "Athletes cannot modify teams" };
        }
        return { 
          allowed: userRoles.includes('coach') || userRoles.includes('org_admin'), 
          reason: "Coach or org admin required" 
        };
      
      default:
        return { allowed: false, reason: `Action ${action} not supported for teams` };
    }
  }

  private async checkAthletePermission(
    userId: string, 
    action: Action, 
    context: PermissionContext, 
    userRoles: string[]
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Athletes can access their own data
    if (context.athleteId === userId) {
      switch (action) {
        case 'read':
          return { allowed: true };
        case 'update':
          return { allowed: true }; // Athletes can update their own profile
        default:
          return { allowed: false, reason: "Athletes can only read/update their own data" };
      }
    }

    // For accessing other athletes, need organization context
    if (context.athleteId && !context.organizationId) {
      const athlete = await storage.getUser(context.athleteId);
      if (!athlete) {
        return { allowed: false, reason: "Athlete not found" };
      }
      
      // Get athlete's organizations through teams
      const athleteTeams = await storage.getUserTeams(context.athleteId);
      const athleteOrgIds = [...new Set(athleteTeams.map(t => t.team.organization.id))];
      
      // Check if user has access to any of athlete's organizations
      const userOrgs = await storage.getUserOrganizations(userId);
      const userOrgIds = userOrgs.map(o => o.organizationId);
      
      const sharedOrgId = athleteOrgIds.find(orgId => userOrgIds.includes(orgId));
      if (!sharedOrgId) {
        return { allowed: false, reason: "No shared organization with athlete" };
      }
      
      context.organizationId = sharedOrgId;
      userRoles = await this.getUserRolesInOrg(userId, sharedOrgId);
    }

    switch (action) {
      case 'read':
        return { allowed: userRoles.length > 0 }; // Any role in shared org
      
      case 'create':
        return { 
          allowed: userRoles.includes('coach') || userRoles.includes('org_admin'),
          reason: "Coach or org admin required to create athletes" 
        };
      
      case 'update':
      case 'delete':
        return { 
          allowed: userRoles.includes('org_admin'),
          reason: "Organization admin required for athlete modifications" 
        };
      
      default:
        return { allowed: false, reason: `Action ${action} not supported for athletes` };
    }
  }

  private async checkMeasurementPermission(
    userId: string, 
    action: Action, 
    context: PermissionContext, 
    userRoles: string[]
  ): Promise<{ allowed: boolean; reason?: string }> {
    switch (action) {
      case 'read':
        if (context.athleteId === userId) {
          return { allowed: true }; // Athletes can read their own measurements
        }
        return { 
          allowed: userRoles.includes('coach') || userRoles.includes('org_admin'),
          reason: "Coach or org admin required to read measurements" 
        };
      
      case 'create':
        return { 
          allowed: userRoles.includes('coach') || userRoles.includes('org_admin'),
          reason: "Coach or org admin required to create measurements" 
        };
      
      case 'verify':
        return { 
          allowed: userRoles.includes('org_admin'),
          reason: "Organization admin required to verify measurements" 
        };
      
      default:
        return { allowed: false, reason: `Action ${action} not supported for measurements` };
    }
  }

  private async checkInvitationPermission(
    userId: string, 
    action: Action, 
    context: PermissionContext, 
    userRoles: string[]
  ): Promise<{ allowed: boolean; reason?: string }> {
    switch (action) {
      case 'create':
        if (userRoles.includes('org_admin')) {
          return { allowed: true };
        }
        if (userRoles.includes('coach') && context.role === 'athlete') {
          return { allowed: true };
        }
        return { allowed: false, reason: "Insufficient permissions to invite users" };
      
      case 'delete':
        return { 
          allowed: userRoles.includes('org_admin'),
          reason: "Organization admin required to delete invitations" 
        };
      
      default:
        return { allowed: false, reason: `Action ${action} not supported for invitations` };
    }
  }

  private async checkUserPermission(
    userId: string, 
    action: Action, 
    context: PermissionContext, 
    userRoles: string[]
  ): Promise<{ allowed: boolean; reason?: string }> {
    switch (action) {
      case 'read':
        return { allowed: true }; // Users can read user info if they have any role
      
      case 'update':
        if (context.userId === userId) {
          return { allowed: true }; // Users can update their own profile
        }
        return { 
          allowed: userRoles.includes('org_admin'),
          reason: "Organization admin required to update other users" 
        };
      
      case 'delete':
        return { 
          allowed: userRoles.includes('org_admin') && context.userId !== userId,
          reason: "Organization admin required, cannot delete self" 
        };
      
      default:
        return { allowed: false, reason: `Action ${action} not supported for users` };
    }
  }

  // Convenience methods for common checks
  async canManageOrganization(userId: string, organizationId: string): Promise<boolean> {
    const result = await this.checkPermission(userId, 'organization', 'update', { organizationId });
    return result.allowed;
  }

  async canCreateTeam(userId: string, organizationId: string): Promise<boolean> {
    const result = await this.checkPermission(userId, 'team', 'create', { organizationId });
    return result.allowed;
  }

  async canInviteAthlete(userId: string, organizationId: string): Promise<boolean> {
    const result = await this.checkPermission(userId, 'invitation', 'create', { 
      organizationId, 
      role: 'athlete' 
    });
    return result.allowed;
  }

  async canVerifyMeasurement(userId: string, organizationId: string): Promise<boolean> {
    const result = await this.checkPermission(userId, 'measurement', 'verify', { organizationId });
    return result.allowed;
  }

  // Express middleware factory
  requirePermission(resource: Resource, action: Action, contextExtractor?: (req: any) => PermissionContext) {
    return async (req: any, res: any, next: any) => {
      const userId = req.session?.user?.id || req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const context = contextExtractor ? contextExtractor(req) : {
        organizationId: req.params.organizationId || req.query.organizationId,
        teamId: req.params.teamId || req.params.id,
        athleteId: req.params.athleteId || req.params.id,
        userId: req.params.userId || req.params.id,
      };

      const result = await this.checkPermission(userId, resource, action, context);
      if (!result.allowed) {
        return res.status(403).json({ 
          message: result.reason || "Access denied" 
        });
      }

      req.user = req.session.user || req.user;
      next();
    };
  }
}

export const permissions = new UnifiedPermissionService();