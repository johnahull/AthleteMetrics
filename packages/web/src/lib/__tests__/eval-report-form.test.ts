/**
 * Unit tests for the eval report selection form rules (AM-FEAT-019 P5)
 */

import { describe, it, expect } from "vitest";
import {
  applyPresetSwitch,
  autoCollegeGauge,
  buildInitialValues,
  presetValues,
  toOrgSelection,
  toRequest,
  type EvalFormValues,
  type PresetField,
} from "../eval-report-form";
import type { EvalDefaults, EvalOfferedMetric, EvalReportSettings } from "@/hooks/use-eval-report";

const offered: EvalOfferedMetric[] = [
  { code: "DASH_10YD", key: "DASH_10", label: "10-yard dash", group: "speed", checked: true },
  { code: "JUMP_CMJ_HOH", key: "CMJ_HOH", label: "Jump height", group: "power", checked: true },
  { code: "AGILITY_505_YD_LSI", key: "505_LSI", label: "Left-right balance", group: "movement", checked: true },
  { code: "MQI_TOTAL", key: "MQI", label: "Movement", group: "movement", checked: true },
  { code: "VERTICAL_JUMP", key: null, label: "Hands-free jump height", group: "power", checked: false },
];
const defaults = (over: Partial<EvalDefaults> = {}): EvalDefaults => ({
  source: "computed",
  selection: { preset: "high_school", metricKeys: ["DASH_10", "CMJ_HOH", "505_LSI", "MQI"] },
  load: null,
  coachNote: null,
  offered: { headline: offered.slice(0, 4), available: offered.slice(4) },
  ...over,
});
const base: EvalFormValues = {
  preset: "high_school",
  metricKeys: ["DASH_10", "CMJ_HOH", "VERTICAL_JUMP", "MQI"],
  collegeGauge: null,
  metricCollegeGauge: { DASH_10: true, GONE: true },
  freshAndHealthy: true,
  coachNoteOn: true,
  strengthsOn: true,
  retestTrend: true,
  radar: false,
  load: "none",
  coachNote: "",
  strengths: null,
  developmentAreas: null,
  limiter: null,
};

describe("autoCollegeGauge", () => {
  it("is on only for seniors, and never under 14", () => {
    expect(autoCollegeGauge("senior", 17)).toBe(true);
    expect(autoCollegeGauge("high_school", 16)).toBe(false);
    expect(autoCollegeGauge("middle_school", 12)).toBe(false);
    expect(autoCollegeGauge("senior", 13)).toBe(false);
    expect(autoCollegeGauge("senior", null)).toBe(true);
  });
});

describe("toRequest", () => {
  const ctx = { offered, hasPrior: true };

  it("keeps report order, drops per-metric switches of unselected metrics and leaves untouched fields out", () => {
    const built = toRequest(base, ctx);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.body.selection?.metricKeys).toEqual(["DASH_10", "CMJ_HOH", "MQI", "VERTICAL_JUMP"]);
    expect(built.body.selection?.metricCollegeGauge).toEqual({ DASH_10: true });
    expect(built.body.selection).not.toHaveProperty("collegeGauge");
    expect(built.body).not.toHaveProperty("strengthsOverride");
    expect(built.body).not.toHaveProperty("limiterOverride");
    expect(built.body.load).toBeNull();
    expect(built.body.coachNote).toBeNull();
  });

  it("only overrides with selected metrics that can be ranked (not Movement, not code-only metrics)", () => {
    const built = toRequest({ ...base, strengths: ["DASH_10", "MQI", "VERTICAL_JUMP", "505_LSI"], limiter: "VERTICAL_JUMP" }, ctx);
    expect(built.ok && built.body.strengthsOverride).toEqual(["DASH_10"]);
    expect(built.ok && built.body.limiterOverride).toBeNull();
  });

  it("turns the retest trend off when there is no earlier evaluation", () => {
    const built = toRequest(base, { offered, hasPrior: false });
    expect(built.ok && built.body.selection?.sections?.retestTrend).toBe(false);
  });

  it("rejects a note over the limit with the shared schema's message", () => {
    const built = toRequest({ ...base, coachNote: "x".repeat(2001) }, ctx);
    expect(built.ok).toBe(false);
  });
});

