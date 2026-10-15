/**
 * Event context and organization of a measurement are set by the server (event
 * routes, team context); the public insert schema must not accept them from a
 * request body.
 */
import { describe, it, expect } from 'vitest';
import { insertMeasurementSchema } from '../schema';

describe('insertMeasurementSchema server-managed fields', () => {
  it('strips event context and organizationId from the parsed input', () => {
    const parsed = insertMeasurementSchema.parse({
      userId: 'athlete-1',
      metric: 'VERTICAL_JUMP',
      value: 30,
      date: '2026-03-10',
      eventId: 'event-1',
      eventNameSnapshot: 'Forged',
      eventDateSnapshot: '2020-01-01',
      organizationId: 'org-1',
    });
    expect(parsed).not.toHaveProperty('eventId');
    expect(parsed).not.toHaveProperty('eventNameSnapshot');
    expect(parsed).not.toHaveProperty('eventDateSnapshot');
    expect(parsed).not.toHaveProperty('organizationId');
    expect(parsed).toMatchObject({ userId: 'athlete-1', metric: 'VERTICAL_JUMP', value: 30 });
  });
});
