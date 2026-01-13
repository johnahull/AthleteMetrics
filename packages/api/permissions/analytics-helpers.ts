/**
 * Analytics-Specific Permission Helpers
 *
 * Authorization rules for analytics endpoints:
 * - Self-access patterns (athletes can only view own data)
 * - Coach-only features (leaderboards, rankings, at-risk data)
 *
 * @see packages/api/routes/analytics-routes.ts
 */

import { isSiteAdmin } from './helpers';
import type { PermissionResult, UserForPermission } from './measurement-helpers';

/**
 * Check if user can view statistics for a specific user.
 *
 * Rules:
 * - Site admins can view any user's stats
 * - Athletes can only view their own stats
 * - Coaches and org_admins can view any user's stats (in their org - checked elsewhere)
 */
export function canViewUserStats(
  user: UserForPermission,
  targetUserId: string
): PermissionResult {
  // Site admins can view anyone's stats
  if (isSiteAdmin(user)) {
    return { allowed: true };
  }

  // Athletes can only view their own stats
  if (user.role === 'athlete') {
    if (user.id === targetUserId) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: 'Athletes can only view their own statistics',
    };
  }

  // Coaches and org_admins can view any user's stats (org check is done separately)
  if (user.role === 'coach' || user.role === 'org_admin') {
    return { allowed: true };
  }

  // Default deny
  return {
    allowed: false,
    reason: 'Insufficient permissions to view user statistics',
  };
}

/**
 * Check if user can access the leaderboard feature.
 *
 * Rules:
 * - Only coaches and admins can access leaderboards
 * - Athletes cannot view leaderboards (coach/admin feature)
 */
export function canAccessLeaderboard(user: UserForPermission): PermissionResult {
  if (isSiteAdmin(user)) {
    return { allowed: true };
  }

  if (user.role === 'coach' || user.role === 'org_admin') {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: 'Access denied - athletes cannot view leaderboards',
  };
}

/**
 * Check if user can access the most-improved feature.
 *
 * Rules:
 * - Only coaches and admins can access improvement rankings
 * - Athletes cannot view most-improved data (coach/admin feature)
 */
export function canAccessMostImproved(user: UserForPermission): PermissionResult {
  if (isSiteAdmin(user)) {
    return { allowed: true };
  }

  if (user.role === 'coach' || user.role === 'org_admin') {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: 'Access denied - athletes cannot view improvement rankings',
  };
}

/**
 * Check if user can access at-risk athlete data.
 *
 * Rules:
 * - Only coaches and admins can access at-risk data
 * - Athletes cannot view at-risk data (coach/admin feature)
 */
export function canAccessAtRiskData(user: UserForPermission): PermissionResult {
  if (isSiteAdmin(user)) {
    return { allowed: true };
  }

  if (user.role === 'coach' || user.role === 'org_admin') {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: 'Access denied - athletes cannot view at-risk data',
  };
}

/**
 * Check if user can access coach-level analytics features.
 *
 * This is a general check for analytics features that require
 * coach or higher role level.
 */
export function canAccessCoachAnalytics(user: UserForPermission): PermissionResult {
  if (isSiteAdmin(user)) {
    return { allowed: true };
  }

  if (user.role === 'coach' || user.role === 'org_admin') {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: 'Access denied - coach or admin role required',
  };
}
