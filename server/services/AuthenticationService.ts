/**
 * Authentication Service
 *
 * Manages security, user sessions, MFA, and role-based access control.
 * Provides comprehensive authentication and authorization capabilities.
 */

import bcrypt from 'bcrypt';
import { BaseService, type ServiceContext, type ServiceConfig } from './base/BaseService';
import type { User } from '@shared/schema';
import type { SafeUser } from './types/common';

export interface AuthenticationServiceInterface {
  // Core Authentication
  authenticateUser(email: string, password: string, context: ServiceContext): Promise<AuthenticationResult>;
  validateSession(sessionId: string, context: ServiceContext): Promise<SessionValidationResult>;
  createSession(user: User, context: ServiceContext): Promise<SessionData>;
  destroySession(sessionId: string, context: ServiceContext): Promise<void>;

  // Multi-Factor Authentication
  setupMFA(userId: string, context: ServiceContext): Promise<MFASetupResult>;
  verifyMFA(userId: string, token: string, context: ServiceContext): Promise<boolean>;
  generateBackupCodes(userId: string, context: ServiceContext): Promise<string[]>;
  verifyBackupCode(userId: string, code: string, context: ServiceContext): Promise<boolean>;

  // Password Management
  changePassword(userId: string, currentPassword: string, newPassword: string, context: ServiceContext): Promise<void>;
  resetPassword(token: string, newPassword: string, context: ServiceContext): Promise<void>;
  generatePasswordResetToken(email: string, context: ServiceContext): Promise<string>;

  // Role & Permission Management
  getUserPermissions(userId: string, context: ServiceContext): Promise<Permission[]>;
  hasPermission(userId: string, permission: string, resourceId?: string, context?: ServiceContext): Promise<boolean>;
  updateUserRole(userId: string, role: string, organizationId: string, context: ServiceContext): Promise<void>;

  // Security Features
  checkAccountLockout(userId: string, context: ServiceContext): Promise<LockoutStatus>;
  recordFailedLogin(userId: string, ipAddress: string, context: ServiceContext): Promise<void>;
  recordSuccessfulLogin(userId: string, ipAddress: string, context: ServiceContext): Promise<void>;
}

export interface AuthenticationResult {
  success: boolean;
  user?: SafeUser;
  sessionToken?: string;
  requiresMFA?: boolean;
  mfaChallenge?: string;
  lockoutInfo?: LockoutStatus;
  error?: string;
}

export interface SessionValidationResult {
  valid: boolean;
  user?: SafeUser;
  expiresAt?: Date;
  error?: string;
}

export interface SessionData {
  sessionId: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface MFASetupResult {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  organizationId?: string;
  teamId?: string;
}

export interface LockoutStatus {
  isLocked: boolean;
  lockoutUntil?: Date;
  failedAttempts: number;
  maxAttempts: number;
  remainingTime?: number;
}

export class AuthenticationService extends BaseService implements AuthenticationServiceInterface {
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
  private readonly SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly BCRYPT_ROUNDS = 14;

  constructor(config: ServiceConfig) {
    super(config, 'AuthenticationService');
  }

