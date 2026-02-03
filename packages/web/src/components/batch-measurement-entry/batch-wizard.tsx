import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Wand2, Calendar, Hash, Users, Target, CheckCircle, AlertTriangle, Minus, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { TeamAthleteSelector } from '@/components/ui/team-athlete-selector';
import { useAvailableMetrics } from '@/hooks/use-available-metrics';

export interface BatchWizardConfig {
  athleteIds: string[];
  metrics: string[];
  date: string;
  measurementsPerAthlete: number;
}

interface BatchWizardProps {
  open: boolean;
  onClose: () => void;
  onComplete: (config: BatchWizardConfig) => void;
}

export function BatchWizard({ open, onClose, onComplete }: BatchWizardProps) {
  const [step, setStep] = useState(1);
  const [selectedAthleteIds, setSelectedAthleteIds] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [measurementsPerAthlete, setMeasurementsPerAthlete] = useState(1);

  const totalSteps = 4;
  const progress = (step / totalSteps) * 100;

  const handleNext = () => {
    // Validation
    if (step === 1 && selectedAthleteIds.length === 0) {
      return; // Can't proceed without athletes
    }
    if (step === 2 && selectedMetrics.length === 0) {
      return; // Can't proceed without metrics
    }

    if (step < totalSteps) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleGenerate = () => {
    const config: BatchWizardConfig = {
      athleteIds: selectedAthleteIds,
      metrics: selectedMetrics,
      date,
      measurementsPerAthlete,
    };
    onComplete(config);
    handleClose();
  };

  const handleClose = () => {
    // Reset state
    setStep(1);
    setSelectedAthleteIds([]);
    setSelectedMetrics([]);
    setDate(new Date().toISOString().split('T')[0]);
    setMeasurementsPerAthlete(1);
    onClose();
  };

  const canProceed = () => {
    if (step === 1) return selectedAthleteIds.length > 0;
    if (step === 2) return selectedMetrics.length > 0;
    if (step === 4) {
      // Check 500-row limit on final step
      // Note: This is a UX limit to prevent browser performance issues from rendering too many form fields
      // The backend API limit is 100 measurements per request (handled during batch save)
      const totalRows = selectedAthleteIds.length * selectedMetrics.length * measurementsPerAthlete;
      return totalRows <= 500;
    }
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Quick Setup Wizard
          </DialogTitle>
          <DialogDescription>
            Pre-configure your batch entry grid with teams, metrics, and settings
          </DialogDescription>
        </DialogHeader>

        {/* Progress Bar */}
        <div className="py-4">
          <div className="flex justify-between text-sm text-muted-foreground mb-2">
            <span>Step {step} of {totalSteps}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Step Content */}
        <div className="min-h-[400px]">
          {step === 1 && (
            <StepAthletes
              selectedAthleteIds={selectedAthleteIds}
              onSelectionChange={setSelectedAthleteIds}
            />
          )}
          {step === 2 && (
            <StepMetrics
              selectedMetrics={selectedMetrics}
              onSelectionChange={setSelectedMetrics}
            />
          )}
          {step === 3 && (
            <StepConfiguration
              date={date}
              measurementsPerAthlete={measurementsPerAthlete}
              onDateChange={setDate}
              onMeasurementsChange={setMeasurementsPerAthlete}
            />
          )}
          {step === 4 && (
            <StepReview
              athleteIds={selectedAthleteIds}
              metrics={selectedMetrics}
              date={date}
              measurementsPerAthlete={measurementsPerAthlete}
            />
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleClose}
          >
            Cancel
          </Button>

          <div className="flex gap-2">
            {step > 1 && (
              <Button
                variant="outline"
                onClick={handleBack}
              >
                Back
              </Button>
            )}

            {step < totalSteps && (
              <Button
                onClick={handleNext}
                disabled={!canProceed()}
              >
                Next
              </Button>
            )}

            {step === totalSteps && (
              <Button
                onClick={handleGenerate}
                disabled={!canProceed()}
              >
                Generate Grid
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Step Components
interface StepAthletesProps {
  selectedAthleteIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

function StepAthletes({ selectedAthleteIds, onSelectionChange }: StepAthletesProps) {
  const { organizationContext, userOrganizations } = useAuth();

  // Get organization ID - prefer context, fallback to user's first org
  const organizationId = organizationContext || userOrganizations?.[0]?.organizationId || '';

  if (!organizationId) {
    return (
      <div>
        <h3 className="text-lg font-semibold mb-4">Step 1: Select Athletes</h3>
        <p className="text-muted-foreground">No organization context found. Please select an organization first.</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Step 1: Select Athletes</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Choose teams or individual athletes for batch data entry
      </p>

      <TeamAthleteSelector
        organizationId={organizationId}
        selectedAthleteIds={selectedAthleteIds}
        onSelectionChange={onSelectionChange}
      />

      {selectedAthleteIds.length > 0 && (
        <div className="mt-4 p-3 bg-muted rounded-lg">
          <p className="text-sm font-medium">
            {selectedAthleteIds.length} athlete{selectedAthleteIds.length === 1 ? '' : 's'} selected
          </p>
        </div>
      )}
    </div>
  );
}

interface StepMetricsProps {
  selectedMetrics: string[];
  onSelectionChange: (metrics: string[]) => void;
}

function StepMetrics({ selectedMetrics, onSelectionChange }: StepMetricsProps) {
  const { metrics: availableMetrics, isLoading } = useAvailableMetrics();

  const handleToggle = (metricCode: string) => {
    const newSelection = selectedMetrics.includes(metricCode)
      ? selectedMetrics.filter(m => m !== metricCode)
      : [...selectedMetrics, metricCode];
    onSelectionChange(newSelection);
  };

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Step 2: Select Metrics</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Choose one or more metrics to measure for each athlete
      </p>

      {isLoading ? (
        <div className="space-y-2">
          <div className="h-10 bg-muted rounded animate-pulse" />
          <div className="h-10 bg-muted rounded animate-pulse" />
          <div className="h-10 bg-muted rounded animate-pulse" />
        </div>
      ) : (
        <div className="space-y-3">
          {availableMetrics.map((metric) => (
            <div
              key={metric.code}
              className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <Checkbox
                id={`metric-${metric.code}`}
                checked={selectedMetrics.includes(metric.code)}
                onCheckedChange={() => handleToggle(metric.code)}
                data-testid="metric-checkbox"
              />
              <div className="flex-1">
                <Label
                  htmlFor={`metric-${metric.code}`}
                  className="font-medium cursor-pointer"
                >
                  {metric.label}
                </Label>
                {metric.description && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {metric.description}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Unit: {metric.unit}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedMetrics.length > 0 && (
        <div className="mt-4 p-3 bg-muted rounded-lg">
          <p className="text-sm font-medium">
            {selectedMetrics.length} metric{selectedMetrics.length === 1 ? '' : 's'} selected
          </p>
        </div>
      )}
    </div>
  );
}

interface StepConfigurationProps {
  date: string;
  measurementsPerAthlete: number;
  onDateChange: (date: string) => void;
  onMeasurementsChange: (count: number) => void;
}

function StepConfiguration({
  date,
  measurementsPerAthlete,
  onDateChange,
  onMeasurementsChange,
}: StepConfigurationProps) {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Step 3: Configuration</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Set the default date and number of measurements per athlete
      </p>

      <div className="space-y-6">
        {/* Default Date */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <Label htmlFor="wizard-date" className="text-base font-semibold">
                  Default Date
                </Label>
                <p className="text-sm text-muted-foreground mt-1 mb-3">
                  This date will be pre-filled for all measurements
                </p>
                <Input
                  id="wizard-date"
                  type="date"
                  value={date}
                  onChange={(e) => onDateChange(e.target.value)}
                  data-testid="wizard-date"
                  className="max-w-xs"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Measurements Per Athlete */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Hash className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <Label htmlFor="wizard-measurements-per-athlete" className="text-base font-semibold">
                  Measurements Per Athlete
                </Label>
                <p className="text-sm text-muted-foreground mt-1 mb-3">
                  How many times will each athlete be measured for each metric? (Max: 10)
                </p>
                <div className="flex items-center gap-2 max-w-xs">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    disabled={measurementsPerAthlete <= 1}
                    onClick={() => onMeasurementsChange(Math.max(1, measurementsPerAthlete - 1))}
                    aria-label="Decrease measurements"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    id="wizard-measurements-per-athlete"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min={1}
                    max={10}
                    value={measurementsPerAthlete}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val)) onMeasurementsChange(Math.min(10, Math.max(1, val)));
                    }}
                    data-testid="wizard-measurements-per-athlete"
                    className="text-center"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    disabled={measurementsPerAthlete >= 10}
                    onClick={() => onMeasurementsChange(Math.min(10, measurementsPerAthlete + 1))}
                    aria-label="Increase measurements"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Use this for multiple trials (e.g., 3 attempts at vertical jump, best of 3)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface StepReviewProps {
  athleteIds: string[];
  metrics: string[];
  date: string;
  measurementsPerAthlete: number;
}

function StepReview({ athleteIds, metrics, date, measurementsPerAthlete }: StepReviewProps) {
  const { metrics: availableMetrics } = useAvailableMetrics();
  const totalRows = athleteIds.length * metrics.length * measurementsPerAthlete;
  // MAX_ROWS is a UX limit for wizard-generated grid rows to prevent browser performance issues
  // This is separate from the backend API's 100 measurements per batch request limit
  const MAX_ROWS = 500;
  const exceedsLimit = totalRows > MAX_ROWS;

  // Get metric labels
  const selectedMetricLabels = metrics.map(code => {
    const metric = availableMetrics.find(m => m.code === code);
    return metric?.label || code;
  });

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Step 4: Review & Generate</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Review your configuration before generating the grid
      </p>

      {/* Warning for exceeding limit */}
      {exceedsLimit && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Too Many Rows</AlertTitle>
          <AlertDescription>
            Cannot generate {totalRows} rows (maximum: {MAX_ROWS}). Please go back and reduce your selection of athletes, metrics, or measurements per athlete.
          </AlertDescription>
        </Alert>
      )}

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="space-y-4" data-testid="wizard-summary">
            {/* Athletes */}
            <div className="flex items-start gap-4">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-sm">Athletes Selected</h4>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                  {athleteIds.length}
                </p>
              </div>
            </div>

            {/* Metrics */}
            <div className="flex items-start gap-4">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <Target className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-sm">Metrics Selected</h4>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                  {metrics.length}
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedMetricLabels.map((label, index) => (
                    <Badge key={index} variant="secondary">
                      {label}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Measurements Per Athlete */}
            <div className="flex items-start gap-4">
              <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <Hash className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-sm">Measurements Per Athlete</h4>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                  {measurementsPerAthlete}
                </p>
              </div>
            </div>

            {/* Date */}
            <div className="flex items-start gap-4">
              <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-lg">
                <Calendar className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-sm">Default Date</h4>
                <p className="text-lg font-semibold mt-1">
                  {new Date(date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calculation */}
      <Card className="bg-primary/5 border-primary">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-3">
            <CheckCircle className="h-5 w-5 text-primary" />
            <h4 className="font-semibold">Total Rows to Generate</h4>
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-bold">{athleteIds.length}</span>
            <span className="text-muted-foreground">athletes</span>
            <span className="text-xl">×</span>
            <span className="text-2xl font-bold">{metrics.length}</span>
            <span className="text-muted-foreground">metrics</span>
            <span className="text-xl">×</span>
            <span className="text-2xl font-bold">{measurementsPerAthlete}</span>
            <span className="text-muted-foreground">measurements</span>
            <span className="text-xl">=</span>
            <span className="text-4xl font-bold text-primary">{totalRows}</span>
            <span className="text-muted-foreground">rows</span>
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            Each row will be pre-populated with athlete, metric, and date. You'll just need to enter the values.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
