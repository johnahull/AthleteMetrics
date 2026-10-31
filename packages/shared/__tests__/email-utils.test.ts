import { describe, it, expect } from 'vitest';
import { isPlaceholderEmail } from '../email-utils';

describe('isPlaceholderEmail', () => {
  it.each([
    'abc@temp.local',
    'abc@ocr-import.local',
    'abc@placeholder.example.com',
  ])('flags %s', (email) => {
    expect(isPlaceholderEmail(email)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isPlaceholderEmail('ABC@TEMP.LOCAL')).toBe(true);
  });

  it('does not flag real emails', () => {
    expect(isPlaceholderEmail('kid@gmail.com')).toBe(false);
    expect(isPlaceholderEmail('temp.local@gmail.com')).toBe(false);
  });

  it('treats empty/missing as placeholder', () => {
    expect(isPlaceholderEmail('')).toBe(true);
    expect(isPlaceholderEmail(null)).toBe(true);
    expect(isPlaceholderEmail(undefined)).toBe(true);
  });
});
