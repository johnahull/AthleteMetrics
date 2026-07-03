import { describe, it, expect } from 'vitest';
import { resolveChartSelection, resolveTeamChartSelection } from '../report-charts';

describe('resolveChartSelection', () => {
  it('uses explicit charts config when present (missing keys -> false)', () => {
    expect(resolveChartSelection({ charts: { radar: true, distribution: true } })).toEqual({
      radar: true, benchmarkStanding: false, trends: false, distribution: true,
    });
  });

  it('back-compat: absent charts -> radar+benchmark on, trends from showTrends, distribution off', () => {
    expect(resolveChartSelection({ showTrends: true })).toEqual({
      radar: true, benchmarkStanding: true, trends: true, distribution: false,
    });
    expect(resolveChartSelection({})).toEqual({
      radar: true, benchmarkStanding: true, trends: false, distribution: false,
    });
  });

  it('explicit charts overrides legacy showTrends', () => {
    expect(resolveChartSelection({ showTrends: true, charts: { trends: false } }).trends).toBe(false);
  });

  it('treats a present-but-empty charts object as all-off (explicit selection)', () => {
    expect(resolveChartSelection({ charts: {} })).toEqual({
      radar: false, benchmarkStanding: false, trends: false, distribution: false,
    });
  });
});

describe('resolveTeamChartSelection', () => {
  it('uses explicit charts config when present (missing keys -> false)', () => {
    expect(resolveTeamChartSelection({ charts: { boxSwarm: true } })).toEqual({
      benchmarkStanding: false,
      trends: false,
      boxSwarm: true,
      leaderboard: false,
      tierDistribution: false,
    });
  });

  it('respects explicit false overrides', () => {
    expect(resolveTeamChartSelection({
      charts: {
        benchmarkStanding: true, trends: true,
        boxSwarm: false, leaderboard: true, tierDistribution: false,
      },
    })).toEqual({
      benchmarkStanding: true, trends: true,
      boxSwarm: false, leaderboard: true, tierDistribution: false,
    });
  });

  it('treats a present-but-empty charts object as all-off (explicit selection)', () => {
    expect(resolveTeamChartSelection({ charts: {} })).toEqual({
      benchmarkStanding: false, trends: false,
      boxSwarm: false, leaderboard: false, tierDistribution: false,
    });
  });

  // Critical back-compat case: every pre-existing team report has no `charts`
  // field. If this resolver reused resolveChartSelection's legacy defaults
  // (radar+benchmarkStanding on), those reports would suddenly sprout charts
  // they never had. Legacy team configs must resolve to ALL FALSE.
  it('legacy config with no charts field resolves to ALL FALSE (not the individual defaults)', () => {
    expect(resolveTeamChartSelection({})).toEqual({
      benchmarkStanding: false, trends: false,
      boxSwarm: false, leaderboard: false, tierDistribution: false,
    });
    expect(resolveTeamChartSelection(undefined)).toEqual({
      benchmarkStanding: false, trends: false,
      boxSwarm: false, leaderboard: false, tierDistribution: false,
    });
    expect(resolveTeamChartSelection(null)).toEqual({
      benchmarkStanding: false, trends: false,
      boxSwarm: false, leaderboard: false, tierDistribution: false,
    });
  });
});
