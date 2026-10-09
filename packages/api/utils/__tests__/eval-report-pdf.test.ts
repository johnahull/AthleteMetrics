import { describe, it, expect } from 'vitest';
import type { jsPDF } from 'jspdf';
import { barPosition, buildEvalReportPdf, headerColor, winAnsi, EVAL_PDF_BOTTOM_LIMIT, EVAL_PDF_TOP_LIMIT } from '../eval-report-pdf';
import type { EvalMetricResult, EvalReportModel } from '../../services/eval-report/model';

/** Text drawn on the pages, in order. jsPDF writes uncompressed `(text) Tj` operators. */
function pdfText(doc: jsPDF): string {
  const raw = doc.output();
  const out: string[] = [];
  for (const m of raw.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) out.push(m[1].replace(/\\([()\\])/g, '$1'));
  return out.join('\n');
}

const CODES: Array<[string, string, string, string]> = [
  ['DASH_10', 'DASH_10YD', '10-yard dash', 's'],
  ['FLY_10', 'FLY10_TIME', 'Fly 10', 's'],
  ['CMJ_HOH', 'JUMP_CMJ_HOH', 'Jump height', 'in'],
  ['505', 'AGILITY_505_YD', '5-0-5 agility (faster leg)', 's'],
  ['SQUAT_JUMP', 'JUMP_SJ_HEIGHT', 'Squat jump height', 'in'],
  ['EUR', 'POWER_EUR', 'Elastic use ratio', ''],
  ['DASH_20', 'DASH_20YD', '20-yard dash', 's'],
  ['DASH_30', 'DASH_30YD', '30-yard dash', 's'],
  ['DASH_40', 'DASH_40YD', '40-yard dash', 's'],
  ['MOMENTUM', 'MOMENTUM', 'Momentum', 'kg m/s'],
];

function metric(i: number, withComparison: boolean, over: Partial<EvalMetricResult> = {}): EvalMetricResult {
  const [key, code, label, unit] = CODES[i % CODES.length];
  return {
    key: key as EvalMetricResult['key'],
    code,
    label,
    value: 2 + i / 10,
    unit,
    comparison: withComparison
      ? { kind: 'average', name: 'Average', averageValue: 2.05, operator: 'lte', status: i % 2 ? 'below' : 'at_or_better', distancePct: i % 2 ? -4 : 6 }
      : null,
    collegeStandard: null,
    collegeGauge: false,
    trend: null,
    ...over,
  };
}

function model(n: number, comparisons = true, over: Partial<EvalReportModel> = {}): EvalReportModel {
  return {
    athlete: { name: 'Sam Rivera', age: 15, graduationYear: 2028, sport: 'Soccer', team: 'Rush U16' },
    eventDate: '2026-05-01',
    metrics: Array.from({ length: n }, (_, i) => metric(i, comparisons)),
    freshAndHealthy: { load: 'medium', balance: { status: 'worth_working_on', label: 'Worth working on', lsiPercent: 82.5 }, movement: 'Efficient' },
    strengths: ['DASH_10', 'FLY_10'],
    developmentAreas: ['505', 'CMJ_HOH'],
    limiter: '505',
    coachNote: 'Strong first step and a clean arm swing. Keep building single-leg strength.',
    selection: {
      preset: 'high_school',
      metricKeys: [],
      collegeGauge: false,
      headline: true,
      noteFirst: false,
      freshAndHealthy: true,
      coachNote: true,
      strengths: true,
      retestTrend: true,
    },
    ...over,
  };
}

const org = { name: 'Big Time Athletes', brandPrimaryColor: '#123456', brandSecondaryColor: '#abcdef', brandTagline: null };

