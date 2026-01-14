/**
 * Measurement-Specific Permission Helpers
 *
 * Context-aware authorization rules for measurement operations.
 * These helpers encapsulate the complex business logic for:
 * - Self-access patterns (athletes can only modify own measurements)
 * - Verified measurement restrictions
 * - Organization membership validation
 * - Cross-organization query permissions
 *
 * @see packages/api/routes/measurement-routes.ts
 */

import { storage } from '../storage';
import { isSiteAdmin, isValidRole } from './helpers';

/**
 * Permission check result with optional reason for denial
 */
export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Minimal measurement type for permission checks
 */
export interface MeasurementForPermission {
  id: string;
  userId: string;
  submittedBy?: string | null;
  isVerified?: boolean;
  organizationId?: string | null;
}

/**
 * Minimal user type for permission checks
 */
export interface UserForPermission {
  id: string;
  isSiteAdmin?: boolean;
  role?: string;
}

/**
 * Check if user has permission to create a measurement for a target user.
 *
 * Rules:
 * - Site admins can create for anyone
 * - Athletes can only create for themselves
 * - Coaches/org_admins can create for users in their organization
 */
export async function canCreateMeasurementFor(
  user: UserForPermission,
  targetUserId: string
): Promise<PermissionResult> {
  // Site admins can create for anyone
  if (isSiteAdmin(user)) {
    return { allowed: true };
  }

  // Validate role
  if (!user.role || !isValidRole(user.role)) {
    return {
      allowed: false,
      reason: 'Invalid or missing user role',
    };
  }

  // Athletes can only create for themselves
  if (user.role === 'athlete') {
    if (user.id === targetUserId) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: 'Athletes can only create measurements for themselves',
    };
  }

  // Coaches and org_admins need to verify org membership
  if (user.role === 'coach' || user.role === 'org_admin') {
    const [userOrgs, targetUserOrgs] = await Promise.all([
      storage.getUserOrganizations(user.id),
      storage.getUserOrganizations(targetUserId),
    ]);

    const userOrgIds = new Set(userOrgs.map((o: any) => o.organizationId));
    const hasSharedOrg = targetUserOrgs.some((o: any) => userOrgIds.has(o.organizationId));

    if (hasSharedOrg) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: 'Cannot create measurement for user outside your organization',
    };
  }

  // Default deny for other roles (guest, etc.)
  return {
    allowed: false,
    reason: 'Insufficient permissions to create measurements',
  };
}

/**
 * Check if user can modify (update) an existing measurement.
 *
 * Rules:
 * - Site admins can modify any measurement
 * - Athletes can modify their own unverified measurements
 * - Athletes cannot modify verified measurements
 * - Coaches/org_admins can modify measurements in their org (including verified)
 * - Original submitters can modify their submissions
 */
export async function canModifyMeasurement(
  user: UserForPermission,
  measurement: MeasurementForPermission
): Promise<PermissionResult> {
  // Site admins can modify anything
  if (isSiteAdmin(user)) {
    return { allowed: true };
  }

  // Validate role
  if (!user.role || !isValidRole(user.role)) {
    return {
      allowed: false,
      reason: 'Invalid or missing user role',
    };
  }

  // Check if user is the original submitter
  const isSubmitter = measurement.submittedBy === user.id;

  // Athletes have special restrictions
  if (user.role === 'athlete') {
    // Must be the subject of the measurement or the submitter
    if (measurement.userId !== user.id && !isSubmitter) {
      return {
        allowed: false,
        reason: 'You can only modify your own measurements',
      };
    }

    // Athletes cannot modify verified measurements
    if (measurement.isVerified) {
      return {
        allowed: false,
        reason: 'Cannot modify verified measurements. Contact your coach to make changes.',
      };
    }

    return { allowed: true };
  }

  // Coaches and org_admins can modify if:
  // 1. They are the submitter, OR
  // 2. The measurement is in their organization
  if (user.role === 'coach' || user.role === 'org_admin') {
    // Submitters can always modify their submissions
    if (isSubmitter) {
      return { allowed: true };
    }

    // Check organization membership
    if (measurement.organizationId) {
      const userOrgs = await storage.getUserOrganizations(user.id);
      const userOrgIds = new Set(userOrgs.map((o: any) => o.organizationId));

      if (userOrgIds.has(measurement.organizationId)) {
        return { allowed: true };
      }
    }

    return {
      allowed: false,
      reason: 'Access denied - you can only update measurements you submitted or measurements in your organization',
    };
  }

  // Default deny
  return {
    allowed: false,
    reason: 'Insufficient permissions to modify measurements',
  };
}

