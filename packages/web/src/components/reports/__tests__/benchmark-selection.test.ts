import { describe, it, expect } from "vitest";
import { splitBenchmarkSelection } from "../benchmark-selection";

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
