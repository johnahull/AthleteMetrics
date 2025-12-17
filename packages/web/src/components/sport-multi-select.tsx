/**
 * Multi-select component for assigning sports to metrics
 *
 * Used in:
 * - MetricFormDialog: sportAssociations (which sports this metric is relevant for)
 *
 * Semantics:
 * - NULL/undefined/empty array = Relevant to ALL sports (default)
 * - Non-empty array = Relevant only to those specific sports
 */

import { useState } from "react";
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

  // Get sport name from code
  const getSportName = (code: string): string => {
    const sport = sports?.find((s) => s.code === code);
    return sport?.name || code;
  };

  // Get color class for sport badge
  const getColorClass = (code: string): string => {
    const colorMap: Record<string, string> = {
      SOCCER: "bg-green-100 text-green-800 hover:bg-green-200",
      BASKETBALL: "bg-orange-100 text-orange-800 hover:bg-orange-200",
      VOLLEYBALL: "bg-blue-100 text-blue-800 hover:bg-blue-200",
      TENNIS: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200",
      BASEBALL: "bg-red-100 text-red-800 hover:bg-red-200",
      FOOTBALL: "bg-purple-100 text-purple-800 hover:bg-purple-200",
    };
    return colorMap[code] || "bg-gray-100 text-gray-800 hover:bg-gray-200";
  };

  // Get just the background color for the color dot indicator
  const getDotColor = (code: string): string => {
    const dotColorMap: Record<string, string> = {
      SOCCER: "bg-green-400",
      BASKETBALL: "bg-orange-400",
      VOLLEYBALL: "bg-blue-400",
      TENNIS: "bg-yellow-400",
      BASEBALL: "bg-red-400",
      FOOTBALL: "bg-purple-400",
    };
    return dotColorMap[code] || "bg-gray-400";
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
                  className={cn("mr-1 cursor-pointer", getColorClass(code))}
                  onClick={(e) => handleRemove(e, code)}
                  onPointerDown={(e) => e.stopPropagation()}
                  data-testid={`sport-badge-${code}`}
                  role="button"
                  aria-label={`Remove ${getSportName(code)}`}
                >
                  {getSportName(code)}
                  <X className="ml-1 h-3 w-3" aria-hidden="true" />
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
