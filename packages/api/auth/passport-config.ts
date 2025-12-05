/**
 * Passport.js configuration for Google and Apple OAuth strategies
 */

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as AppleStrategy } from 'passport-apple';
import { OAuthService } from '../services/oauth-service';

const oauthService = new OAuthService();

/**
 * Check if OAuth is enabled based on environment variables
 */
export function isOAuthEnabled() {
  const googleEnabled = !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  const appleEnabled = !!(
    process.env.APPLE_OAUTH_CLIENT_ID &&
    process.env.APPLE_OAUTH_TEAM_ID &&
    process.env.APPLE_OAUTH_KEY_ID &&
    process.env.APPLE_OAUTH_PRIVATE_KEY_PATH
  );
  return { googleEnabled, appleEnabled, anyEnabled: googleEnabled || appleEnabled };
}

/**
 * Configure Passport with OAuth strategies (only if credentials are present)
 */
export function configurePassport() {
  const { googleEnabled, appleEnabled, anyEnabled } = isOAuthEnabled();

  if (!anyEnabled) {
    console.log('[OAuth] OAuth authentication is disabled (no credentials configured)');
    return;
  }

  console.log(`[OAuth] Configuring OAuth strategies: Google=${googleEnabled}, Apple=${appleEnabled}`);

  // Google OAuth Strategy (only if credentials are present)
  if (googleEnabled) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      callbackURL: `${process.env.APP_URL}/api/auth/google/callback`,
      scope: ['profile', 'email'],  // Minimal scopes - only what we need
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        const result = await oauthService.handleGoogleAuth(profile);
        done(null, result);
      } catch (error) {
        done(error, false);
      }
    }));
  }

  // Apple Sign In Strategy (only if credentials are present)
  if (appleEnabled) {
    passport.use(new AppleStrategy({
      clientID: process.env.APPLE_OAUTH_CLIENT_ID!,
      teamID: process.env.APPLE_OAUTH_TEAM_ID!,
      keyID: process.env.APPLE_OAUTH_KEY_ID!,
      privateKeyLocation: process.env.APPLE_OAUTH_PRIVATE_KEY_PATH!,
      callbackURL: `${process.env.APP_URL}/api/auth/apple/callback`,
      scope: ['name', 'email'],
      passReqToCallback: false,
    }, (accessToken: string, refreshToken: string, idToken: string, appleProfile: any, done: any) => {
      // Note: Apple strategy doesn't support async/await in verify callback
      oauthService.handleAppleAuth(appleProfile)
        .then((result) => done(null, result))
        .catch((error) => done(error, false));
    }));
  }

  // Serialize user to session
  passport.serializeUser((user: any, done) => {
    done(null, user.userId);
  });

  // Deserialize user from session
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await oauthService.getUserById(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
}
