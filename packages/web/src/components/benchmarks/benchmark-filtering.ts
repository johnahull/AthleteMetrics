/**
 * Pure search / chip / grouping logic shared by the benchmark and benchmark-set pickers.
 * No React: the pickers only render what these functions return.
 */

export type ChipType = "sport" | "level" | "gender" | "source";

export interface ChipMeta {
  sport?: string | null;
  level?: string | null;
  gender?: string | null;
  source?: string | null;
}

export type ChipSelection = Partial<Record<ChipType, string[]>>;
export type ChipOptions = Partial<Record<ChipType, string[]>>;

export interface FilterContext {
  sports?: string[];
  /** "all" and empty mean no preference */
  gender?: string;
}

const CHIP_TYPES: ChipType[] = ["sport", "level", "gender", "source"];

/** Every word of the query must appear in at least one field (case-insensitive). */
export function matchesSearch(fields: Array<string | null | undefined>, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fields.filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => haystack.includes(w));
}

/**
 * AND across chip types, OR within one type. A null gender means "applies to everyone",
 * so it stays visible under any gender chip; a null value for any other type does not match.
 */
export function applyChipFilters<T>(items: T[], chips: ChipSelection, getMeta: (item: T) => ChipMeta): T[] {
  const active = CHIP_TYPES.filter((t) => (chips[t]?.length ?? 0) > 0);
  if (active.length === 0) return items;
  return items.filter((item) => {
    const meta = getMeta(item);
    return active.every((type) => {
      const value = meta[type];
      if (value == null || value === "") return type === "gender";
      return chips[type]!.includes(value);
    });
  });
}

/** Distinct sorted values per chip type; a type with no values is omitted so its chips stay hidden. */
export function availableChipValues<T>(items: T[], getMeta: (item: T) => ChipMeta): ChipOptions {
  const out: ChipOptions = {};
  for (const type of CHIP_TYPES) {
    const values = new Set<string>();
    for (const item of items) {
      const v = getMeta(item)[type];
      if (v) values.add(v);
    }
    if (values.size > 0) out[type] = [...values].sort((a, b) => a.localeCompare(b));
  }
  return out;
}

/** Groups in first-seen order unless comparators are given. */
export function groupBy<T>(
  items: T[],
  keyFn: (item: T) => string,
  sortItems?: (a: T, b: T) => number,
  sortKeys?: (a: string, b: string) => number,
): Array<{ key: string; items: T[] }> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  const groups = [...map].map(([key, list]) => ({ key, items: sortItems ? [...list].sort(sortItems) : list }));
  return sortKeys ? groups.sort((a, b) => sortKeys(a.key, b.key)) : groups;
}

/** Turns "who is looking" into starting chips, keeping only values that exist in the list. */
export function chipsFromContext(context: FilterContext | undefined, available: ChipOptions): ChipSelection {
  const out: ChipSelection = {};
  if (!context) return out;
  const canonical = (type: ChipType, wanted: string) =>
    available[type]?.find((v) => v.toLowerCase() === wanted.trim().toLowerCase());

  const sports = (context.sports ?? []).map((s) => canonical("sport", s)).filter((v): v is string => !!v);
  if (sports.length > 0) out.sport = [...new Set(sports)];

  const gender = context.gender && context.gender.toLowerCase() !== "all" ? canonical("gender", context.gender) : undefined;
  if (gender) out.gender = [gender];
  return out;
}
