import { z } from "zod";

/**
 * Validation for eval battery templates and per-organization eval report settings (AM-FEAT-019 P2).
 * A template stores logical keys (see the eval-report metric-key-map), not metric codes, so a code rename
 * does not break saved templates. A key that is not in the map is treated as a literal site_metrics code.
 */
export const EVAL_PRESETS = ["middle_school", "high_school", "senior"] as const;

const metricKey = z.string().trim().min(1).max(50);

export const evalTemplateMetricSchema = z.object({
  metricKey,
  isRequired: z.boolean().default(false),
  displayOrder: z.number().int().min(0).max(9999),
  customLabel: z.string().trim().min(1).max(100).optional(),
});

export const evalTemplateMetricsSchema = z
  .array(evalTemplateMetricSchema)
  .min(1)
  .max(100)
  .refine((list) => new Set(list.map((m) => m.metricKey)).size === list.length, { message: "Duplicate metricKey" });

const templateFields = {
  name: z.string().trim().min(1).max(200),
  sport: z.string().trim().min(1).max(50),
  description: z.string().trim().max(2000).optional(),
};

export const createEvalTemplateSchema = z.object({ ...templateFields, metrics: evalTemplateMetricsSchema });
/** Save an event's current metric set as a template; the metrics come from the event. */
export const createEvalTemplateFromEventSchema = z.object({ ...templateFields, sport: templateFields.sport.default("SOCCER") });
export const updateEvalTemplateSchema = z.object({
  name: templateFields.name.optional(),
  sport: templateFields.sport.optional(),
  description: templateFields.description,
  metrics: evalTemplateMetricsSchema.optional(),
});

export const evalSelectionSchema = z.object({
  preset: z.enum(EVAL_PRESETS),
  metricKeys: z.array(metricKey).max(100),
  collegeGauge: z.boolean(),
  headline: z.boolean(),
  freshAndHealthy: z.boolean(),
  coachNote: z.boolean(),
  strengths: z.boolean(),
  retestTrend: z.boolean(),
});

/** The overrides a coach saved on top of one preset's defaults. */
export const evalPresetOverrideSchema = evalSelectionSchema.omit({ preset: true }).partial();

export const evalReportSettingsInputSchema = z.object({
  presets: z.object({
    middle_school: evalPresetOverrideSchema.optional(),
    high_school: evalPresetOverrideSchema.optional(),
    senior: evalPresetOverrideSchema.optional(),
  }).strict().optional(),
  lastSelection: evalSelectionSchema.nullable().optional(),
});

export const applyEvalTemplateSchema = z.object({
  templateId: z.string().min(1).max(36),
  /** Template keys of optional metrics to add on top of the required ones. */
  includeOptional: z.array(metricKey).max(100).optional(),
});

export type EvalTemplateMetric = z.infer<typeof evalTemplateMetricSchema>;
export type CreateEvalTemplateInput = z.infer<typeof createEvalTemplateSchema>;
export type EvalSelectionInput = z.infer<typeof evalSelectionSchema>;
export type EvalReportSettingsInput = z.infer<typeof evalReportSettingsInputSchema>;
