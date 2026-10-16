import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/custom-metrics-api", () => ({
  useArchiveCustomOrgMetric: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRestoreCustomOrgMetric: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { CustomOrgMetricCard } from "../CustomOrgMetricCard";

const base = {
  id: "c1", code: "ROW", label: "Row", unit: "s", metricType: "lower_is_better", isActive: true,
  isDerived: false, decimalPrecision: 1, validationMin: null, validationMax: null, category: null,
} as any;

describe("CustomOrgMetricCard: time badge", () => {
  it("shows a Time (mm:ss) badge for a duration metric", () => {
    render(<CustomOrgMetricCard metric={{ ...base, displayFormat: "duration" }} organizationId="o" onEdit={() => {}} />);
    expect(screen.getByText("Time (mm:ss)")).toBeInTheDocument();
  });
  it("shows no badge for a decimal metric", () => {
    render(<CustomOrgMetricCard metric={{ ...base, displayFormat: "decimal" }} organizationId="o" onEdit={() => {}} />);
    expect(screen.queryByText("Time (mm:ss)")).toBeNull();
  });
});
