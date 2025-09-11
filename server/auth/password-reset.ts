import crypto from 'crypto';
import { storage } from '../storage';
import { AuthSecurity } from './security';
import { passwordSchema } from '@shared/password-validation';
import bcrypt from 'bcrypt';

export class PasswordResetService {
  private static readonly RESET_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour
  private static readonly EMAIL_VERIFICATION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Request password reset
   */
  static async requestPasswordReset(
    email: string, 
    ipAddress: string, 
    userAgent?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Check rate limiting
      const rateLimitCheck = await AuthSecurity.checkPasswordResetRateLimit(email);
      if (!rateLimitCheck.allowed) {
        return { success: false, message: rateLimitCheck.reason! };
      }

      const user = await storage.getUserByEmail(email);
      
      // Always return success to prevent email enumeration
      if (!user) {
        // Log suspicious activity
        await AuthSecurity.logSecurityEvent({
          userId: null,
          eventType: 'suspicious_activity',
          eventData: JSON.stringify({ 
            action: 'password_reset_unknown_email', 
            email,
            reason: 'Email not found in system'
          }),
          ipAddress,
          userAgent,
          severity: 'warning',
        });
        
        return { 
          success: true, 
          message: 'If an account with that email exists, a password reset link has been sent.' 
        };
      }

      // Generate secure reset token
      const token = AuthSecurity.generateSecureToken();
      const expiresAt = new Date(Date.now() + this.RESET_TOKEN_EXPIRY);

      // Store reset token
      await storage.createPasswordResetToken({
        userId: user.id,
        token,
        expiresAt,
        ipAddress,
        userAgent,
      });

      // Log password reset request
      await AuthSecurity.logSecurityEvent({
        userId: user.id,
        eventType: 'password_reset_requested',
        eventData: JSON.stringify({ email, ipAddress }),
        ipAddress,
        userAgent,
        severity: 'info',
      });

      // TODO: Send email with reset link
      // await emailService.sendPasswordReset(user.emails[0], {
      //   resetUrl: `${process.env.BASE_URL}/reset-password?token=${token}`,
      //   firstName: user.firstName,
      //   expiresIn: '1 hour'
      // });

      console.log(`Password reset requested for ${email}. Token: ${token}`);

      return { 
        success: true, 
        message: 'If an account with that email exists, a password reset link has been sent.' 
      };
    } catch (error) {
      console.error('Password reset request error:', error);
      return { success: false, message: 'Failed to process password reset request' };
    }
  }

  /**
   * Validate password reset token
   */
  static async validateResetToken(token: string): Promise<{
    valid: boolean;
    userId?: string;
    expired?: boolean;
    used?: boolean;
  }> {
    try {
      const resetToken = await storage.findPasswordResetToken(token);
      
      if (!resetToken) {
        return { valid: false };
      }

      if (resetToken.isUsed === 'true') {
        return { valid: false, used: true };
      }

      if (new Date() > new Date(resetToken.expiresAt)) {
        return { valid: false, expired: true };
      }

      return { valid: true, userId: resetToken.userId };
    } catch (error) {
      console.error('Token validation error:', error);
      return { valid: false };
    }
  }

  /**
   * Complete password reset
   */
  static async resetPassword(
    token: string, 
    newPassword: string,
    ipAddress: string,
    userAgent?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Validate token
      const tokenValidation = await this.validateResetToken(token);
      if (!tokenValidation.valid) {
        let message = 'Invalid or expired reset token';
        if (tokenValidation.expired) message = 'Reset token has expired. Please request a new one.';
        if (tokenValidation.used) message = 'Reset token has already been used.';
        
        return { success: false, message };
      }

      // Validate new password
      const passwordValidation = passwordSchema.safeParse(newPassword);
      if (!passwordValidation.success) {
        const errors = passwordValidation.error.errors.map(e => e.message).join(', ');
        return { success: false, message: `Password validation failed: ${errors}` };
      }

      const userId = tokenValidation.userId!;
      
      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);
      
      // Update password and mark token as used
      await storage.updateUserPassword(userId, hashedPassword);
      await storage.markPasswordResetTokenUsed(token);
      
      // Update password changed timestamp
      await storage.updatePasswordChangedAt(userId);
      
      // Revoke all existing sessions for security
      await AuthSecurity.revokeAllSessions(userId);
      
      // Log successful password reset
      await AuthSecurity.logSecurityEvent({
        userId,
        eventType: 'password_reset_completed',
        eventData: JSON.stringify({ ipAddress, method: 'reset_token' }),
        ipAddress,
        userAgent,
        severity: 'info',
      });

      return { success: true, message: 'Password has been reset successfully. Please log in with your new password.' };
    } catch (error) {
      console.error('Password reset error:', error);
      return { success: false, message: 'Failed to reset password' };
    }
  }

  /**
   * Request email verification
   */
  static async requestEmailVerification(
    userId: string,
    email: string,
    ipAddress: string,
    userAgent?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Generate verification token
      const token = AuthSecurity.generateSecureToken();
      const expiresAt = new Date(Date.now() + this.EMAIL_VERIFICATION_EXPIRY);

      // Store verification token
      await storage.createEmailVerificationToken({
        userId,
        email,
        token,
        expiresAt,
      });

      // Log verification request
      await AuthSecurity.logSecurityEvent({
        userId,
        eventType: 'login_success', // We'll extend this for email verification
        eventData: JSON.stringify({ 
          action: 'email_verification_requested',
          email,
          ipAddress 
        }),
        ipAddress,
        userAgent,
        severity: 'info',
      });

      // TODO: Send verification email
      // await emailService.sendEmailVerification(email, {
      //   verificationUrl: `${process.env.BASE_URL}/verify-email?token=${token}`,
      //   expiresIn: '24 hours'
      // });

      console.log(`Email verification requested for ${email}. Token: ${token}`);

      return { 
        success: true, 
        message: 'Verification email sent. Please check your inbox.' 
      };
    } catch (error) {
      console.error('Email verification request error:', error);
      return { success: false, message: 'Failed to send verification email' };
    }
  }

  /**
   * Verify email address
   */
  static async verifyEmail(
    token: string,
    ipAddress: string,
    userAgent?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const verificationToken = await storage.findEmailVerificationToken(token);
      
      if (!verificationToken || verificationToken.isUsed === 'true') {
        return { success: false, message: 'Invalid or already used verification token' };
      }

      if (new Date() > new Date(verificationToken.expiresAt)) {
        return { success: false, message: 'Verification token has expired. Please request a new one.' };
      }

      // Mark email as verified
      await storage.markEmailAsVerified(verificationToken.userId, verificationToken.email);
      await storage.markEmailVerificationTokenUsed(token);

      // Log successful verification
      await AuthSecurity.logSecurityEvent({
        userId: verificationToken.userId,
        eventType: 'email_verified',
        eventData: JSON.stringify({ 
          email: verificationToken.email,
          ipAddress 
        }),
        ipAddress,
        userAgent,
        severity: 'info',
      });

      return { success: true, message: 'Email address verified successfully!' };
    } catch (error) {
      console.error('Email verification error:', error);
      return { success: false, message: 'Failed to verify email address' };
    }
  }

  /**
   * Change password (authenticated user)
   */
  static async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ipAddress: string,
    userAgent?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Get user
      const user = await storage.getUser(userId);
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        // Log failed password change attempt
        await AuthSecurity.logSecurityEvent({
          userId,
          eventType: 'login_failed',
          eventData: JSON.stringify({ 
            action: 'password_change_failed',
            reason: 'incorrect_current_password',
            ipAddress 
          }),
          ipAddress,
          userAgent,
          severity: 'warning',
        });
        
        return { success: false, message: 'Current password is incorrect' };
      }

      // Validate new password
      const passwordValidation = passwordSchema.safeParse(newPassword);
      if (!passwordValidation.success) {
        const errors = passwordValidation.error.errors.map(e => e.message).join(', ');
        return { success: false, message: `Password validation failed: ${errors}` };
      }

      // Check if new password is the same as current
      const isSamePassword = await bcrypt.compare(newPassword, user.password);
      if (isSamePassword) {
        return { success: false, message: 'New password must be different from current password' };
      }

      // Hash and update password
      const hashedPassword = await bcrypt.hash(newPassword, 12);
      await storage.updateUserPassword(userId, hashedPassword);
      await storage.updatePasswordChangedAt(userId);

      // Log successful password change
      await AuthSecurity.logSecurityEvent({
        userId,
        eventType: 'password_changed',
        eventData: JSON.stringify({ ipAddress, method: 'user_initiated' }),
        ipAddress,
        userAgent,
        severity: 'info',
      });

      // Optionally revoke all other sessions except current
      // await AuthSecurity.revokeAllSessions(userId);

      return { success: true, message: 'Password changed successfully' };
    } catch (error) {
      console.error('Password change error:', error);
      return { success: false, message: 'Failed to change password' };
    }
  }

  /**
   * Generate temporary password for new users
   */
  static generateTemporaryPassword(length: number = 16): string {
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    // Ensure it meets requirements by adding required character types
    const requiredChars = [
      'ABCDEFGHJKLMNPQRSTUVWXYZ',     // Uppercase
      'abcdefghijkmnpqrstuvwxyz',     // Lowercase  
      '23456789',                     // Numbers
      '!@#$%^&*'                      // Special characters
    ];
    
    // Replace first 4 characters with required types
    for (let i = 0; i < 4; i++) {
      const charSet = requiredChars[i];
      password = password.substring(0, i) + 
                charSet.charAt(Math.floor(Math.random() * charSet.length)) + 
                password.substring(i + 1);
    }
    
    return password;
  }
}