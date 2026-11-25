/**
 * Wellness Validation Tests - Status Configuration
 *
 * Tests for the new statusConfig validation including scale orientation support
 */

import { describe, it, expect } from 'vitest';
import { wellnessTemplateConfigSchema, wellnessStatusConfigSchema, generateResponseValidationSchema, createWellnessRequestSchema } from '../wellness-validation';

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

describe('createWellnessRequestSchema - standing requests', () => {
  const templateId = '11111111-1111-4111-8111-111111111111';
  const athleteId = '22222222-2222-4222-8222-222222222222';
  const teamId = '33333333-3333-4333-8333-333333333333';
  const future = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const standing = { templateId, distributionMethod: 'athlete_account', isStanding: true, targetAthleteIds: [athleteId] };
  const messages = (input: unknown) => {
    const result = createWellnessRequestSchema.safeParse(input);
    return result.success ? [] : result.error.issues.map((i) => i.message);
  };

  it('defaults isStanding to false', () => {
    const result = createWellnessRequestSchema.parse({ templateId, distributionMethod: 'athlete_account' });
    expect(result.isStanding).toBe(false);
  });

  it('accepts a standing athlete_account request targeting athletes', () => {
    const result = createWellnessRequestSchema.parse(standing);
    expect(result.isStanding).toBe(true);
  });

  it('accepts a standing request targeting only teams', () => {
    const { targetAthleteIds: _omit, ...rest } = standing;
    expect(createWellnessRequestSchema.safeParse({ ...rest, targetTeamIds: [teamId] }).success).toBe(true);
  });

  it.each(['magic_link', 'team_link', 'qr_code'])('rejects a standing %s request', (distributionMethod) => {
    expect(messages({ ...standing, distributionMethod })).toContain('Standing requests must use athlete accounts');
  });

  it('rejects a standing request with expiresAt', () => {
    expect(messages({ ...standing, expiresAt: future() })).toContain('Standing requests cannot expire or be scheduled');
  });

  it('rejects a standing request with scheduledFor', () => {
    expect(messages({ ...standing, scheduledFor: future() })).toContain('Standing requests cannot expire or be scheduled');
  });

  it.each([
    ['no targets', {}],
    ['empty target lists', { targetAthleteIds: [], targetTeamIds: [] }],
  ])('rejects a standing request with %s', (_label, targets) => {
    const { targetAthleteIds: _omit, ...rest } = standing;
    expect(messages({ ...rest, ...targets })).toContain('Standing requests require at least one target athlete or team');
  });

  it('validates one-time requests as before', () => {
    // athlete_account with no targets, expiry and schedule is still fine
    expect(createWellnessRequestSchema.safeParse({
      templateId, distributionMethod: 'athlete_account', scheduledFor: future(), expiresAt: future(),
    }).success).toBe(true);
    expect(createWellnessRequestSchema.safeParse({ templateId, distributionMethod: 'team_link' }).success).toBe(true);
    // existing refines still apply
    expect(messages({ templateId, distributionMethod: 'magic_link' }))
      .toContain('Magic links and QR codes require at least one target athlete or team');
    expect(messages({ templateId, distributionMethod: 'athlete_account', expiresAt: new Date(Date.now() - 1000).toISOString() }))
      .toContain('Expiration date must be in the future');
  });
});
