import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ReportFilters } from "./use-report-filters";
import type { Report } from "@/types/report-types";
import type { ChartSelection } from "@shared/report-charts";

interface CreateReportData {
  name: string;
  description?: string;
  reportType: "team" | "individual";
  config: {
    timeframe: {
      type: "preset" | "custom";
      preset?: "season" | "year" | "all_time";
      customStart?: string;
      customEnd?: string;
    };
    metrics: string[];
    benchmarks?: {
      site?: string[];
      custom?: string[];
      userDefined?: Array<{
        metricCode: string;
        value: number;
        label: string;
      }>;
    };
    compositeIndex?: {
      enabled: boolean;
      weights?: Record<string, number>;
    };
    filters?: {
      teamIds?: string[];
      gender?: string;
      positions?: string[];
    };
    charts?: Partial<ChartSelection>;
  };
}

interface ReportsResponse {
  reports: Report[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

interface GeneratedReport {
  reportId: string;
  organizationId: string;
  reportType: "team" | "individual";
  config: CreateReportData["config"];
  generatedAt: string;
  data: any;
}

interface ReportSnapshot {
  id: string;
  reportId: string;
  publicToken: string;
  snapshotData: any;
  createdBy: string;
  expiresAt: string;
  isActive: boolean;
  revokedAt?: string;
  revokedBy?: string;
  viewCount: number;
  lastViewedAt?: string;
  createdAt: string;
}

interface CreateSnapshotData {
  expiresAt: string;
}

export function useReports(organizationId?: string) {
  return useQuery<Report[]>({
    queryKey: ["/api/reports", organizationId],
    queryFn: async () => {
      const url = organizationId
        ? `/api/reports?organizationId=${organizationId}`
        : "/api/reports";
      const res = await apiRequest("GET", url);
      return res.json();
    },
  });
}

export function useReport(reportId: string) {
  return useQuery<Report>({
    queryKey: ["/api/reports", reportId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reports/${reportId}`);
      return res.json();
    },
    enabled: !!reportId,
  });
}

export function useCreateReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateReportData & { organizationId: string }) => {
      const res = await apiRequest("POST", "/api/reports", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({
        title: "Success",
        description: "Report created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useGenerateReport(reportId: string) {
  const { toast } = useToast();

  return useMutation<GeneratedReport, Error, { athleteId?: string }>({
    mutationFn: async (params: { athleteId?: string }) => {
      console.log('[useGenerateReport] Received params:', params);
      console.log('[useGenerateReport] athleteId value:', params?.athleteId);
      const body = params?.athleteId ? { athleteId: params.athleteId } : {};
      console.log('[useGenerateReport] Request body:', body);
      const res = await apiRequest("POST", `/api/reports/${reportId}/generate`, body);
      return res.json();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useCreateSnapshot(reportId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<ReportSnapshot, Error, CreateSnapshotData>({
    mutationFn: async (data: CreateSnapshotData) => {
      const res = await apiRequest("POST", `/api/reports/${reportId}/snapshots`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports", reportId, "snapshots"] });
      toast({
        title: "Success",
        description: "Share link created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useReportSnapshots(reportId: string) {
  return useQuery<ReportSnapshot[]>({
    queryKey: ["/api/reports", reportId, "snapshots"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reports/${reportId}/snapshots`);
      return res.json();
    },
    enabled: !!reportId,
  });
}

export function useRevokeSnapshot(reportId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (snapshotId: string) => {
      const res = await apiRequest("DELETE", `/api/reports/${reportId}/snapshots/${snapshotId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports", reportId, "snapshots"] });
      toast({
        title: "Success",
        description: "Share link revoked successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function usePublicReport(token: string) {
  return useQuery({
    queryKey: ["/api/public/reports", token],
    queryFn: async () => {
      const res = await fetch(`/api/public/reports/${token}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to fetch public report");
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });
}

export function useDeleteReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (reportId: string) => {
      const res = await apiRequest("DELETE", `/api/reports/${reportId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({
        title: "Success",
        description: "Report deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook for fetching reports with filters and pagination
 * @param organizationId - Organization ID
 * @param filters - Report filters (search, type, date range, etc.)
 * @param pagination - Pagination options
 */
export function useReportsWithFilters(
  organizationId: string,
  filters?: Partial<ReportFilters>,
  pagination?: { limit?: number; offset?: number }
) {
  return useQuery<ReportsResponse>({
    queryKey: ["/api/reports", organizationId, filters, pagination],
    queryFn: async () => {
      const params = new URLSearchParams();

      // Add organization ID
      params.set('organizationId', organizationId);

      // Add filters
      if (filters?.search) {
        params.set('search', filters.search);
      }

      if (filters?.reportType) {
        params.set('reportType', filters.reportType);
      }

      if (filters?.dateFrom) {
        params.set('dateFrom', filters.dateFrom);
      }

      if (filters?.dateTo) {
        params.set('dateTo', filters.dateTo);
      }

      filters?.metrics?.forEach(metric => {
        params.append('metrics', metric);
      });

      filters?.teamIds?.forEach(teamId => {
        params.append('teamIds', teamId);
      });

      if (filters?.pinned !== undefined) {
        params.set('pinned', String(filters.pinned));
      }

      // Add sorting
      if (filters?.sortBy) {
        params.set('sortBy', filters.sortBy);
      }
      if (filters?.sortOrder) {
        params.set('sortOrder', filters.sortOrder);
      }

      // Add archived filter
      if (filters?.includeArchived) {
        params.set('includeArchived', 'true');
      }

      // Add pagination
      if (pagination?.limit) {
        params.set('limit', String(pagination.limit));
      }

      if (pagination?.offset) {
        params.set('offset', String(pagination.offset));
      }

      const res = await apiRequest("GET", `/api/reports?${params.toString()}`);
      return res.json();
    },
  });
}

/**
 * Hook for pinning a report
 */
export function usePinReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (reportId: string) => {
      const res = await apiRequest("PATCH", `/api/reports/${reportId}/pin`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({
        title: "Success",
        description: "Report pinned successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook for unpinning a report
 */
export function useUnpinReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (reportId: string) => {
      const res = await apiRequest("PATCH", `/api/reports/${reportId}/unpin`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({
        title: "Success",
        description: "Report unpinned successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook for archiving a report (soft-hide from coach view)
 */
export function useArchiveReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (reportId: string) => {
      const res = await apiRequest("PATCH", `/api/reports/${reportId}/archive`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({
        title: "Report Archived",
        description: "Report has been archived. You can view it in the archived reports section.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook for unarchiving a report (restore to active view)
 */
export function useUnarchiveReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (reportId: string) => {
      const res = await apiRequest("PATCH", `/api/reports/${reportId}/unarchive`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({
        title: "Report Restored",
        description: "Report has been restored to your active reports.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook for bulk archiving multiple reports
 */
export function useBulkArchiveReports() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (reportIds: string[]) => {
      const res = await apiRequest("POST", "/api/reports/bulk-archive", { reportIds });
      return res.json();
    },
    onSuccess: (data: { archived: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({
        title: "Reports Archived",
        description: `${data.archived} report${data.archived !== 1 ? 's' : ''} archived successfully.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook for bulk unarchiving multiple reports
 */
export function useBulkUnarchiveReports() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (reportIds: string[]) => {
      const res = await apiRequest("POST", "/api/reports/bulk-unarchive", { reportIds });
      return res.json();
    },
    onSuccess: (data: { unarchived: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({
        title: "Reports Restored",
        description: `${data.unarchived} report${data.unarchived !== 1 ? 's' : ''} restored successfully.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook for bulk deleting multiple reports
 */
export function useBulkDeleteReports() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (reportIds: string[]) => {
      const res = await apiRequest("POST", "/api/reports/bulk-delete", { reportIds });
      return res.json();
    },
    onSuccess: (data: { deleted: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({
        title: "Reports Deleted",
        description: `${data.deleted} report${data.deleted !== 1 ? 's' : ''} deleted permanently.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
