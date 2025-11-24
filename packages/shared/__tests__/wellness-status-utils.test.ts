/**
 * Wellness Status Utilities Tests
 *
 * Tests for status calculation logic including scale orientation support
 */

import { describe, it, expect } from 'vitest';
import {
  calculateAthleteStatus,
  getCommonInjuries,
  calculateTrend,
  getDefaultStatusConfig,
} from '../wellness-status-utils';
import type { WellnessResponse, WellnessTemplate } from '../wellness-types';

describe('calculateAthleteStatus', () => {
  describe('higher_is_better orientation', () => {
    const template: WellnessTemplate = {
      id: 'template-1',
      organizationId: 'org-1',
      name: 'Test Template',
      isDefault: true,
      isActive: true,
      config: {
        questions: [
          { id: 'q_1', type: 'scale', label: 'Overall Wellness', scaleMin: 1, scaleMax: 5, required: true },
        ],
        statusConfig: {
          scaleOrientation: 'higher_is_better',
          redThreshold: 2,
          yellowThreshold: 4,
          injuryQuestionIds: [],
          injuryOverride: false,
        },
      },
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return red status when score <= redThreshold', () => {
      const response: WellnessResponse = {
        id: 'response-1',
        requestId: null,
        organizationId: 'org-1',
        templateId: 'template-1',
        userId: 'user-1',
        userFullName: 'John Doe',
        teamId: 'team-1',
        teamNameSnapshot: 'Team A',
        submittedAt: new Date(),
        date: '2025-01-15',
        responses: {
          'q_1': { value: 2, label: 'Overall Wellness' },
        },
        accessMethod: null,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
      };

      const result = calculateAthleteStatus(response, template);
      expect(result.status).toBe('red');
      expect(result.score).toBe(2);
    });

    it('should return yellow status when redThreshold < score <= yellowThreshold', () => {
      const response: WellnessResponse = {
        id: 'response-1',
        requestId: null,
        organizationId: 'org-1',
        templateId: 'template-1',
        userId: 'user-1',
        userFullName: 'John Doe',
        teamId: 'team-1',
        teamNameSnapshot: 'Team A',
        submittedAt: new Date(),
        date: '2025-01-15',
        responses: {
          'q_1': { value: 3, label: 'Overall Wellness' },
        },
        accessMethod: null,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
      };

      const result = calculateAthleteStatus(response, template);
      expect(result.status).toBe('yellow');
      expect(result.score).toBe(3);
    });

    it('should return green status when score > yellowThreshold', () => {
      const response: WellnessResponse = {
        id: 'response-1',
        requestId: null,
        organizationId: 'org-1',
        templateId: 'template-1',
        userId: 'user-1',
        userFullName: 'John Doe',
        teamId: 'team-1',
        teamNameSnapshot: 'Team A',
        submittedAt: new Date(),
        date: '2025-01-15',
        responses: {
          'q_1': { value: 5, label: 'Overall Wellness' },
        },
        accessMethod: null,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
      };

      const result = calculateAthleteStatus(response, template);
      expect(result.status).toBe('green');
      expect(result.score).toBe(5);
    });
  });

  describe('lower_is_better orientation', () => {
    const template: WellnessTemplate = {
      id: 'template-1',
      organizationId: 'org-1',
      name: 'Pain Template',
      isDefault: true,
      isActive: true,
      config: {
        questions: [
          { id: 'q_1', type: 'scale', label: 'Pain Level', scaleMin: 1, scaleMax: 5, required: true },
        ],
        statusConfig: {
          scaleOrientation: 'lower_is_better',
          redThreshold: 4,
          yellowThreshold: 3,
          injuryQuestionIds: [],
          injuryOverride: false,
        },
      },
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return red status when score >= redThreshold', () => {
      const response: WellnessResponse = {
        id: 'response-1',
        requestId: null,
        organizationId: 'org-1',
        templateId: 'template-1',
        userId: 'user-1',
        userFullName: 'John Doe',
        teamId: 'team-1',
        teamNameSnapshot: 'Team A',
        submittedAt: new Date(),
        date: '2025-01-15',
        responses: {
          'q_1': { value: 5, label: 'Pain Level' },
        },
        accessMethod: null,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
      };

      const result = calculateAthleteStatus(response, template);
      expect(result.status).toBe('red');
      expect(result.score).toBe(5);
    });

    it('should return yellow status when yellowThreshold <= score < redThreshold', () => {
      const response: WellnessResponse = {
        id: 'response-1',
        requestId: null,
        organizationId: 'org-1',
        templateId: 'template-1',
        userId: 'user-1',
        userFullName: 'John Doe',
        teamId: 'team-1',
        teamNameSnapshot: 'Team A',
        submittedAt: new Date(),
        date: '2025-01-15',
        responses: {
          'q_1': { value: 3, label: 'Pain Level' },
        },
        accessMethod: null,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
      };

      const result = calculateAthleteStatus(response, template);
      expect(result.status).toBe('yellow');
      expect(result.score).toBe(3);
    });

    it('should return green status when score < yellowThreshold', () => {
      const response: WellnessResponse = {
        id: 'response-1',
        requestId: null,
        organizationId: 'org-1',
        templateId: 'template-1',
        userId: 'user-1',
        userFullName: 'John Doe',
        teamId: 'team-1',
        teamNameSnapshot: 'Team A',
        submittedAt: new Date(),
        date: '2025-01-15',
        responses: {
          'q_1': { value: 1, label: 'Pain Level' },
        },
        accessMethod: null,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
      };

      const result = calculateAthleteStatus(response, template);
      expect(result.status).toBe('green');
      expect(result.score).toBe(1);
    });
  });

  describe('injury override', () => {
    it('should return red when injuryOverride=true and injuries present', () => {
      const template: WellnessTemplate = {
        id: 'template-1',
        organizationId: 'org-1',
        name: 'Test Template',
        isDefault: true,
        isActive: true,
        config: {
          questions: [
            { id: 'q_1', type: 'scale', label: 'Overall Wellness', scaleMin: 1, scaleMax: 5, required: true },
            { id: 'q_2', type: 'body_map', label: 'Injuries', allowMultiple: true, required: false },
          ],
          statusConfig: {
            scaleOrientation: 'higher_is_better',
            redThreshold: 2,
            yellowThreshold: 4,
            injuryQuestionIds: ['q_2'],
            injuryOverride: true,
          },
        },
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const response: WellnessResponse = {
        id: 'response-1',
        requestId: null,
        organizationId: 'org-1',
        templateId: 'template-1',
        userId: 'user-1',
        userFullName: 'John Doe',
        teamId: 'team-1',
        teamNameSnapshot: 'Team A',
        submittedAt: new Date(),
        date: '2025-01-15',
        responses: {
          'q_1': { value: 5, label: 'Overall Wellness' },
          'q_2': { value: [{ x: 0.4, y: 0.7, label: 'Left Knee' }], label: 'Injuries' },
        },
        accessMethod: null,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
      };

      const result = calculateAthleteStatus(response, template);
      expect(result.status).toBe('red');
      expect(result.injuries).toHaveLength(1);
      expect(result.injuries[0].label).toBe('Left Knee');
    });
  });

  describe('fallback defaults', () => {
    it('should use default statusConfig when template has none', () => {
      const template: WellnessTemplate = {
        id: 'template-1',
        organizationId: 'org-1',
        name: 'Test Template',
        isDefault: true,
        isActive: true,
        config: {
          questions: [
            { id: 'q_1', type: 'scale', label: 'Overall Wellness', scaleMin: 1, scaleMax: 10, required: true },
          ],
        },
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const response: WellnessResponse = {
        id: 'response-1',
        requestId: null,
        organizationId: 'org-1',
        templateId: 'template-1',
        userId: 'user-1',
        userFullName: 'John Doe',
        teamId: 'team-1',
        teamNameSnapshot: 'Team A',
        submittedAt: new Date(),
        date: '2025-01-15',
        responses: {
          'q_1': { value: 2, label: 'Overall Wellness' },
        },
        accessMethod: null,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
      };

      const result = calculateAthleteStatus(response, template);
      expect(result.status).toBe('red'); // Uses default red <= 3
    });

    it('should return null score when no scale questions', () => {
      const template: WellnessTemplate = {
        id: 'template-1',
        organizationId: 'org-1',
        name: 'Test Template',
        isDefault: true,
        isActive: true,
        config: {
          questions: [
            { id: 'q_1', type: 'text', label: 'Notes', required: false },
          ],
        },
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const response: WellnessResponse = {
        id: 'response-1',
        requestId: null,
        organizationId: 'org-1',
        templateId: 'template-1',
        userId: 'user-1',
        userFullName: 'John Doe',
        teamId: 'team-1',
        teamNameSnapshot: 'Team A',
        submittedAt: new Date(),
        date: '2025-01-15',
        responses: {
          'q_1': { value: 'Feeling good', label: 'Notes' },
        },
        accessMethod: null,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
      };

      const result = calculateAthleteStatus(response, template);
      expect(result.score).toBeNull();
    });
  });
});

describe('getCommonInjuries', () => {
  it('should aggregate injuries across athletes', () => {
    const athleteStatuses = [
      { status: 'red' as const, score: 2, injuries: [{ x: 0.4, y: 0.7, label: 'Left Knee' }, { x: 0.6, y: 0.7, label: 'Right Knee' }] },
      { status: 'red' as const, score: 3, injuries: [{ x: 0.4, y: 0.7, label: 'Left Knee' }] },
      { status: 'yellow' as const, score: 4, injuries: [{ x: 0.3, y: 0.2, label: 'Left Shoulder' }] },
    ];

    const result = getCommonInjuries(athleteStatuses);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ label: 'Left Knee', count: 2 });
    expect(result[1]).toEqual({ label: 'Right Knee', count: 1 });
    expect(result[2]).toEqual({ label: 'Left Shoulder', count: 1 });
  });

  it('should return empty array when no injuries', () => {
    const athleteStatuses = [
      { status: 'green' as const, score: 8, injuries: [] },
      { status: 'green' as const, score: 9, injuries: [] },
    ];

    const result = getCommonInjuries(athleteStatuses);
    expect(result).toEqual([]);
  });

  it('should ignore injuries without labels', () => {
    const athleteStatuses = [
      { status: 'red' as const, score: 2, injuries: [{ x: 0.4, y: 0.7 }, { x: 0.6, y: 0.7, label: 'Left Knee' }] },
    ];

    const result = getCommonInjuries(athleteStatuses);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ label: 'Left Knee', count: 1 });
  });
});

