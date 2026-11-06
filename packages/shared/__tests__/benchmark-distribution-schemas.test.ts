import { describe, it, expect } from "vitest";
import { createBenchmarkDistributionSchema } from "../benchmark-distribution-schemas";

const row = (o: Record<string, unknown> = {}) => ({
  metricCode: "FLY10_TIME", sex: "male", ageMin: 10, ageMax: 12, kind: "raw", n: 3, values: [1, 2, 3], ...o,
});
const ok = (distributions: unknown[], extra: Record<string, unknown> = {}) =>
  createBenchmarkDistributionSchema.safeParse({ label: "L", source: "S", distributions, ...extra });

describe("createBenchmarkDistributionSchema", () => {
  it("accepts a valid body", () => expect(ok([row()]).success).toBe(true));
  it("rejects unknown keys, empty distributions, empty label", () => {
    expect(ok([row()], { extra: 1 }).success).toBe(false);
    expect(ok([]).success).toBe(false);
    expect(ok([row()], { label: "" }).success).toBe(false);
    expect(ok([row({ extra: 1 })]).success).toBe(false);
  });
  it("rejects control characters in source, accepts normal text", () => {
    expect(ok([row()], { source: "bad\u0000source" }).success).toBe(false);
    expect(ok([row()], { source: "Combine 2024, n=1,200" }).success).toBe(true);
  });
  it("rejects control characters in notes, accepts normal and absent notes", () => {
    expect(ok([row()], { notes: "bad\u0007note" }).success).toBe(false);
    expect(ok([row()], { notes: "Line one.\nLine two" }).success).toBe(true);
    expect(ok([row()]).success).toBe(true);
  });
  it("rejects bad sex, kind, ages, non-finite or empty values", () => {
    expect(ok([row({ sex: "x" })]).success).toBe(false);
    expect(ok([row({ kind: "quantiles" })]).success).toBe(false);
    expect(ok([row({ ageMin: 13 })]).success).toBe(false);
    expect(ok([row({ ageMax: 100 })]).success).toBe(false);
    expect(ok([row({ values: [1, Infinity, 3] })]).success).toBe(false);
    expect(ok([row({ values: [], n: 0 })]).success).toBe(false);
  });
  it("requires n === values.length for raw", () => {
    expect(ok([row({ n: 4 })]).success).toBe(false);
  });
  it("caps distributions at 500 rows", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => row({ ageMin: i % 100, ageMax: i % 100, metricCode: `M${Math.floor(i / 100)}` }));
    expect(ok(many(500)).success).toBe(true);
    expect(ok(many(501)).success).toBe(false);
  });
  it("compares each band to the running max ageMax and names the right band", () => {
    const r = ok([row({ ageMin: 10, ageMax: 20 }), row({ ageMin: 12, ageMax: 13 }), row({ ageMin: 14, ageMax: 15 })]);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.path.join("."))).toEqual(["distributions.1.ageMin", "distributions.2.ageMin"]);
  });
  it("rejects overlapping and duplicate bands per (metric, sex) but allows other keys", () => {
    expect(ok([row(), row({ ageMin: 12, ageMax: 14 })]).success).toBe(false);
    expect(ok([row(), row()]).success).toBe(false);
    expect(ok([row({ ageMin: 13, ageMax: 14 }), row()]).success).toBe(true);
    expect(ok([row(), row({ sex: "female" }), row({ metricCode: "X" })]).success).toBe(true);
  });
});
