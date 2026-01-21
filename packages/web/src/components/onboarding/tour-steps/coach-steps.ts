/**
 * Onboarding tour steps for Coaches
 *
 * 9 steps covering coach features and workflows
 */

import type { Step } from 'react-joyride';

export const coachSteps: Step[] = [
  {
    target: '[data-tour="dashboard"]',
    content: 'Welcome, Coach! Your dashboard provides an overview of your teams and athletes.',
    disableBeacon: true,
    placement: 'right',
  },
  {
    target: '[data-tour="teams"]',
    content: 'Manage your teams here. Create new teams, archive old ones, and organize athletes.',
    placement: 'right',
  },
  {
    target: '[data-tour="athletes"]',
    content: 'View and manage all athletes in your organization.',
    placement: 'right',
  },
  {
    target: '[data-tour="data-entry"]',
    content: 'Enter measurement data for your athletes quickly and efficiently.',
    placement: 'right',
  },
  {
    target: '[data-tour="coach-analytics"]',
    content: 'Analyze team performance with advanced analytics and visualizations.',
    placement: 'right',
  },
  {
    target: '[data-tour="reports"]',
    content: 'Generate and share performance reports with athletes and parents.',
    placement: 'right',
  },
  {
    target: '[data-tour="measurements"]',
    content: 'Publish measurements to make them visible to athletes.',
    placement: 'right',
  },
  {
    target: '[data-tour="import-export"]',
    content: 'Bulk import data from CSV files or export for external analysis.',
    placement: 'right',
  },
  {
    target: 'body',
    content: "You're all set! Start managing your teams and tracking athlete performance.",
    placement: 'center',
  },
];
