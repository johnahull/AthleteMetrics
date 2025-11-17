/**
 * Site Settings API Routes
 *
 * Manages global site settings including AI model configuration.
 * Only accessible by site admins.
 */

import express from "express";
import { requireSiteAdmin } from "../middleware";
import { storage } from "../storage";
import { updateSiteSettingsSchema, AI_MODELS } from "@shared/schema";
import { AI_MODELS as AI_MODELS_CONFIG } from "../services/ai-insights-service";

const router = express.Router();

/**
 * GET /api/site-settings
 * Get current site settings
 * Access: Site admin only
 */
router.get("/", requireSiteAdmin, async (req, res) => {
  try {
    const settings = await storage.getSiteSettings();

    if (!settings) {
      // Return default settings if none exist
      return res.json({
        aiModel: "gpt-5-nano",
        updatedAt: new Date().toISOString(),
        updatedBy: null,
      });
    }

    res.json(settings);
  } catch (error) {
    console.error("Error fetching site settings:", error);
    res.status(500).json({
      message: "Failed to fetch site settings",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * PATCH /api/site-settings
 * Update site settings
 * Access: Site admin only
 */
router.patch("/", requireSiteAdmin, async (req: any, res) => {
  try {
    const user = req.session?.user || req.user;

    // Validate request body
    const validated = updateSiteSettingsSchema.parse(req.body);

    // Update or create settings
    const updatedSettings = await storage.updateSiteSettings({
      aiModel: validated.aiModel,
      updatedBy: user?.id || null,
    });

    res.json(updatedSettings);
  } catch (error) {
    console.error("Error updating site settings:", error);

    if (error instanceof Error && error.name === "ZodError") {
      return res.status(400).json({
        message: "Validation error",
        errors: error,
      });
    }

    res.status(500).json({
      message: "Failed to update site settings",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/ai-models
 * Get list of available AI models with pricing and tiers
 * Access: Site admin only
 */
router.get("/ai-models", requireSiteAdmin, async (req, res) => {
  try {
    // Convert AI models config to API response format
    const models = Object.entries(AI_MODELS_CONFIG).map(([key, config]) => ({
      key,
      provider: config.provider,
      model: config.model,
      tier: config.tier,
      description: config.description,
      pricing: {
        inputPer1M: config.costPer1M.input,
        outputPer1M: config.costPer1M.output,
        currency: "USD",
      },
    }));

    // Group by tier
    const budgetModels = models.filter((m) => m.tier === "budget");
    const premiumModels = models.filter((m) => m.tier === "premium");

    res.json({
      budget: budgetModels,
      premium: premiumModels,
      all: models,
    });
  } catch (error) {
    console.error("Error fetching AI models:", error);
    res.status(500).json({
      message: "Failed to fetch AI models",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
