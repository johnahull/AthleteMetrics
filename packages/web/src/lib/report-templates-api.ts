/**
 * Report templates API hooks: org-wide saved metrics + benchmark sets/picks + chart choices
 * that the report wizard can prefill from.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateReportTemplateInput, UpdateReportTemplateInput } from "@shared/report-template-schemas";
import { apiRequest, STALE_TIME } from "@/lib/queryClient";
import type { ReportTemplateData } from "@/components/reports/report-template";

export type ReportTemplate = ReportTemplateData & {
  organizationId: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export const reportTemplateKeys = {
  all: ["report-templates"] as const,
  list: (orgId: string) => [...reportTemplateKeys.all, "list", orgId] as const,
};

export function useReportTemplates(orgId: string) {
  return useQuery<ReportTemplate[]>({
    queryKey: reportTemplateKeys.list(orgId),
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/organizations/${orgId}/report-templates`);
      return res.json();
    },
    staleTime: STALE_TIME.DEFAULT,
    enabled: !!orgId,
  });
}

export function useCreateReportTemplate(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation<ReportTemplate, Error, CreateReportTemplateInput>({
    mutationFn: async (data) => {
      const res = await apiRequest("POST", `/api/organizations/${orgId}/report-templates`, data);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reportTemplateKeys.list(orgId) }),
  });
}

export function useUpdateReportTemplate() {
  const queryClient = useQueryClient();
  return useMutation<ReportTemplate, Error, { id: string; data: UpdateReportTemplateInput }>({
    mutationFn: async ({ id, data }) => {
      const res = await apiRequest("PATCH", `/api/report-templates/${id}`, data);
      return res.json();
    },
    // The row names its organization, so only that list is refetched
    onSuccess: (row) => queryClient.invalidateQueries({ queryKey: reportTemplateKeys.list(row.organizationId) }),
  });
}

export function useDeleteReportTemplate() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await apiRequest("DELETE", `/api/report-templates/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reportTemplateKeys.all }),
  });
}
