import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Users, User, X, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

// Types
interface Team {
  id: string;
  name: string;
  level?: string;
  athleteCount?: number;
}

interface Athlete {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  teams?: Array<{ id: string; name: string }>;
  positions?: string[];
  gender?: 'Male' | 'Female' | 'Not Specified';
}

interface TeamAthleteSelectorProps {
  organizationId: string;
  selectedAthleteIds: string[];
  onSelectionChange: (athleteIds: string[]) => void;
  className?: string;
}

// API fetch functions
async function fetchTeams(organizationId: string): Promise<Team[]> {
  const response = await fetch(`/api/teams?organizationId=${organizationId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch teams');
  }
  return response.json();
}

async function fetchAthletes(organizationId: string): Promise<Athlete[]> {
  const response = await fetch(`/api/athletes?organizationId=${organizationId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch athletes');
  }
  return response.json();
}

export function TeamAthleteSelector({
  organizationId,
  selectedAthleteIds,
  onSelectionChange,
  className
}: TeamAthleteSelectorProps) {
  // Local state
  const [searchTerm, setSearchTerm] = useState('');
  const [positionFilter, setPositionFilter] = useState<string>('all');
  const [genderFilter, setGenderFilter] = useState<string>('all');

  // Fetch teams and athletes
  const { data: teams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ['teams', organizationId],
    queryFn: () => fetchTeams(organizationId),
    enabled: !!organizationId,
  });

  const { data: athletes = [], isLoading: athletesLoading } = useQuery({
    queryKey: ['athletes', organizationId],
    queryFn: () => fetchAthletes(organizationId),
    enabled: !!organizationId,
  });

  // Compute available positions and genders
  const availablePositions = useMemo(() => {
    const positions = new Set<string>();
    athletes.forEach(athlete => {
      athlete.positions?.forEach(pos => positions.add(pos));
    });
    return Array.from(positions).sort();
  }, [athletes]);

  const availableGenders = useMemo(() => {
    const genders = new Set<string>();
    athletes.forEach(athlete => {
      if (athlete.gender) genders.add(athlete.gender);
    });
    return Array.from(genders).sort();
  }, [athletes]);

  // Filter athletes
  const filteredAthletes = useMemo(() => {
    return athletes.filter(athlete => {
      // Search filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesName = athlete.fullName.toLowerCase().includes(term);
        const matchesTeam = athlete.teams?.some(team =>
          team.name.toLowerCase().includes(term)
        );
        if (!matchesName && !matchesTeam) return false;
      }

      // Position filter
      if (positionFilter !== 'all') {
        if (!athlete.positions?.includes(positionFilter)) return false;
      }

      // Gender filter
      if (genderFilter !== 'all') {
        if (athlete.gender !== genderFilter) return false;
      }

      return true;
    });
  }, [athletes, searchTerm, positionFilter, genderFilter]);

  // Get athletes by team
  const athletesByTeam = useMemo(() => {
    const map = new Map<string, string[]>();

    athletes.forEach(athlete => {
      if (athlete.teams && athlete.teams.length > 0) {
        athlete.teams.forEach(team => {
          const athleteIds = map.get(team.id) || [];
          athleteIds.push(athlete.id);
          map.set(team.id, athleteIds);
        });
      }
    });

    return map;
  }, [athletes]);

  // Selection handlers
  const toggleTeam = (teamId: string) => {
    const teamAthleteIds = athletesByTeam.get(teamId) || [];
    const allSelected = teamAthleteIds.every(id => selectedAthleteIds.includes(id));

    if (allSelected) {
      // Deselect all athletes from this team
      onSelectionChange(selectedAthleteIds.filter(id => !teamAthleteIds.includes(id)));
    } else {
      // Select all athletes from this team
      const newSelection = Array.from(new Set([...selectedAthleteIds, ...teamAthleteIds]));
      onSelectionChange(newSelection);
    }
  };

  const toggleAthlete = (athleteId: string) => {
    if (selectedAthleteIds.includes(athleteId)) {
      onSelectionChange(selectedAthleteIds.filter(id => id !== athleteId));
    } else {
      onSelectionChange([...selectedAthleteIds, athleteId]);
    }
  };

  const removeAthlete = (athleteId: string) => {
    onSelectionChange(selectedAthleteIds.filter(id => id !== athleteId));
  };

  const selectAll = () => {
    onSelectionChange(filteredAthletes.map(a => a.id));
  };

  const clearAll = () => {
    onSelectionChange([]);
  };

  // Check if a team is fully selected
  const isTeamSelected = (teamId: string): boolean => {
    const teamAthleteIds = athletesByTeam.get(teamId) || [];
    if (teamAthleteIds.length === 0) return false;
    return teamAthleteIds.every(id => selectedAthleteIds.includes(id));
  };

  const isTeamPartiallySelected = (teamId: string): boolean => {
    const teamAthleteIds = athletesByTeam.get(teamId) || [];
    if (teamAthleteIds.length === 0) return false;
    const selectedCount = teamAthleteIds.filter(id => selectedAthleteIds.includes(id)).length;
    return selectedCount > 0 && selectedCount < teamAthleteIds.length;
  };

  // Get selected athletes for display
  const selectedAthletes = useMemo(() => {
    return athletes.filter(a => selectedAthleteIds.includes(a.id));
  }, [athletes, selectedAthleteIds]);

  const isLoading = teamsLoading || athletesLoading;

  return (
    <div className={cn('grid grid-cols-1 lg:grid-cols-2 gap-6', className)}>
      {/* Left Panel: Teams and Athletes */}
      <Card className="shadow-sm border-2">
        <CardHeader className="pb-4 border-b bg-muted/30">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Select by Team or Individual
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {/* Search and Filters */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search athletes or teams..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-10"
              />
            </div>

            {/* Filters Row */}
            {(availablePositions.length > 0 || availableGenders.length > 0) && (
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Filter className="h-4 w-4" />
                  <span className="font-medium">Filters:</span>
                </div>
                {availablePositions.length > 0 && (
                  <Select value={positionFilter} onValueChange={setPositionFilter}>
                    <SelectTrigger className="flex-1 min-w-[140px] h-9">
                      <SelectValue placeholder="Position" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Positions</SelectItem>
                      {availablePositions.map(pos => (
                        <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {availableGenders.length > 0 && (
                  <Select value={genderFilter} onValueChange={setGenderFilter}>
                    <SelectTrigger className="flex-1 min-w-[140px] h-9">
                      <SelectValue placeholder="Gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Genders</SelectItem>
                      {availableGenders.map(gender => (
                        <SelectItem key={gender} value={gender}>{gender}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Quick Actions */}
            <div className="flex gap-2 pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={selectAll}
                disabled={isLoading || filteredAthletes.length === 0}
                className="flex-1 h-9"
              >
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearAll}
                disabled={isLoading || selectedAthleteIds.length === 0}
                className="flex-1 h-9"
              >
                Clear All
              </Button>
            </div>
          </div>

          {/* Teams and Athletes List */}
          <ScrollArea className="h-[400px] pr-4">
            {isLoading ? (
              <div className="space-y-4">
                {/* Loading skeletons */}
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center space-x-2 p-2">
                      <Skeleton className="h-4 w-4 rounded" />
                      <Skeleton className="h-4 w-4" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center space-x-2 p-2">
                      <Skeleton className="h-4 w-4 rounded" />
                      <Skeleton className="h-4 w-4" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Teams Section */}
                {teams.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">
                      Teams
                    </h4>
                    <div className="space-y-1">
                      {teams.map(team => {
                        const teamAthleteCount = athletesByTeam.get(team.id)?.length || 0;
                        const isSelected = isTeamSelected(team.id);
                        const isPartial = isTeamPartiallySelected(team.id);

                        return (
                          <div
                            key={team.id}
                            className={cn(
                              "flex items-center space-x-3 p-3 rounded-lg transition-all duration-200",
                              "hover:bg-accent hover:shadow-sm cursor-pointer border border-transparent",
                              (isSelected || isPartial) && "bg-primary/5 border-primary/20"
                            )}
                          >
                            <Checkbox
                              id={`team-${team.id}`}
                              checked={isSelected}
                              onCheckedChange={() => toggleTeam(team.id)}
                              className={cn(
                                "data-[state=checked]:bg-primary data-[state=checked]:border-primary",
                                isPartial && "data-[state=checked]:bg-primary/50"
                              )}
                            />
                            <Users className={cn(
                              "h-5 w-5 flex-shrink-0 transition-colors",
                              (isSelected || isPartial) ? "text-primary" : "text-muted-foreground"
                            )} />
                            <label
                              htmlFor={`team-${team.id}`}
                              className="flex-1 text-sm cursor-pointer min-w-0"
                            >
                              <div className="font-medium truncate">{team.name}</div>
                              <div className="text-xs text-muted-foreground flex items-center gap-1">
                                <Badge variant="outline" className="h-5 px-1.5 text-xs">
                                  {teamAthleteCount} athlete{teamAthleteCount !== 1 ? 's' : ''}
                                </Badge>
                                {team.level && (
                                  <span className="text-muted-foreground">• {team.level}</span>
                                )}
                              </div>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Individual Athletes Section */}
                {filteredAthletes.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Individual Athletes
                      </h4>
                      <Badge variant="secondary" className="h-5 px-2 text-xs">
                        {filteredAthletes.length}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      {filteredAthletes.map(athlete => {
                        const isSelected = selectedAthleteIds.includes(athlete.id);

                        return (
                          <div
                            key={athlete.id}
                            className={cn(
                              "flex items-center space-x-3 p-3 rounded-lg transition-all duration-200",
                              "hover:bg-accent hover:shadow-sm cursor-pointer border border-transparent",
                              isSelected && "bg-primary/5 border-primary/20"
                            )}
                          >
                            <Checkbox
                              id={`athlete-${athlete.id}`}
                              checked={isSelected}
                              onCheckedChange={() => toggleAthlete(athlete.id)}
                              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                            />
                            <User className={cn(
                              "h-5 w-5 flex-shrink-0 transition-colors",
                              isSelected ? "text-primary" : "text-muted-foreground"
                            )} />
                            <label
                              htmlFor={`athlete-${athlete.id}`}
                              className="flex-1 text-sm cursor-pointer min-w-0"
                            >
                              <div className="font-medium truncate">{athlete.fullName}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {athlete.teams && athlete.teams.length > 0
                                  ? athlete.teams.map(t => t.name).join(', ')
                                  : 'No team'}
                                {athlete.positions && athlete.positions.length > 0 &&
                                  ` • ${athlete.positions.join(', ')}`}
                              </div>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!isLoading && teams.length === 0 && filteredAthletes.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
                    <p className="text-sm font-medium text-muted-foreground mb-1">
                      {searchTerm.trim() || positionFilter !== 'all' || genderFilter !== 'all'
                        ? 'No athletes found'
                        : 'No athletes available'}
                    </p>
                    {(searchTerm.trim() || positionFilter !== 'all' || genderFilter !== 'all') && (
                      <p className="text-xs text-muted-foreground">
                        Try adjusting your filters or search term
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Right Panel: Selected Athletes */}
      <Card className="shadow-sm border-2">
        <CardHeader className="pb-4 border-b bg-muted/30">
          <CardTitle className="text-lg flex items-center justify-between">
            <span className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Selected Athletes
            </span>
            <Badge variant="secondary" className="text-base px-3 py-1">
              {selectedAthletes.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <ScrollArea className="h-[500px] pr-4">
            {selectedAthletes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <div className="rounded-full bg-muted/50 p-4 mb-4">
                  <User className="h-10 w-10 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  No athletes selected
                </p>
                <p className="text-xs text-muted-foreground max-w-[200px]">
                  Select teams or individual athletes from the left panel
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {selectedAthletes.map(athlete => (
                  <div
                    key={athlete.id}
                    className="group flex items-start gap-3 p-4 bg-gradient-to-r from-accent/50 to-accent/30 rounded-lg hover:from-accent hover:to-accent/50 transition-all duration-200 border border-transparent hover:border-accent-foreground/10 hover:shadow-md"
                  >
                    <div className="flex-shrink-0 pt-0.5">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="font-medium truncate text-sm">
                        {athlete.fullName}
                      </div>
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {athlete.teams && athlete.teams.length > 0 ? (
                          athlete.teams.map((team, idx) => (
                            <Badge
                              key={idx}
                              variant="outline"
                              className="h-5 px-2 text-xs bg-background/50"
                            >
                              {team.name}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="outline" className="h-5 px-2 text-xs text-muted-foreground bg-background/50">
                            No team
                          </Badge>
                        )}
                        {athlete.positions && athlete.positions.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {athlete.positions.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAthlete(athlete.id)}
                      aria-label={`Remove ${athlete.fullName}`}
                      className="h-8 w-8 p-0 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all hover:bg-destructive/10 hover:text-destructive focus:opacity-100"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

export default TeamAthleteSelector;
