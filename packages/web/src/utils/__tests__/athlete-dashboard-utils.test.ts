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

    it('falls back to the built-in name map when the code is missing from supplied labels', () => {
      const labels = { VERTICAL_JUMP: 'High Hops' };
      const measurements = [m('FLY10_TIME', 1.5, '2024-01-01')];

      const prs = calculatePersonalRecords(measurements, labels);

      expect(prs[0].displayName).toBe('10-Yard Fly Time');
    });

    it('falls back to the raw code when neither labels nor built-in map know it', () => {
      const measurements = [m('CUSTOM_DEADLIFT_1RM', 200, '2024-01-01')];

      const prs = calculatePersonalRecords(measurements);

      expect(prs[0].displayName).toBe('CUSTOM_DEADLIFT_1RM');
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
