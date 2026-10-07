/**
 * Onboarding Tour Component
 *
 * Wraps react-joyride and provides role-based tour steps
 */

import React, { useMemo } from 'react';
import { Joyride, EVENTS, type EventData } from 'react-joyride';
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

  const handleJoyrideCallback = (data: EventData) => {
    // Fired once when the tour finishes or is skipped
    if (data.type === EVENTS.TOUR_END) {
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
      onEvent={handleJoyrideCallback}
      tooltipComponent={OnboardingTooltip}
      options={{
        primaryColor: '#3b82f6', // blue-500
        zIndex: 10000,
        width: 448, // match OnboardingTooltip's max-w-md; v3 defaults to 380
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
