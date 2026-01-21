import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ShareReportParams {
  reportId: string;
  athleteId: string;
  message?: string;
}

interface BulkShareReportParams {
  reportId: string;
  athleteIds: string[];
  message?: string;
}

interface BulkShareReportResult {
  shared: number;
  skipped: number;
  alreadyShared: number;
  results: Array<{
    athleteId: string;
    success: boolean;
    alreadyShared?: boolean;
    error?: string;
  }>;
}

interface ReportShare {
  shareId: string;
  athlete: {
    id: string;
    firstName: string;
    lastName: string;
  };
  sharedBy: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  message?: string;
  createdAt: string;
  viewedAt: string | null;
}

interface ReportSharesResponse {
  shares: ReportShare[];
}

export function useShareReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ reportId, athleteId, message }: ShareReportParams) => {
      const res = await apiRequest("POST", `/api/reports/${reportId}/share`, {
        athleteId,
        message,
      });
      return res.json();
    },
    onSuccess: (_, { reportId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports", reportId, "shares"] });
      toast({
        title: "Success",
        description: "Report sent successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to share report",
        variant: "destructive",
      });
    },
  });
}

export function useBulkShareReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ reportId, athleteIds, message }: BulkShareReportParams) => {
      const res = await apiRequest("POST", `/api/reports/${reportId}/share-bulk`, {
        athleteIds,
        message,
      });
      return res.json() as Promise<BulkShareReportResult>;
    },
    onSuccess: (data, { reportId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports", reportId, "shares"] });

      const { shared, alreadyShared, skipped } = data;

      let description = `Report sent to ${shared} athlete${shared !== 1 ? 's' : ''}`;
      if (alreadyShared > 0) {
        description += `, ${alreadyShared} already had access`;
      }
      if (skipped > 0) {
        description += `, ${skipped} skipped due to errors`;
      }

      toast({
        title: "Success",
        description,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to share report",
        variant: "destructive",
      });
    },
  });
}

export function useReportShares(reportId: string) {
  return useQuery<ReportSharesResponse>({
    queryKey: ["/api/reports", reportId, "shares"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reports/${reportId}/shares`);
      return res.json();
    },
    enabled: !!reportId,
  });
}
