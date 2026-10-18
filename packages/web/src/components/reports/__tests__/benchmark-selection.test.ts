import { describe, it, expect } from "vitest";
import { splitBenchmarkSelection, resolveBenchmarkSelection } from "../benchmark-selection";

describe("splitBenchmarkSelection", () => {
  const site = new Set(["s1", "s2"]);
  const custom = new Set(["c1"]);

  it("splits by membership, preserving order", () => {
    expect(splitBenchmarkSelection(["c1", "s2", "s1"], site, custom, { site: [], custom: [] })).toEqual({
      site: ["s2", "s1"],
      custom: ["c1"],
    });
  });

  it("keeps a stale id in the field it was in, and drops unknown ids", () => {
    expect(
      splitBenchmarkSelection(["stale-site", "stale-custom", "ghost"], site, custom, {
        site: ["stale-site"],
        custom: ["stale-custom"],
      }),
    ).toEqual({ site: ["stale-site"], custom: ["stale-custom"] });
  });
});

describe("resolveBenchmarkSelection", () => {
  const item = (benchmarkId: string, benchmarkType: "site" | "custom") => ({ benchmarkId, benchmarkType });

  it("unions set items with individual picks, split by type and deduped", () => {
    const sets = [
      { items: [item("s1", "site"), item("c1", "custom")] },
      { items: [item("s1", "site"), item("s2", "site")] },
    ];
    expect(resolveBenchmarkSelection(sets, ["s2", "s3"], ["c1", "c2"])).toEqual({
      site: ["s1", "s2", "s3"],
      custom: ["c1", "c2"],
    });
  });

  it("returns only the picks when no set is chosen", () => {
    expect(resolveBenchmarkSelection([], ["s1"], [])).toEqual({ site: ["s1"], custom: [] });
  });
});
