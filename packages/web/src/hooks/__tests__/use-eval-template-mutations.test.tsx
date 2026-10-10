/**
 * Template mutations refresh every organization's template list (the default is in all of them) and the
 * cached read and resolved tests of the changed template, for any organization.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const mockApiRequest = vi.fn();
vi.mock("@/lib/queryClient", () => ({ apiRequest: (...args: unknown[]) => mockApiRequest(...args) }));

import { evalReportKeys, useDeleteEvalTemplate, useUpdateEvalTemplate } from "../use-eval-report";

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const seed = (key: readonly unknown[]) => queryClient.setQueryData(key, { seeded: true });
  seed(evalReportKeys.templates("org-1"));
  seed(evalReportKeys.templates("org-2"));
  seed(evalReportKeys.template("t1"));
  seed(evalReportKeys.resolvedTemplate("t1", "org-1"));
  seed(evalReportKeys.resolvedTemplate("t1"));
  seed(evalReportKeys.resolvedTemplate("t2", "org-1"));
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const stale = (key: readonly unknown[]) => queryClient.getQueryState(key)?.isInvalidated ?? null;
  return { queryClient, wrapper, stale };
}

beforeEach(() => {
  mockApiRequest.mockReset();
  mockApiRequest.mockResolvedValue({ json: async () => ({ id: "t1" }) });
});

describe("useUpdateEvalTemplate", () => {
  it("PATCHes the template and invalidates all template lists and this template's caches only", async () => {
    const { wrapper, stale } = setup();
    const { result } = renderHook(() => useUpdateEvalTemplate(), { wrapper });
    await result.current.mutateAsync({ id: "t1", patch: { name: "New" } });
    expect(mockApiRequest).toHaveBeenCalledWith("PATCH", "/api/eval-templates/t1", { name: "New" });
    await waitFor(() => expect(stale(evalReportKeys.templates("org-1"))).toBe(true));
    expect(stale(evalReportKeys.templates("org-2"))).toBe(true);
    expect(stale(evalReportKeys.template("t1"))).toBe(true);
    expect(stale(evalReportKeys.resolvedTemplate("t1", "org-1"))).toBe(true);
    expect(stale(evalReportKeys.resolvedTemplate("t1"))).toBe(true);
    expect(stale(evalReportKeys.resolvedTemplate("t2", "org-1"))).toBe(false);
  });
});

describe("useDeleteEvalTemplate", () => {
  it("DELETEs, drops the template's own caches and invalidates every list", async () => {
    const { queryClient, wrapper, stale } = setup();
    const { result } = renderHook(() => useDeleteEvalTemplate(), { wrapper });
    await result.current.mutateAsync("t1");
    expect(mockApiRequest).toHaveBeenCalledWith("DELETE", "/api/eval-templates/t1");
    expect(queryClient.getQueryData(evalReportKeys.template("t1"))).toBeUndefined();
    expect(queryClient.getQueryData(evalReportKeys.resolvedTemplate("t1", "org-1"))).toBeUndefined();
    expect(stale(evalReportKeys.templates("org-2"))).toBe(true);
    expect(stale(evalReportKeys.resolvedTemplate("t2", "org-1"))).toBe(false);
  });
});
