import { z } from "zod";

/**
 * Config of a `reports` row with reportType 'eval' (AM-FEAT-019), and the body of the eval report routes.
 * Eval rows are written only by the eval report routes; they do not go through insertReportSchema.
 * The frozen model carries no pre-test survey data: a model with such a key at any depth is rejected.
 */
export const EVAL_REPORT_TYPE = "eval" as const;

export const COACH_NOTE_MAX_LENGTH = 2000;
const METRIC_KEY_MAX_LENGTH = 50;
const MAX_METRICS = 50;

const WELLNESS_KEY = /sleep|soreness|stress|energy|cycle|wellness|mood|readiness|pain/i;

function hasWellnessKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasWellnessKey);
  if (value !== null && typeof value === "object") {
    return Object.entries(value).some(([key, v]) => WELLNESS_KEY.test(key) || hasWellnessKey(v));
  }
  return false;
}

export const evalPresetSchema = z.enum(["middle_school", "high_school", "senior"]);
export const evalLoadSchema = z.enum(["light", "medium", "heavy"]);

/** Strip control characters (newline and tab stay), trim, and cap the length. Empty becomes null. */
const coachNoteSchema = z
  .string()
  // eslint-disable-next-line no-control-regex
  .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
  .pipe(z.string().max(COACH_NOTE_MAX_LENGTH))
  .transform((s) => (s === "" ? null : s));

/** A logical key ("DASH_10") or a metric code ("TOP_SPEED"): upper-case identifiers */
const METRIC_ID = /^[A-Za-z0-9_]+$/;
const metricId = z.string().min(1).max(METRIC_KEY_MAX_LENGTH).regex(METRIC_ID);

const metricKeyList = z.array(z.string().min(1).max(METRIC_KEY_MAX_LENGTH)).max(MAX_METRICS);

/** What the coach chose on the selection screen. Every field is optional; the preset fills the rest. */
export const evalSelectionInputSchema = z.object({
  preset: evalPresetSchema.optional(),
  /** Logical metric keys (e.g. "DASH_10") or measured metric codes (e.g. "TOP_SPEED"), in report order */
  metricKeys: z.array(metricId).max(MAX_METRICS).optional(),
  /** Report-wide college gauge switch */
  collegeGauge: z.boolean().optional(),
  /** Per-metric college gauge override, keyed by logical metric key or metric code */
  metricCollegeGauge: z.record(metricId, z.boolean()).optional(),
  sections: z
    .object({
      headline: z.boolean().optional(),
      freshAndHealthy: z.boolean().optional(),
      coachNote: z.boolean().optional(),
      /** "What we saw" note first and prominent */
      noteFirst: z.boolean().optional(),
      strengths: z.boolean().optional(),
      retestTrend: z.boolean().optional(),
      radar: z.boolean().optional(),
    })
    .optional(),
});

/** Body of the preview and save routes. Unknown keys are stripped. */
export const evalReportRequestSchema = z.object({
  selection: evalSelectionInputSchema.optional(),
  load: evalLoadSchema.nullable().optional(),
  /** null clears the note */
  coachNote: coachNoteSchema.nullable().optional(),
  strengthsOverride: metricKeyList.optional(),
  developmentAreasOverride: metricKeyList.optional(),
  limiterOverride: metricId.nullable().optional(),
});

export type EvalSelectionInput = z.infer<typeof evalSelectionInputSchema>;
export type EvalReportRequest = z.infer<typeof evalReportRequestSchema>;

/** The EvalReportModel (packages/api/services/eval-report/model.ts), frozen at generation. Top-level keys are checked. */
export const frozenModelSchema = z
  .object({
    athlete: z.record(z.unknown()),
    eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    metrics: z.array(z.record(z.unknown())),
    freshAndHealthy: z.record(z.unknown()),
    strengths: z.array(z.string()),
    developmentAreas: z.array(z.string()),
    limiter: z.string().nullable(),
    coachNote: z.string().nullable(),
    selection: z.object({ preset: evalPresetSchema, noteFirst: z.boolean() }).passthrough(),
  })
  .passthrough()
  .refine((model) => !hasWellnessKey(model), { message: "The model must not contain survey fields" });

export const evalReportConfigSchema = z.object({
  eventId: z.string().min(1),
  athleteId: z.string().min(1),
  /** Metric codes shown in the report */
  metrics: z.array(z.string().min(1).max(METRIC_KEY_MAX_LENGTH)).max(MAX_METRICS),
  selection: evalSelectionInputSchema,
  load: evalLoadSchema.nullable(),
  coachNote: z.string().max(COACH_NOTE_MAX_LENGTH).nullable(),
  strengthsOverride: metricKeyList.optional(),
  developmentAreasOverride: metricKeyList.optional(),
  limiterOverride: z.string().max(METRIC_KEY_MAX_LENGTH).nullable().optional(),
  model: frozenModelSchema,
});

export type EvalReportConfig = z.infer<typeof evalReportConfigSchema>;
