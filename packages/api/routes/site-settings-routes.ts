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
import { AI_PROMPT_CHECKLIST_LINES, AI_PROMPT_OVERRIDE_KEYS, AI_PROMPT_OVERRIDE_MAX, AI_PROMPT_ROLE_MAX, type AIPromptOverrides } from "@shared/ai-prompt-overrides";
import { resolveStoredOverrides } from "../services/ai-prompt-overrides-service";
import { AI_MODELS as AI_MODELS_CONFIG, DEFAULT_PROMPT_TEXT, buildSystemPrompt, isModelAvailable } from "../services/ai-insights-service";
import { checkModelsLive, isModelKnownUnavailable } from "../services/ai-model-availability";
import { AI_MODEL_REGISTRY, DEFAULT_AI_MODEL_KEY, findModelsNearRetirement, getAIModel, type AIModelDefinition } from "@shared/ai-models";

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
 * GET /api/site-settings/public
 * Get public site settings (wellness module status only)
 * Access: Any authenticated user
 */
router.get("/public", async (req, res) => {
  try {
    const settings = await storage.getSiteSettings();

    // Only return public information
    return res.json({
      wellnessModuleEnabled: settings?.wellnessModuleEnabled ?? true,
      sprintFvEnabled: settings?.sprintFvEnabled ?? false,
    });
  } catch (error) {
    console.error("Error fetching public site settings:", error);
    res.status(500).json({
      message: sanitizeError(error, "Failed to fetch site settings"),
    });
  }
});

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
        aiModel: DEFAULT_AI_MODEL_KEY,
        wellnessModuleEnabled: true,
        sprintFvEnabled: false,
        aiPromptOverrides: null,
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

    // Prepare update data
    const updateData: any = {
      updatedBy: user?.id || null,
    };

    // Validate AI model if provided
    if (validated.aiModel !== undefined) {
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

      // Reject a model its provider is known to have stopped serving (unknown status stays allowed)
      const modelDefinition = getAIModel(validated.aiModel);
      if (modelDefinition && (await isModelKnownUnavailable(modelDefinition))) {
        return res.status(400).json({
          message: "Selected model is no longer offered by its provider. Please choose another model.",
        });
      }

      updateData.aiModel = validated.aiModel;
    }

    // Add wellness module flag if provided
    if (validated.wellnessModuleEnabled !== undefined) {
      updateData.wellnessModuleEnabled = validated.wellnessModuleEnabled;
    }

    // Add sprint F-V flag if provided
    if (validated.sprintFvEnabled !== undefined) {
      updateData.sprintFvEnabled = validated.sprintFvEnabled;
    }

    // Whole-object replace; null and {} both mean "all code defaults"
    const newOverrides: AIPromptOverrides | null | undefined =
      validated.aiPromptOverrides === undefined
        ? undefined
        : validated.aiPromptOverrides && Object.keys(validated.aiPromptOverrides).length > 0
          ? validated.aiPromptOverrides
          : null;
    if (newOverrides !== undefined) updateData.aiPromptOverrides = newOverrides;

    // Get previous settings for audit log
    const previousSettings = await storage.getSiteSettings();
    const previousModel = previousSettings?.aiModel || DEFAULT_AI_MODEL_KEY;
    const previousWellness = previousSettings?.wellnessModuleEnabled ?? true;
    const previousSprintFv = previousSettings?.sprintFvEnabled ?? false;

    // Update or create settings
    const updatedSettings = await storage.updateSiteSettings(updateData);

    // Audit log for AI model change
    if (user?.id && validated.aiModel !== undefined && previousModel !== validated.aiModel) {
      const modelConfig = AI_MODELS_CONFIG[validated.aiModel as keyof typeof AI_MODELS_CONFIG];
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

    // Audit log for AI prompt wording: only the keys that changed, with their before and after text
    if (user?.id && newOverrides !== undefined) {
      const prev = (previousSettings?.aiPromptOverrides ?? {}) as Record<string, unknown>;
      const next = (newOverrides ?? {}) as Record<string, unknown>;
      const changedKeys = AI_PROMPT_OVERRIDE_KEYS.filter((k) => prev[k] !== next[k]);
      if (changedKeys.length > 0) {
        const pick = (o: Record<string, unknown>) =>
          Object.fromEntries(changedKeys.filter((k) => typeof o[k] === 'string').map((k) => [k, String(o[k]).slice(0, k === 'role' ? AI_PROMPT_ROLE_MAX : AI_PROMPT_OVERRIDE_MAX)]));
        await storage.createAuditLog({
          userId: user.id,
          action: 'site_ai_prompt_changed',
          resourceType: 'site_settings',
          resourceId: 'global',
          details: JSON.stringify({ changedKeys, before: pick(prev), after: pick(next) }),
          ipAddress: req.ip || null,
          userAgent: req.get('user-agent') || null,
        });
      }
    }

    // Audit log for wellness module toggle
    if (user?.id && validated.wellnessModuleEnabled !== undefined && previousWellness !== validated.wellnessModuleEnabled) {
      await storage.createAuditLog({
        userId: user.id,
        action: 'site_wellness_module_toggled',
        resourceType: 'site_settings',
        resourceId: 'global',
        details: JSON.stringify({
          previousEnabled: previousWellness,
          newEnabled: validated.wellnessModuleEnabled,
        }),
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null,
      });
    }

    // Audit log for Sprint F-V toggle
    if (user?.id && validated.sprintFvEnabled !== undefined && previousSprintFv !== validated.sprintFvEnabled) {
      await storage.createAuditLog({
        userId: user.id,
        action: 'site_sprint_fv_module_toggled',
        resourceType: 'site_settings',
        resourceId: 'global',
        details: JSON.stringify({
          previousEnabled: previousSprintFv,
          newEnabled: validated.sprintFvEnabled,
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
 * GET /api/site-settings/ai-prompt-defaults
 * Default text of every editable AI prompt slot, plus the system prompt as it is sent now (read-only preview).
 * Tone and checklist wording live in the user message, which is built per report, so they are not in the preview.
 * Access: Site admin only
 */
router.get("/ai-prompt-defaults", requireSiteAdmin, async (req, res) => {
  try {
    const settings = await storage.getSiteSettings();
    const { overrides } = resolveStoredOverrides(settings?.aiPromptOverrides);
    res.json({
      defaults: DEFAULT_PROMPT_TEXT,
      maxLength: AI_PROMPT_OVERRIDE_MAX,
      roleMaxLength: AI_PROMPT_ROLE_MAX,
      checklistLines: AI_PROMPT_CHECKLIST_LINES,
      systemPrompt: buildSystemPrompt(overrides),
      systemPromptNote: "Read-only. The audience tone and the analysis checklist are part of the user message, which is built for each report, so they are not shown here.",
    });
  } catch (error) {
    console.error("Error fetching AI prompt defaults:", error);
    res.status(500).json({
      message: sanitizeError(error, "Failed to fetch AI prompt defaults"),
    });
  }
});

/**
 * GET /api/site-settings/ai-models
 * Get list of selectable AI models with pricing, tiers and live status
 * - available: the provider's API key is configured on the server
 * - live: the provider currently lists the model (null = unknown: no key or provider unreachable)
 * - retireAfter / retiringSoon: announced retirement date, and whether it is within 30 days
 * Access: Site admin only
 */
router.get("/ai-models", requireSiteAdmin, async (req, res) => {
  try {
    const selectable: AIModelDefinition[] = AI_MODEL_REGISTRY.filter((m) => m.selectable);
    const live = await checkModelsLive(selectable).catch((error) => {
      console.error("AI model live check failed:", error?.message);
      return {} as Record<string, boolean | null>;
    });
    const retiringSoon = new Set(findModelsNearRetirement(new Date(), 30).map((m) => m.key));

    const models = selectable.map((m) => ({
      key: m.key,
      provider: m.provider,
      model: m.apiModelId,
      label: m.label,
      tier: m.tier,
      description: m.description,
      note: m.note ?? null,
      pricing: {
        inputPer1M: m.costPer1M.input,
        outputPer1M: m.costPer1M.output,
        currency: "USD",
      },
      available: isModelAvailable(m.key).available,
      live: live[m.key] ?? null,
      retireAfter: m.retireAfter ?? null,
      retiringSoon: retiringSoon.has(m.key),
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
