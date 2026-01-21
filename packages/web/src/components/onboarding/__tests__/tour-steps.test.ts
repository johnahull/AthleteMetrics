/**
 * Tests for tour step definitions
 *
 * Validates that each role has the correct number of steps and required properties.
 */

import { describe, it, expect } from 'vitest';
import { athleteSteps } from '../tour-steps/athlete-steps';
import { coachSteps } from '../tour-steps/coach-steps';
import { orgAdminSteps } from '../tour-steps/org-admin-steps';
import type { Step } from 'react-joyride';

describe('Tour Steps Definitions', () => {
  describe('Athlete Steps', () => {
    it('has exactly 7 steps', () => {
      expect(athleteSteps).toHaveLength(7);
    });

    it('all steps have required target property', () => {
      athleteSteps.forEach((step, index) => {
        expect(step.target, `Step ${index + 1} missing target`).toBeDefined();
        expect(typeof step.target).toBe('string');
      });
    });

    it('all steps have required content property', () => {
      athleteSteps.forEach((step, index) => {
        expect(step.content, `Step ${index + 1} missing content`).toBeDefined();
      });
    });

    it('first step has disableBeacon: true', () => {
      expect(athleteSteps[0].disableBeacon).toBe(true);
    });

    it('last step targets body (center modal)', () => {
      const lastStep = athleteSteps[athleteSteps.length - 1];
      expect(lastStep.target).toBe('body');
      expect(lastStep.placement).toBe('center');
    });

    it('contains expected navigation targets', () => {
      const targets = athleteSteps.map(s => s.target);
      expect(targets).toContain('[data-tour="my-dashboard"]');
      expect(targets).toContain('[data-tour="my-measurements"]');
      expect(targets).toContain('[data-tour="my-goals"]');
    });
  });

  describe('Coach Steps', () => {
    it('has exactly 9 steps', () => {
      expect(coachSteps).toHaveLength(9);
    });

    it('all steps have required target property', () => {
      coachSteps.forEach((step, index) => {
        expect(step.target, `Step ${index + 1} missing target`).toBeDefined();
        expect(typeof step.target).toBe('string');
      });
    });

    it('all steps have required content property', () => {
      coachSteps.forEach((step, index) => {
        expect(step.content, `Step ${index + 1} missing content`).toBeDefined();
      });
    });

    it('first step has disableBeacon: true', () => {
      expect(coachSteps[0].disableBeacon).toBe(true);
    });

    it('last step targets body (center modal)', () => {
      const lastStep = coachSteps[coachSteps.length - 1];
      expect(lastStep.target).toBe('body');
      expect(lastStep.placement).toBe('center');
    });

    it('contains expected navigation targets', () => {
      const targets = coachSteps.map(s => s.target);
      expect(targets).toContain('[data-tour="dashboard"]');
      expect(targets).toContain('[data-tour="teams"]');
      expect(targets).toContain('[data-tour="athletes"]');
      expect(targets).toContain('[data-tour="data-entry"]');
    });
  });

  describe('Org Admin Steps', () => {
    it('has exactly 9 steps', () => {
      expect(orgAdminSteps).toHaveLength(9);
    });

    it('all steps have required target property', () => {
      orgAdminSteps.forEach((step, index) => {
        expect(step.target, `Step ${index + 1} missing target`).toBeDefined();
        expect(typeof step.target).toBe('string');
      });
    });

    it('all steps have required content property', () => {
      orgAdminSteps.forEach((step, index) => {
        expect(step.content, `Step ${index + 1} missing content`).toBeDefined();
      });
    });

    it('first step has disableBeacon: true', () => {
      expect(orgAdminSteps[0].disableBeacon).toBe(true);
    });

    it('last step targets body (center modal)', () => {
      const lastStep = orgAdminSteps[orgAdminSteps.length - 1];
      expect(lastStep.target).toBe('body');
      expect(lastStep.placement).toBe('center');
    });

    it('contains expected navigation targets including admin features', () => {
      const targets = orgAdminSteps.map(s => s.target);
      expect(targets).toContain('[data-tour="dashboard"]');
      expect(targets).toContain('[data-tour="teams"]');
      expect(targets).toContain('[data-tour="athletes"]');
    });
  });

  describe('Step Structure Validation', () => {
    const allSteps: { name: string; steps: Step[] }[] = [
      { name: 'athlete', steps: athleteSteps },
      { name: 'coach', steps: coachSteps },
      { name: 'orgAdmin', steps: orgAdminSteps },
    ];

    allSteps.forEach(({ name, steps }) => {
      describe(`${name} steps`, () => {
        it('has valid placement values', () => {
          const validPlacements = ['top', 'top-start', 'top-end', 'bottom', 'bottom-start', 'bottom-end', 'left', 'left-start', 'left-end', 'right', 'right-start', 'right-end', 'center', 'auto'];
          steps.forEach((step, index) => {
            if (step.placement) {
              expect(
                validPlacements.includes(step.placement as string),
                `Step ${index + 1} has invalid placement: ${step.placement}`
              ).toBe(true);
            }
          });
        });

        it('has no empty content', () => {
          steps.forEach((step, index) => {
            const content = typeof step.content === 'string' ? step.content : '';
            expect(content.length, `Step ${index + 1} has empty content`).toBeGreaterThan(0);
          });
        });

        it('has no empty targets', () => {
          steps.forEach((step, index) => {
            expect(
              (step.target as string).length,
              `Step ${index + 1} has empty target`
            ).toBeGreaterThan(0);
          });
        });
      });
    });
  });

  describe('Cross-role Consistency', () => {
    it('all roles have a welcome step as first step', () => {
      // First step should target body or have center placement (welcome modal)
      [athleteSteps, coachSteps, orgAdminSteps].forEach((steps) => {
        const firstStep = steps[0];
        expect(firstStep.disableBeacon).toBe(true);
      });
    });

    it('all roles have a completion step as last step', () => {
      [athleteSteps, coachSteps, orgAdminSteps].forEach((steps) => {
        const lastStep = steps[steps.length - 1];
        expect(lastStep.target).toBe('body');
        expect(lastStep.placement).toBe('center');
      });
    });

    it('coach and org admin have more steps than athlete', () => {
      expect(coachSteps.length).toBeGreaterThan(athleteSteps.length);
      expect(orgAdminSteps.length).toBeGreaterThanOrEqual(coachSteps.length);
    });
  });
});