  /**
   * Authenticate user with email and password
   */
  async authenticateUser(
    email: string,
    password: string,
    context: ServiceContext
  ): Promise<AuthenticationResult> {
    return this.executeWithContext('authenticateUser', context, async () => {
      // Input validation
      if (!email || !password) {
        return { success: false, error: 'Email and password are required' };
      }

      try {
        // Get user by email
        const user = await this.storage.getUserByEmail(email);
        if (!user) {
          await this.recordFailedLogin('unknown', context.sessionId || 'unknown', context);
          return { success: false, error: 'Invalid credentials' };
        }

        // Check account lockout
        const lockoutStatus = await this.checkAccountLockout(user.id, context);
        if (lockoutStatus.isLocked) {
          return {
            success: false,
            error: 'Account is temporarily locked due to too many failed attempts',
            lockoutInfo: lockoutStatus
          };
        }

        // Verify password
        const passwordValid = await bcrypt.compare(password, user.password);
        if (!passwordValid) {
          await this.recordFailedLogin(user.id, context.sessionId || 'unknown', context);
          return { success: false, error: 'Invalid credentials' };
        }

        // Check if user account is active
        if (user.isActive === 'false') {
          return { success: false, error: 'Account is deactivated' };
        }

        // Check if MFA is required
        if (user.mfaEnabled === 'true') {
          const mfaChallenge = this.generateMFAChallenge(user.id);
          return {
            success: false,
            requiresMFA: true,
            mfaChallenge,
            user: this.sanitizeUserForResponse(user)
          };
        }

        // Successful authentication
        await this.recordSuccessfulLogin(user.id, context.sessionId || 'unknown', context);
        const sessionData = await this.createSession(user, context);

        return {
          success: true,
          user: this.sanitizeUserForResponse(user),
          sessionToken: sessionData.sessionId
        };

      } catch (error) {
        this.logger.error('Authentication error', error as Error, { email });
        return { success: false, error: 'Authentication failed' };
      }
    });
  }

  /**
   * Validate session token
   */
  async validateSession(
    sessionId: string,
    context: ServiceContext
  ): Promise<SessionValidationResult> {
    return this.executeWithContext('validateSession', context, async () => {
      if (!sessionId) {
        return { valid: false, error: 'Session ID required' };
      }

      try {
        // TODO: Implement session storage methods
        // For now, using simplified session validation
        this.logger.warn('Session validation using simplified implementation');

        // Mock session data - in production, this would use proper session storage
        const mockSessionData = {
          sessionId,
          userId: context.userId || 'unknown',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
          createdAt: new Date()
        };

        // Get user data
        const user = await this.storage.getUser(mockSessionData.userId);
        if (!user || user.isActive === 'false') {
          // await this.storage.deleteSession(sessionId);
          return { valid: false, error: 'User account inactive' };
        }

        return {
          valid: true,
          user: this.sanitizeUserForResponse(user),
          expiresAt: mockSessionData.expiresAt
        };

      } catch (error) {
        this.logger.error('Session validation error', error as Error, { sessionId });
        return { valid: false, error: 'Session validation failed' };
      }
    });
  }

  /**
   * Create new session for user
   */
  async createSession(user: User, context: ServiceContext): Promise<SessionData> {
    return this.executeWithContext('createSession', context, async () => {
      const sessionId = this.generateSessionId();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.SESSION_DURATION_MS);

      const sessionData: SessionData = {
        sessionId,
        userId: user.id,
        createdAt: now,
        expiresAt,
        ipAddress: context.sessionId, // Using sessionId as IP placeholder
        userAgent: 'AthleteMetrics App'
      };

      // TODO: Implement session storage
      // await this.storage.createSession(sessionData);
      this.logger.warn('Session creation using simplified implementation');

      this.logger.info('Session created', {
        userId: user.id,
        sessionId,
        expiresAt: expiresAt.toISOString()
      });

      return sessionData;
    });
  }

  /**
   * Destroy user session
   */
  async destroySession(sessionId: string, context: ServiceContext): Promise<void> {
    return this.executeWithContext('destroySession', context, async () => {
      // TODO: Implement session storage
      // await this.storage.deleteSession(sessionId);
      this.logger.warn('Session destruction using simplified implementation');
      this.logger.info('Session destroyed', { sessionId });
    });
  }

