/**
 * Parent Access Middleware
 *
 * Provides requireParentAccess() — an Express middleware factory that checks
 * whether the authenticated user has an active parentAthleteLinks row linking
 * them to the requested athlete.
 *
 * Design notes:
 * - Uses parentUserId FK (not parentEmail) so the session userId is the single
 *   source of truth. Email-only links (parentUserId IS NULL) do NOT grant access
 *   until the parent registers an account via POST /api/auth/register/parent.
 * - Site admins bypass the check (full system access).
 * - Returns 403 (not 404) when link exists but is inactive to prevent enumeration.
 */

import type { Request, Response, NextFunction } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { parentAthleteLinks } from '@shared/schema/tables/coppa';
import { isSiteAdmin } from '@shared/auth-utils';

/**
 * Require an active parent-to-athlete link for the authenticated user.
 *
 * @param athleteIdParam - Express route parameter name that holds the athlete's
 *                         user ID (default: 'athleteId')
 *
 * @example
 * router.get('/children/:athleteId/profile',
 *   requireAuth,
 *   requireParentAccess(),
 *   handler
 * );
 *
 * router.get('/children/:id/measurements',
 *   requireAuth,
 *   requireParentAccess('id'),
 *   handler
 * );
 */
export function requireParentAccess(athleteIdParam = 'athleteId') {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.session?.user;

    if (!user?.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Site admins have full access
    if (isSiteAdmin(user)) {
      return next();
    }

    // Only parent-role users may access parent routes (defense-in-depth:
    // requireParentAccess is for parents only — if a future bug somehow sets
    // parentUserId on a non-parent link, this check prevents access).
    if (user.role !== 'parent') {
      return res.status(403).json({ message: 'Access denied: parent role required' });
    }

    // Require email verification before granting data access.
    // linkParentAccount() runs at registration time (before verification),
    // so an unverified parent account could otherwise access the child's data.
    if (!user.emailVerified) {
      return res.status(403).json({
        message: 'Email verification required. Please verify your email before accessing child data.',
        code: 'email_verification_required',
      });
    }

    const athleteId = req.params[athleteIdParam];
    if (!athleteId) {
      return res.status(400).json({ message: 'Athlete ID is required' });
    }

    try {
      // Check for an active link where this user is the parent
      const [link] = await db.select({ id: parentAthleteLinks.id, isActive: parentAthleteLinks.isActive })
        .from(parentAthleteLinks)
        .where(and(
          eq(parentAthleteLinks.parentUserId, user.id),
          eq(parentAthleteLinks.athleteUserId, athleteId),
        ))
        .limit(1);

      if (!link) {
        return res.status(403).json({ message: 'Access denied: no parent link found for this athlete' });
      }

      if (!link.isActive) {
        return res.status(403).json({ message: 'Access denied: parent link is inactive' });
      }

      return next();
    } catch (error) {
      console.error('[COPPA] Parent access middleware error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
