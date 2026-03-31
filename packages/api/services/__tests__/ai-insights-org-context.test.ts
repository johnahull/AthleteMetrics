import { describe, it, expect } from 'vitest';
import { buildPrompt, sanitizeForPrompt, ReportData } from '../ai-insights-service';

/**
 * Unit tests for organizationContext handling in buildPrompt.
 *
 * These tests verify that the org-level AI prompt context is correctly
 * injected, sanitized, truncated, and positioned within the generated prompt.
 */

function makeReportData(overrides: Partial<ReportData> = {}): ReportData {
  return {
    reportType: 'team',
    reportName: 'Test Report',
    organizationName: 'Test Org',
    timeframe: '2024-01-01 to 2024-12-31',
    metrics: [],
    ...overrides,
  };
}

describe('buildPrompt – organizationContext', () => {
  it('includes organization context in prompt when set', () => {
    const data = makeReportData({
      organizationContext: 'We emphasize speed development using French Contrast training.',
    });

    const prompt = buildPrompt(data);

    expect(prompt).toContain('## Organization Context');
    expect(prompt).toContain('We emphasize speed development using French Contrast training.');
    expect(prompt).toContain(
      'incorporate this context to make recommendations specific to this organization',
    );
  });

  it('omits organization context section when organizationContext is undefined', () => {
    const data = makeReportData({ organizationContext: undefined });

    const prompt = buildPrompt(data);

    expect(prompt).not.toContain('## Organization Context');
    expect(prompt).not.toContain('incorporate this context');
  });

  it('omits organization context section when organizationContext is empty string', () => {
    const data = makeReportData({ organizationContext: '' });

    const prompt = buildPrompt(data);

    expect(prompt).not.toContain('## Organization Context');
    expect(prompt).not.toContain('incorporate this context');
  });

  it('truncates organization context longer than 2000 characters', () => {
    // sanitizeForPrompt caps individual fields at 500 chars, but the org context
    // path applies an additional .substring(0, 2000) after sanitization.
    // Since sanitizeForPrompt already caps at 500, anything over 500 gets cut first.
    // We test the effective truncation: content beyond 500 chars is removed.
    const longContext = 'A'.repeat(600);
    const data = makeReportData({ organizationContext: longContext });

    const prompt = buildPrompt(data);

    // sanitizeForPrompt truncates to 500 first, then .substring(0, 2000) is a no-op
    expect(prompt).toContain('A'.repeat(500));
    expect(prompt).not.toContain('A'.repeat(501));
  });

  it('appears AFTER the AI role definition', () => {
    const data = makeReportData({
      organizationContext: 'Our philosophy is athlete-centered periodization.',
    });

    const prompt = buildPrompt(data);

    const roleIndex = prompt.indexOf('You are an expert athletic performance coach');
    const contextIndex = prompt.indexOf('## Organization Context');

    expect(roleIndex).toBeGreaterThanOrEqual(0);
    expect(contextIndex).toBeGreaterThan(roleIndex);
  });

  it('appears BEFORE the Report Context section', () => {
    const data = makeReportData({
      organizationContext: 'Our philosophy is athlete-centered periodization.',
    });

    const prompt = buildPrompt(data);

    const contextIndex = prompt.indexOf('## Organization Context');
    const reportContextIndex = prompt.indexOf('## Report Context');

    expect(contextIndex).toBeGreaterThanOrEqual(0);
    expect(reportContextIndex).toBeGreaterThan(contextIndex);
  });

  it('sanitizes markdown special characters from organization context', () => {
    const data = makeReportData({
      organizationContext: '## Our **philosophy** uses `metrics` and [links](http://evil.com)',
    });

    const prompt = buildPrompt(data);

    // Extract just the org context section to avoid false positives from
    // the hardcoded Instructions section which legitimately uses markdown
    const contextStart = prompt.indexOf('## Organization Context');
    const contextEnd = prompt.indexOf('## Report Context');
    const contextSection = prompt.substring(contextStart, contextEnd);

    // sanitizeForPrompt strips #, *, `, [, ], <, > from user content
    // The "## Organization Context" heading itself uses markdown, so check the body
    const contextBody = contextSection.replace('## Organization Context\n', '');
    expect(contextBody).not.toContain('**');
    expect(contextBody).not.toContain('`');
    expect(contextBody).not.toContain('[links]');
    // But the plain text content should survive
    expect(contextBody).toContain('Our');
    expect(contextBody).toContain('philosophy');
    expect(contextBody).toContain('metrics');
  });

  it('normalizes newlines and whitespace in organization context', () => {
    const data = makeReportData({
      organizationContext: 'Line one.\n\nLine two.\n\n\nLine three.   Extra   spaces.',
    });

    const prompt = buildPrompt(data);

    // sanitizeForPrompt converts newlines to spaces and normalizes whitespace
    expect(prompt).toContain('Line one. Line two. Line three. Extra spaces.');
  });

  it('handles context that becomes empty after sanitization', () => {
    // A context made entirely of banned characters should result in no context section
    const data = makeReportData({
      organizationContext: '####****``[]<>',
    });

    const prompt = buildPrompt(data);

    // After sanitizeForPrompt strips all chars, the result is empty string
    // The if (sanitizedContext) check should skip the section
    expect(prompt).not.toContain('## Organization Context');
  });
});

describe('sanitizeForPrompt – direct tests', () => {
  it('strips markdown special characters', () => {
    expect(sanitizeForPrompt('**bold** and `code`')).toBe('bold and code');
  });

  it('converts newlines to spaces', () => {
    expect(sanitizeForPrompt('line1\nline2\n\nline3')).toBe('line1 line2 line3');
  });

  it('normalizes multiple spaces', () => {
    expect(sanitizeForPrompt('a   b     c')).toBe('a b c');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeForPrompt('  hello  ')).toBe('hello');
  });

  it('truncates to 500 characters', () => {
    const long = 'x'.repeat(600);
    expect(sanitizeForPrompt(long)).toHaveLength(500);
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeForPrompt('')).toBe('');
  });

  it('returns empty string for undefined-like input', () => {
    // The function checks !input, so null/undefined cast to falsy
    expect(sanitizeForPrompt(null as unknown as string)).toBe('');
    expect(sanitizeForPrompt(undefined as unknown as string)).toBe('');
  });
});