  /**
   * Setup Multi-Factor Authentication for user
   */
  async setupMFA(userId: string, context: ServiceContext): Promise<MFASetupResult> {
    return this.executeWithContext('setupMFA', context, async () => {
      this.validatePermissions(context, { requireAuth: true });

      // Only users can setup their own MFA or site admins can setup for others
      if (context.userId !== userId && !context.isSiteAdmin) {
        throw new Error('Unauthorized to setup MFA for this user');
      }

      const user = await this.storage.getUser(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Generate MFA secret
      const secret = this.generateMFASecret();
      const qrCode = this.generateQRCode(user.emails[0], secret);
      const backupCodes = await this.generateBackupCodes(userId, context);

      // Update user with MFA secret (but don't enable until verified)
      await this.storage.updateUser(userId, {
        mfaSecret: secret,
        backupCodes
      });

      this.logger.info('MFA setup initiated', { userId });

      return {
        secret,
        qrCode,
        backupCodes
      };
    });
  }

  /**
   * Verify MFA token
   */
  async verifyMFA(userId: string, token: string, context: ServiceContext): Promise<boolean> {
    return this.executeWithContext('verifyMFA', context, async () => {
      const user = await this.storage.getUser(userId);
      if (!user || !user.mfaSecret) {
        return false;
      }

      const isValid = this.verifyTOTPToken(user.mfaSecret, token);

      if (isValid) {
        // Enable MFA if this is the first successful verification
        if (user.mfaEnabled !== 'true') {
          await this.storage.updateUser(userId, { mfaEnabled: 'true' });
          this.logger.info('MFA enabled for user', { userId });
        }
      }

      return isValid;
    });
  }

  /**
   * Generate backup codes for MFA
   */
  async generateBackupCodes(userId: string, context: ServiceContext): Promise<string[]> {
    return this.executeWithContext('generateBackupCodes', context, async () => {
      const codes = Array.from({ length: 10 }, () => this.generateBackupCode());
      const hashedCodes = await Promise.all(
        codes.map(code => bcrypt.hash(code, this.BCRYPT_ROUNDS))
      );

      await this.storage.updateUser(userId, { backupCodes: hashedCodes });

      this.logger.info('Backup codes generated', { userId, count: codes.length });
      return codes;
    });
  }

  /**
   * Verify MFA backup code
   */
  async verifyBackupCode(userId: string, code: string, context: ServiceContext): Promise<boolean> {
    return this.executeWithContext('verifyBackupCode', context, async () => {
      const user = await this.storage.getUser(userId);
      if (!user || !user.backupCodes || user.backupCodes.length === 0) {
        return false;
      }

      // Check if any backup code matches
      for (let i = 0; i < user.backupCodes.length; i++) {
        const isValid = await bcrypt.compare(code, user.backupCodes[i]);
        if (isValid) {
          // Remove used backup code
          const updatedCodes = user.backupCodes.filter((_, index) => index !== i);
          await this.storage.updateUser(userId, { backupCodes: updatedCodes });

          this.logger.info('Backup code used', { userId, remainingCodes: updatedCodes.length });
          return true;
        }
      }

      return false;
    });
  }

  /**
   * Change user password
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    context: ServiceContext
  ): Promise<void> {
    return this.executeWithContext('changePassword', context, async () => {
      this.validatePermissions(context, { requireAuth: true });

      // Users can only change their own password (unless site admin)
      if (context.userId !== userId && !context.isSiteAdmin) {
        throw new Error('Unauthorized to change password for this user');
      }

      const user = await this.storage.getUser(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Verify current password (skip for site admin)
      if (!context.isSiteAdmin) {
        const currentPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!currentPasswordValid) {
          throw new Error('Current password is incorrect');
        }
      }

      // Validate new password strength
      this.validatePasswordStrength(newPassword);

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, this.BCRYPT_ROUNDS);

      // Update password
      await this.storage.updateUser(userId, { password: hashedPassword });

      // Invalidate all sessions for this user (except current one)
      await this.invalidateUserSessions(userId, context.sessionId);

      this.logger.info('Password changed successfully', { userId });
    });
  }

  /**
   * Generate password reset token
   */
  async generatePasswordResetToken(email: string, context: ServiceContext): Promise<string> {
    return this.executeWithContext('generatePasswordResetToken', context, async () => {
      const user = await this.storage.getUserByEmail(email);
      if (!user) {
        // Don't reveal if email exists
        this.logger.warn('Password reset requested for non-existent email', { email });
        return 'token-generated'; // Fake token for security
      }

      const token = this.generateSecureToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await this.storage.createPasswordResetToken({
        token,
        userId: user.id,
        email,
        expiresAt
      });

      this.logger.info('Password reset token generated', { userId: user.id, email });
      return token;
    });
  }

  /**
   * Reset password using token
   */
  async resetPassword(token: string, newPassword: string, context: ServiceContext): Promise<void> {
    return this.executeWithContext('resetPassword', context, async () => {
      // TODO: Implement password reset token storage methods
      // const resetData = await this.storage.getPasswordResetToken(token);
      const resetData = null; // Simplified for now
      if (!resetData) {
        throw new Error('Invalid or expired reset token');
      }

      // TODO: Token expiration check disabled (requires storage implementation)
      // if (new Date() > resetData.expiresAt) {
      //   throw new Error('Reset token has expired');
      // }

      // Validate new password
      this.validatePasswordStrength(newPassword);

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, this.BCRYPT_ROUNDS);

      // Update password
      // await this.storage.updateUser(resetData.userId, { password: hashedPassword });

      // Delete reset token
      // TODO: Implement password reset token storage
      // await this.storage.deletePasswordResetToken(token);

      // Invalidate all sessions for this user
      // await this.invalidateUserSessions(resetData.userId);

      // this.logger.info('Password reset completed', { userId: resetData.userId });
      this.logger.warn('Password reset method called but not fully implemented');
    });
  }

