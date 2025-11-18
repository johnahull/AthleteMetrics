/**
 * Site Settings API Routes
 *
 * Manages global site settings including AI model configuration.
 * Only accessible by site admins.
 */

import express from "express";
import { requireSiteAdmin } from "../middleware";
import { storage } from "../storage";
import { updateSiteSettingsSchema } from "@shared/schema";
import { AI_MODELS as AI_MODELS_CONFIG } from "../services/ai-insights-service";

const router = express.Router();

/**
 * Sanitize error messages to prevent leaking internal details to clients.
 * Returns a safe error message for the API response.
 */
function sanitizeError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    // Only allow specific safe error messages through
    const safeMessages = [
      "Validation error",
      "Settings not found",
      "Model not found",
    ];
    if (safeMessages.some(msg => error.message.includes(msg))) {
      return error.message;
    }
  }
  return fallback;
}

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
        aiModel: "gpt-4o-mini",
        updatedAt: new Date().toISOString(),
        updatedBy: null,
      });
    }

    res.json(settings);
  } catch (error) {
    console.error("Error fetching site settings:", error);
    res.status(500).json({
      message: sanitizeError(error, "Failed to fetch site settings"),
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

    // Validate that the selected model has its API key configured
    const modelConfig = AI_MODELS_CONFIG[validated.aiModel as keyof typeof AI_MODELS_CONFIG];
    if (!modelConfig) {
      return res.status(400).json({ message: "Invalid AI model" });
    }

    // Check if provider API key exists
    const apiKeyEnvVars: Record<string, string> = {
      'openai': 'OPENAI_API_KEY',
      'google': 'GOOGLE_AI_API_KEY',
      'anthropic': 'ANTHROPIC_API_KEY'
    };
    const apiKeyEnvVar = apiKeyEnvVars[modelConfig.provider];
    if (!process.env[apiKeyEnvVar]) {
      return res.status(400).json({
        message: `API key for ${modelConfig.provider} provider is not configured. Please set the ${apiKeyEnvVar} environment variable.`
      });
    }

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
      message: sanitizeError(error, "Failed to update site settings"),
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
      message: sanitizeError(error, "Failed to fetch AI models"),
    });
  }
});

export default router;
