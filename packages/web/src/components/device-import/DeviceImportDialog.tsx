/**
 * DeviceImportDialog
 *
 * Five-step wizard for importing device data (Dashr, etc.) into AthleteMetrics:
 *   1. Upload  — choose file + source
 *   2. Session — pick session date when CSV has multiple sessions
 *   3. Review  — inspect matched athletes and override assignments
 *   4. Confirm — choose duplicate strategy and commit
 *   5. Success — show results, allow rollback
 */

import React, { useRef, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { WizardStepIndicator } from '@/components/import/WizardStepIndicator';
import {
  useDeviceImport,
  type PreviewAthlete,
  type ParsedSession,
} from '@/hooks/useDeviceImport';
import { ChevronDown, ChevronRight, AlertTriangle, Upload, Loader2 } from 'lucide-react';

// ─── Props ────────────────────────────────────────────────────────────────────

interface DeviceImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  eventId?: string;
  eventType?: string;
}

// ─── Athlete type for org-wide list ──────────────────────────────────────────

interface OrgAthlete {
  id: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
}

// ─── Step number mapping ──────────────────────────────────────────────────────

const STEP_LABELS = ['Upload', 'Session', 'Review', 'Confirm', 'Done'];

function getStepNumber(step: string, hasSessions: boolean): number {
  if (!hasSessions) {
    // Collapsed: upload(1) → review(2) → confirm(3) → success(4)
    const map: Record<string, number> = {
      upload: 1,
      parsing: 1,
      review: 2,
      confirm: 3,
      success: 4,
    };
    return map[step] ?? 1;
  }
  const map: Record<string, number> = {
    upload: 1,
    parsing: 1,
    'session-select': 2,
    review: 3,
    confirm: 4,
    success: 5,
  };
  return map[step] ?? 1;
}

// ─── Match Badge ──────────────────────────────────────────────────────────────

function MatchBadge({ matchType }: { matchType: 'exact' | 'fuzzy' | 'partial' | 'none' }) {
  if (matchType === 'exact') {
    return <Badge className="bg-green-100 text-green-800 border-green-200">Exact</Badge>;
  }
  if (matchType === 'fuzzy') {
    return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Fuzzy</Badge>;
  }
  if (matchType === 'partial') {
    return <Badge className="bg-orange-100 text-orange-800 border-orange-200">Partial</Badge>;
  }
  return <Badge variant="destructive">Unmatched</Badge>;
}

// ─── Athlete Review Row ───────────────────────────────────────────────────────

interface AthleteReviewRowProps {
  athlete: PreviewAthlete;
  orgAthletes: OrgAthlete[];
  overrideMatchedId: string | undefined;
  included: boolean;
  onOverride: (csvName: string, athleteId: string | undefined) => void;
  onIncluded: (csvName: string, included: boolean) => void;
}

