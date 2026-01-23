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

// Types for bulk distribute (different from bulk share!)
// Bulk distribute: sends MANY individual reports to their RESPECTIVE athletes
// Bulk share: sends ONE report to MANY athletes
interface BulkDistributeParams {
  reportIds: string[];
  message?: string;
}

interface BulkDistributeResult {
  summary: {
    sent: number;
    alreadySent: number;
    skipped: number;
  };
  results: Array<{
    reportId: string;
    reportName: string;
    athleteId: string;
    athleteName: string;
    status: 'sent' | 'already_sent' | 'skipped';
    reason?: string;
  }>;
  skippedReports: Array<{
    reportId: string;
    reportName: string;
    reason: string;
  }>;
}

export function useBulkDistributeReports() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ reportIds, message }: BulkDistributeParams) => {
      const res = await apiRequest("POST", "/api/reports/bulk-distribute", {
        reportIds,
        message,
      });
      return res.json() as Promise<BulkDistributeResult>;
    },
    onSuccess: (data) => {
      // Invalidate reports list to refresh sentToAthlete status
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });

      const { sent, alreadySent, skipped } = data.summary;

      let description = `Sent ${sent} report${sent !== 1 ? 's' : ''} to athletes`;
      if (alreadySent > 0) {
        description += `, ${alreadySent} already sent`;
      }
      if (skipped > 0) {
        description += `, ${skipped} skipped`;
      }

      toast({
        title: "Success",
        description,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to distribute reports",
        variant: "destructive",
      });
    },
  });
}
