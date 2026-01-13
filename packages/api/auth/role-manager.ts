import { storage } from '../storage';
import { Role, Permission, hasPermission, canManageRole, getAvailableRoles, getRoleLevel, PERMISSIONS } from '@shared/role-types';
import { AuthSecurity } from './security';

export class RoleManager {
  /**
   * Assign or update a user's role in an organization
   */
  static async assignRole(
    assignerId: string, 
    targetUserId: string, 
    newRole: Role,
    organizationId: string,
    ipAddress: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get assigner's role
      const assignerRole = await storage.getUserRole(assignerId, organizationId);
      if (!assignerRole) {
        return { success: false, error: 'You do not have permission to assign roles' };
      }

      // Check if assigner can manage this role
      if (!canManageRole(assignerRole as Role, newRole)) {
        return { success: false, error: `You cannot assign the ${newRole} role` };
      }

      // Get target user's current role
      const currentRole = await storage.getUserRole(targetUserId, organizationId);
      
      // If user has a current role, check if assigner can modify it
      if (currentRole && !canManageRole(assignerRole as Role, currentRole as Role)) {
        return { success: false, error: `You cannot modify this user's current role` };
      }

      // Update the role
      const success = await storage.updateUserRole(targetUserId, organizationId, newRole);

      if (success) {
        // Determine if this is a permission escalation (promotion to higher role)
        const isEscalation = currentRole &&
          getRoleLevel(newRole) > getRoleLevel(currentRole as Role);

        // Log the role change with appropriate event type and severity
        // - permission_escalation: Used for promotions (warning severity for audit trail)
        // - role_change: Used for new assignments, demotions, or lateral moves (info severity)
        await AuthSecurity.logSecurityEvent({
          userId: targetUserId,
          eventType: isEscalation ? 'permission_escalation' : 'role_change',
          eventData: JSON.stringify({
            action: 'role_assigned',
            assignerId,
            oldRole: currentRole || 'none',
            newRole,
            organizationId
          }),
          ipAddress,
          severity: isEscalation ? 'warning' : 'info',
        });
      }
      
      return { success };
    } catch (error) {
      console.error('Error assigning role:', error);
      return { success: false, error: 'Failed to assign role' };
    }
  }

  /**
   * Get all permissions for a user in an organization
   */
  static async getUserPermissions(userId: string, organizationId: string): Promise<Permission[]> {
    const userRole = await storage.getUserRole(userId, organizationId);
    if (!userRole) return [];
    
    return Object.entries(PERMISSIONS)
      .filter(([_, roles]) => roles.includes(userRole as Role))
      .map(([permission]) => permission as Permission);
  }

  /**
   * Check if user has a specific permission
   */
  static async userHasPermission(
    userId: string, 
    organizationId: string, 
    permission: Permission
  ): Promise<boolean> {
    const userRole = await storage.getUserRole(userId, organizationId);
    if (!userRole) return false;
    
    return hasPermission(userRole as Role, permission);
  }

  /**
   * Get roles that a user can assign to others
   */
  static async getAssignableRoles(userId: string, organizationId: string): Promise<Role[]> {
    const userRole = await storage.getUserRole(userId, organizationId);
    if (!userRole) return [];
    
    return getAvailableRoles(userRole as Role);
  }

  /**
   * Bulk role assignment with validation
   */
  static async assignRolesBulk(
    assignerId: string,
    assignments: Array<{ userId: string; role: Role }>,
    organizationId: string,
    ipAddress: string
  ): Promise<{ successful: number; failed: Array<{ userId: string; error: string }> }> {
    const assignerRole = await storage.getUserRole(assignerId, organizationId);
    if (!assignerRole) {
      return { 
        successful: 0, 
        failed: assignments.map(a => ({ userId: a.userId, error: 'No permission to assign roles' }))
      };
    }

    let successful = 0;
    const failed: Array<{ userId: string; error: string }> = [];

    for (const assignment of assignments) {
      const result = await this.assignRole(
        assignerId, 
        assignment.userId, 
        assignment.role, 
        organizationId,
        ipAddress
      );
      
      if (result.success) {
        successful++;
      } else {
        failed.push({ userId: assignment.userId, error: result.error || 'Unknown error' });
      }
    }

    return { successful, failed };
  }

  /**
   * Get organization hierarchy with roles
   */
  static async getOrganizationHierarchy(organizationId: string): Promise<{
    admins: any[];
    coaches: any[];
    athletes: any[];
  }> {
    const users = await storage.getUsersByOrganization(organizationId);
    
    return {
      admins: users.filter(u => u.role === 'org_admin'),
      coaches: users.filter(u => u.role === 'coach'),
      athletes: users.filter(u => u.role === 'athlete'),
    };
  }

  /**
   * Validate role transition is allowed
   */
  static validateRoleTransition(currentRole: Role | null, newRole: Role): {
    valid: boolean;
    reason?: string;
  } {
    // Site admin can never lose their role through this system
    if (currentRole === 'site_admin' && newRole !== 'site_admin') {
      return { 
        valid: false, 
        reason: 'Site admin role cannot be changed through role management' 
      };
    }

    // Certain transitions might be restricted
    if (currentRole === 'org_admin' && newRole === 'athlete') {
      return { 
        valid: false, 
        reason: 'Direct transition from org_admin to athlete not allowed. Change to coach first.' 
      };
    }

    return { valid: true };
  }

  /**
   * Get role change suggestions based on user activity
   */
  static async getRoleSuggestions(userId: string, organizationId: string): Promise<{
    suggestedRole?: Role;
    reason?: string;
    confidence: number;
  }> {
    // This could analyze user behavior patterns to suggest role changes
    // For now, return a basic implementation
    
    const userStats = await storage.getUserActivityStats(userId, organizationId);
    
    if (!userStats) {
      return { confidence: 0 };
    }

    // Example logic - this could be much more sophisticated
    if (userStats.measurementsCreated > 100 && userStats.teamsManaged > 0) {
      return {
        suggestedRole: 'coach',
        reason: 'User has created many measurements and managed teams',
        confidence: 0.8
      };
    }

    return { confidence: 0 };
  }

  /**
   * Create role-based middleware for routes
   *
   * @deprecated Use `requirePermission` from 'packages/api/permissions' instead.
   * This method will be removed in a future version.
   *
   * @example
   * // Old usage (deprecated):
   * RoleManager.requirePermission('CREATE_TEAM')
   *
   * // New usage:
   * import { requirePermission } from '../permissions';
   * requirePermission('CREATE_TEAM')
   */
  static requirePermission(permission: Permission) {
    return async (req: any, res: any, next: any) => {
      const user = req.session?.user;
      if (!user) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const organizationId = req.params.organizationId || user.primaryOrganizationId;
      if (!organizationId) {
        return res.status(400).json({ message: 'Organization context required' });
      }

      const hasPermissionResult = await RoleManager.userHasPermission(
        user.id, 
        organizationId, 
        permission
      );

      if (!hasPermissionResult) {
        return res.status(403).json({ 
          message: 'Insufficient permissions',
          requiredPermission: permission 
        });
      }

      // Add permissions to request for downstream use
      req.userPermissions = await RoleManager.getUserPermissions(user.id, organizationId);
      req.organizationId = organizationId;

      next();
    };
  }

  /**
   * Create role-based middleware for minimum role requirement
   *
   * @deprecated Use `requireRole` from 'packages/api/permissions' instead.
   * This method will be removed in a future version.
   *
   * @param minRole - The minimum role level required to access the route
   * @returns Express middleware that validates user has sufficient role level
   *
   * @example
   * // Old usage (deprecated):
   * RoleManager.requireRole('coach')
   *
   * // New usage:
   * import { requireRole } from '../permissions';
   * requireRole('coach')
   *
   * @note Uses role LEVEL comparison (>=) not canManageRole (>).
   * A coach (level 60) can access coach-required routes.
   * canManageRole() is for checking if someone can ASSIGN a role, not access it.
   */
  static requireRole(minRole: Role) {
    return async (req: any, res: any, next: any) => {
      const user = req.session?.user;
      if (!user) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      // Site admins bypass all role checks
      if (user.isSiteAdmin) {
        req.userRole = 'site_admin';
        req.organizationId = req.params.organizationId || user.primaryOrganizationId;
        return next();
      }

      const organizationId = req.params.organizationId || user.primaryOrganizationId;

      // Require organization context for non-site-admins
      if (!organizationId) {
        return res.status(400).json({ message: 'Organization context required' });
      }

      const userRole = await storage.getUserRole(user.id, organizationId);

      if (!userRole) {
        return res.status(403).json({
          message: `${minRole} role or higher required`,
          requiredRole: minRole
        });
      }

      // FIX: Use role LEVEL comparison (>=) instead of canManageRole (>)
      // A coach should be able to access coach-required routes
      const userLevel = getRoleLevel(userRole as Role);
      const requiredLevel = getRoleLevel(minRole);

      if (userLevel < requiredLevel) {
        return res.status(403).json({
          message: `${minRole} role or higher required`,
          userRole,
          requiredRole: minRole
        });
      }

      req.userRole = userRole;
      req.organizationId = organizationId;

      next();
    };
  }
}