  /**
   * Get user permissions
   */
  async getUserPermissions(userId: string, context: ServiceContext): Promise<Permission[]> {
    return this.executeWithContext('getUserPermissions', context, async () => {
      this.validatePermissions(context, { requireAuth: true });

      const user = await this.storage.getUser(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const userOrganizations = await this.storage.getUserOrganizations(userId);
      const permissions: Permission[] = [];

      // Site admin has all permissions
      if (user.isSiteAdmin === 'true') {
        permissions.push(this.createGlobalPermission('*', '*'));
      } else {
        // Add organization-based permissions
        for (const userOrg of userOrganizations) {
          permissions.push(...this.getRolePermissions(userOrg.role, userOrg.organizationId));
        }
      }

      return permissions;
    });
  }

  /**
   * Check if user has specific permission
   */
  async hasPermission(
    userId: string,
    permission: string,
    resourceId?: string,
    context?: ServiceContext
  ): Promise<boolean> {
    const ctx = context || { userId };
    return this.executeWithContext('hasPermission', ctx, async () => {
      const userPermissions = await this.getUserPermissions(userId, ctx);

      // Check for global permissions (site admin)
      const hasGlobalPermission = userPermissions.some(p =>
        p.action === '*' || p.action === permission
      );

      if (hasGlobalPermission) {
        return true;
      }

      // Check for specific resource permissions
      return userPermissions.some(p =>
        p.action === permission &&
        (!resourceId || p.organizationId === resourceId || p.teamId === resourceId)
      );
    });
  }

  /**
   * Update user role in organization
   */
  async updateUserRole(
    userId: string,
    role: string,
    organizationId: string,
    context: ServiceContext
  ): Promise<void> {
    return this.executeWithContext('updateUserRole', context, async () => {
      this.validatePermissions(context, { requireAuth: true });

      // Only site admins and org admins can update roles
      const hasPermission = context.isSiteAdmin ||
        await this.hasPermission(context.userId!, 'manage_users', organizationId, context);

      if (!hasPermission) {
        throw new Error('Insufficient permissions to update user roles');
      }

      await this.storage.updateUserOrganizationRole(userId, organizationId, role);

      this.logger.info('User role updated', { userId, role, organizationId });
    });
  }

  /**
   * Check account lockout status
   */
  async checkAccountLockout(userId: string, context: ServiceContext): Promise<LockoutStatus> {
    return this.executeWithContext('checkAccountLockout', context, async () => {
      // TODO: Implement user lockout storage
      // For now, return default unlocked status
      this.logger.warn('Account lockout check using simplified implementation');

      return {
        isLocked: false,
        failedAttempts: 0,
        maxAttempts: this.MAX_FAILED_ATTEMPTS
      };
    });
  }

  /**
   * Record failed login attempt
   */
  async recordFailedLogin(userId: string, ipAddress: string, context: ServiceContext): Promise<void> {
    return this.executeWithContext('recordFailedLogin', context, async () => {
      // TODO: Implement user lockout storage
      // For now, just log the failed attempt
      this.logger.warn('Failed login recorded (simplified implementation)', { userId, ipAddress });
    });
  }

  /**
   * Record successful login
   */
  async recordSuccessfulLogin(userId: string, ipAddress: string, context: ServiceContext): Promise<void> {
    return this.executeWithContext('recordSuccessfulLogin', context, async () => {
      // Clear any lockout data
      // TODO: Implement user lockout storage
      // await this.storage.clearUserLockout(userId);

      // Update last login
      await this.storage.updateUser(userId, { lastLoginAt: new Date() });

      this.logger.info('Successful login recorded', { userId });
    });
  }

  // Private helper methods

  private sanitizeUserForResponse(user: User): SafeUser {
    if (!user.id) {
      throw new Error('User must have an ID');
    }
    const { password, mfaSecret, backupCodes, ...sanitizedUser } = user;
    return {
      ...sanitizedUser,
      id: user.id
    } as SafeUser;
  }

  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
  }

