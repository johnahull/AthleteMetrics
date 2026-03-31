import { describe, it, expect } from 'vitest';
import { buildPrompt, ReportData } from '../ai-insights-service';

/**
 * Unit tests for the audience-specific prompt branches in buildPrompt().
 *
 * buildPrompt() tailors the Instructions section based on reportData.audience:
 *   - 'coach'   (default) — language for sports coaches
 *   - 'athlete' — second-person "you" language directed at the athlete
 *   - 'parent'  — plain-language for parents of youth athletes
 */

function makeBaseReportData(overrides: Partial<ReportData> = {}): ReportData {
  return {
    reportType: 'individual',
    reportName: 'Sprint Performance Report',
    organizationName: 'Test Org',
    timeframe: '2025-01-01 to 2025-03-31',
    metrics: [
      {
        code: 'FLY10_TIME',
        label: '10-Yard Fly Time',
        values: [1.45, 1.42],
        unit: 's',
        lowerIsBetter: true,
      },
    ],
    athleteName: 'Jordan Smith',
    athleteAge: 15,
    athleteGender: 'Male',
    athleteSport: 'Soccer',
    ...overrides,
  };
}

describe('buildPrompt audience branches', () => {
  describe('coach audience (default)', () => {
    it('should contain coach-specific language when audience is "coach"', () => {
      const data = makeBaseReportData({ audience: 'coach' });
      const prompt = buildPrompt(data);

      expect(prompt).toContain('sports coaches and athletes');
      expect(prompt).toContain('coaching insights in markdown format');
    });

    it('should fall back to coach language when audience is not set', () => {
      const data = makeBaseReportData();
      // audience is undefined — should default to 'coach'
      expect(data.audience).toBeUndefined();

      const prompt = buildPrompt(data);

      expect(prompt).toContain('sports coaches and athletes');
      expect(prompt).toContain('coaching insights in markdown format');
    });

    it('should include the standard four sections for coach audience', () => {
      const data = makeBaseReportData({ audience: 'coach' });
      const prompt = buildPrompt(data);

      expect(prompt).toContain('**Summary**');
      expect(prompt).toContain("**What's Going Well**");
      expect(prompt).toContain('**What to Work On**');
      expect(prompt).toContain('**Next Steps**');
    });

    it('should request 150-250 words for coach audience', () => {
      const data = makeBaseReportData({ audience: 'coach' });
      const prompt = buildPrompt(data);

      expect(prompt).toContain('150-250 words');
    });
  });

  describe('athlete audience', () => {
    it('should contain athlete-specific "you" language', () => {
      const data = makeBaseReportData({ audience: 'athlete' });
      const prompt = buildPrompt(data);

      expect(prompt).toContain('You are writing directly TO the athlete');
      expect(prompt).toContain('"you" language');
    });

    it('should have energizing tone and avoid clinical language', () => {
      const data = makeBaseReportData({ audience: 'athlete' });
      const prompt = buildPrompt(data);

      expect(prompt).toContain('Direct, confident, and energizing');
      expect(prompt).toContain('AVOID');
      expect(prompt).toContain('Clinical or passive language');
    });

    it('should include the four athlete-oriented sections', () => {
      const data = makeBaseReportData({ audience: 'athlete' });
      const prompt = buildPrompt(data);

      expect(prompt).toContain('**Summary**');
      expect(prompt).toContain("**What's Going Well**");
      expect(prompt).toContain('**What to Work On**');
      expect(prompt).toContain('**Next Steps**');
    });

    it('should request 150-200 words for athlete audience', () => {
      const data = makeBaseReportData({ audience: 'athlete' });
      const prompt = buildPrompt(data);

      expect(prompt).toContain('150-200 words');
    });

    it('should use the athlete first name when available', () => {
      const data = makeBaseReportData({ audience: 'athlete', athleteName: 'Jordan Smith' });
      const prompt = buildPrompt(data);

      expect(prompt).toContain("athlete's first name (Jordan)");
    });

    it('should skip first-name instruction when athleteName is missing', () => {
      const data = makeBaseReportData({ audience: 'athlete', athleteName: undefined });
      const prompt = buildPrompt(data);

      expect(prompt).not.toContain("athlete's first name");
    });

    it('should not contain parent-specific or coach-specific language', () => {
      const data = makeBaseReportData({ audience: 'athlete' });
      const prompt = buildPrompt(data);

      expect(prompt).not.toContain('PARENTS of youth athletes');
      expect(prompt).not.toContain('sports coaches and athletes, NOT strength');
    });
  });

  describe('parent audience', () => {
    it('should contain parent-specific language', () => {
      const data = makeBaseReportData({ audience: 'parent' });
      const prompt = buildPrompt(data);

      expect(prompt).toContain('PARENTS of youth athletes');
      expect(prompt).toContain('non-technical language');
    });

    it('should include parent-specific sections', () => {
      const data = makeBaseReportData({ audience: 'parent' });
      const prompt = buildPrompt(data);

      expect(prompt).toContain("**What the numbers mean**");
      expect(prompt).toContain("**What's Going Well**");
      expect(prompt).toContain('**What to Work On**');
      expect(prompt).toContain('**Why Continued Training Matters**');
    });

    it('should use the athlete first name throughout', () => {
      const data = makeBaseReportData({
        audience: 'parent',
        athleteName: 'Jordan Smith',
      });
      const prompt = buildPrompt(data);

      expect(prompt).toContain('Jordan');
      expect(prompt).toContain("athlete's first name (Jordan)");
    });

    it('should handle athlete with single-word name', () => {
      const data = makeBaseReportData({
        audience: 'parent',
        athleteName: 'Zendaya',
      });
      const prompt = buildPrompt(data);

      expect(prompt).toContain("athlete's first name (Zendaya)");
    });

    it('should request 200-300 words for parent audience', () => {
      const data = makeBaseReportData({ audience: 'parent' });
      const prompt = buildPrompt(data);

      expect(prompt).toContain('200-300 words');
    });

    it('should set encouraging and professional tone', () => {
      const data = makeBaseReportData({ audience: 'parent' });
      const prompt = buildPrompt(data);

      expect(prompt).toContain('Encouraging, professional, data-backed');
    });

    it('should instruct to avoid jargon and negative framing', () => {
      const data = makeBaseReportData({ audience: 'parent' });
      const prompt = buildPrompt(data);

      expect(prompt).toContain('AVOID');
      expect(prompt).toContain('negative framing');
    });

    it('should frame areas to work on as growth opportunities', () => {
      const data = makeBaseReportData({ audience: 'parent' });
      const prompt = buildPrompt(data);

      expect(prompt).toContain('growth opportunities, not deficiencies');
    });

    it('should not contain coach-specific or athlete-specific language', () => {
      const data = makeBaseReportData({ audience: 'parent' });
      const prompt = buildPrompt(data);

      expect(prompt).not.toContain('sports coaches and athletes, NOT strength');
      expect(prompt).not.toContain('You are writing directly TO the athlete');
    });

    it('should skip first-name instruction when athleteName is missing', () => {
      const data = makeBaseReportData({
        audience: 'parent',
        athleteName: undefined,
      });
      const prompt = buildPrompt(data);

      expect(prompt).toContain('PARENTS of youth athletes');
      expect(prompt).not.toContain("athlete's first name");
    });

    it('should skip first-name instruction when sanitized name is empty', () => {
      // A name composed entirely of markdown special chars sanitizes to ''
      const data = makeBaseReportData({
        audience: 'parent',
        athleteName: '***',
      });
      const prompt = buildPrompt(data);

      expect(prompt).not.toContain("athlete's first name ()");
      expect(prompt).not.toContain("athlete's first name");
    });
  });

  describe('all audiences share common constraints', () => {
    const audiences: Array<ReportData['audience']> = ['coach', 'athlete', 'parent'];

    audiences.forEach((audience) => {
      it(`should include IMPORTANT CONSTRAINTS for "${audience}" audience`, () => {
        const data = makeBaseReportData({ audience });
        const prompt = buildPrompt(data);

        expect(prompt).toContain('IMPORTANT CONSTRAINTS');
        expect(prompt).toContain('Base ALL observations strictly on the provided metrics');
        expect(prompt).toContain('Do NOT comment on effort, attitude, coachability');
      });
    });

    it('should include IMPORTANT CONSTRAINTS for undefined audience (default)', () => {
      const data = makeBaseReportData();
      const prompt = buildPrompt(data);

      expect(prompt).toContain('IMPORTANT CONSTRAINTS');
    });
  });
});
