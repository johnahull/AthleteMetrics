/**
 * Unified Permission Middleware
 *
 * Express middleware factories for permission checking.
 * This module consolidates and replaces:
 * - RoleManager.requirePermission()
 * - RoleManager.requireRole()
 * - requireOrganizationAccess() from middleware.ts
 * - Inline role checks in route handlers
 *
 * @example
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

import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { Role, Permission, Resource, Action, PERMISSIONS, RESOURCE_PERMISSIONS } from './types';
import { isSiteAdmin, getRoleLevel, hasMinRoleLevel, canPerformAction } from './helpers';

/**
 * Require a specific permission (legacy PERMISSIONS constant).
 *
 * This middleware checks if the user's role has the specified permission
 * according to the PERMISSIONS matrix in types.ts.
 *
 * @param permission - Permission name from PERMISSIONS constant
 *
 * @example
 * router.post('/teams', requireAuth, requirePermission('CREATE_TEAM'), handler);
 */
export function requirePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.session?.user;

    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Site admins bypass all permission checks
    if (isSiteAdmin(user)) {
      req.user = user as Express.User;
      return next();
    }

    // Get organization context
    const organizationId = req.params.organizationId || req.params.orgId || user.primaryOrganizationId;

    if (!organizationId) {
      return res.status(400).json({ message: 'Organization context required' });
    }

    // Get user's role in this organization
    const userRole = await storage.getUserRole(user.id, organizationId);

    if (!userRole) {
      return res.status(403).json({
        message: 'You do not have access to this organization',
      });
    }

    // Check if role has permission
    const allowedRoles = PERMISSIONS[permission];
    if (!allowedRoles || !allowedRoles.includes(userRole as Role)) {
      return res.status(403).json({
        message: `Permission denied: ${permission} required`,
        requiredPermission: permission,
      });
    }

    req.user = user as Express.User;
    (req as any).userRole = userRole;
    (req as any).organizationId = organizationId;
    next();
  };
}

/**
 * Require a minimum role level.
 *
 * Uses role level comparison (>=) so a coach can access coach-required routes,
 * and an org_admin can access coach-required routes.
 *
 * @param minRole - Minimum role level required
 *
 * @example
 * router.get('/coach-dashboard', requireAuth, requireRole('coach'), handler);
 */
export function requireRole(minRole: Role) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.session?.user;

    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Site admins bypass all role checks
    if (isSiteAdmin(user)) {
      req.user = user as Express.User;
      (req as any).userRole = 'site_admin';
      (req as any).organizationId = req.params.organizationId || req.params.orgId || user.primaryOrganizationId;
      return next();
    }

    // Get organization context
    const organizationId = req.params.organizationId || req.params.orgId || user.primaryOrganizationId;

    if (!organizationId) {
      return res.status(400).json({ message: 'Organization context required' });
    }

    // Get user's role in this organization
    const userRole = await storage.getUserRole(user.id, organizationId);

    if (!userRole) {
      return res.status(403).json({
        message: `${minRole} role or higher required`,
        requiredRole: minRole,
      });
    }

    // Compare role levels (>= for same-level access)
    if (!hasMinRoleLevel(userRole as Role, minRole)) {
      return res.status(403).json({
        message: `${minRole} role or higher required`,
        userRole,
        requiredRole: minRole,
      });
    }

    req.user = user as Express.User;
    (req as any).userRole = userRole;
    (req as any).organizationId = organizationId;
    next();
  };
}

/**
 * Options for requireOrgAccess middleware
 */
export interface OrgAccessOptions {
  /** Require specific role within organization */
  role?: Role;
  /** Parameter name to extract organizationId from (default: 'organizationId' or 'orgId') */
  fromParam?: string;
}

/**
 * Require organization membership.
 *
 * Validates that the user is a member of the organization specified in
 * the request params. Optionally checks for a specific role.
 *
 * @param options - Optional configuration
 *
 * @example
 * // Just membership
 * router.get('/org/:orgId/data', requireAuth, requireOrgAccess(), handler);
 *
 * // Membership + role
 * router.post('/org/:orgId/admin', requireAuth, requireOrgAccess({ role: 'org_admin' }), handler);
 */
export function requireOrgAccess(options: OrgAccessOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.session?.user;

    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Get organization ID from params
    const paramName = options.fromParam || 'organizationId';
    const organizationId = req.params[paramName] || req.params.orgId || req.params.organizationId;

    if (!organizationId) {
      return res.status(400).json({ message: 'Organization ID required' });
    }

    // Site admins bypass organization membership checks
    if (isSiteAdmin(user)) {
      req.user = user as Express.User;
      (req as any).organizationId = organizationId;
      return next();
    }

    // Get user's organizations
    const userOrgs = await storage.getUserOrganizations(user.id);
    const membership = userOrgs.find((org: any) => org.organizationId === organizationId);

    if (!membership) {
      return res.status(403).json({
        message: 'Access denied to this organization',
      });
    }

    // Check specific role if required
    if (options.role) {
      const userRoleLevel = getRoleLevel(membership.role as Role);
      const requiredRoleLevel = getRoleLevel(options.role);

      if (userRoleLevel < requiredRoleLevel) {
        return res.status(403).json({
          message: `${options.role} role or higher required`,
          userRole: membership.role,
          requiredRole: options.role,
        });
      }
    }

    req.user = user as Express.User;
    (req as any).userRole = membership.role;
    (req as any).organizationId = organizationId;
    next();
  };
}

/**
 * Require permission to perform an action on a resource.
 *
 * This is the new resource-action based permission model that provides
 * more granular control than the legacy PERMISSIONS constant.
 *
 * @param resource - Resource type (team, athlete, measurement, etc.)
 * @param action - Action to perform (create, read, update, delete, verify)
 *
 * @example
 * router.post('/teams', requireAuth, requireResourceAccess('team', 'create'), handler);
 * router.delete('/measurements/:id', requireAuth, requireResourceAccess('measurement', 'delete'), handler);
 */
export function requireResourceAccess(resource: Resource, action: Action) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.session?.user;

    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Site admins bypass all resource access checks
    if (isSiteAdmin(user)) {
      req.user = user as Express.User;
      (req as any).userRole = 'site_admin';
      return next();
    }

    // Get organization context
    const organizationId = req.params.organizationId || req.params.orgId || user.primaryOrganizationId;

    if (!organizationId) {
      return res.status(400).json({ message: 'Organization context required' });
    }

    // Get user's role in this organization
    const userRole = await storage.getUserRole(user.id, organizationId);

    if (!userRole) {
      return res.status(403).json({
        message: 'You do not have access to this organization',
      });
    }

    // Check resource-action permission
    if (!canPerformAction(userRole as Role, resource, action)) {
      return res.status(403).json({
        message: `Permission denied: Cannot ${action} ${resource}`,
        resource,
        action,
        userRole,
      });
    }

    req.user = user as Express.User;
    (req as any).userRole = userRole;
    (req as any).organizationId = organizationId;
    next();
  };
}
