import { describe, it, expect } from 'vitest';
import { insertReportSchema, updateReportSchema } from '../schema-original';

/**
 * Regression coverage for a bug caught in code review: insertReportSchema /
 * updateReportSchema's config.charts sub-schema only declared the 4
 * individual-report keys. Zod's default "strip" behavior silently dropped
 * the 3 team-native keys (leaderboard, tierDistribution, boxSwarm) from
 * every team report submitted through POST/PUT /api/reports, even though
 * the wizard and resolveTeamChartSelection both expect them to round-trip.
 * The DB-level integration tests don't catch this because they insert rows
 * directly, bypassing schema validation entirely — this test parses through
 * the actual schema, the way the API route does.
 */
describe('insertReportSchema / updateReportSchema — config.charts', () => {
  const teamChartsPayload = {
    radar: true,
    benchmarkStanding: false,
    trends: true,
    boxSwarm: true,
    leaderboard: false,
    tierDistribution: true,
  };

  it('insertReportSchema retains all team-native chart keys (no silent stripping)', () => {
    const result = insertReportSchema.parse({
      organizationId: 'org-1',
      name: 'Team Report',
      reportType: 'team',
      config: {
        timeframe: { type: 'preset', preset: 'season' },
        metrics: ['VERTICAL_JUMP'],
        charts: teamChartsPayload,
      },
    });

    expect(result.config.charts).toEqual(teamChartsPayload);
  });

  it('updateReportSchema retains all team-native chart keys (no silent stripping)', () => {
    const result = updateReportSchema.parse({
      config: {
        charts: teamChartsPayload,
      },
    });

    expect(result.config?.charts).toEqual(teamChartsPayload);
  });

  // Same stripping failure mode as above, for the individual-report fvProfile key.
  it('insertReportSchema retains charts.fvProfile (no silent stripping)', () => {
    const result = insertReportSchema.parse({
      organizationId: 'org-1',
      name: 'Individual Report',
      reportType: 'individual',
      config: {
        timeframe: { type: 'preset', preset: 'season' },
        metrics: ['VERTICAL_JUMP'],
        charts: { radar: true, fvProfile: true },
      },
    });

    expect(result.config.charts).toEqual({ radar: true, fvProfile: true });
  });

  it('updateReportSchema retains charts.fvProfile (no silent stripping)', () => {
    const result = updateReportSchema.parse({
      config: { charts: { fvProfile: false } },
    });

    expect(result.config?.charts).toEqual({ fvProfile: false });
  });
});
