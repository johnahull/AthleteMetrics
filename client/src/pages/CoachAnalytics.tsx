/**
 * Coach Analytics Page - Refactored with BaseAnalyticsView Architecture
 * Uses BaseAnalyticsView for comprehensive team and athlete analytics
 */

import React from 'react';
import { BaseAnalyticsView } from '@/components/analytics/BaseAnalyticsView';
import { Button } from '@/components/ui/button';
import { RefreshCw, Download, Users, BarChart3, Trophy } from 'lucide-react';

import { useAuth } from '@/lib/auth';

export function CoachAnalytics() {
  // ALL HOOKS MUST BE CALLED FIRST - No early returns before hooks!
  const { user } = useAuth();

  // Header actions for coach-specific view
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

  return (
    <BaseAnalyticsView
      title="Team Analytics Dashboard"
      description="Analyze team performance, compare athletes across groups, and identify trends and opportunities"
      organizationId={user?.currentOrganization?.id}
      defaultAnalysisType="inter_group"
      allowedAnalysisTypes={['individual', 'intra_group', 'inter_group']}
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