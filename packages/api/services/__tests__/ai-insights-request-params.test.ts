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
// No Google or legacy-style OpenAI model is selectable today; add one of each so those request shapes stay tested
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
      {
        key: 'gpt-legacy-test', provider: 'openai', apiModelId: 'gpt-legacy-test', label: 'GPT Legacy Test', description: 'test',
        tier: 'budget', costPer1M: { input: 0, output: 0 }, requestStyle: 'legacy', selectable: true,
      },
    ],
  };
});

import { AI_MODELS, AI_REQUEST_TIMEOUT_MS, generateCoachingInsights, ReportData, SYSTEM_PROMPT } from '../ai-insights-service';

const GENERIC = 'AI service encountered an error. Please try again or contact support.';
const INSIGHTS = '## Summary\ninsights';

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
    openaiSpy.mockReset().mockResolvedValue({ choices: [{ message: { content: INSIGHTS } }] });
    anthropicSpy.mockReset().mockResolvedValue({ content: [{ type: 'text', text: INSIGHTS }] });
    googleSpy.mockReset().mockResolvedValue({ response: { text: () => INSIGHTS } });
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    vi.stubEnv('GOOGLE_AI_API_KEY', 'test-key');
  });

  it.each(['gpt-5-nano', 'gpt-6-luna', 'gpt-6-sol'] as const)(
    'sends reasoning params (no temperature) for %s',
    async (modelKey) => {
      expect(await generateCoachingInsights(modelKey, reportData)).toBe(INSIGHTS);
      const params = openaiSpy.mock.calls[0][0];
      expect(params.model).toBe(modelKey);
      expect(params.reasoning_effort).toBe('low');
      expect(params.max_completion_tokens).toBe(4096);
      expect(params).not.toHaveProperty('temperature');
      expect(params).not.toHaveProperty('max_tokens');
    },
  );

  it('sends temperature and the real model ID for legacy-style Anthropic models', async () => {
    await generateCoachingInsights('claude-haiku-4.5', reportData);
    const params = anthropicSpy.mock.calls[0][0];
    expect(params.model).toBe('claude-haiku-4-5-20251001');
    expect(params.temperature).toBe(0.3);
    expect(params.max_tokens).toBe(4096);
  });

  it('sends a low temperature for legacy-style OpenAI models', async () => {
    await generateCoachingInsights('gpt-legacy-test' as any, reportData);
    const params = openaiSpy.mock.calls[0][0];
    expect(params.temperature).toBe(0.3);
    expect(params.max_tokens).toBe(4096);
    expect(params).not.toHaveProperty('reasoning_effort');
  });

  it('sends a low temperature to Google', async () => {
    await generateCoachingInsights('gemini-test' as any, reportData);
    expect(googleSpy.mock.calls[0][0].generationConfig).toMatchObject({ temperature: 0.3, maxOutputTokens: 4096 });
  });

  it('omits temperature for no-sampling Anthropic models', async () => {
    await generateCoachingInsights('claude-sonnet-5.5', reportData);
    const params = anthropicSpy.mock.calls[0][0];
    expect(params.model).toBe('claude-sonnet-5-5');
    expect(params).not.toHaveProperty('temperature');
    expect(params.max_tokens).toBe(4096);
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
    expect(await generateCoachingInsights('gemini-test' as any, reportData)).toBe(INSIGHTS);
    expect(googleModelSpy).toHaveBeenCalledWith({ model: 'gemini-test', systemInstruction: SYSTEM_PROMPT });
    const request = googleSpy.mock.calls[0][0];
    expect(request.contents).toEqual([{ role: 'user', parts: [{ text: expect.stringContaining('<report_data>') }] }]);
    expect(request.contents[0].parts[0].text).not.toContain(SYSTEM_PROMPT);
  });

  it('strips the analysis block from the provider text', async () => {
    anthropicSpy.mockResolvedValue({ content: [{ type: 'text', text: '<analysis>## x\nthinking</analysis>\n## Summary\nok' }] });
    expect(await generateCoachingInsights('claude-sonnet-5.5', reportData)).toBe('## Summary\nok');
  });

  it('throws the generic error, never raw analysis, when the output has no heading', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    anthropicSpy.mockResolvedValue({ content: [{ type: 'text', text: '<analysis>secret reasoning</analysis>' }] });
    await expect(generateCoachingInsights('claude-sonnet-5.5', reportData)).rejects.toThrow(
      'AI service encountered an error. Please try again or contact support.',
    );
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

  it('rejects text that filled max_tokens for legacy-style Anthropic models too', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    anthropicSpy.mockResolvedValue({
      stop_reason: 'max_tokens',
      content: [{ type: 'text', text: '## Summary\nlong but cut off' }],
    });
    await expect(generateCoachingInsights('claude-haiku-4.5', reportData)).rejects.toThrow(GENERIC);
  });

  it.each(['gpt-5-nano', 'gpt-legacy-test'] as const)('rejects an OpenAI finish_reason length (%s)', async (key) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    openaiSpy.mockResolvedValue({ choices: [{ finish_reason: 'length', message: { content: INSIGHTS } }] });
    await expect(generateCoachingInsights(key as any, reportData)).rejects.toThrow(GENERIC);
  });

  it('rejects a Google MAX_TOKENS finish reason', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    googleSpy.mockResolvedValue({ response: { candidates: [{ finishReason: 'MAX_TOKENS' }], text: () => INSIGHTS } });
    await expect(generateCoachingInsights('gemini-test' as any, reportData)).rejects.toThrow(GENERIC);
  });

  it('still returns complete responses (finish reasons stop / STOP / end_turn)', async () => {
    openaiSpy.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: INSIGHTS } }] });
    googleSpy.mockResolvedValue({ response: { candidates: [{ finishReason: 'STOP' }], text: () => INSIGHTS } });
    anthropicSpy.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: INSIGHTS }] });
    expect(await generateCoachingInsights('gpt-6-luna', reportData)).toBe(INSIGHTS);
    expect(await generateCoachingInsights('gemini-test' as any, reportData)).toBe(INSIGHTS);
    expect(await generateCoachingInsights('claude-haiku-4.5', reportData)).toBe(INSIGHTS);
  });

  it('defaults the request timeout to 60 seconds', () => {
    expect(AI_REQUEST_TIMEOUT_MS).toBe(60000);
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
