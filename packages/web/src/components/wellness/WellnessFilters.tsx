import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { TeamAthleteSelector } from '@/components/ui/team-athlete-selector';

interface WellnessFiltersProps {
  filters: {
    dateFrom: string;
    dateTo: string;
    teamIds: string[];
    athleteIds: string[];
    questionIds: string[];
  };
  onFilterChange: (filters: any) => void;
  onClearFilters: () => void;
  organizationId: string;
}

/**
 * Filter panel for wellness analytics
 * Supports filtering by date range, teams, athletes, and specific questions
 */
export function WellnessFilters({
  filters,
  onFilterChange,
  onClearFilters,
  organizationId,
}: WellnessFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Fetch teams for team selector
  const { data: teams = [] } = useQuery({
    queryKey: ['/api/teams', organizationId],
    queryFn: async () => {
      const response = await fetch(`/api/teams?organizationId=${organizationId}`, {
        credentials: 'include',
      });
      return response.json();
    },
    enabled: !!organizationId,
  });

  // Count active filters
  const activeFilterCount =
    (filters.teamIds.length > 0 ? 1 : 0) +
    (filters.athleteIds.length > 0 ? 1 : 0) +
    (filters.questionIds.length > 0 ? 1 : 0) +
    1; // Date range is always active

  const hasFilters = activeFilterCount > 1; // More than just default date range

  return (
    <Card>
      <CardContent className="pt-6">
        {/* Mobile toggle button */}
        <div className="md:hidden mb-4">
          <Button
            variant="outline"
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-between"
            data-testid="button-toggle-filters"
          >
            <span>Filters ({activeFilterCount})</span>
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>

        {/* Filters content (collapsible on mobile) */}
        <div className={`space-y-4 ${!isExpanded ? 'hidden md:block' : ''}`}>
          {/* Date Range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">From Date</label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => onFilterChange({ dateFrom: e.target.value })}
                data-testid="input-date-from"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">To Date</label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => onFilterChange({ dateTo: e.target.value })}
                data-testid="input-date-to"
              />
            </div>
          </div>

          {/* Team Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Team</label>
            <Select
              value={filters.teamIds[0] || 'all'}
              onValueChange={(value) =>
                onFilterChange({ teamIds: value === 'all' ? [] : [value] })
              }
            >
              <SelectTrigger data-testid="select-team">
                <SelectValue placeholder="All Teams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                {teams.map((team: any) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Athlete Multi-Select */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Athletes
              {filters.athleteIds.length > 0 && (
                <span data-testid="athletes-selected-count" className="ml-2 text-xs text-gray-500">
                  ({filters.athleteIds.length} selected)
                </span>
              )}
            </label>
            <TeamAthleteSelector
              organizationId={organizationId}
              selectedAthleteIds={filters.athleteIds}
              onSelectionChange={(athleteIds: string[]) => onFilterChange({ athleteIds })}
              data-testid="select-athletes"
            />
          </div>

          {/* Active Filters Display */}
          {hasFilters && (
            <div className="flex items-center flex-wrap gap-2 pt-4 border-t" data-testid="active-filters">
              <span className="text-sm font-medium text-gray-700">Active filters:</span>

              {/* Date range badge */}
              <Badge variant="secondary" className="flex items-center gap-1">
                <span>
                  {new Date(filters.dateFrom).toLocaleDateString()} -{' '}
                  {new Date(filters.dateTo).toLocaleDateString()}
                </span>
              </Badge>

              {/* Team badge */}
              {filters.teamIds.length > 0 && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <span>
                    {teams.find((t: any) => t.id === filters.teamIds[0])?.name || 'Team'}
                  </span>
                  <button
                    onClick={() => onFilterChange({ teamIds: [] })}
                    className="hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}

              {/* Athletes badge */}
              {filters.athleteIds.length > 0 && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <span>{filters.athleteIds.length} athlete(s)</span>
                  <button
                    onClick={() => onFilterChange({ athleteIds: [] })}
                    className="hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}

              {/* Clear all button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearFilters}
                className="text-gray-600 hover:text-gray-800"
                data-testid="button-clear-filters"
              >
                Clear all
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
