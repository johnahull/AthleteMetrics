import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, X, QrCode, Trash2 } from 'lucide-react';
import type { WellnessRequest, RequestStatus } from '@shared/wellness-types';
import { useCancelWellnessRequest, useDeleteWellnessRequest } from '@/hooks/use-wellness-requests';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import QRCodeGenerator from './QRCodeGenerator';

interface RequestsListProps {
  requests: WellnessRequest[];
  organizationId: string;
}

export default function RequestsList({ requests, organizationId }: RequestsListProps) {
  const { toast } = useToast();
  const cancelRequest = useCancelWellnessRequest(organizationId);
  const deleteRequest = useDeleteWellnessRequest(organizationId);
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'all'>('all');
  const [viewingQRRequest, setViewingQRRequest] = useState<WellnessRequest | null>(null);

  const filteredRequests = requests.filter((request) => {
    if (statusFilter === 'all') return true;
    return request.status === statusFilter;
  });

  const handleCancel = async (requestId: string) => {
    if (window.confirm('Are you sure you want to cancel this request?')) {
      try {
        await cancelRequest.mutateAsync(requestId);
        toast({
          title: 'Success',
          description: 'Request cancelled successfully',
        });
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to cancel request',
          variant: 'destructive',
        });
      }
    }
  };

  const handleDelete = async (requestId: string) => {
    if (window.confirm('Are you sure you want to permanently delete this request? This action cannot be undone.')) {
      try {
        await deleteRequest.mutateAsync(requestId);
        toast({
          title: 'Success',
          description: 'Request deleted successfully',
        });
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to delete request',
          variant: 'destructive',
        });
      }
    }
  };

  const getStatusBadge = (status: RequestStatus) => {
    const variants: Record<RequestStatus, any> = {
      active: 'default',
      completed: 'secondary',
      expired: 'destructive',
      cancelled: 'outline',
    };
    return <Badge variant={variants[status]}>{status}</Badge>;
  };

  const getCompletionRate = (request: WellnessRequest) => {
    // Mock calculation - in real implementation, fetch actual response counts
    const total = (request.targetAthleteIds?.length || 0) + (request.targetTeamIds?.length || 0);
    const completed = 0; // TODO: Fetch actual responses
    const rate = total > 0 ? (completed / total) * 100 : 0;
    return { completed, total, rate };
  };

  return (
    <>
      <div className="space-y-4">
        {/* Filter */}
        <div className="flex items-center gap-4">
          <Select
            value={statusFilter}
            onValueChange={(value: any) => setStatusFilter(value)}
          >
            <SelectTrigger className="w-48" data-testid="select-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active" data-testid="filter-active">Active</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          {statusFilter !== 'all' && (
            <Badge variant="outline" data-testid="status-filter-badge">
              {statusFilter}
            </Badge>
          )}
        </div>

        {/* Requests Table */}
        <div className="border rounded-md" data-testid="requests-list">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Distribution</TableHead>
                <TableHead>Completion</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRequests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                    No wellness requests found
                  </TableCell>
                </TableRow>
              ) : (
                filteredRequests.map((request) => {
                  const { completed, total, rate } = getCompletionRate(request);
                  return (
                    <TableRow
                      key={request.id}
                      data-testid={`request-row-${request.id}`}
                      className="cursor-pointer hover:bg-gray-50"
                    >
                      <TableCell>
                        <p className="font-medium">Template #{request.templateId.slice(0, 8)}</p>
                      </TableCell>
                      <TableCell data-testid={`request-status-${request.id}`}>
                        {getStatusBadge(request.status)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{request.distributionMethod}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 min-w-[150px]">
                          <div className="flex items-center justify-between text-sm">
                            <span data-testid={`completion-text-${request.id}`}>
                              {completed}/{total} - {Math.round(rate)}%
                            </span>
                          </div>
                          <Progress
                            value={rate}
                            className="h-2"
                            data-testid={`progress-bar-${request.id}`}
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">
                          {format(new Date(request.createdAt), 'MMM d, yyyy')}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {(request.distributionMethod === 'qr_code' || request.distributionMethod === 'team_link') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setViewingQRRequest(request)}
                              data-testid={`button-view-qr-${request.id}`}
                            >
                              <QrCode className="h-4 w-4" />
                            </Button>
                          )}
                          {request.status === 'active' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancel(request.id)}
                              data-testid={`button-cancel-request-${request.id}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(request.id)}
                            data-testid={`button-delete-request-${request.id}`}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* QR Code Modal */}
      {viewingQRRequest && (
        <QRCodeGenerator
          request={viewingQRRequest}
          isOpen={!!viewingQRRequest}
          onClose={() => setViewingQRRequest(null)}
        />
      )}
    </>
  );
}
