import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ShareReportParams {
  reportId: string;
  athleteId: string;
  message?: string;
}

interface ReportShare {
  id: string;
  reportId: string;
  athleteId: string;
  message?: string;
  sharedAt: string;
  sharedBy: string;
  viewedAt?: string;
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

export function useReportShares(reportId: string) {
  return useQuery<ReportShare[]>({
    queryKey: ["/api/reports", reportId, "shares"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reports/${reportId}/shares`);
      return res.json();
    },
    enabled: !!reportId,
  });
}
