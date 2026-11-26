/**
 * Middleware for athlete management permissions
 * Consolidates permission checking logic to avoid duplication
 */

import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { INVITATION_PENDING_PASSWORD, type User } from '@shared/schema';
import type { UserForPermission } from '../permissions/measurement-helpers';

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
 * Who may act on another user's account through the athlete routes.
 *
 * Rules (site admins always pass; they are the only ones who may act on a site admin):
 * - The caller needs coach/org_admin IN an organization the target belongs to. A role held in a different
 *   organization never counts (the caller's membership in that same organization, as `getOrgRole(caller, thatOrg)`
 *   gives it, never the session role).
 * - In that organization the target's role must be one the caller's role manages there (MANAGED_ROLES): a coach
 *   manages athletes, an org admin manages athletes and coaches. Nobody manages a peer, a superior, or a
 *   parent/guest member through these routes.
 * - Such an organization is a "managed" organization. One is enough for ordinary profile edits.
 * - Account-level actions (status toggle, delete, email change) affect the whole account in every organization,
 *   so they need every organization of the target to be managed.
 */
export interface AthleteAuthority {
  target: User | undefined;
  /** Organizations the target is a member of */
  targetOrgIds: string[];
  /** The subset of targetOrgIds in which the caller may manage the target */
  managedOrgIds: string[];
}

/** Target roles each caller role may manage in the same organization. */
const MANAGED_ROLES: Record<string, readonly string[]> = {
  org_admin: ['athlete', 'coach'],
  coach: ['athlete'],
};

export async function getAthleteAuthority(
  caller: Pick<UserForPermission, 'id' | 'isSiteAdmin' | 'role'>,
  targetId: string
): Promise<AthleteAuthority> {
  // The caller's memberships are loaded once; a lookup by organization id is what getOrgRole does per call.
  const [target, targetOrgs, callerOrgs] = await Promise.all([
    storage.getUser(targetId),
    storage.getUserOrganizations(targetId),
    caller.isSiteAdmin ? Promise.resolve([]) : storage.getUserOrganizations(caller.id),
  ]);
  const callerRoleIn = new Map(callerOrgs.map((org) => [org.organizationId, org.role]));
  const managedOrgIds = targetOrgs
    .filter((org) =>
      caller.isSiteAdmin || (MANAGED_ROLES[callerRoleIn.get(org.organizationId) ?? ''] ?? []).includes(org.role)
    )
    .map((org) => org.organizationId);
  return { target, targetOrgIds: targetOrgs.map((org) => org.organizationId), managedOrgIds };
}

/** True when the caller manages the target in every one of the target's organizations (and the target is not a site admin). */
export function managesWholeAccount(authority: AthleteAuthority): boolean {
  return (
    !!authority.target &&
    !authority.target.isSiteAdmin &&
    authority.targetOrgIds.length > 0 &&
    authority.managedOrgIds.length === authority.targetOrgIds.length
  );
}

/** An account someone has activated: a real password or an OAuth login. Its email is the owner's to change. */
export function isClaimedAccount(user: Pick<User, 'password' | 'googleId' | 'appleId'>): boolean {
  return (!!user.password && user.password !== INVITATION_PENDING_PASSWORD) || !!user.googleId || !!user.appleId;
}

/**
 * Factory for athlete-access middleware (rules above).
 *
 * When `allowSelf` is true, a user may also access their own record, which is right for reads and self-profile
 * edits but NOT for destructive actions (delete, status toggle), where self-access would let an athlete delete
 * themselves or reverse an admin's deactivation. When `wholeAccount` is true the caller must manage the target in
 * every organization of the target.
 *
 * For non-site-admins the computed authority is left in `res.locals.athleteAuthority` for the handler.
 */
function athleteAccessPermission(options: { allowSelf: boolean; wholeAccount: boolean }) {
  return async function (req: Request, res: Response, next: NextFunction) {
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

      const authority = await getAthleteAuthority(currentUser, athleteId);
      res.locals.athleteAuthority = authority;

      // Athletes can access their own profile (read/self-edit only)
      if (options.allowSelf && currentUser.id === athleteId) {
        return next();
      }

      // Check if athlete exists (a user with no organization is not an athlete anyone but a site admin manages)
      if (!authority.target || authority.targetOrgIds.length === 0) {
        return res.status(404).json({ message: "Athlete not found" });
      }

      // A site admin target gets the same refusal as any other user the caller does not manage
      if (authority.target.isSiteAdmin || authority.managedOrgIds.length === 0) {
        return res.status(403).json({
          message: "Access denied - you need a coach or organization admin role above this user's role in their organization"
        });
      }

      if (options.wholeAccount && !managesWholeAccount(authority)) {
        return res.status(403).json({
          message: "Access denied - this user also belongs to organizations you do not manage"
        });
      }

      next();
    } catch (error) {
      console.error("Error in athleteAccessPermission:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}

/**
 * Access to a specific athlete for reads and profile edits.
 * Users may access their own record; org_admin/coach may access users they manage in at least one shared
 * organization; site admins may access any. Account-level fields (emails) are checked again in the handler.
 */
export const requireAthleteAccessPermission = athleteAccessPermission({ allowSelf: true, wholeAccount: false });

/**
 * Access to a specific athlete for destructive/management actions (delete,
 * status toggle). No self-access branch, so an athlete cannot delete or
 * re-activate their own record, and the caller must manage the target in
 * every organization the target belongs to.
 */
export const requireAthleteManagementAccess = athleteAccessPermission({ allowSelf: false, wholeAccount: true });
