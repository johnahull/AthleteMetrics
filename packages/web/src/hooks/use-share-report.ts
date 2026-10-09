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
  blockedUnder13?: number;
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

/** apiRequest throws `${status}: ${body}`; show the JSON body's `message` when there is one. */
export function getShareErrorMessage(error: Error, fallback: string): string {
  const raw = error.message || "";
  const body = raw.replace(/^\d{3}:\s*/, "");
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.message === "string" && parsed.message) return parsed.message;
  } catch {
    // not JSON; fall through
  }
  return raw || fallback;
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
        description: getShareErrorMessage(error, "Failed to share report"),
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

      const { shared, alreadyShared, skipped, blockedUnder13 = 0 } = data;

      let description = `Report sent to ${shared} athlete${shared !== 1 ? 's' : ''}`;
      if (alreadyShared > 0) {
        description += `, ${alreadyShared} already had access`;
      }
      if (blockedUnder13 > 0) {
        description += `, ${blockedUnder13} under 13 or without a date of birth skipped (send their PDF to a parent)`;
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
        description: getShareErrorMessage(error, "Failed to share report"),
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
    blockedUnder13?: number;
  };
  results: Array<{
    reportId: string;
    reportName: string;
    athleteId: string;
    athleteName: string;
    status: 'sent' | 'already_sent' | 'skipped' | 'blocked_under_13';
    reason?: string;
  }>;
  skippedReports: Array<{
    reportId: string;
    reportName: string;
    reason: string;
  }>;
}

export function buildBulkDistributeDescription(
  summary: BulkDistributeResult["summary"],
): string {
  const { sent, alreadySent, skipped, blockedUnder13 = 0 } = summary;
  const parts: string[] = [];
  if (sent > 0) parts.push(`Sent ${sent} report${sent !== 1 ? 's' : ''}.`);
  if (alreadySent > 0) parts.push(`${alreadySent} already sent.`);
  if (blockedUnder13 > 0) {
    parts.push(
      `${blockedUnder13} athlete${blockedUnder13 !== 1 ? 's' : ''} under 13 or without a date of birth ${blockedUnder13 !== 1 ? 'were' : 'was'} skipped; send their PDF to a parent.`,
    );
  }
  if (skipped > 0) parts.push(`${skipped} skipped.`);
  return parts.length > 0 ? parts.join(' ') : 'No reports were sent.';
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

      const description = buildBulkDistributeDescription(data.summary);

      toast({
        title: "Success",
        description,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: getShareErrorMessage(error, "Failed to distribute reports"),
        variant: "destructive",
      });
    },
  });
}
