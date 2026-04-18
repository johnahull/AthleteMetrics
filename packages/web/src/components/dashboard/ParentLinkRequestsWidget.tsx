/**
 * ParentLinkRequestsWidget — Coach Dashboard Widget (Phase 5)
 *
 * Shows pending parent link requests for the coach's organization(s).
 * Returns null (renders nothing) when there are no pending requests.
 *
 * Each request shows parent ID, child ID (names not provided by API in list view),
 * and Approve / Deny actions. Deny opens an AlertDialog asking for an optional reason.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Users, CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';

interface ParentLinkRequest {
  id: string;
  parentUserId: string;
  athleteUserId: string;
  organizationId: string | null;
  status: 'pending';
  createdAt: string;
  expiresAt: string;
}

const QUERY_KEY = ['/api/coach/parent-link-requests'];

export function ParentLinkRequestsWidget() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [denyDialogOpen, setDenyDialogOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState('');

  const { data: requests, isLoading } = useQuery<ParentLinkRequest[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch('/api/coach/parent-link-requests', {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to fetch parent link requests');
      }
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await fetch(`/api/coach/parent-link-requests/${requestId}/approve`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to approve request');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: 'Request approved', description: 'The parent has been linked to the child.' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const denyMutation = useMutation({
    mutationFn: async ({ requestId, reason }: { requestId: string; reason?: string }) => {
      const res = await fetch(`/api/coach/parent-link-requests/${requestId}/deny`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to deny request');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: 'Request denied', description: 'The parent link request has been denied.' });
      setDenyDialogOpen(false);
      setDenyReason('');
      setSelectedRequestId(null);
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  // Don't render during loading or when empty
  if (isLoading || !requests || requests.length === 0) {
    return null;
  }

  const handleDenyClick = (requestId: string) => {
    setSelectedRequestId(requestId);
    setDenyReason('');
    setDenyDialogOpen(true);
  };

  const handleDenyConfirm = () => {
    if (!selectedRequestId) return;
    denyMutation.mutate({ requestId: selectedRequestId, reason: denyReason.trim() || undefined });
  };

  return (
    <>
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">Parent Link Requests</CardTitle>
            </div>
            <Badge variant="secondary" className="tabular-nums">
              {requests.length}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {requests.map((req) => {
            const isApproving = approveMutation.isPending && approveMutation.variables === req.id;
            const submittedDate = new Date(req.createdAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            });

            return (
              <div
                key={req.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border bg-card p-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200 text-xs"
                    >
                      <Clock className="h-3 w-3 mr-1" />
                      pending
                    </Badge>
                    <span className="text-xs text-muted-foreground">{submittedDate}</span>
                  </div>
                  <p className="text-sm font-medium truncate">
                    Parent: <span className="font-mono text-xs text-muted-foreground">{req.parentUserId.slice(0, 8)}…</span>
                  </p>
                  <p className="text-sm truncate">
                    Child: <span className="font-mono text-xs text-muted-foreground">{req.athleteUserId.slice(0, 8)}…</span>
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white h-8 px-3"
                    onClick={() => approveMutation.mutate(req.id)}
                    disabled={isApproving || denyMutation.isPending}
                  >
                    {isApproving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        Approve
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-destructive text-destructive hover:bg-destructive/10 h-8 px-3"
                    onClick={() => handleDenyClick(req.id)}
                    disabled={isApproving || denyMutation.isPending}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1" />
                    Deny
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Deny confirmation dialog */}
      <AlertDialog open={denyDialogOpen} onOpenChange={setDenyDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deny Parent Link Request</AlertDialogTitle>
            <AlertDialogDescription>
              You can optionally provide a reason for denying this request. The parent will be
              notified by email.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-2">
            <Label htmlFor="deny-reason" className="text-sm font-medium mb-1.5 block">
              Reason (optional)
            </Label>
            <Textarea
              id="deny-reason"
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              placeholder="e.g. We could not verify the parent-child relationship."
              rows={3}
              className="resize-none"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDenyReason('');
                setSelectedRequestId(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDenyConfirm}
              className="bg-destructive hover:bg-destructive/90"
              disabled={denyMutation.isPending}
            >
              {denyMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Deny Request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
