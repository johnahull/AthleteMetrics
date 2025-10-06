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
import { Separator } from '@/components/ui/separator';
import {
  Filter,
  RotateCcw
} from 'lucide-react';

import { MetricsSelector } from './MetricsSelector';
import { TimeframeSelector } from './TimeframeSelector';

import type {
  AnalyticsFilters,
  MetricSelection,
  TimeframeConfig,
  AnalysisType
} from '@shared/analytics-types';



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


  // Handle filter changes
  const handleTeamsChange = (teamIds: string[]) => {
    onFiltersChange({ teams: teamIds.length > 0 ? teamIds : undefined });
  };

  const handleGendersChange = (genders: string[]) => {
    onFiltersChange({ genders: genders.length > 0 ? genders as ('Male' | 'Female' | 'Not Specified')[] : undefined });
  };

  const handleBirthYearFromChange = (birthYearFrom: number | undefined) => {
    onFiltersChange({ birthYearFrom });
  };

  const handleBirthYearToChange = (birthYearTo: number | undefined) => {
    onFiltersChange({ birthYearTo });
  };

  // Get active filter count for badge
  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.teams && filters.teams.length > 0) count++;
    if (filters.genders && filters.genders.length > 0) count++;
    if (filters.birthYearFrom || filters.birthYearTo) count++;
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
            {/* Simple Filters Section */}
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

                {/* Teams Filter */}
                {availableTeams.length > 0 && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">Teams</label>
                    <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                      {availableTeams.map((team) => (
                        <label key={team.id} className="flex items-center space-x-2 cursor-pointer">
                          <Checkbox
                            checked={filters.teams?.includes(team.id) || false}
                            onCheckedChange={(checked) => {
                              const currentTeams = filters.teams || [];
                              const newTeams = checked
                                ? [...currentTeams, team.id]
                                : currentTeams.filter(t => t !== team.id);
                              handleTeamsChange(newTeams);
                            }}
                          />
                          <span className="text-sm">{team.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Birth Year Range */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Birth Year Range</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">From</label>
                      <Select
                        value={filters.birthYearFrom?.toString() || 'any'}
                        onValueChange={(value) => {
                          const fromYear = value === 'any' ? undefined : parseInt(value);
                          handleBirthYearFromChange(fromYear);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Any" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any</SelectItem>
                          {Array.from({ length: 40 }, (_, i) => 2025 - i).map(year => (
                            <SelectItem key={year} value={year.toString()}>
                              {year}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">To</label>
                      <Select
                        value={filters.birthYearTo?.toString() || 'any'}
                        onValueChange={(value) => {
                          const toYear = value === 'any' ? undefined : parseInt(value);
                          handleBirthYearToChange(toYear);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Any" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any</SelectItem>
                          {Array.from({ length: 40 }, (_, i) => 2025 - i).map(year => (
                            <SelectItem key={year} value={year.toString()}>
                              {year}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}