import { createHash } from "node:crypto";
import { aiPromptOverridesSchema, type AIPromptOverrides } from "@shared/ai-prompt-overrides";

/**
 * Stored site_settings.ai_prompt_overrides as the prompt builders should see it. A row that fails the schema
 * (hand-edited jsonb, an old shape) must never fail generation for every organization, so it is reported as
 * invalid and the caller falls back to the code defaults.
 */
export function resolveStoredOverrides(raw: unknown): { overrides: AIPromptOverrides | undefined; hash: string | null; invalid: boolean } {
  if (raw === null || raw === undefined) return { overrides: undefined, hash: null, invalid: false };
  const parsed = aiPromptOverridesSchema.safeParse(raw);
  if (!parsed.success) return { overrides: undefined, hash: null, invalid: true };
  const entries = Object.entries(parsed.data).sort(([a], [b]) => (a < b ? -1 : 1));
  if (entries.length === 0) return { overrides: undefined, hash: null, invalid: false };
  // Short, so a log line shows which wording produced an insight without printing the wording
  const hash = createHash("sha256").update(JSON.stringify(entries)).digest("hex").slice(0, 8);
  return { overrides: parsed.data, hash, invalid: false };
}