describe('calculateTrend', () => {
  it('should return "up" when current average > previous average by >5%', () => {
    const current = [8, 9, 10]; // avg = 9
    const previous = [5, 6, 7]; // avg = 6
    const result = calculateTrend(current, previous);
    expect(result).toBe('up');
  });

  it('should return "down" when current average < previous average by >5%', () => {
    const current = [5, 6, 7]; // avg = 6
    const previous = [8, 9, 10]; // avg = 9
    const result = calculateTrend(current, previous);
    expect(result).toBe('down');
  });

  it('should return "stable" when within 5% threshold', () => {
    const current = [7, 7, 8]; // avg = 7.33
    const previous = [7, 7, 7]; // avg = 7
    const result = calculateTrend(current, previous);
    expect(result).toBe('stable');
  });

  it('should return "stable" when no previous data', () => {
    const current = [7, 8, 9];
    const previous: number[] = [];
    const result = calculateTrend(current, previous);
    expect(result).toBe('stable');
  });

  it('should return "stable" when no current data', () => {
    const current: number[] = [];
    const previous = [7, 8, 9];
    const result = calculateTrend(current, previous);
    expect(result).toBe('stable');
  });
});

describe('getDefaultStatusConfig', () => {
  it('should return default configuration', () => {
    const config = getDefaultStatusConfig();
    expect(config).toHaveProperty('scaleOrientation');
    expect(config).toHaveProperty('redThreshold');
    expect(config).toHaveProperty('yellowThreshold');
    expect(config).toHaveProperty('injuryQuestionIds');
    expect(config).toHaveProperty('injuryOverride');
  });

  it('should use higher_is_better as default orientation', () => {
    const config = getDefaultStatusConfig();
    expect(config.scaleOrientation).toBe('higher_is_better');
  });

  it('should default calculationMethod to average', () => {
    const config = getDefaultStatusConfig();
    expect(config.calculationMethod).toBe('average');
  });

  it('should auto-generate thresholds for sum calculation method', () => {
    const template: WellnessTemplate = {
      id: 'template-1',
      organizationId: 'org-1',
      name: 'Modified Hooper Index',
      isDefault: true,
      isActive: true,
      config: {
        questions: [
          { id: 'q_1', type: 'scale', label: 'Fatigue', scaleMin: 1, scaleMax: 5, required: true },
          { id: 'q_2', type: 'scale', label: 'Stress', scaleMin: 1, scaleMax: 5, required: true },
          { id: 'q_3', type: 'scale', label: 'Muscle Soreness', scaleMin: 1, scaleMax: 5, required: true },
          { id: 'q_4', type: 'scale', label: 'Sleep Quality', scaleMin: 1, scaleMax: 5, required: true },
        ],
        statusConfig: {
          scaleOrientation: 'lower_is_better',
          calculationMethod: 'sum',
          redThreshold: 0,
          yellowThreshold: 0,
          injuryQuestionIds: [],
          injuryOverride: true,
        },
      },
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const config = getDefaultStatusConfig(template);

    // For 4 questions with range 1-5 (sum range: 4-20)
    // For lower_is_better: red >= 16 (top 30%), yellow >= 12 (top 70%)
    expect(config.calculationMethod).toBe('sum');
    expect(config.redThreshold).toBe(16);
    expect(config.yellowThreshold).toBe(12);
  });
});

describe('Modified Hooper Index - Sum Calculation Method', () => {
  describe('individual athlete scoring with sum', () => {
    const template: WellnessTemplate = {
      id: 'template-1',
      organizationId: 'org-1',
      name: 'Modified Hooper Index',
      isDefault: true,
      isActive: true,
      config: {
        questions: [
          { id: 'q_1', type: 'scale', label: 'Fatigue', scaleMin: 1, scaleMax: 5, required: true },
          { id: 'q_2', type: 'scale', label: 'Stress', scaleMin: 1, scaleMax: 5, required: true },
          { id: 'q_3', type: 'scale', label: 'Muscle Soreness', scaleMin: 1, scaleMax: 5, required: true },
          { id: 'q_4', type: 'scale', label: 'Sleep Quality', scaleMin: 1, scaleMax: 5, required: true },
        ],
        statusConfig: {
          scaleOrientation: 'lower_is_better',
          calculationMethod: 'sum',
          redThreshold: 16,
          yellowThreshold: 12,
          injuryQuestionIds: [],
          injuryOverride: true,
        },
      },
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should calculate sum instead of average when calculationMethod is sum', () => {
      const response: WellnessResponse = {
        id: 'response-1',
        requestId: null,
        organizationId: 'org-1',
        templateId: 'template-1',
        userId: 'user-1',
        userFullName: 'John Doe',
        teamId: 'team-1',
        teamNameSnapshot: 'Team A',
        submittedAt: new Date(),
        date: '2025-01-15',
        responses: {
          'q_1': { value: 3, label: 'Fatigue' },
          'q_2': { value: 4, label: 'Stress' },
          'q_3': { value: 2, label: 'Muscle Soreness' },
          'q_4': { value: 5, label: 'Sleep Quality' },
        },
        accessMethod: null,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
      };

      const result = calculateAthleteStatus(response, template);
      // Sum = 3 + 4 + 2 + 5 = 14 (not average 3.5)
      expect(result.score).toBe(14);
    });

    it('should return red when sum >= redThreshold (lower_is_better)', () => {
      const response: WellnessResponse = {
        id: 'response-1',
        requestId: null,
        organizationId: 'org-1',
        templateId: 'template-1',
        userId: 'user-1',
        userFullName: 'John Doe',
        teamId: 'team-1',
        teamNameSnapshot: 'Team A',
        submittedAt: new Date(),
        date: '2025-01-15',
        responses: {
          'q_1': { value: 4, label: 'Fatigue' },
          'q_2': { value: 5, label: 'Stress' },
          'q_3': { value: 4, label: 'Muscle Soreness' },
          'q_4': { value: 3, label: 'Sleep Quality' },
        },
        accessMethod: null,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
      };

      const result = calculateAthleteStatus(response, template);
      expect(result.score).toBe(16); // Sum = 16
      expect(result.status).toBe('red'); // 16 >= 16 (red threshold)
    });

    it('should return yellow when yellowThreshold <= sum < redThreshold', () => {
      const response: WellnessResponse = {
        id: 'response-1',
        requestId: null,
        organizationId: 'org-1',
        templateId: 'template-1',
        userId: 'user-1',
        userFullName: 'John Doe',
        teamId: 'team-1',
        teamNameSnapshot: 'Team A',
        submittedAt: new Date(),
        date: '2025-01-15',
        responses: {
          'q_1': { value: 3, label: 'Fatigue' },
          'q_2': { value: 3, label: 'Stress' },
          'q_3': { value: 4, label: 'Muscle Soreness' },
          'q_4': { value: 4, label: 'Sleep Quality' },
        },
        accessMethod: null,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
      };

      const result = calculateAthleteStatus(response, template);
      expect(result.score).toBe(14); // Sum = 14
      expect(result.status).toBe('yellow'); // 12 <= 14 < 16
    });

    it('should return green when sum < yellowThreshold', () => {
      const response: WellnessResponse = {
        id: 'response-1',
        requestId: null,
        organizationId: 'org-1',
        templateId: 'template-1',
        userId: 'user-1',
        userFullName: 'John Doe',
        teamId: 'team-1',
        teamNameSnapshot: 'Team A',
        submittedAt: new Date(),
        date: '2025-01-15',
        responses: {
          'q_1': { value: 2, label: 'Fatigue' },
          'q_2': { value: 2, label: 'Stress' },
          'q_3': { value: 3, label: 'Muscle Soreness' },
          'q_4': { value: 2, label: 'Sleep Quality' },
        },
        accessMethod: null,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
      };

      const result = calculateAthleteStatus(response, template);
      expect(result.score).toBe(9); // Sum = 9
      expect(result.status).toBe('green'); // 9 < 12
    });
  });

  describe('backward compatibility with average method', () => {
    it('should use average when calculationMethod is not specified', () => {
      const template: WellnessTemplate = {
        id: 'template-1',
        organizationId: 'org-1',
        name: 'Legacy Template',
        isDefault: true,
        isActive: true,
        config: {
          questions: [
            { id: 'q_1', type: 'scale', label: 'Overall Wellness', scaleMin: 1, scaleMax: 5, required: true },
            { id: 'q_2', type: 'scale', label: 'Readiness', scaleMin: 1, scaleMax: 5, required: true },
          ],
          statusConfig: {
            scaleOrientation: 'higher_is_better',
            // calculationMethod not specified - should default to 'average'
            redThreshold: 2,
            yellowThreshold: 4,
            injuryQuestionIds: [],
            injuryOverride: false,
          },
        },
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const response: WellnessResponse = {
        id: 'response-1',
        requestId: null,
        organizationId: 'org-1',
        templateId: 'template-1',
        userId: 'user-1',
        userFullName: 'John Doe',
        teamId: 'team-1',
        teamNameSnapshot: 'Team A',
        submittedAt: new Date(),
        date: '2025-01-15',
        responses: {
          'q_1': { value: 3, label: 'Overall Wellness' },
          'q_2': { value: 5, label: 'Readiness' },
        },
        accessMethod: null,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
      };

      const result = calculateAthleteStatus(response, template);
      // Should use average: (3 + 5) / 2 = 4 (not sum = 8)
      expect(result.score).toBe(4);
      expect(result.status).toBe('yellow'); // 4 <= 4 (yellow threshold)
    });
  });

  describe('team status calculation with sum method', () => {
    const template: WellnessTemplate = {
      id: 'template-1',
      organizationId: 'org-1',
      name: 'Modified Hooper Index',
      isDefault: true,
      isActive: true,
      config: {
        questions: [
          { id: 'q_1', type: 'scale', label: 'Fatigue', scaleMin: 1, scaleMax: 5, required: true },
          { id: 'q_2', type: 'scale', label: 'Stress', scaleMin: 1, scaleMax: 5, required: true },
          { id: 'q_3', type: 'scale', label: 'Muscle Soreness', scaleMin: 1, scaleMax: 5, required: true },
          { id: 'q_4', type: 'scale', label: 'Sleep Quality', scaleMin: 1, scaleMax: 5, required: true },
        ],
        statusConfig: {
          scaleOrientation: 'lower_is_better',
          calculationMethod: 'sum',
          redThreshold: 16,
          yellowThreshold: 12,
          injuryQuestionIds: [],
          injuryOverride: true,
        },
      },
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should calculate team status based on average of athlete sums', () => {
      // Athlete A: [4,5,4,3] = 16 → Red
      const athleteAStatus = calculateAthleteStatus({
        id: 'response-a',
        requestId: null,
        organizationId: 'org-1',
        templateId: 'template-1',
        userId: 'user-a',
        userFullName: 'Athlete A',
        teamId: 'team-1',
        teamNameSnapshot: 'Team A',
        submittedAt: new Date(),
        date: '2025-01-15',
        responses: {
          'q_1': { value: 4, label: 'Fatigue' },
          'q_2': { value: 5, label: 'Stress' },
          'q_3': { value: 4, label: 'Muscle Soreness' },
          'q_4': { value: 3, label: 'Sleep Quality' },
        },
        accessMethod: null,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
      }, template);

      // Athlete B: [3,3,4,4] = 14 → Yellow
      const athleteBStatus = calculateAthleteStatus({
        id: 'response-b',
        requestId: null,
        organizationId: 'org-1',
        templateId: 'template-1',
        userId: 'user-b',
        userFullName: 'Athlete B',
        teamId: 'team-1',
        teamNameSnapshot: 'Team A',
        submittedAt: new Date(),
        date: '2025-01-15',
        responses: {
          'q_1': { value: 3, label: 'Fatigue' },
          'q_2': { value: 3, label: 'Stress' },
          'q_3': { value: 4, label: 'Muscle Soreness' },
          'q_4': { value: 4, label: 'Sleep Quality' },
        },
        accessMethod: null,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
      }, template);

      // Athlete C: [2,2,3,2] = 9 → Green
      const athleteCStatus = calculateAthleteStatus({
        id: 'response-c',
        requestId: null,
        organizationId: 'org-1',
        templateId: 'template-1',
        userId: 'user-c',
        userFullName: 'Athlete C',
        teamId: 'team-1',
        teamNameSnapshot: 'Team A',
        submittedAt: new Date(),
        date: '2025-01-15',
        responses: {
          'q_1': { value: 2, label: 'Fatigue' },
          'q_2': { value: 2, label: 'Stress' },
          'q_3': { value: 3, label: 'Muscle Soreness' },
          'q_4': { value: 2, label: 'Sleep Quality' },
        },
        accessMethod: null,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date(),
      }, template);

      // Verify individual statuses
      expect(athleteAStatus.score).toBe(16);
      expect(athleteAStatus.status).toBe('red');

      expect(athleteBStatus.score).toBe(14);
      expect(athleteBStatus.status).toBe('yellow');

      expect(athleteCStatus.score).toBe(9);
      expect(athleteCStatus.status).toBe('green');

      // Team average: (16 + 14 + 9) / 3 = 13
      // Team status should be yellow (13 >= 12 and 13 < 16)
      const teamAverageScore = (athleteAStatus.score! + athleteBStatus.score! + athleteCStatus.score!) / 3;
      expect(teamAverageScore).toBeCloseTo(13, 0.5);

      // Team status determination (to be implemented in dashboard API)
      // For lower_is_better with sum method:
      // - Red if teamAverage >= 16
      // - Yellow if teamAverage >= 12 and < 16
      // - Green if teamAverage < 12
      let teamStatus: 'red' | 'yellow' | 'green';
      if (teamAverageScore >= template.config.statusConfig!.redThreshold) {
        teamStatus = 'red';
      } else if (teamAverageScore >= template.config.statusConfig!.yellowThreshold) {
        teamStatus = 'yellow';
      } else {
        teamStatus = 'green';
      }

      expect(teamStatus).toBe('yellow');
    });
  });
});
