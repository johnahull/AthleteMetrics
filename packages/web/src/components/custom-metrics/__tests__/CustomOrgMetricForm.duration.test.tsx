/**
 * CustomOrgMetricForm: the "Time (mm:ss)" toggle forces unit 's' and 1 decimal place, and labels the
 * validation bounds "(seconds)".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const createMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const updateMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("@/lib/custom-metrics-api", () => ({
  useCreateCustomOrgMetric: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useUpdateCustomOrgMetric: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
}));
vi.mock("@/lib/sports-api", () => ({ useSports: () => ({ data: [] }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("../FormulaBuilder", () => ({ FormulaBuilder: () => null }));

import { CustomOrgMetricForm } from "../CustomOrgMetricForm";

describe("CustomOrgMetricForm: duration (mm:ss) toggle", () => {
  beforeEach(() => {
    createMutateAsync.mockClear();
    updateMutateAsync.mockClear();
  });

  it("creates a duration metric with unit s and 1 decimal place", async () => {
    render(<CustomOrgMetricForm open onClose={() => {}} organizationId="org1" metric={null} />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/15m Sprint Time/), "2k Row");
    await user.click(screen.getByTestId("custom-metric-duration-switch"));
    expect(screen.getByPlaceholderText(/s, in, mph/)).toHaveValue("s");
    expect(screen.getByPlaceholderText(/s, in, mph/)).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /create metric/i }));
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled());
    expect(createMutateAsync.mock.calls[0][0].data).toMatchObject({ unit: "s", displayFormat: "duration", decimalPrecision: 1 });
  });

  it("labels the validation bounds in seconds for a duration metric", async () => {
    render(<CustomOrgMetricForm open onClose={() => {}} organizationId="org1" metric={null} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("custom-metric-duration-switch"));
    await user.click(screen.getByRole("tab", { name: /validation/i }));
    expect(await screen.findByText("Minimum Value (seconds)")).toBeInTheDocument();
    expect(screen.getByText("Maximum Value (seconds)")).toBeInTheDocument();
  });

  it("creates a decimal metric by default", async () => {
    render(<CustomOrgMetricForm open onClose={() => {}} organizationId="org1" metric={null} />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/15m Sprint Time/), "Jump");
    await user.click(screen.getByRole("button", { name: /create metric/i }));
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled());
    expect(createMutateAsync.mock.calls[0][0].data).toMatchObject({ displayFormat: "decimal", decimalPrecision: 3 });
  });

  it("loads an existing duration metric with the toggle on", async () => {
    const metric = {
      id: "c1", code: "ROW", label: "Row", unit: "s", metricType: "lower_is_better",
      displayFormat: "duration", decimalPrecision: 1, isDerived: false,
    } as any;
    render(<CustomOrgMetricForm open onClose={() => {}} organizationId="org1" metric={metric} />);
    expect(screen.getByTestId("custom-metric-duration-switch")).toBeChecked();
  });
});
