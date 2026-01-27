import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useCreateWellnessRequest } from '@/hooks/use-wellness-requests';
import type { WellnessTemplate, DistributionMethod, RecurrenceType } from '@shared/wellness-types';
import { TeamAthleteSelector } from '@/components/ui/team-athlete-selector';
import QRCodeGenerator from './QRCodeGenerator';

type SendMode = 'now' | 'schedule' | 'recurring';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

interface RequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  templates: WellnessTemplate[];
}

export default function RequestModal({ isOpen, onClose, organizationId, templates }: RequestModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
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

  // Send mode: now / schedule / recurring
  const [sendMode, setSendMode] = useState<SendMode>('now');

  // One-time schedule state
  const [scheduledDateTime, setScheduledDateTime] = useState('');

  // Recurring schedule state
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('daily');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 3, 5]); // Mon, Wed, Fri default
  const [customIntervalDays, setCustomIntervalDays] = useState(3);
  const [scheduledTime, setScheduledTime] = useState('08:00');
  const [endMode, setEndMode] = useState<'date' | 'count'>('count');
  const [endDate, setEndDate] = useState('');
  const [maxOccurrences, setMaxOccurrences] = useState(30);

  // Recurring schedule mutation
  const createSchedule = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch(`/api/organizations/${organizationId}/wellness/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to create schedule');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', organizationId, 'wellness', 'schedules'] });
    },
  });

  const toggleDay = (day: number) => {
    setDaysOfWeek(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day].sort()
    );
  };

  const handleSubmit = async () => {
    if (!selectedTemplateId) {
      toast({ title: 'Error', description: 'Please select a template', variant: 'destructive' });
      return;
    }

    if (selectedAthleteIds.length === 0) {
      toast({ title: 'Error', description: 'Please select at least one athlete or team', variant: 'destructive' });
      return;
    }

    // One-time schedule validation
    if (sendMode === 'schedule') {
      if (!scheduledDateTime) {
        toast({ title: 'Error', description: 'Please select a date and time', variant: 'destructive' });
        return;
      }
      if (new Date(scheduledDateTime) <= new Date()) {
        toast({ title: 'Error', description: 'Scheduled time must be in the future', variant: 'destructive' });
        return;
      }
    }

    // Recurring validation
    if (sendMode === 'recurring') {
      if (recurrenceType === 'weekly' && daysOfWeek.length === 0) {
        toast({ title: 'Error', description: 'Select at least one day of the week', variant: 'destructive' });
        return;
      }
      if (endMode === 'date' && !endDate) {
        toast({ title: 'Error', description: 'Please select an end date', variant: 'destructive' });
        return;
      }
    }

    try {
      if (sendMode === 'recurring') {
        // Create a recurring schedule
        const payload: any = {
          templateId: selectedTemplateId,
          distributionMethod,
          targetAthleteIds: selectedAthleteIds,
          recurrenceType,
          scheduledTime,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };

        if (recurrenceType === 'weekly') {
          payload.daysOfWeek = daysOfWeek;
        }
        if (recurrenceType === 'custom') {
          payload.customIntervalDays = customIntervalDays;
        }
        if (endMode === 'date') {
          payload.endDate = new Date(endDate).toISOString();
        } else {
          payload.maxOccurrences = maxOccurrences;
        }

        await createSchedule.mutateAsync(payload);

        toast({
          title: 'Success',
          description: `Recurring wellness schedule created (${recurrenceType} at ${scheduledTime})`,
        });
        onClose();
        return;
      }

      // One-time request (immediate or scheduled)
      const payload: any = {
        templateId: selectedTemplateId,
        distributionMethod,
        targetAthleteIds: selectedAthleteIds,
        expiresAt: new Date(expiryDate).toISOString(),
      };

      if (sendMode === 'schedule' && scheduledDateTime) {
        payload.scheduledFor = new Date(scheduledDateTime).toISOString();
      }

      const request = await createRequest.mutateAsync(payload);

      toast({
        title: 'Success',
        description: sendMode === 'schedule'
          ? `Wellness request scheduled for ${new Date(scheduledDateTime).toLocaleString()}`
          : 'Wellness request sent successfully',
      });

      if (distributionMethod === 'qr_code' && sendMode === 'now') {
        setCreatedRequest(request);
        setShowQRCode(true);
      } else {
        onClose();
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to send request', variant: 'destructive' });
    }
  };

  const isPending = createRequest.isPending || createSchedule.isPending;

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

          {/* Send Mode */}
          <div className="space-y-3">
            <Label>When to send</Label>
            <RadioGroup value={sendMode} onValueChange={(v: any) => setSendMode(v)}>
              <div className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="now" id="send-now" data-testid="send-mode-now" />
                  <Label htmlFor="send-now" className="cursor-pointer font-medium">Send now</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="schedule" id="send-schedule" data-testid="send-mode-schedule" />
                  <Label htmlFor="send-schedule" className="cursor-pointer font-medium">Schedule</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="recurring" id="send-recurring" data-testid="send-mode-recurring" />
                  <Label htmlFor="send-recurring" className="cursor-pointer font-medium">Recurring</Label>
                </div>
              </div>
            </RadioGroup>

            {/* One-time schedule config */}
            {sendMode === 'schedule' && (
              <div className="space-y-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <Label htmlFor="scheduled-datetime">Send at</Label>
                <Input
                  id="scheduled-datetime"
                  type="datetime-local"
                  value={scheduledDateTime}
                  onChange={(e) => setScheduledDateTime(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  data-testid="input-scheduled-datetime"
                />
                <p className="text-xs text-blue-600">
                  Notifications will be sent automatically at the scheduled time.
                </p>
              </div>
            )}

            {/* Recurring schedule config */}
            {sendMode === 'recurring' && (
              <div className="space-y-4 p-3 bg-purple-50 border border-purple-200 rounded-md">
                {/* Recurrence type */}
                <div className="space-y-2">
                  <Label>Frequency</Label>
                  <Select value={recurrenceType} onValueChange={(v: any) => setRecurrenceType(v)}>
                    <SelectTrigger data-testid="select-recurrence-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="custom">Custom interval</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Weekly: day-of-week checkboxes */}
                {recurrenceType === 'weekly' && (
                  <div className="space-y-2">
                    <Label>Days of the week</Label>
                    <div className="flex gap-2">
                      {DAY_LABELS.map((label, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => toggleDay(idx)}
                          className={`w-10 h-10 rounded-full text-xs font-medium transition-colors ${
                            daysOfWeek.includes(idx)
                              ? 'bg-purple-600 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                          data-testid={`day-toggle-${idx}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Custom: interval input */}
                {recurrenceType === 'custom' && (
                  <div className="space-y-2">
                    <Label htmlFor="custom-interval">Every ___ days</Label>
                    <Input
                      id="custom-interval"
                      type="number"
                      min={1}
                      max={365}
                      value={customIntervalDays}
                      onChange={(e) => setCustomIntervalDays(parseInt(e.target.value) || 1)}
                      data-testid="input-custom-interval"
                    />
                  </div>
                )}

                {/* Time picker */}
                <div className="space-y-2">
                  <Label htmlFor="schedule-time">Time of day</Label>
                  <Input
                    id="schedule-time"
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    data-testid="input-schedule-time"
                  />
                </div>

                {/* End condition */}
                <div className="space-y-2">
                  <Label>Ends</Label>
                  <RadioGroup value={endMode} onValueChange={(v: any) => setEndMode(v)}>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <RadioGroupItem value="count" id="end-count" />
                        <Label htmlFor="end-count" className="cursor-pointer">After</Label>
                        <Input
                          type="number"
                          min={1}
                          max={1000}
                          value={maxOccurrences}
                          onChange={(e) => setMaxOccurrences(parseInt(e.target.value) || 1)}
                          className="w-20"
                          disabled={endMode !== 'count'}
                          data-testid="input-max-occurrences"
                        />
                        <span className="text-sm text-gray-600">occurrences</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <RadioGroupItem value="date" id="end-date" />
                        <Label htmlFor="end-date" className="cursor-pointer">On date</Label>
                        <Input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                          className="w-44"
                          disabled={endMode !== 'date'}
                          data-testid="input-end-date"
                        />
                      </div>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            )}
          </div>

          {/* Expiry Date (only for non-recurring) */}
          {sendMode !== 'recurring' && (
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
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending}
            data-testid="button-send-request-submit"
          >
            {isPending
              ? (sendMode === 'recurring' ? 'Creating...' : sendMode === 'schedule' ? 'Scheduling...' : 'Sending...')
              : (sendMode === 'recurring' ? 'Create Schedule' : sendMode === 'schedule' ? 'Schedule Request' : 'Send Request')
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
