/**
 * Multi-select component for assigning organization types to metrics and benchmarks
 *
 * Used in:
 * - MetricFormDialog: availableOrgTypes (which org types can use this metric)
 * - BenchmarkForm: applicableOrgTypes (which org types this benchmark applies to)
 * - CustomBenchmarkForm: applicableOrgTypes
 *
 * Semantics:
 * - NULL/undefined/empty array = Available/applicable to ALL organization types (default)
 * - Non-empty array = Restricted to only those specific organization types
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
import {
  getOrganizationTypeOptions,
  getOrganizationTypeLabel,
} from "@shared/organization-type-utils";
import type { OrganizationType } from "@shared/organization-type-types";

interface OrganizationTypeMultiSelectProps {
  value?: OrganizationType[] | null;
  onChange: (value: OrganizationType[] | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function OrganizationTypeMultiSelect({
  value,
  onChange,
  placeholder = "All organizations (default)",
  disabled = false,
}: OrganizationTypeMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const options = getOrganizationTypeOptions();

  // Normalize value: null, undefined, or empty array all mean "all organizations"
  const selectedValues = value && value.length > 0 ? value : [];

  const handleSelect = (selectedValue: OrganizationType) => {
    const newValue = selectedValues.includes(selectedValue)
      ? selectedValues.filter((v) => v !== selectedValue)
      : [...selectedValues, selectedValue];

    // If empty after change, send undefined to represent "all organizations"
    onChange(newValue.length > 0 ? newValue : undefined);
  };

  const handleRemove = (e: React.MouseEvent, removeValue: OrganizationType) => {
    e.stopPropagation();
    const newValue = selectedValues.filter((v) => v !== removeValue);
    onChange(newValue.length > 0 ? newValue : undefined);
  };

  const handleClear = () => {
    onChange(undefined);
    setOpen(false);
  };

  // Get color class for org type badge
  const getColorClass = (orgType: OrganizationType): string => {
    const colorMap: Record<OrganizationType, string> = {
      youth: "bg-blue-100 text-blue-800 hover:bg-blue-200",
      high_school: "bg-green-100 text-green-800 hover:bg-green-200",
      college: "bg-purple-100 text-purple-800 hover:bg-purple-200",
      club: "bg-orange-100 text-orange-800 hover:bg-orange-200",
      private_facility: "bg-pink-100 text-pink-800 hover:bg-pink-200",
      elite_academy: "bg-red-100 text-red-800 hover:bg-red-200",
    };
    return colorMap[orgType] || "bg-gray-100 text-gray-800";
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between min-h-[2.5rem] h-auto"
          disabled={disabled}
        >
          {selectedValues.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            <div className="flex gap-1 flex-wrap">
              {selectedValues.map((orgType) => (
                <Badge
                  key={orgType}
                  variant="secondary"
                  className={cn("mr-1 cursor-pointer", getColorClass(orgType))}
                  onClick={(e) => handleRemove(e, orgType)}
                >
                  {getOrganizationTypeLabel(orgType)}
                  <X className="ml-1 h-3 w-3" />
                </Badge>
              ))}
            </div>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search organization types..." />
          <CommandEmpty>No organization type found.</CommandEmpty>
          <CommandGroup>
            {options.map((option) => {
              const isSelected = selectedValues.includes(option.value);
              return (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => handleSelect(option.value)}
                  className="cursor-pointer"
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
                        getColorClass(option.value).split(" ")[0]
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="font-medium">{option.label}</span>
                      {option.description && (
                        <span className="text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      )}
                    </div>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
          {selectedValues.length > 0 && (
            <div className="border-t p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={handleClear}
              >
                Clear all (available to all organizations)
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
