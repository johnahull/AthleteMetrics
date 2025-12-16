import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCreateTierGroup } from "@/lib/benchmarks-api";
import { OrganizationTypeMultiSelect } from "@/components/organization-type-multi-select";
import { Trash2, Plus, ChevronLeft, ChevronRight, Layers } from "lucide-react";
import type { InsertTierGroup, TierDefinition } from "@shared/schema";
import type { OrganizationType } from "@shared/organization-type-types";

/**
 * Simplified metric type for dropdown selection
 * Matches the shape returned by /api/site-metrics endpoint
 */
interface SiteMetricOption {
  code: string;
  label: string;
  description?: string;
  unit?: string;
}

const TIER_COLORS = [
  { value: "gold", label: "Gold", className: "bg-amber-500" },
  { value: "emerald", label: "Emerald", className: "bg-emerald-500" },
  { value: "silver", label: "Silver", className: "bg-slate-400" },
  { value: "blue", label: "Blue", className: "bg-blue-500" },
  { value: "bronze", label: "Bronze", className: "bg-orange-600" },
  { value: "amber", label: "Amber", className: "bg-amber-600" },
  { value: "slate", label: "Slate", className: "bg-slate-500" },
];

interface TierGroupWizardProps {
  open: boolean;
  onClose: () => void;
}

