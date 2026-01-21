/**
 * Unified Permission Types
 *
 * Re-exports role hierarchy and permissions from the shared module,
 * and adds resource-action model for granular access control.
 *
 * @see packages/api/permissions/middleware.ts for middleware implementations
 */

// Re-export core types from shared module to avoid duplication
export {
  ROLE_HIERARCHY,
  PERMISSIONS,
  type Role,
  type Permission,
} from '@shared/role-types';

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

// Import Role type for use in RESOURCE_PERMISSIONS
import type { Role } from '@shared/role-types';

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
