import { describe, it, expect } from 'vitest';
import { insertReportSchema } from '../schema';

const base = {
  name: 'Combine',
  organizationId: 'org1',
  reportType: 'team' as const,
  config: {
    eventId: '11111111-1111-4111-8111-111111111111',
    includeEventPercentiles: true,
    timeframe: { type: 'custom' as const },
    metrics: ['FLY10_TIME'],
  },
};

describe('insertReportSchema event config', () => {
  it('keeps eventId and includeEventPercentiles (event report list filters on config.eventId)', () => {
    const parsed = insertReportSchema.parse(base);
    expect(parsed.config).toMatchObject({
      eventId: base.config.eventId,
      includeEventPercentiles: true,
    });
  });

  it('rejects a non-uuid eventId', () => {
    expect(() =>
      insertReportSchema.parse({ ...base, config: { ...base.config, eventId: 'nope' } })
    ).toThrow();
  });
});