export function TierGroupWizard({ open, onClose }: TierGroupWizardProps) {
  const { toast } = useToast();
  const createTierGroupMutation = useCreateTierGroup();

  // Wizard steps
  const [step, setStep] = useState(1);
  const totalSteps = 4;
  const progress = (step / totalSteps) * 100;

  // Step 1: Metric & Type
  const [metricCode, setMetricCode] = useState("");
  const [groupName, setGroupName] = useState("");
  const [description, setDescription] = useState("");
  const [comparisonOperator, setComparisonOperator] = useState<'lte' | 'gte' | 'eq' | 'range'>('range');

  // Step 2: Tiers
  const [tiers, setTiers] = useState<TierDefinition[]>([
    {
      tierName: "",
      tierOrder: 1,
      tierColor: "gold",
      minValue: undefined,
      maxValue: undefined,
      benchmarkValue: undefined,
    },
    {
      tierName: "",
      tierOrder: 2,
      tierColor: "silver",
      minValue: undefined,
      maxValue: undefined,
      benchmarkValue: undefined,
    },
  ]);

  // Step 3: Filters
  const [gender, setGender] = useState<'Male' | 'Female' | 'Not Specified' | undefined>(undefined);
  const [ageMin, setAgeMin] = useState<number | undefined>(undefined);
  const [ageMax, setAgeMax] = useState<number | undefined>(undefined);
  const [position, setPosition] = useState("");
  const [level, setLevel] = useState("");
  const [applicableOrgTypes, setApplicableOrgTypes] = useState<OrganizationType[] | undefined>(undefined);

  // Fetch available metrics (site admin context)
  const { data: metrics = [] } = useQuery({
    queryKey: ["/api/site-metrics"],
    queryFn: async () => {
      const response = await fetch("/api/site-metrics?includeInactive=false");
      if (!response.ok) throw new Error("Failed to fetch metrics");
      return response.json();
    },
    enabled: open,
  });

  const handleClose = () => {
    // Reset state
    setStep(1);
    setMetricCode("");
    setGroupName("");
    setDescription("");
    setComparisonOperator('range');
    setTiers([
      { tierName: "", tierOrder: 1, tierColor: "gold", minValue: undefined, maxValue: undefined, benchmarkValue: undefined },
      { tierName: "", tierOrder: 2, tierColor: "silver", minValue: undefined, maxValue: undefined, benchmarkValue: undefined },
    ]);
    setGender(undefined);
    setAgeMin(undefined);
    setAgeMax(undefined);
    setPosition("");
    setLevel("");
    setApplicableOrgTypes(undefined);
    onClose();
  };

  const canProceed = () => {
    if (step === 1) {
      return metricCode && groupName.trim();
    }
    if (step === 2) {
      // Check min 2 tiers, each with name and values
      if (tiers.length < 2) return false;
      return tiers.every(tier => {
        if (!tier.tierName.trim()) return false;
        if (comparisonOperator === 'range') {
          return tier.minValue !== undefined && tier.maxValue !== undefined;
        } else {
          return tier.benchmarkValue !== undefined;
        }
      });
    }
    return true;
  };

  const handleNext = () => {
    if (step < totalSteps && canProceed()) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleAddTier = () => {
    if (tiers.length >= 10) {
      toast({
        title: "Maximum Tiers Reached",
        description: "You can only have up to 10 tiers in a group.",
        variant: "destructive",
      });
      return;
    }

    setTiers([
      ...tiers,
      {
        tierName: "",
        tierOrder: tiers.length + 1,
        tierColor: "blue",
        minValue: undefined,
        maxValue: undefined,
        benchmarkValue: undefined,
      },
    ]);
  };

  const handleRemoveTier = (index: number) => {
    if (tiers.length <= 2) {
      toast({
        title: "Minimum Tiers Required",
        description: "You must have at least 2 tiers in a group.",
        variant: "destructive",
      });
      return;
    }

    const newTiers = tiers.filter((_, i) => i !== index);
    // Recalculate tier orders
    newTiers.forEach((tier, i) => {
      tier.tierOrder = i + 1;
    });
    setTiers(newTiers);
  };

  const updateTier = <K extends keyof TierDefinition>(index: number, field: K, value: TierDefinition[K]) => {
    const newTiers = [...tiers];
    newTiers[index] = { ...newTiers[index], [field]: value };
    setTiers(newTiers);
  };

  const handleCreate = async () => {
    if (!canProceed()) return;

    const payload: InsertTierGroup = {
      metricCode,
      name: groupName,
      description: description || undefined,
      comparisonOperator,
      tiers,
      gender,
      ageMin,
      ageMax,
      position: position || undefined,
      level: level || undefined,
      applicableOrgTypes,
    };

    try {
      const result = await createTierGroupMutation.mutateAsync(payload);
      toast({
        title: "Tier Group Created",
        description: `Created ${result.benchmarks.length} benchmarks in tier group.`,
      });
      handleClose();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create tier group.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Create Tier Group
          </DialogTitle>
          <DialogDescription>
            Batch create multiple benchmarks organized into performance tiers
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
            <StepMetricAndType
              metricCode={metricCode}
              groupName={groupName}
              description={description}
              comparisonOperator={comparisonOperator}
              metrics={metrics}
              onMetricCodeChange={setMetricCode}
              onGroupNameChange={setGroupName}
              onDescriptionChange={setDescription}
              onComparisonOperatorChange={setComparisonOperator}
            />
          )}
          {step === 2 && (
            <StepDefineTiers
              tiers={tiers}
              comparisonOperator={comparisonOperator}
              onUpdateTier={updateTier}
              onAddTier={handleAddTier}
              onRemoveTier={handleRemoveTier}
            />
          )}
          {step === 3 && (
            <StepFilters
              gender={gender}
              ageMin={ageMin}
              ageMax={ageMax}
              position={position}
              level={level}
              applicableOrgTypes={applicableOrgTypes}
              onGenderChange={setGender}
              onAgeMinChange={setAgeMin}
              onAgeMaxChange={setAgeMax}
              onPositionChange={setPosition}
              onLevelChange={setLevel}
              onApplicableOrgTypesChange={setApplicableOrgTypes}
            />
          )}
          {step === 4 && (
            <StepReview
              metricCode={metricCode}
              groupName={groupName}
              description={description}
              comparisonOperator={comparisonOperator}
              tiers={tiers}
              gender={gender}
              ageMin={ageMin}
              ageMax={ageMax}
              position={position}
              level={level}
              applicableOrgTypes={applicableOrgTypes}
              metrics={metrics}
            />
          )}
        </div>

        {/* Navigation */}
        <DialogFooter className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>

          <div className="flex gap-2">
            {step > 1 && (
              <Button variant="outline" onClick={handleBack}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}

            {step < totalSteps && (
              <Button onClick={handleNext} disabled={!canProceed()}>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}

            {step === totalSteps && (
              <Button
                onClick={handleCreate}
                disabled={!canProceed() || createTierGroupMutation.isPending}
              >
                {createTierGroupMutation.isPending ? "Creating..." : "Create Tier Group"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Step Components
// ============================================================================

interface StepMetricAndTypeProps {
  metricCode: string;
  groupName: string;
  description: string;
  comparisonOperator: 'lte' | 'gte' | 'eq' | 'range';
  metrics: SiteMetricOption[];
  onMetricCodeChange: (value: string) => void;
  onGroupNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onComparisonOperatorChange: (value: 'lte' | 'gte' | 'eq' | 'range') => void;
}

function StepMetricAndType({
  metricCode,
  groupName,
  description,
  comparisonOperator,
  metrics,
  onMetricCodeChange,
  onGroupNameChange,
  onDescriptionChange,
  onComparisonOperatorChange,
}: StepMetricAndTypeProps) {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Step 1: Metric & Type</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Select the metric and comparison type for your tier group
      </p>

      <div className="space-y-4">
        {/* Metric */}
        <div>
          <Label htmlFor="metric-select">Metric *</Label>
          <Select value={metricCode} onValueChange={onMetricCodeChange}>
            <SelectTrigger id="metric-select" className="mt-1">
              <SelectValue placeholder="Select a metric" />
            </SelectTrigger>
            <SelectContent>
              {metrics.map((metric) => (
                <SelectItem key={metric.code} value={metric.code}>
                  {metric.label} ({metric.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Group Name */}
        <div>
          <Label htmlFor="group-name">Group Name *</Label>
          <Input
            id="group-name"
            value={groupName}
            onChange={(e) => onGroupNameChange(e.target.value)}
            placeholder="e.g., 10-Yard Fly Performance Tiers"
            className="mt-1"
          />
          <p className="text-xs text-muted-foreground mt-1">
            This will be used as the base name for all benchmarks in this tier
          </p>
        </div>

        {/* Description */}
        <div>
          <Label htmlFor="description">Description (Optional)</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="Describe this tier group..."
            rows={3}
            className="mt-1"
          />
        </div>

        {/* Comparison Operator */}
        <div>
          <Label htmlFor="comparison-operator">Benchmark Type</Label>
          <Select
            value={comparisonOperator}
            onValueChange={(value) => onComparisonOperatorChange(value as 'lte' | 'gte' | 'eq' | 'range')}
          >
            <SelectTrigger id="comparison-operator" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="range">↔ Target Range (min-max) - Recommended</SelectItem>
              <SelectItem value="lte">≤ Lower is better (single value)</SelectItem>
              <SelectItem value="gte">≥ Higher is better (single value)</SelectItem>
              <SelectItem value="eq">= Exact match (single value)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            {comparisonOperator === 'range'
              ? "Each tier defines a min-max range (e.g., Elite: 0.95-1.05s)"
              : "Each tier has a single threshold value"}
          </p>
        </div>
      </div>
    </div>
  );
}

interface StepDefineTiersProps {
  tiers: TierDefinition[];
  comparisonOperator: 'lte' | 'gte' | 'eq' | 'range';
  onUpdateTier: <K extends keyof TierDefinition>(index: number, field: K, value: TierDefinition[K]) => void;
  onAddTier: () => void;
  onRemoveTier: (index: number) => void;
}

function StepDefineTiers({
  tiers,
  comparisonOperator,
  onUpdateTier,
  onAddTier,
  onRemoveTier,
}: StepDefineTiersProps) {
  // Validation helper for each tier
  const getTierValidation = (tier: TierDefinition) => {
    const errors: string[] = [];
    if (!tier.tierName.trim()) errors.push('name');
    if (comparisonOperator === 'range') {
      if (tier.minValue === undefined) errors.push('min');
      if (tier.maxValue === undefined) errors.push('max');
    } else {
      if (tier.benchmarkValue === undefined) errors.push('value');
    }
    return errors;
  };

  // Count total missing fields
  const totalMissing = tiers.reduce((count, tier) => count + getTierValidation(tier).length, 0);

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Step 2: Define Tiers</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Add 2-10 tiers with names, colors, and performance values
      </p>

      {/* Validation Summary */}
      {totalMissing > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
          <strong>Missing required fields:</strong> Fill in all tier names and values to proceed.
          {totalMissing === 1 ? ' (1 field remaining)' : ` (${totalMissing} fields remaining)`}
        </div>
      )}

      <div className="space-y-4">
        {tiers.map((tier, index) => {
          const errors = getTierValidation(tier);
          const hasErrors = errors.length > 0;

          return (
            <Card key={`tier-${tier.tierOrder}`} className={hasErrors ? 'border-amber-300' : 'border-green-300'}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="flex-1 space-y-4">
                    {/* Tier Name & Color */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor={`tier-name-${index}`} className={errors.includes('name') ? 'text-amber-600' : ''}>
                          Tier Name *
                        </Label>
                        <Input
                          id={`tier-name-${index}`}
                          value={tier.tierName}
                          onChange={(e) => onUpdateTier(index, 'tierName', e.target.value)}
                          placeholder="e.g., Elite, Good, Average"
                          className={`mt-1 ${errors.includes('name') ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-500' : ''}`}
                        />
                        {errors.includes('name') && (
                          <p className="text-xs text-amber-600 mt-1">Required</p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor={`tier-color-${index}`}>Color</Label>
                        <Select
                          value={tier.tierColor}
                          onValueChange={(value) => onUpdateTier(index, 'tierColor', value)}
                        >
                          <SelectTrigger id={`tier-color-${index}`} className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TIER_COLORS.map((color) => (
                              <SelectItem key={color.value} value={color.value}>
                                <div className="flex items-center gap-2">
                                  <div className={`w-4 h-4 rounded ${color.className}`} />
                                  {color.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Tier Order (auto-calculated) */}
                    <div>
                      <Label>Tier Rank</Label>
                      <div className="mt-1 px-3 py-2 bg-muted rounded-md text-sm">
                        Rank {tier.tierOrder} (1 = best tier)
                      </div>
                    </div>

                    {/* Values (Range or Single) */}
                    {comparisonOperator === 'range' ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor={`tier-min-${index}`} className={errors.includes('min') ? 'text-amber-600' : ''}>
                            Minimum Value *
                          </Label>
                          <Input
                            id={`tier-min-${index}`}
                            type="number"
                            step="0.01"
                            value={tier.minValue ?? ''}
                            onChange={(e) => onUpdateTier(index, 'minValue', e.target.value ? parseFloat(e.target.value) : undefined)}
                            placeholder="0.95"
                            className={`mt-1 ${errors.includes('min') ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-500' : ''}`}
                          />
                          {errors.includes('min') && (
                            <p className="text-xs text-amber-600 mt-1">Required</p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor={`tier-max-${index}`} className={errors.includes('max') ? 'text-amber-600' : ''}>
                            Maximum Value *
                          </Label>
                          <Input
                            id={`tier-max-${index}`}
                            type="number"
                            step="0.01"
                            value={tier.maxValue ?? ''}
                            onChange={(e) => onUpdateTier(index, 'maxValue', e.target.value ? parseFloat(e.target.value) : undefined)}
                            placeholder="1.05"
                            className={`mt-1 ${errors.includes('max') ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-500' : ''}`}
                          />
                          {errors.includes('max') && (
                            <p className="text-xs text-amber-600 mt-1">Required</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <Label htmlFor={`tier-value-${index}`} className={errors.includes('value') ? 'text-amber-600' : ''}>
                          Threshold Value *
                        </Label>
                        <Input
                          id={`tier-value-${index}`}
                          type="number"
                          step="0.01"
                          value={tier.benchmarkValue ?? ''}
                          onChange={(e) => onUpdateTier(index, 'benchmarkValue', e.target.value ? parseFloat(e.target.value) : undefined)}
                          placeholder="1.00"
                          className={`mt-1 ${errors.includes('value') ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-500' : ''}`}
                        />
                        {errors.includes('value') && (
                          <p className="text-xs text-amber-600 mt-1">Required</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Remove Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemoveTier(index)}
                    disabled={tiers.length <= 2}
                    className="mt-6"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Add Tier Button */}
        <Button
          variant="outline"
          onClick={onAddTier}
          disabled={tiers.length >= 10}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Tier
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          {tiers.length} / 10 tiers
        </p>
      </div>
    </div>
  );
}

interface StepFiltersProps {
  gender: 'Male' | 'Female' | 'Not Specified' | undefined;
  ageMin: number | undefined;
  ageMax: number | undefined;
  position: string;
  level: string;
  applicableOrgTypes: OrganizationType[] | undefined;
  onGenderChange: (value: 'Male' | 'Female' | 'Not Specified' | undefined) => void;
  onAgeMinChange: (value: number | undefined) => void;
  onAgeMaxChange: (value: number | undefined) => void;
  onPositionChange: (value: string) => void;
  onLevelChange: (value: string) => void;
  onApplicableOrgTypesChange: (value: OrganizationType[] | undefined) => void;
}

function StepFilters({
  gender,
  ageMin,
  ageMax,
  position,
  level,
  applicableOrgTypes,
  onGenderChange,
  onAgeMinChange,
  onAgeMaxChange,
  onPositionChange,
  onLevelChange,
  onApplicableOrgTypesChange,
}: StepFiltersProps) {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Step 3: Filters (Optional)</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Apply these filters to all tiers in the group. Leave blank to apply to all athletes.
      </p>

      <div className="space-y-4">
        {/* Gender */}
        <div>
          <Label htmlFor="gender-select">Gender</Label>
          <Select
            value={gender || "all"}
            onValueChange={(value) => onGenderChange(value === "all" ? undefined : value as 'Male' | 'Female' | 'Not Specified')}
          >
            <SelectTrigger id="gender-select" className="mt-1">
              <SelectValue placeholder="All genders" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Genders</SelectItem>
              <SelectItem value="Male">Male</SelectItem>
              <SelectItem value="Female">Female</SelectItem>
              <SelectItem value="Not Specified">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Age Range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="age-min">Minimum Age</Label>
            <Input
              id="age-min"
              type="number"
              value={ageMin ?? ''}
              onChange={(e) => onAgeMinChange(e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="e.g., 18"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="age-max">Maximum Age</Label>
            <Input
              id="age-max"
              type="number"
              value={ageMax ?? ''}
              onChange={(e) => onAgeMaxChange(e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="e.g., 22"
              className="mt-1"
            />
          </div>
        </div>

        {/* Position */}
        <div>
          <Label htmlFor="position">Position</Label>
          <Input
            id="position"
            value={position}
            onChange={(e) => onPositionChange(e.target.value)}
            placeholder="e.g., Forward, Defense"
            className="mt-1"
          />
        </div>

        {/* Level */}
        <div>
          <Label htmlFor="level">Level</Label>
          <Input
            id="level"
            value={level}
            onChange={(e) => onLevelChange(e.target.value)}
            placeholder="e.g., College, High School, Club"
            className="mt-1"
          />
        </div>

        {/* Organization Types */}
        <div>
          <Label>Applicable to Organization Types</Label>
          <OrganizationTypeMultiSelect
            value={applicableOrgTypes}
            onChange={onApplicableOrgTypesChange}
            placeholder="All organizations (default)"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Leave empty to apply these benchmarks to all organization types
          </p>
        </div>
      </div>
    </div>
  );
}

interface StepReviewProps {
  metricCode: string;
  groupName: string;
  description: string;
  comparisonOperator: 'lte' | 'gte' | 'eq' | 'range';
  tiers: TierDefinition[];
  gender: 'Male' | 'Female' | 'Not Specified' | undefined;
  ageMin: number | undefined;
  ageMax: number | undefined;
  position: string;
  level: string;
  applicableOrgTypes: OrganizationType[] | undefined;
  metrics: SiteMetricOption[];
}

function StepReview({
  metricCode,
  groupName,
  description,
  comparisonOperator,
  tiers,
  gender,
  ageMin,
  ageMax,
  position,
  level,
  applicableOrgTypes,
  metrics,
}: StepReviewProps) {
  const selectedMetric = metrics.find((m) => m.code === metricCode);
  const getComparisonOperatorLabel = () => {
    switch (comparisonOperator) {
      case 'range': return 'Target Range (min-max)';
      case 'lte': return '≤ Lower is better';
      case 'gte': return '≥ Higher is better';
      case 'eq': return '= Exact match';
    }
  };

  const getTierColorClass = (colorValue: string | undefined) => {
    const color = TIER_COLORS.find(c => c.value === colorValue);
    return color?.className || "bg-gray-500";
  };

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Step 4: Review & Confirm</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Review your tier group configuration before creating {tiers.length} benchmarks
      </p>

      <div className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardContent className="pt-6">
            <h4 className="font-semibold mb-3">Basic Information</h4>
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Metric:</span>
                <span className="font-medium">{selectedMetric?.label || metricCode}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Group Name:</span>
                <span className="font-medium">{groupName}</span>
              </div>
              {description && (
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-muted-foreground">Description:</span>
                  <span className="font-medium">{description}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Type:</span>
                <span className="font-medium">{getComparisonOperatorLabel()}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tiers Summary */}
        <Card>
          <CardContent className="pt-6">
            <h4 className="font-semibold mb-3">Tiers ({tiers.length})</h4>
            <div className="space-y-3">
              {tiers.map((tier) => (
                <div key={`review-tier-${tier.tierOrder}`} className="flex items-center gap-3 p-3 border rounded-lg">
                  <div className={`w-8 h-8 rounded ${getTierColorClass(tier.tierColor)} flex items-center justify-center text-white font-bold text-sm`}>
                    {tier.tierOrder}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{tier.tierName}</div>
                    <div className="text-sm text-muted-foreground">
                      {comparisonOperator === 'range'
                        ? `${tier.minValue} - ${tier.maxValue}`
                        : `${comparisonOperator === 'lte' ? '≤' : comparisonOperator === 'gte' ? '≥' : '='} ${tier.benchmarkValue}`}
                    </div>
                  </div>
                  <Badge variant="secondary">{tier.tierColor}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        {(gender || ageMin || ageMax || position || level || applicableOrgTypes?.length) && (
          <Card>
            <CardContent className="pt-6">
              <h4 className="font-semibold mb-3">Filters Applied</h4>
              <div className="space-y-2 text-sm">
                {gender && (
                  <div className="grid grid-cols-2 gap-2">
                    <span className="text-muted-foreground">Gender:</span>
                    <span className="font-medium">{gender}</span>
                  </div>
                )}
                {(ageMin || ageMax) && (
                  <div className="grid grid-cols-2 gap-2">
                    <span className="text-muted-foreground">Age Range:</span>
                    <span className="font-medium">
                      {ageMin ? `${ageMin}+` : ''}
                      {ageMin && ageMax ? ' - ' : ''}
                      {ageMax ? `${ageMax}` : ''}
                    </span>
                  </div>
                )}
                {position && (
                  <div className="grid grid-cols-2 gap-2">
                    <span className="text-muted-foreground">Position:</span>
                    <span className="font-medium">{position}</span>
                  </div>
                )}
                {level && (
                  <div className="grid grid-cols-2 gap-2">
                    <span className="text-muted-foreground">Level:</span>
                    <span className="font-medium">{level}</span>
                  </div>
                )}
                {applicableOrgTypes && applicableOrgTypes.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    <span className="text-muted-foreground">Org Types:</span>
                    <div className="flex flex-wrap gap-1">
                      {applicableOrgTypes.map(type => (
                        <Badge key={type} variant="secondary">{type}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary */}
        <Card className="bg-primary/5 border-primary">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold">Ready to Create</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  This will create {tiers.length} benchmarks with shared filters
                </p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-primary">{tiers.length}</div>
                <div className="text-xs text-muted-foreground">benchmarks</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
