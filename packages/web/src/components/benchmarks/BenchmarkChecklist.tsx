/**
 * BenchmarkChecklist - inline multi-select with search, filter chips and group headings.
 * Search and chips sit outside the scroll area. "Select visible" / "Clear visible" act on the
 * filtered rows only and merge with the rest of the selection.
 */

import { useId, useMemo, useState, type ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useMetricConfig } from "@/hooks/use-metric-config";
import { deriveTierGroupName } from "@shared/benchmark-utils";
import { cn } from "@/lib/utils";
import {
  applyChipFilters,
  availableChipValues,
  chipsFromContext,
  groupBy as groupItems,
  matchesSearch,
  type ChipMeta,
  type ChipSelection,
  type ChipType,
  type FilterContext,
} from "./benchmark-filtering";

export interface BenchmarkChecklistMeta extends ChipMeta {
  metricCode?: string | null;
  tierGroupId?: string | null;
  tierName?: string | null;
}

export interface BenchmarkChecklistProps<T> {
  items: T[];
  /** The value stored in the selection (differs per consumer) */
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  getMeta: (item: T) => BenchmarkChecklistMeta;
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Group key per item; defaults to the metric code. An empty key renders no heading. */
  groupBy?: (item: T) => string;
  /** Smart default chips, used until the user touches a chip */
  context?: FilterContext;
  /** Secondary content under the label */
  renderDetail?: (item: T) => ReactNode;
  /** Label of a tier-group checkbox; defaults to the derived name of its first tier */
  getTierGroupLabel?: (tiers: T[]) => string;
  className?: string;
  /** Overrides the default height of the scroll area */
  listClassName?: string;
}

const CHIP_GROUPS: Array<{ type: ChipType; label: string }> = [
  { type: "gender", label: "Gender" },
  { type: "level", label: "Level" },
  { type: "source", label: "Source" },
];

const CHIP_LABELS: Record<string, string> = {
  college: "College",
  high_school: "High School",
  club: "Club",
  static: "Static",
  peer_percentile: "Peer percentile",
};

