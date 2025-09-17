import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Users, UsersRound, Clock, ArrowUp } from "lucide-react";
import PerformanceChart from "@/components/charts/performance-chart";
import { formatFly10TimeWithSpeed } from "@/lib/speed-utils";
import { getMetricDisplayName, getMetricColor, getMetricIcon, formatMetricValue } from "@/lib/metrics";
import { useAuth } from "@/lib/auth";

export default function Dashboard() {
  const { user, organizationContext } = useAuth();
  const [, setLocation] = useLocation();

  // Use role from user session data
  const userRole = user?.role || 'athlete';
  const isSiteAdmin = user?.isSiteAdmin || false;

  // Redirect athletes away from organization dashboard
  useEffect(() => {
    if (!isSiteAdmin && userRole === "athlete") {
      setLocation(`/athletes/${user?.id}`);
    }
  }, [isSiteAdmin, userRole, user?.id, setLocation]);

  // Don't render dashboard for athletes
  if (!isSiteAdmin && userRole === "athlete") {
    return null;
  }

  const { data: dashboardStats, isLoading, error } = useQuery({
    queryKey: ["/api/analytics/dashboard", organizationContext],
    queryFn: async () => {
      const url = organizationContext
        ? `/api/analytics/dashboard?organizationId=${organizationContext}`
        : `/api/analytics/dashboard`;
      const response = await fetch(url, {
        credentials: 'include' // Ensure cookies are sent for authentication
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!user // Only run query when user is authenticated
  });

  const { data: recentMeasurements } = useQuery({
    queryKey: ["/api/measurements", organizationContext],
    queryFn: async () => {
      const url = organizationContext
        ? `/api/measurements?organizationId=${organizationContext}`
        : `/api/measurements`;
      const response = await fetch(url, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!user
  });

  // Get organization name for context indicator
  const { data: currentOrganization } = useQuery({
    queryKey: [`/api/organizations/${organizationContext}`],
    enabled: !!organizationContext && !!user,
    queryFn: async () => {
      const response = await fetch(`/api/organizations/${organizationContext}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    }
  });

  const { data: teamStats } = useQuery({
    queryKey: ["/api/analytics/teams", organizationContext],
    queryFn: async () => {
      const url = organizationContext
        ? `/api/analytics/teams?organizationId=${organizationContext}`
        : `/api/analytics/teams`;
      const response = await fetch(url, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!user
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-64"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Debug logging
  React.useEffect(() => {
    console.log('Dashboard Debug Info:', {
      user,
      userRole,
      organizationContext,
      dashboardStats,
      error
    });
  }, [user, userRole, organizationContext, dashboardStats, error]);

  // Show error state if dashboard stats failed to load
  if (error) {
    console.error('Dashboard stats error:', error);
  }

  const stats = (dashboardStats as any) || {
    totalAthletes: 0,
    activeAthletes: 0,
    totalTeams: 0,
    bestFly10Today: null,
    bestVerticalToday: null,
  };

  return (
    <div className="p-6">
      {/* Error Display */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Dashboard Data Error</h3>
              <p className="mt-1 text-sm text-red-700">
                Failed to load dashboard statistics: {error.message}
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Dashboard Overview</h1>
            <p className="text-gray-600 mt-1">
              {organizationContext && currentOrganization
                ? `${currentOrganization.name} - Performance overview`
                : "Track athlete performance and team analytics"
              }
            </p>
          </div>
          {organizationContext && currentOrganization && (
            <div className="bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg">
              <p className="text-sm font-medium text-blue-900">Organization View</p>
              <p className="text-xs text-blue-700">{currentOrganization.name}</p>
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards - Static Cards for Athletes and Teams */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card className="bg-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Athletes</p>
                <p className="text-3xl font-bold text-gray-900" data-testid="stat-active-athletes">
                  {stats.totalAthletes || 0}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {stats.activeAthletes || 0} with active accounts
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <UsersRound className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Teams</p>
                <p className="text-3xl font-bold text-gray-900" data-testid="stat-total-teams">
                  {stats.totalTeams}
                </p>
                <p className="text-sm text-gray-500 mt-1">Across all levels</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Users className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Metrics Cards - Best from Last 30 Days */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
        {/* Dynamic metric cards for all 7 test types */}
        {['FLY10_TIME', 'VERTICAL_JUMP', 'AGILITY_505', 'AGILITY_5105', 'T_TEST', 'DASH_40YD', 'RSI'].map((metric) => {
          const bestResult = stats[`best${metric}Last30Days`];
          const MetricIcon = getMetricIcon(metric);
          const metricColor = getMetricColor(metric);
          
          return (
            <Card key={metric} className="bg-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">
                      Best {getMetricDisplayName(metric)} (30d)
                    </p>
                    <p className="text-2xl font-bold text-gray-900" data-testid={`stat-best-${metric.toLowerCase()}`}>
                      {bestResult ? formatMetricValue(metric, parseFloat(bestResult.value)) : "N/A"}
                    </p>
                    <p className="text-sm text-gray-500 mt-1" data-testid={`stat-best-${metric.toLowerCase()}-athlete`}>
                      {bestResult?.userName || "No data"}
                    </p>
                  </div>
                  <div className={`w-12 h-12 ${metricColor.replace('text-', 'bg-').replace('800', '100')} rounded-lg flex items-center justify-center`}>
                    <MetricIcon className={`h-6 w-6 ${metricColor.replace('bg-', 'text-').replace('100', '600')}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <PerformanceChart />

        <Card className="bg-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Team Distribution</h3>
            </div>
            <div className="space-y-4">
              {Array.isArray(teamStats) && teamStats.slice(0, 5).map((team: any, index: number) => (
                <div key={team.teamId} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${
                      index === 0 ? 'bg-blue-500' :
                      index === 1 ? 'bg-green-500' :
                      index === 2 ? 'bg-yellow-500' :
                      index === 3 ? 'bg-purple-500' : 'bg-gray-500'
                    }`}></div>
                    <span className="text-sm font-medium text-gray-900">{team.teamName}</span>
                  </div>
                  <span className="text-sm text-gray-600">{team.athleteCount} athletes</span>
                </div>
              ))}
              {(!teamStats || teamStats.length === 0) && (
                <p className="text-sm text-gray-500 text-center py-4">No teams found</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="bg-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Recent Measurements</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm font-medium text-gray-500 border-b border-gray-200">
                  <th className="pb-3">Athlete</th>
                  <th className="pb-3">Team</th>
                  <th className="pb-3">Metric</th>
                  <th className="pb-3">Value</th>
                  <th className="pb-3">Date</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {Array.isArray(recentMeasurements) && recentMeasurements.slice(0, 10).map((measurement: any) => (
                  <tr key={measurement.id} className="border-b border-gray-100">
                    <td className="py-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                          <span className="text-xs font-medium">
                            {measurement.user.firstName.charAt(0)}{measurement.user.lastName.charAt(0)}
                          </span>
                        </div>
                        <button
                          onClick={() => setLocation(`/athletes/${measurement.user.id}`)}
                          className="font-medium text-gray-900 hover:text-primary cursor-pointer text-left"
                        >
                          {measurement.user.fullName}
                        </button>
                      </div>
                    </td>
                    <td className="py-3 text-gray-600">
                      {measurement.user.teams && measurement.user.teams.length > 0
                        ? measurement.user.teams.length > 1
                          ? `${measurement.user.teams[0].name} (+${measurement.user.teams.length - 1})`
                          : measurement.user.teams[0].name
                        : "Independent"
                      }
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${getMetricColor(measurement.metric)}`}>
                        {getMetricDisplayName(measurement.metric)}
                      </span>
                    </td>
                    <td className="py-3 font-mono">
                      {measurement.metric === "FLY10_TIME" ?
                        formatFly10TimeWithSpeed(parseFloat(measurement.value)) :
                        `${measurement.value}${measurement.units}`
                      }
                    </td>
                    <td className="py-3 text-gray-600">{measurement.date}</td>
                  </tr>
                ))}
                {(!recentMeasurements || !Array.isArray(recentMeasurements) || recentMeasurements.length === 0) && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500">
                      No recent measurements found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}