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
 */

import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ClipboardCheck, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import type { WellnessRequest } from '@shared/wellness-types';

export function PendingTasksBanner() {
  const { user } = useAuth();

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

  // Filter to only active, non-expired requests
  const pendingRequests = requests?.filter(r =>
    r.status === 'active' &&
    (!r.expiresAt || new Date(r.expiresAt) >= new Date())
  ) || [];

  // Don't render if loading or no pending tasks
  // This keeps the dashboard clean when there's nothing to do
  if (isLoading || pendingRequests.length === 0) {
    return null;
  }

  const pendingCount = pendingRequests.length;

  return (
    <Alert
      className="bg-blue-50 border-blue-200 mb-6"
      data-testid="pending-tasks-banner"
    >
      <ClipboardCheck className="h-4 w-4 text-blue-600" />
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
