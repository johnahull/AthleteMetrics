import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReportService } from '../../services/report-service';
import { generatePDF, pdfTimeZone } from '../report-routes';

// Ordering metrics needs the DB; these tests only check layout
beforeEach(() => {
  vi.spyOn(ReportService.prototype, 'orderForResponse').mockImplementation(async (d: any) => d);
});

type Doc = Awaited<ReturnType<typeof generatePDF>>;

/** Text drawn on each page, from the uncompressed content streams ("(...) Tj" operators). */
function pageTexts(doc: Doc): string[][] {
  const pages: string[][] = [];
  for (let p = 1; p <= doc.getNumberOfPages(); p++) {
    const ops = ((doc as any).internal.pages[p] as string[]).join('\n');
    pages.push([...ops.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => m[1].replace(/\\(.)/g, '$1')));
  }
  return pages;
}
const allText = (doc: Doc) => pageTexts(doc).flat();
const pageOf = (doc: Doc, text: string) => pageTexts(doc).findIndex((t) => t.includes(text));

const explanations = {
  AGILITY_5105: { title: '5-10-5 Pro Agility', whatItMeasures: 'Change of direction.', whyItMatters: 'Cuts.', unitNote: 'Measured in s', directionOfBetter: 'lower' },
  VERTICAL_JUMP: { title: 'Vertical Jump', whatItMeasures: 'Jump height.', whyItMatters: 'Power.', unitNote: 'Measured in in', directionOfBetter: 'higher' },
  BODY_WEIGHT: { title: 'Body Weight', whatItMeasures: 'Weight.', whyItMatters: 'Context.', unitNote: 'Measured in lbs', directionOfBetter: 'higher' },
};

const tierComp = (code: string, value: number) => ({
  benchmarkName: 'x', tierName: 'Average', tierGroupName: 'Approach Jump - HS Varsity Boys', tierColor: 'blue',
  tierOrder: 3, athleteValue: value, nextTierName: 'Competitive', distanceToNextTier: 0.1,
  coachingNote: 'Strong SSC use. Focus on raising the SJ floor (concentric strength) to lift the whole curve.',
  allTiers: [
    { tierName: 'Elite', tierColor: 'green', tierOrder: 1, minValue: null, maxValue: 4.3 },
    { tierName: 'Average', tierColor: 'blue', tierOrder: 2, minValue: 4.3, maxValue: null },
  ],
});

function individual(overrides: Record<string, unknown> = {}) {
  return {
    reportType: 'individual',
    reportConfig: { timeframe: { type: 'preset', preset: 'all_time' }, metrics: ['AGILITY_5105', 'VERTICAL_JUMP', 'BODY_WEIGHT'] },
    generatedAt: '2026-11-01T02:30:00.000Z', // Oct 31, 9:30 PM in Chicago
    athlete: {
      userName: 'Ben Parada',
      teams: ['Evaluation 10/31/26'],
      measurements: { AGILITY_5105: 4.512, VERTICAL_JUMP: 19.13 },
      percentiles: {},
      benchmarkComparisons: {
        AGILITY_5105: [tierComp('AGILITY_5105', 4.512)],
        VERTICAL_JUMP: [tierComp('VERTICAL_JUMP', 19.13)],
      },
    },
    metricLabels: { AGILITY_5105: '5-10-5 Agility', VERTICAL_JUMP: 'Vertical Jump', BODY_WEIGHT: 'Weight' },
    metricUnits: { AGILITY_5105: 's', VERTICAL_JUMP: 'ft', BODY_WEIGHT: 'lbs' },
    metricExplanations: explanations,
    ...overrides,
  };
}

const report = { name: 'Ben Report', organizationId: 'org-1' };

describe('individual PDF glossary', () => {
  it('lists only the metrics the athlete has data for, under the metric-table names', async () => {
    const doc = await generatePDF(report, individual());
    const text = allText(doc);
    const glossary = pageTexts(doc)[pageOf(doc, 'Glossary of Metrics')];
    expect(glossary).toContain('5-10-5 Agility');
    expect(glossary).not.toContain('5-10-5 Pro Agility');
    expect(text).not.toContain('Body Weight');
    expect(glossary).not.toContain('Weight.');
  });

  it('falls back to every explanation when the report shows no metrics', async () => {
    const doc = await generatePDF(report, individual({ athlete: { userName: 'X', measurements: {} } }));
    expect(allText(doc)).toContain('Glossary of Metrics');
    expect(allText(doc)).toContain('Weight.');
  });
});