const chipLabel = (value: string) =>
  CHIP_LABELS[value] ?? value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function BenchmarkChecklist<T>({
  items,
  getKey,
  getLabel,
  getMeta,
  selected,
  onChange,
  groupBy,
  context,
  renderDetail,
  getTierGroupLabel,
  className,
  listClassName,
}: BenchmarkChecklistProps<T>) {
  const uid = useId();
  const { getMetricConfig } = useMetricConfig();
  const [query, setQuery] = useState("");
  // null until the user touches a chip; until then the (possibly changing) context drives the chips
  const [userChips, setUserChips] = useState<ChipSelection | null>(null);

  const available = useMemo(() => availableChipValues(items, getMeta), [items, getMeta]);

  const chips = useMemo(() => userChips ?? chipsFromContext(context, available), [userChips, context, available]);

  const visible = useMemo(
    () =>
      applyChipFilters(items, chips, getMeta).filter((item) =>
        matchesSearch([getLabel(item), getMeta(item).metricCode], query),
      ),
    [items, chips, query, getMeta, getLabel],
  );

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const keyOf = (item: T) => getKey(item);
  const groupKey = (item: T) => (groupBy ? groupBy(item) : getMeta(item).metricCode ?? "");
  const groups = useMemo(
    () => groupItems(visible, groupKey, undefined, (a, b) => a.localeCompare(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, groupBy, getMeta],
  );

  const toggleChip = (type: ChipType, value: string) =>
    setUserChips(() => {
      const current = chips[type] ?? [];
      return { ...chips, [type]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] };
    });

  const hasActiveChips = Object.values(chips).some((v) => v && v.length > 0);

  const addKeys = (keys: string[]) => onChange([...new Set([...selected, ...keys])]);
  const removeKeys = (keys: string[]) => {
    const drop = new Set(keys);
    onChange(selected.filter((k) => !drop.has(k)));
  };
  const toggle = (key: string, checked: boolean) => (checked ? addKeys([key]) : removeKeys([key]));

  const visibleKeys = visible.map(keyOf);

  const tierTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of items) {
      const tierId = getMeta(item).tierGroupId;
      if (tierId) totals.set(tierId, (totals.get(tierId) ?? 0) + 1);
    }
    return totals;
  }, [items, getMeta]);

  const renderRow = (item: T) => {
    const key = keyOf(item);
    const id = `${uid}-${key}`;
    return (
      <div key={key} className="flex items-start gap-x-2 py-1">
        <Checkbox
          id={id}
          checked={selectedSet.has(key)}
          onCheckedChange={(checked) => toggle(key, checked === true)}
          className="mt-0.5"
          aria-describedby={renderDetail ? `${id}-detail` : undefined}
        />
        <div className="flex-1">
          <Label htmlFor={id} className="cursor-pointer">
            {getLabel(item)}
          </Label>
          {renderDetail && <div id={`${id}-detail`}>{renderDetail(item)}</div>}
        </div>
      </div>
    );
  };

  const renderGroupBody = (list: T[], groupId: string) => {
    const tierGroups = new Map<string, T[]>();
    const rest: T[] = [];
    for (const item of list) {
      const tierId = getMeta(item).tierGroupId;
      if (tierId) tierGroups.set(tierId, [...(tierGroups.get(tierId) ?? []), item]);
      else rest.push(item);
    }
    return (
      <>
        {[...tierGroups].map(([tierId, tiers]) => {
          const keys = tiers.map(keyOf);
          const count = keys.filter((k) => selectedSet.has(k)).length;
          const id = `${uid}-${groupId}-tier-${tierId}`;
          const name = getTierGroupLabel ? getTierGroupLabel(tiers) : deriveTierGroupName(getLabel(tiers[0]));
          return (
            <div key={tierId} className="flex items-center gap-x-2 py-1">
              <Checkbox
                id={id}
                checked={count === keys.length ? true : count > 0 ? "indeterminate" : false}
                onCheckedChange={(checked) => (checked === true ? addKeys(keys) : removeKeys(keys))}
              />
              <Label htmlFor={id} className="cursor-pointer">
                {name} <span className="text-muted-foreground text-xs">({tiers.length < (tierTotals.get(tierId) ?? 0) ? `${tiers.length} of ${tierTotals.get(tierId)}` : tiers.length} tiers)</span>
              </Label>
            </div>
          );
        })}
        {rest.map(renderRow)}
      </>
    );
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search benchmarks"
        aria-label="Search benchmarks"
      />
      {CHIP_GROUPS.filter(({ type }) => available[type]).map(({ type, label }) => (
        <div key={type} role="group" aria-label={label} className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1" aria-hidden="true">
            {label}
          </span>
          {available[type]!.map((value) => {
            const pressed = chips[type]?.includes(value) ?? false;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={pressed}
                onClick={() => toggleChip(type, value)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                  pressed ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted",
                )}
              >
                {type === "gender" ? value : chipLabel(value)}
              </button>
            );
          })}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <span aria-live="polite" className="text-xs text-muted-foreground mr-auto">
          {visible.length} of {items.length} shown
        </span>
        {hasActiveChips && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setUserChips({})}>
            Clear filters
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => addKeys(visibleKeys)} disabled={visible.length === 0}>
          Select visible
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => removeKeys(visibleKeys)} disabled={visible.length === 0}>
          Clear visible
        </Button>
      </div>
      <div className={cn("space-y-3 border rounded-lg p-3 max-h-64 overflow-y-auto", listClassName)}>
        {groups.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No benchmarks match.</p>}
        {groups.map(({ key, items: list }) => {
          const headingId = `${uid}-heading-${key}`;
          const heading = key ? `${getMetricConfig(key)?.label ?? key} (${list.filter((i) => selectedSet.has(keyOf(i))).length}/${list.length})` : null;
          return (
            <div key={key} role="group" aria-labelledby={heading ? headingId : undefined}>
              {heading && (
                <h5 id={headingId} className="text-sm font-semibold mb-1">
                  {heading}
                </h5>
              )}
              {renderGroupBody(list, key)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
