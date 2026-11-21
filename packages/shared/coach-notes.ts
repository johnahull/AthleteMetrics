import { z } from "zod";

export const isRealDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** Coach-authored context for the AI insights of one individual report. All fields optional. */
export const coachNotesSchema = z.object({
  goals: z.string().max(1000).optional(),
  seasonPhase: z.enum(["off", "pre", "in", "post"]).optional(),
  trainingAgeYears: z.number().min(0).max(30).optional(),
  maturation: z.enum(["pre", "circa", "post"]).optional(),
  restriction: z.object({
    area: z.string().max(200),
    status: z.string().max(200),
    ptCleared: z.boolean(),
  }).strict().optional(),
  testDayFlags: z.array(z.enum(["poor_wellness", "surface", "weather", "protocol_deviation"]))
    .max(4)
    .refine((flags) => new Set(flags).size === flags.length, "Duplicate flags")
    .optional(),
  limiterOverride: z.string().min(1).max(100).optional(),
  sessionsPerWeek: z.number().int().min(0).max(14).optional(),
  nextRetestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDate, "Invalid date").optional(),
  whatISaw: z.string().max(1500).optional(),
  /** Lets the AI use "What I saw" in parent and athlete insights. Absent = off; locked off for under-13 or unknown-DOB athletes. */
  shareWhatISaw: z.boolean().optional(),
}).strict();

export type CoachNotes = z.infer<typeof coachNotesSchema>;
