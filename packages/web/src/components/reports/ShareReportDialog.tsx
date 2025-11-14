import { useState } from "react";
import {
  useCreateSnapshot,
  useReportSnapshots,
  useRevokeSnapshot,
} from "@/hooks/use-reports";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Copy, Trash2, Eye, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, addDays } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ShareReportDialogProps {
  reportId: string;
  open: boolean;
  onClose: () => void;
}

export function ShareReportDialog({ reportId, open, onClose }: ShareReportDialogProps) {
  const [expirationDays, setExpirationDays] = useState("7");
  const [customExpiration, setCustomExpiration] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState("");

  const { toast } = useToast();
  const createSnapshot = useCreateSnapshot(reportId);
  const { data: snapshots, isLoading } = useReportSnapshots(reportId);
  const revokeSnapshot = useRevokeSnapshot(reportId);

  const handleCreateLink = async () => {
    let expiresAt: Date;

    if (expirationDays === "custom") {
      if (!customExpiration) {
        toast({
          title: "Error",
          description: "Please select a custom expiration date",
          variant: "destructive",
        });
        return;
      }
      expiresAt = new Date(customExpiration);
    } else {
      expiresAt = addDays(new Date(), parseInt(expirationDays));
    }

    const result = await createSnapshot.mutateAsync({
      expiresAt: expiresAt.toISOString(),
    });

    const url = `${window.location.origin}/public/reports/${result.publicToken}`;
    setGeneratedUrl(url);
  };

  const handleCopyUrl = () => {
    if (generatedUrl) {
      navigator.clipboard.writeText(generatedUrl);
      toast({
        title: "Success",
        description: "Link copied to clipboard",
      });
    }
  };

  const handleRevokeSnapshot = async (snapshotId: string) => {
    await revokeSnapshot.mutateAsync(snapshotId);
  };

  const activeSnapshots = snapshots?.filter((s) => s.isActive && !s.revokedAt) || [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share Report</DialogTitle>
          <DialogDescription>
            Create a public link to share this report with others
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Create New Link */}
          <div className="space-y-4 border rounded-lg p-4">
            <h3 className="font-semibold">Create New Share Link</h3>

            <div className="space-y-2">
              <Label htmlFor="expiration">Link Expiration</Label>
              <Select value={expirationDays} onValueChange={setExpirationDays}>
                <SelectTrigger id="expiration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 day</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="custom">Custom date</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {expirationDays === "custom" && (
              <div className="space-y-2">
                <Label htmlFor="customExpiration">Custom Expiration Date</Label>
                <Input
                  id="customExpiration"
                  type="date"
                  value={customExpiration}
                  onChange={(e) => setCustomExpiration(e.target.value)}
                  min={format(new Date(), "yyyy-MM-dd")}
                />
              </div>
            )}

            <Button
              onClick={handleCreateLink}
              disabled={createSnapshot.isPending}
              className="w-full"
            >
              {createSnapshot.isPending ? <LoadingSpinner /> : "Create Link"}
            </Button>

            {generatedUrl && (
              <div className="space-y-2 mt-4 p-3 bg-accent rounded-lg">
                <Label>Generated Link</Label>
                <div className="flex gap-2">
                  <Input value={generatedUrl} readOnly className="flex-1" />
                  <Button variant="outline" size="icon" onClick={handleCopyUrl}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Active Links */}
          <div className="space-y-4">
            <h3 className="font-semibold">Active Share Links</h3>

            {isLoading ? (
              <div className="flex justify-center py-4">
                <LoadingSpinner />
              </div>
            ) : activeSnapshots.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No active share links
              </p>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Created</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Views</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeSnapshots.map((snapshot) => (
                      <TableRow key={snapshot.id}>
                        <TableCell className="text-sm">
                          {format(new Date(snapshot.createdAt), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(snapshot.expiresAt), "MMM d, yyyy")}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {snapshot.viewCount}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const url = `${window.location.origin}/public/reports/${snapshot.publicToken}`;
                                navigator.clipboard.writeText(url);
                                toast({
                                  title: "Success",
                                  description: "Link copied to clipboard",
                                });
                              }}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRevokeSnapshot(snapshot.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
