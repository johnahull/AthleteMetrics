/**
 * Profile Merge Wizard
 *
 * A 3-step wizard for org admins to merge duplicate athlete profiles.
 * Step 1: Select source (to be deleted) and target (to keep) profiles
 * Step 2: Preview the merge - side-by-side comparison of data
 * Step 3: Confirm with type-to-confirm safety mechanism
 */

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ProfileMergeSelect } from "./ProfileMergeSelect";
import { ProfileMergePreview } from "./ProfileMergePreview";
import { ProfileMergeConfirm } from "./ProfileMergeConfirm";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";

interface Athlete {
  id: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  emails?: string[];
  teams?: { id: string; name: string }[];
  birthYear?: number;
}

interface MergePreview {
  source: {
    id: string;
    fullName: string;
    emails: string[];
    measurementCount: number;
    teamMembershipCount: number;
    goalCount: number;
    achievementCount: number;
    wellnessResponseCount: number;
    eventRegistrationCount: number;
    hasGlobalAthleteLink: boolean;
    globalAthleteId?: string;
    oauthProviders: string[];
  };
  target: {
    id: string;
    fullName: string;
    emails: string[];
    measurementCount: number;
    teamMembershipCount: number;
    goalCount: number;
    achievementCount: number;
    wellnessResponseCount: number;
    eventRegistrationCount: number;
    hasGlobalAthleteLink: boolean;
    globalAthleteId?: string;
    oauthProviders: string[];
  };
  conflicts: Array<{
    type: string;
    description: string;
    resolution?: string;
  }>;
  warnings: string[];
  canMerge: boolean;
  blockingReason?: string;
}

interface MergeResult {
  success: boolean;
  mergeId: string;
  summary: {
    measurementsTransferred: number;
    teamMembershipsTransferred: number;
    goalsTransferred: number;
    achievementsTransferred: number;
    wellnessResponsesTransferred: number;
    eventRegistrationsTransferred: number;
    emailsMerged: number;
    sessionsInvalidated: number;
  };
  auditLogId: string;
  targetUserId: string;
  sourceUserSoftDeleted: boolean;
}

interface ProfileMergeWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  athletes: Athlete[];
  preselectedAthletes?: [Athlete, Athlete] | null;
}

