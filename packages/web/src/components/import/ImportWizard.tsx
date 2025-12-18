/**
 * ImportWizard Component
 * Multi-step wizard for CSV import template generation
 *
 * Guides coaches through:
 * 1. Select import type (athletes/measurements)
 * 2. Select team(s) for context
 * 3. Select metrics (measurements only)
 * 4. Preview and download template
 */

import React, { useReducer, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { WizardStepIndicator } from './WizardStepIndicator';
import { SelectTypeStep } from './SelectTypeStep';
import { SelectTeamStep } from './SelectTeamStep';
import { SelectMetricsStep } from './SelectMetricsStep';
import { PreviewTemplateStep } from './PreviewTemplateStep';
import type { ImportWizardStep, ImportWizardState, TemplateWizardResponse } from '@shared/import-types';

interface ImportWizardProps {
  open: boolean;
  initialType?: 'athletes' | 'measurements';
  onComplete: () => void;
  onCancel: () => void;
}

type WizardAction =
  | { type: 'SET_IMPORT_TYPE'; payload: 'athletes' | 'measurements' }
  | { type: 'SET_STEP'; payload: ImportWizardStep }
  | { type: 'SET_TEAMS'; payload: string[] }
  | { type: 'SET_METRICS'; payload: string[] }
  | { type: 'TOGGLE_EXAMPLES'; payload: boolean }
  | { type: 'SET_TEMPLATE'; payload: TemplateWizardResponse | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'GO_BACK' }
  | { type: 'RESET' };

const initialState: ImportWizardState & { isLoading: boolean } = {
  currentStep: 'select-type',
  importType: 'athletes',
  selectedTeamIds: [],
  selectedMetricCodes: [],
  includeExamples: true,
  generatedTemplate: null,
  isLoading: false,
};

function wizardReducer(
  state: ImportWizardState & { isLoading: boolean },
  action: WizardAction
): ImportWizardState & { isLoading: boolean } {
  switch (action.type) {
    case 'SET_IMPORT_TYPE':
      return {
        ...state,
        importType: action.payload,
        currentStep: 'select-team',
      };

    case 'SET_STEP':
      return { ...state, currentStep: action.payload };

    case 'SET_TEAMS':
      return {
        ...state,
        selectedTeamIds: action.payload,
        currentStep: state.importType === 'measurements' ? 'select-metrics' : 'preview-template',
      };

    case 'SET_METRICS':
      return {
        ...state,
        selectedMetricCodes: action.payload,
        currentStep: 'preview-template',
      };

    case 'TOGGLE_EXAMPLES':
      return { ...state, includeExamples: action.payload };

    case 'SET_TEMPLATE':
      return {
        ...state,
        generatedTemplate: action.payload ? action.payload.csvContent : null
      };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'GO_BACK':
      // Determine previous step
      let prevStep: ImportWizardStep = 'select-type';
      if (state.currentStep === 'select-team') {
        prevStep = 'select-type';
      } else if (state.currentStep === 'select-metrics') {
        prevStep = 'select-team';
      } else if (state.currentStep === 'preview-template') {
        prevStep = state.importType === 'measurements' ? 'select-metrics' : 'select-team';
      }
      return { ...state, currentStep: prevStep };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

export function ImportWizard({
  open,
  initialType,
  onComplete,
  onCancel
}: ImportWizardProps) {
  const [state, dispatch] = useReducer(wizardReducer, {
    ...initialState,
    importType: initialType || 'athletes',
  });
  const { toast } = useToast();

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      dispatch({ type: 'RESET' });
    }
  }, [open]);

  const handleTypeSelect = (type: 'athletes' | 'measurements') => {
    dispatch({ type: 'SET_IMPORT_TYPE', payload: type });
  };

  const handleTeamSelect = (teamIds: string[]) => {
    if (teamIds.length === 0) {
      toast({
        title: 'No teams selected',
        description: 'Please select at least one team.',
        variant: 'destructive',
      });
      return;
    }
    dispatch({ type: 'SET_TEAMS', payload: teamIds });
  };

  const handleMetricSelect = (metricCodes: string[]) => {
    if (metricCodes.length === 0) {
      toast({
        title: 'No metrics selected',
        description: 'Please select at least one metric.',
        variant: 'destructive',
      });
      return;
    }
    dispatch({ type: 'SET_METRICS', payload: metricCodes });
  };

  const handleBack = () => {
    dispatch({ type: 'GO_BACK' });
  };

  const handleCancel = () => {
    dispatch({ type: 'RESET' });
    onCancel();
  };

  const handleComplete = () => {
    dispatch({ type: 'RESET' });
    onComplete();
  };

  // Calculate step number for progress indicator
  const getStepNumber = (): number => {
    const stepMap: Record<ImportWizardStep, number> = {
      'select-type': 1,
      'select-team': 2,
      'select-metrics': 3,
      'preview-template': state.importType === 'measurements' ? 4 : 3,
      'upload': state.importType === 'measurements' ? 5 : 4,
    };
    return stepMap[state.currentStep];
  };

  const getTotalSteps = (): number => {
    return state.importType === 'measurements' ? 4 : 3;
  };

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Wizard</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Step indicator */}
          <WizardStepIndicator
            currentStep={getStepNumber()}
            totalSteps={getTotalSteps()}
            importType={state.importType}
          />

          {/* Step content */}
          <div className="min-h-[400px]">
            {state.currentStep === 'select-type' && (
              <SelectTypeStep onSelect={handleTypeSelect} />
            )}

            {state.currentStep === 'select-team' && (
              <SelectTeamStep
                selectedTeamIds={state.selectedTeamIds}
                onNext={handleTeamSelect}
                onBack={handleBack}
                onCancel={handleCancel}
              />
            )}

            {state.currentStep === 'select-metrics' && (
              <SelectMetricsStep
                selectedMetricCodes={state.selectedMetricCodes}
                onNext={handleMetricSelect}
                onBack={handleBack}
                onCancel={handleCancel}
              />
            )}

            {state.currentStep === 'preview-template' && (
              <PreviewTemplateStep
                importType={state.importType}
                teamIds={state.selectedTeamIds}
                metricCodes={state.selectedMetricCodes}
                includeExamples={state.includeExamples}
                onToggleExamples={(include) => dispatch({ type: 'TOGGLE_EXAMPLES', payload: include })}
                onBack={handleBack}
                onComplete={handleComplete}
                onCancel={handleCancel}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
