/**
 * Coach Analytics Page - Refactored with BaseAnalyticsView Architecture
 * Uses BaseAnalyticsView for comprehensive team and athlete analytics
 */

import React from 'react';
import { BaseAnalyticsView } from '@/components/analytics/BaseAnalyticsView';
import { Button } from '@/components/ui/button';
import { Users, BarChart3, Trophy } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ChartSkeleton, KPICardSkeleton } from '@/components/ui/loading-states';

import { useAuth } from '@/lib/auth';
import { devLog } from '@/utils/dev-logger';
import { useContextualLabels } from '@/hooks/useContextualLabels';

export function CoachAnalytics() {
  // ALL HOOKS MUST BE CALLED FIRST - No early returns before hooks!
  const labels = useContextualLabels();
  const { user, organizationContext, userOrganizations, isLoading } = useAuth();

  // Debug organization context
  React.useEffect(() => {
    devLog.log('CoachAnalytics - User context:', {
      userId: user?.id,
      currentOrganization: user?.currentOrganization,
      organizationContext: user?.currentOrganization?.id,
      userOrganizations
    });
  }, [user, userOrganizations]);


  // Header actions for coach-specific navigation
  // Note: Refresh and Export buttons are provided by AnalyticsToolbar
  const headerActions = (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
      >
        <Users className="h-4 w-4 mr-2" />
        {labels.team} Overview
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
  // Show loading state while auth is being established
  if (isLoading) {
    return (
      <div className="p-6">
        <div className="space-y-6">
          {/* Header Skeleton */}
          <div>
            <div className="h-8 w-64 bg-gray-200 rounded animate-pulse mb-2"></div>
            <div className="h-4 w-96 bg-gray-200 rounded animate-pulse"></div>
          </div>

          {/* Filters Skeleton */}
          <Card className="bg-white">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-4 w-20 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-10 w-full bg-gray-200 rounded animate-pulse"></div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* KPI Cards Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <KPICardSkeleton />
            <KPICardSkeleton />
            <KPICardSkeleton />
          </div>

          {/* Charts Skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-white">
              <CardContent className="p-0">
                <ChartSkeleton />
              </CardContent>
            </Card>
            <Card className="bg-white">
              <CardContent className="p-0">
                <ChartSkeleton />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Check if user is authenticated
  if (!user) {
    return <div className="p-6">Please log in to access analytics.</div>;
  }

  // Check organizationContext first (from auth), then fall back to userOrganizations
  // Only show error if BOTH are missing
  if (!organizationContext && (!userOrganizations || !Array.isArray(userOrganizations) || userOrganizations.length === 0)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>No Organization Found</CardTitle>
            <CardDescription>
              You are not associated with any organization. Please contact your administrator.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Determine the effective organization ID (prioritize context, then fallback to first user org)
  const effectiveOrganizationId = organizationContext || userOrganizations?.[0]?.organizationId;

  return (
    <BaseAnalyticsView
      title={`${labels.team} Analytics Dashboard`}
      description={`Analyze ${labels.team.toLowerCase()} performance, compare ${labels.athletes.toLowerCase()} across groups, and identify trends and opportunities`}
      organizationId={effectiveOrganizationId}
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