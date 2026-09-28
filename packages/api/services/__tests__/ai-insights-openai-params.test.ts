import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createSpy } = vi.hoisted(() => ({ createSpy: vi.fn() }));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: createSpy } },
  })),
}));

import { AI_MODELS, generateCoachingInsights, ReportData } from '../ai-insights-service';

/**
 * Verifies the OpenAI request shape for reasoning-style models (GPT-5 / GPT-6):
 * reasoning_effort + max_completion_tokens, never temperature / max_tokens.
 */

const reportData: ReportData = {
  reportType: 'team',
  reportName: 'Test Report',
  organizationName: 'Test Org',
  timeframe: '2024-01-01 to 2024-12-31',
  metrics: [],
};

describe('AI_MODELS – GPT-6 entries', () => {
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
});

describe('OpenAI provider request parameters', () => {
  beforeEach(() => {
    createSpy.mockReset();
    createSpy.mockResolvedValue({ choices: [{ message: { content: 'insights' } }] });
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
  });

  it.each(['gpt-5-nano', 'gpt-6-luna', 'gpt-6-sol'] as const)(
    'sends reasoning params (no temperature) for %s',
    async (modelKey) => {
      const result = await generateCoachingInsights(modelKey, reportData);

      expect(result).toBe('insights');
      expect(createSpy).toHaveBeenCalledTimes(1);
      const params = createSpy.mock.calls[0][0];
      expect(params.model).toBe(modelKey);
      expect(params.reasoning_effort).toBe('low');
      expect(params.max_completion_tokens).toBe(2048);
      expect(params).not.toHaveProperty('temperature');
      expect(params).not.toHaveProperty('max_tokens');
    },
  );
});
