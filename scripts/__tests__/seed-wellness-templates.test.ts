/**
 * Wellness Template Seeder - Unit Tests
 *
 * Tests that the seeder creates valid pre-built templates
 */

import { describe, it, expect } from 'vitest';
import { wellnessTemplateConfigSchema } from '@shared/wellness-validation';

// Import seeded templates (will be defined in the seeder)
import { getSystemTemplates } from '../seed-wellness-templates';

describe('Wellness Template Seeder', () => {
  const templates = getSystemTemplates();

  it('should create exactly 6 system templates', () => {
    expect(templates).toHaveLength(6);
  });

  it('should have all required template properties', () => {
    templates.forEach((template) => {
      expect(template).toHaveProperty('name');
      expect(template).toHaveProperty('description');
      expect(template).toHaveProperty('category');
      expect(template).toHaveProperty('tags');
      expect(template).toHaveProperty('config');
      expect(template).toHaveProperty('isSystemSeeded', true);
    });
  });

  it('should have valid categories', () => {
    const validCategories = ['general', 'recovery', 'performance', 'injury', 'training'];

    templates.forEach((template) => {
      expect(validCategories).toContain(template.category);
    });
  });

  it('should have at least one tag per template', () => {
    templates.forEach((template) => {
      expect(template.tags).toBeDefined();
      expect(template.tags.length).toBeGreaterThan(0);
    });
  });

  it('should have valid template configurations', () => {
    templates.forEach((template) => {
      const result = wellnessTemplateConfigSchema.safeParse(template.config);

      if (!result.success) {
        console.error(`Template "${template.name}" failed validation:`, result.error);
      }

      expect(result.success).toBe(true);
    });
  });

  it('should include Daily Wellness Check-in template', () => {
    const daily = templates.find((t) => t.name === 'Daily Wellness Check-in');

    expect(daily).toBeDefined();
    expect(daily?.category).toBe('general');
    expect(daily?.tags).toContain('daily');
    expect(daily?.tags).toContain('wellness');
  });

  it('should include Modified Hooper Index template', () => {
    const hooper = templates.find((t) => t.name === 'Modified Hooper Index');

    expect(hooper).toBeDefined();
    expect(hooper?.category).toBe('recovery');
    expect(hooper?.tags).toContain('fatigue');
    expect(hooper?.tags).toContain('hooper');
  });

  it('should include Post-Training Recovery template', () => {
    const recovery = templates.find((t) => t.name === 'Post-Training Recovery');

    expect(recovery).toBeDefined();
    expect(recovery?.category).toBe('recovery');
    expect(recovery?.tags).toContain('training');
    expect(recovery?.tags).toContain('recovery');
  });

  it('should include Pre-Competition Readiness template', () => {
    const readiness = templates.find((t) => t.name === 'Pre-Competition Readiness');

    expect(readiness).toBeDefined();
    expect(readiness?.category).toBe('performance');
    expect(readiness?.tags).toContain('competition');
    expect(readiness?.tags).toContain('readiness');
  });

  it('should include Weekly Injury Screening template', () => {
    const injury = templates.find((t) => t.name === 'Weekly Injury Screening');

    expect(injury).toBeDefined();
    expect(injury?.category).toBe('injury');
    expect(injury?.tags).toContain('injury');
    expect(injury?.tags).toContain('screening');
  });

  it('should include Session RPE template', () => {
    const rpe = templates.find((t) => t.name === 'Session RPE');

    expect(rpe).toBeDefined();
    expect(rpe?.category).toBe('training');
    expect(rpe?.tags).toContain('rpe');
    expect(rpe?.tags).toContain('training-load');
  });

  it('should have at least one question per template', () => {
    templates.forEach((template) => {
      expect(template.config.questions.length).toBeGreaterThan(0);
    });
  });

  it('should have unique template names', () => {
    const names = templates.map((t) => t.name);
    const uniqueNames = new Set(names);

    expect(names.length).toBe(uniqueNames.size);
  });

  it('should have valid question IDs (no duplicates within template)', () => {
    templates.forEach((template) => {
      const questionIds = template.config.questions.map((q) => q.id);
      const uniqueIds = new Set(questionIds);

      expect(questionIds.length).toBe(uniqueIds.size);
    });
  });

  it('Modified Hooper Index should use sum calculation method', () => {
    const hooper = templates.find((t) => t.name === 'Modified Hooper Index');

    expect(hooper?.config.statusConfig?.calculationMethod).toBe('sum');
  });

  it('Modified Hooper Index should use lower_is_better orientation', () => {
    const hooper = templates.find((t) => t.name === 'Modified Hooper Index');

    expect(hooper?.config.statusConfig?.scaleOrientation).toBe('lower_is_better');
  });
});
