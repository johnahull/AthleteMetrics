import { describe, it, expect } from 'vitest';
import {
  renderMarkdown,
  renderJson,
  filenameFor,
  type AthleteExportData,
} from '../llm-export-service';

function sampleData(overrides: Partial<AthleteExportData> = {}): AthleteExportData {
  return {
    generatedAt: new Date('2026-04-19T12:00:00Z'),
    athlete: {
      id: 'athlete-1',
      fullName: 'Jane Doe',
      age: 17,
      gender: 'Female',
      graduationYear: 2027,
      heightIn: 66,
      weightLb: 135,
      sports: ['Soccer'],
      positions: ['Midfielder'],
      teams: [{ name: 'Varsity Soccer', level: 'HS', season: '2026-Spring' }],
    },
    organization: { id: 'org-1', name: 'Example High School' },
    currentSnapshot: [
      {
        metricCode: 'FLY10_TIME',
        metricLabel: '10-yd Fly Time',
        value: 1.08,
        units: 's',
        date: '2026-03-14',
      },
      {
        metricCode: 'VERTICAL_JUMP',
        metricLabel: 'Vertical Jump',
        value: 24.5,
        units: 'in',
        date: '2026-03-14',
      },
    ],
    measurementHistory: {
      FLY10_TIME: [
        { date: '2026-03-14', value: 1.08, units: 's' },
        { date: '2026-01-10', value: 1.12, units: 's' },
      ],
      VERTICAL_JUMP: [{ date: '2026-03-14', value: 24.5, units: 'in' }],
    },
    sprintFv: {
      date: '2026-03-14',
      f0Rel: 7.2,
      v0: 9.1,
      pmaxRel: 16.4,
      fvSlope: -0.79,
      rfPeak: 0.42,
      drf: -0.071,
      fitR2: 0.97,
      classification: 'Force-deficit',
      gap: { orientation: 'force', magnitudePct: 18 },
      deltas: { f0Pct: -18, v0Pct: 5 },
      trainingRecommendations: [
        'Prioritize heavy strength work (squat, deadlift variations) to raise F0',
        'Reduce volume of high-velocity sprint work until F0 deficit closes',
      ],
      notes: 'Follow-up retest in 6 weeks.',
    },
    activeGoals: [
      {
        metricCode: 'FLY10_TIME',
        metricLabel: '10-yd Fly Time',
        goalType: 'minimize',
        baselineValue: 1.15,
        currentValue: 1.08,
        targetValue: 1.02,
        targetDate: '2026-08-01',
        units: 's',
        notes: null,
      },
    ],
    recentWellness: [
      {
        date: '2026-04-12',
        submittedAt: '2026-04-12T07:30:00Z',
        responses: { sleep: 7, soreness: 3, mood: 4, readiness: 8 },
      },
    ],
    notes: {
      medicalNotes: 'Mild left hamstring strain Jan 2026, cleared.',
      coachNotes: 'Strong work ethic. Needs stronger posterior chain.',
    },
    metricGlossary: {
      FLY10_TIME: {
        label: '10-yd Fly Time',
        units: 's',
        explanation: 'Measures top-end speed with a flying start.',
      },
      VERTICAL_JUMP: {
        label: 'Vertical Jump',
        units: 'in',
        explanation: 'Measures lower-body explosive power.',
      },
    },
    warnings: [],
    ...overrides,
  };
}

function emptyData(): AthleteExportData {
  return {
    generatedAt: new Date('2026-04-19T12:00:00Z'),
    athlete: {
      id: 'athlete-2',
      fullName: 'Alex Rivera',
      age: null,
      gender: null,
      graduationYear: null,
      heightIn: null,
      weightLb: null,
      sports: [],
      positions: [],
      teams: [],
    },
    organization: null,
    currentSnapshot: [],
    measurementHistory: {},
    sprintFv: null,
    activeGoals: [],
    recentWellness: [],
    notes: { medicalNotes: null, coachNotes: null },
    metricGlossary: {},
    warnings: [],
  };
}

