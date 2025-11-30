/**
 * Achievement management routes
 *
 * SECURITY MODEL:
 * - Anyone authenticated can view achievement definitions
 * - Athletes can only view their own achievements
 * - Coaches/org admins can view achievements for athletes in their organization (read-only)
 * - Site admins can view all achievements (read-only)
 */

import type { Express } from 'express';
import rateLimit from 'express-rate-limit';
import { storage } from '../storage';
import { requireAuth } from '../middleware';
import { isSiteAdmin } from '../utils/auth-helpers';
import { differenceInDays } from 'date-fns';

// Rate limiting for achievement endpoints
const achievementLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Limit each IP to 100 achievement requests per windowMs
  message: { message: 'Too many achievement requests, please try again later.' },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

export function registerAchievementRoutes(app: Express) {
  /**
   * Get all achievement definitions
   * Anyone authenticated can view available achievements
   */
  app.get('/api/achievements', achievementLimiter, requireAuth, async (req, res) => {
    try {
      const achievements = await storage.getAchievementDefinitions({ isActive: true });

      res.json({ achievements });
    } catch (error) {
      console.error('Get achievements error:', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch achievements';
      res.status(500).json({ message });
    }
  });

  /**
   * Get user's unlocked achievements
   * Athletes can only view their own achievements
   * Coaches/admins can view achievements for athletes in their organization
   */
  app.get('/api/achievements/user', achievementLimiter, requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: 'User not authenticated' });
      }

      const { userId } = req.query;
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      // Determine which user's achievements to fetch
      let targetUserId: string;
      let organizationId: string;

      if (userId && typeof userId === 'string') {
        // Requesting another user's achievements - check permissions
        if (currentUser.role === 'athlete') {
          // Athletes can only view their own achievements
          if (currentUser.id !== userId) {
            return res.status(403).json({
              message: 'Athletes can only view their own achievements',
            });
          }
          targetUserId = currentUser.id;
          // Get athlete's organization
          const athleteOrgs = await storage.getUserOrganizations(currentUser.id);
          if (athleteOrgs.length === 0) {
            return res.status(404).json({ message: 'User has no organization' });
          }
          organizationId = athleteOrgs[0].organizationId;
        } else if (!userIsSiteAdmin) {
          // Coaches/org admins can view achievements for athletes in their organization
          const targetAthlete = await storage.getUser(userId);
          if (!targetAthlete) {
            return res.status(404).json({ message: 'Athlete not found' });
          }

          // Check if target athlete is in coach's organization
          const coachOrgs = await storage.getUserOrganizations(currentUser.id);
          const athleteTeams = await storage.getUserTeams(userId);
          const athleteOrgIds = athleteTeams.map(team => team.team.organizationId);
          const coachOrgIds = coachOrgs.map(org => org.organizationId);

          const sharedOrgIds = athleteOrgIds.filter(orgId => coachOrgIds.includes(orgId));
          if (sharedOrgIds.length === 0) {
            return res.status(403).json({
              message: 'Access denied - athlete belongs to a different organization',
            });
          }

          targetUserId = userId;
          organizationId = sharedOrgIds[0]; // Use first shared org
        } else {
          // Site admin can view any user's achievements
          targetUserId = userId;
          // Get user's first organization
          const userOrgs = await storage.getUserOrganizations(userId);
          if (userOrgs.length === 0) {
            return res.status(404).json({ message: 'User has no organization' });
          }
          organizationId = userOrgs[0].organizationId;
        }
      } else {
        // No userId specified - return current user's achievements
        targetUserId = currentUser.id;
        // Get current user's first organization
        const userOrgs = await storage.getUserOrganizations(currentUser.id);
        if (userOrgs.length === 0) {
          return res.status(404).json({ message: 'User has no organization' });
        }
        organizationId = userOrgs[0].organizationId;
      }

      const achievements = await storage.getUserAchievements(targetUserId, organizationId!);

      res.json({ achievements });
    } catch (error) {
      console.error('Get user achievements error:', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch user achievements';
      res.status(500).json({ message });
    }
  });

  /**
   * Get recently unlocked achievements (last 7 days)
   * For displaying celebration notifications
   */
  app.get('/api/achievements/recent', achievementLimiter, requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: 'User not authenticated' });
      }

      // Get user's organization
      const userOrgs = await storage.getUserOrganizations(currentUser.id);
      if (userOrgs.length === 0) {
        return res.json({ achievements: [] });
      }

      const organizationId = userOrgs[0].organizationId;

      // Get all achievements
      const allAchievements = await storage.getUserAchievements(currentUser.id, organizationId);

      // Filter to recent (within 7 days)
      const now = new Date();
      const recentAchievements = allAchievements.filter(achievement => {
        const daysSince = differenceInDays(now, new Date(achievement.unlockedAt));
        return daysSince <= 7;
      });

      res.json({ achievements: recentAchievements });
    } catch (error) {
      console.error('Get recent achievements error:', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch recent achievements';
      res.status(500).json({ message });
    }
  });
}
