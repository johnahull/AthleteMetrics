import { describe, it, expect, vi, beforeEach } from 'vitest';

const { anthropicSpy } = vi.hoisted(() => ({ anthropicSpy: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({ messages: { create: anthropicSpy } })),
}));

import { buildPrompt, fillFirstName, generateCoachingInsights, type ReportData } from '../ai-insights-service';

function individual(overrides: Partial<ReportData> = {}): ReportData {
  return {
    reportType: 'individual',
    reportName: 'Evaluation - Evelyn Garcia',
    organizationName: 'Northside Athletics',
    timeframe: 'Last 30 days',
    isEventReport: true,
    eventDate: '9/14/2025',
    athleteName: 'Evelyn Garcia',
    athleteAge: 14,
    athleteSport: 'Soccer',
    metrics: [{ code: 'FLY10_TIME', label: '10-Yard Fly', values: [1.5], unit: 's', lowerIsBetter: true, teamAverage: 1.6, percentile: 70 }],
    keyFacts: ['Strongest metric: 10-Yard Fly, 70th percentile vs the comparison group'],
    ...overrides,
  };
}

describe('buildPrompt de-identification', () => {
  const identifying = ['Evelyn', 'Garcia', 'Northside', 'Evaluation -', '- Age: 14'];

  it('contains no identifying strings', () => {
    for (const audience of ['coach', 'athlete', 'parent'] as const) {
      const prompt = buildPrompt(individual({ audience }));
      for (const s of identifying) expect(prompt).not.toContain(s);
    }
  });

  it('keeps the event date and the one-event instruction without the event name', () => {
    const prompt = buildPrompt(individual());
    expect(prompt).toContain('9/14/2025');
    expect(prompt).toContain('one testing event');
    expect(prompt).not.toContain('- Event:');
  });

  it('prints an age band instead of the exact age', () => {
    const band = (age: number) => buildPrompt(individual({ athleteAge: age })).match(/- Age band: (.*)\n/)?.[1];
    expect([9, 10, 12, 13, 14, 15, 16, 17, 18, 19].map(band)).toEqual(
      ['U10', '10-12', '10-12', '13-14', '13-14', '15-16', '15-16', '17-18', '17-18', 'adult'],
    );
  });

  it('omits the age line when age is unknown', () => {
    expect(buildPrompt(individual({ athleteAge: undefined }))).not.toContain('Age band');
  });

  it('team report drops the team name but keeps sport and athlete count', () => {
    const prompt = buildPrompt({
      reportType: 'team', reportName: 'Varsity Boys Preseason', organizationName: 'Northside Athletics',
      timeframe: 'Last 30 days', teamName: 'Varsity Boys', teamSport: 'Soccer', athleteCount: 12, metrics: [],
    });
    expect(prompt).not.toContain('Varsity Boys');
    expect(prompt).toContain('- Sport: Soccer');
    expect(prompt).toContain('- Athletes: 12');
  });

  it('parent and athlete audiences ask for the {{first_name}} placeholder, coach does not', () => {
    expect(buildPrompt(individual({ audience: 'parent' }))).toContain('{{first_name}}');
    expect(buildPrompt(individual({ audience: 'athlete' }))).toContain('{{first_name}}');
    expect(buildPrompt(individual({ audience: 'coach' }))).not.toContain('{{first_name}}');
  });
});

describe('fillFirstName', () => {
  it('replaces tolerant placeholder variants', () => {
    expect(fillFirstName('Hi {{first_name}}, {{ First Name }} and {{firstname}}.', 'Evelyn')).toBe('Hi Evelyn, Evelyn and Evelyn.');
  });
  it('falls back to "your athlete" with no name', () => {
    expect(fillFirstName('{{first_name}} ran well', undefined)).toBe('Your athlete ran well');
    expect(fillFirstName('{{first_name}} ran well', '  ')).toBe('Your athlete ran well');
  });
  it('lowercases the fallback mid-sentence and capitalises it after a sentence end', () => {
    expect(fillFirstName('Great work by {{first_name}}. {{first_name}} ran well', undefined)).toBe('Great work by your athlete. Your athlete ran well');
    expect(fillFirstName('- {{first_name}} improved', undefined)).toBe('- Your athlete improved');
  });
  it('catches single-brace and athlete_first_name variants', () => {
    expect(fillFirstName('{first_name} and {{athlete_first_name}} and {{first-name}}', 'Evelyn')).toBe('Evelyn and Evelyn and Evelyn');
  });
  it('uses only the first word of the name', () => {
    expect(fillFirstName('{{first_name}}', 'Evelyn Garcia')).toBe('Evelyn');
  });
  it('leaves text without a placeholder alone', () => {
    expect(fillFirstName('No placeholder.', 'Evelyn')).toBe('No placeholder.');
  });
});

describe('generateCoachingInsights', () => {
  beforeEach(() => {
    anthropicSpy.mockReset().mockResolvedValue({ content: [{ type: 'text', text: '## Summary\n{{first_name}} ran 1.50 s.' }] });
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
  });

  it('sends no name to the provider and fills the first name into the output', async () => {
    const out = await generateCoachingInsights('claude-haiku-4.5', individual({ audience: 'parent' }));
    expect(out).toBe('## Summary\nEvelyn ran 1.50 s.');
    expect(JSON.stringify(anthropicSpy.mock.calls[0][0])).not.toContain('Evelyn');
  });

  it('falls back to "your athlete" when the report has no athlete name', async () => {
    const out = await generateCoachingInsights('claude-haiku-4.5', individual({ audience: 'parent', athleteName: undefined }));
    expect(out).toBe('## Summary\nYour athlete ran 1.50 s.');
  });
});
