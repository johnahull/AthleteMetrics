import { describe, it, expect } from "vitest";
import {
  matchesSearch,
  applyChipFilters,
  availableChipValues,
  groupBy,
  chipsFromContext,
  type ChipMeta,
} from "../benchmark-filtering";

interface Item {
  id: string;
  meta: ChipMeta;
}
const getMeta = (i: Item) => i.meta;

const items: Item[] = [
  { id: "a", meta: { sport: "Soccer", level: "D1", gender: "Female", source: "Site" } },
  { id: "b", meta: { sport: "Soccer", level: "HS", gender: "Male", source: "Org" } },
  { id: "c", meta: { sport: "Volleyball", level: "D1", gender: null, source: "Site" } },
  { id: "d", meta: { sport: "Volleyball", level: "HS", gender: "Female", source: "Org" } },
];
const ids = (list: Item[]) => list.map((i) => i.id);

describe("matchesSearch", () => {
  it("matches every word case-insensitively across fields", () => {
    expect(matchesSearch(["NCAA D1 Women's Soccer", "SOCCER", "Female"], "d1 soccer")).toBe(true);
  });
  it("fails when any word is missing", () => {
    expect(matchesSearch(["NCAA D1 Women's Soccer"], "d1 volleyball")).toBe(false);
  });
  it("matches everything for an empty query and ignores null fields", () => {
    expect(matchesSearch([null, undefined, "x"], "  ")).toBe(true);
    expect(matchesSearch([null, undefined], "x")).toBe(false);
  });
});

describe("applyChipFilters", () => {
  it("returns everything when no chips are on", () => {
    expect(ids(applyChipFilters(items, {}, getMeta))).toEqual(["a", "b", "c", "d"]);
  });
  it("ORs values within one chip type", () => {
    expect(ids(applyChipFilters(items, { level: ["D1", "HS"] }, getMeta))).toEqual(["a", "b", "c", "d"]);
  });
  it("ANDs across chip types", () => {
    expect(ids(applyChipFilters(items, { sport: ["Soccer"], level: ["HS"] }, getMeta))).toEqual(["b"]);
  });
  it("keeps null-gender items when a gender chip is on", () => {
    expect(ids(applyChipFilters(items, { gender: ["Female"] }, getMeta))).toEqual(["a", "c", "d"]);
  });
  it("drops items with a null value for other chip types", () => {
    const withNullSport: Item[] = [...items, { id: "e", meta: { sport: null } }];
    expect(ids(applyChipFilters(withNullSport, { sport: ["Soccer"] }, getMeta))).toEqual(["a", "b"]);
  });
});

describe("availableChipValues", () => {
  it("lists distinct sorted values and omits chip types with no values", () => {
    const got = availableChipValues(items, getMeta);
    expect(got.sport).toEqual(["Soccer", "Volleyball"]);
    expect(got.gender).toEqual(["Female", "Male"]);
    expect(got.level).toEqual(["D1", "HS"]);
    expect(availableChipValues([{ id: "x", meta: {} }], getMeta)).toEqual({});
  });
});

describe("groupBy", () => {
  it("groups in first-seen order unless sorted", () => {
    const groups = groupBy(items, (i) => i.meta.sport ?? "Other");
    expect(groups.map((g) => g.key)).toEqual(["Soccer", "Volleyball"]);
    expect(ids(groups[1].items)).toEqual(["c", "d"]);
  });
  it("sorts groups and items when comparators are given", () => {
    const groups = groupBy(
      items,
      (i) => i.meta.sport ?? "Other",
      (a, b) => b.id.localeCompare(a.id),
      (a, b) => b.localeCompare(a),
    );
    expect(groups.map((g) => g.key)).toEqual(["Volleyball", "Soccer"]);
    expect(ids(groups[0].items)).toEqual(["d", "c"]);
  });
});

describe("chipsFromContext", () => {
  const available = { sport: ["Soccer", "Volleyball"], gender: ["Female", "Male"] };
  it("maps case-insensitively to the available value", () => {
    expect(chipsFromContext({ sports: ["SOCCER"], gender: "female" }, available)).toEqual({
      sport: ["Soccer"],
      gender: ["Female"],
    });
  });
  it("gives no chip for gender 'all' or a missing gender", () => {
    expect(chipsFromContext({ gender: "all" }, available)).toEqual({});
    expect(chipsFromContext({}, available)).toEqual({});
  });
  it("gives no chips when the context matches nothing", () => {
    expect(chipsFromContext({ sports: ["Hockey"], gender: "Not Specified" }, available)).toEqual({});
  });
});
