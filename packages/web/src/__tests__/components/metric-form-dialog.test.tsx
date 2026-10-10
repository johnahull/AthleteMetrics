/**
 * MetricFormDialog must keep calculationConfig.anchorMetric (AM-FEAT-018) when an admin
 * edits and saves a derived site metric: the field has no input, so it only survives if the
 * form's default values and the zod schema carry it through to the mutation payload.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const updateMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("@/lib/metrics-api", () => ({
  useCreateSiteMetric: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateSiteMetric: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
}));
vi.mock("@/components/organization-type-multi-select", () => ({ OrganizationTypeMultiSelect: () => null }));
vi.mock("@/components/sport-multi-select", () => ({ SportMultiSelect: () => null }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import MetricFormDialog from "@/components/metric-form-dialog";

const metric = {
  id: "m1",
  code: "MOMENTUM",
  label: "Momentum",
  category: "Power",
  unit: "kg*m/s",
  description: "d",
  metricType: "tracking",
  isDerived: true,
  isActive: true,
  formula: "weight_lbs * 0.45359237 * 9.144 / fly10_time",
  dependentMetrics: ["FLY10_TIME", "WEIGHT_LBS"],
  calculationConfig: {
    dateMatchStrategy: "closest",
    maxDateDifference: 45,
    missingSourceBehavior: "skip",
    sourceSelection: "latest_event",
    anchorMetric: "FLY10_TIME",
  },
} as any;

describe("MetricFormDialog: anchorMetric", () => {
  beforeEach(() => {
    updateMutateAsync.mockClear();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ valid: true, dependentMetrics: ["FLY10_TIME", "WEIGHT_LBS"] }),
    }) as any;
  });

  it("submits calculationConfig.sourceSelection and anchorMetric unchanged when editing a derived metric", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MetricFormDialog open onOpenChange={() => {}} metric={metric} />
      </QueryClientProvider>
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /update|save/i }));
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    const payload = updateMutateAsync.mock.calls[0][0];
    expect(payload.code).toBe("MOMENTUM");
    expect(payload.data.calculationConfig).toEqual({
      dateMatchStrategy: "closest",
      maxDateDifference: 45,
      missingSourceBehavior: "skip",
      sourceSelection: "latest_event",
      anchorMetric: "FLY10_TIME",
    });
  });
});
