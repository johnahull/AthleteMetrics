import React from 'react';
import { Search, Users, Trophy, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { TrendData } from '@shared/analytics-types';
import { usePerformanceAthleteSelector } from '@/hooks/usePerformanceAthleteSelector';

interface AthleteSelectionProps {
  data: TrendData[];
  selectedAthleteIds: string[];
  onSelectionChange: (athleteIds: string[]) => void;
  maxSelection?: number;
  metric: string;
  className?: string;
}

export function AthleteSelector({
  data,
  selectedAthleteIds,
  onSelectionChange,
  maxSelection = 10,
  metric,
  className = ''
}: AthleteSelectionProps) {
  const {
    searchTerm,
    setSearchTerm,
    isExpanded,
    setIsExpanded,
    filteredAthletes,
    athleteOptions,
    toggleAthlete,
    selectTopPerformers,
    selectRandom,
    clearSelection,
    selectAll,
    metricLabel,
    unit,
    athleteColorMap
  } = usePerformanceAthleteSelector({
    data,
    selectedAthleteIds,
    onSelectionChange,
    maxSelection,
    metric
  });

  if (!isExpanded) {
    return (
      <div className={`p-4 bg-gray-50 rounded-lg border ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-600" />
            <span className="text-sm font-medium text-gray-900">
              Athletes Selected: {selectedAthleteIds.length} of {maxSelection}
            </span>
            <Badge variant="outline" className="text-xs">
              {athleteOptions.length} available
            </Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsExpanded(true)}
          >
            Manage Selection
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 bg-gray-50 rounded-lg border ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-600" />
          <h3 className="text-sm font-medium text-gray-900">
            Select Athletes ({selectedAthleteIds.length}/{maxSelection})
          </h3>
          <Badge variant="outline" className="text-xs">
            {filteredAthletes.length} available
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsExpanded(false)}
        >
          Collapse
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          placeholder="Search athletes or teams..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={selectTopPerformers}
          className="flex items-center gap-1"
        >
          <Trophy className="w-3 h-3" />
          Top {maxSelection}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={selectRandom}
          className="flex items-center gap-1"
        >
          <Shuffle className="w-3 h-3" />
          Random
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={selectAll}
          disabled={filteredAthletes.length === 0}
        >
          All Visible
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={clearSelection}
          disabled={selectedAthleteIds.length === 0}
        >
          Clear All
        </Button>
      </div>

      {/* Selected Athletes Summary */}
      {selectedAthleteIds.length > 0 && (
        <div className="mb-4 p-3 bg-white rounded border">
          <div className="text-xs text-gray-600 mb-2">Selected Athletes:</div>
          <div className="flex flex-wrap gap-1">
            {selectedAthleteIds.map((id, index) => {
              const athlete = athleteOptions.find(a => a.id === id);
              if (!athlete) return null;

              const color = athleteColorMap.get(id);
              return (
                <Badge
                  key={id}
                  variant="secondary"
                  className="text-xs flex items-center gap-1"
                  style={{ borderLeftColor: color, borderLeftWidth: '3px' }}
                >
                  {athlete.name}
                  <button
                    onClick={() => toggleAthlete(id)}
                    className="ml-1 text-gray-500 hover:text-gray-700"
                  >
                    ×
                  </button>
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {/* Athletes List */}
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {filteredAthletes.length === 0 ? (
          <div className="text-center text-gray-500 py-4">
            No athletes found matching your search.
          </div>
        ) : (
          filteredAthletes.map((athlete) => {
            const isSelected = selectedAthleteIds.includes(athlete.id);
            const isDisabled = !isSelected && selectedAthleteIds.length >= maxSelection;

            return (
              <div
                key={athlete.id}
                className={`flex items-center p-2 rounded border transition-colors ${
                  isSelected
                    ? 'bg-blue-50 border-blue-200'
                    : isDisabled
                    ? 'bg-gray-100 border-gray-200 opacity-50'
                    : 'bg-white border-gray-200 hover:bg-gray-50'
                }`}
              >
                <Checkbox
                  checked={isSelected}
                  disabled={isDisabled}
                  onCheckedChange={() => !isDisabled && toggleAthlete(athlete.id)}
                  className="mr-3"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm truncate">
                      {athlete.name}
                    </div>
                    <div className="text-xs text-gray-600 ml-2">
                      {'bestValue' in athlete && athlete.bestValue !== undefined && (
                        <span className="font-mono">
                          {athlete.bestValue.toFixed(2)}{unit}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{athlete.teamName}</span>
                    {'dataPoints' in athlete && (
                      <span>{athlete.dataPoints} data points</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t text-xs text-gray-500 flex justify-between">
        <span>
          Best {metricLabel} performers shown first
        </span>
        <span>
          {selectedAthleteIds.length}/{maxSelection} selected
        </span>
      </div>
    </div>
  );
}