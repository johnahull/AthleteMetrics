/**
 * AM-FEAT-015: Movement Quality scores are ordinal rubric values, not continuous
 * performance numbers, so the radar (multi-metric) chart must not rank them
 * against peers. Their raw values stay; only the percentile rank is skipped.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../db', () => ({ db: {} }));

import { AnalyticsService } from '../analytics-simple';

const point = (athleteId: string, metric: string, value: number) => ({
  athleteId,
  athleteName: `Athlete ${athleteId}`,
  metric,
  value,
  date: new Date('2026-03-10'),
});

describe('AnalyticsService multi-metric percentile ranks', () => {
  it('skips MQ metrics in percentileRanks but keeps their values', () => {
    const service = new AnalyticsService() as any;
    const data = [
      point('a', 'VERTICAL_JUMP', 20),
      point('b', 'VERTICAL_JUMP', 30),
      point('a', 'MQ_JUMP', 1),
      point('b', 'MQ_JUMP', 3),
      point('a', 'MQI_TOTAL', 10),
      point('b', 'MQI_TOTAL', 20),
    ];

    const result = service.generateMultiMetricData(data, ['VERTICAL_JUMP', 'MQ_JUMP', 'MQI_TOTAL']);

    expect(result).toHaveLength(2);
    const b = result.find((r: any) => r.athleteId === 'b');
    expect(b.percentileRanks).toEqual({ VERTICAL_JUMP: 100 });
    expect(b.metrics).toEqual({ VERTICAL_JUMP: 30, MQ_JUMP: 3, MQI_TOTAL: 20 });
  });

  it('skips tracking metrics in percentileRanks; a metric with no type stays ranked (#805)', () => {
    const service = new AnalyticsService() as any;
    const data = [
      point('a', 'VERTICAL_JUMP', 20),
      point('b', 'VERTICAL_JUMP', 30),
      point('a', 'BODY_WEIGHT', 200),
      point('b', 'BODY_WEIGHT', 150),
      point('a', 'NO_TYPE', 1),
      point('b', 'NO_TYPE', 2),
    ];

    const result = service.generateMultiMetricData(data, ['VERTICAL_JUMP', 'BODY_WEIGHT', 'NO_TYPE'], {
      VERTICAL_JUMP: 'higher_is_better',
      BODY_WEIGHT: 'tracking',
    });

    const a = result.find((r: any) => r.athleteId === 'a');
    expect(a.percentileRanks).toEqual({ VERTICAL_JUMP: 0, NO_TYPE: 0 });
    expect(a.metrics.BODY_WEIGHT).toBe(200);
  });
});
