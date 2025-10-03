/**
 * Middleware for athlete management permissions
 * Consolidates permission checking logic to avoid duplication
 */

import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';

/**
 * Checks if user has permission to manage athletes (create/update)
 * Requires: org_admin or coach role
 */
export async function requireAthleteManagementPermission(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const currentUser = req.session.user;

    if (!currentUser?.id) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const userIsSiteAdmin = currentUser.isSiteAdmin === true;

    // Site admins can always manage athletes
    if (userIsSiteAdmin) {
      return next();
    }

    // Check if user has org_admin or coach role
    const userOrgs = await storage.getUserOrganizations(currentUser.id);

    if (userOrgs.length === 0) {
      return res.status(403).json({ message: "No organization access" });
    }

    const hasPermission = userOrgs.some(org =>
      org.role === 'org_admin' || org.role === 'coach'
    );

    if (!hasPermission) {
      return res.status(403).json({
        message: "Organization admin or coach role required"
      });
    }

    next();
  } catch (error) {
    console.error("Error in requireAthleteManagementPermission:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * Checks if user has permission to access a specific athlete
 * Requires:
 * - Athletes can access their own profile
 * - Org admins and coaches can access athletes in same organization
 * - Site admins can access any athlete
 */
export async function requireAthleteAccessPermission(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const currentUser = req.session.user;
    const athleteId = req.params.id;

    if (!currentUser?.id) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    // Validate athleteId format (UUID v4 format)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!athleteId || !uuidRegex.test(athleteId)) {
      return res.status(400).json({ message: "Invalid athlete ID format" });
    }

    const userIsSiteAdmin = currentUser.isSiteAdmin === true;

    // Site admins can access any athlete
    if (userIsSiteAdmin) {
      return next();
    }

    // Athletes can access their own profile
    if (currentUser.id === athleteId) {
      return next();
    }

    const [userOrgs, athleteOrgs] = await Promise.all([
      storage.getUserOrganizations(currentUser.id),
      storage.getUserOrganizations(athleteId)
    ]);

    if (userOrgs.length === 0) {
      return res.status(403).json({ message: "No organization access" });
    }

    // Check if user has appropriate role
    const hasRole = userOrgs.some(org =>
      org.role === 'org_admin' || org.role === 'coach'
    );

    if (!hasRole) {
      return res.status(403).json({
        message: "Organization admin or coach role required"
      });
    }

    // Check if athlete exists (athleteOrgs will be empty if user doesn't exist)
    if (athleteOrgs.length === 0) {
      return res.status(404).json({ message: "Athlete not found" });
    }

    // Check if athlete is in user's organization
    const athleteOrgIds = athleteOrgs.map(org => org.organizationId);
    const userOrgIds = userOrgs.map(org => org.organizationId);
    const hasSharedOrg = athleteOrgIds.some(orgId => userOrgIds.includes(orgId));

    if (!hasSharedOrg) {
      return res.status(403).json({
        message: "Access denied - athlete not in your organization"
      });
    }

    next();
  } catch (error) {
    console.error("Error in requireAthleteAccessPermission:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
