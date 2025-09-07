import { storage } from '../storage';
import { CreateSecurityEvent } from '@shared/enhanced-auth-schema';
import crypto from 'crypto';
import { authenticator } from 'otplib';

export class AuthSecurity {
  private static readonly MAX_LOGIN_ATTEMPTS = 5;
  private static readonly LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
  private static readonly SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
  private static readonly REMEMBER_ME_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

  /**
   * Check if account is locked due to failed login attempts
   */
  static async checkAccountLock(email: string): Promise<{ isLocked: boolean; lockUntil?: Date }> {
    const user = await storage.getUserByEmail(email);
    if (!user) return { isLocked: false };

    if (user.lockedUntil && new Date() < new Date(user.lockedUntil)) {
      return { isLocked: true, lockUntil: new Date(user.lockedUntil) };
    }

    // Reset lock if expired
    if (user.lockedUntil && new Date() >= new Date(user.lockedUntil)) {
      await storage.resetLoginAttempts(user.id);
    }

    return { isLocked: false };
  }

  /**
   * Record failed login attempt and lock account if necessary
   */
  static async recordFailedLogin(
    email: string, 
    ipAddress: string, 
    userAgent?: string
  ): Promise<void> {
    const user = await storage.getUserByEmail(email);
    
    // Log security event even if user doesn't exist (to track brute force attempts)
    await this.logSecurityEvent({
      userId: user?.id || null,
      eventType: 'login_failed',
      eventData: JSON.stringify({ email, reason: user ? 'invalid_credentials' : 'user_not_found' }),
      ipAddress,
      userAgent,
      severity: 'warning',
    });

    if (!user) return;

    const attempts = (user.loginAttempts || 0) + 1;
    
    if (attempts >= this.MAX_LOGIN_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + this.LOCKOUT_DURATION);
      await storage.lockAccount(user.id, lockedUntil);
      
      await this.logSecurityEvent({
        userId: user.id,
        eventType: 'login_locked',
        eventData: JSON.stringify({ attempts, lockedUntil }),
        ipAddress,
        userAgent,
        severity: 'critical',
      });
    } else {
      await storage.incrementLoginAttempts(user.id, attempts);
    }
  }

  /**
   * Record successful login and reset failed attempts
   */
  static async recordSuccessfulLogin(
    userId: string, 
    ipAddress: string, 
    userAgent?: string
  ): Promise<void> {
    await storage.resetLoginAttempts(userId);
    await storage.updateLastLogin(userId);
    
    await this.logSecurityEvent({
      userId,
      eventType: 'login_success',
      eventData: JSON.stringify({ ipAddress, userAgent }),
      ipAddress,
      userAgent,
      severity: 'info',
    });
  }

  /**
   * Generate secure session token
   */
  static generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate secure random token for password resets, email verification, etc.
   */
  static generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create login session with proper expiration
   */
  static async createLoginSession(
    userId: string,
    ipAddress: string,
    userAgent?: string,
    rememberMe: boolean = false
  ): Promise<string> {
    const sessionToken = this.generateSessionToken();
    const duration = rememberMe ? this.REMEMBER_ME_DURATION : this.SESSION_DURATION;
    const expiresAt = new Date(Date.now() + duration);

    await storage.createLoginSession({
      userId,
      sessionToken,
      ipAddress,
      userAgent,
      expiresAt,
    });

    return sessionToken;
  }

  /**
   * Validate and refresh session
   */
  static async validateSession(sessionToken: string, ipAddress: string): Promise<{ valid: boolean; userId?: string; suspicious?: boolean }> {
    const session = await storage.findLoginSession(sessionToken);
    
    if (!session || session.isActive === 'false' || new Date() > new Date(session.expiresAt)) {
      return { valid: false };
    }

    // Check for suspicious activity (IP change)
    const suspicious = session.ipAddress !== ipAddress;
    
    if (suspicious) {
      await this.logSecurityEvent({
        userId: session.userId,
        eventType: 'suspicious_activity',
        eventData: JSON.stringify({ 
          originalIp: session.ipAddress, 
          newIp: ipAddress,
          sessionId: session.id 
        }),
        ipAddress,
        severity: 'warning',
      });
    }

    // Update last activity
    await storage.updateSessionActivity(session.id);

    return { valid: true, userId: session.userId, suspicious };
  }

  /**
   * Revoke session
   */
  static async revokeSession(sessionToken: string): Promise<void> {
    await storage.revokeLoginSession(sessionToken);
  }

  /**
   * Revoke all sessions for a user
   */
  static async revokeAllSessions(userId: string): Promise<void> {
    await storage.revokeAllUserSessions(userId);
  }

  /**
   * Generate MFA secret for TOTP
   */
  static generateMFASecret(): string {
    return authenticator.generateSecret();
  }

  /**
   * Verify MFA token
   */
  static verifyMFAToken(secret: string, token: string): boolean {
    try {
      return authenticator.verify({ token, secret });
    } catch (error) {
      console.error('MFA verification error:', error);
      return false;
    }
  }

  /**
   * Generate backup codes for MFA recovery
   */
  static generateBackupCodes(count: number = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      // Generate 8-character alphanumeric codes
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(code);
    }
    return codes;
  }

  /**
   * Verify backup code
   */
  static async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    const user = await storage.getUser(userId);
    if (!user || !user.backupCodes) return false;

    const codeIndex = user.backupCodes.indexOf(code.toUpperCase());
    if (codeIndex === -1) return false;

    // Remove used backup code
    const updatedCodes = user.backupCodes.filter((_, index) => index !== codeIndex);
    await storage.updateUserBackupCodes(userId, updatedCodes);

    await this.logSecurityEvent({
      userId,
      eventType: 'login_success',
      eventData: JSON.stringify({ method: 'backup_code' }),
      ipAddress: '0.0.0.0', // Will be updated by caller
      severity: 'info',
    });

    return true;
  }

  /**
   * Log security event
   */
  static async logSecurityEvent(event: Omit<CreateSecurityEvent, 'createdAt'>): Promise<void> {
    try {
      await storage.createSecurityEvent(event);
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  /**
   * Get user's recent security events
   */
  static async getUserSecurityEvents(userId: string, limit: number = 50): Promise<any[]> {
    return await storage.getUserSecurityEvents(userId, limit);
  }

  /**
   * Detect potential brute force attacks
   */
  static async detectBruteForce(ipAddress: string, timeWindow: number = 60000): Promise<boolean> {
    const events = await storage.getSecurityEventsByIP(ipAddress, timeWindow);
    const failedLogins = events.filter(event => event.eventType === 'login_failed');
    
    return failedLogins.length >= 10; // 10 failed attempts from same IP in time window
  }

  /**
   * Check if email change is allowed
   */
  static async canChangeEmail(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const recentChanges = await storage.getRecentEmailChanges(userId, 24 * 60 * 60 * 1000); // 24 hours
    
    if (recentChanges.length > 0) {
      return { 
        allowed: false, 
        reason: 'Email was recently changed. Please wait 24 hours before changing again.' 
      };
    }

    return { allowed: true };
  }

  /**
   * Rate limit password reset requests
   */
  static async checkPasswordResetRateLimit(email: string): Promise<{ allowed: boolean; reason?: string }> {
    const recentResets = await storage.getRecentPasswordResets(email, 60 * 60 * 1000); // 1 hour
    
    if (recentResets.length >= 3) {
      return { 
        allowed: false, 
        reason: 'Too many password reset requests. Please wait an hour before trying again.' 
      };
    }

    return { allowed: true };
  }
}