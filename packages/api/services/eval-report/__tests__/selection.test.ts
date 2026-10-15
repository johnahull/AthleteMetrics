import { describe, it, expect } from 'vitest';
import {
  defaultHeadlineKeys,
  resolvePreset,
  presetDefaults,
  showCollegeGauge,
  groupForKey,
  offeredMetrics,
} from '../selection';

const bestsOf = (...codes: string[]) => new Map(codes.map((c) => [c, 1]));

describe('defaultHeadlineKeys', () => {
  it('is the six headline metrics when all have data', () => {
    const bests = bestsOf('DASH_10YD', 'FLY10_TIME', 'JUMP_CMJ_HOH', 'AGILITY_505_YD', 'AGILITY_505_YD_LSI', 'MQI_TOTAL', 'POWER_EUR');
    expect(defaultHeadlineKeys(bests)).toEqual(['DASH_10', 'FLY_10', 'CMJ_HOH', '505', '505_LSI', 'MQI']);
  });

  it('does not offer metrics with no data', () => {
    expect(defaultHeadlineKeys(bestsOf('DASH_10YD', 'JUMP_CMJ_HOH'))).toEqual(['DASH_10', 'CMJ_HOH']);
  });
});

describe('groupForKey', () => {
  it('groups metrics for the checklist', () => {
    expect(groupForKey('DASH_10')).toBe('speed');
    expect(groupForKey('CMJ_HOH')).toBe('power');
    expect(groupForKey('505')).toBe('change_of_direction');
    expect(groupForKey('MQI')).toBe('movement');
  });
});

describe('resolvePreset', () => {
  const at = (graduationYear: number | null, eventDate: string, birthDate: string | null = null) =>
    resolvePreset({ graduationYear, birthDate, eventDate });

  // School year runs Aug 1 - Jul 31. years = graduationYear - (year the current school year ends).
  it('4+ years to graduation (grade 8 or below) is middle school, 2-3 is high school, 0 is senior', () => {
    expect(at(2031, '2026-10-08')).toBe('middle_school'); // 4 (8th grade)
    expect(at(2030, '2026-10-08')).toBe('high_school'); // 3 (9th grade)
    expect(at(2029, '2026-10-08')).toBe('high_school'); // 2
    expect(at(2028, '2026-10-08')).toBe('high_school'); // 1 (junior, Aug-May)
    expect(at(2027, '2026-10-08')).toBe('senior'); // 0
  });

  it('rolls over on Aug 1 at the event date: rising 9th graders stay middle school until then', () => {
    expect(at(2030, '2026-07-31')).toBe('middle_school'); // rising 9th grader: 4
    expect(at(2030, '2026-08-01')).toBe('high_school'); // now a 9th grader: 3
  });

  it('treats a rising senior as senior from June 1 until the Aug 1 rollover, and as senior after', () => {
    expect(at(2027, '2026-05-31')).toBe('high_school'); // junior
    expect(at(2027, '2026-06-01')).toBe('senior'); // rising senior
    expect(at(2027, '2026-07-31')).toBe('senior');
    expect(at(2027, '2026-08-01')).toBe('senior'); // senior
    expect(at(2028, '2026-08-01')).toBe('high_school'); // rising junior is not a rising senior
    expect(at(2028, '2026-07-31')).toBe('high_school'); // 2 years out in July
  });

  it('keeps graduating and past graduates as senior', () => {
    expect(at(2026, '2026-05-31')).toBe('senior');
    expect(at(2026, '2026-08-01')).toBe('senior');
  });

  it('evaluates at the event date, not today', () => {
    expect(at(2027, '2024-10-01')).toBe('high_school'); // 2 years out
  });

  it('falls back to age at the event date when graduation year is missing', () => {
    expect(at(null, '2026-10-08', '2014-01-01')).toBe('middle_school'); // 12
    expect(at(null, '2026-10-08', '2011-01-01')).toBe('high_school'); // 15
    expect(at(null, '2026-10-08', '2009-01-01')).toBe('senior'); // 17
  });

  it.each(['', '2026', '2026-13-01', '2026-02-30', 'garbage', '2026-10-08T00:00:00.000Z'])(
    'returns the High school default when graduation year is set but event date %j is invalid',
    (badEvent) => {
      expect(at(2027, badEvent)).toBe('high_school'); // would be senior with a valid date
      expect(at(2031, badEvent)).toBe('high_school'); // would be middle school
    },
  );

  it('defaults to high school when neither is known', () => {
    expect(at(null, '2026-10-08')).toBe('high_school');
  });

  it.each(['', '2012', '2012-13-45', 'garbage', '2005-06-15T00:00:00.000Z'])(
    'treats malformed birth date %j as unknown',
    (bad) => {
      expect(at(null, '2026-10-08', bad)).toBe('high_school');
    },
  );
});

