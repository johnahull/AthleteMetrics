/**
 * Organization Access Validation Helper
 *
 * Provides secure validation of organization access by checking actual database
 * membership instead of trusting session data.
 *
 * SECURITY: Session data (primaryOrganizationId) can be stale or manipulated.
 * Always validate organization access against the database.
 *
 * PERFORMANCE: Supports request-scoped caching when Express Request is provided.
 * Pass req parameter to enable caching and reduce redundant DB queries.
 */

import { storage } from "../storage";
import { isSiteAdmin, type SessionUser } from "../utils/auth-helpers";
import { getCachedUserOrganizations } from "./cached-org-access";
import type { Request } from "express";

export interface OrgAccessResult {
  allowed: boolean;
  effectiveOrgId?: string;
  error?: string;
  userOrgs?: Array<{ organizationId: string; role: string }>;
}

/**
 * Validate that a user has access to the specified organization.
 *
 * @param user - The session user object
 * @param requestedOrgId - The organization ID being requested (optional)
 * @param req - Express Request object (optional, enables caching)
 * @returns OrgAccessResult with allowed status, effective org ID, or error
 *
 * Security Logic:
 * 1. Site admins have access to all organizations
 * 2. Regular users must have actual database membership to access an org
 * 3. If no org specified, defaults to user's first org from database
 *
 * Performance: Pass req parameter to use request-scoped caching
 */
export async function validateOrganizationAccess(
  user: SessionUser | undefined,
  requestedOrgId: string | undefined,
  req?: Request
): Promise<OrgAccessResult> {
  // No user = no access
  if (!user?.id) {
    return { allowed: false, error: "User not authenticated" };
  }

  // Site admins can access any organization
  if (isSiteAdmin(user)) {
    return {
      allowed: true,
      effectiveOrgId: requestedOrgId
    };
  }

  // Fetch actual organization memberships from database (with caching if req provided)
  const userOrgs = req
    ? await getCachedUserOrganizations(req, user.id)
    : await storage.getUserOrganizations(user.id);

  // Users with no org memberships have no access
  if (userOrgs.length === 0) {
    return {
      allowed: false,
      error: "Access denied - no organization membership",
      userOrgs
    };
  }

  // If specific org requested, verify membership
  if (requestedOrgId) {
    const hasAccess = userOrgs.some(org => org.organizationId === requestedOrgId);
    if (!hasAccess) {
      return {
        allowed: false,
        error: "Access denied - you don't have permission to access this organization",
        userOrgs
      };
    }
    return {
      allowed: true,
      effectiveOrgId: requestedOrgId,
      userOrgs
    };
  }

  // No org specified - use first org from database (ordered by name)
  // Prefer user's session primary org if it's valid
  const validPrimaryOrg = userOrgs.find(org => org.organizationId === user.primaryOrganizationId);
  return {
    allowed: true,
    effectiveOrgId: validPrimaryOrg?.organizationId ?? userOrgs[0].organizationId,
    userOrgs
  };
}

/**
 * Check if user has access to a specific organization (boolean result)
 * Use this for simple access checks where you already have an org ID.
 *
 * @param user - The session user object
 * @param organizationId - The organization ID to check access for
 * @param req - Express Request object (optional, enables caching)
 * @returns True if user has access, false otherwise
 */
export async function hasOrganizationAccess(
  user: SessionUser | undefined,
  organizationId: string,
  req?: Request
): Promise<boolean> {
  if (!user?.id) return false;
  if (isSiteAdmin(user)) return true;

  const userOrgs = req
    ? await getCachedUserOrganizations(req, user.id)
    : await storage.getUserOrganizations(user.id);
  return userOrgs.some(org => org.organizationId === organizationId);
}
