/**
 * Unit tests for wellness schedule Zod validation schemas.
 *
 * Tests createWellnessScheduleSchema and updateWellnessScheduleSchema
 * from wellness-validation.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  createWellnessScheduleSchema,
  updateWellnessScheduleSchema,
} from '../wellness-validation';

function validSchedule(overrides: Record<string, unknown> = {}) {
  return {
    templateId: '550e8400-e29b-41d4-a716-446655440000',
    distributionMethod: 'athlete_account',
    recurrenceType: 'daily',
    scheduledTime: '09:00',
    timezone: 'America/New_York',
    maxOccurrences: 30,
    ...overrides,
  };
}

describe('createWellnessScheduleSchema', () => {
  it('should parse a valid daily schedule', () => {
    const result = createWellnessScheduleSchema.parse(validSchedule());
    expect(result.recurrenceType).toBe('daily');
    expect(result.scheduledTime).toBe('09:00');
  });

  it('should parse a valid weekly schedule', () => {
    const result = createWellnessScheduleSchema.parse(validSchedule({
      recurrenceType: 'weekly',
      daysOfWeek: [1, 3, 5],
    }));
    expect(result.daysOfWeek).toEqual([1, 3, 5]);
  });

  it('should parse a valid custom schedule', () => {
    const result = createWellnessScheduleSchema.parse(validSchedule({
      recurrenceType: 'custom',
      customIntervalDays: 14,
    }));
    expect(result.customIntervalDays).toBe(14);
  });

  it('should reject weekly without daysOfWeek', () => {
    expect(() => createWellnessScheduleSchema.parse(validSchedule({
      recurrenceType: 'weekly',
    }))).toThrow();
  });

  it('should reject custom without customIntervalDays', () => {
    expect(() => createWellnessScheduleSchema.parse(validSchedule({
      recurrenceType: 'custom',
    }))).toThrow();
  });

  it('should reject invalid scheduledTime format', () => {
    expect(() => createWellnessScheduleSchema.parse(validSchedule({
      scheduledTime: '9:00',
    }))).toThrow();
  });

  it('should reject 25:00 as scheduled time', () => {
    expect(() => createWellnessScheduleSchema.parse(validSchedule({
      scheduledTime: '25:00',
    }))).toThrow();
  });

  it('should reject invalid timezone', () => {
    expect(() => createWellnessScheduleSchema.parse(validSchedule({
      timezone: 'Fake/Zone',
    }))).toThrow();
  });

  it('should validate a valid timezone', () => {
    const result = createWellnessScheduleSchema.parse(validSchedule({
      timezone: 'Europe/London',
    }));
    expect(result.timezone).toBe('Europe/London');
  });

  it('should require endDate or maxOccurrences', () => {
    const data = validSchedule();
    delete (data as any).maxOccurrences;
    expect(() => createWellnessScheduleSchema.parse(data)).toThrow();
  });

  it('should accept endDate as sole end condition', () => {
    const data = validSchedule();
    delete (data as any).maxOccurrences;
    (data as any).endDate = '2025-12-31';
    const result = createWellnessScheduleSchema.parse(data);
    expect(result.endDate).toBeInstanceOf(Date);
  });

  it('should reject negative maxOccurrences', () => {
    expect(() => createWellnessScheduleSchema.parse(validSchedule({
      maxOccurrences: -1,
    }))).toThrow();
  });

  it('should reject zero maxOccurrences', () => {
    expect(() => createWellnessScheduleSchema.parse(validSchedule({
      maxOccurrences: 0,
    }))).toThrow();
  });

  it('should apply default timezone when omitted', () => {
    const data = validSchedule();
    delete (data as any).timezone;
    const result = createWellnessScheduleSchema.parse(data);
    expect(result.timezone).toBe('America/New_York');
  });

  it('should accept valid daysOfWeek values 0-6', () => {
    const result = createWellnessScheduleSchema.parse(validSchedule({
      recurrenceType: 'weekly',
      daysOfWeek: [0, 6],
    }));
    expect(result.daysOfWeek).toEqual([0, 6]);
  });

  it('should reject daysOfWeek value > 6', () => {
    expect(() => createWellnessScheduleSchema.parse(validSchedule({
      recurrenceType: 'weekly',
      daysOfWeek: [7],
    }))).toThrow();
  });
});

describe('updateWellnessScheduleSchema', () => {
  it('should allow partial update with status only', () => {
    const result = updateWellnessScheduleSchema.parse({ status: 'paused' });
    expect(result.status).toBe('paused');
  });

  it('should allow pause and resume', () => {
    expect(updateWellnessScheduleSchema.parse({ status: 'paused' }).status).toBe('paused');
    expect(updateWellnessScheduleSchema.parse({ status: 'active' }).status).toBe('active');
  });

  it('should allow field updates', () => {
    const result = updateWellnessScheduleSchema.parse({
      scheduledTime: '14:30',
      daysOfWeek: [1, 2, 3],
    });
    expect(result.scheduledTime).toBe('14:30');
    expect(result.daysOfWeek).toEqual([1, 2, 3]);
  });

  it('should reject invalid status', () => {
    expect(() => updateWellnessScheduleSchema.parse({
      status: 'invalid_status',
    })).toThrow();
  });

  it('should allow nullable endDate and maxOccurrences', () => {
    const result = updateWellnessScheduleSchema.parse({
      endDate: null,
      maxOccurrences: null,
    });
    expect(result.endDate).toBeNull();
    expect(result.maxOccurrences).toBeNull();
  });

  it('should accept empty object (no updates)', () => {
    const result = updateWellnessScheduleSchema.parse({});
    expect(result).toBeDefined();
  });
});
