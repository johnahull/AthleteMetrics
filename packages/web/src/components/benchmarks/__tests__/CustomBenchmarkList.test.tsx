import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const bm = (id: string, name: string, metricCode: string) => ({
  id,
  name,
  metricCode,
  description: null,
  isActive: true,
  tierGroupId: null,
  tierOrder: null,
});

const mocks = vi.hoisted(() => ({
  categoriesLoading: false,
  categories: {} as Record<string, string | null>,
  getCategory: vi.fn(),
}));

vi.mock("@/lib/benchmarks-api", () => ({
  useCustomBenchmarks: () => ({
    data: [
      bm("1", "Dash Local", "DASH_40YD"),
      bm("2", "Dash Stretch", "DASH_40YD"),
      bm("3", "Jump Local", "VERTICAL_JUMP"),
      bm("4", "Skate Local", "CUSTOM_SKATE"),
    ],
    isLoading: false,
    error: null,
  }),
}));
vi.mock("@/hooks/use-metric-category-lookup", () => ({
  useMetricCategoryLookup: () => ({ getCategory: mocks.getCategory, isLoading: mocks.categoriesLoading }),
}));
vi.mock("@/hooks/use-metric-labels", () => ({
  useMetricLabels: () => ({ getLabel: (code: string) => `label:${code}` }),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("../CustomBenchmarkCard", () => ({
  CustomBenchmarkCard: ({ benchmark }: { benchmark: { id: string; name: string } }) => (
    <div data-testid={`custom-card-${benchmark.id}`}>{benchmark.name}</div>
  ),
}));
vi.mock("../CustomBenchmarkForm", () => ({ CustomBenchmarkForm: () => null }));

import { CustomBenchmarkList } from "../CustomBenchmarkList";

beforeEach(() => {
  mocks.categoriesLoading = false;
  mocks.categories = { DASH_40YD: "Speed", VERTICAL_JUMP: "power", CUSTOM_SKATE: "Skating" };
  mocks.getCategory.mockReset();
  mocks.getCategory.mockImplementation((code: string) => mocks.categories[code] ?? null);
});

describe("CustomBenchmarkList: category groups", () => {
  it("groups custom benchmarks by metric category, custom categories after known ones", () => {
    render(<CustomBenchmarkList organizationId="org-1" />);
    expect(screen.getByRole("button", { name: "Speed, 2 benchmarks" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Power, 1 benchmark" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skating, 1 benchmark" })).toBeInTheDocument();
    const order = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent?.replace(/\d+$/, ""));
    expect(order).toEqual(["Speed", "Power", "Skating"]);
  });

  it("shows each metric's label as a subheading", () => {
    render(<CustomBenchmarkList organizationId="org-1" />);
    expect(screen.getByText("label:DASH_40YD")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
  });

  it("collapses one category without touching the others", async () => {
    render(<CustomBenchmarkList organizationId="org-1" />);
    await userEvent.click(screen.getByRole("button", { name: /^Speed,/ }));
    expect(screen.queryByTestId("custom-card-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("custom-card-3")).toBeInTheDocument();
  });

  it("updates counts when searching", async () => {
    render(<CustomBenchmarkList organizationId="org-1" />);
    await userEvent.type(screen.getByPlaceholderText(/search/i), "stretch");
    expect(screen.getByRole("button", { name: "Speed, 1 benchmark" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Power,/ })).not.toBeInTheDocument();
  });

  it("waits for the category lookup instead of flashing everything under Other", () => {
    mocks.categoriesLoading = true;
    render(<CustomBenchmarkList organizationId="org-1" />);
    expect(screen.queryByRole("button", { name: /^Other,/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("custom-card-1")).not.toBeInTheDocument();
  });
});
