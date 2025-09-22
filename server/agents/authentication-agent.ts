/**
 * Authentication Agent - Handles user authentication, sessions, and MFA
 */

import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { authenticator } from 'otplib';
import { AbstractBaseAgent } from '@shared/agents/base-agent';
import { AuthenticationAgent, AuthSession, MFASetup } from '@shared/agents/contracts';
import { AgentContext, AgentResult, AgentHealth } from '@shared/agents/types';
import { getDatabaseAgent } from './database-agent';
import { getSecurityAgent } from './security-agent';

export class AuthenticationAgentImpl extends AbstractBaseAgent implements AuthenticationAgent {
  private databaseAgent: any;
  private securityAgent: any;
  private sessions: Map<string, SessionData> = new Map();
  private mfaSecrets: Map<string, string> = new Map();
  private passwordResetTokens: Map<string, ResetTokenData> = new Map();

  constructor() {
    super('AuthenticationAgent', '1.0.0', ['DatabaseAgent', 'SecurityAgent'], {
      enabled: true,
      logLevel: 'info',
      timeout: 10000,
      retries: 2,
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        resetTimeout: 30000
      }
    });
  }

  protected async onInitialize(): Promise<void> {
    this.databaseAgent = getDatabaseAgent();
    this.securityAgent = getSecurityAgent();

    // Initialize dependencies
    await this.databaseAgent.initialize();
    await this.securityAgent.initialize();

    // Start cleanup timer for expired sessions and tokens
    this.startCleanupTimer();

    this.log('info', 'Authentication agent initialized successfully');
  }

  protected async onShutdown(): Promise<void> {
    // Clear all caches
    this.sessions.clear();
    this.mfaSecrets.clear();
    this.passwordResetTokens.clear();

    this.log('info', 'Authentication agent shut down successfully');
  }

  protected async onHealthCheck(): Promise<AgentHealth> {
    try {
      // Check dependencies
      const dbHealth = await this.databaseAgent.healthCheck();
      const securityHealth = await this.securityAgent.healthCheck();

      if (dbHealth.status !== 'healthy' || securityHealth.status !== 'healthy') {
        return {
          status: 'degraded',
          message: 'One or more dependencies are unhealthy',
          lastCheck: new Date(),
          dependencies: {
            database: dbHealth,
            security: securityHealth
          }
        };
      }

      // Test basic authentication functionality
      const testResult = await this.testAuthenticationFlow();

      return {
        status: testResult ? 'healthy' : 'degraded',
        message: testResult ? 'Authentication agent is functioning properly' : 'Authentication flow test failed',
        lastCheck: new Date(),
        dependencies: {
          database: dbHealth,
          security: securityHealth
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Authentication agent health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lastCheck: new Date()
      };
    }
  }

  async login(email: string, password: string, context?: AgentContext): Promise<AgentResult<AuthSession>> {
    try {
      this.validateRequired({ email, password }, ['email', 'password']);

      this.log('info', 'User login attempt', { email, context: context?.requestId });

      // Sanitize inputs
      const sanitizedEmailResult = await this.securityAgent.sanitizeInput(email, { allowedChars: 'email' }, context);
      if (!sanitizedEmailResult.success) {
        return this.createErrorResult('Failed to sanitize email input', 'SANITIZATION_FAILED');
      }

      const sanitizedEmail = sanitizedEmailResult.data;
      if (!sanitizedEmail) {
        return this.createErrorResult('Invalid email format', 'INVALID_EMAIL');
      }

      // Check rate limiting
      const rateLimitKey = `login:${sanitizedEmail}:${context?.requestId || 'unknown'}`;
      const rateLimitResult = await this.securityAgent.checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000, context);

      if (!rateLimitResult.success || !rateLimitResult.data) {
        return this.createErrorResult('Too many login attempts. Please try again later.', 'RATE_LIMITED');
      }

      // Get user from database
      const userQuery = `
        SELECT id, username, first_name, last_name, emails, password, is_active, is_site_admin, mfa_enabled, mfa_secret
        FROM users
        WHERE $1 = ANY(emails) OR username = $1
      `;

      const userResult = await this.databaseAgent.queryOne(userQuery, [sanitizedEmail], context);

      if (!userResult.success || !userResult.data) {
        this.log('warn', 'Login attempt with invalid email', { email: sanitizedEmail });
        return this.createErrorResult('Invalid credentials', 'INVALID_CREDENTIALS');
      }

      const user = userResult.data;

      // Check if user is active
      if (user.is_active === 'false') {
        this.log('warn', 'Login attempt with inactive account', { email: sanitizedEmail, userId: user.id });
        return this.createErrorResult('Account is deactivated', 'ACCOUNT_INACTIVE');
      }

      // Handle invitation pending state
      if (user.password === 'INVITATION_PENDING') {
        return this.createErrorResult('Please complete your registration first', 'REGISTRATION_PENDING');
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        this.log('warn', 'Login attempt with invalid password', { email: sanitizedEmail, userId: user.id });
        return this.createErrorResult('Invalid credentials', 'INVALID_CREDENTIALS');
      }

      // Check if MFA is required
      if (user.mfa_enabled && user.mfa_secret) {
        // For MFA users, return a special session that requires MFA verification
        const mfaSession = this.createMFASession(user, context);
        return this.createSuccessResult(mfaSession);
      }

      // Create full session
      const session = await this.createFullSession(user, context);

      this.log('info', 'User logged in successfully', {
        email: sanitizedEmail,
        userId: user.id,
        sessionId: session.sessionId
      });

      return this.createSuccessResult(session);
    } catch (error) {
      this.log('error', 'Login failed', {
        email,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'LOGIN_FAILED');
    }
  }

  async logout(sessionId: string, context?: AgentContext): Promise<AgentResult<void>> {
    try {
      this.validateRequired({ sessionId }, ['sessionId']);

      this.log('info', 'User logout', { sessionId, context: context?.requestId });

      // Remove session from cache
      const sessionData = this.sessions.get(sessionId);
      if (sessionData) {
        this.sessions.delete(sessionId);
        this.log('info', 'Session removed', { sessionId, userId: sessionData.userId });
      }

      return this.createSuccessResult(undefined);
    } catch (error) {
      this.log('error', 'Logout failed', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'LOGOUT_FAILED');
    }
  }

  async validateSession(sessionId: string, context?: AgentContext): Promise<AgentResult<AuthSession>> {
    try {
      this.validateRequired({ sessionId }, ['sessionId']);

      const sessionData = this.sessions.get(sessionId);

      if (!sessionData) {
        return this.createErrorResult('Session not found', 'SESSION_NOT_FOUND');
      }

      if (sessionData.expiresAt <= new Date()) {
        this.sessions.delete(sessionId);
        return this.createErrorResult('Session expired', 'SESSION_EXPIRED');
      }

      // Verify user is still active
      const userQuery = `SELECT id, is_active FROM users WHERE id = $1`;
      const userResult = await this.databaseAgent.queryOne(userQuery, [sessionData.userId], context);

      if (!userResult.success || !userResult.data || userResult.data.is_active === 'false') {
        this.sessions.delete(sessionId);
        return this.createErrorResult('User account is inactive', 'USER_INACTIVE');
      }

      // Convert session data to AuthSession
      const authSession: AuthSession = {
        sessionId,
        userId: sessionData.userId,
        email: sessionData.email,
        role: sessionData.role,
        organizationId: sessionData.organizationId,
        permissions: sessionData.permissions,
        expiresAt: sessionData.expiresAt,
        mfaVerified: sessionData.mfaVerified
      };

      return this.createSuccessResult(authSession);
    } catch (error) {
      this.log('error', 'Session validation failed', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'SESSION_VALIDATION_FAILED');
    }
  }

  async refreshSession(sessionId: string, context?: AgentContext): Promise<AgentResult<AuthSession>> {
    try {
      const sessionResult = await this.validateSession(sessionId, context);

      if (!sessionResult.success) {
        return sessionResult;
      }

      const sessionData = this.sessions.get(sessionId);
      if (!sessionData) {
        return this.createErrorResult('Session not found', 'SESSION_NOT_FOUND');
      }

      // Extend session expiry
      sessionData.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      const authSession: AuthSession = {
        sessionId,
        userId: sessionData.userId,
        email: sessionData.email,
        role: sessionData.role,
        organizationId: sessionData.organizationId,
        permissions: sessionData.permissions,
        expiresAt: sessionData.expiresAt,
        mfaVerified: sessionData.mfaVerified
      };

      this.log('debug', 'Session refreshed', { sessionId, userId: sessionData.userId });

      return this.createSuccessResult(authSession);
    } catch (error) {
      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'SESSION_REFRESH_FAILED');
    }
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
    context?: AgentContext
  ): Promise<AgentResult<void>> {
    try {
      this.validateRequired({ userId, oldPassword, newPassword }, ['userId', 'oldPassword', 'newPassword']);

      this.log('info', 'Password change request', { userId, context: context?.requestId });

      // Get user
      const userQuery = `SELECT id, password FROM users WHERE id = $1`;
      const userResult = await this.databaseAgent.queryOne(userQuery, [userId], context);

      if (!userResult.success || !userResult.data) {
        return this.createErrorResult('User not found', 'USER_NOT_FOUND');
      }

      const user = userResult.data;

      // Verify old password
      const isValidOldPassword = await bcrypt.compare(oldPassword, user.password);
      if (!isValidOldPassword) {
        this.log('warn', 'Password change attempt with invalid old password', { userId });
        return this.createErrorResult('Current password is incorrect', 'INVALID_OLD_PASSWORD');
      }

      // Validate new password strength
      const passwordValidation = this.validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        return this.createErrorResult(passwordValidation.message, 'WEAK_PASSWORD');
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      // Update password in database
      const updateQuery = `UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2`;
      const updateResult = await this.databaseAgent.query(updateQuery, [hashedPassword, userId], context);

      if (!updateResult.success) {
        return this.createErrorResult('Failed to update password', 'PASSWORD_UPDATE_FAILED');
      }

      this.log('info', 'Password changed successfully', { userId });

      return this.createSuccessResult(undefined);
    } catch (error) {
      this.log('error', 'Password change failed', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'PASSWORD_CHANGE_FAILED');
    }
  }

  async resetPassword(email: string, context?: AgentContext): Promise<AgentResult<void>> {
    try {
      this.validateRequired({ email }, ['email']);

      this.log('info', 'Password reset request', { email, context: context?.requestId });

      // Sanitize email
      const sanitizedEmailResult = await this.securityAgent.sanitizeInput(email, { allowedChars: 'email' }, context);
      if (!sanitizedEmailResult.success || !sanitizedEmailResult.data) {
        return this.createErrorResult('Invalid email format', 'INVALID_EMAIL');
      }

      const sanitizedEmail = sanitizedEmailResult.data;

      // Check rate limiting for password reset
      const rateLimitKey = `reset:${sanitizedEmail}`;
      const rateLimitResult = await this.securityAgent.checkRateLimit(rateLimitKey, 3, 60 * 60 * 1000, context); // 3 per hour

      if (!rateLimitResult.success || !rateLimitResult.data) {
        return this.createErrorResult('Too many password reset attempts. Please try again later.', 'RATE_LIMITED');
      }

      // Check if user exists
      const userQuery = `SELECT id, first_name, last_name FROM users WHERE $1 = ANY(emails) AND is_active = 'true'`;
      const userResult = await this.databaseAgent.queryOne(userQuery, [sanitizedEmail], context);

      if (!userResult.success || !userResult.data) {
        // Don't reveal whether email exists - always return success
        this.log('warn', 'Password reset attempt for non-existent email', { email: sanitizedEmail });
        return this.createSuccessResult(undefined);
      }

      const user = userResult.data;

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenData: ResetTokenData = {
        userId: user.id,
        email: sanitizedEmail,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        createdAt: new Date()
      };

      this.passwordResetTokens.set(resetToken, resetTokenData);

      // TODO: Send email with reset link
      // In a real implementation, you would send an email here
      this.log('info', 'Password reset token generated', {
        userId: user.id,
        email: sanitizedEmail,
        // Log token only in development
        ...(process.env.NODE_ENV === 'development' && { resetToken })
      });

      return this.createSuccessResult(undefined);
    } catch (error) {
      this.log('error', 'Password reset failed', {
        email,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'PASSWORD_RESET_FAILED');
    }
  }

  async confirmPasswordReset(token: string, newPassword: string, context?: AgentContext): Promise<AgentResult<void>> {
    try {
      this.validateRequired({ token, newPassword }, ['token', 'newPassword']);

      this.log('info', 'Password reset confirmation', { token: token.substring(0, 8), context: context?.requestId });

      // Get reset token data
      const resetData = this.passwordResetTokens.get(token);
      if (!resetData) {
        return this.createErrorResult('Invalid or expired reset token', 'INVALID_RESET_TOKEN');
      }

      if (resetData.expiresAt <= new Date()) {
        this.passwordResetTokens.delete(token);
        return this.createErrorResult('Reset token has expired', 'EXPIRED_RESET_TOKEN');
      }

      // Validate new password strength
      const passwordValidation = this.validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        return this.createErrorResult(passwordValidation.message, 'WEAK_PASSWORD');
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      // Update password in database
      const updateQuery = `UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2`;
      const updateResult = await this.databaseAgent.query(updateQuery, [hashedPassword, resetData.userId], context);

      if (!updateResult.success) {
        return this.createErrorResult('Failed to update password', 'PASSWORD_UPDATE_FAILED');
      }

      // Remove reset token
      this.passwordResetTokens.delete(token);

      // Invalidate all sessions for this user
      for (const [sessionId, sessionData] of this.sessions.entries()) {
        if (sessionData.userId === resetData.userId) {
          this.sessions.delete(sessionId);
        }
      }

      this.log('info', 'Password reset completed successfully', { userId: resetData.userId });

      return this.createSuccessResult(undefined);
    } catch (error) {
      this.log('error', 'Password reset confirmation failed', {
        token: token.substring(0, 8),
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'PASSWORD_RESET_CONFIRMATION_FAILED');
    }
  }

  async enableMFA(userId: string, context?: AgentContext): Promise<AgentResult<MFASetup>> {
    try {
      this.validateRequired({ userId }, ['userId']);

      this.log('info', 'MFA enablement request', { userId, context: context?.requestId });

      // Get user info for MFA setup
      const userQuery = `SELECT id, username, emails FROM users WHERE id = $1 AND is_active = 'true'`;
      const userResult = await this.databaseAgent.queryOne(userQuery, [userId], context);

      if (!userResult.success || !userResult.data) {
        return this.createErrorResult('User not found', 'USER_NOT_FOUND');
      }

      const user = userResult.data;

      // Generate MFA secret
      const secret = authenticator.generateSecret();
      const appName = 'AthleteMetrics';
      const accountName = user.emails?.[0] || user.username;

      // Generate QR code (simple fallback for now)
      const otpauth = authenticator.keyuri(accountName, appName, secret);
      const qrCode = `data:text/plain;base64,${Buffer.from(otpauth).toString('base64')}`;

      // Generate backup codes
      const backupCodes = Array.from({ length: 10 }, () =>
        crypto.randomBytes(4).toString('hex').toUpperCase()
      );

      // Store secret temporarily (will be saved to DB when user confirms)
      this.mfaSecrets.set(userId, secret);

      const mfaSetup: MFASetup = {
        secret,
        qrCode,
        backupCodes
      };

      this.log('info', 'MFA setup generated', { userId });

      return this.createSuccessResult(mfaSetup);
    } catch (error) {
      this.log('error', 'MFA enablement failed', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'MFA_ENABLEMENT_FAILED');
    }
  }

  async verifyMFA(userId: string, code: string, context?: AgentContext): Promise<AgentResult<boolean>> {
    try {
      this.validateRequired({ userId, code }, ['userId', 'code']);

      this.log('debug', 'MFA verification attempt', { userId, context: context?.requestId });

      // Get user's MFA secret
      let secret = this.mfaSecrets.get(userId);

      if (!secret) {
        // Try to get from database
        const userQuery = `SELECT mfa_secret FROM users WHERE id = $1 AND mfa_enabled = true`;
        const userResult = await this.databaseAgent.queryOne(userQuery, [userId], context);

        if (!userResult.success || !userResult.data?.mfa_secret) {
          return this.createErrorResult('MFA not enabled for user', 'MFA_NOT_ENABLED');
        }

        secret = userResult.data.mfa_secret;
      }

      // Verify the code
      if (!secret) {
        return this.createErrorResult('MFA secret not found', 'MFA_SECRET_MISSING');
      }

      const isValid = authenticator.verify({ token: code, secret });

      if (isValid) {
        this.log('info', 'MFA verification successful', { userId });

        // If this was setup verification, save to database
        if (this.mfaSecrets.has(userId)) {
          const updateQuery = `UPDATE users SET mfa_enabled = true, mfa_secret = $1, updated_at = NOW() WHERE id = $2`;
          await this.databaseAgent.query(updateQuery, [secret, userId], context);
          this.mfaSecrets.delete(userId);
        }
      } else {
        this.log('warn', 'MFA verification failed', { userId });
      }

      return this.createSuccessResult(isValid);
    } catch (error) {
      this.log('error', 'MFA verification failed', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return this.createErrorResult(error instanceof Error ? error : new Error(String(error)), 'MFA_VERIFICATION_FAILED');
    }
  }

  // Private helper methods

  private createMFASession(user: any, context?: AgentContext): AuthSession {
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes for MFA

    const sessionData: SessionData = {
      userId: user.id,
      email: user.emails?.[0] || user.username,
      role: 'pending_mfa',
      permissions: [],
      expiresAt,
      mfaVerified: false,
      isMFASession: true
    };

    this.sessions.set(sessionId, sessionData);

    return {
      sessionId,
      userId: user.id,
      email: sessionData.email,
      role: 'pending_mfa',
      permissions: [],
      expiresAt,
      mfaVerified: false
    };
  }

  private async createFullSession(user: any, context?: AgentContext): Promise<AuthSession> {
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Get user's role and organization context
    const roleContext = await this.determineUserRoleAndContext(user.id, context);

    const sessionData: SessionData = {
      userId: user.id,
      email: user.emails?.[0] || user.username,
      role: roleContext.role,
      organizationId: roleContext.organizationId,
      permissions: roleContext.permissions,
      expiresAt,
      mfaVerified: true
    };

    this.sessions.set(sessionId, sessionData);

    return {
      sessionId,
      userId: user.id,
      email: sessionData.email,
      role: sessionData.role,
      organizationId: sessionData.organizationId,
      permissions: sessionData.permissions,
      expiresAt,
      mfaVerified: true
    };
  }

  private async determineUserRoleAndContext(userId: string, context?: AgentContext): Promise<RoleContext> {
    try {
      // Get user's site admin status
      const userQuery = `SELECT is_site_admin FROM users WHERE id = $1`;
      const userResult = await this.databaseAgent.queryOne(userQuery, [userId], context);

      if (userResult.success && userResult.data?.is_site_admin === 'true') {
        return {
          role: 'site_admin',
          permissions: ['*'],
          organizationId: undefined
        };
      }

      // Get user's organization memberships
      const orgQuery = `
        SELECT organization_id, role
        FROM organization_members
        WHERE user_id = $1 AND is_active = true
        ORDER BY created_at ASC
      `;

      const orgResult = await this.databaseAgent.query(orgQuery, [userId], context);

      if (!orgResult.success || !orgResult.data || orgResult.data.length === 0) {
        return {
          role: 'athlete',
          permissions: ['read:own_profile', 'update:own_profile'],
          organizationId: undefined
        };
      }

      // Use the first organization as primary
      const primaryOrg = orgResult.data[0];
      const permissions = this.getRolePermissions(primaryOrg.role);

      return {
        role: primaryOrg.role,
        permissions,
        organizationId: primaryOrg.organization_id
      };
    } catch (error) {
      this.log('error', 'Failed to determine user role and context', { userId, error });

      return {
        role: 'athlete',
        permissions: ['read:own_profile', 'update:own_profile'],
        organizationId: undefined
      };
    }
  }

  private getRolePermissions(role: string): string[] {
    const rolePermissions: Record<string, string[]> = {
      site_admin: ['*'],
      org_admin: ['read:*', 'create:*', 'update:*', 'delete:users', 'delete:athletes'],
      coach: ['read:*', 'create:athletes', 'update:athletes', 'create:measurements', 'update:measurements'],
      athlete: ['read:own_profile', 'update:own_profile', 'read:own_measurements']
    };

    return rolePermissions[role] || rolePermissions.athlete;
  }

  private validatePasswordStrength(password: string): { isValid: boolean; message: string } {
    if (password.length < 8) {
      return { isValid: false, message: 'Password must be at least 8 characters long' };
    }

    if (!/(?=.*[a-z])/.test(password)) {
      return { isValid: false, message: 'Password must contain at least one lowercase letter' };
    }

    if (!/(?=.*[A-Z])/.test(password)) {
      return { isValid: false, message: 'Password must contain at least one uppercase letter' };
    }

    if (!/(?=.*\d)/.test(password)) {
      return { isValid: false, message: 'Password must contain at least one number' };
    }

    if (!/(?=.*[!@#$%^&*(),.?":{}|<>])/.test(password)) {
      return { isValid: false, message: 'Password must contain at least one special character' };
    }

    return { isValid: true, message: 'Password is strong' };
  }

  private async testAuthenticationFlow(): Promise<boolean> {
    try {
      // Test basic sanitization
      const testEmail = 'test@example.com';
      const sanitizeResult = await this.securityAgent.sanitizeInput(testEmail, { allowedChars: 'email' });

      return sanitizeResult.success && sanitizeResult.data === testEmail;
    } catch (error) {
      this.log('error', 'Authentication flow test failed', { error });
      return false;
    }
  }

  private startCleanupTimer(): void {
    // Clean up expired sessions and tokens every 5 minutes
    setInterval(() => {
      const now = new Date();

      // Clean expired sessions
      for (const [sessionId, sessionData] of this.sessions.entries()) {
        if (sessionData.expiresAt <= now) {
          this.sessions.delete(sessionId);
        }
      }

      // Clean expired reset tokens
      for (const [token, resetData] of this.passwordResetTokens.entries()) {
        if (resetData.expiresAt <= now) {
          this.passwordResetTokens.delete(token);
        }
      }

      // Clean unused MFA secrets (older than 1 hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      // Note: In a production system, you'd want to track creation time of MFA secrets

      this.log('debug', 'Cleanup completed', {
        activeSessions: this.sessions.size,
        pendingResets: this.passwordResetTokens.size,
        pendingMFA: this.mfaSecrets.size
      });
    }, 5 * 60 * 1000);
  }
}

// Type definitions
interface SessionData {
  userId: string;
  email: string;
  role: string;
  organizationId?: string;
  permissions: string[];
  expiresAt: Date;
  mfaVerified: boolean;
  isMFASession?: boolean;
}

interface ResetTokenData {
  userId: string;
  email: string;
  expiresAt: Date;
  createdAt: Date;
}

interface RoleContext {
  role: string;
  permissions: string[];
  organizationId?: string;
}

// Singleton instance
let authenticationAgentInstance: AuthenticationAgentImpl | null = null;

export function getAuthenticationAgent(): AuthenticationAgentImpl {
  if (!authenticationAgentInstance) {
    authenticationAgentInstance = new AuthenticationAgentImpl();
  }
  return authenticationAgentInstance;
}