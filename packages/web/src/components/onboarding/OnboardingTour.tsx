/**
 * Onboarding Tour Component
 *
 * Wraps react-joyride and provides role-based tour steps
 */

import React, { useMemo } from 'react';
import Joyride, { CallBackProps, STATUS } from 'react-joyride';
import { useAuth } from '@/lib/auth';
import { useOnboarding } from './OnboardingProvider';
import { athleteSteps } from './tour-steps/athlete-steps';
import { coachSteps } from './tour-steps/coach-steps';
import { orgAdminSteps } from './tour-steps/org-admin-steps';
import { OnboardingTooltip } from './OnboardingTooltip';

export function OnboardingTour() {
  const { user } = useAuth();
  const { isOnboardingActive, stopOnboarding } = useOnboarding();

  // Determine which steps to show based on user role
  const steps = useMemo(() => {
    if (!user) return [];

    // Site admins don't get onboarding
    if (user.isSiteAdmin) return [];

    const role = user.role || 'athlete';

    switch (role) {
      case 'org_admin':
        return orgAdminSteps;
      case 'coach':
        return coachSteps;
      case 'athlete':
      default:
        return athleteSteps;
    }
  }, [user]);

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status } = data;

    // Tour finished or skipped
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      stopOnboarding();
    }
  };

  if (!isOnboardingActive || steps.length === 0) {
    return null;
  }

  return (
    <Joyride
      steps={steps}
      run={isOnboardingActive}
      continuous
      showProgress
      showSkipButton
      callback={handleJoyrideCallback}
      tooltipComponent={OnboardingTooltip}
      styles={{
        options: {
          primaryColor: '#3b82f6', // blue-500
          zIndex: 10000,
        },
      }}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Finish',
        next: 'Next',
        skip: 'Skip Tour',
      }}
    />
  );
}
