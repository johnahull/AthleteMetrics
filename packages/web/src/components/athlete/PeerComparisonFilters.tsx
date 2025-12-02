/**
 * PeerComparisonFilters Component
 *
 * Filter controls for the peer comparison page.
 * Follows the WellnessFilters pattern with mobile Sheet and desktop Card layouts.
 *
 * Filters:
 * - Scope (Team/Global) - toggle for comparison scope
 * - Team selection (multi-select, only shown when scope is Team)
 * - Age Range (dual number inputs)
 * - Gender (select dropdown)
 * - Sport (select dropdown)
 */

import { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { X, SlidersHorizontal, Users, Globe } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import type { PeerFilterCriteria } from '@/hooks/usePeerComparison';

export type ComparisonScope = 'global' | 'team';

export interface PeerComparisonFiltersProps {
  filters: PeerFilterCriteria;
  scope: ComparisonScope;
  onFilterChange: (filters: Partial<PeerFilterCriteria>) => void;
  onScopeChange: (scope: ComparisonScope) => void;
  onClearFilters: () => void;
  athleteAge?: number;  // For default age range
  athleteGender?: 'Male' | 'Female';  // For default gender
}

/**
 * Hook to fetch athlete's teams
 */
function useAthleteTeams(athleteId: string | undefined) {
  return useQuery({
    queryKey: ['/api/athletes/:id/active-teams', athleteId],
    queryFn: async () => {
      if (!athleteId) return [];
      const response = await fetch(`/api/athletes/${athleteId}/active-teams`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      const data = await response.json();
      // Transform API response to expected format (teamId -> id, teamName -> name)
      return data.map((team: any) => ({
        id: team.teamId,
        name: team.teamName,
        organizationId: team.organizationId,
        organizationName: team.organizationName,
      }));
    },
    enabled: !!athleteId,
  });
}

/**
 * Hook to fetch available sports
 */
function useSports() {
  return useQuery({
    queryKey: ['/api/sports'],
    queryFn: async () => {
      const response = await fetch('/api/sports', {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
  });
}

export function PeerComparisonFilters({
  filters,
  scope,
  onFilterChange,
  onScopeChange,
  onClearFilters,
  athleteAge,
  athleteGender,
}: PeerComparisonFiltersProps) {
  const { user } = useAuth();
  // For athlete users, use their athleteId; otherwise use their user id
  const athleteId = user?.athleteId || user?.id;
  const { data: teams = [] } = useAthleteTeams(athleteId);
  const { data: sports = [] } = useSports();
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (scope === 'team' && filters.teamIds && filters.teamIds.length > 0) count++;
    if (filters.ageRange) count++;
    if (filters.gender) count++;
    if (filters.sports && filters.sports.length > 0) count++;
    return count;
  }, [scope, filters]);

  const hasFilters = activeFilterCount > 0;

  // Handle age range change
  const handleAgeMinChange = useCallback((value: string) => {
    const min = parseInt(value, 10);
    if (!isNaN(min)) {
      const max = filters.ageRange?.[1] ?? (athleteAge ? athleteAge + 3 : 25);
      onFilterChange({ ageRange: [min, max] });
    }
  }, [filters.ageRange, athleteAge, onFilterChange]);

  const handleAgeMaxChange = useCallback((value: string) => {
    const max = parseInt(value, 10);
    if (!isNaN(max)) {
      const min = filters.ageRange?.[0] ?? (athleteAge ? athleteAge - 3 : 15);
      onFilterChange({ ageRange: [min, max] });
    }
  }, [filters.ageRange, athleteAge, onFilterChange]);

  // Handle team selection (multi-select with checkboxes)
  const handleTeamToggle = useCallback((teamId: string, checked: boolean) => {
    const currentTeams = filters.teamIds || [];
    if (checked) {
      onFilterChange({ teamIds: [...currentTeams, teamId] });
    } else {
      onFilterChange({ teamIds: currentTeams.filter(id => id !== teamId) });
    }
  }, [filters.teamIds, onFilterChange]);

  const FiltersContent = () => (
    <div className="space-y-6">
      {/* Comparison Scope Toggle */}
      <div>
        <Label className="text-sm font-medium text-gray-700 mb-2 block">Comparison Scope</Label>
        <Tabs value={scope} onValueChange={(v) => onScopeChange(v as ComparisonScope)} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="global" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Global
            </TabsTrigger>
            <TabsTrigger value="team" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              My Team(s)
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Team Selection (only shown when scope is 'team') */}
      {scope === 'team' && teams.length > 0 && (
        <div>
          <Label className="text-sm font-medium text-gray-700 mb-2 block">Select Teams</Label>
          <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
            {teams.map((team: any) => (
              <div key={team.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`team-${team.id}`}
                  checked={filters.teamIds?.includes(team.id) || false}
                  onCheckedChange={(checked) => handleTeamToggle(team.id, checked as boolean)}
                />
                <label
                  htmlFor={`team-${team.id}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  {team.name}
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Age Range */}
      <div>
        <Label className="text-sm font-medium text-gray-700 mb-2 block">Age Range</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={10}
            max={99}
            value={filters.ageRange?.[0] ?? ''}
            onChange={(e) => handleAgeMinChange(e.target.value)}
            placeholder={athleteAge ? String(athleteAge - 3) : '15'}
            className="w-20"
            data-testid="input-age-min"
          />
          <span className="text-gray-500">to</span>
          <Input
            type="number"
            min={10}
            max={99}
            value={filters.ageRange?.[1] ?? ''}
            onChange={(e) => handleAgeMaxChange(e.target.value)}
            placeholder={athleteAge ? String(athleteAge + 3) : '25'}
            className="w-20"
            data-testid="input-age-max"
          />
        </div>
      </div>

      {/* Gender Filter */}
      <div>
        <Label className="text-sm font-medium text-gray-700 mb-2 block">Gender</Label>
        <Select
          value={filters.gender || 'all'}
          onValueChange={(value) => onFilterChange({ gender: value === 'all' ? undefined : value as 'Male' | 'Female' })}
        >
          <SelectTrigger data-testid="select-gender">
            <SelectValue placeholder="All Genders" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Genders</SelectItem>
            <SelectItem value="Male">Male</SelectItem>
            <SelectItem value="Female">Female</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Sport Filter */}
      <div>
        <Label className="text-sm font-medium text-gray-700 mb-2 block">Sport</Label>
        <Select
          value={filters.sports?.[0] || 'all'}
          onValueChange={(value) => onFilterChange({ sports: value === 'all' ? undefined : [value] })}
        >
          <SelectTrigger data-testid="select-sport">
            <SelectValue placeholder="All Sports" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sports</SelectItem>
            {sports.map((sport: any) => (
              <SelectItem key={sport.id || sport.code} value={sport.code || sport.name}>
                {sport.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Active Filters Display */}
      {hasFilters && (
        <div className="flex items-center flex-wrap gap-2 pt-4 border-t" data-testid="active-filters">
          <span className="text-sm font-medium text-gray-700">Active:</span>

          {/* Team filter badge */}
          {scope === 'team' && filters.teamIds && filters.teamIds.length > 0 && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <span>{filters.teamIds.length} team(s)</span>
              <button
                onClick={() => onFilterChange({ teamIds: [] })}
                className="hover:text-red-600"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {/* Age range badge */}
          {filters.ageRange && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <span>Age {filters.ageRange[0]}-{filters.ageRange[1]}</span>
              <button
                onClick={() => onFilterChange({ ageRange: undefined })}
                className="hover:text-red-600"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {/* Gender badge */}
          {filters.gender && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <span>{filters.gender}</span>
              <button
                onClick={() => onFilterChange({ gender: undefined })}
                className="hover:text-red-600"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {/* Sport badge */}
          {filters.sports && filters.sports.length > 0 && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <span>{filters.sports[0]}</span>
              <button
                onClick={() => onFilterChange({ sports: undefined })}
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
  );

  return (
    <>
      {/* Mobile: Sheet/Drawer Pattern */}
      <div className="lg:hidden">
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              className="w-full flex items-center justify-between min-h-[44px]"
              data-testid="button-toggle-filters"
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                Filters
              </span>
              {hasFilters && (
                <Badge variant="secondary" className="ml-2">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[85vh]">
            <SheetHeader>
              <SheetTitle>Filter Peer Comparisons</SheetTitle>
            </SheetHeader>
            <div className="mt-6 overflow-y-auto h-[calc(100%-60px)]">
              <FiltersContent />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop: Sidebar Card Pattern */}
      <Card className="hidden lg:block">
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FiltersContent />
        </CardContent>
      </Card>
    </>
  );
}
