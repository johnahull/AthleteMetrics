/**
 * Site Settings API Routes
 *
 * Manages global site settings including AI model configuration.
 * Only accessible by site admins.
 */

import express, { Request, Response } from "express";
import { ZodError } from "zod";
import { requireSiteAdmin } from "../middleware";
import { storage } from "../storage";
import { updateSiteSettingsSchema } from "@shared/schema";
import { AI_MODELS as AI_MODELS_CONFIG, isModelAvailable } from "../services/ai-insights-service";

// Type for authenticated request with session
interface AuthenticatedRequest extends Request {
  session: Request['session'] & {
    user?: {
      id: string;
      email: string;
      isSiteAdmin?: boolean;
      [key: string]: unknown;
    };
  };
}

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
        aiModel: "gpt-5-nano",
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
router.patch("/", requireSiteAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.session?.user;

    // Validate request body
    const validated = updateSiteSettingsSchema.parse(req.body);

    // Validate that the selected model has its API key configured using shared utility
    const modelAvailability = isModelAvailable(validated.aiModel);
    if (!modelAvailability.provider) {
      return res.status(400).json({ message: "Invalid AI model" });
    }

    if (!modelAvailability.available) {
      // Log internally but don't expose provider details to client
      console.error(`AI Service Error: Missing API key ${modelAvailability.envVar} for provider ${modelAvailability.provider}`);
      return res.status(400).json({
        message: "Selected model is not available. Please contact administrator."
      });
    }

    // Get the model config for audit logging
    const modelConfig = AI_MODELS_CONFIG[validated.aiModel as keyof typeof AI_MODELS_CONFIG];

    // Get previous settings for audit log
    const previousSettings = await storage.getSiteSettings();
    const previousModel = previousSettings?.aiModel || 'gpt-5-nano';

    // Update or create settings
    const updatedSettings = await storage.updateSiteSettings({
      aiModel: validated.aiModel,
      updatedBy: user?.id || null,
    });

    // Audit log for AI model change
    if (user?.id && previousModel !== validated.aiModel) {
      await storage.createAuditLog({
        userId: user.id,
        action: 'site_ai_model_changed',
        resourceType: 'site_settings',
        resourceId: 'global',
        details: JSON.stringify({
          previousModel,
          newModel: validated.aiModel,
          provider: modelConfig.provider
        }),
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null,
      });
    }

    res.json(updatedSettings);
  } catch (error) {
    console.error("Error updating site settings:", error);

    if (error instanceof ZodError) {
      return res.status(400).json({
        message: "Validation error",
        errors: error.errors,
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
