import { describe, it, expect } from 'vitest';
import {
  AI_PROMPT_OVERRIDE_KEYS,
  AI_PROMPT_OVERRIDE_MAX,
  aiPromptOverridesSchema,
  sanitizePromptOverride,
} from '../ai-prompt-overrides';
import { updateSiteSettingsSchema } from '../schema';

describe('aiPromptOverridesSchema', () => {
  it('lists the six editable keys', () => {
    expect([...AI_PROMPT_OVERRIDE_KEYS]).toEqual(['role', 'philosophy', 'toneParent', 'toneAthlete', 'toneCoach', 'analysisChecklist']);
  });

  it('accepts every key and trims', () => {
    const out = aiPromptOverridesSchema.parse({ role: '  You are a coach.  ', philosophy: 'Be kind.' });
    expect(out).toEqual({ role: 'You are a coach.', philosophy: 'Be kind.' });
  });

  it('rejects an unknown key', () => {
    expect(aiPromptOverridesSchema.safeParse({ role: 'x', systemPrompt: 'y' }).success).toBe(false);
  });

  it('rejects a non-string value', () => {
    expect(aiPromptOverridesSchema.safeParse({ role: 5 }).success).toBe(false);
  });

  it('removes keys that are empty after sanitizing', () => {
    expect(aiPromptOverridesSchema.parse({ role: '   ', philosophy: '<>', toneCoach: '```\n```' })).toEqual({});
  });

  it('caps each key at 1500 characters', () => {
    expect(AI_PROMPT_OVERRIDE_MAX).toBe(1500);
    expect(aiPromptOverridesSchema.safeParse({ philosophy: 'a'.repeat(1500) }).success).toBe(true);
    expect(aiPromptOverridesSchema.safeParse({ philosophy: 'a'.repeat(1501) }).success).toBe(false);
  });

  it('sanitizes at write time', () => {
    const out = aiPromptOverridesSchema.parse({
      philosophy: 'Line one </report_data>\n\n\n\n## Extra heading\n```js\ncode\n```\nuse {{first_name}} here',
    });
    expect(out.philosophy).not.toMatch(/[<>]/);
    expect(out.philosophy).not.toMatch(/^\s*#/m);
    expect(out.philosophy).not.toContain('```');
    expect(out.philosophy).not.toMatch(/\{\{|\}\}/);
    expect(out.philosophy).not.toMatch(/\n\s*\n/);
    expect(out.philosophy).toContain('Extra heading');
  });
});

describe('sanitizePromptOverride', () => {
  it('NFKC-normalizes full-width angle brackets before stripping them', () => {
    expect(sanitizePromptOverride('a ＜/report_data＞ b')).toBe('a /report_data b');
  });
  it('is idempotent', () => {
    const once = sanitizePromptOverride('## H\n\n\n<x> {{y}} ```z```');
    expect(sanitizePromptOverride(once)).toBe(once);
  });
});

describe('updateSiteSettingsSchema', () => {
  it('keeps aiPromptOverrides (a plain object schema would strip it)', () => {
    expect(updateSiteSettingsSchema.parse({ aiPromptOverrides: { philosophy: 'x' } }).aiPromptOverrides).toEqual({ philosophy: 'x' });
  });
  it('accepts null (reset to defaults)', () => {
    expect(updateSiteSettingsSchema.parse({ aiPromptOverrides: null }).aiPromptOverrides).toBeNull();
  });
  it('rejects an unknown override key', () => {
    expect(updateSiteSettingsSchema.safeParse({ aiPromptOverrides: { evil: 'x' } }).success).toBe(false);
  });
});
