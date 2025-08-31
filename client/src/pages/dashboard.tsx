import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Users, UsersRound, Clock, ArrowUp } from "lucide-react";
import PerformanceChart from "@/components/charts/performance-chart";
import { formatFly10TimeWithSpeed } from "@/lib/speed-utils";
import { getMetricDisplayName, getMetricColor } from "@/lib/metrics";
import { useAuth } from "@/lib/auth";

export default function Dashboard() {
  const { user, organizationContext } = useAuth();
  const [, setLocation] = useLocation();
  
  // Get user's primary role to check access
  const { data: userOrganizations } = useQuery({
    queryKey: ["/api/auth/me/organizations"],
    enabled: !!user?.id && !user?.isSiteAdmin,
  });
  
  // Use session role as primary source, fallback to organization role, then 'athlete'
  const primaryRole = user?.role || (Array.isArray(userOrganizations) && userOrganizations.length > 0 ? userOrganizations[0]?.role : 'athlete');
  const isSiteAdmin = user?.isSiteAdmin || false;
  
  // Redirect athletes away from organization dashboard
  useEffect(() => {
    if (!isSiteAdmin && primaryRole === "athlete") {
      const playerId = user?.playerId || user?.id;
      setLocation(`/athletes/${playerId}`);
    }
  }, [isSiteAdmin, primaryRole, user?.id, user?.playerId, setLocation]);
  
  // Don't render dashboard for athletes
  if (!isSiteAdmin && primaryRole === "athlete") {
    return null;
  }
  
  const { data: dashboardStats, isLoading } = useQuery({
    queryKey: ["/api/analytics/dashboard", organizationContext],
    queryFn: async () => {
      const url = organizationContext 
        ? `/api/analytics/dashboard?organizationId=${organizationContext}`
        : `/api/analytics/dashboard`;
      const response = await fetch(url);
      return response.json();
    }
  });

  const { data: recentMeasurements } = useQuery({
    queryKey: ["/api/measurements", organizationContext],
    queryFn: async () => {
      const url = organizationContext 
        ? `/api/measurements?organizationId=${organizationContext}`
        : `/api/measurements`;
      const response = await fetch(url);
      return response.json();
    }
  });
  
  // Get organization name for context indicator
  const { data: currentOrganization } = useQuery({
    queryKey: [`/api/organizations/${organizationContext}`],
    enabled: !!organizationContext,
    queryFn: async () => {
      const response = await fetch(`/api/organizations/${organizationContext}`);
      return response.json();
    }
  });

  const { data: teamStats } = useQuery({
    queryKey: ["/api/analytics/teams"],
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

  const stats = (dashboardStats as any) || {
    totalPlayers: 0,
    activeAthletes: 0,
    totalTeams: 0,
    bestFly10Today: null,
    bestVerticalToday: null,
  };

  return (
    <div className="p-6">
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="bg-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Athletes</p>
                <p className="text-3xl font-bold text-gray-900" data-testid="stat-active-athletes">
                  {stats.activeAthletes}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {stats.totalPlayers} total players
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

        <Card className="bg-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Best Fly-10 Today</p>
                <p className="text-3xl font-bold text-gray-900" data-testid="stat-best-fly10">
                  {stats.bestFly10Today ? formatFly10TimeWithSpeed(parseFloat(stats.bestFly10Today.value)) : "N/A"}
                </p>
                <p className="text-sm text-gray-500 mt-1" data-testid="stat-best-fly10-athlete">
                  {stats.bestFly10Today?.playerName || "No data today"}
                </p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                <Clock className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Best Vertical Today</p>
                <p className="text-3xl font-bold text-gray-900" data-testid="stat-best-vertical">
                  {stats.bestVerticalToday ? `${stats.bestVerticalToday.value}in` : "N/A"}
                </p>
                <p className="text-sm text-gray-500 mt-1" data-testid="stat-best-vertical-player">
                  {stats.bestVerticalToday?.playerName || "No data today"}
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <ArrowUp className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
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
              {(teamStats as any)?.slice(0, 5).map((team: any, index: number) => (
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
                  <span className="text-sm text-gray-600">{team.playerCount} players</span>
                </div>
              ))}
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
                  <th className="pb-3">Player</th>
                  <th className="pb-3">Team</th>
                  <th className="pb-3">Metric</th>
                  <th className="pb-3">Value</th>
                  <th className="pb-3">Date</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {(recentMeasurements as any)?.slice(0, 10).map((measurement: any) => (
                  <tr key={measurement.id} className="border-b border-gray-100">
                    <td className="py-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                          <span className="text-xs font-medium">
                            {measurement.player.firstName.charAt(0)}{measurement.player.lastName.charAt(0)}
                          </span>
                        </div>
                        <button 
                          onClick={() => setLocation(`/athletes/${measurement.player.id}`)}
                          className="font-medium text-gray-900 hover:text-primary cursor-pointer text-left"
                        >
                          {measurement.player.fullName}
                        </button>
                      </div>
                    </td>
                    <td className="py-3 text-gray-600">
                      {measurement.player.teams && measurement.player.teams.length > 0 
                        ? measurement.player.teams.length > 1 
                          ? `${measurement.player.teams[0].name} (+${measurement.player.teams.length - 1})`
                          : measurement.player.teams[0].name
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
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
