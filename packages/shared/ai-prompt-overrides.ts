import { z } from "zod";

/** Prompt slots a site admin may reword. Locked rules (safety, grounding, headings, fencing) stay in code. */
export const AI_PROMPT_OVERRIDE_KEYS = ["role", "philosophy", "toneParent", "toneAthlete", "toneCoach", "analysisChecklist"] as const;
export type AIPromptOverrideKey = (typeof AI_PROMPT_OVERRIDE_KEYS)[number];

export const AI_PROMPT_OVERRIDE_MAX = 1500;

/**
 * Text that goes into a prompt slot: NFKC (so full-width brackets become ASCII), no < > (fence escapes), no code
 * fences, no {{ }} (the first-name placeholder), no line-leading # (headings), no blank lines. Idempotent.
 */
export function sanitizePromptOverride(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[<>]/g, "")
    .replace(/`{3,}/g, "")
    .replace(/\{\{|\}\}/g, "")
    .replace(/^[ \t]*(?:#[ \t]*)+/gm, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

// The raw cap stops a huge body before it is normalized; the final cap is after NFKC, which can expand text
const slot = z
  .string()
  .max(AI_PROMPT_OVERRIDE_MAX * 4)
  .transform(sanitizePromptOverride)
  .pipe(z.string().max(AI_PROMPT_OVERRIDE_MAX));

export const aiPromptOverridesSchema = z
  .object({
    role: slot.optional(),
    philosophy: slot.optional(),
    toneParent: slot.optional(),
    toneAthlete: slot.optional(),
    toneCoach: slot.optional(),
    analysisChecklist: slot.optional(),
  })
  .strict()
  // A key that is empty after sanitizing is removed, so it falls back to the code default
  .transform((o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v)) as AIPromptOverrides);

export type AIPromptOverrides = Partial<Record<AIPromptOverrideKey, string>>;
