import { describe, it, expect } from 'vitest';
import { buildPrompt, ReportData } from '../ai-insights-service';

function individual(overrides: Partial<ReportData> = {}): ReportData {
  return {
    reportType: 'individual',
    reportName: 'Sprint Report',
    organizationName: 'Test Org',
    timeframe: 'Current Season',
    metrics: [{ code: 'FLY10_TIME', label: '10-Yard Fly Time', values: [1.52], unit: 's', lowerIsBetter: true }],
    athleteName: 'Jordan Smith',
    ...overrides,
  };
}

describe('buildPrompt — everything the individual report shows', () => {
  it('lists each metric\'s dated history inside the data fence', () => {
    const prompt = buildPrompt(individual({
      history: [{ code: 'FLY10_TIME', label: '10-Yard Fly Time', points: [{ date: '2024-01-15', value: 1.6 }, { date: '2024-03-15', value: 1.52 }] }],
    }));
    expect(prompt).toContain('## History');
    expect(prompt).toContain('- 10-Yard Fly Time (s): 2024-01-15 1.60, 2024-03-15 1.52');
    expect(prompt.indexOf('## History')).toBeLessThan(prompt.indexOf('</report_data>'));
  });

  it('lets the model cite History values without computing changes', () => {
    const prompt = buildPrompt(individual({
      keyFacts: ['Biggest change: 10-Yard Fly Time, improved 5.0% (from 1.60 s to 1.52 s)'],
      history: [{ code: 'FLY10_TIME', label: '10-Yard Fly Time', points: [{ date: '2024-01-15', value: 1.6 }, { date: '2024-03-15', value: 1.52 }] }],
    }));
    expect(prompt).toContain('You may cite the dated values in the History section');
  });

  it('shows the peer spread as a five-number summary', () => {
    const prompt = buildPrompt(individual({
      distributions: [{ code: 'FLY10_TIME', label: '10-Yard Fly Time', min: 1.3, q1: 1.35, median: 1.4, q3: 1.45, max: 1.5 }],
    }));
    expect(prompt).toContain('## Peer Distribution');
    expect(prompt).toContain('- 10-Yard Fly Time: min 1.30, Q1 1.35, median 1.40, Q3 1.45, max 1.50');
  });

  it('shows the composite index and the F-V profile', () => {
    const prompt = buildPrompt(individual({
      compositeIndex: 72.46,
      fvProfile: { date: '2024-02-01', distanceUnit: 'yards', f0Rel: 7.25, v0: 8.1, pmaxRel: 14.7, fvSlope: -0.9 },
    }));
    expect(prompt).toContain('- Composite index: 72.46');
    expect(prompt).toContain('## Force-Velocity Profile');
    expect(prompt).toContain('F0 (relative force) 7.25 N/kg');
    expect(prompt).toContain('V0 8.10 m/s');
    expect(prompt).toContain('Pmax (relative power) 14.70 W/kg');
    expect(prompt).toContain('F-V slope -0.90');
    expect(prompt).toContain('2024-02-01');
  });

  it('adds nothing when the fields are absent', () => {
    const prompt = buildPrompt(individual());
    for (const heading of ['## History', '## Peer Distribution', '## Force-Velocity Profile', '- Composite index:']) {
      expect(prompt).not.toContain(heading);
    }
  });
});
