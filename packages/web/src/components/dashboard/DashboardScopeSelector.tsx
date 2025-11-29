import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Building2, Users, User } from 'lucide-react';
import type { DashboardScope } from '@/hooks/useDashboardScope';
import type { Team } from '@shared/schema';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
}

interface DashboardScopeSelectorProps {
  organizationId: string | null;
  organizationName: string | null;
  scope: DashboardScope;
  onScopeChange: (update: Partial<DashboardScope>) => void;
}

/**
 * Dropdown selector for switching dashboard scope between organization, team, and athlete views
 * Hierarchical: Must select team before selecting athlete
 */
export function DashboardScopeSelector({
  organizationId,
  organizationName,
  scope,
  onScopeChange,
}: DashboardScopeSelectorProps) {
  // Fetch teams for organization
  const { data: teams = [], isLoading: teamsLoading } = useQuery<Team[]>({
    queryKey: ['/api/teams', organizationId],
    queryFn: async () => {
      const response = await fetch(`/api/teams?organizationId=${organizationId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch teams');
      }
      return response.json();
    },
    enabled: !!organizationId,
  });

  // Fetch athletes for selected team
  const { data: athletes = [], isLoading: athletesLoading } = useQuery<User[]>({
    queryKey: ['/api/users', scope.teamId, 'athletes'],
    queryFn: async () => {
      const response = await fetch(`/api/users?teamId=${scope.teamId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch athletes');
      }
      return response.json();
    },
    enabled: !!scope.teamId && scope.view !== 'organization',
  });

  // Generate value for Select component
  const selectValue = (() => {
    if (scope.view === 'organization') {
      return 'organization';
    }
    if (scope.view === 'team' && scope.teamId) {
      return `team-${scope.teamId}`;
    }
    if (scope.view === 'athlete' && scope.athleteId) {
      return `athlete-${scope.athleteId}`;
    }
    return 'organization';
  })();

  // Handle selection change
  const handleValueChange = (value: string) => {
    if (value === 'organization') {
      onScopeChange({ view: 'organization' });
    } else if (value.startsWith('team-')) {
      const teamId = value.replace('team-', '');
      onScopeChange({ view: 'team', teamId });
    } else if (value.startsWith('athlete-')) {
      const athleteId = value.replace('athlete-', '');
      onScopeChange({ view: 'athlete', teamId: scope.teamId!, athleteId });
    }
  };

  // Get display label
  const getDisplayLabel = () => {
    if (!organizationId) {
      return 'Select an organization';
    }

    if (scope.view === 'organization') {
      return organizationName || 'Organization View';
    }

    if (scope.view === 'team' && scope.teamId) {
      const team = teams.find((t) => t.id === scope.teamId);
      return team?.name || 'Team View';
    }

    if (scope.view === 'athlete' && scope.athleteId) {
      const athlete = athletes.find((a) => a.id === scope.athleteId);
      return athlete?.fullName || 'Athlete View';
    }

    return 'Select scope';
  };

  if (!organizationId) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-600">
        <Building2 className="h-4 w-4" />
        <span>Select an organization</span>
      </div>
    );
  }

  return (
    <Select value={selectValue} onValueChange={handleValueChange}>
      <SelectTrigger className="w-[280px]" data-testid="dashboard-scope-selector">
        <SelectValue>
          <div className="flex items-center gap-2">
            {scope.view === 'organization' && <Building2 className="h-4 w-4" />}
            {scope.view === 'team' && <Users className="h-4 w-4" />}
            {scope.view === 'athlete' && <User className="h-4 w-4" />}
            <span>{getDisplayLabel()}</span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {/* Organization option */}
        <SelectItem value="organization">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span>All Teams - {organizationName}</span>
          </div>
        </SelectItem>

        {/* Teams */}
        {teams.length > 0 && (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Teams</SelectLabel>
              {teams.map((team) => (
                <SelectItem key={team.id} value={`team-${team.id}`}>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>{team.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        )}

        {/* Athletes (only shown when team is selected) */}
        {scope.teamId && athletes.length > 0 && (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Athletes</SelectLabel>
              {athletes.map((athlete) => (
                <SelectItem key={athlete.id} value={`athlete-${athlete.id}`}>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    <span>{athlete.fullName}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        )}
      </SelectContent>
    </Select>
  );
}
