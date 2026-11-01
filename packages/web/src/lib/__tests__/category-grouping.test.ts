import { describe, it, expect } from "vitest";
import { groupByCategory, groupByCategoryThenMetric } from "../category-grouping";

interface M {
  code: string;
  category?: string | null;
}

const m = (code: string, category?: string | null): M => ({ code, category });
const cat = (x: M) => x.category;

describe("groupByCategory", () => {
  it("returns no groups for empty input", () => {
    expect(groupByCategory([], cat)).toEqual([]);
  });

  it("merges differently-cased spellings of one category into one group", () => {
    const groups = groupByCategory([m("a", "Speed"), m("b", "speed"), m("c", " SPEED ")], cat);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe("speed");
    expect(groups[0].label).toBe("Speed");
    expect(groups[0].items.map((i) => i.code)).toEqual(["a", "b", "c"]);
  });

  it("applies the same aliases as reports (Acceleration -> speed, Movement Quality -> movement)", () => {
    const groups = groupByCategory([m("a", "Acceleration"), m("b", "Movement Quality")], cat);
    expect(groups.map((g) => g.id)).toEqual(["speed", "movement"]);
  });

  it("orders known groups like METRIC_GROUP_ORDER regardless of input order", () => {
    const groups = groupByCategory([m("s", "strength"), m("p", "power"), m("a", "agility"), m("v", "speed")], cat);
    expect(groups.map((g) => g.id)).toEqual(["speed", "agility", "power", "strength"]);
  });

  it("puts null and empty categories in Other, last", () => {
    const groups = groupByCategory([m("x", null), m("y", ""), m("z", undefined), m("s", "speed")], cat);
    expect(groups.map((g) => g.id)).toEqual(["speed", "other"]);
    expect(groups[1].label).toBe("Other");
    expect(groups[1].items.map((i) => i.code)).toEqual(["x", "y", "z"]);
  });

  it("gives an unknown category its own group after known ones and before Other", () => {
    const groups = groupByCategory([m("n", null), m("p", "Plyometrics"), m("s", "speed")], cat);
    expect(groups.map((g) => g.label)).toEqual(["Speed", "Plyometrics", "Other"]);
  });

  it("builds ids for unknown categories without characters that need CSS escaping", () => {
    const groups = groupByCategory([m("p", "Plyometrics")], cat);
    expect(groups[0].id).toBe("custom--plyometrics");
    expect(groups[0].id).toMatch(/^[a-z0-9_-]+$/);
  });

  it("slugs multi-word custom categories and keeps ids unique when slugs collide", () => {
    const groups = groupByCategory([m("a", "Speed Skating"), m("b", "speed-skating")], cat);
    expect(groups.map((g) => g.label)).toEqual(["Speed Skating", "speed-skating"]);
    expect(groups.map((g) => g.id)).toEqual(["custom--speed-skating", "custom--speed-skating-2"]);
  });

  it("merges unknown categories that differ only by case, keeping the first-seen label", () => {
    const groups = groupByCategory([m("a", "Plyometrics"), m("b", "plyometrics")], cat);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Plyometrics");
    expect(groups[0].items).toHaveLength(2);
  });

  it("keeps item order within a group", () => {
    const groups = groupByCategory([m("b", "speed"), m("a", "speed")], cat);
    expect(groups[0].items.map((i) => i.code)).toEqual(["b", "a"]);
  });
});

describe("groupByCategoryThenMetric", () => {
  interface B {
    id: string;
    metricCode: string;
    tierGroupId?: string | null;
    tierOrder?: number | null;
  }
  const b = (id: string, metricCode: string, tierGroupId?: string, tierOrder?: number): B => ({
    id,
    metricCode,
    tierGroupId,
    tierOrder,
  });
  const categories: Record<string, string | null> = {
    DASH_40YD: "Speed",
    FLY10_TIME: "speed",
    VERTICAL_JUMP: "power",
  };
  const run = (items: B[]) =>
    groupByCategoryThenMetric(
      items,
      (i) => i.metricCode,
      (code) => categories[code],
    );

  it("nests metrics inside their category", () => {
    const groups = run([b("1", "VERTICAL_JUMP"), b("2", "DASH_40YD"), b("3", "FLY10_TIME"), b("4", "DASH_40YD")]);
    expect(groups.map((g) => g.id)).toEqual(["speed", "power"]);
    expect(groups[0].items.map((s) => s.metricCode)).toEqual(["DASH_40YD", "FLY10_TIME"]);
    expect(groups[0].items[0].items.map((i) => i.id)).toEqual(["2", "4"]);
  });

  it("counts every benchmark in the category total", () => {
    const groups = run([b("1", "DASH_40YD"), b("2", "FLY10_TIME"), b("3", "DASH_40YD")]);
    expect(groups[0].count).toBe(3);
  });

  it("sends a metric with no known category to Other", () => {
    const groups = run([b("1", "MYSTERY_CODE")]);
    expect(groups.map((g) => g.id)).toEqual(["other"]);
  });

  it("keeps tier-group members adjacent and ordered by tierOrder", () => {
    const groups = run([
      b("gold", "DASH_40YD", "t1", 2),
      b("solo", "DASH_40YD"),
      b("bronze", "DASH_40YD", "t1", 1),
    ]);
    expect(groups[0].items[0].items.map((i) => i.id)).toEqual(["bronze", "gold", "solo"]);
  });
});
