
// Permission constants
export const ACTIONS = {
  READ: 'read',
  WRITE: 'write',
  DELETE: 'delete',
  MANAGE: 'manage',
  INVITE: 'invite',
  VERIFY: 'verify'
} as const;

export const RESOURCES = {
  USER: 'user',
  ORGANIZATION: 'organization',
  TEAM: 'team',
  ATHLETE: 'athlete',
  MEASUREMENT: 'measurement',
  SITE: 'site'
} as const;

export const ROLES = {
  SITE_ADMIN: 'site_admin',
  ORG_ADMIN: 'org_admin',
  COACH: 'coach',
  ATHLETE: 'athlete'
} as const;

interface User {
  id: string;
  role: string;
  isSiteAdmin?: boolean;
}

interface PermissionContext {
  organizationId?: string;
  resourceOwnerId?: string;
  targetRole?: string;
}

export class PermissionChecker {
  private storage: any;

  constructor(storage: any) {
    this.storage = storage;
  }

  async checkPermission(
    user: User,
    action: string,
    resource: string,
    context: PermissionContext = {}
  ): Promise<boolean> {
    // Site admins have full access
    if (user.isSiteAdmin || user.role === ROLES.SITE_ADMIN) {
      return true;
    }

    const { organizationId, resourceOwnerId, targetRole } = context;

    // Self-access permissions
    if (resourceOwnerId === user.id && resource === RESOURCES.USER) {
      return action === ACTIONS.READ || action === ACTIONS.WRITE;
    }

    // Organization-specific permissions
    if (organizationId) {
      const userRoles = await this.storage.getUserRoles(user.id, organizationId);
      
      if (userRoles.length === 0) {
        return false; // No access to organization
      }

      return this.checkOrganizationPermission(userRoles, action, resource, targetRole);
    }

    // Default deny
    return false;
  }

  private checkOrganizationPermission(
    userRoles: string[],
    action: string,
    resource: string,
    targetRole?: string
  ): boolean {
    const hasOrgAdmin = userRoles.includes(ROLES.ORG_ADMIN);
    const hasCoach = userRoles.includes(ROLES.COACH);
    const hasAthlete = userRoles.includes(ROLES.ATHLETE);

    switch (resource) {
      case RESOURCES.USER:
        if (action === ACTIONS.MANAGE) {
          return hasOrgAdmin;
        }
        if (action === ACTIONS.INVITE) {
          if (hasOrgAdmin) return targetRole !== ROLES.SITE_ADMIN;
          if (hasCoach) return targetRole === ROLES.ATHLETE;
          return false;
        }
        return hasOrgAdmin || hasCoach;

      case RESOURCES.TEAM:
      case RESOURCES.ATHLETE:
        if (action === ACTIONS.MANAGE) {
          return hasOrgAdmin || hasCoach;
        }
        return hasOrgAdmin || hasCoach || hasAthlete;

      case RESOURCES.MEASUREMENT:
        if (action === ACTIONS.WRITE) {
          return hasOrgAdmin || hasCoach;
        }
        if (action === ACTIONS.VERIFY) {
          return hasOrgAdmin;
        }
        return hasOrgAdmin || hasCoach || hasAthlete;

      default:
        return false;
    }
  }

  async getUserRoles(userId: string, organizationId?: string): Promise<string[]> {
    return this.storage.getUserRoles(userId, organizationId);
  }
}
