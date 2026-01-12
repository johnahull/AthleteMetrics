/**
 * Permission Helper Functions
 *
 * Utility functions for permission checking, role comparison,
 * and common authorization patterns.
 */

import { Role, Permission, ROLE_HIERARCHY, PERMISSIONS, Resource, Action, RESOURCE_PERMISSIONS } from './types';

/**
 * Get the numeric level of a role for comparison.
 * Higher numbers = more privileges.
 */
export function getRoleLevel(role: Role): number {
  return ROLE_HIERARCHY[role] || 0;
}

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
 * Check if a role has a specific permission (legacy permission system).
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  const allowedRoles = PERMISSIONS[permission];
  if (!allowedRoles) return false;
  return allowedRoles.includes(role);
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

/**
 * Check if one role can manage another role (for role assignment).
 * A role can only assign roles strictly below its level.
 *
 * @example
 * canManageRole('org_admin', 'coach')    // true (80 > 60)
 * canManageRole('coach', 'coach')        // false (60 > 60 is false)
 * canManageRole('coach', 'athlete')      // true (60 > 40)
 */
export function canManageRole(managerRole: Role, targetRole: Role): boolean {
  return getRoleLevel(managerRole) > getRoleLevel(targetRole);
}

/**
 * Get all roles that a manager can assign to users.
 */
export function getAssignableRoles(managerRole: Role): Role[] {
  const managerLevel = getRoleLevel(managerRole);
  return (Object.keys(ROLE_HIERARCHY) as Role[]).filter(
    (role) => getRoleLevel(role) < managerLevel
  );
}

/**
 * Get display name for a role.
 */
export function getRoleDisplayName(role: Role): string {
  const displayNames: Record<Role, string> = {
    site_admin: 'Site Administrator',
    org_admin: 'Organization Admin',
    coach: 'Coach',
    athlete: 'Athlete',
    guest: 'Guest',
  };
  return displayNames[role] || role;
}
