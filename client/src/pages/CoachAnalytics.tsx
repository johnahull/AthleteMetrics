/**
 * Coach Analytics Page - Refactored with BaseAnalyticsView Architecture
 * Uses BaseAnalyticsView for comprehensive team and athlete analytics
 */

import React from 'react';
import { BaseAnalyticsView } from '@/components/analytics/BaseAnalyticsView';
import { Button } from '@/components/ui/button';
import { Users, BarChart3, Trophy } from 'lucide-react';

import { useAuth } from '@/lib/auth';
import { devLog } from '@/utils/dev-logger';

export function CoachAnalytics() {
  // ALL HOOKS MUST BE CALLED FIRST - No early returns before hooks!
  const { user, organizationContext } = useAuth();

  // Debug organization context
  React.useEffect(() => {
    devLog.log('CoachAnalytics - User context:', {
      userId: user?.id,
      currentOrganization: user?.currentOrganization,
      organizationContext: user?.currentOrganization?.id
    });
  }, [user]);

  // Header actions for coach-specific navigation
  // Note: Refresh and Export buttons are provided by AnalyticsToolbar
  const headerActions = (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
      >
        <Users className="h-4 w-4 mr-2" />
        Team Overview
      </Button>

      <Button
        variant="outline"
        size="sm"
      >
        <Trophy className="h-4 w-4 mr-2" />
        Top Performers
      </Button>

      <Button
        variant="outline"
        size="sm"
      >
        <BarChart3 className="h-4 w-4 mr-2" />
        Reports
      </Button>
    </div>
  );

  // Additional coach-specific filters or components could go here
  const additionalFilters = (
    <div className="space-y-4">
      {/* Future: Team comparisons, recruiting filters, seasonal analysis */}
    </div>
  );

  // Conditional rendering AFTER all hooks - prevents hooks order violations
  if (!user) {
    return <div className="p-6">Loading...</div>;
  }

  // Show loading state while organization context is being established
  if (!organizationContext) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <div className="text-lg font-medium mb-2">Loading organization...</div>
          <div className="text-sm text-muted-foreground">Setting up your team analytics dashboard</div>
        </div>
      </div>
    );
  }

  return (
    <BaseAnalyticsView
      title="Team Analytics Dashboard"
      description="Analyze team performance, compare athletes across groups, and identify trends and opportunities"
      organizationId={organizationContext}
      defaultAnalysisType="intra_group"
      allowedAnalysisTypes={['individual', 'intra_group', 'multi_group']}
      requireRole={['coach', 'org_admin', 'site_admin']}
      headerActions={headerActions}
      additionalFilters={additionalFilters}
      showIndividualAthleteSelection={true}
      showMultiAthleteSelection={true}
      showDateSelection={true}
      className="coach-analytics"
    />
  );
}

export default CoachAnalytics;