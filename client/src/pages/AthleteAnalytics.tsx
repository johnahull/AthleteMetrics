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
import type { AnalyticsFilters } from '@shared/analytics-types';

export function AthleteAnalytics() {
  // ALL HOOKS MUST BE CALLED FIRST - No early returns before hooks!
  const { user } = useAuth();
  const { teamIds } = useAthleteTeams();

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
    return <div className="p-6">Loading...</div>;
  }

  // Get the organization ID from user context
  const organizationId = user.currentOrganization?.id || (user as any).primaryOrganizationId;

  // Create initial filters with the athlete's teams pre-selected and athleteId
  const initialFilters: Partial<AnalyticsFilters> = {
    athleteIds: user.athleteId ? [user.athleteId] : [user.id],
    teams: teamIds.length > 0 ? teamIds : undefined,
    organizationId: organizationId
  };

  console.log('AthleteAnalytics - User context:', {
    userId: user.id,
    athleteId: user.athleteId,
    organizationId,
    teamIds,
    initialFilters
  });

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