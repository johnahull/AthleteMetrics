/**
 * Custom Onboarding Tooltip
 *
 * Styled tooltip component for react-joyride following AthleteMetrics design system
 */

import React from 'react';
import type { TooltipRenderProps } from 'react-joyride';
import { Button } from '@/components/ui/button';

export function OnboardingTooltip({
  continuous,
  index,
  step,
  backProps,
  closeProps,
  primaryProps,
  skipProps,
  tooltipProps,
  isLastStep,
  size,
}: TooltipRenderProps) {
  return (
    <div
      {...tooltipProps}
      className="bg-white rounded-lg shadow-xl border border-gray-200 p-6 max-w-md"
    >
      {/* Content */}
      <div className="mb-4">
        {step.title && (
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {step.title}
          </h3>
        )}
        <div className="text-sm text-gray-700">
          {step.content}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        {/* Progress indicator */}
        <div className="text-xs text-gray-500">
          {index + 1} of {size}
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          {/* Skip button */}
          {!isLastStep && (
            <Button
              {...skipProps}
              variant="ghost"
              size="sm"
              className="text-gray-600 hover:text-gray-900"
            >
              Skip Tour
            </Button>
          )}

          {/* Back button */}
          {index > 0 && (
            <Button
              {...backProps}
              variant="outline"
              size="sm"
            >
              Back
            </Button>
          )}

          {/* Next/Finish button */}
          {continuous && (
            <Button
              {...primaryProps}
              size="sm"
            >
              {isLastStep ? 'Finish' : 'Next'}
            </Button>
          )}

          {/* Close button for non-continuous tours */}
          {!continuous && (
            <Button
              {...closeProps}
              size="sm"
            >
              Close
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