function AthleteReviewRow({
  athlete,
  orgAthletes,
  overrideMatchedId,
  included,
  onOverride,
  onIncluded,
}: AthleteReviewRowProps) {
  const [open, setOpen] = useState(false);
  const effectiveMatchId = overrideMatchedId ?? athlete.matchedAthleteId;
  const effectiveMatchType =
    overrideMatchedId && overrideMatchedId !== athlete.matchedAthleteId
      ? 'fuzzy'
      : athlete.matchType;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <TableRow className={included ? '' : 'opacity-50'}>
        {/* Expand toggle */}
        <TableCell className="w-8 p-2">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
              {open ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </Button>
          </CollapsibleTrigger>
        </TableCell>

        {/* Athlete name */}
        <TableCell className="font-medium w-[25%]">{athlete.csvName}</TableCell>

        {/* Match status */}
        <TableCell className="w-[12%]">
          <MatchBadge matchType={effectiveMatchType as 'exact' | 'fuzzy' | 'partial' | 'none'} />
        </TableCell>

        {/* Match override dropdown */}
        <TableCell className="w-[30%]">
          <Select
            value={effectiveMatchId ?? '__none__'}
            onValueChange={(val) =>
              onOverride(athlete.csvName, val === '__none__' ? undefined : val)
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="No match" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No match (skip)</SelectItem>
              {orgAthletes.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>

        {/* Drills summary */}
        <TableCell className="text-sm text-muted-foreground w-[13%]">
          {athlete.drills.length} drill{athlete.drills.length !== 1 ? 's' : ''}
          {athlete.drills.some((d) => d.isOutlier) && (
            <span className="ml-1 text-yellow-600">
              <AlertTriangle className="inline h-3 w-3" />
            </span>
          )}
        </TableCell>

        {/* Include toggle */}
        <TableCell className="text-center w-[10%]">
          <Checkbox
            checked={included}
            onCheckedChange={(checked) =>
              onIncluded(athlete.csvName, checked === true)
            }
            aria-label={`Include ${athlete.csvName}`}
          />
        </TableCell>
      </TableRow>

      {/* Expanded drill details */}
      <CollapsibleContent asChild>
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/30 p-3">
            <div className="space-y-1 text-xs">
              {athlete.drills.map((drill, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="font-mono text-muted-foreground w-28">{drill.metric}</span>
                  <span className="font-semibold">
                    {drill.value} {drill.units}
                  </span>
                  {drill.isOutlier && (
                    <Badge variant="outline" className="text-yellow-700 border-yellow-300 text-xs">
                      Outlier: {drill.outlierReason}
                    </Badge>
                  )}
                  {drill.splits && drill.splits.length > 0 && (
                    <span className="text-muted-foreground">
                      ({drill.splits.map((s) => `${s.metric}: ${s.value}${s.units}`).join(', ')})
                    </span>
                  )}
                </div>
              ))}
            </div>
          </TableCell>
        </TableRow>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Main Dialog ──────────────────────────────────────────────────────────────

export function DeviceImportDialog({
  open,
  onOpenChange,
  organizationId,
  eventId,
}: DeviceImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [source] = useState<string>('dashr');
  const [duplicateStrategy, setDuplicateStrategy] = useState<'skip' | 'replace'>('skip');
  const [addMissingEventMetrics, setAddMissingEventMetrics] = useState(false);

  const {
    step,
    preview,
    sessions,
    warnings,
    commitResult,
    selectedSessionDate,
    athleteOverrides,
    parseMutation,
    commitMutation,
    rollbackMutation,
    setStep,
    goBack,
    reset,
    setSelectedSessionDate,
    setAthleteOverride,
    setAthleteIncluded,
  } = useDeviceImport({ organizationId, eventId });

  // Fetch org athletes for the override dropdown
  const { data: orgAthletes = [] } = useQuery<OrgAthlete[]>({
    queryKey: ['/api/athletes', organizationId],
    queryFn: async () => {
      const response = await fetch(
        `/api/athletes?organizationId=${organizationId}`,
        { credentials: 'include' }
      );
      if (!response.ok) return [];
      return response.json();
    },
    enabled: open && step === 'review',
    staleTime: 5 * 60 * 1000,
  });

  // Reset local state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedFile(null);
      setDuplicateStrategy('skip');
      setAddMissingEventMetrics(false);
      reset();
    }
  }, [open, reset]);

  // ── Sorted preview athletes (unmatched first, fuzzy second, exact last) ──────
  const sortedAthletes = preview
    ? [...preview.athletes].sort((a, b) => {
        const order: Record<string, number> = { none: 0, partial: 1, fuzzy: 2, exact: 3 };
        return order[a.matchType] - order[b.matchType];
      })
    : [];

  const hasSessions = sessions.length > 1;
  const totalSteps = hasSessions ? 5 : 4;
  const currentStepNum = getStepNumber(step, hasSessions);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
  };

  const handleParse = () => {
    if (!selectedFile) return;
    setStep('parsing');
    parseMutation.mutate({
      file: selectedFile,
      source,
      sessionDate: selectedSessionDate ?? undefined,
    });
  };

  const handleSessionConfirm = () => {
    if (!selectedSessionDate || !selectedFile) return;
    // Re-parse with the chosen session date to filter athletes/drills
    setStep('parsing');
    parseMutation.mutate({
      file: selectedFile,
      source,
      sessionDate: selectedSessionDate,
    });
  };

  const handleCommit = () => {
    commitMutation.mutate({ duplicateStrategy, addMissingEventMetrics });
  };

  const handleRollback = () => {
    rollbackMutation.mutate();
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  // ── Step: Upload ─────────────────────────────────────────────────────────────
  const renderUpload = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold mb-1">Select Device CSV</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Upload a CSV exported from your timing device. Currently supported: Dashr.
        </p>

        {/* Source indicator — single option for now */}
        <div className="mb-4">
          <Label className="text-sm font-medium">Source Device</Label>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="outline" className="text-sm px-3 py-1">Dashr</Badge>
          </div>
        </div>

        {/* File input */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload CSV file. Drop file here or press Enter to browse."
          className="border-2 border-dashed border-muted rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file && file.name.toLowerCase().endsWith('.csv')) {
              setSelectedFile(file);
            }
          }}
        >
          <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          {selectedFile ? (
            <div>
              <p className="font-medium text-sm">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium">Drop file here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">CSV files only</p>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {warnings.length > 0 && (
        <Alert variant="default" className="border-yellow-300 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800 text-sm">
            {warnings.join(' ')}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button
          onClick={handleParse}
          disabled={!selectedFile || parseMutation.isPending}
        >
          {parseMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Parsing...
            </>
          ) : (
            'Parse File'
          )}
        </Button>
      </div>
    </div>
  );

  // ── Step: Parsing (transitional) ─────────────────────────────────────────────
  const renderParsing = () => (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Parsing and matching athletes...</p>
    </div>
  );

  // ── Step: Session Select ──────────────────────────────────────────────────────
  const renderSessionSelect = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold mb-1">Select Session</h3>
        <p className="text-sm text-muted-foreground">
          This CSV contains multiple sessions. Choose which session to import.
        </p>
      </div>

      <RadioGroup
        value={selectedSessionDate ?? ''}
        onValueChange={setSelectedSessionDate}
        className="space-y-2"
      >
        {sessions.map((session: ParsedSession) => (
          <div
            key={session.sessionDate}
            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              selectedSessionDate === session.sessionDate
                ? 'border-primary bg-primary/5'
                : 'border-muted hover:border-primary/40'
            }`}
            onClick={() => setSelectedSessionDate(session.sessionDate)}
          >
            <RadioGroupItem value={session.sessionDate} id={`session-${session.sessionDate}`} />
            <Label
              htmlFor={`session-${session.sessionDate}`}
              className="flex-1 cursor-pointer"
            >
              <div className="font-medium">{session.sessionLabel}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {session.athleteCount} athletes &middot; {session.drillCount} drills
              </div>
            </Label>
          </div>
        ))}
      </RadioGroup>

      <div className="flex justify-between">
        <Button variant="outline" onClick={goBack}>
          Back
        </Button>
        <Button
          onClick={handleSessionConfirm}
          disabled={!selectedSessionDate}
        >
          Continue
        </Button>
      </div>
    </div>
  );

  // ── Step: Review ─────────────────────────────────────────────────────────────
  const renderReview = () => {
    if (!preview) return null;
    const { summary } = preview;

    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold mb-1">Review Athletes</h3>
          <p className="text-sm text-muted-foreground">
            Verify athlete matches and exclude any rows you don't want imported.
          </p>
        </div>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-xs font-medium">
            {summary.exactMatches} exact
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 text-xs font-medium">
            {summary.fuzzyMatches} fuzzy
          </span>
          {summary.partialMatches > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 text-xs font-medium">
              {summary.partialMatches} partial
            </span>
          )}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-xs font-medium">
            {summary.unmatched} unmatched
          </span>
          {summary.outlierCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 text-xs font-medium">
              {summary.outlierCount} outliers
            </span>
          )}
        </div>

        {warnings.length > 0 && (
          <Alert variant="default" className="border-yellow-300 bg-yellow-50 py-2">
            <AlertTriangle className="h-3 w-3 text-yellow-600" />
            <AlertDescription className="text-yellow-800 text-xs">
              {warnings.join(' ')}
            </AlertDescription>
          </Alert>
        )}

        {/* Athletes table */}
        <div className="border rounded-lg overflow-auto max-h-[380px]">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 p-2" />
                <TableHead className="w-[25%]">Athlete</TableHead>
                <TableHead className="w-[12%]">Match</TableHead>
                <TableHead className="w-[30%]">Assign To</TableHead>
                <TableHead className="w-[13%]">Drills</TableHead>
                <TableHead className="w-[10%] text-center">Include</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedAthletes.map((athlete) => {
                const override = athleteOverrides[athlete.csvName];
                return (
                  <AthleteReviewRow
                    key={athlete.csvName}
                    athlete={athlete}
                    orgAthletes={orgAthletes}
                    overrideMatchedId={override?.matchedAthleteId}
                    included={override?.included ?? athlete.included}
                    onOverride={setAthleteOverride}
                    onIncluded={setAthleteIncluded}
                  />
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={goBack}>
            Back
          </Button>
          <Button onClick={() => setStep('confirm')}>
            Continue
          </Button>
        </div>
      </div>
    );
  };

  // ── Step: Confirm ─────────────────────────────────────────────────────────────
  const renderConfirm = () => {
    if (!preview) return null;
    const { summary } = preview;
    const includedCount = preview.athletes.filter((a) => {
      const override = athleteOverrides[a.csvName];
      return override?.included ?? a.included;
    }).length;

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-base font-semibold mb-1">Confirm Import</h3>
          <p className="text-sm text-muted-foreground">
            Review settings before committing the import.
          </p>
        </div>

        {/* Summary */}
        <div className="rounded-lg border p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Athletes to import</span>
            <span className="font-medium">{includedCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total drills</span>
            <span className="font-medium">{summary.totalDrills}</span>
          </div>
          {summary.outlierCount > 0 && (
            <div className="flex justify-between text-yellow-700">
              <span>Outlier measurements</span>
              <span className="font-medium">{summary.outlierCount}</span>
            </div>
          )}
        </div>

        {/* Duplicate strategy */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Duplicate Measurements</Label>
          <RadioGroup
            value={duplicateStrategy}
            onValueChange={(v) => setDuplicateStrategy(v as 'skip' | 'replace')}
            className="space-y-2"
          >
            <div className="flex items-start gap-2">
              <RadioGroupItem value="skip" id="dup-skip" className="mt-0.5" />
              <div>
                <Label htmlFor="dup-skip" className="font-medium cursor-pointer">
                  Skip duplicates
                </Label>
                <p className="text-xs text-muted-foreground">
                  Existing measurements for the same athlete and date are kept unchanged.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="replace" id="dup-replace" className="mt-0.5" />
              <div>
                <Label htmlFor="dup-replace" className="font-medium cursor-pointer">
                  Replace duplicates
                </Label>
                <p className="text-xs text-muted-foreground">
                  Existing measurements are overwritten with the imported values.
                </p>
              </div>
            </div>
          </RadioGroup>
        </div>

        {/* Add missing event metrics (only when event-linked) */}
        {eventId && (
          <div className="flex items-start gap-2">
            <Checkbox
              id="add-missing-metrics"
              checked={addMissingEventMetrics}
              onCheckedChange={(checked) => setAddMissingEventMetrics(checked === true)}
            />
            <div>
              <Label htmlFor="add-missing-metrics" className="font-medium cursor-pointer">
                Add missing event metrics
              </Label>
              <p className="text-xs text-muted-foreground">
                Automatically add any imported metrics to the event's metric list.
              </p>
            </div>
          </div>
        )}

        <div className="flex justify-between">
          <Button variant="outline" onClick={goBack}>
            Back
          </Button>
          <Button
            onClick={handleCommit}
            disabled={commitMutation.isPending || includedCount === 0}
          >
            {commitMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              `Import ${includedCount} Athlete${includedCount !== 1 ? 's' : ''}`
            )}
          </Button>
        </div>
      </div>
    );
  };

  // ── Step: Success ─────────────────────────────────────────────────────────────
  const renderSuccess = () => {
    if (!commitResult) return null;
    const { measurementsCreated, measurementsSkipped, measurementsReplaced, athletesImported } =
      commitResult;

    return (
      <div className="space-y-6">
        <div className="text-center py-4">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-7 h-7 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold">Import Complete</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Your data has been successfully imported.
          </p>
        </div>

        {/* Results grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{measurementsCreated}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Created</div>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-blue-600">{measurementsReplaced}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Replaced</div>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-muted-foreground">{measurementsSkipped}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Skipped</div>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold">{athletesImported}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Athletes</div>
          </div>
        </div>

        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={handleRollback}
            disabled={rollbackMutation.isPending}
            className="text-destructive border-destructive/30 hover:bg-destructive/5"
          >
            {rollbackMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Undoing...
              </>
            ) : (
              'Undo Import'
            )}
          </Button>
          <Button onClick={handleClose}>Close</Button>
        </div>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !commitMutation.isPending) {
          onOpenChange(false);
        } else if (isOpen) {
          onOpenChange(true);
        }
      }}
    >
      <DialogContent
        className="max-h-[90vh] overflow-y-auto"
        style={{ maxWidth: '900px', width: '95vw' }}
      >
        <DialogHeader>
          <DialogTitle>Import Device Data</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 w-full overflow-hidden">
          {/* Step indicator — hide on parsing transitional step */}
          {step !== 'parsing' && (
            <WizardStepIndicator
              currentStep={currentStepNum}
              totalSteps={totalSteps}
              stepLabels={hasSessions ? STEP_LABELS : STEP_LABELS.filter((_, i) => i !== 1)}
            />
          )}

          {/* Step content */}
          <div className="min-h-[300px]">
            {step === 'upload' && renderUpload()}
            {step === 'parsing' && renderParsing()}
            {step === 'session-select' && renderSessionSelect()}
            {step === 'review' && renderReview()}
            {step === 'confirm' && renderConfirm()}
            {step === 'success' && renderSuccess()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
