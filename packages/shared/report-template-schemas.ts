import { z } from "zod";

/**
 * Validation for report templates: the metrics, benchmark sets / picks and chart choices a coach
 * saves once and picks in the report wizard. Sets are stored by id so a new report uses the
 * set's current contents; saved reports stay frozen.
 */
const NO_CONTROL_CHARS = /^[^\p{Cc}]*$/u;
const NO_CONTROL_CHARS_EXCEPT_WHITESPACE = /^(?:[\t\n\r]|[^\p{Cc}])*$/u;

const MAX_IDS = 200;
const idList = z
  .array(z.string().trim().min(1).max(100))
  .max(MAX_IDS)
  .transform((ids) => Array.from(new Set(ids)));

const bool = z.boolean();
const teamCharts = z
  .object({ benchmarkStanding: bool, trends: bool, boxSwarm: bool, leaderboard: bool, tierDistribution: bool })
  .partial()
  .strict();
const individualCharts = z
  .object({ radar: bool, benchmarkStanding: bool, trends: bool, distribution: bool, fvProfile: bool })
  .partial()
  .strict();

export const reportTemplateChartsSchema = z
  .object({ team: teamCharts.optional(), individual: individualCharts.optional() })
  .strict();

const fields = {
  name: z.string().trim().min(1).max(200).regex(NO_CONTROL_CHARS, "Name must not contain control characters"),
  description: z
    .string()
    .trim()
    .max(2000)
    .regex(NO_CONTROL_CHARS_EXCEPT_WHITESPACE, "Description must not contain control characters")
    .optional(),
  metrics: idList.refine((m) => m.length >= 1, { message: "At least one metric is required" }),
  benchmarkSetIds: idList.default([]),
  siteBenchmarkIds: idList.default([]),
  customBenchmarkIds: idList.default([]),
  charts: reportTemplateChartsSchema.default({}),
};

export const createReportTemplateSchema = z.object(fields).strict();
export const updateReportTemplateSchema = z
  .object({
    name: fields.name.optional(),
    description: fields.description.nullable(), // null clears it
    metrics: fields.metrics.optional(),
    benchmarkSetIds: idList.optional(),
    siteBenchmarkIds: idList.optional(),
    customBenchmarkIds: idList.optional(),
    charts: reportTemplateChartsSchema.optional(),
  })
  .strict();

export type ReportTemplateCharts = z.infer<typeof reportTemplateChartsSchema>;
export type CreateReportTemplateInput = z.infer<typeof createReportTemplateSchema>;
export type UpdateReportTemplateInput = z.infer<typeof updateReportTemplateSchema>;