/**
 * Check if user can delete an existing measurement.
 *
 * Rules:
 * - Site admins can delete any measurement
 * - Athletes can delete their own unverified measurements
 * - Athletes cannot delete verified measurements
 * - Coaches/org_admins can delete measurements in their org
 */
export async function canDeleteMeasurement(
  user: UserForPermission,
  measurement: MeasurementForPermission
): Promise<PermissionResult> {
  // Site admins can delete anything
  if (isSiteAdmin(user)) {
    return { allowed: true };
  }

  // Validate role
  if (!user.role || !isValidRole(user.role)) {
    return {
      allowed: false,
      reason: 'Invalid or missing user role',
    };
  }

  // Check if user is the original submitter
  const isSubmitter = measurement.submittedBy === user.id;

  // Athletes have special restrictions
  if (user.role === 'athlete') {
    // Must be the submitter
    if (!isSubmitter && measurement.userId !== user.id) {
      return {
        allowed: false,
        reason: 'You can only delete your own measurements',
      };
    }

    // Athletes cannot delete verified measurements
    if (measurement.isVerified) {
      return {
        allowed: false,
        reason: 'Cannot delete verified measurements. Contact your coach to make changes.',
      };
    }

    return { allowed: true };
  }

  // Coaches and org_admins
  if (user.role === 'coach' || user.role === 'org_admin') {
    // Submitters can always delete their submissions
    if (isSubmitter) {
      return { allowed: true };
    }

    // Check organization membership
    if (measurement.organizationId) {
      const userOrgs = await storage.getUserOrganizations(user.id);
      const userOrgIds = new Set(userOrgs.map((o: any) => o.organizationId));

      if (userOrgIds.has(measurement.organizationId)) {
        return { allowed: true };
      }
    }

    return {
      allowed: false,
      reason: 'Access denied - you can only delete measurements you submitted or measurements in your organization',
    };
  }

  // Default deny
  return {
    allowed: false,
    reason: 'Insufficient permissions to delete measurements',
  };
}

/**
 * Check if user can verify a measurement.
 *
 * Rules:
 * - Site admins can verify any measurement
 * - Athletes cannot verify measurements
 * - Coaches/org_admins can verify measurements in their org
 */
export async function canVerifyMeasurement(
  user: UserForPermission,
  measurement: MeasurementForPermission
): Promise<PermissionResult> {
  // Site admins can verify anything
  if (isSiteAdmin(user)) {
    return { allowed: true };
  }

  // Validate role
  if (!user.role || !isValidRole(user.role)) {
    return {
      allowed: false,
      reason: 'Invalid or missing user role',
    };
  }

  // Athletes cannot verify
  if (user.role === 'athlete' || user.role === 'guest') {
    return {
      allowed: false,
      reason: 'Athletes cannot verify measurements',
    };
  }

  // Coaches and org_admins need org membership
  if (user.role === 'coach' || user.role === 'org_admin') {
    if (measurement.organizationId) {
      const userOrgs = await storage.getUserOrganizations(user.id);
      const userOrgIds = new Set(userOrgs.map((o: any) => o.organizationId));

      if (userOrgIds.has(measurement.organizationId)) {
        return { allowed: true };
      }
    }

    return {
      allowed: false,
      reason: 'You can only verify measurements in your organization',
    };
  }

  // Default deny
  return {
    allowed: false,
    reason: 'Insufficient permissions to verify measurements',
  };
}

/**
 * Check if user can use the batch measurement endpoint.
 *
 * Rules:
 * - Site admins, org_admins, and coaches can use batch endpoint
 * - Athletes and guests cannot
 */
export function canUseBatchEndpoint(user: UserForPermission): PermissionResult {
  if (isSiteAdmin(user)) {
    return { allowed: true };
  }

  // Validate role
  if (!user.role || !isValidRole(user.role)) {
    return {
      allowed: false,
      reason: 'Invalid or missing user role',
    };
  }

  if (user.role === 'coach' || user.role === 'org_admin') {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: 'Athletes cannot use batch measurement entry',
  };
}

/**
 * Check if user can query measurements across organizations.
 *
 * Rules:
 * - Only site admins can query cross-organization
 */
export function canQueryCrossOrganization(user: UserForPermission): boolean {
  return isSiteAdmin(user);
}
