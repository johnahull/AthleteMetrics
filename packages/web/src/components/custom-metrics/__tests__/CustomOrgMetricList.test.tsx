import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const metric = (id: string, label: string, category: string | null) => ({
  id,
  code: `CODE_${id}`,
  label,
  category,
  description: null,
  isArchived: false,
});

vi.mock("@/lib/custom-metrics-api", () => ({
  useCustomOrgMetrics: () => ({
    data: [
      metric("1", "Broad Jump", "power"),
      metric("2", "Box Jump", "Power"),
      metric("3", "Shuttle", "agility"),
      metric("4", "Skate Stride", "Skating"),
      metric("5", "Mystery", null),
    ],
    isLoading: false,
    error: null,
  }),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "u1", isSiteAdmin: true } }) }));
vi.mock("../CustomOrgMetricCard", () => ({
  CustomOrgMetricCard: ({ metric }: { metric: { id: string; label: string } }) => (
    <div data-testid={`custom-metric-card-${metric.id}`}>{metric.label}</div>
  ),
}));
vi.mock("../CustomOrgMetricForm", () => ({ CustomOrgMetricForm: () => null }));

import { CustomOrgMetricList } from "../CustomOrgMetricList";

describe("CustomOrgMetricList: category groups", () => {
  it("groups metrics by normalized category in report order, custom categories then Other last", () => {
    render(<CustomOrgMetricList organizationId="org-1" />);
    expect(screen.getByRole("button", { name: "Agility, 1 metric" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Power, 2 metrics" })).toBeInTheDocument();
    const order = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent?.replace(/\d+$/, ""));
    expect(order).toEqual(["Agility", "Power", "Skating", "Other"]);
  });

  it("collapses one category without touching the others", async () => {
    render(<CustomOrgMetricList organizationId="org-1" />);
    await userEvent.click(screen.getByRole("button", { name: /^Power,/ }));
    expect(screen.queryByTestId("custom-metric-card-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("custom-metric-card-2")).not.toBeInTheDocument();
    expect(screen.getByTestId("custom-metric-card-3")).toBeInTheDocument();
  });

  it("updates counts when searching", async () => {
    render(<CustomOrgMetricList organizationId="org-1" />);
    await userEvent.type(screen.getByPlaceholderText(/search/i), "box");
    expect(screen.getByRole("button", { name: "Power, 1 metric" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Agility,/ })).not.toBeInTheDocument();
  });
});
