import { describe, it, expect, vi, beforeEach } from 'vitest';

const { openaiSpy, anthropicSpy, googleSpy, googleModelSpy } = vi.hoisted(() => ({
  openaiSpy: vi.fn(),
  anthropicSpy: vi.fn(),
  googleSpy: vi.fn(),
  googleModelSpy: vi.fn(),
}));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({ chat: { completions: { create: openaiSpy } } })),
}));
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({ messages: { create: anthropicSpy } })),
}));
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: googleModelSpy.mockImplementation(() => ({ generateContent: googleSpy })),
  })),
}));
// No Google model is selectable today; add one so the Google request shape stays tested
vi.mock('@shared/ai-models', async (importOriginal) => {
  const original = await importOriginal<typeof import('@shared/ai-models')>();
  return {
    ...original,
    AI_MODEL_REGISTRY: [
      ...original.AI_MODEL_REGISTRY,
      {
        key: 'gemini-test', provider: 'google', apiModelId: 'gemini-test', label: 'Gemini Test', description: 'test',
        tier: 'budget', costPer1M: { input: 0, output: 0 }, requestStyle: 'legacy', selectable: true,
      },
    ],
  };
});

import { AI_MODELS, generateCoachingInsights, ReportData, SYSTEM_PROMPT } from '../ai-insights-service';

// Request shape per provider / request style (see packages/shared/ai-models.ts)

const reportData: ReportData = {
  reportType: 'team',
  reportName: 'Test Report',
  organizationName: 'Test Org',
  timeframe: '2024-01-01 to 2024-12-31',
  metrics: [],
};

