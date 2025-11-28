/**
 * Wellness Validation Tests - Status Configuration
 *
 * Tests for the new statusConfig validation including scale orientation support
 */

import { describe, it, expect } from 'vitest';
import { wellnessTemplateConfigSchema, wellnessStatusConfigSchema, generateResponseValidationSchema } from '../wellness-validation';

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

describe('generateResponseValidationSchema', () => {
  it('should allow optional questions to be omitted from responses', () => {
    const config = {
      questions: [
        { id: 'q_1', type: 'scale' as const, label: 'Energy', scaleMin: 1, scaleMax: 10, required: true },
        { id: 'q_2', type: 'body_map' as const, label: 'Injuries', allowMultiple: true, required: false },
        { id: 'q_3', type: 'text' as const, label: 'Notes', required: false },
      ],
    };

    const responseSchema = generateResponseValidationSchema(config);

    // Valid: Include only required question
    const responseOnlyRequired = {
      q_1: { value: 7, label: 'Energy' },
    };
    expect(() => responseSchema.parse(responseOnlyRequired)).not.toThrow();

    // Valid: Include all questions
    const responseAll = {
      q_1: { value: 7, label: 'Energy' },
      q_2: { value: [{ x: 0.5, y: 0.3, label: 'Knee' }], label: 'Injuries' },
      q_3: { value: 'Feeling good', label: 'Notes' },
    };
    expect(() => responseSchema.parse(responseAll)).not.toThrow();

    // Valid: Include required + some optional
    const responsePartial = {
      q_1: { value: 7, label: 'Energy' },
      q_3: { value: 'Feeling good', label: 'Notes' },
    };
    expect(() => responseSchema.parse(responsePartial)).not.toThrow();
  });

  it('should reject responses missing required questions', () => {
    const config = {
      questions: [
        { id: 'q_1', type: 'scale' as const, label: 'Energy', scaleMin: 1, scaleMax: 10, required: true },
        { id: 'q_2', type: 'text' as const, label: 'Notes', required: false },
      ],
    };

    const responseSchema = generateResponseValidationSchema(config);

    // Invalid: Missing required question
    const responseMissingRequired = {
      q_2: { value: 'Just notes', label: 'Notes' },
    };
    expect(() => responseSchema.parse(responseMissingRequired)).toThrow();
  });

  it('should handle optional body_map questions correctly', () => {
    const config = {
      questions: [
        { id: 'q_1', type: 'scale' as const, label: 'Pain', scaleMin: 0, scaleMax: 10, required: true },
        { id: 'q_2', type: 'body_map' as const, label: 'Pain Points', allowMultiple: true, required: false },
      ],
    };

    const responseSchema = generateResponseValidationSchema(config);

    // Valid: Omit optional body_map
    const responseNoBodyMap = {
      q_1: { value: 2, label: 'Pain' },
    };
    expect(() => responseSchema.parse(responseNoBodyMap)).not.toThrow();

    // Valid: Include empty body_map array
    const responseEmptyBodyMap = {
      q_1: { value: 2, label: 'Pain' },
      q_2: { value: [], label: 'Pain Points' },
    };
    expect(() => responseSchema.parse(responseEmptyBodyMap)).not.toThrow();
  });
});
