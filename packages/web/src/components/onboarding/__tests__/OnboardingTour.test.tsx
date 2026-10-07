/**
 * Tests for OnboardingTour's react-joyride v3 event handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

let capturedProps: any;
vi.mock('react-joyride', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-joyride')>()),
  Joyride: (props: any) => {
    capturedProps = props;
    return null;
  },
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'coach', isSiteAdmin: false } }),
}));

const stopOnboarding = vi.fn();
vi.mock('../OnboardingProvider', () => ({
  useOnboarding: () => ({ isOnboardingActive: true, stopOnboarding }),
}));

import { OnboardingTour } from '../OnboardingTour';

describe('OnboardingTour', () => {
  beforeEach(() => {
    capturedProps = undefined;
    stopOnboarding.mockClear();
    render(<OnboardingTour />);
  });

  it('stops onboarding when the tour ends (finished)', () => {
    capturedProps.onEvent({ type: 'tour:end', status: 'finished' });
    expect(stopOnboarding).toHaveBeenCalledTimes(1);
  });

  it('stops onboarding when the tour ends (skipped)', () => {
    capturedProps.onEvent({ type: 'tour:end', status: 'skipped' });
    expect(stopOnboarding).toHaveBeenCalledTimes(1);
  });

  it('does not stop onboarding on intermediate events', () => {
    capturedProps.onEvent({ type: 'step:after', status: 'running' });
    expect(stopOnboarding).not.toHaveBeenCalled();
  });

  it('does not pass options that the custom tooltip ignores', () => {
    expect(capturedProps.options).not.toHaveProperty('showProgress');
  });
});
