/**
 * MetricFormDialog: the "Time (mm:ss)" toggle. Choosing it forces unit 's' and 1 decimal place;
 * a metric that is not a time keeps the decimal format.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const createMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const updateMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("@/lib/metrics-api", () => ({
  useCreateSiteMetric: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useUpdateSiteMetric: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
}));
vi.mock("@/components/organization-type-multi-select", () => ({ OrganizationTypeMultiSelect: () => null }));
vi.mock("@/components/sport-multi-select", () => ({ SportMultiSelect: () => null }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import MetricFormDialog from "@/components/metric-form-dialog";

const renderDialog = (metric?: any) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MetricFormDialog open onOpenChange={() => {}} metric={metric} />
    </QueryClientProvider>
  );
};

describe("MetricFormDialog: duration (mm:ss) toggle", () => {
  beforeEach(() => {
    createMutateAsync.mockClear();
    updateMutateAsync.mockClear();
  });

  it("creates a duration metric with unit s and 1 decimal place", async () => {
    renderDialog();
    const user = userEvent.setup();
    await user.type(screen.getByTestId("metric-code-input"), "MILE_RUN");
    await user.type(screen.getByTestId("metric-label-input"), "Mile Run");
    await user.click(screen.getByTestId("metric-duration-switch"));
    expect(screen.getByTestId("metric-unit-input")).toHaveValue("s");
    expect(screen.getByTestId("metric-unit-input")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled());
    expect(createMutateAsync.mock.calls[0][0]).toMatchObject({ unit: "s", displayFormat: "duration", decimalPrecision: 1 });
  });

  it("creates a decimal metric by default with the usual precision", async () => {
    renderDialog();
    const user = userEvent.setup();
    await user.type(screen.getByTestId("metric-code-input"), "JUMP");
    await user.type(screen.getByTestId("metric-label-input"), "Jump");
    await user.type(screen.getByTestId("metric-unit-input"), "in");
    await user.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled());
    expect(createMutateAsync.mock.calls[0][0]).toMatchObject({ unit: "in", displayFormat: "decimal", decimalPrecision: 3 });
  });

  it("switching an existing metric to duration sends unit s and 1 decimal place", async () => {
    renderDialog({
      id: "m1", code: "ROW_2K", label: "2k Row", unit: "s", metricType: "lower_is_better",
      isDerived: false, isActive: true, displayFormat: "decimal", decimalPrecision: 3,
    });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("metric-duration-switch"));
    await user.click(screen.getByRole("button", { name: /update|save/i }));
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    expect(updateMutateAsync.mock.calls[0][0].data).toMatchObject({ unit: "s", displayFormat: "duration", decimalPrecision: 1 });
  });

  it("an edit that does not touch the format keeps the stored precision", async () => {
    renderDialog({
      id: "m2", code: "MILE", label: "Mile", unit: "s", metricType: "lower_is_better",
      isDerived: false, isActive: true, displayFormat: "duration", decimalPrecision: 2,
    });
    const user = userEvent.setup();
    expect(await screen.findByTestId("metric-duration-switch")).toBeChecked();
    await user.click(screen.getByRole("button", { name: /update|save/i }));
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    const data = updateMutateAsync.mock.calls[0][0].data;
    expect(data.displayFormat).toBe("duration");
    expect(data.decimalPrecision).toBeUndefined();
  });
});
