import { describe, it, expect } from "vitest";
import { templateToFormValues, formToTemplate, type ReportTemplateData } from "../report-template";
import { DEFAULT_CHART_SELECTION } from "@shared/report-charts";

const template: ReportTemplateData = {
  id: "t1",
  name: "Speed",
  description: null,
  metrics: ["FLY10_TIME", "OLD_METRIC"],
  benchmarkSetIds: ["set-a", "set-gone"],
  siteBenchmarkIds: ["s1", "s-gone"],
  customBenchmarkIds: ["c1"],
  charts: { team: { trends: false }, individual: { radar: false } },
};

const available = {
  enabledMetricCodes: new Set(["FLY10_TIME"]),
  availableSetIds: new Set(["set-a"]),
  enabledBenchmarkIds: { site: new Set(["s1"]), custom: new Set(["c1"]) },
};

describe("templateToFormValues", () => {
  it("drops unavailable items directly and counts them", () => {
    const { values, droppedCount } = templateToFormValues(template, "team", available);
    expect(values.metrics).toEqual(["FLY10_TIME"]);
    expect(values.benchmarkSetIds).toEqual(["set-a"]);
    expect(values.siteBenchmarks).toEqual(["s1"]);
    expect(values.customBenchmarks).toEqual(["c1"]);
    expect(droppedCount).toBe(3);
  });

  it("merges the current report type's charts over the defaults", () => {
    expect(templateToFormValues(template, "team", available).values.charts).toEqual({
      ...DEFAULT_CHART_SELECTION,
      trends: false,
    });
    expect(templateToFormValues(template, "individual", available).values.charts).toEqual({
      ...DEFAULT_CHART_SELECTION,
      radar: false,
    });
  });

  it("uses defaults when the template has no charts for the type", () => {
    const { values } = templateToFormValues({ ...template, charts: {} }, "team", available);
    expect(values.charts).toEqual(DEFAULT_CHART_SELECTION);
  });
});

describe("formToTemplate", () => {
  const form = {
    metrics: ["FLY10_TIME"],
    benchmarkSetIds: ["set-a"],
    siteBenchmarks: ["s1"],
    customBenchmarks: [],
    charts: { ...DEFAULT_CHART_SELECTION, benchmarkStanding: false },
  };

  it("saves current-type charts over the template's other-type charts", () => {
    const out = formToTemplate(form, "team", { charts: { individual: { radar: false } } });
    expect(out).toMatchObject({
      metrics: ["FLY10_TIME"],
      benchmarkSetIds: ["set-a"],
      siteBenchmarkIds: ["s1"],
      customBenchmarkIds: [],
    });
    expect(out.charts.individual).toEqual({ radar: false });
    expect(out.charts.team).toEqual({
      benchmarkStanding: false,
      trends: true,
      boxSwarm: true,
      leaderboard: true,
      tierDistribution: true,
    });
  });

  it("saves only the individual chart keys for an individual report", () => {
    const out = formToTemplate(form, "individual", undefined);
    expect(Object.keys(out.charts)).toEqual(["individual"]);
    expect(out.charts.individual).toEqual({
      radar: true,
      benchmarkStanding: false,
      trends: true,
      distribution: true,
      fvProfile: true,
    });
  });
});
