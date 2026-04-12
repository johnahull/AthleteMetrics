/**
 * useImportBatches Hook
 *
 * Fetches and manages import batch history for an organization.
 * Provides rollback functionality with optimistic updates.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

export interface ImportBatch {
  id: string;
  source: string;
  fileName: string;
  status: string;
  sessionDate: string | null;
  eventNameSnapshot: string | null;
  measurementsCreated: number | null;
  athletesImported: number | null;
  createdAt: string;
  committedAt: string | null;
  importedByName?: string;
}

interface BatchesResponse {
  batches: ImportBatch[];
}

export function useImportBatches(organizationId: string | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const queryKey = ['/api/import/device/batches', organizationId];

  const query = useQuery<BatchesResponse>({
    queryKey,
    queryFn: async () => {
      const response = await fetch(
        `/api/import/device/batches?organizationId=${encodeURIComponent(organizationId!)}`,
        { credentials: 'include' }
      );
      if (!response.ok) {
        throw new Error('Failed to fetch import batches');
      }
      return response.json();
    },
    enabled: !!organizationId,
  });

  const rollbackMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const csrfResponse = await fetch('/api/csrf-token', {
        credentials: 'include',
      });
      if (!csrfResponse.ok) throw new Error('Failed to fetch CSRF token');
      const { csrfToken } = await csrfResponse.json();

      const response = await fetch(
        `/api/import/device/batches/${batchId}/rollback`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
          },
          credentials: 'include',
          body: JSON.stringify({ organizationId }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        let message = 'Failed to rollback import';
        try {
          const parsed = JSON.parse(errorText);
          message = parsed.message || message;
        } catch {
          message = errorText || message;
        }
        throw new Error(message);
      }

      return response.json();
    },
    onSuccess: (_data, batchId) => {
      toast({ title: 'Import Rolled Back', description: `Batch ${batchId.slice(0, 8)}... has been rolled back.` });
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => {
      toast({
        title: 'Rollback Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    batches: query.data?.batches ?? [],
    isLoading: query.isLoading,
    error: query.error,
    rollback: rollbackMutation.mutate,
    isRollingBack: rollbackMutation.isPending,
    rollingBackBatchId: rollbackMutation.variables,
  };
}
