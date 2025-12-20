import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useCreateWellnessRequest } from '@/hooks/use-wellness-requests';
import type { WellnessTemplate, DistributionMethod } from '@shared/wellness-types';
import { TeamAthleteSelector } from '@/components/ui/team-athlete-selector';
import QRCodeGenerator from './QRCodeGenerator';

interface RequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  templates: WellnessTemplate[];
}

export default function RequestModal({ isOpen, onClose, organizationId, templates }: RequestModalProps) {
  const { toast } = useToast();
  const createRequest = useCreateWellnessRequest(organizationId);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [distributionMethod, setDistributionMethod] = useState<DistributionMethod>('magic_link');
  const [selectedAthleteIds, setSelectedAthleteIds] = useState<string[]>([]);
  const [expiryDate, setExpiryDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date.toISOString().split('T')[0];
  });
  const [showQRCode, setShowQRCode] = useState(false);
  const [createdRequest, setCreatedRequest] = useState<any>(null);

  const handleSubmit = async () => {
    if (!selectedTemplateId) {
      toast({
        title: 'Error',
        description: 'Please select a template',
        variant: 'destructive',
      });
      return;
    }

    if (selectedAthleteIds.length === 0) {
      toast({
        title: 'Error',
        description: 'Please select at least one athlete or team',
        variant: 'destructive',
      });
      return;
    }

    try {
      const request = await createRequest.mutateAsync({
        templateId: selectedTemplateId,
        distributionMethod,
        targetAthleteIds: selectedAthleteIds,
        expiresAt: new Date(expiryDate).toISOString(),
      });

      toast({
        title: 'Success',
        description: 'Wellness request sent successfully',
      });

      // If QR code distribution, show QR code modal
      if (distributionMethod === 'qr_code') {
        setCreatedRequest(request);
        setShowQRCode(true);
      } else {
        onClose();
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send request',
        variant: 'destructive',
      });
    }
  };

  if (showQRCode && createdRequest) {
    return (
      <QRCodeGenerator
        request={createdRequest}
        isOpen={showQRCode}
        onClose={() => {
          setShowQRCode(false);
          onClose();
        }}
      />
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="request-modal">
        <DialogHeader>
          <DialogTitle>Send Wellness Request</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Template Selection */}
          <div className="space-y-2">
            <Label>Select Template *</Label>
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger data-testid="select-template">
                <SelectValue placeholder="Choose a template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Distribution Method */}
          <div className="space-y-2">
            <Label>Distribution Method *</Label>
            <RadioGroup value={distributionMethod} onValueChange={(value: any) => setDistributionMethod(value)}>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center space-x-2 p-4 border rounded-md cursor-pointer hover:bg-gray-50 border-primary/50 bg-primary/5">
                  <RadioGroupItem value="magic_link" id="magic_link" data-testid="radio-magic-link" />
                  <Label htmlFor="magic_link" className="cursor-pointer flex-1">
                    <div>
                      <p className="font-medium">Magic Link</p>
                      <p className="text-xs text-gray-600">Email + push notification to each athlete</p>
                    </div>
                  </Label>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Recommended</span>
                </div>

                <div className="flex items-center space-x-2 p-4 border rounded-md cursor-pointer hover:bg-gray-50">
                  <RadioGroupItem value="athlete_account" id="athlete_account" />
                  <Label htmlFor="athlete_account" className="cursor-pointer">
                    <div>
                      <p className="font-medium">Athlete Accounts</p>
                      <p className="text-xs text-gray-600">Push notification + in-app (requires login)</p>
                    </div>
                  </Label>
                </div>

                <div className="flex items-center space-x-2 p-4 border rounded-md cursor-pointer hover:bg-gray-50">
                  <RadioGroupItem value="team_link" id="team_link" data-testid="radio-team-link" />
                  <Label htmlFor="team_link" className="cursor-pointer">
                    <div>
                      <p className="font-medium">Team Link</p>
                      <p className="text-xs text-gray-600">Share link manually (no notification)</p>
                    </div>
                  </Label>
                </div>

                <div className="flex items-center space-x-2 p-4 border rounded-md cursor-pointer hover:bg-gray-50">
                  <RadioGroupItem value="qr_code" id="qr_code" data-testid="radio-qr-code" />
                  <Label htmlFor="qr_code" className="cursor-pointer">
                    <div>
                      <p className="font-medium">QR Code</p>
                      <p className="text-xs text-gray-600">Display/print QR (no notification)</p>
                    </div>
                  </Label>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Athlete/Team Selection */}
          <div className="space-y-2">
            <Label>Select Athletes/Teams *</Label>
            <TeamAthleteSelector
              organizationId={organizationId}
              selectedAthleteIds={selectedAthleteIds}
              onSelectionChange={setSelectedAthleteIds}
            />
          </div>

          {/* Expiry Date */}
          <div className="space-y-2">
            <Label htmlFor="expiry-date">Expiry Date</Label>
            <Input
              id="expiry-date"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              data-testid="input-expiry-date"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createRequest.isPending}
            data-testid="button-send-request-submit"
          >
            {createRequest.isPending ? 'Sending...' : 'Send Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
