/**
 * Athlete Analytics Page - Refactored with New Architecture
 * Uses BaseAnalyticsView for shared functionality with athlete-specific configuration
 */

import React from 'react';
import { BaseAnalyticsView } from '@/components/analytics/BaseAnalyticsView';
import { Button } from '@/components/ui/button';
import { RefreshCw, Download, Trophy, Target } from 'lucide-react';

import { useAuth } from '@/lib/auth';
import { useAthleteTeams } from '@/hooks/useAthleteTeams';
import { getAthleteUserId } from '@/lib/athlete-utils';
import type { AnalyticsFilters } from '@shared/analytics-types';

export function AthleteAnalytics() {
  // ALL HOOKS MUST BE CALLED FIRST - No early returns before hooks!
  const { user, organizationContext } = useAuth();
  const { teamIds, isLoading: teamsLoading, error: teamsError } = useAthleteTeams();

  // Header actions for athlete-specific view
  const headerActions = (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
      >
        <Trophy className="h-4 w-4 mr-2" />
        My Progress
      </Button>

      <Button
        variant="outline"
        size="sm"
      >
        <Target className="h-4 w-4 mr-2" />
        Set Goals
      </Button>

      <Button
        variant="outline"
        size="sm"
      >
        <RefreshCw className="h-4 w-4 mr-2" />
        Refresh
      </Button>

      <Button
        variant="outline"
        size="sm"
      >
        <Download className="h-4 w-4 mr-2" />
        Export
      </Button>
    </div>
  );

  // Additional athlete-specific filters or components could go here
  const additionalFilters = (
    <div className="space-y-4">
      {/* Future: Goal tracking, personal records, comparison toggles */}
    </div>
  );

  // Conditional rendering AFTER all hooks - prevents hooks order violations
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your profile...</p>
        </div>
      </div>
    );
  }

  // Get the organization ID from user context, organizationContext, or primaryOrganizationId
  const organizationId =
    user.currentOrganization?.id ||
    organizationContext ||
    user.primaryOrganizationId;

  // Don't render if we don't have an organization ID
  if (!organizationId) {
    return (
      <div className="p-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">No Organization Found</h2>
          <p className="text-muted-foreground">
            You must be associated with an organization to view analytics.
          </p>
        </div>
      </div>
    );
  }

  // Show loading state while teams are being fetched
  if (teamsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center" role="status" aria-label="Loading teams">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" aria-hidden="true"></div>
          <p className="text-muted-foreground">Loading your teams...</p>
        </div>
      </div>
    );
  }

  // Show error if teams failed to load
  if (teamsError) {
    return (
      <div className="p-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2 text-destructive">Error Loading Teams</h2>
          <p className="text-muted-foreground mb-4">{teamsError}</p>
          <Button onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Create initial filters with the athlete's teams pre-selected and athleteId
  const athleteUserId = getAthleteUserId(user);
  const initialFilters: Partial<AnalyticsFilters> = {
    athleteIds: athleteUserId ? [athleteUserId] : undefined,
    teams: teamIds.length > 0 ? teamIds : undefined,
    organizationId: organizationId
  };

  return (
    <BaseAnalyticsView
      title="My Athletics Performance"
      description="Track your progress, analyze your performance, and identify areas for improvement"
      organizationId={organizationId}
      userId={user.id}
      defaultAnalysisType="individual"
      allowedAnalysisTypes={['individual']} // Athletes only see individual analysis
      requireRole={['athlete', 'coach', 'org_admin', 'site_admin']}
      headerActions={headerActions}
      additionalFilters={additionalFilters}
      showIndividualAthleteSelection={true} // Show selector to allow athlete selection
      showAnalysisTypeTabs={false} // Hide analysis type tabs for athletes
      initialFilters={initialFilters} // Pre-select athlete's teams
      className="athlete-analytics"
    />
  );
}

export default AthleteAnalytics;