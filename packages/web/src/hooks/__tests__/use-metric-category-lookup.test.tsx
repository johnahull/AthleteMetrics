import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  useSiteMetrics: vi.fn(),
  getMetricConfig: vi.fn(),
}));

vi.mock("@/lib/metrics-api", () => ({ useSiteMetrics: mocks.useSiteMetrics }));
vi.mock("@/hooks/use-metric-config", () => ({
  useMetricConfig: () => ({ getMetricConfig: mocks.getMetricConfig }),
}));

import { useMetricCategoryLookup } from "../use-metric-category-lookup";

beforeEach(() => {
  mocks.useSiteMetrics.mockReset();
  mocks.getMetricConfig.mockReset();
  mocks.getMetricConfig.mockReturnValue(undefined);
});

describe("useMetricCategoryLookup", () => {
  it("asks for the org's site metrics including inactive ones", () => {
    mocks.useSiteMetrics.mockReturnValue({ data: [], isLoading: false });
    renderHook(() => useMetricCategoryLookup("org-1"));
    expect(mocks.useSiteMetrics).toHaveBeenCalledWith(true, "org-1");
  });

  it("returns the site metric's category", () => {
    mocks.useSiteMetrics.mockReturnValue({ data: [{ code: "DASH_40YD", category: "Speed" }], isLoading: false });
    const { result } = renderHook(() => useMetricCategoryLookup("org-1"));
    expect(result.current.getCategory("DASH_40YD")).toBe("Speed");
  });

  it("falls back to the org metric config for codes the site list does not return", () => {
    mocks.useSiteMetrics.mockReturnValue({ data: [], isLoading: false });
    mocks.getMetricConfig.mockImplementation((code: string) => (code === "CUSTOM_X" ? { category: "plyometrics" } : undefined));
    const { result } = renderHook(() => useMetricCategoryLookup("org-1"));
    expect(result.current.getCategory("CUSTOM_X")).toBe("plyometrics");
  });

  it("returns null when neither source knows the code", () => {
    mocks.useSiteMetrics.mockReturnValue({ data: [], isLoading: false });
    const { result } = renderHook(() => useMetricCategoryLookup("org-1"));
    expect(result.current.getCategory("NOPE")).toBeNull();
  });

  it("reports loading while the site metrics are in flight", () => {
    mocks.useSiteMetrics.mockReturnValue({ data: undefined, isLoading: true });
    const { result } = renderHook(() => useMetricCategoryLookup("org-1"));
    expect(result.current.isLoading).toBe(true);
  });

  it("keeps a site metric that has an explicit null category in Other instead of using the org config's category", () => {
    mocks.useSiteMetrics.mockReturnValue({ data: [{ code: "DASH_40YD", category: null }], isLoading: false });
    mocks.getMetricConfig.mockReturnValue({ category: "speed" });
    const { result } = renderHook(() => useMetricCategoryLookup("org-1"));
    expect(result.current.getCategory("DASH_40YD")).toBeNull();
  });

  it("reports an error when the site metric list fails to load", () => {
    mocks.useSiteMetrics.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    const { result } = renderHook(() => useMetricCategoryLookup("org-1"));
    expect(result.current.isError).toBe(true);
  });

  it("reports no error when the site metric list loads", () => {
    mocks.useSiteMetrics.mockReturnValue({ data: [], isLoading: false, isError: false });
    const { result } = renderHook(() => useMetricCategoryLookup("org-1"));
    expect(result.current.isError).toBe(false);
  });
});
