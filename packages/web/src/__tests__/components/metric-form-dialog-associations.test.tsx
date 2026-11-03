/**
 * Clearing the sport / org-type tags in the metric edit form must send null: the PATCH API treats a missing key as
 * "don't update", so undefined would silently keep the old tags.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { updateMutateAsync, createMutateAsync } = vi.hoisted(() => ({
  updateMutateAsync: vi.fn().mockResolvedValue({}),
  createMutateAsync: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/metrics-api", () => ({
  useCreateSiteMetric: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useUpdateSiteMetric: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
}));
vi.mock("@/components/organization-type-multi-select", () => ({
  OrganizationTypeMultiSelect: ({ value, onChange }: any) => (
    <button type="button" onClick={() => onChange(undefined)}>
      clear-org-types ({(value ?? []).join(",")})
    </button>
  ),
}));
vi.mock("@/components/sport-multi-select", () => ({
  SportMultiSelect: ({ value, onChange }: any) => (
    <button type="button" onClick={() => onChange(undefined)}>
      clear-sports ({(value ?? []).join(",")})
    </button>
  ),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import MetricFormDialog from "@/components/metric-form-dialog";

const metric = (over: Record<string, unknown> = {}) =>
  ({
    id: "m1",
    code: "RSI_105_HEIGHT",
    label: "RSI Height",
    category: "Power",
    unit: "in",
    description: "d",
    metricType: "higher_is_better",
    displayFormat: "decimal",
    isDerived: false,
    isActive: true,
    sportAssociations: ["SOCCER"],
    availableOrgTypes: ["club"],
    ...over,
  }) as any;

function renderDialog(m?: any) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MetricFormDialog open onOpenChange={() => {}} metric={m} />
    </QueryClientProvider>
  );
}

describe("MetricFormDialog: clearing tags", () => {
  beforeEach(() => {
    updateMutateAsync.mockClear();
    createMutateAsync.mockClear();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ valid: true }) }) as any;
  });

  it("sends sportAssociations: null when the last sport is removed on edit", async () => {
    renderDialog(metric());
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /clear-sports/ }));
    await user.click(screen.getByRole("button", { name: /update|save/i }));
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    expect(updateMutateAsync.mock.calls[0][0].data.sportAssociations).toBeNull();
  });

  it("sends availableOrgTypes: null when the org types are cleared on edit", async () => {
    renderDialog(metric());
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /clear-org-types/ }));
    await user.click(screen.getByRole("button", { name: /update|save/i }));
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    expect(updateMutateAsync.mock.calls[0][0].data.availableOrgTypes).toBeNull();
  });

  it("keeps untouched tags as arrays", async () => {
    renderDialog(metric());
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /update|save/i }));
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    const { data } = updateMutateAsync.mock.calls[0][0];
    expect(data.sportAssociations).toEqual(["SOCCER"]);
    expect(data.availableOrgTypes).toEqual(["club"]);
  });

  it("sends null for a metric that never had tags (all sports stays all sports)", async () => {
    renderDialog(metric({ sportAssociations: null, availableOrgTypes: null }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /update|save/i }));
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    const { data } = updateMutateAsync.mock.calls[0][0];
    expect(data.sportAssociations).toBeNull();
    expect(data.availableOrgTypes).toBeNull();
  });
});
