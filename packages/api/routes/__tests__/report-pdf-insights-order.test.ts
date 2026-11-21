import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReportService } from '../../services/report-service';
import { generatePDF } from '../report-routes';

// Ordering metrics needs the DB; these tests only check layout
beforeEach(() => {
  vi.spyOn(ReportService.prototype, 'orderForResponse').mockImplementation(async (d: any) => d);
});

type Doc = Awaited<ReturnType<typeof generatePDF>>;

/** Text drawn on each page, in drawing order, from the uncompressed content streams. */
function allText(doc: Doc): string[] {
  const out: string[] = [];
  for (let p = 1; p <= doc.getNumberOfPages(); p++) {
    const ops = ((doc as any).internal.pages[p] as string[]).join('\n');
    out.push(...[...ops.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((m) => m[1].replace(/\\(.)/g, '$1')));
  }
  return out;
}
const at = (text: string[], needle: string) => text.findIndex((t) => t.includes(needle));

const INSIGHTS = '## Summary\nStrong jump numbers this block.\n- Keep landing mechanics clean';
const WRITTEN_AT = '2026-11-02T15:00:00.000Z';

const individual = {
  reportType: 'individual',
  reportConfig: { timeframe: { type: 'preset', preset: 'all_time' }, metrics: ['VERTICAL_JUMP'] },
  generatedAt: '2026-11-01T02:30:00.000Z',
  athlete: { userName: 'Ben Parada', teams: ['Varsity'], measurements: { VERTICAL_JUMP: 19.13 }, percentiles: {} },
  metricLabels: { VERTICAL_JUMP: 'Vertical Jump' },
  metricUnits: { VERTICAL_JUMP: 'in' },
};

const team = {
  reportType: 'team',
  reportConfig: { timeframe: { type: 'preset', preset: 'all_time' }, metrics: ['VERTICAL_JUMP'] },
  generatedAt: '2026-11-01T02:30:00.000Z',
  athleteCount: 3,
  teamStatistics: [
    { metric: 'VERTICAL_JUMP', average: 20, median: 20, min: 18, max: 22, topPerformer: { userName: 'Ben' } },
  ],
  athleteRankings: [],
  metricLabels: { VERTICAL_JUMP: 'Vertical Jump' },
  metricUnits: { VERTICAL_JUMP: 'in' },
};

const withInsights = {
  name: 'R',
  organizationId: 'org-1',
  coachingInsights: INSIGHTS,
  coachingInsightsGeneratedAt: WRITTEN_AT,
  coachingInsightsModel: 'claude-sonnet-4',
};

describe('PDF puts Coaching Insights right after the athlete / summary block', () => {
  it('individual: Athlete block < Coaching Insights < first metric row', async () => {
    const text = allText(await generatePDF(withInsights, individual));
    const athlete = at(text, 'Athlete: Ben Parada');
    const insights = at(text, 'Coaching Insights');
    const metric = at(text, 'Vertical Jump');
    expect(athlete).toBeGreaterThan(-1);
    expect(insights).toBeGreaterThan(athlete);
    expect(metric).toBeGreaterThan(insights);
  });

  it('team: Report Summary < Coaching Insights < Performance Snapshot', async () => {
    const text = allText(await generatePDF(withInsights, team));
    const summary = at(text, 'Report Summary');
    const insights = at(text, 'Coaching Insights');
    const snapshot = at(text, 'Performance Snapshot');
    expect(summary).toBeGreaterThan(-1);
    expect(insights).toBeGreaterThan(summary);
    expect(snapshot).toBeGreaterThan(insights);
  });

  it('prints the insights section once', async () => {
    const text = allText(await generatePDF(withInsights, individual));
    expect(text.filter((t) => t === 'Coaching Insights')).toHaveLength(1);
    expect(at(text, 'Written:')).toBeGreaterThan(at(text, 'Coaching Insights'));
  });
});

describe('PDF insights read as the coach\'s words', () => {
  it.each([['individual', individual], ['team', team]])('%s: "Written <date>", no model, no AI wording', async (_n, data) => {
    const text = allText(await generatePDF(withInsights, data));
    expect(text.some((t) => /^Written: Nov 2, 2026/.test(t))).toBe(true);
    const joined = text.join('\n');
    expect(joined).not.toContain('Evaluation Written');
    expect(joined).not.toContain('claude');
    expect(joined).not.toMatch(/\bAI\b/);
  });

  it('prints no insights section when there are none', async () => {
    const text = allText(await generatePDF({ name: 'R', organizationId: 'org-1' }, individual));
    expect(text).not.toContain('Coaching Insights');
  });
});

/** Vertical position (PDF points from the page bottom) of the first "<heading>" text drawn, per page. */
function headingY(doc: Doc, heading: string): { page: number; y: number } | null {
  for (let p = 1; p <= doc.getNumberOfPages(); p++) {
    const ops = ((doc as any).internal.pages[p] as string[]).join('\n');
    const m = ops.match(new RegExp(`[\\d.]+ ([\\d.-]+) Td\\s*\\(${heading}\\) Tj`));
    if (m) return { page: p, y: parseFloat(m[1]) };
  }
  return null;
}

describe('long insights never push the next heading off the page', () => {
  const longInsights = Array.from({ length: 70 }, (_, i) => `- Point ${i + 1} about the block`).join('\n');
  // Every length from 40 to 110 lines, so some end with the last line right at the page bottom
  it('team: "Performance Snapshot" stays on the page for any insights length', async () => {
    const bad: number[] = [];
    for (let n = 40; n <= 110; n++) {
      const insights = Array.from({ length: n }, (_, i) => `- Point ${i + 1} about the block`).join('\n');
      const doc = await generatePDF({ ...withInsights, coachingInsights: insights }, team);
      const pos = headingY(doc, 'Performance Snapshot');
      if (!pos || pos.y < 30) bad.push(n); // y is points from the page bottom: under 30 is the footer zone or off the page
    }
    expect(bad).toEqual([]);
  });
  it('sanity: the long text really spans pages', async () => {
    const doc = await generatePDF({ ...withInsights, coachingInsights: longInsights }, team);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });
});
