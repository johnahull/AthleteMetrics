import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Every chained db query resolves to the current org row (the org lookup is the one that matters here).
const state = vi.hoisted(() => ({ row: {} as Record<string, unknown> }));
vi.mock('../../db', () => {
  const chain: any = new Proxy({}, {
    get: (_t, prop) => (prop === 'then' ? (resolve: any) => resolve([state.row]) : () => chain),
  });
  return { db: chain };
});
vi.mock('../../utils/metric-type', () => ({
  getMetricTypes: async (codes: string[]) => Object.fromEntries(codes.map(c => [c, 'higher_is_better'])),
}));

import { buildReportDataForAI } from '../report-routes';
import { storage } from '../../storage';

const service = (data: any) => ({
  generateTeamReport: async () => data,
  generateIndividualReport: async () => data,
  getMetricLabelsAndUnits: async () => ({ labels: {}, units: {} }),
} as any);
const teamReport = { id: 'r1', name: 'T', organizationId: 'org-1', reportType: 'team', config: { timeframe: {}, metrics: [] } } as any;
const individualReport = { id: 'r2', name: 'I', organizationId: 'org-1', reportType: 'individual', config: { athleteId: 'a1', timeframe: {}, metrics: [] } } as any;
const teamData = { teamStatistics: [], athleteRankings: [], athleteCount: 0, teamIds: ['t1'], metricLabels: {} };
const individualData = { athlete: { userId: 'a1', userName: 'Pat Lee', measurements: {}, percentiles: {}, teamAverages: {}, benchmarkComparisons: {} }, metricLabels: {} };
const EXAMPLE = '## Snapshot\nSolid block.\n\n## What to work on\n- Acceleration';

let memberNames: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  state.row = { name: 'Lions', sport: 'Soccer', aiPromptContext: null, aiStyleExample: EXAMPLE };
  memberNames = vi.spyOn(storage, 'getOrganizationMemberNames').mockResolvedValue(['Jordan Smith']);
});
afterEach(() => vi.restoreAllMocks());

describe('buildReportDataForAI styleExample', () => {
  it('copies the org style example for a team report', async () => {
    const data = await buildReportDataForAI(teamReport, 'u1', service(teamData));
    expect(data.styleExample).toBe(EXAMPLE);
    expect(memberNames).toHaveBeenCalledWith('org-1');
  });

  it('copies it for an individual report', async () => {
    const data = await buildReportDataForAI(individualReport, 'u1', service(individualData));
    expect(data.styleExample).toBe(EXAMPLE);
  });

  it('is absent for an org without one', async () => {
    state.row = { name: 'Lions', aiStyleExample: null };
    const data = await buildReportDataForAI(teamReport, 'u1', service(teamData));
    expect(data.styleExample).toBeUndefined();
  });

  it('drops it, without failing, when a member name matches now; the warning names the org id only', async () => {
    state.row = { name: 'Lions', aiStyleExample: 'Great job by Jordan Smith today' };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const data = await buildReportDataForAI(teamReport, 'u1', service(teamData));
    expect(data.styleExample).toBeUndefined();
    expect(data.reportName).toBe('T');
    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('org-1');
    expect(logged).not.toContain('Jordan');
    expect(logged).not.toContain('Great job');
  });

  it('drops it and still builds the report data when the member lookup throws', async () => {
    memberNames.mockRejectedValue(new Error('db down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const data = await buildReportDataForAI(teamReport, 'u1', service(teamData));
    expect(data.styleExample).toBeUndefined();
    expect(data.reportName).toBe('T');
    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('org-1');
    expect(logged).not.toContain('Solid block');
  });
});
