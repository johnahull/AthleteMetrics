import { storage } from "./storage";
import { isSiteAdmin } from "@shared/auth-utils";
import type { Express, Request, Response, NextFunction } from "express";

// Extended request type with user info
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    isSiteAdmin?: boolean;
    primaryOrganizationId?: string;
    accessMethod?: string; // For wellness access tracking
  };
}

const canAccessOrganization = async (user: any, organizationId: string): Promise<boolean> => {
  if (!user?.id || !organizationId) return false;
  if (isSiteAdmin(user)) return true;

  const userOrgs = await storage.getUserOrganizations(user.id);
  return userOrgs.some(org => org.organizationId === organizationId);
};

// Base authentication middleware
export const requireAuth = (req: any, res: Response, next: NextFunction) => {
  const user = req.session.user || (req.session.admin ? { admin: true } : null);
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
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
    // SECURITY: Prioritize URL parameter to prevent authorization bypass via body manipulation
    // URL parameters are more trustworthy as they're part of the route definition
    let organizationId = req.params.organizationId;
    if (!organizationId) {
      // Fallback to query/body only if not in URL (rare case for non-RESTful endpoints)
      organizationId = req.query.organizationId as string || req.body.organizationId;
    }

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

// AI Coaching Insights middleware - checks if AI features are enabled for organization
export const requireAIEnabled = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const user = req.session?.user || req.user;

  // Ensure user is authenticated before proceeding
  if (!user?.id) {
    return res.status(401).json({ message: "User not authenticated" });
  }

  // Get organizationId from report or direct parameter
  let organizationId = req.params.organizationId;

  // If not in params, try to get from report ID
  if (!organizationId && req.params.id) {
    const report = await storage.getReport(req.params.id);
    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }
    organizationId = report.organizationId;
  }

  if (!organizationId) {
    return res.status(400).json({ message: "Organization ID required" });
  }

  // Check organization access before revealing AI status
  // This prevents information disclosure about AI being enabled for orgs user can't access
  const hasAccess = await canAccessOrganization(user, organizationId);
  if (!hasAccess) {
    return res.status(403).json({ message: "Access denied to this organization" });
  }

  // Get organization and check AI flags
  const organization = await storage.getOrganization(organizationId);
  if (!organization) {
    return res.status(404).json({ message: "Organization not found" });
  }

  // Check both AI flags - both must be true
  if (!organization.aiEnabledBySiteAdmin || !organization.aiEnabled) {
    return res.status(403).json({
      message: "AI coaching insights feature is not enabled for this organization",
    });
  }

  req.user = user;
  next();
};

// Wellness access middleware - supports both authenticated and magic link access
export const requireWellnessAccess = (requireAuth: boolean = false) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Check 1: Authenticated session (athlete accessing own data or coach)
      const sessionUser = req.session?.user || req.user;

      if (sessionUser?.id) {
        // User is authenticated via session
        const email = (sessionUser as any).emails?.[0] || sessionUser.email || '';
        req.user = {
          id: sessionUser.id,
          email,
          firstName: sessionUser.firstName,
          lastName: sessionUser.lastName,
          role: sessionUser.role || 'athlete',
          isSiteAdmin: sessionUser.isSiteAdmin,
          primaryOrganizationId: sessionUser.primaryOrganizationId,
          accessMethod: 'authenticated',
        };
        return next();
      }

      // Check 2: Magic link token (from body, params, or query)
      // Priority: body (POST submission) > params (URL path) > query (URL parameters)
      const token = req.body.token || req.params.token || req.query.token as string;

      if (!token) {
        if (requireAuth) {
          return res.status(401).json({
            message: "Authentication required. Please log in or use a valid magic link."
          });
        }
        return res.status(401).json({
          message: "Missing authentication credentials"
        });
      }

      // Check 3: Validate token and retrieve request details
      // SECURITY: Use generic error message to prevent information disclosure
      const genericError = "Invalid or expired link";
      const { storage } = await import('./storage');
      const wellnessRequest = await storage.getWellnessRequestByToken(token);

      if (!wellnessRequest) {
        return res.status(403).json({ message: genericError });
      }

      // Check if request is active
      if (wellnessRequest.status !== 'active') {
        console.log(`Wellness request ${wellnessRequest.id} is not active`);
        return res.status(403).json({ message: genericError });
      }

      // Check if expired
      if (wellnessRequest.expiresAt && new Date() > new Date(wellnessRequest.expiresAt)) {
        console.log(`Wellness request ${wellnessRequest.id} has expired`);
        return res.status(403).json({ message: genericError });
      }

      // For magic link access, extract athlete ID from query parameter
      // Priority: query > body
      // SECURITY NOTE: This allows anyone with the magic link to submit on behalf of ANY
      // athlete in the target list (direct or team-based). This is BY DESIGN for the
      // wellness use case where coaches send one link that works for all team members.
      // If 1:1 athlete-token binding is needed, use targetAthleteIds (not targetTeamIds)
      // with individual tokens per athlete.
      const athleteId = req.query.athlete as string || req.body.athlete as string;

      if (!athleteId) {
        return res.status(400).json({
          message: "Missing athlete parameter for magic link submission"
        });
      }

      // Verify athlete is targeted by this request
      const isTargetedDirectly = wellnessRequest.targetAthleteIds?.includes(athleteId);

      // Check team-based targeting if not directly targeted
      let isTargetedViaTeam = false;
      if (!isTargetedDirectly && wellnessRequest.targetTeamIds && wellnessRequest.targetTeamIds.length > 0) {
        const athleteTeams = await storage.getUserTeams(athleteId);
        const athleteTeamIds = athleteTeams.map(ut => ut.teamId);
        isTargetedViaTeam = wellnessRequest.targetTeamIds.some(teamId => athleteTeamIds.includes(teamId));
      }

      if (!isTargetedDirectly && !isTargetedViaTeam) {
        console.log(`Athlete ${athleteId} not authorized for wellness request ${wellnessRequest.id}`);
        return res.status(403).json({ message: genericError });
      }

      // Get athlete details for user context
      const athlete = await storage.getUser(athleteId);
      if (!athlete) {
        console.log(`Athlete ${athleteId} not found for wellness request ${wellnessRequest.id}`);
        return res.status(403).json({ message: genericError });
      }

      // For public wellness links (requiresAuth: false), set magic link user context
      // with the actual athlete's ID and details
      req.user = {
        id: athlete.id,
        email: athlete.emails?.[0] || '',
        firstName: athlete.firstName || 'Wellness',
        lastName: athlete.lastName || 'Respondent',
        role: 'athlete',
        isSiteAdmin: false,
        accessMethod: 'magic_link',
      };

      // Attach request details for downstream use
      (req as any).wellnessRequest = wellnessRequest;

      next();
    } catch (error) {
      console.error('Wellness access middleware error:', error);
      return res.status(500).json({
        message: "Failed to validate access"
      });
    }
  };
};

// Wellness feature flag middleware - checks if wellness module is enabled
export { requireWellnessEnabled, checkWellnessEnabled } from './middleware/require-wellness-enabled';

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