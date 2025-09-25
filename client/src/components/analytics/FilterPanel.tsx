/**
 * Unified Filter Panel Component
 * Combines metrics, timeframe, grouping, and advanced filters with presets
 */

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import {
  Filter,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Settings,
  Users,
  Calendar,
  TrendingUp
} from 'lucide-react';

import { MetricsSelector } from './MetricsSelector';
import { TimeframeSelector } from './TimeframeSelector';

import type {
  AnalyticsFilters,
  MetricSelection,
  TimeframeConfig,
  AnalysisType
} from '@shared/analytics-types';


// Filter option definitions
interface FilterOption {
  key: keyof AnalyticsFilters;
  label: string;
  description: string;
  icon: React.ReactNode;
  type: 'multi-select' | 'checkbox' | 'range';
}

interface FilterPanelProps {
  // Current state
  filters: AnalyticsFilters;
  metrics: MetricSelection;
  timeframe: TimeframeConfig;
  analysisType: AnalysisType;

  // Available options
  availableTeams: Array<{ id: string; name: string }>;
  availableAthletes: Array<{
    id: string;
    name: string;
    teamName?: string;
    teams?: Array<{ id: string; name: string }>;
  }>;

  // Change handlers
  onFiltersChange: (filters: Partial<AnalyticsFilters>) => void;
  onMetricsChange: (metrics: Partial<MetricSelection>) => void;
  onTimeframeChange: (timeframe: Partial<TimeframeConfig>) => void;
  onReset: () => void;

  // Configuration
  effectiveOrganizationId?: string;
  showAdvancedFilters?: boolean;
  className?: string;
}

