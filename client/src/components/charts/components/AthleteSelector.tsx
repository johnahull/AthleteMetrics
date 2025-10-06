/**
 * Athlete Selector Component
 *
 * Extracted component for managing athlete selection in multi-athlete charts.
 * Provides checkboxes for toggling athlete visibility and bulk actions.
 * Supports collapsible mode to stay out of the way when not in use.
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { getAthleteColor } from '@/utils/chart-constants';

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
  /** Whether the selector should be collapsible */
  collapsible?: boolean;
  /** Whether the selector is collapsed by default (only applies if collapsible is true) */
  defaultCollapsed?: boolean;
}


export const AthleteSelector = React.memo(function AthleteSelector({
  athletes,
  athleteToggles,
  showGroupAverage = false,
  onToggleAthlete,
  onSelectAll,
  onClearAll,
  onToggleGroupAverage,
  maxAthletes,
  className = '',
  collapsible = false,
  defaultCollapsed = true
}: AthleteSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(!collapsible || !defaultCollapsed);
  const visibleAthleteCount = Object.values(athleteToggles).filter(Boolean).length;
  const isLimitedByMax = maxAthletes && maxAthletes < athletes.length;
  const selectAllText = isLimitedByMax ? `Select ${maxAthletes}` : 'Select All';
  const selectAllTitle = isLimitedByMax ? `Select up to ${maxAthletes} athletes` : 'Select all athletes';

  const toggleExpanded = () => {
    if (collapsible) {
      setIsExpanded(!isExpanded);
    }
  };

  // Header content for collapsible version
  if (collapsible) {
    return (
      <div className={`mb-4 ${className}`}>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleExpanded}
          className="flex items-center justify-between w-full p-3 h-auto text-sm font-medium bg-gray-50 rounded-lg border hover:bg-gray-100"
          aria-expanded={isExpanded}
          aria-controls="athlete-selector-content"
        >
          <span>
            Select Athletes ({visibleAthleteCount} of {athletes.length} selected{maxAthletes ? `, max ${maxAthletes}` : ''})
          </span>
          {isExpanded ? (
            <ChevronUpIcon className="h-4 w-4 ml-2" />
          ) : (
            <ChevronDownIcon className="h-4 w-4 ml-2" />
          )}
        </Button>

        {isExpanded && (
          <div
            id="athlete-selector-content"
            className="mt-2 p-4 bg-gray-50 rounded-lg border"
          >
            <AthleteSelectorContent
              athletes={athletes}
              athleteToggles={athleteToggles}
              showGroupAverage={showGroupAverage}
              onToggleAthlete={onToggleAthlete}
              onSelectAll={onSelectAll}
              onClearAll={onClearAll}
              onToggleGroupAverage={onToggleGroupAverage}
              maxAthletes={maxAthletes}
              visibleAthleteCount={visibleAthleteCount}
              selectAllText={selectAllText}
              selectAllTitle={selectAllTitle}
            />
          </div>
        )}
      </div>
    );
  }

  // Non-collapsible version (original behavior)
  return (
    <div className={`mb-4 p-4 bg-gray-50 rounded-lg border ${className}`}>
      <AthleteSelectorContent
        athletes={athletes}
        athleteToggles={athleteToggles}
        showGroupAverage={showGroupAverage}
        onToggleAthlete={onToggleAthlete}
        onSelectAll={onSelectAll}
        onClearAll={onClearAll}
        onToggleGroupAverage={onToggleGroupAverage}
        maxAthletes={maxAthletes}
        visibleAthleteCount={visibleAthleteCount}
        selectAllText={selectAllText}
        selectAllTitle={selectAllTitle}
      />
    </div>
  );
});

// Extracted content component to avoid duplication
interface AthleteSelectorContentProps {
  athletes: Athlete[];
  athleteToggles: Record<string, boolean>;
  showGroupAverage?: boolean;
  onToggleAthlete: (athleteId: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onToggleGroupAverage?: (checked: boolean) => void;
  maxAthletes?: number;
  visibleAthleteCount: number;
  selectAllText: string;
  selectAllTitle: string;
}

const AthleteSelectorContent = React.memo(function AthleteSelectorContent({
  athletes,
  athleteToggles,
  showGroupAverage,
  onToggleAthlete,
  onSelectAll,
  onClearAll,
  onToggleGroupAverage,
  maxAthletes,
  visibleAthleteCount,
  selectAllText,
  selectAllTitle
}: AthleteSelectorContentProps) {
  return (
    <>
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
            aria-label={selectAllTitle}
          >
            {selectAllText}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onClearAll}
            disabled={visibleAthleteCount === 0}
            aria-label="Clear all athlete selections"
          >
            Clear All
          </Button>
        </div>
      </div>

      {/* Athletes Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 mb-3">
        {athletes.map(athlete => {
          const athleteColor = getAthleteColor(athlete.color);

          return (
            <div key={athlete.id} className="flex items-center space-x-2">
              <Checkbox
                id={`athlete-${athlete.id}`}
                checked={athleteToggles[athlete.id] || false}
                onCheckedChange={() => onToggleAthlete(athlete.id)}
                aria-label={`Toggle ${athlete.name} selection`}
              />
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: athleteColor }}
                role="img"
                aria-label={`Color indicator for ${athlete.name}`}
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
            aria-label="Toggle group average trend line"
          />
          <div
            className="w-3 h-3 rounded-full flex-shrink-0 bg-gray-400"
            role="img"
            aria-label="Color indicator for group average"
          />
          <label htmlFor="group-average" className="text-sm cursor-pointer">
            Group Average Trend
          </label>
        </div>
      )}
    </>
  );
});

export default AthleteSelector;