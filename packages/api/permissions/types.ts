/**
 * Unified Permission Types
 *
 * Defines the role hierarchy, permission matrix, and resource-action model
 * for the AthleteMetrics RBAC system.
 *
 * @see packages/api/permissions/middleware.ts for middleware implementations
 */

/**
 * Role hierarchy with numeric levels for comparison.
 * Higher numbers = more privileges.
 */
export const ROLE_HIERARCHY = {
  site_admin: 100,
  org_admin: 80,
  coach: 60,
  athlete: 40,
  guest: 20,
} as const;

export type Role = keyof typeof ROLE_HIERARCHY;

/**
 * Legacy permission names mapped to roles that can perform them.
 * Maintains backward compatibility with RoleManager.requirePermission().
 */
export const PERMISSIONS: Record<string, Role[]> = {
  // Organization management
  CREATE_ORGANIZATION: ['site_admin'],
  MANAGE_ORGANIZATION: ['site_admin', 'org_admin'],
  VIEW_ORGANIZATION: ['site_admin', 'org_admin', 'coach', 'athlete'],
  DELETE_ORGANIZATION: ['site_admin'],

  // User management
  INVITE_USERS: ['site_admin', 'org_admin'],
  MANAGE_USERS: ['site_admin', 'org_admin'],
  VIEW_ALL_USERS: ['site_admin', 'org_admin', 'coach'],
  DELETE_USERS: ['site_admin', 'org_admin'],
  IMPERSONATE_USERS: ['site_admin'],

  // Team management
  CREATE_TEAM: ['site_admin', 'org_admin', 'coach'],
  MANAGE_TEAM: ['site_admin', 'org_admin', 'coach'],
  VIEW_TEAM: ['site_admin', 'org_admin', 'coach', 'athlete'],
  DELETE_TEAM: ['site_admin', 'org_admin'],

  // Measurement management
  IMPORT_MEASUREMENTS: ['site_admin', 'org_admin', 'coach'],
  CREATE_MEASUREMENTS: ['site_admin', 'org_admin', 'coach'],
  EDIT_ANY_MEASUREMENTS: ['site_admin', 'org_admin', 'coach'],
  EDIT_OWN_MEASUREMENTS: ['athlete'],
  VIEW_ALL_MEASUREMENTS: ['site_admin', 'org_admin', 'coach'],
  VIEW_OWN_MEASUREMENTS: ['athlete'],
  DELETE_MEASUREMENTS: ['site_admin', 'org_admin', 'coach'],
  VERIFY_MEASUREMENTS: ['site_admin', 'org_admin', 'coach'],

  // Analytics and reporting
  VIEW_ANALYTICS: ['site_admin', 'org_admin', 'coach'],
  VIEW_ADVANCED_ANALYTICS: ['site_admin', 'org_admin'],
  EXPORT_DATA: ['site_admin', 'org_admin', 'coach'],
  BULK_EXPORT: ['site_admin', 'org_admin'],

  // System administration
  MANAGE_SYSTEM: ['site_admin'],
  VIEW_LOGS: ['site_admin'],
  CONFIGURE_SETTINGS: ['site_admin', 'org_admin'],
} as const;

export type Permission = keyof typeof PERMISSIONS;

/**
 * Resource types for resource-action based permissions
 */
export type Resource =
  | 'organization'
  | 'team'
  | 'athlete'
  | 'measurement'
  | 'invitation'
  | 'user'
  | 'analytics';

/**
 * Actions that can be performed on resources
 */
export type Action = 'create' | 'read' | 'update' | 'delete' | 'verify';

/**
 * Resource-action permission matrix.
 * Maps each resource type to the roles that can perform each action.
 *
 * Note: For 'athlete' resource, athletes can read/update their own data.
 * This self-access check is handled in the middleware, not in this matrix.
 */
export const RESOURCE_PERMISSIONS: Record<Resource, Partial<Record<Action, Role[]>>> = {
  organization: {
    create: ['site_admin'],
    read: ['site_admin', 'org_admin', 'coach', 'athlete'],
    update: ['site_admin', 'org_admin'],
    delete: ['site_admin'],
  },
  team: {
    create: ['site_admin', 'org_admin', 'coach'],
    read: ['site_admin', 'org_admin', 'coach', 'athlete'],
    update: ['site_admin', 'org_admin', 'coach'],
    delete: ['site_admin', 'org_admin'],
  },
  athlete: {
    create: ['site_admin', 'org_admin', 'coach'],
    read: ['site_admin', 'org_admin', 'coach', 'athlete'], // athlete = own data only
    update: ['site_admin', 'org_admin', 'coach', 'athlete'], // athlete = own data only
    delete: ['site_admin', 'org_admin'],
  },
  measurement: {
    create: ['site_admin', 'org_admin', 'coach'],
    read: ['site_admin', 'org_admin', 'coach', 'athlete'],
    update: ['site_admin', 'org_admin', 'coach'],
    delete: ['site_admin', 'org_admin', 'coach'],
    verify: ['site_admin', 'org_admin', 'coach'],
  },
  invitation: {
    create: ['site_admin', 'org_admin', 'coach'], // coach can only invite athletes
    read: ['site_admin', 'org_admin'],
    delete: ['site_admin', 'org_admin'],
  },
  user: {
    read: ['site_admin', 'org_admin', 'coach'],
    update: ['site_admin', 'org_admin'],
    delete: ['site_admin', 'org_admin'],
  },
  analytics: {
    read: ['site_admin', 'org_admin', 'coach', 'athlete'], // athlete = own data only
  },
};
