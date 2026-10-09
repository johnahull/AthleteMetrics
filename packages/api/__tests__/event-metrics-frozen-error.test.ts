import { describe, it, expect } from 'vitest';
import { EventMetricsService, EventMetricsFrozenError } from '../services/event-metrics-service';

// Pure unit test: a stub storage that returns a frozen event, no database involved.
const frozenStorage = { getEvent: async () => ({ id: 'e1', isFrozen: true }) } as any;

describe('EventMetricsService frozen-event error', () => {
  it('bulkAddMetrics throws a named EventMetricsFrozenError for a frozen event', async () => {
    const service = new EventMetricsService(frozenStorage);
    const err = await service.bulkAddMetrics('e1', 'u1', [{ metricCode: 'X' }]).catch((e) => e);
    expect(err).toBeInstanceOf(EventMetricsFrozenError);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Event is frozen and cannot be modified');
  });

  it('every mutating method uses the same error class', async () => {
    const service = new EventMetricsService(frozenStorage);
    for (const call of [
      () => service.addMetricToEvent('e1', 'X', 'u1'),
      () => service.removeMetricFromEvent('e1', 'X', 'u1'),
      () => service.updateEventMetric('e1', 'X', 'u1', {}),
      () => service.reorderEventMetrics('e1', 'u1', []),
    ]) {
      await expect(call()).rejects.toBeInstanceOf(EventMetricsFrozenError);
    }
  });
});
