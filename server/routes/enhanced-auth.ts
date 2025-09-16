import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { storage } from '../storage';
import { AuthSecurity } from '../auth/security';
import { PasswordResetService } from '../auth/password-reset';
import { RoleManager } from '../auth/role-manager';
import { z } from 'zod';

const router = Router();

// Enhanced login with MFA support, account lockout, and security logging
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password, mfaToken, rememberMe = false } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress || '0.0.0.0';
    const userAgent = req.get('User-Agent');

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Check for account lockout
    const lockCheck = await AuthSecurity.checkAccountLock(email);
    if (lockCheck.isLocked) {
      return res.status(423).json({
        success: false,
        accountLocked: true,
        lockUntil: lockCheck.lockUntil?.toISOString(),
        message: `Account locked due to multiple failed attempts. Try again after ${lockCheck.lockUntil?.toLocaleTimeString()}.`
      });
    }

    // Find user by email
    const user = await storage.getUserByEmail(email);
    if (!user) {
      await AuthSecurity.recordFailedLogin(email, ipAddress, userAgent);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await AuthSecurity.recordFailedLogin(email, ipAddress, userAgent);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if email verification is required
    if (user.isEmailVerified === 'false') {
      return res.status(403).json({
        success: false,
        requiresEmailVerification: true,
        message: 'Please verify your email address before signing in'
      });
    }

    // Check for MFA requirement
    if (user.mfaEnabled === 'true') {
      if (!mfaToken) {
        return res.status(200).json({
          requiresMFA: true,
          message: 'Multi-factor authentication required'
        });
      }

      // Verify MFA token
      const isMFAValid = user.mfaSecret && AuthSecurity.verifyMFAToken(user.mfaSecret, mfaToken);
      if (!isMFAValid) {
        // Try backup codes
        const isBackupValid = await AuthSecurity.verifyBackupCode(user.id, mfaToken);
        if (!isBackupValid) {
          await AuthSecurity.recordFailedLogin(email, ipAddress, userAgent);
          return res.status(401).json({
            success: false,
            message: 'Invalid authentication code'
          });
        }
      }
    }

    // Successful login - create session and update records
    const sessionToken = await AuthSecurity.createLoginSession(user.id, ipAddress, userAgent, rememberMe);
    await AuthSecurity.recordSuccessfulLogin(user.id, ipAddress, userAgent);

    // Get user's organization data first for session setup
    let userRole = 'guest';
    let primaryOrganizationId: string | undefined;
    
    if (user.isSiteAdmin === 'true') {
      userRole = 'site_admin';
    } else {
      // Try to get organization role and primary org
      const userOrgs = await storage.getUserOrganizations(user.id);
      if (userOrgs.length > 0) {
        userRole = userOrgs[0].role;
        primaryOrganizationId = userOrgs[0].organizationId;
      }
    }

    // Set session cookie
    req.session.sessionToken = sessionToken;
    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.emails?.[0] || '',
      firstName: user.firstName,
      lastName: user.lastName,
      role: userRole,
      emailVerified: user.isEmailVerified === 'true',
      isSiteAdmin: user.isSiteAdmin === 'true',
      primaryOrganizationId: primaryOrganizationId,
      athleteId: userRole === 'athlete' ? user.id : undefined
    };
    
    let redirectUrl = '/dashboard';
    if (userRole === 'site_admin') redirectUrl = '/admin';
    else if (userRole === 'org_admin') redirectUrl = '/organization';
    else if (userRole === 'coach') redirectUrl = '/coaching';
    else if (userRole === 'athlete') redirectUrl = '/athlete';

    return res.status(200).json({
      success: true,
      user: req.session.user,
      redirectUrl,
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Enhanced logout with session revocation
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const sessionToken = req.session?.sessionToken;
    
    if (sessionToken) {
      await AuthSecurity.revokeSession(sessionToken);
    }
    
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destruction error:', err);
      }
    });

    res.clearCookie('connect.sid');
    
    return res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error during logout'
    });
  }
});

// Password reset request
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress || '0.0.0.0';
    const userAgent = req.get('User-Agent');

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const result = await PasswordResetService.requestPasswordReset(email, ipAddress, userAgent);
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('Password reset request error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Validate password reset token
router.post('/validate-reset-token', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        valid: false,
        message: 'Token is required'
      });
    }

    const validation = await PasswordResetService.validateResetToken(token);
    
    return res.status(200).json(validation);
  } catch (error) {
    console.error('Token validation error:', error);
    return res.status(500).json({
      valid: false,
      message: 'Internal server error'
    });
  }
});

// Complete password reset
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress || '0.0.0.0';
    const userAgent = req.get('User-Agent');

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Token and new password are required'
      });
    }

    const result = await PasswordResetService.resetPassword(token, newPassword, ipAddress, userAgent);
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('Password reset error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Change password (authenticated users)
router.post('/change-password', async (req: Request, res: Response) => {
  try {
    const user = req.session?.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const { currentPassword, newPassword } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress || '0.0.0.0';
    const userAgent = req.get('User-Agent');

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    const result = await PasswordResetService.changePassword(
      user.id,
      currentPassword,
      newPassword,
      ipAddress,
      userAgent
    );
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('Password change error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Email verification request
router.post('/request-email-verification', async (req: Request, res: Response) => {
  try {
    const user = req.session?.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const { email } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress || '0.0.0.0';
    const userAgent = req.get('User-Agent');

    const result = await PasswordResetService.requestEmailVerification(
      user.id,
      email || user.email,
      ipAddress,
      userAgent
    );
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('Email verification request error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Verify email address
router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress || '0.0.0.0';
    const userAgent = req.get('User-Agent');

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required'
      });
    }

    const result = await PasswordResetService.verifyEmail(token, ipAddress, userAgent);
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('Email verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get user's security events
router.get('/security-events', async (req: Request, res: Response) => {
  try {
    const user = req.session?.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const events = await AuthSecurity.getUserSecurityEvents(user.id, limit);
    
    return res.status(200).json({
      success: true,
      events
    });
  } catch (error) {
    console.error('Security events error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Role management endpoints
router.post('/assign-role', RoleManager.requirePermission('MANAGE_USERS'), async (req: Request, res: Response) => {
  try {
    const { targetUserId, newRole, organizationId } = req.body;
    const assignerId = req.session?.user?.id;
    const ipAddress = req.ip || req.connection.remoteAddress || '0.0.0.0';

    if (!targetUserId || !newRole) {
      return res.status(400).json({
        success: false,
        error: 'Target user ID and new role are required'
      });
    }

    if (!assignerId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const result = await RoleManager.assignRole(
      assignerId,
      targetUserId,
      newRole,
      organizationId || (req as any).organizationId || '',
      ipAddress
    );
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('Role assignment error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

router.get('/user-permissions/:organizationId', async (req: Request, res: Response) => {
  try {
    const user = req.session?.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const { organizationId } = req.params;
    const permissions = await RoleManager.getUserPermissions(user.id, organizationId);
    
    return res.status(200).json({
      success: true,
      permissions
    });
  } catch (error) {
    console.error('User permissions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

export default router;