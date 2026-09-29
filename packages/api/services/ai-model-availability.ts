/**
 * Live availability of AI models.
 *
 * Asks each provider's "list models" API which model IDs it currently serves, so the admin UI can
 * flag a configured model that a provider has retired. Provider APIs return IDs only (no prices,
 * tiers or deprecation dates), so those stay in packages/shared/ai-models.ts.
 *
 * Fail-open: a missing key or a provider outage yields `null` ("unknown"), never `false`.
 * Results are cached in memory so the admin page doesn't call the providers on every load.
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { AIProviderName } from "@shared/ai-models";
import { getProviderApiKeyEnvVar } from "./ai-insights-service";

const SUCCESS_TTL_MS = 60 * 60 * 1000; // 1 hour
const FAILURE_TTL_MS = 60 * 1000; // retry a failed provider after 1 minute
// One provider lookup (including Google pagination) may take at most this long. Kept short because
// the admin page waits on it; a slower provider is reported as "unknown".
const LOOKUP_DEADLINE_MS = 5_000;
const GOOGLE_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";

interface CacheEntry {
  at: number;
  ids: Set<string> | null;
}

const cache = new Map<AIProviderName, CacheEntry>();
// Concurrent cold requests share one provider call
const inflight = new Map<AIProviderName, Promise<Set<string> | null>>();

export function clearAvailabilityCache(): void {
  cache.clear();
  inflight.clear();
}

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

async function listOpenAI(apiKey: string): Promise<Set<string>> {
  const client = new OpenAI({ apiKey, timeout: LOOKUP_DEADLINE_MS, maxRetries: 0 });
  const ids = new Set<string>();
  for await (const model of client.models.list()) {
    ids.add(model.id);
  }
  return ids;
}

async function listAnthropic(apiKey: string): Promise<Set<string>> {
  const client = new Anthropic({ apiKey, timeout: LOOKUP_DEADLINE_MS, maxRetries: 0 });
  const ids = new Set<string>();
  for await (const model of client.models.list({ limit: 1000 })) {
    ids.add(model.id);
  }
  return ids;
}

async function listGoogle(apiKey: string): Promise<Set<string>> {
  const ids = new Set<string>();
  let pageToken: string | undefined;
  do {
    const url = `${GOOGLE_MODELS_URL}?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    // Key goes in a header so it never ends up in URLs or logs
    const res = await fetch(url, {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(LOOKUP_DEADLINE_MS),
    });
    if (!res.ok) {
      throw new Error(`Google models list failed with status ${res.status}`);
    }
    const body = (await res.json()) as { models?: Array<{ name: string }>; nextPageToken?: string };
    for (const model of body.models ?? []) {
      ids.add(model.name.replace(/^models\//, ""));
    }
    pageToken = body.nextPageToken;
  } while (pageToken);
  return ids;
}

const listers: Record<AIProviderName, (apiKey: string) => Promise<Set<string>>> = {
  openai: listOpenAI,
  anthropic: listAnthropic,
  google: listGoogle,
};

async function fetchAndCache(provider: AIProviderName, apiKey: string): Promise<Set<string> | null> {
  let ids: Set<string> | null = null;
  try {
    ids = await withDeadline(listers[provider](apiKey), LOOKUP_DEADLINE_MS);
  } catch (error: any) {
    // Log only safe fields; never the key
    console.error(`AI model availability check failed for provider ${provider}:`, {
      message: error?.message,
      status: error?.status,
    });
  }
  cache.set(provider, { at: Date.now(), ids });
  return ids;
}

async function getProviderModelIds(provider: AIProviderName): Promise<Set<string> | null> {
  const cached = cache.get(provider);
  if (cached) {
    const ttl = cached.ids ? SUCCESS_TTL_MS : FAILURE_TTL_MS;
    if (Date.now() - cached.at < ttl) return cached.ids;
  }

  const apiKey = process.env[getProviderApiKeyEnvVar(provider)];
  if (!apiKey) return null; // no key: availability unknown, don't cache

  let pending = inflight.get(provider);
  if (!pending) {
    pending = fetchAndCache(provider, apiKey).finally(() => inflight.delete(provider));
    inflight.set(provider, pending);
  }
  return pending;
}

/**
 * True only when the provider responded and does not list the model. Unknown (no API key, provider
 * outage) is false, so saving a model stays possible when a provider can't be reached.
 */
export async function isModelKnownUnavailable(model: {
  key: string;
  provider: AIProviderName;
  apiModelId: string;
}): Promise<boolean> {
  const live = await checkModelsLive([model]).catch((error) => {
    console.error("AI model live check failed:", error?.message);
    return {} as Record<string, boolean | null>;
  });
  return live[model.key] === false;
}

/**
 * For each model, true if its provider currently lists the ID, false if the provider responded
 * without it, null if unknown (no API key or the provider call failed).
 */
export async function checkModelsLive(
  models: ReadonlyArray<{ key: string; provider: AIProviderName; apiModelId: string }>,
): Promise<Record<string, boolean | null>> {
  const providers = [...new Set(models.map((m) => m.provider))];
  const idsByProvider = new Map<AIProviderName, Set<string> | null>();
  await Promise.all(
    providers.map(async (provider) => {
      idsByProvider.set(provider, await getProviderModelIds(provider));
    }),
  );

  const result: Record<string, boolean | null> = {};
  for (const model of models) {
    const ids = idsByProvider.get(model.provider);
    result[model.key] = ids ? ids.has(model.apiModelId) : null;
  }
  return result;
}
