/**
 * ImportBatchHistory
 *
 * Collapsible card listing past device import batches for the organization.
 * Provides rollback functionality with confirmation dialog.
 */

import { useState } from 'react';
import { useImportBatches, type ImportBatch } from '@/hooks/useImportBatches';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ChevronDown, ChevronRight, History, RotateCcw, Loader2 } from 'lucide-react';

interface ImportBatchHistoryProps {
  organizationId: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function statusBadge(status: string) {
  switch (status) {
    case 'committed':
      return <Badge variant="default">Committed</Badge>;
    case 'rolled_back':
      return <Badge variant="secondary">Rolled Back</Badge>;
    case 'pending':
      return <Badge variant="outline">Pending</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function ImportBatchHistory({ organizationId }: ImportBatchHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [confirmBatch, setConfirmBatch] = useState<ImportBatch | null>(null);
  const { batches, isLoading, rollback, isRollingBack, rollingBackBatchId } = useImportBatches(organizationId);

  const committedBatches = batches.filter(b => b.status === 'committed');

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  <CardTitle className="text-base">Import History</CardTitle>
                  {committedBatches.length > 0 && (
                    <Badge variant="secondary">{committedBatches.length}</Badge>
                  )}
                </div>
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <CardDescription>View and manage past device data imports</CardDescription>
            </CardHeader>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : batches.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No imports yet. Upload a device CSV to get started.
                </p>
              ) : (
                <div className="space-y-3">
                  {batches.map((batch) => (
                    <div
                      key={batch.id}
                      className="flex items-center justify-between rounded-lg border p-3 text-sm"
                    >
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate max-w-[200px]">
                            {batch.fileName}
                          </span>
                          {statusBadge(batch.status)}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>{formatDate(batch.committedAt ?? batch.createdAt)}</span>
                          {batch.athletesImported != null && (
                            <span>{batch.athletesImported} athletes</span>
                          )}
                          {batch.measurementsCreated != null && (
                            <span>{batch.measurementsCreated} measurements</span>
                          )}
                          {batch.eventNameSnapshot && (
                            <span>Event: {batch.eventNameSnapshot}</span>
                          )}
                          {batch.importedByName && (
                            <span>By: {batch.importedByName}</span>
                          )}
                        </div>
                      </div>

                      {batch.status === 'committed' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-2 text-destructive hover:text-destructive"
                          disabled={isRollingBack && rollingBackBatchId === batch.id}
                          onClick={() => setConfirmBatch(batch)}
                        >
                          {isRollingBack && rollingBackBatchId === batch.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCcw className="h-4 w-4 mr-1" />
                          )}
                          Rollback
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <AlertDialog open={!!confirmBatch} onOpenChange={(open) => { if (!open) setConfirmBatch(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rollback Import?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all {confirmBatch?.measurementsCreated ?? 0} measurements
              imported from <strong>{confirmBatch?.fileName}</strong> and recalculate
              derived metrics. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmBatch) {
                  rollback(confirmBatch.id);
                  setConfirmBatch(null);
                }
              }}
            >
              Rollback
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