describe('presetDefaults', () => {
  it('matches the spec table', () => {
    expect(presetDefaults('middle_school')).toMatchObject({ collegeGauge: false, noteFirst: true, freshAndHealthy: true, retestTrend: true });
    expect(presetDefaults('high_school')).toMatchObject({ collegeGauge: false, noteFirst: false });
    expect(presetDefaults('senior')).toMatchObject({ collegeGauge: true });
  });
});

describe('showCollegeGauge', () => {
  it('hides the college gauge under 14 even when the preset shows it', () => {
    expect(showCollegeGauge({ preset: 'senior', age: 13 })).toBe(false);
  });
  it('shows it under 14 only when the coach turns it on', () => {
    expect(showCollegeGauge({ preset: 'middle_school', age: 12, explicit: true })).toBe(true);
  });
  it('lets the coach turn it off', () => {
    expect(showCollegeGauge({ preset: 'senior', age: 17, explicit: false })).toBe(false);
  });
  it('follows the preset at 14 and over', () => {
    expect(showCollegeGauge({ preset: 'senior', age: 14 })).toBe(true);
    expect(showCollegeGauge({ preset: 'high_school', age: 15 })).toBe(false);
  });
  it('follows the preset when age is unknown', () => {
    expect(showCollegeGauge({ preset: 'senior', age: null })).toBe(true);
  });
});

describe('offeredMetrics', () => {
  const offered = offeredMetrics(
    new Set([
      'DASH_10YD',
      'JUMP_CMJ_HOH',
      'VERTICAL_JUMP',
      'TOP_SPEED',
      'JUMP_BROAD',
      'FLY10_TIME_RI10',
      'HEIGHT',
      'WEIGHT',
      'HEIGHT_IN',
      'WEIGHT_LBS',
      'SPRINT_V0',
      'AGILITY_505_YD_L',
    ]),
  );

  it('puts headline metrics with data first and everything else in the available list', () => {
    expect(offered.headline.map((m) => m.key)).toEqual(['DASH_10', 'CMJ_HOH']);
    expect(offered.headline.every((m) => m.checked)).toBe(true);
    expect(offered.available.every((m) => !m.checked)).toBe(true);
  });

  it('offers a headline metric only when it has its own data', () => {
    expect(offered.headline.map((m) => m.key)).not.toContain('505_LSI');
    expect(offered.available.map((m) => m.code)).toContain('AGILITY_505_YD_L');
  });

  it('never drops a measured metric, including ones outside the key map', () => {
    const codes = offered.available.map((m) => m.code);
    for (const code of ['VERTICAL_JUMP', 'TOP_SPEED', 'JUMP_BROAD', 'FLY10_TIME_RI10', 'HEIGHT', 'WEIGHT', 'HEIGHT_IN', 'WEIGHT_LBS', 'SPRINT_V0']) {
      expect(codes).toContain(code);
    }
  });

  it('uses plain labels, and the code itself for an unknown metric', () => {
    const byCode = Object.fromEntries(offered.available.map((m) => [m.code, m.label]));
    expect(byCode.VERTICAL_JUMP).toBe('Hands-free jump height');
    expect(byCode.JUMP_BROAD).toBe('Broad jump');
    expect(byCode.FLY10_TIME_RI10).toBe('Fly 10 (10-yard run-in)');
    expect(byCode.HEIGHT_IN).toBe('Height');
    expect(byCode.WEIGHT_LBS).toBe('Weight');
    expect(byCode.SPRINT_V0).toBe('SPRINT_V0');
  });

  it('groups for the checklist', () => {
    const groupOf = (code: string) => offered.available.find((m) => m.code === code)?.group;
    expect(groupOf('TOP_SPEED')).toBe('speed');
    expect(groupOf('JUMP_BROAD')).toBe('power');
    expect(groupOf('HEIGHT')).toBe('other');
    expect(groupOf('HEIGHT_IN')).toBe('other');
    expect(groupOf('WEIGHT_LBS')).toBe('other');
  });

  it('offers nothing for metrics without data', () => {
    expect(offeredMetrics(new Set()).headline).toEqual([]);
    expect(offeredMetrics(new Set()).available).toEqual([]);
  });
});
