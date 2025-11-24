/**
 * Wellness Validation Tests - Status Configuration
 *
 * Tests for the new statusConfig validation including scale orientation support
 */

import { describe, it, expect } from 'vitest';
import { wellnessTemplateConfigSchema, wellnessStatusConfigSchema } from '../wellness-validation';

describe('wellnessStatusConfigSchema', () => {
  it('should validate valid statusConfig with all fields', () => {
    const config = {
      questions: [
        { id: 'q_1', type: 'scale' as const, label: 'Wellness', scaleMin: 1, scaleMax: 5, required: true },
        { id: 'q_2', type: 'body_map' as const, label: 'Injuries', allowMultiple: true, required: false },
      ],
      statusConfig: {
        scaleOrientation: 'higher_is_better' as const,
        redThreshold: 2,
        yellowThreshold: 3,
        injuryQuestionIds: ['q_2'],
        injuryOverride: true,
      },
    };
    expect(() => wellnessTemplateConfigSchema.parse(config)).not.toThrow();
  });

  it('should validate statusConfig with lower_is_better orientation', () => {
    const config = {
      questions: [
        { id: 'q_1', type: 'scale' as const, label: 'Pain Level', scaleMin: 1, scaleMax: 5, required: true },
      ],
      statusConfig: {
        scaleOrientation: 'lower_is_better' as const,
        redThreshold: 4,
        yellowThreshold: 3,
        injuryQuestionIds: [],
        injuryOverride: false,
      },
    };
    expect(() => wellnessTemplateConfigSchema.parse(config)).not.toThrow();
  });

  it('should validate statusConfig with optional fields omitted', () => {
    const config = {
      questions: [
        { id: 'q_1', type: 'scale' as const, label: 'Wellness', scaleMin: 1, scaleMax: 5, required: true },
      ],
      statusConfig: {
        scaleOrientation: 'higher_is_better' as const,
        redThreshold: 2,
        yellowThreshold: 4,
        injuryQuestionIds: [],
        injuryOverride: false,
      },
    };
    expect(() => wellnessTemplateConfigSchema.parse(config)).not.toThrow();
  });

  it('should fail when higher_is_better and red >= yellow', () => {
    const config = {
      questions: [
        { id: 'q_1', type: 'scale' as const, label: 'Wellness', scaleMin: 1, scaleMax: 10, required: true },
      ],
      statusConfig: {
        scaleOrientation: 'higher_is_better' as const,
        redThreshold: 7,
        yellowThreshold: 3,
        injuryQuestionIds: [],
        injuryOverride: false,
      },
    };
    expect(() => wellnessTemplateConfigSchema.parse(config)).toThrow();
  });

  it('should fail when lower_is_better and red <= yellow', () => {
    const config = {
      questions: [
        { id: 'q_1', type: 'scale' as const, label: 'Pain', scaleMin: 1, scaleMax: 10, required: true },
      ],
      statusConfig: {
        scaleOrientation: 'lower_is_better' as const,
        redThreshold: 3,
        yellowThreshold: 7,
        injuryQuestionIds: [],
        injuryOverride: false,
      },
    };
    expect(() => wellnessTemplateConfigSchema.parse(config)).toThrow();
  });

  it('should validate template without statusConfig (optional)', () => {
    const config = {
      questions: [
        { id: 'q_1', type: 'scale' as const, label: 'Wellness', scaleMin: 1, scaleMax: 10, required: true },
      ],
    };
    expect(() => wellnessTemplateConfigSchema.parse(config)).not.toThrow();
  });

  it('should fail when scaleOrientation is invalid', () => {
    const config = {
      questions: [
        { id: 'q_1', type: 'scale' as const, label: 'Wellness', scaleMin: 1, scaleMax: 5, required: true },
      ],
      statusConfig: {
        scaleOrientation: 'invalid_orientation' as any,
        redThreshold: 2,
        yellowThreshold: 4,
        injuryQuestionIds: [],
        injuryOverride: false,
      },
    };
    expect(() => wellnessTemplateConfigSchema.parse(config)).toThrow();
  });

  it('should fail when redThreshold is negative', () => {
    const config = {
      questions: [
        { id: 'q_1', type: 'scale' as const, label: 'Wellness', scaleMin: 1, scaleMax: 10, required: true },
      ],
      statusConfig: {
        scaleOrientation: 'higher_is_better' as const,
        redThreshold: -1,
        yellowThreshold: 5,
        injuryQuestionIds: [],
        injuryOverride: false,
      },
    };
    expect(() => wellnessTemplateConfigSchema.parse(config)).toThrow();
  });

  it('should fail when yellowThreshold is negative', () => {
    const config = {
      questions: [
        { id: 'q_1', type: 'scale' as const, label: 'Wellness', scaleMin: 1, scaleMax: 10, required: true },
      ],
      statusConfig: {
        scaleOrientation: 'higher_is_better' as const,
        redThreshold: 2,
        yellowThreshold: -5,
        injuryQuestionIds: [],
        injuryOverride: false,
      },
    };
    expect(() => wellnessTemplateConfigSchema.parse(config)).toThrow();
  });

  it('should validate injuryQuestionIds array', () => {
    const config = {
      questions: [
        { id: 'q_1', type: 'scale' as const, label: 'Wellness', scaleMin: 1, scaleMax: 5, required: true },
        { id: 'q_2', type: 'body_map' as const, label: 'Injuries', allowMultiple: true, required: false },
        { id: 'q_3', type: 'body_map' as const, label: 'Pain Points', allowMultiple: true, required: false },
      ],
      statusConfig: {
        scaleOrientation: 'higher_is_better' as const,
        redThreshold: 2,
        yellowThreshold: 4,
        injuryQuestionIds: ['q_2', 'q_3'],
        injuryOverride: true,
      },
    };
    expect(() => wellnessTemplateConfigSchema.parse(config)).not.toThrow();
  });

  it('should validate empty injuryQuestionIds array', () => {
    const config = {
      questions: [
        { id: 'q_1', type: 'scale' as const, label: 'Wellness', scaleMin: 1, scaleMax: 5, required: true },
      ],
      statusConfig: {
        scaleOrientation: 'higher_is_better' as const,
        redThreshold: 2,
        yellowThreshold: 4,
        injuryQuestionIds: [],
        injuryOverride: false,
      },
    };
    expect(() => wellnessTemplateConfigSchema.parse(config)).not.toThrow();
  });

  it('should validate injuryOverride boolean values', () => {
    const configTrue = {
      questions: [
        { id: 'q_1', type: 'scale' as const, label: 'Wellness', scaleMin: 1, scaleMax: 5, required: true },
      ],
      statusConfig: {
        scaleOrientation: 'higher_is_better' as const,
        redThreshold: 2,
        yellowThreshold: 4,
        injuryQuestionIds: [],
        injuryOverride: true,
      },
    };
    expect(() => wellnessTemplateConfigSchema.parse(configTrue)).not.toThrow();

    const configFalse = {
      questions: [
        { id: 'q_1', type: 'scale' as const, label: 'Wellness', scaleMin: 1, scaleMax: 5, required: true },
      ],
      statusConfig: {
        scaleOrientation: 'higher_is_better' as const,
        redThreshold: 2,
        yellowThreshold: 4,
        injuryQuestionIds: [],
        injuryOverride: false,
      },
    };
    expect(() => wellnessTemplateConfigSchema.parse(configFalse)).not.toThrow();
  });
});