describe('AI_MODELS (derived from the registry)', () => {
  it('registers gpt-6-luna as a budget OpenAI model', () => {
    expect(AI_MODELS['gpt-6-luna']).toMatchObject({
      provider: 'openai',
      model: 'gpt-6-luna',
      tier: 'budget',
      costPer1M: { input: 0.1, output: 0.5 },
    });
  });

  it('registers gpt-6-sol as a premium OpenAI model', () => {
    expect(AI_MODELS['gpt-6-sol']).toMatchObject({
      provider: 'openai',
      model: 'gpt-6-sol',
      tier: 'premium',
      costPer1M: { input: 2, output: 10 },
    });
  });

  it('sends the real Anthropic model IDs', () => {
    expect(AI_MODELS['claude-haiku-4.5'].model).toBe('claude-haiku-4-5-20251001');
    expect(AI_MODELS['claude-sonnet-5.5'].model).toBe('claude-sonnet-5-5');
  });

  it.each(['claude-haiku-3', 'gemini-2.0-flash-lite', 'claude-sonnet-4.5', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'])(
    'does not offer retired model %s',
    (key) => {
      expect(Object.keys(AI_MODELS)).not.toContain(key);
    },
  );
});

describe('request parameters', () => {
  beforeEach(() => {
    openaiSpy.mockReset().mockResolvedValue({ choices: [{ message: { content: 'insights' } }] });
    anthropicSpy.mockReset().mockResolvedValue({ content: [{ type: 'text', text: 'insights' }] });
    googleSpy.mockReset().mockResolvedValue({ response: { text: () => 'insights' } });
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    vi.stubEnv('GOOGLE_AI_API_KEY', 'test-key');
  });

  it.each(['gpt-5-nano', 'gpt-6-luna', 'gpt-6-sol'] as const)(
    'sends reasoning params (no temperature) for %s',
    async (modelKey) => {
      expect(await generateCoachingInsights(modelKey, reportData)).toBe('insights');
      const params = openaiSpy.mock.calls[0][0];
      expect(params.model).toBe(modelKey);
      expect(params.reasoning_effort).toBe('low');
      expect(params.max_completion_tokens).toBe(2048);
      expect(params).not.toHaveProperty('temperature');
      expect(params).not.toHaveProperty('max_tokens');
    },
  );

  it('sends temperature and the real model ID for legacy-style Anthropic models', async () => {
    await generateCoachingInsights('claude-haiku-4.5', reportData);
    const params = anthropicSpy.mock.calls[0][0];
    expect(params.model).toBe('claude-haiku-4-5-20251001');
    expect(params.temperature).toBe(0.7);
    expect(params.max_tokens).toBe(2048);
  });

  it('omits temperature for no-sampling Anthropic models', async () => {
    await generateCoachingInsights('claude-sonnet-5.5', reportData);
    const params = anthropicSpy.mock.calls[0][0];
    expect(params.model).toBe('claude-sonnet-5-5');
    expect(params).not.toHaveProperty('temperature');
    expect(params.max_tokens).toBe(2048);
    // Sonnet 5.5 runs adaptive thinking (effort high) by default and thinking tokens count against
    // max_tokens; between_tools is the documented way to keep thinking off for a plain generation
    expect(params.thinking).toEqual({ type: 'between_tools' });
  });

  it('sends the shared system prompt as the OpenAI system message and the data as the user message', async () => {
    await generateCoachingInsights('gpt-6-luna', reportData);
    const [system, user] = openaiSpy.mock.calls[0][0].messages;
    expect(system).toEqual({ role: 'system', content: SYSTEM_PROMPT });
    expect(user.role).toBe('user');
    expect(user.content).toContain('<report_data>');
    expect(user.content).not.toContain(SYSTEM_PROMPT);
  });

  it('sends the shared system prompt as the Anthropic system parameter', async () => {
    await generateCoachingInsights('claude-sonnet-5.5', reportData);
    const params = anthropicSpy.mock.calls[0][0];
    expect(params.system).toBe(SYSTEM_PROMPT);
    expect(params.messages).toEqual([{ role: 'user', content: expect.stringContaining('<report_data>') }]);
  });

  it('sends the shared system prompt as the Google systemInstruction', async () => {
    googleModelSpy.mockClear();
    expect(await generateCoachingInsights('gemini-test' as any, reportData)).toBe('insights');
    expect(googleModelSpy).toHaveBeenCalledWith({ model: 'gemini-test', systemInstruction: SYSTEM_PROMPT });
    const request = googleSpy.mock.calls[0][0];
    expect(request.contents).toEqual([{ role: 'user', parts: [{ text: expect.stringContaining('<report_data>') }] }]);
    expect(request.contents[0].parts[0].text).not.toContain(SYSTEM_PROMPT);
  });

  it('does not send a thinking config for legacy-style Anthropic models', async () => {
    await generateCoachingInsights('claude-haiku-4.5', reportData);
    expect(anthropicSpy.mock.calls[0][0]).not.toHaveProperty('thinking');
  });

  it.each(['max_tokens', 'refusal'])(
    'does not return a %s Sonnet 5.5 response as if it were complete insights',
    async (stopReason) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      anthropicSpy.mockResolvedValue({
        stop_reason: stopReason,
        content: [{ type: 'text', text: 'partial insi' }],
      });
      await expect(generateCoachingInsights('claude-sonnet-5.5', reportData)).rejects.toThrow();
    },
  );

  it('still rejects a refusal for legacy-style Anthropic models', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    anthropicSpy.mockResolvedValue({ stop_reason: 'refusal', content: [] });
    await expect(generateCoachingInsights('claude-haiku-4.5', reportData)).rejects.toThrow();
  });

  it('keeps returning text that fills max_tokens for legacy-style Anthropic models (unchanged behaviour)', async () => {
    anthropicSpy.mockResolvedValue({
      stop_reason: 'max_tokens',
      content: [{ type: 'text', text: 'long but usable insights' }],
    });
    expect(await generateCoachingInsights('claude-haiku-4.5', reportData)).toBe('long but usable insights');
  });
});

describe('model-not-found errors', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    vi.stubEnv('GOOGLE_AI_API_KEY', 'test-key');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('does not treat an unrelated error that merely mentions 404 as a missing model', async () => {
    anthropicSpy.mockReset().mockRejectedValue(new Error('upstream gateway said 404 somewhere in its body'));
    await expect(generateCoachingInsights('claude-haiku-4.5', reportData)).rejects.toThrow(
      'AI service temporarily unavailable',
    );
  });

  it.each([
    ['openai', 'gpt-6-luna', openaiSpy],
    ['anthropic', 'claude-sonnet-5.5', anthropicSpy],
  ] as const)('%s 404 becomes a configuration error naming the model server-side', async (_p, key, spy) => {
    spy.mockReset().mockRejectedValue(Object.assign(new Error('404 model not found'), { status: 404 }));
    await expect(generateCoachingInsights(key, reportData)).rejects.toThrow(
      'AI model configuration error. Contact administrator.',
    );
    expect(JSON.stringify((console.error as any).mock.calls)).toContain(AI_MODELS[key].model);
  });
});
