import { describe, it, expect } from 'vitest';
import {
  calculatePersonalRecords,
  generateActivityTimeline,
} from '../athlete-dashboard-utils';

function m(metric: string, value: number, date: string) {
  return {
    id: `${metric}-${date}`,
    metric,
    value,
    units: 's',
    date,
    age: 16,
  };
}

describe('athlete-dashboard-utils — metricLabels parameter', () => {
  describe('calculatePersonalRecords', () => {
    it('prefers labels from the supplied map over the built-in fallback', () => {
      const labels = { FLY10_TIME: 'Custom Org Fly Label' };
      const measurements = [m('FLY10_TIME', 1.5, '2024-01-01')];

      const prs = calculatePersonalRecords(measurements, labels);

      expect(prs[0].displayName).toBe('Custom Org Fly Label');
    });

    it('falls back to the built-in name map when no labels argument is supplied', () => {
      const measurements = [m('FLY10_TIME', 1.5, '2024-01-01')];

      const prs = calculatePersonalRecords(measurements);

      expect(prs[0].displayName).toBe('10-Yard Fly Time');
    });

    it('uses protocol-specific built-in names for 5-0-5 meters and yards', () => {
      const prs = calculatePersonalRecords([
        m('AGILITY_505_M', 2.45, '2024-01-01'),
        m('AGILITY_505_YD', 2.24, '2024-01-01'),
      ]);
      const names = Object.fromEntries(prs.map((p: any) => [p.metric, p.displayName]));
      expect(names.AGILITY_505_M).toBe('5-0-5 Agility (m)');
      expect(names.AGILITY_505_YD).toBe('5-0-5 Agility (yd)');
    });

    it('falls back to the built-in name map when the code is missing from supplied labels', () => {
      const labels = { VERTICAL_JUMP: 'High Hops' };
      const measurements = [m('FLY10_TIME', 1.5, '2024-01-01')];

      const prs = calculatePersonalRecords(measurements, labels);

      expect(prs[0].displayName).toBe('10-Yard Fly Time');
    });

    it('underscore-splits unknown codes when neither labels nor built-in map know them', () => {
      // Matches the same last-resort fallback shape used in
      // resolveTimelineLabel for consistency across surfaces.
      const measurements = [m('CUSTOM_DEADLIFT_1RM', 200, '2024-01-01')];

      const prs = calculatePersonalRecords(measurements);

      expect(prs[0].displayName).toBe('CUSTOM DEADLIFT 1RM');
    });

    it('resolves custom org codes via the supplied labels map', () => {
      const labels = { CUSTOM_DEADLIFT_1RM: 'Deadlift 1RM' };
      const measurements = [m('CUSTOM_DEADLIFT_1RM', 200, '2024-01-01')];

      const prs = calculatePersonalRecords(measurements, labels);

      expect(prs[0].displayName).toBe('Deadlift 1RM');
    });
  });

  describe('generateActivityTimeline', () => {
    it('prefers labels from the supplied map', () => {
      const labels = { VERTICAL_JUMP: 'Custom Jump' };
      const measurements = [m('VERTICAL_JUMP', 30, '2024-01-15')];

      const timeline = generateActivityTimeline(measurements, labels);

      expect(timeline[0].displayName).toBe('Custom Jump');
    });

    it('falls back to the built-in name map when the labels argument is omitted', () => {
      const measurements = [m('VERTICAL_JUMP', 30, '2024-01-15')];

      const timeline = generateActivityTimeline(measurements);

      expect(timeline[0].displayName).toBe('Vertical Jump');
    });
  });
});

describe('athlete-dashboard-utils — duration (mm:ss) metrics', () => {
  // A known lower-is-better code, so the PR direction does not depend on the name fallback
  const formats = { DASH_40YD: { unit: 's', displayFormat: 'duration' as const, decimalPrecision: 1 } };
  const runs = [m('DASH_40YD', 406.7, '2024-01-01'), m('DASH_40YD', 402.5, '2024-02-01')];

  it('calculatePersonalRecords gives an mm:ss value and improvement', () => {
    const [pr] = calculatePersonalRecords(runs, undefined, formats);
    expect(pr.displayValue).toBe('6:42.5');
    expect(pr.improvementText).toBe('↑ 0:04.2 better than last best');
  });

  it('generateActivityTimeline gives an mm:ss value', () => {
    const timeline = generateActivityTimeline(runs, undefined, formats);
    expect(timeline.map((t) => t.displayValue)).toEqual(['6:42.5', '6:46.7']);
  });

  it('leaves decimal metrics without a displayValue and the improvement text unchanged', () => {
    const [pr] = calculatePersonalRecords([m('FLY10_TIME', 1.5, '2024-01-01'), m('FLY10_TIME', 1.6, '2024-02-01')], undefined, formats);
    expect(pr.displayValue).toBeUndefined();
    expect(pr.improvementText).toBe('↑ 0.10s better than last best');
  });
});

describe('athlete-dashboard-utils — metric direction from the metric list', () => {
  // MILE_RUN is not in the hard-coded lower-is-better list, so only the supplied type knows it is a time
  const types = { MILE_RUN: 'lower_is_better' as const };
  const runs = [m('MILE_RUN', 360, '2024-01-01'), m('MILE_RUN', 420, '2024-02-01'), m('MILE_RUN', 400, '2024-03-01')];

  it('calculatePersonalRecords takes the fastest time as the PR for a lower-is-better metric', () => {
    const [pr] = calculatePersonalRecords(runs, undefined, undefined, types);
    expect(pr.value).toBe(360);
  });

  it('generateActivityTimeline detects an improvement for a lower-is-better metric', () => {
    const timeline = generateActivityTimeline(runs, undefined, undefined, types);
    const march = timeline.find((t) => t.date === '2024-03-01');
    expect(march?.insightType).toBe('improvement');
    expect(timeline.find((t) => t.date === '2024-01-01')?.insightType).toBe('pr');
  });

  it('keeps the built-in direction when the metric is missing from the supplied types', () => {
    const [pr] = calculatePersonalRecords([m('FLY10_TIME', 1.5, '2024-01-01'), m('FLY10_TIME', 1.6, '2024-02-01')], undefined, undefined, types);
    expect(pr.value).toBe(1.5);
  });
});

describe('athlete-dashboard-utils — no direction guess from the code name', () => {
  it('treats a code with TIME in its name but no type as higher-is-better (ORG_HANG_TIME)', () => {
    const hang = [m('ORG_HANG_TIME', 0.8, '2024-01-01'), m('ORG_HANG_TIME', 1.0, '2024-02-01'), m('ORG_HANG_TIME', 0.9, '2024-03-01')];
    const timeline = generateActivityTimeline(hang);
    // 1.0 -> 0.9 is a decline for a higher-is-better metric, so no "Improved" insight
    expect(timeline[0].date).toBe('2024-03-01');
    expect(timeline[0].insightType).toBeNull();
  });

  it('keeps built-in times lower-is-better without types (DASH_40YD)', () => {
    const dash = [m('DASH_40YD', 5.0, '2024-01-01'), m('DASH_40YD', 4.8, '2024-02-01'), m('DASH_40YD', 4.9, '2024-03-01')];
    const [pr] = calculatePersonalRecords(dash);
    expect(pr.value).toBe(4.8);
  });
});

