
interface AccessControlContext {
  userId: string;
  organizationId?: string;
  targetUserId?: string;
  resource?: string;
}

export class AccessController {
  private storage: any;

  constructor(storage: any) {
    this.storage = storage;
  }

  async isSiteAdmin(userId: string): Promise<boolean> {
    const user = await this.storage.getUser(userId);
    return user?.isSiteAdmin === "true";
  }

  async canAccessOrganization(userId: string, organizationId: string): Promise<boolean> {
    if (await this.isSiteAdmin(userId)) return true;
    
    const userOrgs = await this.storage.getUserOrganizations(userId);
    return userOrgs.some((org: any) => org.organizationId === organizationId);
  }

  async canManageOrganization(userId: string, organizationId: string): Promise<boolean> {
    if (await this.isSiteAdmin(userId)) return true;
    
    const userRoles = await this.storage.getUserRoles(userId, organizationId);
    return userRoles.includes("org_admin");
  }

  async canInviteToOrganization(userId: string, organizationId: string, targetRole: string): Promise<boolean> {
    if (await this.isSiteAdmin(userId)) return targetRole !== "site_admin";
    
    const userRoles = await this.storage.getUserRoles(userId, organizationId);
    
    if (userRoles.includes("org_admin")) {
      return targetRole !== "site_admin";
    }
    
    if (userRoles.includes("coach")) {
      return targetRole === "athlete";
    }
    
    return false;
  }

  async canAccessPlayer(userId: string, playerId: string): Promise<boolean> {
    if (await this.isSiteAdmin(userId)) return true;
    
    // Athletes can only access their own profile
    const user = await this.storage.getUser(userId);
    const userRoles = await this.storage.getUserRoles(userId);
    
    if (userRoles.includes("athlete")) {
      return userId === playerId;
    }
    
    // Coaches and org admins can access players in their organizations
    if (userRoles.includes("coach") || userRoles.includes("org_admin")) {
      const playerTeams = await this.storage.getPlayerTeams(playerId);
      const userOrgs = await this.storage.getUserOrganizations(userId);
      
      return playerTeams.some((team: any) => 
        userOrgs.some((userOrg: any) => userOrg.organizationId === team.organization.id)
      );
    }
    
    return false;
  }

  async canManageUser(userId: string, targetUserId: string, organizationId?: string): Promise<boolean> {
    if (await this.isSiteAdmin(userId)) return true;
    
    // Users cannot manage themselves
    if (userId === targetUserId) return false;
    
    if (organizationId) {
      const userRoles = await this.storage.getUserRoles(userId, organizationId);
      return userRoles.includes("org_admin");
    }
    
    return false;
  }

  async getAccessibleOrganizations(userId: string): Promise<string[]> {
    if (await this.isSiteAdmin(userId)) {
      const allOrgs = await this.storage.getOrganizations();
      return allOrgs.map((org: any) => org.id);
    }
    
    const userOrgs = await this.storage.getUserOrganizations(userId);
    return userOrgs.map((org: any) => org.organizationId);
  }

  async requireSiteAdmin(userId: string): Promise<void> {
    if (!await this.isSiteAdmin(userId)) {
      throw new Error("Site admin access required");
    }
  }

  async requireOrganizationAccess(userId: string, organizationId: string): Promise<void> {
    if (!await this.canAccessOrganization(userId, organizationId)) {
      throw new Error("Access denied to this organization");
    }
  }

  async requireOrganizationManagement(userId: string, organizationId: string): Promise<void> {
    if (!await this.canManageOrganization(userId, organizationId)) {
      throw new Error("Organization management access required");
    }
  }
}