describe('individual PDF benchmark tables', () => {
  it('keeps the Actual value and its unit on one line', async () => {
    const doc = await generatePDF(report, individual());
    // once in the measurement table, once in the tier table
    expect(allText(doc).filter((t) => t === '19.13 ft')).toHaveLength(2);
  });

  it('never leaves the "Benchmark Tiers" heading alone at the bottom of a page', async () => {
    // Enough measurement rows to push the heading near the page bottom
    const measurements: Record<string, number> = { AGILITY_5105: 4.512, VERTICAL_JUMP: 19.13 };
    for (let i = 0; i < 200; i++) {
      const doc = await generatePDF(report, individual({
        athlete: { ...individual().athlete, measurements: { ...measurements, ...Object.fromEntries(Array.from({ length: i }, (_, k) => [`M${k}`, k])) } },
      }));
      expect(pageOf(doc, 'Benchmark Tiers'), `with ${i} extra rows`).toBe(pageOf(doc, 'Tier Group'));
      if (i > 40) break;
    }
  });

  it('prints open tier bounds as >= / <=', async () => {
    const text = allText(await generatePDF(report, individual()));
    expect(text).toContain('<= 4.30');
    expect(text).toContain('>= 4.30');
  });
});

describe('individual PDF dates', () => {
  it('formats the cover and "Generated:" dates in the caller time zone', async () => {
    const text = allText(await generatePDF(report, individual(), 'simplified', undefined, [], 'America/Chicago'));
    expect(text).toContain('Oct 31, 2026');
    expect(text).toContain('Generated: Oct 31, 2026, 9:30 PM');
  });

  it('defaults to UTC', async () => {
    const text = allText(await generatePDF(report, individual()));
    expect(text).toContain('Generated: Nov 1, 2026, 2:30 AM');
  });

  it('uses the event date on the cover and prints an Event line', async () => {
    const eventContext = { eventId: 'e1', eventName: 'Fall Combine', eventDate: '2026-10-31T00:00:00.000Z', participantCount: 3 };
    const doc = await generatePDF(report, individual({ eventContext, generatedAt: '2026-11-03T15:00:00.000Z' }), 'simplified', undefined, [], 'America/Los_Angeles');
    expect(pageTexts(doc)[0]).toContain('Oct 31, 2026'); // UTC calendar date, not Oct 30 in LA
    expect(allText(doc)).toContain('Event: Fall Combine (Oct 31, 2026)');
  });

  it('uses a custom timeframe end on the cover when there is no event', async () => {
    const reportConfig = { timeframe: { type: 'custom', customStart: '2026-09-01', customEnd: '2026-10-15' }, metrics: [] };
    const doc = await generatePDF(report, individual({ reportConfig }));
    expect(pageTexts(doc)[0]).toContain('Oct 15, 2026');
  });
});

describe('team PDF dates', () => {
  it('formats "Generated:" in the caller time zone', async () => {
    const team = {
      reportType: 'team', reportConfig: { timeframe: { type: 'preset', preset: 'all_time' }, metrics: [] },
      generatedAt: '2026-11-01T02:30:00.000Z', teamStatistics: [], athleteRankings: [], athleteCount: 0,
      metricLabels: {}, metricUnits: {}, metricExplanations: {},
    };
    const text = allText(await generatePDF(report, team, 'simplified', undefined, [], 'America/Chicago'));
    expect(text).toContain('Generated: Oct 31, 2026, 9:30 PM');
  });
});

describe('pdfTimeZone (POST body timeZone)', () => {
  it('accepts a valid IANA zone', () => {
    expect(pdfTimeZone('America/Chicago')).toBe('America/Chicago');
  });

  it('falls back to UTC for invalid, empty or non-string values', () => {
    for (const v of ['Mars/Olympus', '', undefined, null, 42, { tz: 'UTC' }]) expect(pdfTimeZone(v)).toBe('UTC');
  });
});
