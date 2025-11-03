import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

interface BenchmarkDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  benchmarkName: string;
  isDeleting?: boolean;
}

export function BenchmarkDeleteDialog({
  open,
  onClose,
  onConfirm,
  benchmarkName,
  isDeleting = false,
}: BenchmarkDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <DialogTitle>Delete Benchmark</DialogTitle>
          </div>
          <DialogDescription>
            Are you sure you want to delete <strong>"{benchmarkName}"</strong>?
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            This action cannot be undone. Deleting this benchmark will:
          </p>
          <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-muted-foreground">
            <li>Remove it from all organizations</li>
            <li>Delete all enablement records</li>
            <li>Remove it from athlete benchmark status reports</li>
          </ul>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete Benchmark"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
