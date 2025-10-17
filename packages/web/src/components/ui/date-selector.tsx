import React, { useState, useMemo } from 'react';
import { Calendar, Users, CheckSquare, Square, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { TrendData } from '@shared/analytics-types';

interface DateInfo {
  date: string; // YYYY-MM-DD format
  displayDate: string; // "Jan 15, 2024" format
  athleteCount: number;
  totalMeasurements: number;
}

interface DateSelectorProps {
  data: TrendData[];
  selectedDates: string[];
  onSelectionChange: (dates: string[]) => void;
  maxSelection?: number;
  className?: string;
}

export function DateSelector({
  data,
  selectedDates,
  onSelectionChange,
  maxSelection = 10,
  className = ''
}: DateSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  // Process trend data to extract unique dates with athlete counts
  const dateOptions = useMemo(() => {
    // Extract all dates across all athletes
    const dateMap = new Map<string, Set<string>>();

    data.forEach(trend => {
      trend.data.forEach(point => {
        const date = point.date instanceof Date ? point.date : new Date(point.date);
        const dateStr = date.toISOString().split('T')[0];

        if (!dateMap.has(dateStr)) {
          dateMap.set(dateStr, new Set());
        }
        dateMap.get(dateStr)!.add(trend.athleteId);
      });
    });

    // Convert to DateInfo objects
    return Array.from(dateMap.entries())
      .map(([dateStr, athleteIds]) => {
        const date = new Date(dateStr);
        return {
          date: dateStr,
          displayDate: date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          }),
          athleteCount: athleteIds.size,
          totalMeasurements: athleteIds.size // For trends, each athlete has max 1 measurement per date
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Most recent first
  }, [data]);

  // Filter dates based on search term
  const filteredDates = useMemo(() => {
    if (!searchTerm) return dateOptions;

    const term = searchTerm.toLowerCase();
    return dateOptions.filter(dateInfo =>
      dateInfo.displayDate.toLowerCase().includes(term) ||
      dateInfo.date.includes(term)
    );
  }, [dateOptions, searchTerm]);

  // Helper functions for selection management
  const toggleDate = (dateStr: string) => {
    const newSelection = selectedDates.includes(dateStr)
      ? selectedDates.filter(d => d !== dateStr)
      : selectedDates.length < maxSelection
        ? [...selectedDates, dateStr]
        : selectedDates; // Don't add if at max

    onSelectionChange(newSelection);
  };

  const selectRecent = () => {
    const recentDates = dateOptions.slice(0, maxSelection).map(d => d.date);
    onSelectionChange(recentDates);
  };

  const selectRandom = () => {
    const shuffled = [...dateOptions].sort(() => Math.random() - 0.5);
    const randomDates = shuffled.slice(0, maxSelection).map(d => d.date);
    onSelectionChange(randomDates);
  };

  const clearAll = () => {
    onSelectionChange([]);
  };

  const selectAll = () => {
    const allDates = dateOptions.slice(0, maxSelection).map(d => d.date);
    onSelectionChange(allDates);
  };

  if (!isExpanded) {
    const hasSelectedDates = selectedDates.length > 0;
    const containerClasses = hasSelectedDates
      ? `p-4 bg-blue-50 rounded-lg border border-blue-200 ${className}`
      : `p-4 bg-red-50 rounded-lg border border-red-200 ${className}`;
    const iconColor = hasSelectedDates ? "text-blue-600" : "text-red-600";
    const textColor = hasSelectedDates ? "text-blue-900" : "text-red-900";

    return (
      <div className={containerClasses}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className={`w-4 h-4 ${iconColor}`} />
            <span className={`text-sm font-medium ${textColor}`}>
              Measurement Dates Selected: {selectedDates.length} of {maxSelection}
            </span>
            <Badge variant="outline" className="text-xs">
              {dateOptions.length} available
            </Badge>
            {!hasSelectedDates && (
              <span className="text-xs text-red-600 font-medium">
                ← Select dates to view chart
              </span>
            )}
          </div>
          <Button
            variant={hasSelectedDates ? "outline" : "default"}
            size="sm"
            onClick={() => setIsExpanded(true)}
            className={!hasSelectedDates ? "bg-red-600 hover:bg-red-700 text-white" : ""}
          >
            {hasSelectedDates ? "Manage Dates" : "Select Dates"}
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
          <Calendar className="w-4 h-4 text-gray-600" />
          <h3 className="text-sm font-medium text-gray-900">
            Select Measurement Dates ({selectedDates.length}/{maxSelection})
          </h3>
          <Badge variant="outline" className="text-xs">
            {filteredDates.length} available
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
        <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          placeholder="Search dates..."
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
          onClick={selectRecent}
          className="flex items-center gap-1"
        >
          <Calendar className="w-3 h-3" />
          Recent {maxSelection}
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
          disabled={dateOptions.length === 0}
        >
          Select All
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={clearAll}
          disabled={selectedDates.length === 0}
        >
          Clear All
        </Button>
      </div>

      {/* Dates List */}
      <div className="max-h-60 overflow-y-auto space-y-2">
        {filteredDates.map((dateInfo) => {
          const isSelected = selectedDates.includes(dateInfo.date);
          const canSelect = isSelected || selectedDates.length < maxSelection;

          return (
            <div
              key={dateInfo.date}
              className={`flex items-center space-x-3 p-3 rounded border ${
                isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'
              } ${canSelect ? 'cursor-pointer hover:bg-gray-50' : 'opacity-50'}`}
              onClick={() => canSelect && toggleDate(dateInfo.date)}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => canSelect && toggleDate(dateInfo.date)}
                disabled={!canSelect}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">
                    {dateInfo.displayDate}
                  </span>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      <span>{dateInfo.athleteCount} athletes</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {dateInfo.totalMeasurements} measurements
                    </Badge>
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  {dateInfo.date}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredDates.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No measurement dates found matching your search.</p>
        </div>
      )}
    </div>
  );
}