/**
 * Wellness Magic Link Authentication
 *
 * Provides magic link token generation and validation for wellness questionnaire access.
 * Follows security patterns from password-reset.ts with wellness-specific logic.
 */

import crypto from 'crypto';
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middleware';
import { storage } from '../storage';
import { db } from '../db';
import { userTeams } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

export class WellnessAccessService {
  /**
   * Generate cryptographically secure magic link token
   * @returns 64-character hex string (32 bytes)
   */
  static generateMagicLinkToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate full magic link URL for wellness questionnaire access
   * @param requestId - Wellness request ID
   * @param athleteId - Target athlete user ID
   * @param organizationId - Organization ID for context
   * @returns Full magic link URL with token and athlete parameter
   */
  static async generateMagicLink(
    requestId: string,
    athleteId: string,
    organizationId: string
  ): Promise<string> {
    // Get the wellness request
    const request = await storage.getWellnessRequest(requestId);
    if (!request) {
      throw new Error('Wellness request not found');
    }

    if (!request.publicToken) {
      throw new Error('Request does not have a public token');
    }

    // Verify athlete is in target list
    const isTargeted =
      request.targetAthleteIds?.includes(athleteId) ||
      (request.targetTeamIds && request.targetTeamIds.length > 0);

    if (!isTargeted) {
      throw new Error('Athlete is not in target list for this request');
    }

    // Construct magic link URL
    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
      throw new Error('BASE_URL environment variable is required for magic link generation');
    }
    const magicLink = `${baseUrl}/wellness/submit/${request.publicToken}`;

    return magicLink;
  }

  /**
   * Validate magic link token and return request details
   * @param token - Magic link token from URL
   * @param athleteId - Athlete ID from URL parameter
   * @returns Validation result with request details or error
   */
  static async validateMagicLink(
    token: string,
    athleteId: string
  ): Promise<{
    valid: boolean;
    request?: any;
    athlete?: any;
    error?: string;
  }> {
    try {
      // Normalize token to lowercase for consistent validation
      // crypto.randomBytes().toString('hex') produces lowercase, but normalize for safety
      const normalizedToken = token.toLowerCase();

      // SECURITY: Always perform database lookup regardless of format to prevent timing attacks
      // This ensures constant-time validation - both valid and invalid format tokens
      // take the same amount of time (DB query time), preventing attackers from using
      // timing analysis to distinguish between malformed tokens and valid-but-nonexistent tokens
      const request = await storage.getWellnessRequestByToken(normalizedToken);

      // Validate token format (64 hex characters) after DB lookup
      const formatValid = /^[a-f0-9]{64}$/.test(normalizedToken);

      // Return combined validation result
      if (!formatValid || !request) {
        return { valid: false, error: 'Invalid or expired token' };
      }

      // Check request status
      if (request.status !== 'active') {
        return { valid: false, error: 'This request is no longer active' };
      }

      // Check expiration
      if (request.expiresAt && new Date() > new Date(request.expiresAt)) {
        return { valid: false, error: 'This link has expired' };
      }

      // Validate athlete exists
      const athlete = await storage.getUser(athleteId);
      if (!athlete) {
        return { valid: false, error: 'Athlete not found' };
      }

      // Verify athlete is in target list
      let isTargeted = false;

      // Check direct athlete targeting
      if (request.targetAthleteIds?.includes(athleteId)) {
        isTargeted = true;
      }

      // Check team-based targeting
      if (!isTargeted && request.targetTeamIds && request.targetTeamIds.length > 0) {
        try {
          const { storage } = await import('../storage');
          const athleteTeams = await storage.getUserTeams(athleteId);
          const athleteTeamIds = athleteTeams.map(ut => ut.team.id);
          isTargeted = request.targetTeamIds.some((teamId: string) => athleteTeamIds.includes(teamId));
        } catch (error) {
          console.error('Error checking team membership:', error);
        }
      }

      if (!isTargeted) {
        return { valid: false, error: 'You are not authorized to access this questionnaire' };
      }

      // If requiresAuth is true, verify athlete has account
      if (request.requiresAuth) {
        return { valid: false, error: 'This questionnaire requires authentication. Please log in.' };
      }

      return {
        valid: true,
        request,
        athlete,
      };
    } catch (error) {
      console.error('Magic link validation error:', error);
      return { valid: false, error: 'Failed to validate magic link' };
    }
  }

  /**
   * Check if athlete is in target list for a request
   * Handles both direct athlete targeting and team-based targeting
   */
  static async isAthleteTargeted(
    requestId: string,
    athleteId: string
  ): Promise<boolean> {
    try {
      const request = await storage.getWellnessRequest(requestId);
      if (!request) return false;

      // Check direct athlete targeting
      if (request.targetAthleteIds?.includes(athleteId)) {
        return true;
      }

      // Check team-based targeting
      if (request.targetTeamIds && request.targetTeamIds.length > 0) {
        const athleteTeams = await storage.getUserTeams(athleteId);
        const athleteTeamIds = athleteTeams.map(ut => ut.team.id);

        return request.targetTeamIds.some((teamId: string) =>
          athleteTeamIds.includes(teamId)
        );
      }

      return false;
    } catch (error) {
      console.error('Error checking athlete targeting:', error);
      return false;
    }
  }

  /**
   * Generate magic links for all targeted athletes in a request
   * Used when sending bulk email notifications
   */
  static async generateMagicLinksForRequest(
    requestId: string
  ): Promise<Map<string, string>> {
    const magicLinks = new Map<string, string>();

    try {
      const request = await storage.getWellnessRequest(requestId);
      if (!request) {
        throw new Error('Request not found');
      }

      // Collect all target athlete IDs
      const targetAthleteIds: string[] = [];

      // Add directly targeted athletes
      if (request.targetAthleteIds) {
        targetAthleteIds.push(...request.targetAthleteIds);
      }

      // Add athletes from targeted teams
      if (request.targetTeamIds) {
        for (const teamId of request.targetTeamIds) {
          // Query userTeams table to get all active members of this team
          const teamMembers = await db
            .select()
            .from(userTeams)
            .where(
              and(
                eq(userTeams.teamId, teamId),
                eq(userTeams.isActive, true)
              )
            );

          // Extract user IDs from team memberships
          const memberIds = teamMembers.map(member => member.userId);
          targetAthleteIds.push(...memberIds);
        }
      }

      // Remove duplicates
      const uniqueAthleteIds = [...new Set(targetAthleteIds)];

      // Generate magic link for each athlete
      for (const athleteId of uniqueAthleteIds) {
        const magicLink = await this.generateMagicLink(
          requestId,
          athleteId,
          request.organizationId
        );
        magicLinks.set(athleteId, magicLink);
      }

      return magicLinks;
    } catch (error) {
      console.error('Error generating magic links:', error);
      throw error;
    }
  }
}

