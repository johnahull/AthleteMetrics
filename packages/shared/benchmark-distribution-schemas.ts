import { z } from "zod";

/** Loader body for reference distributions (AM-FEAT-024). Raw samples only for now. */
const NO_CONTROL_CHARS = /^[^\p{Cc}]*$/u;
/** Free text: line breaks and tabs allowed, other control characters not */
const NO_CONTROL_CHARS_EXCEPT_WHITESPACE = /^(?:[\t\n\r]|[^\p{Cc}])*$/u;
const age = z.number().int().min(0).max(99);

const distributionRowSchema = z
  .object({
    metricCode: z.string().trim().min(1).max(50),
    sex: z.enum(["male", "female"]),
    ageMin: age,
    ageMax: age,
    kind: z.literal("raw"),
    n: z.number().int().positive(),
    values: z.array(z.number().finite()).min(1).max(20000),
  })
  .strict()
  .refine((r) => r.ageMin <= r.ageMax, { message: "ageMin must be <= ageMax", path: ["ageMin"] })
  .refine((r) => r.n === r.values.length, { message: "n must equal values.length", path: ["n"] });

export const createBenchmarkDistributionSchema = z
  .object({
    label: z.string().trim().min(1).max(200).regex(NO_CONTROL_CHARS, "Label must not contain control characters"),
    source: z.string().trim().min(1).max(200).regex(NO_CONTROL_CHARS, "Source must not contain control characters"),
    notes: z.string().trim().max(5000).regex(NO_CONTROL_CHARS_EXCEPT_WHITESPACE, "Notes must not contain control characters").optional(),
    // 500 rows x 8 columns stays well under the 65535-parameter limit of one multi-row insert
    distributions: z.array(distributionRowSchema).min(1).max(500),
  })
  .strict()
  .superRefine((body, ctx) => {
    const groups = new Map<string, Array<{ ageMin: number; ageMax: number; i: number }>>();
    body.distributions.forEach((d, i) => {
      const key = `${d.metricCode}|${d.sex}`;
      groups.set(key, [...(groups.get(key) ?? []), { ageMin: d.ageMin, ageMax: d.ageMax, i }]);
    });
    for (const bands of groups.values()) {
      bands.sort((a, b) => a.ageMin - b.ageMin);
      let maxEnd = bands[0].ageMax; // running max: a wide band overlaps every later band it covers
      for (let k = 1; k < bands.length; k++) {
        if (bands[k].ageMin <= maxEnd) {
          ctx.addIssue({ code: "custom", message: "Age bands overlap or repeat for this metric and sex", path: ["distributions", bands[k].i, "ageMin"] });
        }
        maxEnd = Math.max(maxEnd, bands[k].ageMax);
      }
    }
  });

export type CreateBenchmarkDistributionInput = z.infer<typeof createBenchmarkDistributionSchema>;
