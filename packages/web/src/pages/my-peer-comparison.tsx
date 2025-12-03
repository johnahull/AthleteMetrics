/**
 * My Peer Comparison Page
 *
 * Dedicated page for detailed peer comparison with:
 * - Filters: Scope (Team/Global), team selection, age range, gender, sport
 * - Metric cards with percentile bars and expandable distribution charts
 * - Benchmark integration showing status alongside peer percentiles
 *
 * Privacy Model: All athlete data contributes to the anonymous peer pool.
 * The user's showPeerComparisons preference controls whether they SEE comparisons,
 * not whether they contribute data.
 */

import { useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { useAthleteContext } from '@/hooks/useAthleteContext';
import { useAthleteDashboardData } from '@/hooks/useAthleteDashboardData';
import { useAthleteProfile } from '@/hooks/useAthleteProfile';
import {
  usePeerPercentiles,
  usePeerComparisonStatus,
  type PeerFilterCriteria,
} from '@/hooks/usePeerComparison';
import {
  PeerComparisonFilters,
  type ComparisonScope,
} from '@/components/athlete/PeerComparisonFilters';
import { PeerMetricCard, type BenchmarkStatus } from '@/components/athlete/PeerMetricCard';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  AlertCircle,
  Users,
  BarChart3,
  ArrowLeft,
  Settings,
} from 'lucide-react';
import { Link, Redirect } from 'wouter';
import { useQuery } from '@tanstack/react-query';

