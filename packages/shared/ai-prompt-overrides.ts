import { z } from "zod";

/** Prompt slots a site admin may reword. Locked rules (safety, grounding, headings, fencing) stay in code. */
export const AI_PROMPT_OVERRIDE_KEYS = ["role", "philosophy", "toneParent", "toneAthlete", "toneCoach", "analysisChecklist"] as const;
export type AIPromptOverrideKey = (typeof AI_PROMPT_OVERRIDE_KEYS)[number];

export const AI_PROMPT_OVERRIDE_MAX = 1500;

export const AI_PROMPT_ROLE_MAX = 200;
/** analysisChecklist is one line per checklist item 2, 3, 4, 6, 7, 8, 9 */
export const AI_PROMPT_CHECKLIST_LINES = 7;

const LINE_BREAK = /[\n\r\u2028\u2029]/;

/**
 * Text that goes into a prompt slot: NFKC (so full-width brackets become ASCII), every < > { } and backtick removed
 * (fence escapes, the {{first_name}} placeholder, code fences; no pair logic, so nesting cannot rebuild a token),
 * no line-leading # (headings), no blank lines. Idempotent.
 */
export function sanitizePromptOverride(input: string): string {
  let text = input;
  // Removing characters can leave something NFKC would change; repeat until stable (a pass only ever shrinks the text)
  for (let i = 0; i < 5; i++) {
    const next = text
      .normalize("NFKC")
      .replace(/[<>{}`]/g, "")
      .split(LINE_BREAK)
      .map((line) => line.replace(/^(?:\s*#)+/, "").trim())
      .filter(Boolean)
      .join("\n");
    if (next === text) break;
    text = next;
  }
  return text;
}

// The raw cap stops a huge body before it is normalized; the final cap is after NFKC, which can expand text
const slot = (max = AI_PROMPT_OVERRIDE_MAX) =>
  z
    .string()
    .max(max * 4)
    .transform(sanitizePromptOverride)
    .pipe(z.string().max(max));

const role = z
  .string()
  .refine((v) => !LINE_BREAK.test(v.trim()), "role must be a single line")
  .pipe(slot(AI_PROMPT_ROLE_MAX));

const checklist = slot().refine(
  (v) => v === "" || v.split("\n").length === AI_PROMPT_CHECKLIST_LINES,
  `analysisChecklist needs exactly ${AI_PROMPT_CHECKLIST_LINES} lines (checklist items 2, 3, 4, 6, 7, 8 and 9, in order; blank lines do not count), or leave it empty for the default`,
);

export const aiPromptOverridesSchema = z
  .object({
    role: role.optional(),
    philosophy: slot().optional(),
    toneParent: slot().optional(),
    toneAthlete: slot().optional(),
    toneCoach: slot().optional(),
    analysisChecklist: checklist.optional(),
  })
  .strict()
  // A key that is empty after sanitizing is removed, so it falls back to the code default
  .transform((o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v)) as AIPromptOverrides);

/** Slots an organization admin may reword for their own org; role and analysisChecklist stay site-only. */
export const ORG_AI_PROMPT_OVERRIDE_KEYS = ["philosophy", "toneParent", "toneAthlete", "toneCoach"] as const;
export type OrgAIPromptOverrideKey = (typeof ORG_AI_PROMPT_OVERRIDE_KEYS)[number];

export const orgAiPromptOverridesSchema = z
  .object({
    philosophy: slot().optional(),
    toneParent: slot().optional(),
    toneAthlete: slot().optional(),
    toneCoach: slot().optional(),
  })
  .strict()
  .transform((o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v)) as OrgAIPromptOverrides);

export type OrgAIPromptOverrides = Partial<Record<OrgAIPromptOverrideKey, string>>;

export type AIPromptOverrides = Partial<Record<AIPromptOverrideKey, string>>;
