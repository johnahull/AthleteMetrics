import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Cache duration for unread report count to reduce API calls
const UNREAD_COUNT_STALE_TIME = 30000; // 30 seconds

interface SharedReport {
  shareId: string;
  reportId: string;
  reportName: string;
  reportType: "team" | "individual";
  sharedBy: {
    firstName: string;
    lastName: string;
  };
  message?: string;
  createdAt: string;
  isNew: boolean;
}

interface MyReportsResponse {
  reports: SharedReport[];
}

/**
 * Hook for fetching reports shared with the current athlete
 */
export function useMyReports() {
  return useQuery<MyReportsResponse>({
    queryKey: ["my-reports"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/my/reports");
      return res.json();
    },
  });
}

/**
 * Hook for marking a shared report as viewed
 */
export function useMarkReportViewed() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (shareId: string) => {
      const res = await apiRequest("POST", `/api/my/reports/${shareId}/viewed`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-reports"] });
      queryClient.invalidateQueries({ queryKey: ["my-reports", "unread-count"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to mark report as viewed",
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook for getting unread report count (for badge)
 * Uses dedicated endpoint for efficiency instead of fetching all reports
 */
export function useUnreadReportCount() {
  return useQuery<number>({
    queryKey: ["my-reports", "unread-count"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/my/reports/unread-count");
      const data = await res.json();
      return data.unreadCount;
    },
    staleTime: UNREAD_COUNT_STALE_TIME,
  });
}
