/**
 * Onboarding Provider
 *
 * Manages onboarding tour state and auto-starts for new users
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface OnboardingContextType {
  isOnboardingActive: boolean;
  startOnboarding: () => void;
  stopOnboarding: () => void;
  hasCompletedOnboarding: boolean;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isOnboardingActive, setIsOnboardingActive] = useState(false);

  // Fetch onboarding status from backend
  const { data: onboardingStatus } = useQuery({
    queryKey: ['/api/profile/onboarding-status'],
    queryFn: async () => {
      const response = await fetch('/api/profile/onboarding-status', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch onboarding status');
      return response.json();
    },
    enabled: !!user && !user.isSiteAdmin,
  });

  // Mutation to mark onboarding as completed
  const completeMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/profile/onboarding-status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ completed: true }),
      });
      if (!response.ok) throw new Error('Failed to update onboarding status');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/profile/onboarding-status'] });
    },
  });

  // Auto-start onboarding for new users
  useEffect(() => {
    if (!user || user.isSiteAdmin) return;

    // Check localStorage for instant feedback
    const hasSeenOnboarding = localStorage.getItem(`onboarding_seen_${user.id}`);

    if (onboardingStatus && !onboardingStatus.hasCompletedOnboarding && !hasSeenOnboarding) {
      // Small delay to let the page render first
      const timer = setTimeout(() => {
        setIsOnboardingActive(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [user, onboardingStatus]);

  const startOnboarding = () => {
    // Clear localStorage to allow replay even if previously seen
    if (user) {
      localStorage.removeItem(`onboarding_seen_${user.id}`);
    }
    setIsOnboardingActive(true);
  };

  const stopOnboarding = () => {
    setIsOnboardingActive(false);
    if (user) {
      // Mark as seen in localStorage for instant feedback
      localStorage.setItem(`onboarding_seen_${user.id}`, 'true');
      // Mark as completed in backend
      completeMutation.mutate();
    }
  };

  return (
    <OnboardingContext.Provider
      value={{
        isOnboardingActive,
        startOnboarding,
        stopOnboarding,
        hasCompletedOnboarding: onboardingStatus?.hasCompletedOnboarding ?? true,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return context;
}
