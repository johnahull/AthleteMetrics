/**
 * Multi-select component for assigning sports to metrics
 *
 * Used in:
 * - MetricFormDialog: sportAssociations (which sports this metric is relevant for)
 *
 * Display Semantics:
 * - Empty selection = Metric is relevant to ALL sports (universal availability)
 * - Selected sports = Metric is relevant only to those specific sports
 *
 * Data Flow:
 * 1. Component displays current sportAssociations (string[] | null | undefined)
 * 2. User selects/deselects sports via UI
 * 3. onChange fires with string[] (selected codes) or undefined (empty selection)
 * 4. Parent form converts empty selection (undefined) to null before API submission
 * 5. Backend stores null in database (meaning "available to all sports")
 *
 * Schema Update Semantics (packages/shared/schema.ts):
 * - null: Explicitly clear field → "available to all sports"
 * - undefined: Don't update field (omitted from PATCH request)
 * - [...codes]: Set specific sports → "available only to these sports"
 */

import { useState, useMemo, useCallback } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSports } from "@/lib/sports-api";

interface SportMultiSelectProps {
  value?: string[] | null; // Sport CODES: ["SOCCER", "BASKETBALL"]
  onChange: (value: string[] | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function SportMultiSelect({
  value,
  onChange,
  placeholder = "All sports (default)",
  disabled = false,
}: SportMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const { data: sports, isLoading } = useSports();

  // Normalize value: null, undefined, or empty array all mean "all sports"
  const selectedCodes = value && value.length > 0 ? value : [];

  const handleSelect = (selectedCode: string) => {
    const newValue = selectedCodes.includes(selectedCode)
      ? selectedCodes.filter((v) => v !== selectedCode)
      : [...selectedCodes, selectedCode];

    // If empty after change, send undefined to represent "all sports"
    onChange(newValue.length > 0 ? newValue : undefined);
  };

  const handleRemove = (e: React.MouseEvent, removeCode: string) => {
    e.preventDefault();
    e.stopPropagation();
    const newValue = selectedCodes.filter((v) => v !== removeCode);
    onChange(newValue.length > 0 ? newValue : undefined);
  };

  const handleClear = () => {
    onChange(undefined);
    setOpen(false);
  };

  // Memoize sport name lookup map for performance
  const sportNameMap = useMemo(() => {
    const map = new Map<string, string>();
    sports?.forEach((sport) => {
      map.set(sport.code, sport.name);
    });
    return map;
  }, [sports]);

  // Get sport name from code using memoized lookup
  const getSportName = useCallback((code: string): string => {
    return sportNameMap.get(code) || code;
  }, [sportNameMap]);

  // Get color class for sport badge - use dynamic color from database if available
  const getColorClass = (code: string): string => {
    const sport = sports?.find(s => s.code === code);
    if (sport?.color) {
      // If sport has a color field, use it (assumes Tailwind class or hex color)
      return sport.color.includes('bg-')
        ? sport.color
        : "bg-gray-100 text-gray-800 hover:bg-gray-200";
    }
    // Fallback to default gray
    return "bg-gray-100 text-gray-800 hover:bg-gray-200";
  };

  // Get just the background color for the color dot indicator - use dynamic color if available
  const getDotColor = (code: string): string => {
    const sport = sports?.find(s => s.code === code);
    if (sport?.color) {
      // Extract background color from Tailwind class or use default
      const bgMatch = sport.color.match(/bg-(\w+-\d+)/);
      if (bgMatch) {
        return `bg-${bgMatch[1]}`;
      }
    }
    // Fallback to default gray
    return "bg-gray-400";
  };

  if (isLoading) {
    return (
      <Button
        variant="outline"
        className="w-full justify-between"
        disabled
        data-testid="sport-multi-select"
      >
        <span className="text-muted-foreground">Loading sports...</span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between min-h-[2.5rem] h-auto"
          disabled={disabled}
          data-testid="sport-multi-select"
        >
          {selectedCodes.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            <div className="flex gap-1 flex-wrap">
              {selectedCodes.map((code) => (
                <Badge
                  key={code}
                  variant="secondary"
                  className={cn("mr-1 pr-1", getColorClass(code))}
                  data-testid={`sport-badge-${code}`}
                >
                  {getSportName(code)}
                  <button
                    type="button"
                    className="ml-1 rounded-full hover:bg-black/10 p-0.5"
                    onClick={(e) => handleRemove(e, code)}
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    aria-label={`Remove ${getSportName(code)}`}
                    data-testid={`remove-sport-${code}`}
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search sports..." />
          <CommandEmpty>No sport found.</CommandEmpty>
          <CommandGroup>
            {sports?.map((sport) => {
              const isSelected = selectedCodes.includes(sport.code);
              return (
                <CommandItem
                  key={sport.code}
                  value={sport.code}
                  onSelect={() => handleSelect(sport.code)}
                  className="cursor-pointer"
                  data-testid={`sport-option-${sport.code}`}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      isSelected ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex items-center gap-2 flex-1">
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full",
                        getDotColor(sport.code)
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="font-medium">{sport.name}</span>
                      {sport.description && (
                        <span className="text-xs text-muted-foreground">
                          {sport.description}
                        </span>
                      )}
                    </div>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
          {selectedCodes.length > 0 && (
            <div className="border-t p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={handleClear}
                data-testid="sport-multi-select-clear-all"
              >
                Clear all (relevant to all sports)
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