describe('renderMarkdown', () => {
  it('renders an H1 with the athlete name', () => {
    const md = renderMarkdown(sampleData());
    expect(md).toMatch(/^# Athlete Performance Export — Jane Doe/m);
  });

  it('includes every required H2 section, in order', () => {
    const md = renderMarkdown(sampleData());
    const sections = [
      '## Athlete Profile',
      '## Current Performance Snapshot',
      '## 12-Month Measurement History',
      '## Sprint Force-Velocity Profile',
      '## Active Goals',
      '## Recent Wellness',
      '## Medical & Coach Notes',
      '## Metric Glossary',
    ];
    let lastIdx = -1;
    for (const s of sections) {
      const idx = md.indexOf(s);
      expect(idx, `section "${s}" missing`).toBeGreaterThan(-1);
      expect(idx, `section "${s}" out of order`).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it('labels units on every numeric value in the Current Performance Snapshot table', () => {
    const md = renderMarkdown(sampleData());
    const start = md.indexOf('## Current Performance Snapshot');
    const end = md.indexOf('## 12-Month Measurement History');
    const section = md.slice(start, end);
    expect(section).toContain('| 1.08 | s |');
    expect(section).toContain('| 24.5 | in |');
  });

  it('surfaces F-V classification as a bold callout line, not inside a table', () => {
    const md = renderMarkdown(sampleData());
    expect(md).toMatch(/\*\*Classification:\*\* Force-deficit/);
    const fvStart = md.indexOf('## Sprint Force-Velocity Profile');
    const fvEnd = md.indexOf('## Active Goals');
    const fvSection = md.slice(fvStart, fvEnd);
    expect(fvSection).not.toMatch(/\|.*Classification.*\|/);
  });

  it('renders training recommendations as a bulleted list, not a table cell', () => {
    const md = renderMarkdown(sampleData());
    expect(md).toMatch(/- Prioritize heavy strength work/);
    expect(md).toMatch(/- Reduce volume of high-velocity sprint work/);
  });

  it('formats F-V gap/deltas as key=value pairs, not raw JSON', () => {
    const md = renderMarkdown(sampleData());
    const fvStart = md.indexOf('## Sprint Force-Velocity Profile');
    const fvEnd = md.indexOf('## Active Goals');
    const fvSection = md.slice(fvStart, fvEnd);
    // Must NOT contain raw JSON object braces — those are a sign of
    // JSON.stringify(obj) leaking through into Markdown.
    expect(fvSection).not.toMatch(/\{"orientation"/);
    expect(fvSection).not.toMatch(/\{"f0Pct"/);
    // Must contain readable key=value form.
    expect(fvSection).toMatch(/orientation=force/);
    expect(fvSection).toMatch(/magnitudePct=18/);
    expect(fvSection).toMatch(/f0Pct=-18/);
    expect(fvSection).toMatch(/v0Pct=5/);
  });

  it('ends with the prompt-starter callout', () => {
    const md = renderMarkdown(sampleData());
    expect(md).toMatch(/\*\*Prompt suggestion:\*\*/);
    expect(md.trimEnd()).toMatch(/week-by-week table with sets, reps, and intent for each session\.$/);
  });

  it('emits "_No data yet._" placeholders when sections are empty (stable structure)', () => {
    const md = renderMarkdown(emptyData());
    // Every section heading still present
    expect(md).toContain('## Current Performance Snapshot');
    expect(md).toContain('## Sprint Force-Velocity Profile');
    expect(md).toContain('## Active Goals');
    expect(md).toContain('## Recent Wellness');
    expect(md).toContain('## Medical & Coach Notes');
    // Empty sections use the italic placeholder
    const placeholderCount = (md.match(/_No data yet\._/g) || []).length;
    expect(placeholderCount).toBeGreaterThanOrEqual(5);
  });

  it('escapes pipe characters in the athlete name to avoid breaking tables', () => {
    const data = sampleData({
      athlete: { ...sampleData().athlete, fullName: 'A|B Smith' },
    });
    const md = renderMarkdown(data);
    expect(md).toContain('A\\|B Smith');
  });

  it('uses ASCII characters only in tables (no emoji / decorative unicode)', () => {
    const md = renderMarkdown(sampleData());
    // Allow em-dash and smart quotes in prose; disallow emoji range
    expect(md).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  it('includes the metric glossary for every metric seen in snapshot or history', () => {
    const md = renderMarkdown(sampleData());
    const glossaryStart = md.indexOf('## Metric Glossary');
    const glossary = md.slice(glossaryStart);
    expect(glossary).toContain('FLY10_TIME');
    expect(glossary).toContain('VERTICAL_JUMP');
  });

  it('appends a warnings footer when warnings are present', () => {
    const md = renderMarkdown(sampleData({ warnings: ['Sprint F-V query failed'] }));
    expect(md).toMatch(/\*\*Warnings:\*\*/);
    expect(md).toContain('Sprint F-V query failed');
  });

  it('omits the warnings footer when warnings are empty', () => {
    const md = renderMarkdown(sampleData());
    expect(md).not.toMatch(/\*\*Warnings:\*\*/);
  });
});

describe('renderJson', () => {
  it('matches the expected shape', () => {
    const json = renderJson(sampleData());
    expect(json).toMatchObject({
      generatedAt: expect.any(String),
      athlete: expect.objectContaining({
        id: 'athlete-1',
        fullName: 'Jane Doe',
      }),
      sprintFv: expect.objectContaining({ classification: 'Force-deficit' }),
      activeGoals: expect.arrayContaining([
        expect.objectContaining({ metricCode: 'FLY10_TIME' }),
      ]),
      metricGlossary: expect.objectContaining({
        FLY10_TIME: expect.objectContaining({ label: '10-yd Fly Time' }),
      }),
    });
  });

  it('serializes generatedAt as an ISO string', () => {
    const json = renderJson(sampleData());
    expect(() => new Date(json.generatedAt).toISOString()).not.toThrow();
    expect(json.generatedAt).toBe('2026-04-19T12:00:00.000Z');
  });

  it('passes sprintFv.analysisJson-derived fields through without mutation', () => {
    const data = sampleData();
    const json = renderJson(data);
    expect(json.sprintFv?.classification).toBe(data.sprintFv!.classification);
    expect(json.sprintFv?.gap).toEqual(data.sprintFv!.gap);
    expect(json.sprintFv?.deltas).toEqual(data.sprintFv!.deltas);
    expect(json.sprintFv?.trainingRecommendations).toEqual(
      data.sprintFv!.trainingRecommendations,
    );
  });

  it('returns sprintFv as null when the athlete has no profile', () => {
    const json = renderJson(emptyData());
    expect(json.sprintFv).toBeNull();
  });
});

describe('filenameFor', () => {
  it('uses the athlete slug and export date', () => {
    const fn = filenameFor('Jane Doe', 'markdown', new Date('2026-04-19T00:00:00Z'));
    expect(fn).toBe('jane-doe-2026-04-19.md');
  });

  it('strips diacritics', () => {
    const fn = filenameFor('José Núñez', 'markdown', new Date('2026-04-19T00:00:00Z'));
    expect(fn).toBe('jose-nunez-2026-04-19.md');
  });

  it('collapses whitespace and lowercases', () => {
    const fn = filenameFor('  Multi   Word   Name  ', 'markdown', new Date('2026-04-19T00:00:00Z'));
    expect(fn).toBe('multi-word-name-2026-04-19.md');
  });

  it('uses .json extension for json format', () => {
    const fn = filenameFor('Jane Doe', 'json', new Date('2026-04-19T00:00:00Z'));
    expect(fn).toBe('jane-doe-2026-04-19.json');
  });

  it('strips non-alphanumeric characters (pipes, slashes)', () => {
    const fn = filenameFor('A|B/Name', 'markdown', new Date('2026-04-19T00:00:00Z'));
    expect(fn).toBe('ab-name-2026-04-19.md');
  });

  it("falls back to 'athlete' when the slug would be empty", () => {
    // All-symbol/whitespace names would otherwise produce "-2026-04-19.md"
    // which is a malformed filename leading with a dash.
    const fn = filenameFor('!!!', 'markdown', new Date('2026-04-19T00:00:00Z'));
    expect(fn).toBe('athlete-2026-04-19.md');
  });
});
