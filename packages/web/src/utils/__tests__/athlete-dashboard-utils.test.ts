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
