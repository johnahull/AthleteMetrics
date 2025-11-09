import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CreateReportData {
  name: string;
  description?: string;
  reportType: "coach" | "individual";
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
  };
}

interface Report {
  id: string;
  organizationId: string;
  createdBy: string;
  name: string;
  description?: string;
  reportType: "coach" | "individual";
  config: CreateReportData["config"];
  isTemplate: boolean;
  createdAt: string;
  updatedAt?: string;
}

interface GeneratedReport {
  reportId: string;
  organizationId: string;
  reportType: "coach" | "individual";
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

  return useMutation<GeneratedReport>({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/reports/${reportId}/generate`);
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
