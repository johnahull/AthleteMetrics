/**
 * AI model registry - the single source of truth for every AI model the app knows about.
 *
 * The settings validation enum, the API service config, the admin dropdown and the shared
 * AIModel type are all derived from this file. To add, change or retire a model, edit only
 * the entry here (then check prices and IDs against the provider's docs).
 *
 * Keep this file dependency-free: it is imported by both the API and the web bundle.
 */

export type AIProviderName = 'openai' | 'google' | 'anthropic';
export type AITier = 'budget' | 'premium';

/**
 * How requests to the model are shaped:
 * - reasoning: OpenAI GPT-5/6 style (reasoning_effort + max_completion_tokens, no temperature)
 * - legacy: temperature + max tokens
 * - no-sampling: Anthropic models that reject non-default temperature/top_p/top_k
 */
export type AIRequestStyle = 'reasoning' | 'legacy' | 'no-sampling';

export interface AIModelDefinition {
  /** Stable key stored in site_settings.ai_model and reports.coaching_insights_model */
  key: string;
  provider: AIProviderName;
  /** Exact model ID sent to the provider's API */
  apiModelId: string;
  label: string;
  description: string;
  tier: AITier;
  /** USD per 1M tokens (standard tier, short context) */
  costPer1M: { input: number; output: number };
  requestStyle: AIRequestStyle;
  /** false = retired/replaced: kept only so old records still resolve to a label */
  selectable: boolean;
  /** YYYY-MM-DD, when the provider has announced removal of this model */
  retireAfter?: string;
  note?: string;
}

export const AI_MODEL_REGISTRY = [
  // Budget tier
  {
    key: 'gpt-5-nano',
    provider: 'openai',
    apiModelId: 'gpt-5-nano',
    label: 'GPT-5 Nano',
    description: 'OpenAI GPT-5 Nano - Cheap & Fast',
    tier: 'budget',
    costPer1M: { input: 0.05, output: 0.4 },
    requestStyle: 'reasoning',
    selectable: true,
    // OpenAI announced shutdown of the gpt-5-nano-2025-08-07 snapshot on this date
    retireAfter: '2026-12-11',
  },
  {
    key: 'gpt-6-luna',
    provider: 'openai',
    apiModelId: 'gpt-6-luna',
    label: 'GPT-6 Luna',
    description: 'OpenAI GPT-6 Luna - Fast & Affordable',
    tier: 'budget',
    costPer1M: { input: 0.1, output: 0.5 },
    requestStyle: 'reasoning',
    selectable: true,
  },
  {
    key: 'gemini-2.5-flash-lite',
    provider: 'google',
    apiModelId: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash Lite',
    description: 'Google Gemini 2.5 Flash-Lite - Fast & Efficient',
    tier: 'budget',
    costPer1M: { input: 0.1, output: 0.4 },
    requestStyle: 'legacy',
    selectable: true,
    note: 'Google limits access to the 2.5 models to users who have already used them',
  },
  {
    key: 'claude-haiku-4.5',
    provider: 'anthropic',
    apiModelId: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5',
    description: 'Anthropic Claude Haiku 4.5 - Cost-Effective Claude 4',
    tier: 'budget',
    costPer1M: { input: 1, output: 5 },
    requestStyle: 'legacy',
    selectable: true,
  },

  // Premium tier
  {
    key: 'gpt-6-sol',
    provider: 'openai',
    apiModelId: 'gpt-6-sol',
    label: 'GPT-6 Sol',
    description: 'OpenAI GPT-6 Sol - Flagship Reasoning',
    tier: 'premium',
    costPer1M: { input: 2, output: 10 },
    requestStyle: 'reasoning',
    selectable: true,
  },
  {
    key: 'gemini-2.5-pro',
    provider: 'google',
    apiModelId: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    description: 'Google Gemini 2.5 Pro - High Performance',
    tier: 'premium',
    costPer1M: { input: 1.25, output: 10 },
    requestStyle: 'legacy',
    selectable: true,
    note: 'Google limits access to the 2.5 models to users who have already used them',
  },
  {
    key: 'claude-sonnet-5.5',
    provider: 'anthropic',
    apiModelId: 'claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5',
    description: 'Anthropic Claude Sonnet 5.5 - Best Quality',
    tier: 'premium',
    costPer1M: { input: 2, output: 10 },
    requestStyle: 'no-sampling',
    selectable: true,
  },

  // Retired / replaced: not selectable, kept so historical reports still show a label
  {
    key: 'claude-sonnet-4.5',
    provider: 'anthropic',
    apiModelId: 'claude-sonnet-4-5-20250929',
    label: 'Claude Sonnet 4.5',
    description: 'Anthropic Claude Sonnet 4.5 (replaced by Claude Sonnet 5.5)',
    tier: 'premium',
    costPer1M: { input: 3, output: 15 },
    requestStyle: 'legacy',
    selectable: false,
  },
  {
    key: 'claude-haiku-3',
    provider: 'anthropic',
    apiModelId: 'claude-3-haiku-20240307',
    label: 'Claude Haiku 3',
    description: 'Anthropic Claude Haiku 3 (retired April 20, 2026)',
    tier: 'budget',
    costPer1M: { input: 0.25, output: 1.25 },
    requestStyle: 'legacy',
    selectable: false,
  },
  {
    key: 'gemini-2.0-flash-lite',
    provider: 'google',
    apiModelId: 'gemini-2.0-flash-lite',
    label: 'Gemini 2.0 Flash Lite',
    description: 'Google Gemini 2.0 Flash-Lite (shut down June 1, 2026)',
    tier: 'budget',
    costPer1M: { input: 0.075, output: 0.3 },
    requestStyle: 'legacy',
    selectable: false,
  },
] as const satisfies readonly AIModelDefinition[];

export type AIModelKey = (typeof AI_MODEL_REGISTRY)[number]['key'];
export type SelectableAIModelKey = Extract<(typeof AI_MODEL_REGISTRY)[number], { selectable: true }>['key'];

export const DEFAULT_AI_MODEL_KEY: SelectableAIModelKey = 'gpt-6-luna';

/** Keys a site admin can pick. Non-empty tuple so it can feed z.enum(). */
export const SELECTABLE_AI_MODEL_KEYS = AI_MODEL_REGISTRY.filter((m) => m.selectable).map(
  (m) => m.key,
) as unknown as readonly [SelectableAIModelKey, ...SelectableAIModelKey[]];

/** Look up any model, including retired ones. */
export function getAIModel(key: string): AIModelDefinition | undefined {
  return AI_MODEL_REGISTRY.find((m) => m.key === key);
}

/**
 * Selectable models whose announced retirement date is past or within `withinDays` of `now`.
 */
export function findModelsNearRetirement(
  now: Date,
  withinDays: number,
  models: readonly AIModelDefinition[] = AI_MODEL_REGISTRY,
): AIModelDefinition[] {
  const cutoff = now.getTime() + withinDays * 24 * 60 * 60 * 1000;
  return models.filter(
    (m) => m.selectable && m.retireAfter !== undefined && new Date(m.retireAfter).getTime() <= cutoff,
  );
}
