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
  AnalysisType,
  GroupingDimensions
} from '@shared/analytics-types';


// Grouping option definitions
interface GroupingOption {
  key: keyof GroupingDimensions;
  label: string;
  description: string;
  icon: React.ReactNode;
  allowMultiple: boolean;
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
  const [selectedGrouping, setSelectedGrouping] = useState<string[]>([]);

  // Define grouping options
  const groupingOptions: GroupingOption[] = [
    {
      key: 'teams',
      label: 'Team',
      description: 'Group athletes by team',
      icon: <Users className="h-4 w-4" />,
      allowMultiple: true
    },
    {
      key: 'birthYears',
      label: 'Age Group',
      description: 'Group by birth year ranges',
      icon: <Calendar className="h-4 w-4" />,
      allowMultiple: false
    },
    {
      key: 'genders',
      label: 'Gender',
      description: 'Group by athlete gender',
      icon: <Users className="h-4 w-4" />,
      allowMultiple: false
    },
    {
      key: 'sports',
      label: 'Sport',
      description: 'Group by primary sport',
      icon: <TrendingUp className="h-4 w-4" />,
      allowMultiple: true
    },
    {
      key: 'positions',
      label: 'Position',
      description: 'Group by player position',
      icon: <Settings className="h-4 w-4" />,
      allowMultiple: true
    }
  ];


  // Handle grouping changes
  const handleGroupingChange = (groupingKey: string, checked: boolean) => {
    let newGrouping: string[];

    if (checked) {
      newGrouping = [...selectedGrouping, groupingKey];
    } else {
      newGrouping = selectedGrouping.filter(key => key !== groupingKey);
    }

    setSelectedGrouping(newGrouping);

    // Convert to filters format and apply
    const groupingFilters: Partial<AnalyticsFilters> = {};
    // TODO: Convert grouping selections to appropriate filter values
    // This would need to be implemented based on the specific grouping logic
    onFiltersChange(groupingFilters);
  };

  // Get active filter count for badge
  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.teams && filters.teams.length > 0) count++;
    if (filters.birthYearFrom || filters.birthYearTo) count++;
    if (filters.genders && filters.genders.length > 0) count++;
    if (filters.sports && filters.sports.length > 0) count++;
    if (filters.positions && filters.positions.length > 0) count++;
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
            {/* Smart Grouping Section */}
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Group By
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {groupingOptions.map(option => (
                  <div key={option.key} className="flex items-start space-x-2">
                    <Checkbox
                      id={`group-${option.key}`}
                      checked={selectedGrouping.includes(option.key)}
                      onCheckedChange={(checked) =>
                        handleGroupingChange(option.key, checked as boolean)
                      }
                    />
                    <label
                      htmlFor={`group-${option.key}`}
                      className="text-sm cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        {option.icon}
                        <span className="font-medium">{option.label}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {option.description}
                      </div>
                    </label>
                  </div>
                ))}
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
                {/* Team Selection */}
                {availableTeams.length > 0 && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">Teams</label>
                    <Select
                      value={filters.teams?.[0] || 'all_teams'}
                      onValueChange={(value) =>
                        onFiltersChange({ teams: value === 'all_teams' ? [] : [value] })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All teams" />
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

                {/* Age Range */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Min Birth Year</label>
                    <Select
                      value={filters.birthYearFrom?.toString() || 'any_year'}
                      onValueChange={(value) =>
                        onFiltersChange({
                          birthYearFrom: value === 'any_year' ? undefined : parseInt(value)
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any_year">Any</SelectItem>
                        {Array.from({ length: 20 }, (_, i) => 2010 - i).map(year => (
                          <SelectItem key={year} value={year.toString()}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Max Birth Year</label>
                    <Select
                      value={filters.birthYearTo?.toString() || 'any_year'}
                      onValueChange={(value) =>
                        onFiltersChange({
                          birthYearTo: value === 'any_year' ? undefined : parseInt(value)
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any_year">Any</SelectItem>
                        {Array.from({ length: 20 }, (_, i) => 2010 - i).map(year => (
                          <SelectItem key={year} value={year.toString()}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Gender Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Gender</label>
                  <div className="flex gap-4">
                    {['Male', 'Female', 'Not Specified'].map(gender => (
                      <div key={gender} className="flex items-center space-x-2">
                        <Checkbox
                          id={`gender-${gender}`}
                          checked={filters.genders?.includes(gender as any) || false}
                          onCheckedChange={(checked) => {
                            const currentGenders = filters.genders || [];
                            const newGenders = checked
                              ? [...currentGenders, gender as any]
                              : currentGenders.filter(g => g !== gender);
                            onFiltersChange({ genders: newGenders.length > 0 ? newGenders : undefined });
                          }}
                        />
                        <label htmlFor={`gender-${gender}`} className="text-sm">
                          {gender}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      )}
    </div>
  );
}