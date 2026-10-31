import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const baseMetrics = [
  { code: "DASH_40YD", label: "40 Yard Dash", category: "Speed", unit: "s", metricType: "lower_is_better", isActive: true, isDerived: false, sportAssociations: ["FB"] },
  { code: "FLY10_TIME", label: "10 Yard Fly", category: "speed", unit: "s", metricType: "lower_is_better", isActive: true, isDerived: true, formula: "a/b", dependentMetrics: ["X"], sportAssociations: null },
  { code: "VERTICAL_JUMP", label: "Vertical Jump", category: "power", unit: "in", metricType: "higher_is_better", isActive: true, isDerived: false, sportAssociations: ["BB"] },
  { code: "MYSTERY", label: "Mystery", category: null, unit: "", metricType: "tracking", isActive: false, isDerived: false, sportAssociations: [] },
];

let metrics: Array<Record<string, unknown>> = baseMetrics;

vi.mock("@/lib/metrics-api", () => ({
  useSiteMetrics: () => ({ data: metrics, isLoading: false }),
  useDeleteSiteMetric: () => ({ mutateAsync: vi.fn() }),
  useToggleSiteMetricStatus: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/lib/sports-api", () => ({
  useSports: () => ({ data: [{ code: "FB", name: "Football" }, { code: "BB", name: "Basketball" }] }),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { isSiteAdmin: true } }) }));
vi.mock("@/components/metric-form-dialog", () => ({ default: () => null }));

import MetricsManagementPage from "../metrics-management";

const groupButton = (name: RegExp) => screen.getByRole("button", { name });

beforeEach(() => {
  vi.clearAllMocks();
  metrics = baseMetrics;
});

describe("MetricsManagement: category groups", () => {
  it("groups metrics under category headers with counts, in report order, Other last", () => {
    render(<MetricsManagementPage />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Speed2", "Power1", "Other1"]);
    expect(groupButton(/^Speed, 2 metrics$/)).toBeInTheDocument();
    expect(groupButton(/^Other, 1 metric$/)).toBeInTheDocument();
  });

  it("links each group toggle to the rows it controls via aria-controls", async () => {
    render(<MetricsManagementPage />);
    const toggle = groupButton(/^Speed,/);
    const controlsId = toggle.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    const region = document.getElementById(controlsId!);
    expect(region).not.toBeNull();
    expect(region).toContainElement(screen.getByTestId("metric-row-DASH_40YD"));

    // the controlled element still exists (and is found by id) while the group is collapsed
    await userEvent.click(toggle);
    expect(document.getElementById(controlsId!)).not.toBeNull();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps existing row test ids and renders each row under its group", () => {
    render(<MetricsManagementPage />);
    expect(screen.getByTestId("metrics-table")).toBeInTheDocument();
    for (const code of ["DASH_40YD", "FLY10_TIME", "VERTICAL_JUMP", "MYSTERY"]) {
      expect(screen.getByTestId(`metric-row-${code}`)).toBeInTheDocument();
    }
  });

  it("hides only that group's rows when a header is collapsed, and restores them", async () => {
    render(<MetricsManagementPage />);
    await userEvent.click(groupButton(/^Speed,/));
    expect(screen.queryByTestId("metric-row-DASH_40YD")).not.toBeInTheDocument();
    expect(screen.queryByTestId("metric-row-FLY10_TIME")).not.toBeInTheDocument();
    expect(screen.getByTestId("metric-row-VERTICAL_JUMP")).toBeInTheDocument();
    expect(groupButton(/^Speed,/)).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(groupButton(/^Speed,/));
    expect(screen.getByTestId("metric-row-DASH_40YD")).toBeInTheDocument();
  });

  it("updates group counts and drops empty groups when the derived filter changes", async () => {
    render(<MetricsManagementPage />);
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "Derived Only" }));
    expect(groupButton(/^Speed, 1 metric$/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Power,/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Other,/ })).not.toBeInTheDocument();
  });
});

describe("MetricsManagement: sport chips", () => {
  it("offers one chip per sport that appears on a metric", () => {
    render(<MetricsManagementPage />);
    const chips = screen.getByRole("group", { name: "Filter by sport" });
    expect(within(chips).getAllByRole("button").map((b) => b.textContent)).toEqual(["Basketball", "Football"]);
  });

  it("filters to the chosen sport but keeps all-sports metrics visible", async () => {
    render(<MetricsManagementPage />);
    await userEvent.click(within(screen.getByRole("group", { name: "Filter by sport" })).getByRole("button", { name: "Football" }));
    expect(screen.getByTestId("metric-row-DASH_40YD")).toBeInTheDocument();
    expect(screen.getByTestId("metric-row-FLY10_TIME")).toBeInTheDocument(); // null associations = all sports
    expect(screen.getByTestId("metric-row-MYSTERY")).toBeInTheDocument(); // [] = all sports
    expect(screen.queryByTestId("metric-row-VERTICAL_JUMP")).not.toBeInTheDocument();
    expect(groupButton(/^Speed, 2 metrics$/)).toBeInTheDocument();
  });

  it("drops a selected sport that no longer exists so metrics are never hidden by an invisible chip", async () => {
    const { rerender } = render(<MetricsManagementPage />);
    await userEvent.click(within(screen.getByRole("group", { name: "Filter by sport" })).getByRole("button", { name: "Basketball" }));
    expect(screen.queryByTestId("metric-row-DASH_40YD")).not.toBeInTheDocument();

    // the only Basketball metric is re-tagged: its chip disappears
    metrics = baseMetrics.map((m) => (m.code === "VERTICAL_JUMP" ? { ...m, sportAssociations: ["FB"] } : m));
    rerender(<MetricsManagementPage />);

    expect(within(screen.getByRole("group", { name: "Filter by sport" })).queryByRole("button", { name: "Basketball" })).not.toBeInTheDocument();
    expect(screen.getByTestId("metric-row-DASH_40YD")).toBeInTheDocument();
    expect(screen.getByTestId("metric-row-VERTICAL_JUMP")).toBeInTheDocument();
  });
});