export function ProfileMergeWizard({
  open,
  onOpenChange,
  organizationId,
  athletes,
  preselectedAthletes,
}: ProfileMergeWizardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Wizard state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sourceAthlete, setSourceAthlete] = useState<Athlete | null>(
    preselectedAthletes?.[0] ?? null
  );
  const [targetAthlete, setTargetAthlete] = useState<Athlete | null>(
    preselectedAthletes?.[1] ?? null
  );
  const [mergePreview, setMergePreview] = useState<MergePreview | null>(null);

  // Sync state when preselectedAthletes changes and wizard opens
  useEffect(() => {
    if (open && preselectedAthletes) {
      setSourceAthlete(preselectedAthletes[0]);
      setTargetAthlete(preselectedAthletes[1]);
      setStep(1);
      setMergePreview(null);
    }
  }, [open, preselectedAthletes]);

  // Reset wizard when opened/closed
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset state when closing
      setStep(1);
      setSourceAthlete(preselectedAthletes?.[0] ?? null);
      setTargetAthlete(preselectedAthletes?.[1] ?? null);
      setMergePreview(null);
    }
    onOpenChange(newOpen);
  };

  // Preview mutation
  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!sourceAthlete || !targetAthlete) {
        throw new Error("Both source and target athletes must be selected");
      }
      const response = await apiRequest(
        "POST",
        `/api/organizations/${organizationId}/merge-profiles/preview`,
        {
          sourceUserId: sourceAthlete.id,
          targetUserId: targetAthlete.id,
        }
      );
      return response.json();
    },
    onSuccess: (data: MergePreview) => {
      setMergePreview(data);
      setStep(2);
    },
    onError: (error: Error) => {
      toast({
        title: "Preview Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Merge mutation
  const mergeMutation = useMutation({
    mutationFn: async () => {
      if (!sourceAthlete || !targetAthlete) {
        throw new Error("Both source and target athletes must be selected");
      }
      const response = await apiRequest(
        "POST",
        `/api/organizations/${organizationId}/merge-profiles`,
        {
          sourceUserId: sourceAthlete.id,
          targetUserId: targetAthlete.id,
        }
      );
      return response.json();
    },
    onSuccess: (data: MergeResult) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/athletes"] });
      queryClient.invalidateQueries({
        queryKey: [`/api/organizations/${organizationId}/profile`],
      });

      toast({
        title: "Profiles Merged Successfully",
        description: `${sourceAthlete?.fullName} has been merged into ${targetAthlete?.fullName}. ${data.summary.measurementsTransferred} measurements transferred.`,
      });

      handleOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Merge Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Swap source and target
  const handleSwap = () => {
    const temp = sourceAthlete;
    setSourceAthlete(targetAthlete);
    setTargetAthlete(temp);
  };

  // Step navigation
  const handleNext = () => {
    if (step === 1) {
      previewMutation.mutate();
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
    } else if (step === 3) {
      setStep(2);
    }
  };

  const handleConfirm = () => {
    mergeMutation.mutate();
  };

  // Check if can proceed
  const canProceed = step === 1
    ? sourceAthlete && targetAthlete && sourceAthlete.id !== targetAthlete.id
    : step === 2
    ? mergePreview?.canMerge
    : true;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 1 && "Merge Profiles - Select Athletes"}
            {step === 2 && "Merge Profiles - Preview Changes"}
            {step === 3 && "Merge Profiles - Confirm"}
          </DialogTitle>
          <DialogDescription>
            {step === 1 && "Select which profile to delete (source) and which to keep (target)."}
            {step === 2 && "Review what data will be transferred before confirming."}
            {step === 3 && "Type MERGE to confirm this irreversible action."}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 py-4" role="navigation" aria-label="Merge wizard steps">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                s === step
                  ? "bg-primary text-primary-foreground"
                  : s < step
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
              aria-label={`Step ${s}${s === step ? ' (current)' : s < step ? ' (completed)' : ' (upcoming)'}`}
              aria-current={s === step ? 'step' : undefined}
            >
              {s}
            </div>
          ))}
          <span className="ml-2 text-sm text-muted-foreground" data-testid="wizard-step-indicator" aria-live="polite">
            Step {step} of 3
          </span>
        </div>

        {/* Source profile name indicator for E2E tests */}
        {sourceAthlete && (
          <span className="sr-only" data-testid="source-profile-name">
            {sourceAthlete.fullName}
          </span>
        )}

        {/* Step content */}
        <div className="py-4">
          {step === 1 && (
            <ProfileMergeSelect
              athletes={athletes}
              sourceAthlete={sourceAthlete}
              targetAthlete={targetAthlete}
              onSourceChange={setSourceAthlete}
              onTargetChange={setTargetAthlete}
              onSwap={handleSwap}
            />
          )}

          {step === 2 && mergePreview && (
            <ProfileMergePreview
              preview={mergePreview}
              sourceAthlete={sourceAthlete!}
              targetAthlete={targetAthlete!}
            />
          )}

          {step === 3 && mergePreview && (
            <ProfileMergeConfirm
              preview={mergePreview}
              sourceAthlete={sourceAthlete!}
              targetAthlete={targetAthlete!}
              onConfirm={handleConfirm}
              isLoading={mergeMutation.isPending}
            />
          )}
        </div>

        {/* Navigation buttons */}
        <div className="flex justify-between pt-4 border-t">
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={previewMutation.isPending || mergeMutation.isPending}
              data-testid="wizard-cancel-button"
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={step === 1 || previewMutation.isPending || mergeMutation.isPending}
              data-testid="wizard-back-button"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </div>

          {step < 3 ? (
            <Button
              onClick={handleNext}
              disabled={!canProceed || previewMutation.isPending}
              data-testid="wizard-next-button"
            >
              {previewMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading Preview...
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ProfileMergeWizard;
