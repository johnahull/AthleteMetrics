/**
 * Onboarding tour steps for Organization Admins
 *
 * 9 steps covering org admin features and system management
 */

import type { Step } from 'react-joyride';

export const orgAdminSteps: Step[] = [
  {
    target: '[data-tour="dashboard"]',
    content: 'Welcome! As an organization admin, you have full control over your organization.',
    disableBeacon: true,
    placement: 'right',
  },
  {
    target: '[data-tour="teams"]',
    content: 'Create and manage all teams in your organization.',
    placement: 'right',
  },
  {
    target: '[data-tour="athletes"]',
    content: 'Manage athlete profiles and assignments across teams.',
    placement: 'right',
  },
  {
    target: '[data-tour="data-entry"]',
    content: 'Enter performance data for athletes across all teams.',
    placement: 'right',
  },
  {
    target: '[data-tour="coach-analytics"]',
    content: 'Access organization-wide analytics and performance insights.',
    placement: 'right',
  },
  {
    target: '[data-tour="reports"]',
    content: 'Generate comprehensive reports for your organization.',
    placement: 'right',
  },
  {
    target: '[data-tour="measurements"]',
    content: 'Manage and publish measurements for all athletes.',
    placement: 'right',
  },
  {
    target: '[data-tour="import-export"]',
    content: 'Import historical data or export for compliance and analysis.',
    placement: 'right',
  },
  {
    target: 'body',
    content: "You're ready to manage your organization! Explore the settings menu for more advanced features.",
    placement: 'center',
  },
];
