/**
 * WizardStepIndicator Component
 * Visual progress indicator showing current step in wizard
 */

import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WizardStepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  importType?: 'athletes' | 'measurements';
  stepLabels?: string[];
}

export function WizardStepIndicator({
  currentStep,
  totalSteps,
  importType,
  stepLabels,
}: WizardStepIndicatorProps) {
  const getStepLabel = (step: number): string => {
    if (stepLabels) {
      return stepLabels[step - 1] || '';
    }
    if (importType === 'athletes') {
      const labels = ['Select Type', 'Select Teams', 'Preview Template'];
      return labels[step - 1] || '';
    } else {
      const labels = ['Select Type', 'Select Teams', 'Select Metrics', 'Preview Template'];
      return labels[step - 1] || '';
    }
  };

  return (
    <div className="w-full">
      {/* Desktop view */}
      <div className="hidden md:block">
        <div className="flex items-center justify-between">
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step, index) => (
            <React.Fragment key={step}>
              {/* Step circle */}
              <div className="flex flex-col items-center flex-1">
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center font-medium transition-colors',
                    step < currentStep
                      ? 'bg-primary text-primary-foreground'
                      : step === currentStep
                      ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {step < currentStep ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <span>{step}</span>
                  )}
                </div>
                <span
                  className={cn(
                    'mt-2 text-xs font-medium text-center',
                    step === currentStep
                      ? 'text-primary'
                      : step < currentStep
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                  )}
                >
                  {getStepLabel(step)}
                </span>
              </div>

              {/* Connector line */}
              {index < totalSteps - 1 && (
                <div
                  className={cn(
                    'h-1 flex-1 mx-2 transition-colors',
                    step < currentStep ? 'bg-primary' : 'bg-muted'
                  )}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Mobile view - simple text indicator */}
      <div className="md:hidden flex items-center justify-center">
        <div className="text-sm font-medium text-muted-foreground">
          Step {currentStep} of {totalSteps}: {getStepLabel(currentStep)}
        </div>
      </div>
    </div>
  );
}
