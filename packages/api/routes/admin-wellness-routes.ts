/**
 * Admin Wellness Routes
 *
 * Provides site admin endpoints for managing global wellness templates
 */

import type { Express, Response } from "express";
import { storage } from "../storage";
import { db } from "../db";
import {
  requireAuth,
  requireSiteAdmin,
  type AuthenticatedRequest,
} from "../middleware";
import {
  createWellnessTemplateSchema,
  updateWellnessTemplateSchema,
} from "@shared/wellness-validation";
import { wellnessTemplates } from "@shared/schema";
import { eq, and, isNull, sql } from "drizzle-orm";

/**
 * Register admin wellness routes
 */
export function registerAdminWellnessRoutes(app: Express) {
  /**
   * GET /api/admin/wellness/templates
   * Get all system templates (global templates with NULL organization_id)
   * Access: Site Admin only
   */
  app.get(
    "/api/admin/wellness/templates",
    requireAuth,
    requireSiteAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const templates = await storage.getSystemWellnessTemplates();
        res.json(templates);
      } catch (error: any) {
        console.error("Failed to fetch system wellness templates:", error);
        res.status(500).json({
          message: "Failed to fetch system wellness templates",
          error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
        });
      }
    }
  );

  /**
   * GET /api/admin/wellness/templates/:id/usage
   * Get usage statistics for a system template
   * Shows how many organizations have cloned this template
   * Access: Site Admin only
   */
  app.get(
    "/api/admin/wellness/templates/:id/usage",
    requireAuth,
    requireSiteAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;

        // Verify template exists and is a system template
        const template = await storage.getWellnessTemplate(id);
        if (!template) {
          return res.status(404).json({ message: "Template not found" });
        }

        if (!template.isSystemSeeded || template.organizationId !== null) {
          return res.status(400).json({
            message: "Template is not a system template"
          });
        }

        const usage = await storage.getSystemTemplateUsage(id);
        res.json(usage);
      } catch (error: any) {
        console.error("Failed to fetch template usage:", error);
        res.status(500).json({
          message: "Failed to fetch template usage",
          error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
        });
      }
    }
  );

  /**
   * POST /api/admin/wellness/templates
   * Create a new global system template
   * Access: Site Admin only
   */
  app.post(
    "/api/admin/wellness/templates",
    requireAuth,
    requireSiteAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const validation = createWellnessTemplateSchema.safeParse(req.body);

        if (!validation.success) {
          return res.status(400).json({
            message: "Invalid template data",
            errors: validation.error.errors,
          });
        }

        const template = await storage.createSystemWellnessTemplate({
          ...validation.data,
          createdBy: req.user!.id,
        });

        res.status(201).json(template);
      } catch (error: any) {
        console.error("Failed to create system template:", error);
        res.status(500).json({
          message: "Failed to create system template",
          error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
        });
      }
    }
  );

  /**
   * PUT /api/admin/wellness/templates/:id
   * Update a system template
   * Access: Site Admin only
   */
  app.put(
    "/api/admin/wellness/templates/:id",
    requireAuth,
    requireSiteAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;
        const validation = updateWellnessTemplateSchema.safeParse(req.body);

        if (!validation.success) {
          return res.status(400).json({
            message: "Invalid template data",
            errors: validation.error.errors,
          });
        }

        // Verify template exists and is a system template
        const template = await storage.getWellnessTemplate(id);
        if (!template) {
          return res.status(404).json({ message: "Template not found" });
        }

        if (!template.isSystemSeeded || template.organizationId !== null) {
          return res.status(403).json({
            message: "Can only update system templates"
          });
        }

        const updated = await storage.updateSystemWellnessTemplate(id, validation.data);
        res.json(updated);
      } catch (error: any) {
        console.error("Failed to update system template:", error);
        res.status(500).json({
          message: "Failed to update system template",
          error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
        });
      }
    }
  );

  /**
   * DELETE /api/admin/wellness/templates/:id
   * Delete a system template
   * Note: Cloned templates in organizations remain intact
   * Access: Site Admin only
   */
  app.delete(
    "/api/admin/wellness/templates/:id",
    requireAuth,
    requireSiteAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { id } = req.params;

        // Verify template exists and is a system template
        const template = await storage.getWellnessTemplate(id);
        if (!template) {
          return res.status(404).json({ message: "Template not found" });
        }

        if (!template.isSystemSeeded || template.organizationId !== null) {
          return res.status(403).json({
            message: "Can only delete system templates"
          });
        }

        await storage.deleteSystemWellnessTemplate(id);
        res.status(204).send();
      } catch (error: any) {
        console.error("Failed to delete system template:", error);
        res.status(500).json({
          message: "Failed to delete system template",
          error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
        });
      }
    }
  );

  console.log("✅ Admin wellness routes registered successfully");
}
