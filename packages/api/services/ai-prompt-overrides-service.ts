import { createHash } from "node:crypto";
import { aiPromptOverridesSchema, orgAiPromptOverridesSchema, type AIPromptOverrides, type OrgAIPromptOverrides } from "@shared/ai-prompt-overrides";

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

const sortedEntries = (o: AIPromptOverrides | undefined) => Object.entries(o ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));

/**
 * Site layer plus the organization layer (organizations.ai_prompt_overrides). An invalid org row is ignored (the
 * site wording applies) and reported. The hash covers both layers; with no org layer it equals the site hash.
 */
export function mergePromptOverrides(siteRaw: unknown, orgRaw: unknown): {
  site: AIPromptOverrides | undefined;
  org: OrgAIPromptOverrides | undefined;
  hash: string | null;
  siteInvalid: boolean;
  orgInvalid: boolean;
} {
  const s = resolveStoredOverrides(siteRaw);
  let org: OrgAIPromptOverrides | undefined;
  let orgInvalid = false;
  if (orgRaw !== null && orgRaw !== undefined) {
    const parsed = orgAiPromptOverridesSchema.safeParse(orgRaw);
    if (!parsed.success) orgInvalid = true;
    else if (Object.keys(parsed.data).length > 0) org = parsed.data;
  }
  if (!org) return { site: s.overrides, org, hash: s.hash, siteInvalid: s.invalid, orgInvalid };
  const hash = createHash("sha256")
    .update(JSON.stringify({ site: sortedEntries(s.overrides), org: sortedEntries(org) }))
    .digest("hex")
    .slice(0, 8);
  return { site: s.overrides, org, hash, siteInvalid: s.invalid, orgInvalid };
}
