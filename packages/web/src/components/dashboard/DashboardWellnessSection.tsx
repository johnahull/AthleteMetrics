/**
 * Dashboard Wellness Section
 * Displays wellness summary, at-risk athletes, and team breakdown on the main dashboard
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, UserCheck, Heart, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useWellnessDashboard } from '@/hooks/use-wellness-dashboard';
import { useLocation } from 'wouter';
import { Skeleton } from '@/components/ui/skeleton';

interface SiteSettings {
  wellnessModuleEnabled: boolean;
}

interface OrganizationData {
  wellnessEnabled: boolean;
}

interface DashboardWellnessSectionProps {
  organizationId: string;
  teamId?: string;
  athleteId?: string;
  isSiteAdmin?: boolean;
}

interface AtRiskAthlete {
  id: string;
  name: string;
  status: 'red' | 'yellow';
  score: number | null;
  hasInjury: boolean;
  teamName: string;
}

/**
 * Renders a wellness overview section for the dashboard
 * Shows aggregated wellness scores, at-risk athletes, and team distribution
 */
export function DashboardWellnessSection({
  organizationId,
  teamId,
  athleteId,
  isSiteAdmin = false,
}: DashboardWellnessSectionProps) {
  const [, setLocation] = useLocation();

  // Check if wellness is enabled at site level
  const siteSettingsEndpoint = isSiteAdmin ? '/api/site-settings' : '/api/site-settings/public';
  const { data: siteSettings, isLoading: siteSettingsLoading } = useQuery<SiteSettings>({
    queryKey: [siteSettingsEndpoint],
    staleTime: 5 * 60 * 1000,
  });

  // Check if wellness is enabled at organization level
  const { data: organization, isLoading: orgLoading } = useQuery<OrganizationData>({
    queryKey: ['organizations', organizationId, 'details'],
    queryFn: async () => {
      const response = await fetch(`/api/organizations/${organizationId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch organization');
      }
      return response.json();
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  // Determine if wellness module is enabled
  const wellnessEnabled =
    (siteSettings?.wellnessModuleEnabled ?? true) && (organization?.wellnessEnabled ?? true);

  // Fetch wellness dashboard data with optional team filter
  const {
    data: wellnessData,
    isLoading: wellnessLoading,
    error: wellnessError,
  } = useWellnessDashboard({
    organizationId,
    teamIds: teamId ? [teamId] : undefined,
    enabled: wellnessEnabled && !!organizationId,
    enablePolling: false, // Don't poll on main dashboard to reduce load
  });

  // Aggregate wellness data across all teams
  const aggregatedData = useMemo(() => {
    if (!wellnessData || wellnessData.length === 0) {
      return null;
    }

    let totalRed = 0;
    let totalYellow = 0;
    let totalGreen = 0;
    let totalAthletes = 0;
    let totalResponses = 0;
    let scoreSum = 0;
    let scoreCount = 0;
    let scaleMax = 10; // Default scale

    // Trends tracking
    const trends: ('up' | 'down' | 'stable')[] = [];

    wellnessData.forEach((team) => {
      totalRed += team.redCount;
      totalYellow += team.yellowCount;
      totalGreen += team.greenCount;
      totalAthletes += team.totalAthletes;
      totalResponses += Math.round(team.totalAthletes * (team.completionRate / 100));
      scaleMax = team.scaleMax || scaleMax;

      if (team.teamAverageScore !== null) {
        scoreSum += team.teamAverageScore * team.totalAthletes;
        scoreCount += team.totalAthletes;
      }

      trends.push(team.trend);
    });

    // Calculate overall trend (majority vote)
    const trendCounts = { up: 0, down: 0, stable: 0 };
    trends.forEach((t) => trendCounts[t]++);
    let overallTrend: 'up' | 'down' | 'stable' = 'stable';
    if (trendCounts.up > trendCounts.down && trendCounts.up > trendCounts.stable) {
      overallTrend = 'up';
    } else if (trendCounts.down > trendCounts.up && trendCounts.down > trendCounts.stable) {
      overallTrend = 'down';
    }

    return {
      averageWellness: scoreCount > 0 ? scoreSum / scoreCount : null,
      scaleMax,
      trend: overallTrend,
      totalResponses,
      redCount: totalRed,
      yellowCount: totalYellow,
      greenCount: totalGreen,
      totalAthletes,
    };
  }, [wellnessData]);

  // Collect at-risk athletes from all teams
  const atRiskAthletes = useMemo((): AtRiskAthlete[] => {
    if (!wellnessData) return [];

    const athletes: AtRiskAthlete[] = [];

    wellnessData.forEach((team) => {
      team.athletes.forEach((athlete) => {
        if (athlete.status === 'red' || athlete.status === 'yellow') {
          athletes.push({
            id: athlete.id,
            name: athlete.name,
            status: athlete.status,
            score: athlete.score,
            hasInjury: athlete.injuries && athlete.injuries.length > 0,
            teamName: team.teamName,
          });
        }
      });
    });

    // Sort: red first, then yellow, then by score (lowest first)
    athletes.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'red' ? -1 : 1;
      }
      return (a.score ?? 0) - (b.score ?? 0);
    });

    return athletes;
  }, [wellnessData]);

  // Loading state
  if (siteSettingsLoading || orgLoading) {
    return null; // Don't show skeleton while checking if wellness is enabled
  }

  // Don't render if wellness is disabled
  if (!wellnessEnabled) {
    return null;
  }

  // Loading wellness data
  if (wellnessLoading) {
    return (
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Heart className="h-5 w-5 text-red-500" />
          Wellness Overview
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-4 w-24 mb-4" />
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Error or no data
  if (wellnessError || !wellnessData || wellnessData.length === 0) {
    return (
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Heart className="h-5 w-5 text-red-500" />
          Wellness Overview
        </h2>
        <Card>
          <CardContent className="p-6 text-center text-gray-500">
            <p>No wellness data available for the selected scope.</p>
            <p className="text-sm mt-1">Athletes need to submit wellness questionnaires to see data here.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const TrendIcon =
    aggregatedData?.trend === 'up'
      ? TrendingUp
      : aggregatedData?.trend === 'down'
        ? TrendingDown
        : Minus;
  const trendColor =
    aggregatedData?.trend === 'up'
      ? 'text-green-600'
      : aggregatedData?.trend === 'down'
        ? 'text-red-600'
        : 'text-gray-500';

  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Heart className="h-5 w-5 text-red-500" />
        Wellness Overview
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Average Wellness Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Average Wellness</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between">
              <div className="text-3xl font-bold text-gray-900">
                {aggregatedData && aggregatedData.averageWellness != null
                  ? aggregatedData.averageWellness.toFixed(1)
                  : '-'}
                <span className="text-lg text-gray-500 font-normal">
                  /{aggregatedData?.scaleMax ?? 10}
                </span>
              </div>
              <div className={`flex items-center gap-1 ${trendColor}`}>
                <TrendIcon className="h-4 w-4" />
                <span className="text-sm capitalize">{aggregatedData?.trend}</span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Based on {aggregatedData?.totalResponses || 0} responses
            </p>
          </CardContent>
        </Card>

        {/* At-Risk Athletes Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              At-Risk Athletes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {atRiskAthletes.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600">
                <UserCheck className="h-5 w-5" />
                <span className="text-sm font-medium">All athletes healthy</span>
              </div>
            ) : (
              <>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-3xl font-bold text-gray-900">{atRiskAthletes.length}</span>
                  <span className="text-sm text-gray-500">
                    athlete{atRiskAthletes.length !== 1 ? 's' : ''} need attention
                  </span>
                </div>

                {/* Status breakdown */}
                <div className="flex gap-4 mb-3 text-sm">
                  {(aggregatedData?.redCount ?? 0) > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-red-500"></span>
                      <span className="text-gray-600">{aggregatedData?.redCount ?? 0} critical</span>
                    </span>
                  )}
                  {(aggregatedData?.yellowCount ?? 0) > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                      <span className="text-gray-600">{aggregatedData?.yellowCount ?? 0} moderate</span>
                    </span>
                  )}
                </div>

                {/* Top 3 athletes list */}
                <div className="space-y-2">
                  {atRiskAthletes.slice(0, 3).map((athlete) => (
                    <button
                      key={athlete.id}
                      onClick={() => setLocation(`/athletes/${athlete.id}`)}
                      className="w-full text-left p-2 rounded-md hover:bg-gray-50 transition-colors flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            athlete.status === 'red' ? 'bg-red-500' : 'bg-yellow-400'
                          }`}
                        ></span>
                        <span className="text-sm font-medium text-gray-900 truncate max-w-[100px]">
                          {athlete.name}
                        </span>
                        <span className="text-xs text-gray-400 truncate max-w-[60px]">
                          {athlete.teamName}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {athlete.hasInjury ? 'Injury' : athlete.score?.toFixed(1) ?? '-'}
                      </span>
                    </button>
                  ))}
                  {atRiskAthletes.length > 3 && (
                    <p className="text-xs text-gray-500 text-center pt-1">
                      +{atRiskAthletes.length - 3} more
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Status Distribution Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Green */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-green-500"></span>
                  <span className="text-sm text-gray-600">Healthy</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {aggregatedData?.greenCount || 0}
                  </span>
                  <div className="w-24 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all"
                      style={{
                        width: `${aggregatedData?.totalAthletes ? ((aggregatedData.greenCount / aggregatedData.totalAthletes) * 100) : 0}%`,
                      }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Yellow */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-yellow-400"></span>
                  <span className="text-sm text-gray-600">Moderate</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {aggregatedData?.yellowCount || 0}
                  </span>
                  <div className="w-24 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-yellow-400 h-2 rounded-full transition-all"
                      style={{
                        width: `${aggregatedData?.totalAthletes ? ((aggregatedData.yellowCount / aggregatedData.totalAthletes) * 100) : 0}%`,
                      }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Red */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-500"></span>
                  <span className="text-sm text-gray-600">Critical</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {aggregatedData?.redCount || 0}
                  </span>
                  <div className="w-24 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-red-500 h-2 rounded-full transition-all"
                      style={{
                        width: `${aggregatedData?.totalAthletes ? ((aggregatedData.redCount / aggregatedData.totalAthletes) * 100) : 0}%`,
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-500 mt-4 text-center">
              {aggregatedData?.totalAthletes || 0} athletes across {wellnessData?.length || 0} team
              {(wellnessData?.length || 0) !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
