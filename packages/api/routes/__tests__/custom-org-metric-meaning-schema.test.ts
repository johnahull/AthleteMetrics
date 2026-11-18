import { describe, it, expect, vi } from 'vitest';

vi.mock('../../db', () => ({ db: {} }));
vi.mock('../../services/custom-org-metric-service', () => ({ getCustomOrgMetricService: () => ({}) }));
vi.mock('../../middleware', () => ({ requireAuth: vi.fn(), requireOrganizationAccess: vi.fn(() => vi.fn()) }));

import { createCustomMetricSchema, updateCustomMetricSchema } from '../custom-org-metric-routes';

const base = { label: 'Agility', metricType: 'lower_is_better' as const };

describe('custom metric meaning validation', () => {
  it('accepts plain parent wording and trims it', () => {
    const r = createCustomMetricSchema.parse({ ...base, meaning: '  How quickly he changes direction.  ' });
    expect(r.meaning).toBe('How quickly he changes direction.');
  });

  it.each([
    'May point to an injury risk.',
    'He is cleared to play.',
    'Shows he should lose weight.',
    'We predict a faster time next month.',
    'A diagnosis of weak hips.',
  ])('rejects %s with a clear message', (meaning) => {
    const r = createCustomMetricSchema.safeParse({ ...base, meaning });
    expect(r.success).toBe(false);
    expect(r.error!.flatten().fieldErrors.meaning?.[0]).toMatch(/must not contain/);
  });

  it('rejects over 400 characters', () => {
    expect(createCustomMetricSchema.safeParse({ ...base, meaning: 'a'.repeat(401) }).success).toBe(false);
  });

  it('empty string becomes null', () => {
    expect(createCustomMetricSchema.parse({ ...base, meaning: '' }).meaning).toBeNull();
    expect(updateCustomMetricSchema.parse({ meaning: '  ' }).meaning).toBeNull();
  });

  it('update accepts null to clear, and applies the same scan', () => {
    expect(updateCustomMetricSchema.parse({ meaning: null }).meaning).toBeNull();
    expect(updateCustomMetricSchema.safeParse({ meaning: 'cleared for sport' }).success).toBe(false);
    expect(updateCustomMetricSchema.parse({ label: 'x' }).meaning).toBeUndefined();
  });
});
