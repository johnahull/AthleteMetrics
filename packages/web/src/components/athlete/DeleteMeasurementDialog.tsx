/**
 * DeleteMeasurementDialog Component
 *
 * Confirmation dialog for deleting self-entered (unverified) measurements.
 * Athletes can only delete measurements they submitted themselves.
 */

import React from 'react';
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
import { Loader2 } from 'lucide-react';
import type { Measurement } from '@shared/schema';
import { getMetricDisplayName } from '@/constants/metrics';

export interface DeleteMeasurementDialogProps {
  open: boolean;
  measurement: Measurement | null;
  onConfirm: (measurementId: string) => void;
  onCancel: () => void;
  isDeleting?: boolean;
}

export function DeleteMeasurementDialog({
  open,
  measurement,
  onConfirm,
  onCancel,
  isDeleting = false,
}: DeleteMeasurementDialogProps) {
  // Don't render if no measurement
  if (!measurement) {
    return null;
  }

  const metricDisplayName = getMetricDisplayName(measurement.metric);

  const handleConfirm = () => {
    onConfirm(measurement.id);
  };

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Measurement</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this {metricDisplayName} measurement? This action cannot be undone and the data will be permanently removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={isDeleting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default DeleteMeasurementDialog;
