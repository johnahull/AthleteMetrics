/**
 * PendingTasksBanner Component
 *
 * Displays a banner at the top of the athlete dashboard when there are
 * pending wellness questionnaires that need to be completed.
 *
 * Features:
 * - Fetches pending wellness requests via React Query
 * - Only renders when there are active, non-expired requests
 * - Shows count of pending questionnaires
 * - Provides CTA button to navigate to the requests page
 * - Dismiss button with 24-hour snooze (localStorage)
 * - Reappears after 24 hours or when new requests arrive
 */

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ClipboardCheck, ArrowRight, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import type { WellnessRequest } from '@shared/wellness-types';

const DISMISS_KEY = 'wellness-tasks-dismissed';
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

interface DismissData {
  dismissedAt: number;
  requestIds: string[];
}

export function PendingTasksBanner() {
  const { user } = useAuth();
  const [isDismissed, setIsDismissed] = useState(false);

  // Fetch pending requests using React Query
  // Uses same query key as wellness-my-requests.tsx for cache sharing
  const { data: requests, isLoading } = useQuery<WellnessRequest[]>({
    queryKey: ['wellness-my-requests', user?.id],
    queryFn: async () => {
      const res = await fetch('/api/wellness/my-requests');
      if (!res.ok) throw new Error('Failed to fetch wellness requests');
      return res.json();
    },
    enabled: !!user,
    staleTime: 30 * 1000, // Consider stale after 30 seconds
  });

  // Filter to only active, non-expired requests (memoized to prevent re-render loops)
  const pendingRequests = useMemo(() =>
    requests?.filter(r =>
      r.status === 'active' &&
      (!r.expiresAt || new Date(r.expiresAt) >= new Date())
    ) || [],
    [requests]
  );

  // Check if banner should be dismissed based on localStorage
  useEffect(() => {
    if (pendingRequests.length === 0) {
      setIsDismissed(false);
      return;
    }

    const dismissDataStr = localStorage.getItem(DISMISS_KEY);
    if (!dismissDataStr) {
      setIsDismissed(false);
      return;
    }

    try {
      const dismissData: DismissData = JSON.parse(dismissDataStr);
      const now = Date.now();
      const timeSinceDismiss = now - dismissData.dismissedAt;

      // Check if 24 hours have passed
      if (timeSinceDismiss > DISMISS_DURATION_MS) {
        // Expired - clear and show banner
        localStorage.removeItem(DISMISS_KEY);
        setIsDismissed(false);
        return;
      }

      // Check if there are new requests (not in the dismissed list)
      const currentRequestIds = pendingRequests.map(r => r.id);
      const hasNewRequests = currentRequestIds.some(id => !dismissData.requestIds.includes(id));

      if (hasNewRequests) {
        // New requests arrived - clear dismiss and show banner
        localStorage.removeItem(DISMISS_KEY);
        setIsDismissed(false);
      } else {
        // Still dismissed
        setIsDismissed(true);
      }
    } catch (error) {
      console.error('Failed to parse dismiss data:', error);
      localStorage.removeItem(DISMISS_KEY);
      setIsDismissed(false);
    }
  }, [pendingRequests]);

  // Handle dismiss click
  const handleDismiss = () => {
    const dismissData: DismissData = {
      dismissedAt: Date.now(),
      requestIds: pendingRequests.map(r => r.id),
    };
    localStorage.setItem(DISMISS_KEY, JSON.stringify(dismissData));
    setIsDismissed(true);
  };

  // Don't render if loading, no pending tasks, or dismissed
  if (isLoading || pendingRequests.length === 0 || isDismissed) {
    return null;
  }

  const pendingCount = pendingRequests.length;

  return (
    <Alert
      className="bg-blue-50 border-blue-200 mb-6 relative"
      data-testid="pending-tasks-banner"
    >
      <ClipboardCheck className="h-4 w-4 text-blue-600" />
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-6 w-6 text-blue-600 hover:text-blue-800 hover:bg-blue-100"
        onClick={handleDismiss}
        data-testid="dismiss-banner"
        aria-label="Dismiss for 24 hours"
      >
        <X className="h-4 w-4" />
      </Button>
      <AlertTitle className="text-blue-800">Wellness Check-In Needed</AlertTitle>
      <AlertDescription className="text-blue-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <span>
          You have {pendingCount} wellness questionnaire{pendingCount > 1 ? 's' : ''} to complete.
        </span>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="border-blue-300 text-blue-700 hover:bg-blue-100 shrink-0"
        >
          <Link href="/wellness/my-requests">
            Complete Now
            <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
