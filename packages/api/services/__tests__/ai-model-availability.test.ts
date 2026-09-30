import { describe, it, expect, vi, beforeEach } from 'vitest';

const { openaiList, anthropicList } = vi.hoisted(() => ({
  openaiList: vi.fn(),
  anthropicList: vi.fn(),
}));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({ models: { list: openaiList } })),
}));
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({ models: { list: anthropicList } })),
}));

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { checkModelsLive, clearAvailabilityCache, isModelKnownUnavailable } from '../ai-model-availability';

async function* asyncIter<T>(items: T[]) {
  for (const item of items) yield item;
}

const models = [
  { key: 'gpt-6-luna', provider: 'openai', apiModelId: 'gpt-6-luna' },
  { key: 'gpt-6-sol', provider: 'openai', apiModelId: 'gpt-6-sol' },
  { key: 'claude-sonnet-5.5', provider: 'anthropic', apiModelId: 'claude-sonnet-5-5' },
  { key: 'gemini-2.5-pro', provider: 'google', apiModelId: 'gemini-2.5-pro' },
] as const;

describe('checkModelsLive', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    clearAvailabilityCache();
    openaiList.mockReset().mockReturnValue(asyncIter([{ id: 'gpt-6-luna' }, { id: 'gpt-4o' }]));
    anthropicList.mockReset().mockReturnValue(asyncIter([{ id: 'claude-sonnet-5-5' }]));
    fetchMock.mockReset().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: 'models/gemini-2.5-pro' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('OPENAI_API_KEY', 'openai-secret');
    vi.stubEnv('ANTHROPIC_API_KEY', 'anthropic-secret');
    vi.stubEnv('GOOGLE_AI_API_KEY', 'google-secret');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('reports true for served models and false for models the provider no longer lists', async () => {
    const live = await checkModelsLive(models);
    expect(live).toEqual({
      'gpt-6-luna': true,
      'gpt-6-sol': false,
      'claude-sonnet-5.5': true,
      'gemini-2.5-pro': true,
    });
  });

  it('pages through Google results and sends the key in a header, not the URL', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: 'models/gemini-2.5-flash-lite' }], nextPageToken: 'p2' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: 'models/gemini-2.5-pro' }] }),
      });

    const live = await checkModelsLive([models[3]]);

    expect(live['gemini-2.5-pro']).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url)).not.toContain('google-secret');
      expect(init.headers['x-goog-api-key']).toBe('google-secret');
    }
    expect(String(fetchMock.mock.calls[1][0])).toContain('pageToken=p2');
  });

  it('gives each provider call an abort signal so a timed-out lookup is cancelled', async () => {
    await checkModelsLive([models[0], models[2]]);
    expect(openaiList.mock.calls[0][0]).toEqual({ signal: expect.any(AbortSignal) });
    expect(anthropicList.mock.calls[0][1]).toEqual({ signal: expect.any(AbortSignal) });
  });

  it('shares one abort signal (one overall budget) across all Google pages', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: 'models/gemini-2.5-flash-lite' }], nextPageToken: 'p2' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: 'models/gemini-2.5-pro' }] }),
      });

    await checkModelsLive([models[3]]);

    const [first, second] = fetchMock.mock.calls.map(([, init]) => init.signal);
    expect(first).toBeInstanceOf(AbortSignal);
    expect(second).toBe(first);
  });

  it('returns null (unknown) when the provider key is missing', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const live = await checkModelsLive([models[0]]);
    expect(live['gpt-6-luna']).toBeNull();
    expect(openaiList).not.toHaveBeenCalled();
  });

  it('fails open with null when the provider call fails, without logging keys', async () => {
    openaiList.mockReset().mockImplementation(() => {
      throw new Error('network down');
    });
    const live = await checkModelsLive([models[0], models[2]]);
    expect(live['gpt-6-luna']).toBeNull();
    expect(live['claude-sonnet-5.5']).toBe(true);
    expect(JSON.stringify((console.error as any).mock.calls)).not.toContain('openai-secret');
  });

  it('caches provider results, and clearAvailabilityCache resets them', async () => {
    await checkModelsLive([models[0]]);
    await checkModelsLive([models[0]]);
    expect(openaiList).toHaveBeenCalledTimes(1);

    clearAvailabilityCache();
    openaiList.mockReturnValue(asyncIter([{ id: 'gpt-6-luna' }]));
    await checkModelsLive([models[0]]);
    expect(openaiList).toHaveBeenCalledTimes(2);
  });

  it('disables SDK retries so a failing provider cannot stall the admin page', async () => {
    await checkModelsLive([models[0], models[2]]);
    expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0 }));
    expect(Anthropic).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0 }));
  });

  it('treats a provider that never answers as unknown once the deadline passes', async () => {
    vi.useFakeTimers();
    try {
      openaiList.mockReset().mockReturnValue(
        (async function* () {
          await new Promise(() => {});
        })(),
      );
      const pending = checkModelsLive([models[0]]);
      await vi.advanceTimersByTimeAsync(5_000);
      expect((await pending)['gpt-6-luna']).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shares one in-flight lookup between concurrent callers', async () => {
    await Promise.all([checkModelsLive([models[0]]), checkModelsLive([models[0]])]);
    expect(openaiList).toHaveBeenCalledTimes(1);
  });

  it('caches a failed lookup briefly, then retries', async () => {
    vi.useFakeTimers();
    try {
      openaiList.mockReset().mockImplementation(() => {
        throw new Error('network down');
      });
      expect((await checkModelsLive([models[0]]))['gpt-6-luna']).toBeNull();
      await checkModelsLive([models[0]]);
      expect(openaiList).toHaveBeenCalledTimes(1); // failure cached

      vi.advanceTimersByTime(61_000);
      openaiList.mockReset().mockReturnValue(asyncIter([{ id: 'gpt-6-luna' }]));
      expect((await checkModelsLive([models[0]]))['gpt-6-luna']).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('isModelKnownUnavailable', () => {
  beforeEach(() => {
    clearAvailabilityCache();
    openaiList.mockReset().mockReturnValue(asyncIter([{ id: 'gpt-6-luna' }]));
    vi.stubEnv('OPENAI_API_KEY', 'openai-secret');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  const luna = { key: 'gpt-6-luna', provider: 'openai', apiModelId: 'gpt-6-luna' } as const;
  const sol = { key: 'gpt-6-sol', provider: 'openai', apiModelId: 'gpt-6-sol' } as const;

  it('is true only when the provider answered without the model', async () => {
    expect(await isModelKnownUnavailable(sol)).toBe(true);
    expect(await isModelKnownUnavailable(luna)).toBe(false);
  });

  it('is false when availability is unknown (no key or provider failure)', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    expect(await isModelKnownUnavailable(sol)).toBe(false);

    vi.stubEnv('OPENAI_API_KEY', 'openai-secret');
    clearAvailabilityCache();
    openaiList.mockReset().mockImplementation(() => {
      throw new Error('network down');
    });
    expect(await isModelKnownUnavailable(sol)).toBe(false);
  });
});