  private generateMFASecret(): string {
    // Generate base32 secret for TOTP
    return Math.random().toString(36).substr(2, 32).toUpperCase();
  }

  private generateQRCode(email: string, secret: string): string {
    // Generate QR code URL for authenticator apps
    const issuer = 'AthleteMetrics';
    return `otpauth://totp/${issuer}:${email}?secret=${secret}&issuer=${issuer}`;
  }

  private generateBackupCode(): string {
    return Math.random().toString(36).substr(2, 8).toUpperCase();
  }

  private generateMFAChallenge(userId: string): string {
    return `mfa_${userId}_${Date.now()}`;
  }

  private verifyTOTPToken(secret: string, token: string): boolean {
    // Implement TOTP verification
    // This would use a library like 'otplib' in a real implementation
    return token.length === 6 && /^\d+$/.test(token);
  }

  private validatePasswordStrength(password: string): void {
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      throw new Error('Password must contain at least one uppercase letter, lowercase letter, and number');
    }
  }

  private generateSecureToken(): string {
    return `reset_${Date.now()}_${Math.random().toString(36).substr(2, 32)}`;
  }

  private async invalidateUserSessions(userId: string, excludeSessionId?: string): Promise<void> {
    // TODO: Implement session storage
    // await this.storage.deleteUserSessions(userId, excludeSessionId);
  }

  private createGlobalPermission(action: string, resource: string): Permission {
    return {
      id: `global_${action}_${resource}`,
      name: `Global ${action} on ${resource}`,
      resource,
      action
    };
  }

  private getRolePermissions(role: string, organizationId: string): Permission[] {
    const permissions: Permission[] = [];

    switch (role) {
      case 'org_admin':
        permissions.push(
          this.createOrgPermission('manage_users', organizationId),
          this.createOrgPermission('manage_teams', organizationId),
          this.createOrgPermission('view_analytics', organizationId),
          this.createOrgPermission('manage_settings', organizationId)
        );
        break;
      case 'coach':
        permissions.push(
          this.createOrgPermission('view_athletes', organizationId),
          this.createOrgPermission('manage_measurements', organizationId),
          this.createOrgPermission('view_analytics', organizationId)
        );
        break;
      case 'athlete':
        permissions.push(
          this.createOrgPermission('view_own_data', organizationId)
        );
        break;
    }

    return permissions;
  }

  private createOrgPermission(action: string, organizationId: string): Permission {
    return {
      id: `org_${organizationId}_${action}`,
      name: `${action} in organization`,
      resource: 'organization',
      action,
      organizationId
    };
  }
}