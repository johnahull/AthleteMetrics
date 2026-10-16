import { describe, it, expect } from "vitest";
import {
  METRIC_GROUP_ORDER,
  normalizeCategory,
  sortCodesByGroups,
  groupMetricCodes,
  orderReportData,
} from "../metric-order";
import { EVAL_METRIC_CODES } from "../../api/services/eval-report/metric-key-map";
import { groupForKey } from "../../api/services/eval-report/selection";

const LUCY = [
  "BODY_WEIGHT", "JUMP_CMJ_HOH", "AGILITY_505_M", "DASH_20YD", "FLY10_TIME", "DASH_10YD",
  "BODY_HEIGHT", "TOP_SPEED", "T_TEST", "RSI_105", "DASH_40YD", "DASH_30YD", "MQI_TOTAL",
];

describe("normalizeCategory", () => {
  it("normalizes case and spaces", () => {
    expect(normalizeCategory("Power")).toBe("power");
    expect(normalizeCategory("Body Composition")).toBe("body_composition");
    expect(normalizeCategory("Movement Quality")).toBe("movement");
    expect(normalizeCategory("Acceleration")).toBe("speed");
    expect(normalizeCategory("conditioning")).toBe("endurance");
  });
  it("returns null for unknown or empty", () => {
    expect(normalizeCategory("whatever")).toBeNull();
    expect(normalizeCategory(null)).toBeNull();
    expect(normalizeCategory(undefined)).toBeNull();
  });
});

describe("groupMetricCodes", () => {
  it("orders the Lucy code set by group and built-in order", () => {
    const groups = groupMetricCodes(LUCY, {});
    expect(groups.map((g) => g.group)).toEqual(["speed", "agility", "power", "movement", "body_composition"]);
    expect(groups[0].codes).toEqual(["DASH_10YD", "DASH_20YD", "DASH_30YD", "DASH_40YD", "FLY10_TIME", "TOP_SPEED"]);
    expect(groups[1].codes).toEqual(["AGILITY_505_M", "T_TEST"]);
    expect(groups[2].codes).toEqual(["JUMP_CMJ_HOH", "RSI_105"]);
    expect(groups[4].codes).toEqual(["BODY_HEIGHT", "BODY_WEIGHT"]);
    expect(groups[0].label).toBe("Speed");
  });
  it("puts a custom Strength metric in strength, unknown in other, sorted by code", () => {
    const groups = groupMetricCodes(["ZED", "BENCH", "ALPHA"], { BENCH: "Strength" });
    expect(groups.map((g) => g.group)).toEqual(["strength", "other"]);
    expect(groups[1].codes).toEqual(["ALPHA", "ZED"]);
  });
  it("built-in map beats a conflicting category", () => {
    expect(groupMetricCodes(["DASH_10YD"], { DASH_10YD: "Power" })[0].group).toBe("speed");
  });
  it("keeps 5-10-5 left/right right after the 5-10-5", () => {
    const g = groupMetricCodes(["T_TEST", "AGILITY_5105_R", "AGILITY_5105_L", "AGILITY_5105"], {})[0];
    expect(g.codes).toEqual(["AGILITY_5105", "AGILITY_5105_L", "AGILITY_5105_R", "T_TEST"]);
  });
  it("puts conditioning metrics in endurance", () => {
    const g = groupMetricCodes(["COND_VO2MAX_EST"], { COND_VO2MAX_EST: "conditioning" });
    expect(g.map((x) => x.group)).toEqual(["endurance"]);
  });
  it("handles empty input and drops empty groups", () => {
    expect(groupMetricCodes([], {})).toEqual([]);
  });
  it("group order constant matches the decided order", () => {
    expect(METRIC_GROUP_ORDER.map((g) => g.id)).toEqual([
      "speed", "agility", "power", "strength", "endurance", "flexibility", "movement",
      "sport_specific", "recovery", "body_composition", "custom", "other",
    ]);
  });
});

describe("agrees with eval GROUPS", () => {
  it("maps every eval code to the equivalent group", () => {
    const evalToShared: Record<string, string> = {
      speed: "speed", power: "power", change_of_direction: "agility", movement: "movement",
    };
    for (const [key, code] of Object.entries(EVAL_METRIC_CODES)) {
      const g = groupMetricCodes([code], {})[0].group;
      expect(g, key).toBe(evalToShared[groupForKey(key as keyof typeof EVAL_METRIC_CODES)]);
    }
  });
});

