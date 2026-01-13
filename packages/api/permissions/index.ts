/**
 * Unified Permission Module
 *
 * Single entry point for all permission-related functionality.
 * This module consolidates and replaces multiple competing permission systems.
 *
 * @example
 * import {
 *   requirePermission,
 *   requireRole,
 *   requireOrgAccess,
 *   requireResourceAccess,
 *   Role,
 *   Permission,
 * } from '../permissions';
 *
 * // Permission-based (legacy)
 * router.post('/teams', requireAuth, requirePermission('CREATE_TEAM'), handler);
 *
 * // Role-based
 * router.get('/admin', requireAuth, requireRole('org_admin'), handler);
 *
 * // Organization access
 * router.get('/org/:orgId/data', requireAuth, requireOrgAccess(), handler);
 *
 * // Resource-action based
 * router.post('/teams', requireAuth, requireResourceAccess('team', 'create'), handler);
 */

// Types and constants
export {
  ROLE_HIERARCHY,
  PERMISSIONS,
  RESOURCE_PERMISSIONS,
} from './types';

export type { Role, Permission, Resource, Action } from './types';

// Middleware factories
export {
  requirePermission,
  requireRole,
  requireOrgAccess,
  requireResourceAccess,
} from './middleware';

export type { OrgAccessOptions } from './middleware';

// Helper functions
export {
  getRoleLevel,
  hasMinRoleLevel,
  hasPermission,
  canPerformAction,
  isSiteAdmin,
  canManageRole,
  getAssignableRoles,
  getRoleDisplayName,
} from './helpers';

// Measurement-specific permission helpers
export {
  canCreateMeasurementFor,
  canModifyMeasurement,
  canDeleteMeasurement,
  canVerifyMeasurement,
  canUseBatchEndpoint,
  canQueryCrossOrganization,
} from './measurement-helpers';

export type {
  PermissionResult,
  MeasurementForPermission,
  UserForPermission,
} from './measurement-helpers';

// Analytics-specific permission helpers
export {
  canViewUserStats,
  canAccessLeaderboard,
  canAccessMostImproved,
  canAccessAtRiskData,
  canAccessCoachAnalytics,
} from './analytics-helpers';
