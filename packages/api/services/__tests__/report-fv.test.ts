// packages/api/services/__tests__/report-fv.test.ts
import { describe, it, expect } from 'vitest';
import { pickLatestInWindow, toReportFvProfile } from '../report-fv';
import type { SprintFvProfile } from '@shared/schema';

const p = (date: string) => ({ date });

describe('pickLatestInWindow', () => {
  it('returns undefined for an empty list', () => {
    expect(pickLatestInWindow([], '2025-09-01', '2026-02-01')).toBeUndefined();
  });

  it('returns undefined when every profile falls outside the window', () => {
    expect(pickLatestInWindow(
      [p('2025-08-31'), p('2026-02-02')],
      '2025-09-01', '2026-02-01',
    )).toBeUndefined();
  });

  it('picks the most recent in-window profile regardless of input order', () => {
    expect(pickLatestInWindow(
      [p('2025-10-01'), p('2026-01-15'), p('2025-12-01'), p('2026-02-02')],
      '2025-09-01', '2026-02-01',
    )).toEqual(p('2026-01-15'));
  });

  it('treats window boundaries as inclusive', () => {
    expect(pickLatestInWindow([p('2025-09-01')], '2025-09-01', '2026-02-01')).toEqual(p('2025-09-01'));
    expect(pickLatestInWindow([p('2026-02-01')], '2025-09-01', '2026-02-01')).toEqual(p('2026-02-01'));
  });

  it('is stable on a date tie (first in list wins)', () => {
    const a = { date: '2026-01-15', tag: 'a' };
    const b = { date: '2026-01-15', tag: 'b' };
    expect(pickLatestInWindow([a, b], '2025-09-01', '2026-02-01')).toBe(a);
  });
});

describe('toReportFvProfile', () => {
  it('maps a DB row to the slim report payload, dropping splits and provenance', () => {
    const analysisJson = {
      classification: {
        classification: 'force-deficit',
        imbalancePercent: 12,
        dominantQuality: 'velocity',
        trainingRecommendations: ['Heavy sled pushes'],
        explanation: 'Force production lags velocity capability.',
      },
      optimalGap: {
        optimalF0: 8.1, optimalV0: 9.2, optimalSlope: -0.88,
        f0Gap: -0.4, v0Gap: 0.3, f0GapPercent: -5.1, v0GapPercent: 3.4,
        estimatedTimeImprovement: 0.08, sprintDistanceM: 36.58,
        recommendation: 'Increase F0.',
      },
      accelerationProfile: {
        tau: 0.9, timeTo90Pct: 2.1, timeTo95Pct: 2.7, accelerationPhaseM: 18,
        tauRating: 'fast', trainingInsights: [],
      },
      powerProfile: {
        pmaxRel: 17.5, velocityAtPmax: 4.5, rfPeak: 0.42, rfPeakRating: 'good',
        drf: -0.08, drfRating: 'average', trainingInsights: [],
      },
    } as const;

    const row = {
      id: 'prof-1',
      userId: 'ath-1',
      submittedBy: 'coach-1',
      organizationId: 'org-1',
      teamId: 'team-1',
      teamNameSnapshot: 'Varsity',
      date: '2026-01-15',
      bodyMassKg: '82.50',
      distanceUnit: 'yards',
      splitTimesJson: { '10': 1.7, '20': 2.95, '30': 4.18, '40': 5.3 },
      sourceMeasurementIds: ['m1', 'm2', 'm3', 'm4'],
      weightMeasurementId: 'w1',
      eventId: null,
      vmax: '9.1000',
      tau: '0.9000',
      f0Rel: '7.7000',
      v0: '9.1000',
      pmaxRel: '17.5000',
      fvSlope: '-0.846154',
      rfPeak: '0.4200',
      drf: '-0.080000',
      fitR2: '0.9987',
      fitResiduals: [],
      analysisJson,
      notes: null,
      createdAt: new Date('2026-01-15T12:00:00Z'),
    } as unknown as SprintFvProfile;

    expect(toReportFvProfile(row)).toEqual({
      profileId: 'prof-1',
      date: '2026-01-15',
      distanceUnit: 'yards',
      f0Rel: '7.7000',
      v0: '9.1000',
      pmaxRel: '17.5000',
      fvSlope: '-0.846154',
      fitR2: '0.9987',
      analysisJson,
    });
  });

  it('passes through null fit params and null analysisJson', () => {
    const row = {
      id: 'prof-2', date: '2026-01-15', distanceUnit: 'meters',
      f0Rel: null, v0: null, pmaxRel: null, fvSlope: null, fitR2: null,
      analysisJson: null,
    } as unknown as SprintFvProfile;

    const out = toReportFvProfile(row);
    expect(out.f0Rel).toBeNull();
    expect(out.analysisJson).toBeNull();
    expect(out.profileId).toBe('prof-2');
  });
});