describe("orderReportData", () => {
  const scramble = <T,>(codes: string[], v: T) => Object.fromEntries([...codes].reverse().map((c) => [c, v]));
  const codes = ["BODY_WEIGHT", "JUMP_CMJ_HOH", "DASH_10YD", "T_TEST"];
  const expected = ["DASH_10YD", "T_TEST", "JUMP_CMJ_HOH", "BODY_WEIGHT"];

  it("orders an individual report and preserves every field", () => {
    const data = {
      reportType: "individual",
      generatedAt: "x",
      athlete: {
        id: "a", name: "A",
        measurements: scramble(codes, { value: 1 }),
        percentiles: scramble(codes, 5),
        eventPercentiles: scramble(codes, 6),
        teamAverages: scramble(codes, 7),
        benchmarkComparisons: scramble(codes, []),
        compositeIndex: 3,
      },
      trends: scramble(codes, { a: 1 }),
      distributions: scramble(codes, { b: 2 }),
      metricLabels: scramble(codes, "l"),
    };
    const out = orderReportData(data, {});
    expect(Object.keys(out.athlete.measurements)).toEqual(expected);
    expect(Object.keys(out.athlete.percentiles)).toEqual(expected);
    expect(Object.keys(out.athlete.eventPercentiles)).toEqual(expected);
    expect(Object.keys(out.athlete.teamAverages)).toEqual(expected);
    expect(Object.keys(out.athlete.benchmarkComparisons)).toEqual(expected);
    expect(Object.keys(out.trends)).toEqual(expected);
    expect(Object.keys(out.distributions)).toEqual(expected);
    expect(out.athlete.compositeIndex).toBe(3);
    expect(out.generatedAt).toBe("x");
    expect(out.athlete.measurements.DASH_10YD).toEqual({ value: 1 });
    expect(Object.keys(out.metricLabels).sort()).toEqual([...codes].sort());
    expect(out.metricGroups.map((g: any) => g.group)).toEqual(["speed", "agility", "power", "body_composition"]);
    expect(Object.keys(out).sort()).toEqual([...Object.keys(data), "metricGroups"].sort());
    expect(Object.keys(data.athlete.measurements)[0]).toBe("T_TEST"); // input not mutated
  });

  it("orders a team report, rankings and statistics", () => {
    const data = {
      reportType: "team",
      teamStatistics: codes.map((metric) => ({ metric, average: 1 })),
      athleteRankings: [
        { id: "a", measurements: scramble(codes, { value: 1 }), benchmarkComparisons: scramble(codes, []), percentiles: scramble(codes, 1) },
      ],
      teamTrends: scramble(codes, { t: 1 }),
      teamDistributions: scramble(codes, { d: 1 }),
      athleteCount: 4,
    };
    const out = orderReportData(data, {});
    expect(out.teamStatistics.map((s: any) => s.metric)).toEqual(expected);
    expect(Object.keys(out.athleteRankings[0].measurements)).toEqual(expected);
    expect(Object.keys(out.athleteRankings[0].benchmarkComparisons)).toEqual(expected);
    expect(Object.keys(out.athleteRankings[0].percentiles)).toEqual(expected);
    expect(Object.keys(out.teamTrends)).toEqual(expected);
    expect(Object.keys(out.teamDistributions)).toEqual(expected);
    expect(out.athleteCount).toBe(4);
    expect(out.metricGroups).toHaveLength(4);
  });

  it("works on empty data and non-objects", () => {
    expect(orderReportData({ reportType: "team" }, {}).metricGroups).toEqual([]);
    expect(orderReportData(null as any, {})).toBeNull();
  });
});

describe("sortCodesByGroups", () => {
  const groups = groupMetricCodes(["1600", "DASH_10YD", "BODY_WEIGHT"], { "1600": "Endurance" });
  it("orders by the groups' code order, not by object-key order", () => {
    expect(sortCodesByGroups(["BODY_WEIGHT", "1600", "DASH_10YD"], groups)).toEqual(["DASH_10YD", "1600", "BODY_WEIGHT"]);
  });
  it("keeps codes the groups do not list at the end, and passes through without groups", () => {
    expect(sortCodesByGroups(["X", "DASH_10YD"], groups)).toEqual(["DASH_10YD", "X"]);
    expect(sortCodesByGroups(["B", "A"], undefined)).toEqual(["B", "A"]);
  });
});
