/**
 * OAuth authentication routes for Google and Apple sign-in
 */

import type { Express } from 'express';
import passport from 'passport';
import rateLimit from 'express-rate-limit';
import { OAuthService } from '../services/oauth-service';
import { AuthService } from '../services/auth-service';
import { shouldSkipRateLimiting } from '../utils/rate-limit-utils';
import { isOAuthEnabled } from '../auth/passport-config';
import { storage } from '../storage';

const oauthService = new OAuthService();
const authService = new AuthService();

// Rate limiting for OAuth endpoints
const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  limit: 10,  // 10 OAuth attempts per window
  message: { message: "Too many OAuth attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => shouldSkipRateLimiting(req, 'oauth'),
});

// Rate limiting for account linking endpoint (prevent token brute-force)
const linkingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  limit: 5,  // 5 linking attempts per window (stricter than OAuth)
  message: { message: "Too many account linking attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => shouldSkipRateLimiting(req, 'oauth'),
});

export function registerOAuthRoutes(app: Express) {
  const { googleEnabled, appleEnabled, anyEnabled } = isOAuthEnabled();

  // Always register the OAuth status endpoint (even if OAuth is disabled)
  app.get('/api/auth/oauth-status', (req, res) => {
    res.json({ googleEnabled, appleEnabled });
  });

  // Skip OAuth routes if no credentials are configured
  if (!anyEnabled) {
    console.log('[OAuth] Skipping OAuth route registration (OAuth is disabled)');
    return;
  }
  // Google OAuth routes (only if Google is enabled)
  if (googleEnabled) {
    /**
     * Google OAuth - Initiate
     */
    app.get('/api/auth/google',
      oauthLimiter,
      passport.authenticate('google', {
        scope: ['profile', 'email'],
        accessType: 'offline',
        prompt: 'select_account',  // Always show account picker
      })
    );

    /**
     * Google OAuth - Callback
     * Uses custom callback to handle account linking scenario separately from failures
     */
    app.get('/api/auth/google/callback', (req, res, next) => {
      passport.authenticate('google', async (err: any, oauthResult: any, info: any) => {
        try {
          // Handle account linking scenario (not a failure - just needs email confirmation)
          if (err && err.message === 'LINKING_REQUIRED') {
            return res.redirect('/login?message=linking_email_sent');
          }

          // Handle other authentication errors
          if (err) {
            console.error('Google OAuth error:', err);
            return res.redirect('/login?error=oauth_failed');
          }

          // No result means authentication failed
          if (!oauthResult) {
            return res.redirect('/login?error=oauth_failed');
          }

          // Handle linking scenario from result (backup check)
          if (!oauthResult.success) {
            if (oauthResult.requiresLinking) {
              return res.redirect('/login?message=linking_email_sent');
            }
            return res.redirect('/login?error=oauth_failed');
          }

          // Get full user data
          const user = await oauthService.getUserById(oauthResult.userId);
          if (!user) {
            return res.redirect('/login?error=user_not_found');
          }

          // Determine user role and context
          const roleContext = await authService.determineUserRoleAndContext(user);

          // Regenerate session to prevent session fixation attacks
          req.session.regenerate((err) => {
            if (err) {
              console.error('Session regeneration error:', err);
              return res.redirect('/login?error=oauth_failed');
            }

            // Set session
            req.session.user = {
              id: user.id,
              username: user.username,
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.emails?.[0] || user.oauthEmail!,
              role: roleContext.role,
              isSiteAdmin: user.isSiteAdmin === true,
              primaryOrganizationId: roleContext.primaryOrganizationId,
              athleteId: roleContext.role === 'athlete' ? user.id : undefined,
            };

            // Save session before redirect
            req.session.save(async (saveErr) => {
              if (saveErr) {
                console.error('Session save error:', saveErr);
                return res.redirect('/login?error=oauth_failed');
              }

              // Audit log OAuth login
              try {
                await storage.createAuditLog({
                  userId: user.id,
                  action: 'oauth_login',
                  resourceType: 'user',
                  resourceId: user.id,
                  details: JSON.stringify({
                    provider: req.path.includes('google') ? 'google' : 'apple',
                    role: roleContext.role,
                    isSiteAdmin: user.isSiteAdmin
                  }),
                  ipAddress: req.ip,
                  userAgent: req.get('user-agent')
                });
              } catch (auditErr) {
                console.error('Failed to create OAuth audit log:', auditErr);
                // Don't fail the login if audit logging fails
              }

              // Redirect based on role
              const redirectUrl = user.isSiteAdmin ? '/admin' :
                                 roleContext.role === 'athlete' ? '/my-dashboard' :
                                 '/dashboard';

              res.redirect(redirectUrl);
            });
          });
        } catch (error) {
          console.error('Google OAuth callback error:', error);
          res.redirect('/login?error=oauth_failed');
        }
      })(req, res, next);
    });
  }

  // Apple OAuth routes (only if Apple is enabled)
  if (appleEnabled) {
    /**
     * Apple Sign In - Initiate
     */
    app.get('/api/auth/apple',
      oauthLimiter,
      passport.authenticate('apple', {
        scope: ['name', 'email'],
      })
    );

    /**
     * Apple Sign In - Callback
     * Uses custom callback to handle account linking scenario separately from failures
     */
    app.post('/api/auth/apple/callback', (req, res, next) => {
      passport.authenticate('apple', async (err: any, oauthResult: any, info: any) => {
        try {
          // Handle account linking scenario (not a failure - just needs email confirmation)
          if (err && err.message === 'LINKING_REQUIRED') {
            return res.redirect('/login?message=linking_email_sent');
          }

          // Handle other authentication errors
          if (err) {
            console.error('Apple OAuth error:', err);
            return res.redirect('/login?error=oauth_failed');
          }

          // No result means authentication failed
          if (!oauthResult) {
            return res.redirect('/login?error=oauth_failed');
          }

          // Handle linking scenario from result (backup check)
          if (!oauthResult.success) {
            if (oauthResult.requiresLinking) {
              return res.redirect('/login?message=linking_email_sent');
            }
            return res.redirect('/login?error=oauth_failed');
          }

          const user = await oauthService.getUserById(oauthResult.userId);
          if (!user) {
            return res.redirect('/login?error=user_not_found');
          }

          const roleContext = await authService.determineUserRoleAndContext(user);

          // Regenerate session to prevent session fixation attacks
          req.session.regenerate((err) => {
            if (err) {
              console.error('Session regeneration error:', err);
              return res.redirect('/login?error=oauth_failed');
            }

            // Set session
            req.session.user = {
              id: user.id,
              username: user.username,
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.emails?.[0] || user.oauthEmail!,
              role: roleContext.role,
              isSiteAdmin: user.isSiteAdmin === true,
              primaryOrganizationId: roleContext.primaryOrganizationId,
              athleteId: roleContext.role === 'athlete' ? user.id : undefined,
            };

            // Save session before redirect
            req.session.save(async (saveErr) => {
              if (saveErr) {
                console.error('Session save error:', saveErr);
                return res.redirect('/login?error=oauth_failed');
              }

              // Audit log OAuth login
              try {
                await storage.createAuditLog({
                  userId: user.id,
                  action: 'oauth_login',
                  resourceType: 'user',
                  resourceId: user.id,
                  details: JSON.stringify({
                    provider: req.path.includes('google') ? 'google' : 'apple',
                    role: roleContext.role,
                    isSiteAdmin: user.isSiteAdmin
                  }),
                  ipAddress: req.ip,
                  userAgent: req.get('user-agent')
                });
              } catch (auditErr) {
                console.error('Failed to create OAuth audit log:', auditErr);
                // Don't fail the login if audit logging fails
              }

              // Redirect based on role
              const redirectUrl = user.isSiteAdmin ? '/admin' :
                                 roleContext.role === 'athlete' ? '/my-dashboard' :
                                 '/dashboard';

              res.redirect(redirectUrl);
            });
          });
        } catch (error) {
          console.error('Apple OAuth callback error:', error);
          res.redirect('/login?error=oauth_failed');
        }
      })(req, res, next);
    });
  }

  /**
   * Confirm account linking
   * GET endpoint for email links (tokens are 64-char hex with 15min expiry and 3-attempt limit)
   */
  app.get('/api/auth/link-account/:token', linkingLimiter, async (req, res) => {
    try {
      const { token } = req.params;
      const result = await oauthService.confirmAccountLinking(token);

      if (!result.success) {
        // Increment failed attempts on errors to prevent brute force attacks
        if (result.shouldIncrementFailedAttempts) {
          try {
            await oauthService.storage.incrementAccountLinkingTokenFailedAttempts(token);
          } catch (err) {
            console.error('Failed to increment token failed attempts:', err);
          }
        }
        return res.redirect(`/login?error=${encodeURIComponent(result.error || 'linking_failed')}`);
      }

      res.redirect('/login?message=account_linked');
    } catch (error) {
      console.error('Account linking error:', error);
      res.redirect('/login?error=linking_failed');
    }
  });
}
