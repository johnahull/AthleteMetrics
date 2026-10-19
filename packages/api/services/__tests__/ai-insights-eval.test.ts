import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  athleteNamesIn,
  checkInsights,
  countWords,
  missingHeadings,
  ungroundedNumbers,
} from '../ai-insights-eval';
import { buildPrompt, SYSTEM_PROMPT } from '../ai-insights-service';
import { GOLDEN_CASES } from './fixtures/ai-insights-golden';

/**
 * Output checker for the AI insights eval harness, proven against recorded good and
 * deliberately bad sample outputs.
 */

const sample = (file: string) => readFileSync(join(__dirname, 'fixtures/ai-insights-samples', file), 'utf8');
const golden = (name: string) => GOLDEN_CASES.find(c => c.name === name)!;
const promptFor = (name: string, audience: 'coach' | 'athlete' | 'parent' = 'coach') =>
  `${SYSTEM_PROMPT}\n${buildPrompt({ ...golden(name).data, audience })}`;

describe('ungroundedNumbers', () => {
  it('passes numbers that appear in the prompt, in any decimal formatting', () => {
    expect(ungroundedNumbers('Average 24.6 in (SD 3.10), 78th percentile, 5.0%', 'average 24.60, SD 3.1, 78.0th, 5%')).toEqual([]);
  });

  it('reports numbers the prompt does not contain', () => {
    expect(ungroundedNumbers('10 athletes are 0.15 s slower', 'Fly 1.32 s, 24 athletes')).toEqual(['10', '0.15']);
  });

  it('reads numbers inside ranges and labels', () => {
    expect(ungroundedNumbers('5-10-5 Agility 1.18-1.51 s', '5-10-5 range 1.18-1.51')).toEqual([]);
  });
});

describe('athleteNamesIn', () => {
  it('finds full names and name parts as whole words', () => {
    expect(athleteNamesIn('Great work from Smith and Avery Jones.', ['Jordan Smith', 'Avery Jones'])).toEqual(['Jordan Smith', 'Avery Jones']);
  });

  it('does not match a name inside a longer word', () => {
    expect(athleteNamesIn('Smithfield results', ['Jordan Smith'])).toEqual([]);
  });
});

describe('missingHeadings', () => {
  it('accepts the audience headings as markdown headings, straight or curly apostrophe', () => {
    const output = "## Summary\nx\n## What’s Going Well\nx\n## What to Work On\nx\n## Next Steps\nx";
    expect(missingHeadings(output, 'coach')).toEqual([]);
  });

  it('lists headings that are absent or only bold text', () => {
    expect(missingHeadings('## Summary\n**Next Steps**', 'coach')).toEqual(["What's Going Well", 'What to Work On', 'Next Steps']);
  });
});

describe('countWords', () => {
  it('counts words, not markdown symbols', () => {
    expect(countWords('## Summary\n- **Fly**: 1.24 s')).toBe(4);
  });
});

describe('checkInsights on recorded samples', () => {
  it('passes a good team output', () => {
    expect(checkInsights({
      output: sample('team-good.md'), prompt: promptFor('team-benchmarks'), reportType: 'team', audience: 'coach',
      athleteNames: golden('team-benchmarks').rosterNames,
    })).toEqual([]);
  });

  it('catches every violation in a bad team output', () => {
    const failures = checkInsights({
      output: sample('team-bad.md'), prompt: promptFor('team-benchmarks'), reportType: 'team', audience: 'coach',
      athleteNames: golden('team-benchmarks').rosterNames,
    });
    expect(failures.join('\n')).toMatch(/numbers not in the input: .*0\.15/);
    expect(failures.join('\n')).toContain('athlete names in a team output: Jordan Smith');
    expect(failures.join('\n')).toContain('missing headings: Next Steps');
    expect(failures.join('\n')).toMatch(/word count \d+ outside 200-350/);
  });

  it('passes a good individual coach output', () => {
    expect(checkInsights({
      output: sample('individual-coach-good.md'), prompt: promptFor('individual-benchmarks'),
      reportType: 'individual', audience: 'coach',
    })).toEqual([]);
  });

  it('catches invented numbers and a missing heading in a bad individual output', () => {
    const failures = checkInsights({
      output: sample('individual-coach-bad.md'), prompt: promptFor('individual-benchmarks'),
      reportType: 'individual', audience: 'coach',
    }).join('\n');
    expect(failures).toMatch(/numbers not in the input: .*28/);
    expect(failures).toContain("missing headings: What's Going Well");
  });

  it('does not check names on individual outputs (the athlete is named on purpose)', () => {
    expect(checkInsights({
      output: sample('individual-coach-good.md'), prompt: promptFor('individual-benchmarks'),
      reportType: 'individual', audience: 'coach', athleteNames: ['Jordan Smith'],
    })).toEqual([]);
  });
});
