/**
 * Permission Helper Functions
 *
 * Re-exports core functions from @shared/role-types and adds
 * additional utility functions for the API permission module.
 *
 * @see packages/shared/role-types.ts for the source of truth
 */

import { Role, Permission, Resource, Action, RESOURCE_PERMISSIONS } from './types';

// Re-export core functions from shared module to avoid duplication
export {
  getRoleLevel,
  hasPermission,
  canManageRole,
  getAvailableRoles as getAssignableRoles,
  getRoleDisplayName,
} from '@shared/role-types';

// Import getRoleLevel for use in local functions
import { getRoleLevel } from '@shared/role-types';

/**
 * Check if a user has at least the minimum required role level.
 *
 * @example
 * hasMinRoleLevel('org_admin', 'coach') // true (80 >= 60)
 * hasMinRoleLevel('athlete', 'coach')   // false (40 < 60)
 */
export function hasMinRoleLevel(userRole: Role, minRole: Role): boolean {
  return getRoleLevel(userRole) >= getRoleLevel(minRole);
}

/**
 * Check if a role can perform an action on a resource.
 */
export function canPerformAction(role: Role, resource: Resource, action: Action): boolean {
  const resourcePerms = RESOURCE_PERMISSIONS[resource];
  if (!resourcePerms) return false;

  const allowedRoles = resourcePerms[action];
  if (!allowedRoles) return false;

  return allowedRoles.includes(role);
}

/**
 * Check if user object represents a site admin.
 * Handles various user object shapes for backward compatibility.
 */
export function isSiteAdmin(user: any): boolean {
  if (!user) return false;

  // Primary check
  if (user.isSiteAdmin === true) return true;

  // Legacy checks for backward compatibility
  if (user.role === 'site_admin') return true;
  if (user.admin === true) return true;

  return false;
}
