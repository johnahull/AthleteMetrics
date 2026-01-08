/**
 * Onboarding tour steps for Athletes
 *
 * 7 steps covering the athlete's self-view experience
 */

import type { Step } from 'react-joyride';

export const athleteSteps: Step[] = [
  {
    target: '[data-tour="my-profile"]',
    content: 'Welcome! This is your personal profile where you can view your information and settings.',
    disableBeacon: true,
    placement: 'right',
  },
  {
    target: '[data-tour="my-dashboard"]',
    content: 'View your performance dashboard with charts showing your progress over time.',
    placement: 'right',
  },
  {
    target: '[data-tour="my-measurements"]',
    content: 'Track all your measurements and test results in one place.',
    placement: 'right',
  },
  {
    target: '[data-tour="peer-comparison"]',
    content: 'See how you compare to other athletes in anonymous peer comparisons.',
    placement: 'right',
  },
  {
    target: '[data-tour="my-goals"]',
    content: 'Set personal goals and track your progress toward achieving them.',
    placement: 'right',
  },
  {
    target: '[data-tour="join-organization"]',
    content: 'Join organizations to connect with your teams and coaches.',
    placement: 'right',
  },
  {
    target: 'body',
    content: "That's it! You're ready to start tracking your athletic performance. Click 'Finish' to get started.",
    placement: 'center',
  },
];
