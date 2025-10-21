import React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserMinus } from "lucide-react";

interface FilterBarProps {
  mode: 'current' | 'available';

  // For available athletes filtering
  showOnlyAvailable?: boolean;
  onShowOnlyAvailableChange?: (checked: boolean) => void;
  selectedSeason?: string;
  onSeasonChange?: (season: string) => void;
  seasons?: string[];

  // For bulk operations
  selectedCount?: number;
  totalCount?: number;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  onBulkAction?: () => void;

  disabled?: boolean;
}

export function FilterBar({
  mode,
  showOnlyAvailable,
  onShowOnlyAvailableChange,
  selectedSeason,
  onSeasonChange,
  seasons = [],
  selectedCount = 0,
  totalCount = 0,
  onSelectAll,
  onClearSelection,
  onBulkAction,
  disabled = false
}: FilterBarProps) {
  if (mode === 'current') {
    // Bulk selection controls for current athletes
    return (
      <div className="flex items-center justify-between mb-4" role="toolbar" aria-label="Current athlete bulk actions">
        <div className="flex items-center gap-2">
          {onSelectAll && (
            <Button
              variant="outline"
              size="sm"
              onClick={onSelectAll}
              disabled={disabled || totalCount === 0}
              aria-describedby="select-all-current-description"
            >
              Select All ({totalCount})
            </Button>
          )}
          <div id="select-all-current-description" className="sr-only">
            Select all {totalCount} current athletes for bulk removal
          </div>

          {onClearSelection && (
            <Button
              variant="outline"
              size="sm"
              onClick={onClearSelection}
              disabled={disabled || selectedCount === 0}
              aria-label="Clear current athlete selection"
            >
              Clear Selection
            </Button>
          )}
        </div>

        {selectedCount > 0 && onBulkAction && (
          <Button
            variant="destructive"
            size="sm"
            onClick={onBulkAction}
            disabled={disabled}
            className="flex items-center gap-2"
            aria-describedby="bulk-remove-description"
          >
            <UserMinus className="h-4 w-4" aria-hidden="true" />
            Remove {selectedCount} Athlete{selectedCount !== 1 ? 's' : ''}
          </Button>
        )}
        <div id="bulk-remove-description" className="sr-only">
          Remove {selectedCount} selected athlete{selectedCount !== 1 ? 's' : ''} from team
        </div>
      </div>
    );
  }

  // Filter controls for available athletes
  return (
    <div className="flex items-center justify-between" role="toolbar" aria-label="Athlete filtering options">
      <div className="flex items-center space-x-4">
        {onShowOnlyAvailableChange && (
          <div className="flex items-center space-x-2">
            <Checkbox
              id="show-available"
              checked={showOnlyAvailable}
              onCheckedChange={(checked) => onShowOnlyAvailableChange(checked === true)}
              disabled={disabled}
            />
            <Label htmlFor="show-available" className="text-sm">
              Show only available athletes
            </Label>
          </div>
        )}

        {onSeasonChange && seasons.length > 0 && (
          <div className="flex items-center space-x-2">
            <Label htmlFor="season-filter" className="text-sm">
              Season:
            </Label>
            <Select value={selectedSeason} onValueChange={onSeasonChange}>
              <SelectTrigger
                id="season-filter"
                className="w-40"
                aria-describedby="season-filter-description"
              >
                <SelectValue placeholder="All seasons" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All seasons</SelectItem>
                {seasons.map(season => (
                  <SelectItem key={season} value={season}>
                    {season}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div id="season-filter-description" className="sr-only">
              Filter athletes by season. Current selection: {selectedSeason || "All seasons"}
            </div>
          </div>
        )}
      </div>

      {selectedCount > 0 && (
        <div className="flex gap-2" role="group" aria-label="Bulk selection actions">
          {onSelectAll && (
            <Button
              variant="outline"
              size="sm"
              onClick={onSelectAll}
              disabled={disabled}
              aria-describedby="select-all-description"
            >
              Select All Available
            </Button>
          )}
          <div id="select-all-description" className="sr-only">
            Select all available athletes for adding to team
          </div>

          {onClearSelection && (
            <Button
              variant="outline"
              size="sm"
              onClick={onClearSelection}
              disabled={disabled || selectedCount === 0}
              aria-label="Clear all selected athletes"
            >
              Clear Selection
            </Button>
          )}
        </div>
      )}
    </div>
  );
}