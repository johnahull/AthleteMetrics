import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw } from 'lucide-react';
import { useWellnessDashboard } from '@/hooks/use-wellness-dashboard';
import { useTeams } from '@/hooks/use-teams';
import TeamStatusCard from '@/components/wellness/TeamStatusCard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface WellnessDashboardProps {
  organizationId: string;
}

export default function WellnessDashboard({ organizationId }: WellnessDashboardProps) {
  const { user } = useAuth();

  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const [selectedDate, setSelectedDate] = useState<string>(getTodayDate());
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);

  // Fetch teams for the organization
  const { data: teams, isLoading: teamsLoading } = useTeams({
    organizationId,
  });

  // Fetch dashboard data
  const {
    data: dashboardData,
    isLoading,
    error,
    refetch,
  } = useWellnessDashboard({
    organizationId,
    date: selectedDate,
    teamIds: selectedTeamIds.length > 0 ? selectedTeamIds : undefined,
  });

  const handleTeamToggle = (teamId: string) => {
    setSelectedTeamIds((prev) =>
      prev.includes(teamId)
        ? prev.filter((id) => id !== teamId)
        : [...prev, teamId]
    );
  };

  const handleClearFilters = () => {
    setSelectedDate(getTodayDate());
    setSelectedTeamIds([]);
  };

  if (!organizationId) {
    return (
      <div className="p-6">
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="pt-6">
            <p className="text-yellow-800">
              Please select an organization to view the wellness dashboard.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters Section */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            {/* Date Picker */}
            <div className="flex-1">
              <Label htmlFor="date-filter">Date</Label>
              <Input
                id="date-filter"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                max={getTodayDate()}
                className="mt-1"
              />
            </div>

            {/* Team Multi-Select */}
            <div className="flex-1">
              <Label htmlFor="team-filter">Teams</Label>
              <Select
                value={selectedTeamIds.length > 0 ? selectedTeamIds[0] : ''}
                onValueChange={(teamId) => {
                  if (teamId) handleTeamToggle(teamId);
                }}
              >
                <SelectTrigger id="team-filter" className="mt-1">
                  <SelectValue placeholder={
                    selectedTeamIds.length === 0
                      ? 'All teams'
                      : `${selectedTeamIds.length} team(s) selected`
                  } />
                </SelectTrigger>
                <SelectContent>
                  {teamsLoading ? (
                    <SelectItem value="loading" disabled>
                      Loading teams...
                    </SelectItem>
                  ) : teams && teams.length > 0 ? (
                    teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-teams" disabled>
                      No teams available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {selectedTeamIds.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedTeamIds.map((teamId) => {
                    const team = teams?.find((t) => t.id === teamId);
                    return team ? (
                      <span
                        key={teamId}
                        className="inline-flex items-center px-2 py-1 rounded-md bg-blue-100 text-blue-800 text-xs"
                      >
                        {team.name}
                        <button
                          onClick={() => handleTeamToggle(teamId)}
                          className="ml-1 hover:text-blue-900"
                        >
                          ×
                        </button>
                      </span>
                    ) : null;
                  })}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearFilters}
              >
                Clear Filters
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dashboard Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-96" />
          ))}
        </div>
      ) : error ? (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <p className="text-red-800">
                Failed to load dashboard data: {error.message}
              </p>
              <Button onClick={() => refetch()} variant="outline">
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : dashboardData && dashboardData.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {dashboardData.map((teamData) => (
            <TeamStatusCard
              key={teamData.teamId}
              {...teamData}
            />
          ))}
        </div>
      ) : (
        <Card className="bg-gray-50 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-gray-600 text-center mb-4">
              {selectedTeamIds.length > 0
                ? 'No data available for the selected teams and date.'
                : 'No teams have submitted wellness data for this date.'}
            </p>
            <p className="text-sm text-gray-500 text-center">
              Try selecting a different date or clearing the team filter.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
