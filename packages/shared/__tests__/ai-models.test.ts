import { describe, it, expect } from 'vitest';
import {
  AI_MODEL_REGISTRY,
  DEFAULT_AI_MODEL_KEY,
  ESTIMATED_TOKENS_PER_REPORT,
  SELECTABLE_AI_MODEL_KEYS,
  estimateCostPer100Reports,
  findModelsNearRetirement,
  getAIModel,
} from '../ai-models';

describe('AI model registry', () => {
  it('has unique keys and complete entries', () => {
    const keys = AI_MODEL_REGISTRY.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const m of AI_MODEL_REGISTRY) {
      expect(m.apiModelId).toBeTruthy();
      expect(m.label).toBeTruthy();
      expect(m.costPer1M.input).toBeGreaterThan(0);
      expect(m.costPer1M.output).toBeGreaterThan(0);
    }
  });

  it('defaults to gpt-6-luna, which is selectable', () => {
    expect(DEFAULT_AI_MODEL_KEY).toBe('gpt-6-luna');
    expect(SELECTABLE_AI_MODEL_KEYS).toContain(DEFAULT_AI_MODEL_KEY);
  });

  it('lists exactly the selectable entries as selectable keys', () => {
    const expected = AI_MODEL_REGISTRY.filter((m) => m.selectable).map((m) => m.key);
    expect([...SELECTABLE_AI_MODEL_KEYS]).toEqual(expected);
  });

  it.each(['claude-haiku-3', 'gemini-2.0-flash-lite', 'claude-sonnet-4.5'])(
    'keeps retired model %s resolvable but not selectable',
    (key) => {
      expect(getAIModel(key)).toBeDefined();
      expect(getAIModel(key)?.selectable).toBe(false);
      expect(SELECTABLE_AI_MODEL_KEYS).not.toContain(key);
    },
  );

  it('uses the real Anthropic model IDs and current prices', () => {
    expect(getAIModel('claude-haiku-4.5')).toMatchObject({
      apiModelId: 'claude-haiku-4-5-20251001',
      costPer1M: { input: 1, output: 5 },
    });
    expect(getAIModel('claude-sonnet-5.5')).toMatchObject({
      provider: 'anthropic',
      apiModelId: 'claude-sonnet-5-5',
      tier: 'premium',
      costPer1M: { input: 2, output: 10 },
      requestStyle: 'no-sampling',
      selectable: true,
    });
  });

  it('marks OpenAI GPT-5/6 models as reasoning-style', () => {
    for (const key of ['gpt-5-nano', 'gpt-6-luna', 'gpt-6-sol']) {
      expect(getAIModel(key)?.requestStyle).toBe('reasoning');
    }
  });

  it('only uses request styles that its provider understands', () => {
    for (const m of AI_MODEL_REGISTRY) {
      if (m.requestStyle === 'reasoning') expect(m.provider).toBe('openai');
      if (m.requestStyle === 'no-sampling') expect(m.provider).toBe('anthropic');
    }
  });

  it('returns undefined for unknown keys', () => {
    expect(getAIModel('nope')).toBeUndefined();
  });
});

describe('findModelsNearRetirement', () => {
  const make = (key: string, selectable: boolean, retireAfter?: string) =>
    ({
      key,
      provider: 'openai',
      apiModelId: key,
      label: key,
      description: key,
      tier: 'budget',
      costPer1M: { input: 1, output: 1 },
      requestStyle: 'reasoning',
      selectable,
      ...(retireAfter ? { retireAfter } : {}),
    }) as any;

  const models = [
    make('soon', true, '2026-12-11'),
    make('later', true, '2027-06-01'),
    make('undated', true),
    make('retired', false, '2026-10-01'),
  ];

  it('flags selectable models retiring within the window', () => {
    expect(findModelsNearRetirement(new Date('2026-11-20'), 30, models).map((m) => m.key)).toEqual(['soon']);
  });

  it('does not flag models outside the window, undated ones, or non-selectable ones', () => {
    expect(findModelsNearRetirement(new Date('2026-09-29'), 30, models)).toEqual([]);
  });

  it('keeps flagging a model after its retirement date has passed', () => {
    expect(findModelsNearRetirement(new Date('2027-01-15'), 30, models).map((m) => m.key)).toEqual(['soon']);
  });
});

describe('estimateCostPer100Reports', () => {
  it('prices the assumed tokens per report at the per-million rates, times 100 reports', () => {
    // 1,000 input + 1,000 output tokens per report
    expect(ESTIMATED_TOKENS_PER_REPORT).toEqual({ input: 1000, output: 1000 });
    expect(estimateCostPer100Reports({ input: 0.1, output: 0.5 })).toBeCloseTo(0.06, 6); // GPT-6 Luna
    expect(estimateCostPer100Reports({ input: 2, output: 10 })).toBeCloseTo(1.2, 6); // GPT-6 Sol / Sonnet 5.5
    expect(estimateCostPer100Reports({ input: 1, output: 5 })).toBeCloseTo(0.6, 6); // Haiku 4.5
  });

  it('scales linearly with price', () => {
    const base = estimateCostPer100Reports({ input: 0.1, output: 0.5 });
    expect(estimateCostPer100Reports({ input: 0.2, output: 1 })).toBeCloseTo(base * 2, 9);
  });

  it('is not the old formula, which was about 10x too small', () => {
    // old: (input * 0.5 + output * 1.5) / 10000 * 100
    const old = (0.1 * 0.5 + 0.5 * 1.5) / 10000 * 100;
    expect(estimateCostPer100Reports({ input: 0.1, output: 0.5 })).toBeGreaterThan(old * 5);
  });
});

