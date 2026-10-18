/**
 * BenchmarkSetCombobox - searchable, filterable single-select for benchmark sets.
 *
 * Search and chips both run through benchmark-filtering.ts (cmdk's own filter is off) so the
 * two can never disagree. Rows use the set id as cmdk value: a site set and an org set may share a name.
 */

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useBenchmarkSets } from "@/lib/benchmark-sets-api";
import { useSports } from "@/lib/sports-api";
import {
  applyChipFilters,
  availableChipValues,
  chipsFromContext,
  groupBy,
  matchesSearch,
  type ChipMeta,
  type ChipSelection,
  type ChipType,
  type FilterContext,
} from "@/components/benchmarks/benchmark-filtering";

interface BenchmarkSetComboboxProps {
  organizationId: string;
  value: string | null;
  onChange: (setId: string | null) => void;
  /** Starting chips; values that match no set are ignored. Sports may be codes or names. */
  context?: FilterContext;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const CHIP_LABELS: Record<ChipType, string> = {
  sport: "Sport",
  level: "Level",
  gender: "Gender",
  source: "Source",
};

const NO_SPORT = "Other";

export function BenchmarkSetCombobox({
  organizationId,
  value,
  onChange,
  context,
  placeholder = "Select a benchmark set",
  className,
  disabled,
}: BenchmarkSetComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // null until the user touches a chip: until then the chips come from `context`
  const [userChips, setUserChips] = useState<ChipSelection | null>(null);

  const { data: sets, isLoading, error } = useBenchmarkSets(organizationId);
  const { data: sports } = useSports();

  const sportName = useMemo(() => {
    const byCode = new Map(sports?.map((s) => [s.code, s.name]));
    return (code: string | null | undefined) => (code ? byCode.get(code) ?? code : null);
  }, [sports]);

  const getMeta = useMemo(
    () =>
      (set: NonNullable<typeof sets>[number]): ChipMeta => ({
        sport: sportName(set.sport),
        level: set.level,
        gender: set.gender,
        source: set.organizationId == null ? "Site" : "Org",
      }),
    [sportName],
  );

  const available = useMemo(() => availableChipValues(sets ?? [], getMeta), [sets, getMeta]);

  const contextChips = useMemo(
    () =>
      chipsFromContext(
        context && { ...context, sports: context.sports?.map((s) => sportName(s) ?? s) },
        available,
      ),
    [context, available, sportName],
  );
  const chips = userChips ?? contextChips;
  const hasChips = Object.values(chips).some((v) => v && v.length > 0);

  const groups = useMemo(() => {
    const shown = applyChipFilters(sets ?? [], chips, getMeta).filter((set) =>
      matchesSearch(
        [set.name, sportName(set.sport), set.sport, set.level, set.gender, set.description],
        query,
      ),
    );
    return groupBy(
      shown,
      (set) => sportName(set.sport) ?? NO_SPORT,
      (a, b) => (a.level ?? "").localeCompare(b.level ?? "") || a.name.localeCompare(b.name),
      (a, b) => (a === NO_SPORT ? 1 : b === NO_SPORT ? -1 : a.localeCompare(b)),
    );
  }, [sets, chips, getMeta, query, sportName]);

  const toggleChip = (type: ChipType, chipValue: string) => {
    const current = chips[type] ?? [];
    const next = current.includes(chipValue) ? current.filter((v) => v !== chipValue) : [...current, chipValue];
    setUserChips({ ...chips, [type]: next });
  };

  const selected = sets?.find((s) => s.id === value);

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || isLoading}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {isLoading ? "Loading sets..." : selected?.name ?? placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(400px,calc(100vw-2rem))] p-0" align="start">
        {/* Chips live outside <Command>: cmdk would turn Enter on a chip into "select highlighted set" */}
        <div className="flex max-h-(--radix-popover-content-available-height) flex-col">
          {(Object.keys(available) as ChipType[]).length > 0 && (
            <div role="group" aria-label="Filter benchmark sets" className="shrink-0 border-b p-2 space-y-1.5">
              {(Object.keys(CHIP_LABELS) as ChipType[]).map((type) =>
                available[type] ? (
                  <div key={type} className="flex flex-wrap items-center gap-1">
                    <span className="text-xs text-muted-foreground w-12 shrink-0">{CHIP_LABELS[type]}</span>
                    {available[type]!.map((v) => {
                      const pressed = chips[type]?.includes(v) ?? false;
                      return (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={pressed}
                          onClick={() => toggleChip(type, v)}
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-xs",
                            pressed ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                          )}
                        >
                          {v}
                        </button>
                      );
                    })}
                  </div>
                ) : null,
              )}
              {hasChips && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setUserChips({})}>
                  Clear filters
                </Button>
              )}
            </div>
          )}
          <Command shouldFilter={false} className="min-h-0">
            <CommandInput placeholder="Search sets..." value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>{error ? "Failed to load sets. Please try again." : "No benchmark sets found."}</CommandEmpty>
              {groups.map((group) => (
                <CommandGroup key={group.key} heading={group.key}>
                  {group.items.map((set) => (
                    <CommandItem
                      key={set.id}
                      value={set.id}
                      onSelect={() => {
                        onChange(set.id);
                        setOpen(false);
                      }}
                      className="cursor-pointer"
                    >
                      <Check className={cn("h-4 w-4", value === set.id ? "opacity-100" : "opacity-0")} />
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium">{set.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {[group.key === NO_SPORT ? null : group.key, set.level, set.gender]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {set.organizationId == null ? "Site" : "Org"}
                      </Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </div>
      </PopoverContent>
    </Popover>
  );
}