export default function MyPeerComparisonPage() {
  const { user, isLoading: authLoading, organizationContext } = useAuth();
  const { athleteId, isLoading: contextLoading } = useAthleteContext();

  // Filter state
  const [scope, setScope] = useState<ComparisonScope>('global');
  const [filters, setFilters] = useState<PeerFilterCriteria>({});

  // Fetch dashboard data for available metrics - include unverified for athlete's own view
  const { data: dashboardData, isLoading: dashboardLoading } = useAthleteDashboardData(athleteId, {
    includeUnverified: true,
  });

  // Fetch athlete profile for age/gender defaults
  const { data: athlete } = useAthleteProfile(athleteId);

  // Check display preference (user's choice to see or not see comparisons)
  const { data: peerStatus, isLoading: statusLoading } = usePeerComparisonStatus(user?.id);

  // Get all metrics the athlete has measurements for
  const availableMetrics = useMemo(() => {
    return dashboardData?.availableMetrics || [];
  }, [dashboardData?.availableMetrics]);

  // Prepare filters with teamIds when scope is 'team'
  const effectiveFilters = useMemo(() => {
    if (scope === 'team' && filters.teamIds && filters.teamIds.length > 0) {
      return filters;
    }
    // Remove teamIds from filters if scope is global
    const { teamIds, ...globalFilters } = filters;
    return globalFilters;
  }, [scope, filters]);

  // Fetch peer percentiles
  const {
    data: percentilesData,
    isLoading: percentilesLoading,
    isError: percentilesError,
    error,
  } = usePeerPercentiles(
    athleteId,
    availableMetrics,
    effectiveFilters,
    { enabled: !!athleteId && availableMetrics.length > 0 && peerStatus?.optedIn !== false }
  );

  // Fetch benchmark status for the athlete
  const { data: benchmarkData } = useQuery<BenchmarkStatus[]>({
    queryKey: ['/api/organizations/:orgId/athletes/:athleteId/benchmark-status', organizationContext, athleteId],
    queryFn: async () => {
      if (!organizationContext || !athleteId) return [];
      const response = await fetch(
        `/api/organizations/${organizationContext}/athletes/${athleteId}/benchmark-status`,
        { credentials: 'include' }
      );
      if (!response.ok) return [];
      const data = await response.json();
      // Transform backend field names to frontend interface
      return data.map((b: any) => ({
        metricCode: b.metricCode,
        benchmarkName: b.benchmarkName,
        targetValue: b.benchmarkValue,  // Map benchmarkValue -> targetValue
        currentValue: b.athleteValue,   // Map athleteValue -> currentValue
        isMet: b.isMet,
        progress: b.progress,
        source: b.source || 'Global',   // "Global" for site benchmarks, org name for custom
      }));
    },
    enabled: !!organizationContext && !!athleteId,
  });

  // Create a map of metric to benchmark status
  const benchmarksByMetric = useMemo(() => {
    if (!benchmarkData) return new Map<string, BenchmarkStatus>();
    return new Map(benchmarkData.map(b => [b.metricCode, b]));
  }, [benchmarkData]);

  // Handle filter changes
  const handleFilterChange = useCallback((newFilters: Partial<PeerFilterCriteria>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  // Handle scope change
  const handleScopeChange = useCallback((newScope: ComparisonScope) => {
    setScope(newScope);
    // Clear team selection when switching to global
    if (newScope === 'global') {
      setFilters(prev => ({ ...prev, teamIds: undefined }));
    }
  }, []);

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    setFilters({});
  }, []);

  // Sort percentiles by value (highest first) - must be before early returns
  const sortedPercentiles = useMemo(() => {
    if (!percentilesData?.percentiles) return [];
    return [...percentilesData.percentiles].sort((a, b) => b.percentile - a.percentile);
  }, [percentilesData?.percentiles]);

  // Redirect if not logged in
  if (!authLoading && !user) {
    return <Redirect to="/login" />;
  }

  // Redirect if not an athlete
  if (!authLoading && user && !user.athleteId) {
    return <Redirect to="/dashboard" />;
  }

  // Loading state
  const isLoading = authLoading || contextLoading || dashboardLoading || statusLoading;
  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-2 mb-6">
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <Skeleton className="h-96 lg:col-span-1" />
          <div className="lg:col-span-3 space-y-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </div>
    );
  }

  // Display preference off - user chose not to see comparisons
  if (peerStatus?.optedIn === false) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-2 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-600" />
            Peer Comparison
          </h1>
        </div>

        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Peer Comparisons Hidden
            </h2>
            <p className="text-gray-500 max-w-md mx-auto mb-6">
              You've chosen to hide peer comparisons. You can enable them at any time in your profile settings.
            </p>
            <Link href="/my-profile">
              <Button variant="outline">
                <Settings className="h-4 w-4 mr-2" />
                Go to Profile Settings
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Empty state - no measurements
  if (!dashboardData || availableMetrics.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-2 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-600" />
            Peer Comparison
          </h1>
        </div>

        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              No Measurements Yet
            </h2>
            <p className="text-gray-500 max-w-md mx-auto">
              Once your coach records some measurements, you'll be able to see how you compare to other athletes.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (percentilesError) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center gap-2 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-600" />
            Peer Comparison
          </h1>
        </div>

        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error?.message || 'Unable to load peer comparison data. Please try again.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Users className="h-6 w-6 text-blue-600" />
          Peer Comparison
        </h1>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filters sidebar */}
        <div className="lg:col-span-1">
          <PeerComparisonFilters
            filters={filters}
            scope={scope}
            onFilterChange={handleFilterChange}
            onScopeChange={handleScopeChange}
            onClearFilters={handleClearFilters}
            athleteAge={athlete?.birthDate ? calculateAge(athlete.birthDate) : undefined}
            athleteGender={athlete?.gender as 'Male' | 'Female' | undefined}
          />
        </div>

        {/* Metrics list */}
        <div className="lg:col-span-3">
          {percentilesLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : sortedPercentiles.length > 0 ? (
            <div className="space-y-4">
              {sortedPercentiles.map((result) => (
                <PeerMetricCard
                  key={result.metric}
                  result={result}
                  benchmark={benchmarksByMetric.get(result.metric)}
                  filters={effectiveFilters}
                  lowerIsBetter={isLowerBetterMetric(result.metric)}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  No Comparison Data
                </h2>
                <p className="text-gray-500 max-w-md mx-auto">
                  No peer comparison data is available for your current filter settings.
                  Try adjusting the filters or comparing globally.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Calculate age from birth date
 */
function calculateAge(birthDate: string | Date): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * Check if a metric is "lower is better" (time-based metrics)
 */
function isLowerBetterMetric(metric: string): boolean {
  const lowerIsBetterMetrics = [
    'FLY10_TIME',
    'AGILITY_505',
    'AGILITY_5105',
    'T_TEST',
    'DASH_40YD',
    'DASH_100M',
    'DASH_200M',
    'SHUTTLE_RUN',
  ];
  return lowerIsBetterMetrics.some(m => metric.toUpperCase().includes(m) || m.includes(metric.toUpperCase()));
}
