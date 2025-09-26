/**
 * Athlete Selector Component
 *
 * Extracted component for managing athlete selection in multi-athlete charts.
 * Provides checkboxes for toggling athlete visibility and bulk actions.
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

interface Athlete {
  id: string;
  name: string;
  color: number;
}

interface AthleteSelectorProps {
  /** Array of available athletes to select from */
  athletes: Athlete[];
  /** Record mapping athlete IDs to their selection state */
  athleteToggles: Record<string, boolean>;
  /** Whether to show the group average toggle (optional) */
  showGroupAverage?: boolean;
  /** Callback fired when an athlete's selection state changes */
  onToggleAthlete: (athleteId: string) => void;
  /** Callback fired when "Select All" button is clicked */
  onSelectAll: () => void;
  /** Callback fired when "Clear All" button is clicked */
  onClearAll: () => void;
  /** Callback fired when group average toggle changes (optional) */
  onToggleGroupAverage?: (checked: boolean) => void;
  /** Maximum number of athletes that can be selected (affects Select All behavior) */
  maxAthletes?: number;
  /** Additional CSS classes to apply */
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
  'rgba(34, 197, 94, 1)'      // Emerald
];

export const AthleteSelector = React.memo(function AthleteSelector({
  athletes,
  athleteToggles,
  showGroupAverage = false,
  onToggleAthlete,
  onSelectAll,
  onClearAll,
  onToggleGroupAverage,
  maxAthletes,
  className = ''
}: AthleteSelectorProps) {
  const visibleAthleteCount = Object.values(athleteToggles).filter(Boolean).length;
  const isLimitedByMax = maxAthletes && maxAthletes < athletes.length;
  const selectAllText = isLimitedByMax ? `Select ${maxAthletes}` : 'Select All';
  const selectAllTitle = isLimitedByMax ? `Select up to ${maxAthletes} athletes` : 'Select all athletes';

  return (
    <div className={`mb-4 p-4 bg-gray-50 rounded-lg border ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-900">
          Athletes ({visibleAthleteCount} of {athletes.length} visible{maxAthletes ? `, max ${maxAthletes}` : ''})
        </h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onSelectAll}
            disabled={visibleAthleteCount === (maxAthletes || athletes.length)}
            title={selectAllTitle}
          >
            {selectAllText}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onClearAll}
            disabled={visibleAthleteCount === 0}
          >
            Clear All
          </Button>
        </div>
      </div>

      {/* Athletes Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 mb-3">
        {athletes.map(athlete => {
          const athleteColor = ATHLETE_COLORS[athlete.color % ATHLETE_COLORS.length];

          return (
            <div key={athlete.id} className="flex items-center space-x-2">
              <Checkbox
                id={`athlete-${athlete.id}`}
                checked={athleteToggles[athlete.id] || false}
                onCheckedChange={() => onToggleAthlete(athlete.id)}
              />
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: athleteColor }}
              />
              <label
                htmlFor={`athlete-${athlete.id}`}
                className="text-sm cursor-pointer flex-1 truncate"
                title={athlete.name}
              >
                {athlete.name}
              </label>
            </div>
          );
        })}
      </div>

      {/* Group Average Toggle - only show if enabled */}
      {showGroupAverage !== undefined && onToggleGroupAverage && (
        <div className="flex items-center space-x-2 pt-2 border-t">
          <Checkbox
            id="group-average"
            checked={showGroupAverage}
            onCheckedChange={(checked) => onToggleGroupAverage(checked === true)}
          />
          <div className="w-3 h-3 rounded-full flex-shrink-0 bg-gray-400" />
          <label htmlFor="group-average" className="text-sm cursor-pointer">
            Group Average Trend
          </label>
        </div>
      )}
    </div>
  );
});

export default AthleteSelector;