/**
 * Express middleware for wellness access control
 * Supports both authenticated users and magic link access
 *
 * @param requireAuth - If true, requires authenticated user. If false, allows magic link access.
 * @returns Express middleware function
 */
export function requireWellnessAccess(requireAuth: boolean = true) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Check if user is authenticated via session
      const sessionUser = req.session?.user || req.user;

      if (sessionUser) {
        // Authenticated user access
        req.user = sessionUser;
        (req.user as any).accessMethod = 'authenticated';
        return next();
      }

      // If auth is required and no session user, reject
      if (requireAuth) {
        return res.status(401).json({
          message: "Authentication required"
        });
      }

      // Check for magic link token in query parameters
      const token = req.query.token as string;
      const athleteId = req.query.athleteId as string;

      if (!token || !athleteId) {
        return res.status(401).json({
          message: "Authentication required. Please provide a valid token or log in."
        });
      }

      // Validate magic link token
      const validation = await WellnessAccessService.validateMagicLink(token, athleteId);

      if (!validation.valid) {
        return res.status(403).json({
          message: validation.error || "Invalid or expired magic link"
        });
      }

      // Attach validated data to request
      (req as any).wellnessRequest = validation.request;
      (req as any).wellnessAthlete = validation.athlete;

      // Create pseudo-user object for magic link access
      req.user = {
        id: athleteId,
        email: validation.athlete?.email || '',
        firstName: validation.athlete?.firstName || '',
        lastName: validation.athlete?.lastName || '',
        role: 'athlete',
        isSiteAdmin: false
      };
      (req.user as any).accessMethod = 'magic_link';

      next();
    } catch (error) {
      console.error('Wellness access middleware error:', error);
      res.status(500).json({
        message: "Failed to validate access"
      });
    }
  };
}
