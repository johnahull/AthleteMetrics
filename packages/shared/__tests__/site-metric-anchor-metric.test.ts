/**
 * Site metric admin schemas must keep calculationConfig.anchorMetric (AM-FEAT-018):
 * zod strips unknown keys, and the PATCH replaces calculationConfig wholesale, so a
 * schema without it would silently drop the anchor when an admin edits the metric.
 */
import { describe, it, expect } from "vitest";
import { insertSiteMetricSchema, updateSiteMetricSchema } from "../schema-original";

const config = { dateMatchStrategy: "closest", maxDateDifference: 45, missingSourceBehavior: "skip", anchorMetric: "FLY10_TIME" } as const;

describe("site metric schemas: anchorMetric", () => {
  it("update keeps anchorMetric", () => {
    const r = updateSiteMetricSchema.parse({ isDerived: true, formula: "a / b", dependentMetrics: ["FLY10_TIME", "WEIGHT_LBS"], calculationConfig: config });
    expect(r.calculationConfig?.anchorMetric).toBe("FLY10_TIME");
  });

  it("insert keeps anchorMetric", () => {
    const r = insertSiteMetricSchema.parse({ code: "X_MOM", label: "X", isDerived: true, formula: "a / b", dependentMetrics: ["FLY10_TIME", "WEIGHT_LBS"], calculationConfig: config });
    expect(r.calculationConfig?.anchorMetric).toBe("FLY10_TIME");
  });

  it("update rejects an anchorMetric that is not one of dependentMetrics", () => {
    const r = updateSiteMetricSchema.safeParse({ isDerived: true, formula: "a / b", dependentMetrics: ["WEIGHT_LBS", "HEIGHT"], calculationConfig: config });
    expect(r.success).toBe(false);
  });

  it("insert rejects an anchorMetric that is not one of dependentMetrics", () => {
    const r = insertSiteMetricSchema.safeParse({ code: "X_MOM", label: "X", isDerived: true, formula: "a / b", dependentMetrics: ["WEIGHT_LBS", "HEIGHT"], calculationConfig: config });
    expect(r.success).toBe(false);
  });

  it("anchorMetric matching is case-insensitive", () => {
    const r = updateSiteMetricSchema.safeParse({ dependentMetrics: ["fly10_time", "weight_lbs"], calculationConfig: config });
    expect(r.success).toBe(true);
  });

  it("update without dependentMetrics in the patch is accepted (cannot be checked)", () => {
    expect(updateSiteMetricSchema.safeParse({ calculationConfig: config }).success).toBe(true);
  });
});
