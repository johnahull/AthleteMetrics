/**
 * Wellness Template Library - Schema Validation Tests
 *
 * Tests for new library fields:
 * - category (text)
 * - tags (text[])
 * - is_system_seeded (boolean)
 * - source_template_id (uuid)
 */

import { describe, it, expect } from 'vitest';
import {
  createWellnessTemplateSchema,
  updateWellnessTemplateSchema,
} from '../wellness-validation';

describe('Wellness Library Schema Validation', () => {
  describe('Template Category Validation', () => {
    it('should accept valid category', () => {
      const result = createWellnessTemplateSchema.safeParse({
        name: 'Test Template',
        category: 'general',
        config: {
          questions: [{
            id: 'q1',
            type: 'scale',
            label: 'Test Question',
            scaleMin: 1,
            scaleMax: 5,
            required: true,
          }],
        },
      });

      expect(result.success).toBe(true);
    });

    it('should accept undefined category (optional)', () => {
      const result = createWellnessTemplateSchema.safeParse({
        name: 'Test Template',
        config: {
          questions: [{
            id: 'q1',
            type: 'scale',
            label: 'Test Question',
            scaleMin: 1,
            scaleMax: 5,
            required: true,
          }],
        },
      });

      expect(result.success).toBe(true);
    });

    it('should reject category longer than 50 characters', () => {
      const result = createWellnessTemplateSchema.safeParse({
        name: 'Test Template',
        category: 'a'.repeat(51),
        config: {
          questions: [{
            id: 'q1',
            type: 'scale',
            label: 'Test Question',
            scaleMin: 1,
            scaleMax: 5,
            required: true,
          }],
        },
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Template Tags Validation', () => {
    it('should accept array of valid tags', () => {
      const result = createWellnessTemplateSchema.safeParse({
        name: 'Test Template',
        tags: ['daily', 'wellness', 'recovery'],
        config: {
          questions: [{
            id: 'q1',
            type: 'scale',
            label: 'Test Question',
            scaleMin: 1,
            scaleMax: 5,
            required: true,
          }],
        },
      });

      expect(result.success).toBe(true);
    });

    it('should accept empty tags array', () => {
      const result = createWellnessTemplateSchema.safeParse({
        name: 'Test Template',
        tags: [],
        config: {
          questions: [{
            id: 'q1',
            type: 'scale',
            label: 'Test Question',
            scaleMin: 1,
            scaleMax: 5,
            required: true,
          }],
        },
      });

      expect(result.success).toBe(true);
    });

    it('should accept undefined tags (optional)', () => {
      const result = createWellnessTemplateSchema.safeParse({
        name: 'Test Template',
        config: {
          questions: [{
            id: 'q1',
            type: 'scale',
            label: 'Test Question',
            scaleMin: 1,
            scaleMax: 5,
            required: true,
          }],
        },
      });

      expect(result.success).toBe(true);
    });

    it('should reject tags exceeding 20 items', () => {
      const result = createWellnessTemplateSchema.safeParse({
        name: 'Test Template',
        tags: Array(21).fill('tag'),
        config: {
          questions: [{
            id: 'q1',
            type: 'scale',
            label: 'Test Question',
            scaleMin: 1,
            scaleMax: 5,
            required: true,
          }],
        },
      });

      expect(result.success).toBe(false);
    });

    it('should reject individual tags longer than 30 characters', () => {
      const result = createWellnessTemplateSchema.safeParse({
        name: 'Test Template',
        tags: ['a'.repeat(31)],
        config: {
          questions: [{
            id: 'q1',
            type: 'scale',
            label: 'Test Question',
            scaleMin: 1,
            scaleMax: 5,
            required: true,
          }],
        },
      });

      expect(result.success).toBe(false);
    });
  });

  describe('System Seeded Flag Validation', () => {
    it('should accept is_system_seeded as true', () => {
      const result = createWellnessTemplateSchema.safeParse({
        name: 'Test Template',
        isSystemSeeded: true,
        config: {
          questions: [{
            id: 'q1',
            type: 'scale',
            label: 'Test Question',
            scaleMin: 1,
            scaleMax: 5,
            required: true,
          }],
        },
      });

      expect(result.success).toBe(true);
    });

    it('should accept is_system_seeded as false', () => {
      const result = createWellnessTemplateSchema.safeParse({
        name: 'Test Template',
        isSystemSeeded: false,
        config: {
          questions: [{
            id: 'q1',
            type: 'scale',
            label: 'Test Question',
            scaleMin: 1,
            scaleMax: 5,
            required: true,
          }],
        },
      });

      expect(result.success).toBe(true);
    });

    it('should default is_system_seeded to false', () => {
      const result = createWellnessTemplateSchema.safeParse({
        name: 'Test Template',
        config: {
          questions: [{
            id: 'q1',
            type: 'scale',
            label: 'Test Question',
            scaleMin: 1,
            scaleMax: 5,
            required: true,
          }],
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isSystemSeeded).toBe(false);
      }
    });
  });

  describe('Source Template ID Validation', () => {
    it('should accept valid UUID for source_template_id', () => {
      const result = createWellnessTemplateSchema.safeParse({
        name: 'Test Template',
        sourceTemplateId: '123e4567-e89b-12d3-a456-426614174000',
        config: {
          questions: [{
            id: 'q1',
            type: 'scale',
            label: 'Test Question',
            scaleMin: 1,
            scaleMax: 5,
            required: true,
          }],
        },
      });

      expect(result.success).toBe(true);
    });

    it('should accept undefined source_template_id (optional)', () => {
      const result = createWellnessTemplateSchema.safeParse({
        name: 'Test Template',
        config: {
          questions: [{
            id: 'q1',
            type: 'scale',
            label: 'Test Question',
            scaleMin: 1,
            scaleMax: 5,
            required: true,
          }],
        },
      });

      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID format for source_template_id', () => {
      const result = createWellnessTemplateSchema.safeParse({
        name: 'Test Template',
        sourceTemplateId: 'not-a-uuid',
        config: {
          questions: [{
            id: 'q1',
            type: 'scale',
            label: 'Test Question',
            scaleMin: 1,
            scaleMax: 5,
            required: true,
          }],
        },
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Update Schema with Library Fields', () => {
    it('should allow updating category', () => {
      const result = updateWellnessTemplateSchema.safeParse({
        category: 'recovery',
      });

      expect(result.success).toBe(true);
    });

    it('should allow updating tags', () => {
      const result = updateWellnessTemplateSchema.safeParse({
        tags: ['fatigue', 'monitoring'],
      });

      expect(result.success).toBe(true);
    });

    it('should allow updating sourceTemplateId', () => {
      const result = updateWellnessTemplateSchema.safeParse({
        sourceTemplateId: '123e4567-e89b-12d3-a456-426614174000',
      });

      expect(result.success).toBe(true);
    });
  });
});
