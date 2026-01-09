/**
 * Onboarding Provider
 *
 * Manages onboarding tour state and auto-starts for new users
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

interface OnboardingContextType {
  isOnboardingActive: boolean;
  startOnboarding: () => void;
  stopOnboarding: () => void;
  hasCompletedOnboarding: boolean;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

// Delay before showing onboarding tour to allow page to render
const ONBOARDING_START_DELAY_MS = 500;

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isOnboardingActive, setIsOnboardingActive] = useState(false);

  // Fetch onboarding status from backend
  const { data: onboardingStatus, isLoading } = useQuery({
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
    onSuccess: (data, variables, context) => {
      // Only set localStorage AFTER API success to prevent race condition
      if (user) {
        localStorage.setItem(`onboarding_seen_${user.id}`, 'true');
      }
      queryClient.invalidateQueries({ queryKey: ['/api/profile/onboarding-status'] });
    },
    onError: (error) => {
      console.error('Failed to update onboarding status:', error);
      // Show user feedback on error
      toast({
        title: "Connection Error",
        description: "Tour completed locally, but couldn't save to server. Please check your connection.",
        variant: "destructive",
      });
    },
  });

  // Clean up old localStorage keys from other users (prevent accumulation)
  useEffect(() => {
    if (!user) return;

    const currentKey = `onboarding_seen_${user.id}`;
    const keysToRemove: string[] = [];

    // Find all onboarding keys that aren't for the current user
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('onboarding_seen_') && key !== currentKey) {
        keysToRemove.push(key);
      }
    }

    // Remove old keys
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }, [user]);

  // Auto-start onboarding for new users
  useEffect(() => {
    if (!user || user.isSiteAdmin) return;

    // Check localStorage for instant feedback
    const hasSeenOnboarding = localStorage.getItem(`onboarding_seen_${user.id}`);

    // Only start if we have confirmed API data (not still loading)
    if (onboardingStatus && !onboardingStatus.hasCompletedOnboarding && !hasSeenOnboarding && !isLoading) {
      // Small delay to let the page render first
      const timer = setTimeout(() => {
        setIsOnboardingActive(true);
      }, ONBOARDING_START_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [user, onboardingStatus, isLoading]);

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
      // Mark as completed in backend (localStorage will be set on success)
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