export function FilterPanel({
  filters,
  metrics,
  timeframe,
  analysisType,
  availableTeams,
  availableAthletes,
  onFiltersChange,
  onMetricsChange,
  onTimeframeChange,
  onReset,
  effectiveOrganizationId,
  showAdvancedFilters = true,
  className
}: FilterPanelProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  // Define filter options
  const filterOptions: FilterOption[] = [
    {
      key: 'teams',
      label: 'Team',
      description: 'Filter by team membership',
      icon: <Users className="h-4 w-4" />,
      type: 'multi-select'
    },
    {
      key: 'genders',
      label: 'Gender',
      description: 'Filter by athlete gender',
      icon: <Users className="h-4 w-4" />,
      type: 'checkbox'
    },
    {
      key: 'sports',
      label: 'Sport',
      description: 'Filter by sport participation',
      icon: <TrendingUp className="h-4 w-4" />,
      type: 'multi-select'
    },
    {
      key: 'positions',
      label: 'Position',
      description: 'Filter by player position',
      icon: <Settings className="h-4 w-4" />,
      type: 'multi-select'
    }
  ];


  // Handle filter changes
  const handleTeamsChange = (teamIds: string[]) => {
    onFiltersChange({ teams: teamIds.length > 0 ? teamIds : undefined });
  };

  const handleGendersChange = (genders: string[]) => {
    onFiltersChange({ genders: genders.length > 0 ? genders as ('Male' | 'Female' | 'Not Specified')[] : undefined });
  };

  const handleSportsChange = (sports: string[]) => {
    onFiltersChange({ sports: sports.length > 0 ? sports : undefined });
  };

  const handlePositionsChange = (positions: string[]) => {
    onFiltersChange({ positions: positions.length > 0 ? positions : undefined });
  };

  const handleBirthYearsChange = (birthYears: number[]) => {
    onFiltersChange({ birthYears: birthYears.length > 0 ? birthYears : undefined });
  };

  // Get active filter count for badge
  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.teams && filters.teams.length > 0) count++;
    if (filters.genders && filters.genders.length > 0) count++;
    if (filters.sports && filters.sports.length > 0) count++;
    if (filters.positions && filters.positions.length > 0) count++;
    if (filters.birthYears && filters.birthYears.length > 0) count++;
    return count;
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Core Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MetricsSelector
          metrics={metrics}
          onMetricsChange={onMetricsChange}
        />

        <TimeframeSelector
          timeframe={timeframe}
          onTimeframeChange={onTimeframeChange}
          analysisType={analysisType}
        />
      </div>

      {/* Grouping & Advanced Filters */}
      {showAdvancedFilters && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Grouping & Filters
                {getActiveFilterCount() > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {getActiveFilterCount()} active
                  </Badge>
                )}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={onReset}
                className="text-xs"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Direct Filters Section */}
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filters
                {getActiveFilterCount() > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {getActiveFilterCount()}
                  </Badge>
                )}
              </h4>
              <div className="space-y-4">
                {/* Gender Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Gender</label>
                  <div className="flex flex-wrap gap-2">
                    {['Male', 'Female', 'Not Specified'].map((gender) => (
                      <label key={gender} className="flex items-center space-x-2 cursor-pointer">
                        <Checkbox
                          checked={filters.genders?.includes(gender as any) || false}
                          onCheckedChange={(checked) => {
                            const currentGenders = filters.genders || [];
                            const newGenders = checked
                              ? [...currentGenders, gender as any]
                              : currentGenders.filter(g => g !== gender);
                            handleGendersChange(newGenders);
                          }}
                        />
                        <span className="text-sm">{gender}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Team Filter */}
                {availableTeams.length > 0 && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">Teams</label>
                    <Select
                      value={filters.teams?.length === 1 ? filters.teams[0] : 'multiple'}
                      onValueChange={(value) => {
                        if (value === 'all_teams') {
                          handleTeamsChange([]);
                        } else {
                          handleTeamsChange([value]);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={
                          !filters.teams?.length ? 'All teams' :
                          filters.teams.length === 1 ? availableTeams.find(t => t.id === filters.teams![0])?.name :
                          `${filters.teams.length} teams selected`
                        } />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all_teams">All teams</SelectItem>
                        {availableTeams.map(team => (
                          <SelectItem key={team.id} value={team.id}>
                            {team.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Advanced Filters (Collapsible) */}
            <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between">
                  <span className="font-medium">Advanced Filters</span>
                  {isAdvancedOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 mt-4">
                {/* Birth Years Multi-Select */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Birth Years</label>
                  <Select
                    value={filters.birthYears?.length === 1 ? filters.birthYears[0].toString() : 'multiple'}
                    onValueChange={(value) => {
                      if (value === 'all_years') {
                        handleBirthYearsChange([]);
                      } else {
                        handleBirthYearsChange([parseInt(value)]);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={
                        !filters.birthYears?.length ? 'All years' :
                        filters.birthYears.length === 1 ? filters.birthYears[0].toString() :
                        `${filters.birthYears.length} years selected`
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_years">All years</SelectItem>
                      {Array.from({ length: 25 }, (_, i) => 2010 - i).map(year => (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Sports Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Sports</label>
                  <Select
                    value={filters.sports?.length === 1 ? filters.sports[0] : 'multiple'}
                    onValueChange={(value) => {
                      if (value === 'all_sports') {
                        handleSportsChange([]);
                      } else {
                        handleSportsChange([value]);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={
                        !filters.sports?.length ? 'All sports' :
                        filters.sports.length === 1 ? filters.sports[0] :
                        `${filters.sports.length} sports selected`
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_sports">All sports</SelectItem>
                      {/* Common sports - in a real app, these would come from the database */}
                      {['Swimming', 'Track & Field', 'Basketball', 'Soccer', 'Tennis', 'Football', 'Baseball', 'Volleyball', 'Wrestling', 'Cross Country'].map(sport => (
                        <SelectItem key={sport} value={sport}>
                          {sport}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Positions Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Positions</label>
                  <Select
                    value={filters.positions?.length === 1 ? filters.positions[0] : 'multiple'}
                    onValueChange={(value) => {
                      if (value === 'all_positions') {
                        handlePositionsChange([]);
                      } else {
                        handlePositionsChange([value]);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={
                        !filters.positions?.length ? 'All positions' :
                        filters.positions.length === 1 ? filters.positions[0] :
                        `${filters.positions.length} positions selected`
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_positions">All positions</SelectItem>
                      {/* Common positions - in a real app, these would come from the database */}
                      {['Forward', 'Guard', 'Center', 'Midfielder', 'Defender', 'Striker', 'Goalkeeper', 'Sprinter', 'Distance Runner', 'Field Event', 'Swimmer', 'Other'].map(position => (
                        <SelectItem key={position} value={position}>
                          {position}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      )}
    </div>
  );
}