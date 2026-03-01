/**
 * Validation Schema Tests — Training Module additions
 *
 * Tests for workoutSetSchema and exerciseTypeEnum added in Phase 1 of the training module.
 * These are RED-phase tests written BEFORE the schemas are implemented.
 */

import { describe, it, expect } from 'vitest';
import { workoutSetSchema, exerciseTypeEnum } from './validation';

describe('workoutSetSchema', () => {
  it('accepts valid set with all fields', () => {
    const result = workoutSetSchema.safeParse({
      setNumber: 1,
      repsCompleted: 10,
      weightLbs: 135,
      notes: 'felt strong',
    });
    expect(result.success).toBe(true);
  });

  it('accepts set with null repsCompleted (timed exercise)', () => {
    const result = workoutSetSchema.safeParse({
      setNumber: 1,
      repsCompleted: null,
      weightLbs: null,
      notes: '30 seconds',
    });
    expect(result.success).toBe(true);
  });

  it('accepts set with null weightLbs (bodyweight exercise)', () => {
    const result = workoutSetSchema.safeParse({
      setNumber: 2,
      repsCompleted: 15,
      weightLbs: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts set without optional notes field', () => {
    const result = workoutSetSchema.safeParse({
      setNumber: 1,
      repsCompleted: 8,
      weightLbs: 225,
    });
    expect(result.success).toBe(true);
  });

  it('rejects setNumber = 0', () => {
    const result = workoutSetSchema.safeParse({
      setNumber: 0,
      repsCompleted: 10,
      weightLbs: 135,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative repsCompleted', () => {
    const result = workoutSetSchema.safeParse({
      setNumber: 1,
      repsCompleted: -5,
      weightLbs: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer setNumber (1.5)', () => {
    const result = workoutSetSchema.safeParse({
      setNumber: 1.5,
      repsCompleted: 10,
      weightLbs: 135,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative weightLbs', () => {
    const result = workoutSetSchema.safeParse({
      setNumber: 1,
      repsCompleted: 10,
      weightLbs: -50,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing setNumber', () => {
    const result = workoutSetSchema.safeParse({
      repsCompleted: 10,
      weightLbs: 135,
    });
    expect(result.success).toBe(false);
  });
});

describe('exerciseTypeEnum', () => {
  it('accepts weighted', () => {
    expect(exerciseTypeEnum.safeParse('weighted').success).toBe(true);
  });

  it('accepts bodyweight', () => {
    expect(exerciseTypeEnum.safeParse('bodyweight').success).toBe(true);
  });

  it('accepts speed', () => {
    expect(exerciseTypeEnum.safeParse('speed').success).toBe(true);
  });

  it('accepts plyometric', () => {
    expect(exerciseTypeEnum.safeParse('plyometric').success).toBe(true);
  });

  it('accepts timed', () => {
    expect(exerciseTypeEnum.safeParse('timed').success).toBe(true);
  });

  it('rejects unknown value "cardio"', () => {
    expect(exerciseTypeEnum.safeParse('cardio').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(exerciseTypeEnum.safeParse('').success).toBe(false);
  });

  it('rejects null', () => {
    expect(exerciseTypeEnum.safeParse(null).success).toBe(false);
  });

  it('rejects undefined', () => {
    expect(exerciseTypeEnum.safeParse(undefined).success).toBe(false);
  });
});
