/**
 * Goal management routes
 *
 * SECURITY MODEL:
 * - Athletes can only manage their own goals (create, read, update, delete)
 * - Coaches/org admins can VIEW goals for athletes in their organization (read-only)
 * - Site admins can VIEW all goals (read-only)
 * - NO ONE can modify another user's goals - this is personal athlete data
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { storage } from "../storage";
import { requireAuth } from "../middleware";
import { insertGoalSchema, updateGoalSchema, goalStatusEnum } from "@shared/schema";
import { ZodError } from "zod";
import { isSiteAdmin } from "../utils/auth-helpers";

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

// Rate limiting for goal endpoints
const goalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Limit each IP to 100 goal requests per windowMs
  message: { message: "Too many goal requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Stricter rate limiting for create/update operations
const goalMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 50, // Limit each IP to 50 mutations per windowMs
  message: { message: "Too many goal modification attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

export function registerGoalRoutes(app: Express) {
  /**
   * Get goals for the current user or a specific athlete
   * Athletes can only view their own goals
   * Coaches/admins can view goals for athletes in their organization
   */
  app.get("/api/goals", goalLimiter, requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { status, userId } = req.query;
      const userIsSiteAdmin = isSiteAdmin(currentUser);

      // Determine which user's goals to fetch
      let targetUserId: string;

      if (userId && typeof userId === 'string') {
        // Validate UUID format
        if (!isValidUUID(userId)) {
          return res.status(400).json({ message: "Invalid user ID format" });
        }

        // Requesting another user's goals - check permissions
        if (currentUser.role === "athlete") {
          // Athletes can only view their own goals
          if (currentUser.id !== userId) {
            return res.status(403).json({
              message: "Athletes can only view their own goals"
            });
          }
          targetUserId = currentUser.id;
        } else if (!userIsSiteAdmin) {
          // Coaches/org admins can view goals for athletes in their organization
          const targetAthlete = await storage.getUser(userId);
          if (!targetAthlete) {
            return res.status(404).json({ message: "Athlete not found" });
          }

          // Check if target athlete is in coach's organization
          const coachOrgs = await storage.getUserOrganizations(currentUser.id);
          const athleteTeams = await storage.getUserTeams(userId);
          const athleteOrgIds = athleteTeams.map(team => team.team.organizationId);
          const coachOrgIds = coachOrgs.map(org => org.organizationId);

          const hasSharedOrg = athleteOrgIds.some(orgId => coachOrgIds.includes(orgId));
          if (!hasSharedOrg) {
            return res.status(403).json({
              message: "Access denied - athlete belongs to a different organization"
            });
          }

          targetUserId = userId;
        } else {
          // Site admin can view any user's goals
          targetUserId = userId;
        }
      } else {
        // No userId specified - return current user's goals
        targetUserId = currentUser.id;
      }

      // Build filters
      const filters: Parameters<typeof storage.getGoalsByUser>[1] = {};
      if (status && typeof status === 'string' && (goalStatusEnum as readonly string[]).includes(status)) {
        filters.status = status as typeof goalStatusEnum[number];
      }

      const goals = await storage.getGoalsByUser(targetUserId, filters);

      res.json({ goals });
    } catch (error) {
      console.error("Get goals error:", error);
      res.status(500).json({ message: "An error occurred while fetching goals" });
    }
  });

  /**
   * Get a specific goal by ID
   * Athletes can only view their own goals
   * Coaches/admins can view goals for athletes in their organization
   */
  app.get("/api/goals/:id", goalLimiter, requireAuth, async (req, res) => {
    try {
      const goalId = req.params.id;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      if (!isValidUUID(goalId)) {
        return res.status(400).json({ message: "Invalid goal ID format" });
      }

      const goal = await storage.getGoal(goalId);
      if (!goal) {
        return res.status(404).json({ message: "Goal not found" });
      }

      const userIsSiteAdmin = isSiteAdmin(currentUser);

      // Athletes can only view their own goals
      if (currentUser.role === "athlete") {
        if (currentUser.id !== goal.userId) {
          return res.status(403).json({
            message: "Athletes can only view their own goals"
          });
        }
      } else if (!userIsSiteAdmin) {
        // Coaches/org admins can view goals for athletes in their organization
        const coachOrgs = await storage.getUserOrganizations(currentUser.id);
        const athleteTeams = await storage.getUserTeams(goal.userId);
        const athleteOrgIds = athleteTeams.map(team => team.team.organizationId);
        const coachOrgIds = coachOrgs.map(org => org.organizationId);

        const hasSharedOrg = athleteOrgIds.some(orgId => coachOrgIds.includes(orgId));
        if (!hasSharedOrg) {
          return res.status(403).json({
            message: "Access denied - athlete belongs to a different organization"
          });
        }
      }

      res.json(goal);
    } catch (error) {
      console.error("Get goal error:", error);
      res.status(500).json({ message: "An error occurred while fetching the goal" });
    }
  });

  /**
   * Create a new goal for the current user
   * Only athletes can create goals for themselves
   * Coaches/admins cannot create goals for athletes
   */
  app.post("/api/goals", goalMutationLimiter, requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Only athletes can create goals for themselves
      if (currentUser.role !== "athlete") {
        return res.status(403).json({
          message: "Only athletes can create goals. Coaches cannot create goals on behalf of athletes."
        });
      }

      // Validate request body
      const validatedData = insertGoalSchema.parse({
        ...req.body,
        userId: currentUser.id, // Always use current user's ID
      });

      // If baselineValue not provided, calculate from recent measurements
      let finalBaselineValue = validatedData.baselineValue;
      if (finalBaselineValue === undefined || finalBaselineValue === null) {
        const recentMeasurements = await storage.getMeasurements({
          userId: currentUser.id,
          metric: validatedData.metric,
          includeUnverified: false,
        });

        if (recentMeasurements.length > 0) {
          // Use most recent measurement as baseline
          const sortedMeasurements = recentMeasurements.sort((a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
          );
          finalBaselineValue = parseFloat(sortedMeasurements[0].value);
        } else {
          // No measurements found - require baseline value
          return res.status(400).json({
            message: "No recent measurements found for this metric. Please provide a baseline value."
          });
        }
      }

      // Set currentValue to baselineValue initially
      const goalData = {
        ...validatedData,
        baselineValue: finalBaselineValue,
        currentValue: validatedData.currentValue ?? finalBaselineValue,
        status: 'active' as const,
      };

      const goal = await storage.createGoal(goalData);

      res.status(201).json(goal);
    } catch (error) {
      console.error("Create goal error:", error);
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Invalid input data",
          errors: error.errors
        });
      }
      res.status(400).json({ message: "An error occurred while creating the goal" });
    }
  });

  /**
   * Update a goal
   * Only the goal owner (athlete) can update their own goals
   */
  app.put("/api/goals/:id", goalMutationLimiter, requireAuth, async (req, res) => {
    try {
      const goalId = req.params.id;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      if (!isValidUUID(goalId)) {
        return res.status(400).json({ message: "Invalid goal ID format" });
      }

      // Get the goal to check ownership
      const existingGoal = await storage.getGoal(goalId);
      if (!existingGoal) {
        return res.status(404).json({ message: "Goal not found" });
      }

      // Only the goal owner can update
      if (currentUser.id !== existingGoal.userId) {
        return res.status(403).json({
          message: "You can only update your own goals"
        });
      }

      // Validate request body
      const validatedData = updateGoalSchema.parse(req.body);

      // If status is being changed to 'achieved', set achievedAt timestamp
      const updateData: any = { ...validatedData };
      if (validatedData.status === 'achieved' && existingGoal.status !== 'achieved') {
        updateData.achievedAt = new Date();
      }

      const updatedGoal = await storage.updateGoal(goalId, updateData);

      res.json(updatedGoal);
    } catch (error) {
      console.error("Update goal error:", error);
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Invalid input data",
          errors: error.errors
        });
      }
      res.status(400).json({ message: "An error occurred while updating the goal" });
    }
  });

  /**
   * Update goal status specifically
   * Quick endpoint to mark goal as achieved/abandoned
   * Only the goal owner can update
   */
  app.patch("/api/goals/:id/status", goalMutationLimiter, requireAuth, async (req, res) => {
    try {
      const goalId = req.params.id;
      const currentUser = req.session.user;
      const { status } = req.body;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      if (!isValidUUID(goalId)) {
        return res.status(400).json({ message: "Invalid goal ID format" });
      }

      // Get the goal to check ownership
      const existingGoal = await storage.getGoal(goalId);
      if (!existingGoal) {
        return res.status(404).json({ message: "Goal not found" });
      }

      // Only the goal owner can update
      if (currentUser.id !== existingGoal.userId) {
        return res.status(403).json({
          message: "You can only update your own goals"
        });
      }

      // Validate status value
      if (!status || !goalStatusEnum.includes(status as any)) {
        return res.status(400).json({
          message: `Status must be one of: ${goalStatusEnum.join(', ')}`
        });
      }

      // Set achievedAt if transitioning to achieved status
      const updateData: any = { status };
      if (status === 'achieved' && existingGoal.status !== 'achieved') {
        updateData.achievedAt = new Date();
      }

      const updatedGoal = await storage.updateGoal(goalId, updateData);

      res.json({
        id: updatedGoal.id,
        status: updatedGoal.status,
        achievedAt: updatedGoal.achievedAt,
        message: `Goal status updated to ${status}`,
      });
    } catch (error) {
      console.error("Update goal status error:", error);
      res.status(500).json({ message: "An error occurred while updating goal status" });
    }
  });

  /**
   * Delete a goal
   * Only the goal owner (athlete) can delete their own goals
   */
  app.delete("/api/goals/:id", goalMutationLimiter, requireAuth, async (req, res) => {
    try {
      const goalId = req.params.id;
      const currentUser = req.session.user;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      if (!isValidUUID(goalId)) {
        return res.status(400).json({ message: "Invalid goal ID format" });
      }

      // Get the goal to check ownership
      const existingGoal = await storage.getGoal(goalId);
      if (!existingGoal) {
        return res.status(404).json({ message: "Goal not found" });
      }

      // Only the goal owner can delete
      if (currentUser.id !== existingGoal.userId) {
        return res.status(403).json({
          message: "You can only delete your own goals"
        });
      }

      await storage.deleteGoal(goalId);

      res.json({ message: "Goal deleted successfully" });
    } catch (error) {
      console.error("Delete goal error:", error);
      res.status(500).json({ message: "An error occurred while deleting the goal" });
    }
  });
}
