/**
 * Tests for parentEmail field on insertAthleteSchema and updateProfileSchema
 *
 * TDD Phase 1: RED — these tests are written before the schema changes.
 * They should FAIL until Phase 1 GREEN is applied.
 */

import { describe, it, expect } from 'vitest';
import { insertAthleteSchema, updateProfileSchema } from '../schema';

describe('insertAthleteSchema — parentEmail field', () => {
  it('accepts a valid parentEmail string', () => {
    const result = insertAthleteSchema.safeParse({
      firstName: 'Test',
      lastName: 'Athlete',
      parentEmail: 'parent@example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parentEmail).toBe('parent@example.com');
    }
  });

  it('accepts when parentEmail is omitted (optional)', () => {
    const result = insertAthleteSchema.safeParse({
      firstName: 'Test',
      lastName: 'Athlete',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parentEmail).toBeUndefined();
    }
  });

  it('accepts parentEmail: null (nullable)', () => {
    const result = insertAthleteSchema.safeParse({
      firstName: 'Test',
      lastName: 'Athlete',
      parentEmail: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parentEmail).toBeNull();
    }
  });

  it('rejects an invalid email in parentEmail', () => {
    const result = insertAthleteSchema.safeParse({
      firstName: 'Test',
      lastName: 'Athlete',
      parentEmail: 'not-a-valid-email',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map(i => i.message);
      expect(messages.some(m => m.toLowerCase().includes('email'))).toBe(true);
    }
  });
});

describe('updateProfileSchema — parentEmail field', () => {
  it('accepts a valid parentEmail string', () => {
    const result = updateProfileSchema.safeParse({
      parentEmail: 'parent@example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parentEmail).toBe('parent@example.com');
    }
  });

  it('accepts when parentEmail is omitted (optional)', () => {
    const result = updateProfileSchema.safeParse({
      firstName: 'Alex',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // parentEmail not present in data when omitted
      expect((result.data as any).parentEmail).toBeUndefined();
    }
  });

  it('accepts parentEmail: null (nullable)', () => {
    const result = updateProfileSchema.safeParse({
      parentEmail: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).parentEmail).toBeNull();
    }
  });

  it('rejects an invalid email in parentEmail', () => {
    const result = updateProfileSchema.safeParse({
      parentEmail: 'bad-email',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map(i => i.message);
      expect(messages.some(m => m.toLowerCase().includes('email'))).toBe(true);
    }
  });
});
