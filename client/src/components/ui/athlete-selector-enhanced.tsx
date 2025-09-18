import React, { useState, useMemo } from 'react';
import { Search, Users, Trophy, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { METRIC_CONFIG } from '@shared/analytics-types';
import type { TrendData } from '@shared/analytics-types';

interface AthleteInfo {
  id: string;
  name: string;
  bestValue: number;
  dataPoints: number;
  teamName?: string;
}

interface AthleteSelectionProps {
  data: TrendData[];
  selectedAthleteIds: string[];
  onSelectionChange: (athleteIds: string[]) => void;
  maxSelection?: number;
  metric: string;
  className?: string;
}

const ATHLETE_COLORS = [
  'rgba(59, 130, 246, 1)',    // Blue
  'rgba(16, 185, 129, 1)',    // Green
  'rgba(239, 68, 68, 1)',     // Red
  'rgba(245, 158, 11, 1)',    // Amber
  'rgba(139, 92, 246, 1)',    // Purple
  'rgba(236, 72, 153, 1)',    // Pink
  'rgba(20, 184, 166, 1)',    // Teal
  'rgba(251, 146, 60, 1)',    // Orange
  'rgba(124, 58, 237, 1)',    // Violet
  'rgba(34, 197, 94, 1)'      // Emerald - 10th color
];

export function AthleteSelector({
  data,
  selectedAthleteIds,
  onSelectionChange,
  maxSelection = 10,
  metric,
  className = ''
}: AthleteSelectionProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  // Process athlete data with performance metrics
  const athleteOptions = useMemo(() => {
    const metricConfig = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
    const lowerIsBetter = metricConfig?.lowerIsBetter || false;

    return data.map(trend => {
      // Calculate best value for this athlete
      const values = trend.data.map(point => point.value);
      const bestValue = lowerIsBetter
        ? Math.min(...values)
        : Math.max(...values);

      return {
        id: trend.athleteId,
        name: trend.athleteName,
        bestValue,
        dataPoints: trend.data.length,
        teamName: trend.teamName || 'No Team'
      };
    }).sort((a, b) => {
      // Sort by performance (best first)
      return lowerIsBetter
        ? a.bestValue - b.bestValue
        : b.bestValue - a.bestValue;
    });
  }, [data, metric]);

  // Filter athletes based on search term
  const filteredAthletes = useMemo(() => {
    if (!searchTerm) return athleteOptions;

    const term = searchTerm.toLowerCase();
    return athleteOptions.filter(athlete =>
      athlete.name.toLowerCase().includes(term) ||
      (athlete.teamName && athlete.teamName.toLowerCase().includes(term))
    );
  }, [athleteOptions, searchTerm]);

  // Helper functions for selection management
  const toggleAthlete = (athleteId: string) => {
    const newSelection = selectedAthleteIds.includes(athleteId)
      ? selectedAthleteIds.filter(id => id !== athleteId)
      : selectedAthleteIds.length < maxSelection
        ? [...selectedAthleteIds, athleteId]
        : selectedAthleteIds; // Don't add if at max

    onSelectionChange(newSelection);
  };

  const selectTopPerformers = () => {
    const topIds = athleteOptions.slice(0, maxSelection).map(a => a.id);
    onSelectionChange(topIds);
  };

  const selectRandom = () => {
    const shuffled = [...athleteOptions].sort(() => Math.random() - 0.5);
    const randomIds = shuffled.slice(0, maxSelection).map(a => a.id);
    onSelectionChange(randomIds);
  };

  const clearAll = () => {
    onSelectionChange([]);
  };

  const selectAll = () => {
    const allIds = athleteOptions.slice(0, maxSelection).map(a => a.id);
    onSelectionChange(allIds);
  };

  const metricConfig = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
  const unit = metricConfig?.unit || '';
  const metricLabel = metricConfig?.label || metric;

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
          Random {maxSelection}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={selectAll}
          disabled={athleteOptions.length === 0}
        >
          Select All
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={clearAll}
          disabled={selectedAthleteIds.length === 0}
        >
          Clear All
        </Button>
      </div>

      {/* Athletes List */}
      <div className="max-h-60 overflow-y-auto space-y-2">
        {filteredAthletes.map((athlete, index) => {
          const isSelected = selectedAthleteIds.includes(athlete.id);
          const canSelect = isSelected || selectedAthleteIds.length < maxSelection;
          const color = ATHLETE_COLORS[index % ATHLETE_COLORS.length];
          const selectedIndex = selectedAthleteIds.indexOf(athlete.id);
          const assignedColor = selectedIndex >= 0 ? ATHLETE_COLORS[selectedIndex] : color;

          return (
            <div
              key={athlete.id}
              className={`flex items-center space-x-3 p-2 rounded border ${
                isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'
              } ${canSelect ? 'cursor-pointer hover:bg-gray-50' : 'opacity-50'}`}
              onClick={() => canSelect && toggleAthlete(athlete.id)}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => canSelect && toggleAthlete(athlete.id)}
                disabled={!canSelect}
              />

              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: isSelected ? assignedColor : '#e5e7eb' }}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {athlete.name}
                  </span>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{athlete.bestValue.toFixed(2)}{unit}</span>
                    <Badge variant="secondary" className="text-xs">
                      {athlete.dataPoints} pts
                    </Badge>
                  </div>
                </div>
                {athlete.teamName && (
                  <div className="text-xs text-gray-500 truncate">
                    {athlete.teamName}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredAthletes.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No athletes found matching your search.</p>
        </div>
      )}
    </div>
  );
}