describe('eval report PDF renderer', () => {
  it('renders 3 and 10 metrics with the athlete header, values with units and a gauge per comparison', () => {
    for (const n of [3, 10]) {
      const { doc, blocks } = buildEvalReportPdf(model(n), org);
      const text = pdfText(doc);
      expect(text).toContain('Sam Rivera');
      expect(text).toContain('Class of 2028');
      expect(text).toContain('Soccer');
      expect(text).toContain('Rush U16');
      expect(text).toContain('May 1, 2026');
      expect(text).toContain('Big Time Athletes');
      expect(text).toContain('10-yard dash');
      expect(text).toContain('2.00 s');
      expect(blocks.filter((b) => b.kind === 'gauge')).toHaveLength(n);
    }
  });

  it('shows a value and unit with no gauge for metrics without a comparison', () => {
    const { doc, blocks } = buildEvalReportPdf(model(4, false), org);
    expect(blocks.filter((b) => b.kind === 'gauge')).toHaveLength(0);
    expect(blocks.filter((b) => b.kind === 'metric')).toHaveLength(4);
    expect(pdfText(doc)).toContain('2.2 in');
  });

  it('renders a model with zero metrics and no optional sections', () => {
    const m = model(0, true, { freshAndHealthy: {}, strengths: [], developmentAreas: [], limiter: null, coachNote: null });
    const { doc } = buildEvalReportPdf(m, org);
    const text = pdfText(doc);
    expect(text).toContain('Sam Rivera');
    expect(text).not.toContain('Fresh & Healthy');
    expect(text).not.toContain('What we saw');
    expect(text).not.toContain('Strengths');
  });

  it('omits the Fresh & Healthy lines the model omits', () => {
    const m = model(3, true, { freshAndHealthy: { movement: 'Advanced' } });
    const text = pdfText(buildEvalReportPdf(m, org).doc);
    expect(text).toContain('Fresh & Healthy');
    expect(text).toContain('Movement');
    expect(text).toContain('Advanced');
    expect(text).not.toMatch(/Load/);
    expect(text).not.toMatch(/Balance/);
  });

  it('carries no risk, injury, medical, placement, price or college-path wording for a model with LSI data', () => {
    const m = model(10, true, { metrics: [...model(9).metrics, metric(0, false, { code: 'AGILITY_505_YD_LSI', key: '505_LSI', label: 'Left-right balance', value: 82.5, unit: '%' })] });
    const text = pdfText(buildEvalReportPdf(m, org).doc);
    expect(text).toContain('Worth working on');
    expect(text).not.toMatch(/elevated|risk|injur|medical|placement|foundation|elite|FIERCE|\$|D1|path|\bhe\b|\bshe\b|\bhis\b|\bher\b/i);
  });

  it('puts the coach note before the metrics when noteFirst, after the sections otherwise', () => {
    const first = pdfText(buildEvalReportPdf(model(3, true, { selection: { ...model(3).selection, noteFirst: true } }), org).doc);
    expect(first.indexOf('What we saw')).toBeGreaterThan(-1);
    expect(first.indexOf('What we saw')).toBeLessThan(first.indexOf('10-yard dash'));
    const later = pdfText(buildEvalReportPdf(model(3), org).doc);
    expect(later.indexOf('What we saw')).toBeGreaterThan(later.indexOf('10-yard dash'));
  });

  const college = { kind: 'average' as const, name: 'D1 Average', averageValue: 1.87, operator: 'lte' as const, status: 'below' as const, distancePct: -3 };

  it('draws the college standard only for a metric whose own college switch is on', () => {
    const withCollege = (on: boolean, reportWide: boolean) =>
      model(3, true, { metrics: model(3).metrics.map((x) => ({ ...x, collegeStandard: college, collegeGauge: on })), selection: { ...model(3).selection, collegeGauge: reportWide } });
    const on = pdfText(buildEvalReportPdf(withCollege(true, true), org).doc);
    expect(on).toContain('College standard');
    expect(on).not.toMatch(/D1/);
    // Per-metric off wins over the report-wide switch
    expect(pdfText(buildEvalReportPdf(withCollege(false, true), org).doc)).not.toContain('College standard');
    expect(pdfText(buildEvalReportPdf(withCollege(false, false), org).doc)).not.toContain('College standard');
  });

  it('omits the "marked on the bar" note when the metric has no age-group bar', () => {
    const m = model(3, false, { metrics: model(3, false).metrics.map((x) => ({ ...x, collegeStandard: college, collegeGauge: true })) });
    const text = pdfText(buildEvalReportPdf(m, org).doc);
    expect(text).toContain('College standard');
    expect(text).not.toContain('marked on the bar');
  });

  it('uses the bar words in the status line', () => {
    const text = pdfText(buildEvalReportPdf(model(3), org).doc);
    expect(text).toContain('Ahead of or at the age-group average');
    expect(text).toContain('Behind the age-group average');
    expect(text).not.toMatch(/Below/);
  });

  it('puts the dot right of the average tick for a positive distance and left for a negative one', () => {
    const { blocks } = buildEvalReportPdf(model(2), org);
    const ticks = blocks.filter((b) => b.kind === 'avgTick');
    const dots = blocks.filter((b) => b.kind === 'dot');
    expect(dots[0].x!).toBeGreaterThan(ticks[0].x!); // distancePct +6
    expect(dots[1].x!).toBeLessThan(ticks[1].x!); // distancePct -4
    expect(barPosition(10)).toBeGreaterThan(0.5);
    expect(barPosition(-10)).toBeLessThan(0.5);
  });

  it('puts the college tick right of the average tick for an lte metric with a lower college value', () => {
    const m = model(1, true, { metrics: model(1).metrics.map((x) => ({ ...x, collegeStandard: college, collegeGauge: true })) });
    const { blocks } = buildEvalReportPdf(m, org);
    expect(blocks.find((b) => b.kind === 'collegeTick')!.x!).toBeGreaterThan(blocks.find((b) => b.kind === 'avgTick')!.x!);
  });

  it('never prints a tier name: a tiers comparison is value only', () => {
    const tiers = { kind: 'tiers' as const, comparison: { benchmarkName: 'x', benchmarkValue: 90, athleteValue: 82, meetsOrExceeds: false, percentageDiff: -5, comparisonOperator: 'gte', tierName: 'Elevated Risk' } };
    const m = model(3, true, { metrics: model(3).metrics.map((x) => ({ ...x, comparison: tiers })) });
    const { doc, blocks } = buildEvalReportPdf(m, org);
    const text = pdfText(doc);
    expect(text).not.toMatch(/Elevated|Risk/i);
    expect(text).toContain('10-yard dash');
    expect(blocks.filter((b) => b.kind === 'gauge')).toHaveLength(0);
  });

  it('hides the limiter and strengths when the strengths section is off, and the metrics when headline is off', () => {
    const off = model(3, true, { selection: { ...model(3).selection, strengths: false } });
    const text = pdfText(buildEvalReportPdf(off, org).doc);
    expect(text).not.toContain('Biggest opportunity');
    expect(text).not.toContain('Strengths');
    const noHeadline = model(3, true, { selection: { ...model(3).selection, headline: false } });
    const { doc, blocks } = buildEvalReportPdf(noHeadline, org);
    expect(blocks.some((b) => b.kind === 'headline' || b.kind === 'metric')).toBe(false);
    expect(pdfText(doc)).toContain('Fresh & Healthy');
  });

  it('breaks the headline between rows so page 1 is used, repeating the title as (continued)', () => {
    const m = model(10, true, { metrics: model(10).metrics.map((x) => ({ ...x, collegeStandard: college, collegeGauge: true })) });
    expect(buildEvalReportPdf(model(10), org).blocks.filter((b) => b.kind === 'headline')).toHaveLength(1);
    const { doc, blocks } = buildEvalReportPdf(m, org);
    const chunks = blocks.filter((b) => b.kind === 'headline');
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].page).toBe(1);
    expect(chunks[0].bottom).toBeGreaterThan(200);
    expect(chunks[1].page).toBe(2);
    expect(pdfText(doc)).toContain('(continued)');
    // 10 metric rows are still all drawn, none split
    expect(blocks.filter((b) => b.kind === 'metric')).toHaveLength(10);
  });

  it('cuts long names with an ellipsis and keeps the event date in the header', () => {
    const long = 'A'.repeat(200);
    const m = model(3, true, { athlete: { name: long, age: 15, graduationYear: 2028, sport: 'Soccer', team: long } });
    const text = pdfText(buildEvalReportPdf(m, { ...org, name: long }).doc);
    expect(text).toContain('...');
    expect(text).toContain('Evaluated May 1, 2026');
    expect(text).not.toContain(long);
  });

  it('falls back to the dark header colour when the brand colour is too light for white text', () => {
    expect(headerColor('#ffff99')).toEqual([30, 58, 95]);
    expect(headerColor('#123456')).toEqual([0x12, 0x34, 0x56]);
  });

  it('maps characters outside the built-in font to "?" or ASCII, and keeps Latin-1', () => {
    expect(winAnsi('Jos\u00e9')).toBe('Jos\u00e9');
    expect(winAnsi('\u5c71\u7530')).toBe('??');
    expect(winAnsi('it\u2019s \u201cgood\u201d \u2013 ok')).toBe('it\'s "good" - ok');
    expect(winAnsi('a\nb')).toBe('a\nb');
  });

  it('lists retest trends, and says nothing when no metric has one', () => {
    const m = model(3);
    m.metrics[0].trend = { change: -0.2, direction: 'improved' };
    const text = pdfText(buildEvalReportPdf(m, org).doc);
    expect(text).toContain('Since the last evaluation');
    expect(text).toContain('Improved by 0.20 s');
    expect(pdfText(buildEvalReportPdf(model(3), org).doc)).not.toContain('Since the last evaluation');
  });

  it('draws a radar only when selected and when at least 3 metrics carry a comparison', () => {
    const withRadar = (n: number, comparisons = true) => model(n, comparisons, { selection: { ...model(3).selection, radar: true } });
    expect(buildEvalReportPdf(model(5), org).blocks.some((b) => b.kind === 'radar')).toBe(false);
    expect(buildEvalReportPdf(withRadar(5), org).blocks.some((b) => b.kind === 'radar')).toBe(true);
    expect(buildEvalReportPdf(withRadar(2), org).blocks.some((b) => b.kind === 'radar')).toBe(false);
    expect(buildEvalReportPdf(withRadar(5, false), org).blocks.some((b) => b.kind === 'radar')).toBe(false);
  });

  it('never lets a block cross a page boundary or run into the footer, and pages the 10-metric report', () => {
    for (const n of [3, 10, 30]) {
      const { doc, blocks } = buildEvalReportPdf(model(n, true, { selection: { ...model(3).selection, radar: true } }), org);
      for (const b of blocks) {
        expect(b.top, `${b.kind} top`).toBeGreaterThanOrEqual(EVAL_PDF_TOP_LIMIT - 0.001);
        expect(b.bottom, `${b.kind} bottom`).toBeLessThanOrEqual(EVAL_PDF_BOTTOM_LIMIT + 0.001);
        expect(b.page).toBeGreaterThanOrEqual(1);
        expect(b.page).toBeLessThanOrEqual(doc.getNumberOfPages());
      }
    }
  });

  it('keeps each section on one page when it fits', () => {
    const { blocks } = buildEvalReportPdf(model(10), org);
    for (const kind of ['freshAndHealthy', 'strengths', 'coachNote']) {
      expect(blocks.filter((b) => b.kind === kind).length, kind).toBeLessThanOrEqual(1);
    }
  });

  it('puts a footer with the page number on every page', () => {
    const { doc } = buildEvalReportPdf(model(30), org);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    const text = pdfText(doc);
    expect(text).toContain(`Page 1 of ${doc.getNumberOfPages()}`);
    expect(text).toContain(`Page ${doc.getNumberOfPages()} of ${doc.getNumberOfPages()}`);
  });

  it('falls back to a default colour for a bad brand colour and renders without branding', () => {
    expect(() => buildEvalReportPdf(model(3), { name: null, brandPrimaryColor: 'nope' })).not.toThrow();
    expect(() => buildEvalReportPdf(model(3), undefined)).not.toThrow();
  });
});
