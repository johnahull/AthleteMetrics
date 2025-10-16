import { storage } from "./storage";
import { isSiteAdmin } from "@shared/auth-utils";
import type { Express, Request, Response, NextFunction } from "express";

// Extended request type with user info
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    isSiteAdmin?: boolean;
    primaryOrganizationId?: string;
  };
}

const canAccessOrganization = async (user: any, organizationId: string): Promise<boolean> => {
  if (!user?.id || !organizationId) return false;
  if (isSiteAdmin(user)) return true;

  const userOrgs = await storage.getUserOrganizations(user.id);
  return userOrgs.some(org => org.organizationId === organizationId);
};

// Base authentication middleware
export const requireAuth = async (req: any, res: Response, next: NextFunction) => {
  const user = req.session.user || (req.session.admin ? { admin: true } : null);
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  // Defense-in-depth: Verify user hasn't been soft-deleted or deactivated
  // Sessions are revoked during user deletion, but this adds extra protection
  if (user.id && !user.admin) {
    const dbUser = await storage.getUser(user.id);
    if (!dbUser || !dbUser.isActive) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: "Account no longer active" });
    }
  }

  req.user = user;
  next();
};

// Site admin only middleware
export const requireSiteAdmin = async (req: any, res: Response, next: NextFunction) => {
  const user = req.session.user || (req.session.admin ? { admin: true } : null);

  // Check authentication first (return 401 if not authenticated)
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  // Then check if user is site admin (return 403 if not admin)
  if (!isSiteAdmin(user)) {
    return res.status(403).json({ message: "Site admin access required" });
  }

  req.user = user;
  next();
};

// Organization access middleware factory
export const requireOrganizationAccess = (roleRequired?: string) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.session?.user || req.user;
    const organizationId = req.params.organizationId || req.query.organizationId || req.body.organizationId;

    if (!user?.id) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    if (!organizationId) {
      return res.status(400).json({ message: "Organization ID required" });
    }

    // Site admins have access to all organizations
    if (isSiteAdmin(user)) {
      req.user = user;
      return next();
    }

    // Check organization access
    const hasAccess = await canAccessOrganization(user, organizationId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this organization" });
    }

    // Check specific role if required
    if (roleRequired) {
      const userRoles = await storage.getUserRoles(user.id, organizationId);
      if (!userRoles.includes(roleRequired) && !userRoles.includes("org_admin")) {
        return res.status(403).json({ 
          message: `${roleRequired} role required for this action` 
        });
      }
    }

    req.user = user;
    next();
  };
};

// Team access middleware - checks if user can access team through organization
export const requireTeamAccess = (actionRequired?: 'read' | 'write') => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.session?.user || req.user;
    const teamId = req.params.teamId || req.params.id;

    if (!user?.id) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    if (!teamId) {
      return res.status(400).json({ message: "Team ID required" });
    }

    // Site admins have access to all teams
    if (isSiteAdmin(user)) {
      req.user = user;
      return next();
    }

    // Get team and check organization access
    const team = await storage.getTeam(teamId);
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }

    const hasOrgAccess = await canAccessOrganization(user, team.organizationId);
    if (!hasOrgAccess) {
      return res.status(403).json({ message: "Access denied to this team" });
    }

    // Check write permissions for modification actions
    if (actionRequired === 'write') {
      if (user.role === "athlete") {
        return res.status(403).json({ message: "Athletes cannot modify teams" });
      }
    }

    req.user = user;
    next();
  };
};

// Athlete access middleware - checks if user can access athlete data
export const requireAthleteAccess = (actionRequired?: 'read' | 'write') => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.session?.user || req.user;
    const athleteId = req.params.athleteId || req.params.id;

    if (!user?.id) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    if (!athleteId) {
      return res.status(400).json({ message: "Athlete ID required" });
    }

    // Site admins have access to all athletes
    if (isSiteAdmin(user)) {
      req.user = user;
      return next();
    }

    // Athletes can only access their own data
    if (user.role === "athlete") {
      if (user.id !== athleteId) {
        return res.status(403).json({ message: "Athletes can only access their own data" });
      }
      req.user = user;
      return next();
    }

    // For coaches and org admins, check if athlete is in their organization
    const athlete = await storage.getUser(athleteId);
    if (!athlete) {
      return res.status(404).json({ message: "Athlete not found" });
    }

    const athleteTeams = await storage.getUserTeams(athleteId);
    const athleteOrganizations = athleteTeams.map(team => team.team.organization.id);

    const userOrgs = await storage.getUserOrganizations(user.id);
    const userOrganizationIds = userOrgs.map(userOrg => userOrg.organizationId);

    const hasSharedOrg = athleteOrganizations.some(orgId => 
      userOrganizationIds.includes(orgId)
    );

    if (!hasSharedOrg) {
      return res.status(403).json({ message: "Access denied to this athlete" });
    }

    req.user = user;
    next();
  };
};

// Error handling middleware
export const errorHandler = (error: any, req: Request, res: Response, next: NextFunction) => {
  console.error('API Error:', error);
  
  if (error.name === 'ZodError') {
    return res.status(400).json({ 
      message: "Validation error", 
      errors: error.errors 
    });
  }
  
  res.status(500).json({ 
    message: error.message || "Internal server error" 
  });
};