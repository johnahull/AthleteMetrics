import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const bm = (id: string, name: string, metricCode: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  metricCode,
  description: null,
  isActive: true,
  tierGroupId: null,
  tierOrder: null,
  ...extra,
});

const benchmarks = [
  bm("1", "Dash Varsity", "DASH_40YD"),
  bm("2", "Dash Elite", "DASH_40YD"),
  bm("3", "Fly Varsity", "FLY10_TIME"),
  bm("4", "Jump Varsity", "VERTICAL_JUMP"),
  bm("5", "Orphan Benchmark", "RETIRED_METRIC"),
];

const metrics = [
  { code: "DASH_40YD", label: "40 Yard Dash", category: "Speed" },
  { code: "FLY10_TIME", label: "10 Yard Fly", category: "speed" },
  { code: "VERTICAL_JUMP", label: "Vertical Jump", category: "power" },
  // inactive metric: still must categorise its benchmarks
  { code: "RETIRED_METRIC", label: "Retired", category: "agility", isActive: false },
];

const mocks = vi.hoisted(() => ({
  metricsLoading: false,
  metricsError: false,
  useSiteMetrics: vi.fn(),
}));

vi.mock("@/lib/benchmarks-api", () => ({
  useSiteBenchmarks: () => ({ data: benchmarks, isLoading: false, error: null }),
}));
vi.mock("@/lib/metrics-api", () => ({ useSiteMetrics: mocks.useSiteMetrics }));
vi.mock("../BenchmarkCard", () => ({
  BenchmarkCard: ({ benchmark }: { benchmark: { id: string; name: string } }) => (
    <div data-testid={`benchmark-card-${benchmark.id}`}>{benchmark.name}</div>
  ),
}));
vi.mock("../BenchmarkForm", () => ({ BenchmarkForm: () => null }));
vi.mock("../TierGroupWizard", () => ({ TierGroupWizard: () => null }));

import { BenchmarkList } from "../BenchmarkList";

beforeEach(() => {
  mocks.metricsLoading = false;
  mocks.metricsError = false;
  mocks.useSiteMetrics.mockReset();
  mocks.useSiteMetrics.mockImplementation(() => ({
    data: mocks.metricsLoading || mocks.metricsError ? undefined : metrics,
    isLoading: mocks.metricsLoading,
    isError: mocks.metricsError,
  }));
});

const groupButton = (name: RegExp) => screen.getByRole("button", { name });

describe("BenchmarkList: category groups", () => {
  it("groups benchmarks by their metric's category, in report order", () => {
    render(<BenchmarkList />);
    expect(groupButton(/^Speed, 3 benchmarks$/)).toBeInTheDocument();
    expect(groupButton(/^Agility, 1 benchmark$/)).toBeInTheDocument();
    expect(groupButton(/^Power, 1 benchmark$/)).toBeInTheDocument();
    const order = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent?.replace(/\d+$/, ""));
    expect(order).toEqual(["Speed", "Agility", "Power"]);
  });

  it("resolves categories through the full metric list, including inactive metrics", () => {
    render(<BenchmarkList />);
    expect(mocks.useSiteMetrics).toHaveBeenCalledWith(true);
    // the benchmark on the inactive metric is under Agility, not Other
    const agility = screen.getByTestId("category-group-agility");
    expect(within(agility).getByText("Orphan Benchmark")).toBeInTheDocument();
  });

  it("shows each metric's label as a subheading with its benchmarks under it", () => {
    render(<BenchmarkList />);
    const speed = screen.getByTestId("category-group-speed");
    expect(within(speed).getByText("40 Yard Dash")).toBeInTheDocument();
    expect(within(speed).queryByRole("heading", { level: 3, name: /40 Yard Dash/ })).not.toBeInTheDocument();
    expect(within(speed).getByText("Dash Varsity")).toBeInTheDocument();
    expect(within(speed).getByText("Dash Elite")).toBeInTheDocument();
    expect(within(speed).getByText("10 Yard Fly")).toBeInTheDocument();
  });

  it("falls back to the metric code when the metric is unknown, and files it under Other", () => {
    mocks.useSiteMetrics.mockImplementation(() => ({ data: [], isLoading: false }));
    render(<BenchmarkList />);
    expect(groupButton(/^Other, 5 benchmarks$/)).toBeInTheDocument();
    expect(screen.getByText("DASH_40YD")).toBeInTheDocument();
  });

  it("collapses one category without touching the others", async () => {
    render(<BenchmarkList />);
    await userEvent.click(groupButton(/^Speed,/));
    expect(screen.queryByTestId("benchmark-card-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("benchmark-card-4")).toBeInTheDocument();
    await userEvent.click(groupButton(/^Speed,/));
    expect(screen.getByTestId("benchmark-card-1")).toBeInTheDocument();
  });

  it("updates counts and drops empty categories when searching", async () => {
    render(<BenchmarkList />);
    await userEvent.type(screen.getByPlaceholderText(/Search benchmarks/), "varsity");
    expect(groupButton(/^Speed, 2 benchmarks$/)).toBeInTheDocument();
    expect(groupButton(/^Power, 1 benchmark$/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Agility,/ })).not.toBeInTheDocument();
  });

  it("waits for the metric list instead of flashing everything under Other", () => {
    mocks.metricsLoading = true;
    render(<BenchmarkList />);
    expect(screen.queryByRole("button", { name: /^Other,/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("benchmark-card-1")).not.toBeInTheDocument();
  });

  it("tells the user categories are unavailable when the metric list fails, and still lists every benchmark", () => {
    mocks.metricsError = true;
    render(<BenchmarkList />);
    expect(screen.getByRole("alert")).toHaveTextContent(/categories are unavailable/i);
    for (const id of ["1", "2", "3", "4", "5"]) {
      expect(screen.getByTestId(`benchmark-card-${id}`)).toBeInTheDocument();
    }
  });

  it("shows no categories-unavailable notice when metrics load", () => {
    render(<BenchmarkList />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
