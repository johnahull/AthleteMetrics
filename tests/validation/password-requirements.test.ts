import { describe, it, expect } from 'vitest';
import { validatePassword, PASSWORD_REQUIREMENTS, getPasswordRequirementsText } from '../../shared/password-requirements';

describe('Password Requirements Validation', () => {
  describe('validatePassword', () => {
    it('should accept valid passwords', () => {
      const validPasswords = [
        'MyP@ssw0rd123',
        'Secur3P@ssword!',
        'C0mpl3x!Pass',
        'Abcd123!@#$',
        'Test123!Password'
      ];

      validPasswords.forEach(password => {
        const result = validatePassword(password);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    it('should reject passwords shorter than minimum length', () => {
      const shortPasswords = ['Short1!', 'Abc123!', 'P@ss1'];

      shortPasswords.forEach(password => {
        const result = validatePassword(password);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes(`at least ${PASSWORD_REQUIREMENTS.minLength}`))).toBe(true);
      });
    });

    it('should reject passwords without lowercase letters', () => {
      const result = validatePassword('PASSWORD123!@#');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('lowercase'))).toBe(true);
    });

    it('should reject passwords without uppercase letters', () => {
      const result = validatePassword('password123!@#');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('uppercase'))).toBe(true);
    });

    it('should reject passwords without numbers', () => {
      const result = validatePassword('PasswordNoNum!@#');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('number'))).toBe(true);
    });

    it('should reject passwords without special characters', () => {
      const result = validatePassword('Password1234NoSpecial');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('special'))).toBe(true);
    });

    it('should return all applicable errors for invalid password', () => {
      const result = validatePassword('weak');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    it('should handle empty string', () => {
      const result = validatePassword('');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle null/undefined gracefully', () => {
      const result1 = validatePassword(null as any);
      const result2 = validatePassword(undefined as any);

      expect(result1.valid).toBe(false);
      expect(result2.valid).toBe(false);
    });
  });

  describe('PASSWORD_REQUIREMENTS constants', () => {
    it('should have correct minimum length', () => {
      expect(PASSWORD_REQUIREMENTS.minLength).toBe(12);
    });

    it('should require all complexity types', () => {
      expect(PASSWORD_REQUIREMENTS.requiresLowercase).toBe(true);
      expect(PASSWORD_REQUIREMENTS.requiresUppercase).toBe(true);
      expect(PASSWORD_REQUIREMENTS.requiresNumber).toBe(true);
      expect(PASSWORD_REQUIREMENTS.requiresSpecialChar).toBe(true);
    });
  });

  describe('getPasswordRequirementsText', () => {
    it('should return a non-empty string', () => {
      const text = getPasswordRequirementsText();
      expect(text).toBeTruthy();
      expect(text.length).toBeGreaterThan(0);
    });

    it('should include key requirements', () => {
      const text = getPasswordRequirementsText();
      expect(text.toLowerCase()).toContain('12');
      expect(text.toLowerCase()).toContain('lowercase');
      expect(text.toLowerCase()).toContain('uppercase');
    });
  });
});
