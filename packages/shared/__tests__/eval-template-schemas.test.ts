import { describe, it, expect } from 'vitest';
import {
  evalTemplateMetricsSchema,
  createEvalTemplateSchema,
  evalSelectionSchema,
  evalReportSettingsInputSchema,
  applyEvalTemplateSchema,
} from '../eval-template-schemas';

const metric = (metricKey: string, extra: Record<string, unknown> = {}) => ({ metricKey, isRequired: true, displayOrder: 1, ...extra });

describe('evalTemplateMetricsSchema', () => {
  it('accepts a list and defaults isRequired to false', () => {
    const out = evalTemplateMetricsSchema.parse([{ metricKey: 'DASH_40', displayOrder: 0 }]);
    expect(out[0].isRequired).toBe(false);
  });
  it('rejects an empty list, duplicate keys, long keys, long labels and negative order', () => {
    expect(evalTemplateMetricsSchema.safeParse([]).success).toBe(false);
    expect(evalTemplateMetricsSchema.safeParse([metric('A'), metric('A')]).success).toBe(false);
    expect(evalTemplateMetricsSchema.safeParse([metric('X'.repeat(51))]).success).toBe(false);
    expect(evalTemplateMetricsSchema.safeParse([metric('A', { customLabel: 'x'.repeat(101) })]).success).toBe(false);
    expect(evalTemplateMetricsSchema.safeParse([metric('A', { displayOrder: -1 })]).success).toBe(false);
    expect(evalTemplateMetricsSchema.safeParse([metric('A', { displayOrder: 10000 })]).success).toBe(false);
    expect(evalTemplateMetricsSchema.safeParse([metric('A', { displayOrder: 9999 })]).success).toBe(true);
  });
});

describe('createEvalTemplateSchema', () => {
  it('requires a name and trims it', () => {
    expect(createEvalTemplateSchema.safeParse({ name: '  ', sport: 'SOCCER', metrics: [metric('A')] }).success).toBe(false);
    expect(createEvalTemplateSchema.parse({ name: ' Mine ', sport: 'SOCCER', metrics: [metric('A')] }).name).toBe('Mine');
  });
});

describe('evalSelectionSchema', () => {
  const sel = { preset: 'senior', metricKeys: ['DASH_10'], collegeGauge: true, headline: true, freshAndHealthy: true, coachNote: true, strengths: true, retestTrend: false };
  it('accepts a full selection and rejects an unknown preset', () => {
    expect(evalSelectionSchema.safeParse(sel).success).toBe(true);
    expect(evalSelectionSchema.safeParse({ ...sel, preset: 'college' }).success).toBe(false);
  });
});

describe('evalReportSettingsInputSchema', () => {
  it('accepts partial preset overrides and a null last selection', () => {
    const out = evalReportSettingsInputSchema.parse({ presets: { senior: { collegeGauge: false } }, lastSelection: null });
    expect(out.presets?.senior?.collegeGauge).toBe(false);
  });
  it('rejects unknown preset names', () => {
    expect(evalReportSettingsInputSchema.safeParse({ presets: { college: {} } }).success).toBe(false);
  });
});

describe('applyEvalTemplateSchema', () => {
  it('takes an optional includeOptional list of template keys', () => {
    expect(applyEvalTemplateSchema.parse({ templateId: 'x' }).includeOptional).toBeUndefined();
    expect(applyEvalTemplateSchema.parse({ templateId: 'x', includeOptional: ['RSI_LEFT'] }).includeOptional).toEqual(['RSI_LEFT']);
    expect(applyEvalTemplateSchema.safeParse({ templateId: 'x', includeOptional: 'RSI_LEFT' }).success).toBe(false);
  });
});
