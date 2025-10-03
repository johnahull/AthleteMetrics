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
  const { user, organizationContext, userOrganizations, setOrganizationContext } = useAuth();

  // Auto-select first organization if context is missing but organizations exist
  React.useEffect(() => {
    if (!organizationContext && userOrganizations && userOrganizations.length > 0) {
      devLog.log('CoachAnalytics - Auto-selecting first organization:', userOrganizations[0]);
      setOrganizationContext(userOrganizations[0].organizationId);
    }
  }, [organizationContext, userOrganizations, setOrganizationContext]);

  // Debug organization context
  React.useEffect(() => {
    devLog.log('CoachAnalytics - User context:', {
      userId: user?.id,
      organizationContext,
      userOrganizations: userOrganizations?.length
    });
  }, [user, organizationContext, userOrganizations]);

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

  // Wait for organization context to be set (either from auth or auto-selection)
  if (!organizationContext) {
    return <div className="p-6">Loading organization...</div>;
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