describe("presetValues and buildInitialValues", () => {
  const settings: EvalReportSettings = {
    presets: { high_school: { metricKeys: ["DASH_10", "VERTICAL_JUMP"], freshAndHealthy: false } },
    lastSelection: {
      preset: "senior", metricKeys: ["CMJ_HOH"], collegeGauge: true, headline: true,
      freshAndHealthy: true, coachNote: true, strengths: true, retestTrend: true,
    },
  };

  it("applies the org's saved preset, and the last selection only when it used the same preset", () => {
    const hs = presetValues("high_school", settings, 16, offered, ["DASH_10"]);
    expect(hs.metricKeys).toEqual(["DASH_10", "VERTICAL_JUMP"]);
    expect(hs.freshAndHealthy).toBe(false);
    const senior = presetValues("senior", settings, 17, offered, ["DASH_10"]);
    expect(senior.metricKeys).toEqual(["CMJ_HOH"]);
    expect(senior.collegeGauge).toBe(true);
  });

  it("never forces a remembered college gauge on for an athlete under 14", () => {
    expect(presetValues("senior", settings, 12, offered, []).collegeGauge).toBeNull();
  });

  it("a saved eval for this athlete beats the org's remembered values", () => {
    const initial = buildInitialValues({
      defaults: defaults({
        source: "saved",
        selection: { preset: "high_school", metricKeys: ["505_LSI"], sections: { freshAndHealthy: true, radar: true } },
        load: "heavy",
        coachNote: "Earlier",
      }),
      settings,
      age: 16,
    });
    expect(initial.metricKeys).toEqual(["505_LSI"]);
    expect(initial.freshAndHealthy).toBe(true);
    expect(initial.radar).toBe(true);
    expect(initial.load).toBe("heavy");
    expect(initial.coachNote).toBe("Earlier");
  });

  it("starts from the computed defaults when nothing is remembered", () => {
    const initial = buildInitialValues({ defaults: defaults(), settings: undefined, age: null });
    expect(initial.metricKeys).toEqual(["DASH_10", "CMJ_HOH", "505_LSI", "MQI"]);
    expect(initial.collegeGauge).toBeNull();
    expect(initial.radar).toBe(false);
  });
});

describe("toOrgSelection (what the org remembers)", () => {
  const ctx = { offered, hasPrior: true };

  it("does not persist the athlete's age rule: an untouched gauge is remembered as the preset default", () => {
    expect(toOrgSelection({ ...base, preset: "senior" }, ctx, 12).collegeGauge).toBe(true);
    expect(toOrgSelection({ ...base, preset: "middle_school" }, ctx, 17).collegeGauge).toBe(false);
    expect(toOrgSelection({ ...base, preset: "high_school" }, ctx, 12).collegeGauge).toBe(false);
  });

  it("persists an explicit choice of the coach", () => {
    expect(toOrgSelection({ ...base, preset: "senior", collegeGauge: false }, ctx, 17).collegeGauge).toBe(false);
    expect(toOrgSelection({ ...base, preset: "high_school", collegeGauge: true }, ctx, 12).collegeGauge).toBe(true);
  });
});

describe("applyPresetSwitch", () => {
  const next = {
    preset: "senior" as const,
    metricKeys: ["DASH_10"],
    collegeGauge: true as boolean | null,
    freshAndHealthy: false,
    retestTrend: false,
    coachNoteOn: false,
    strengthsOn: false,
  };

  it("applies the new preset's values to every field the coach has not changed", () => {
    const out = applyPresetSwitch(base, new Set<PresetField>(), next, 17);
    expect(out).toMatchObject({ preset: "senior", metricKeys: ["DASH_10"], collegeGauge: true, freshAndHealthy: false, retestTrend: false });
    expect(out.coachNote).toBe(base.coachNote);
  });

  it("leaves fields the coach changed alone", () => {
    const out = applyPresetSwitch({ ...base, collegeGauge: false }, new Set<PresetField>(["collegeGauge", "metricKeys"]), next, 17);
    expect(out.preset).toBe("senior");
    expect(out.collegeGauge).toBe(false);
    expect(out.metricKeys).toEqual(base.metricKeys);
    expect(out.freshAndHealthy).toBe(false);
  });

  it("never turns the gauge on by itself for an athlete under 14", () => {
    expect(applyPresetSwitch(base, new Set<PresetField>(), next, 12).collegeGauge).toBeNull();
  });

  it("does not mutate its input", () => {
    const copy = JSON.stringify(base);
    applyPresetSwitch(base, new Set<PresetField>(), next, 17);
    expect(JSON.stringify(base)).toBe(copy);
  });
});

describe("a saved eval whose stored selection is empty", () => {
  const saved = defaults({ source: "saved", selection: {} as EvalDefaults["selection"] });

  it("falls back to the checked offered metrics and to the computed preset, never an undefined preset", () => {
    const initial = buildInitialValues({ defaults: saved, settings: undefined, age: 12, fallbackPreset: "middle_school" });
    expect(initial.preset).toBe("middle_school");
    expect(initial.metricKeys).toEqual(["DASH_10", "CMJ_HOH", "505_LSI", "MQI"]);
  });

  it("uses High school when nothing is known", () => {
    expect(buildInitialValues({ defaults: saved, settings: undefined, age: null }).preset).toBe("high_school");
  });
});
