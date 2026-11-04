import { describe, it, expect } from "vitest";
import { midRankPercentile, percentile, MIN_NORM_N } from "../percentile";
import { sexOf } from "../tier-match";

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("midRankPercentile", () => {
  it("counts ties as half", () => {
    expect(midRankPercentile([1, 2, 2, 3], 2)).toBe(50);
    expect(midRankPercentile([1, 2, 3, 4], 3)).toBe(62.5);
  });
});

describe("percentile", () => {
  it("MIN_NORM_N is 30", () => expect(MIN_NORM_N).toBe(30));
  it("is null below minN, for non-finite x and for NaN values", () => {
    expect(percentile(range(29), 5, "higher_is_better")).toBeNull();
    expect(percentile(range(30), Number.NaN, "higher_is_better")).toBeNull();
    expect(percentile(range(30), Infinity, "higher_is_better")).toBeNull();
    expect(percentile([...range(29), Number.NaN], 5, "higher_is_better")).toBeNull();
  });
  it("empty values with minN 0 is null, not NaN", () => expect(percentile([], 1, "higher_is_better", 0)).toBeNull());
  it("honours a custom minN", () => expect(percentile([1, 2, 3], 2, "higher_is_better", 3)).toBe(50));
  it("inverts for lower_is_better", () => {
    const hi = percentile(range(30), 10, "higher_is_better")!;
    expect(percentile(range(30), 10, "lower_is_better")).toBeCloseTo(100 - hi);
  });
  it("does not need sorted input", () => {
    const v = range(40);
    expect(percentile([...v].reverse(), 12.5, "higher_is_better")).toBe(percentile(v, 12.5, "higher_is_better"));
  });
  it("clamps near 0 below min and near 100 above max, not null", () => {
    expect(percentile(range(30), -5, "higher_is_better")).toBe(0);
    expect(percentile(range(30), 99, "higher_is_better")).toBe(100);
  });
  it("all ties give 50", () => expect(percentile(Array(30).fill(7), 7, "lower_is_better")).toBe(50));
});

describe("sexOf export", () => {
  it("maps gender text", () => {
    expect(sexOf("Male")).toBe("male");
    expect(sexOf("Not Specified")).toBeNull();
  });
});
