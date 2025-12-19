/**
 * Tests for ImportWizard component
 *
 * This component orchestrates the multi-step wizard:
 * - Dialog open/close behavior
 * - State management via reducer
 * - Step navigation
 * - Reset on close
 */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';
import { ImportWizard } from '../ImportWizard';

// Mock child components to isolate ImportWizard tests
vi.mock('../WizardStepIndicator', () => ({
  WizardStepIndicator: ({ currentStep, totalSteps, importType }: any) => (
    <div data-testid="wizard-step-indicator">
      Step {currentStep} of {totalSteps} ({importType})
    </div>
  ),
}));

vi.mock('../SelectTypeStep', () => ({
  SelectTypeStep: ({ onSelect }: any) => (
    <div data-testid="select-type-step">
      <button onClick={() => onSelect('athletes')}>Select Athletes</button>
      <button onClick={() => onSelect('measurements')}>Select Measurements</button>
    </div>
  ),
}));

vi.mock('../SelectTeamStep', () => ({
  SelectTeamStep: ({ onNext, onBack, onCancel }: any) => (
    <div data-testid="select-team-step">
      <button onClick={() => onNext(['team-1'])}>Next Team</button>
      <button onClick={onBack}>Back Team</button>
      <button onClick={onCancel}>Cancel Team</button>
    </div>
  ),
}));

vi.mock('../SelectMetricsStep', () => ({
  SelectMetricsStep: ({ onNext, onBack, onCancel }: any) => (
    <div data-testid="select-metrics-step">
      <button onClick={() => onNext(['FLY10_TIME'])}>Next Metrics</button>
      <button onClick={onBack}>Back Metrics</button>
      <button onClick={onCancel}>Cancel Metrics</button>
    </div>
  ),
}));

vi.mock('../PreviewTemplateStep', () => ({
  PreviewTemplateStep: ({ onBack, onComplete, onCancel }: any) => (
    <div data-testid="preview-template-step">
      <button onClick={onComplete}>Complete Preview</button>
      <button onClick={onBack}>Back Preview</button>
      <button onClick={onCancel}>Cancel Preview</button>
    </div>
  ),
}));

// Mock useToast
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe('ImportWizard', () => {
  let queryClient: QueryClient;

  const defaultProps = {
    open: true,
    onComplete: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  const renderWithProviders = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ImportWizard {...defaultProps} {...props} />
      </QueryClientProvider>
    );
  };

  describe('Dialog Behavior', () => {
    it('should render dialog when open is true', () => {
      renderWithProviders();

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Import Wizard')).toBeInTheDocument();
    });

    it('should not render content when open is false', () => {
      renderWithProviders({ open: false });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should call onCancel when dialog is closed', () => {
      const onCancel = vi.fn();
      renderWithProviders({ onCancel });

      // Close button in dialog
      const closeButton = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeButton);

      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe('Initial State', () => {
    it('should start on select-type step', () => {
      renderWithProviders();

      expect(screen.getByTestId('select-type-step')).toBeInTheDocument();
    });

    it('should use initialType if provided', () => {
      renderWithProviders({ initialType: 'measurements' });

      // Check step indicator shows measurements
      expect(screen.getByTestId('wizard-step-indicator')).toHaveTextContent('measurements');
    });

    it('should show step indicator', () => {
      renderWithProviders();

      expect(screen.getByTestId('wizard-step-indicator')).toBeInTheDocument();
    });
  });

  describe('Athletes Flow Navigation', () => {
    it('should navigate from type to team selection', () => {
      renderWithProviders();

      fireEvent.click(screen.getByText('Select Athletes'));

      expect(screen.getByTestId('select-team-step')).toBeInTheDocument();
    });

    it('should navigate from team selection to preview (skipping metrics)', () => {
      renderWithProviders();

      // Type → Team
      fireEvent.click(screen.getByText('Select Athletes'));

      // Team → Preview (should skip metrics for athletes)
      fireEvent.click(screen.getByText('Next Team'));

      expect(screen.getByTestId('preview-template-step')).toBeInTheDocument();
    });

    it('should navigate back from team selection to type', () => {
      renderWithProviders();

      // Go to team selection
      fireEvent.click(screen.getByText('Select Athletes'));
      expect(screen.getByTestId('select-team-step')).toBeInTheDocument();

      // Go back to type
      fireEvent.click(screen.getByText('Back Team'));
      expect(screen.getByTestId('select-type-step')).toBeInTheDocument();
    });

    it('should navigate back from preview to team selection', () => {
      renderWithProviders();

      // Navigate to preview
      fireEvent.click(screen.getByText('Select Athletes'));
      fireEvent.click(screen.getByText('Next Team'));
      expect(screen.getByTestId('preview-template-step')).toBeInTheDocument();

      // Go back to team selection
      fireEvent.click(screen.getByText('Back Preview'));
      expect(screen.getByTestId('select-team-step')).toBeInTheDocument();
    });
  });

  describe('Measurements Flow Navigation', () => {
    it('should navigate from type to team to metrics selection', () => {
      renderWithProviders();

      // Type → Team
      fireEvent.click(screen.getByText('Select Measurements'));
      expect(screen.getByTestId('select-team-step')).toBeInTheDocument();

      // Team → Metrics
      fireEvent.click(screen.getByText('Next Team'));
      expect(screen.getByTestId('select-metrics-step')).toBeInTheDocument();
    });

    it('should navigate from metrics to preview', () => {
      renderWithProviders();

      fireEvent.click(screen.getByText('Select Measurements'));
      fireEvent.click(screen.getByText('Next Team'));
      fireEvent.click(screen.getByText('Next Metrics'));

      expect(screen.getByTestId('preview-template-step')).toBeInTheDocument();
    });

    it('should navigate back from metrics to team selection', () => {
      renderWithProviders();

      fireEvent.click(screen.getByText('Select Measurements'));
      fireEvent.click(screen.getByText('Next Team'));
      expect(screen.getByTestId('select-metrics-step')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Back Metrics'));
      expect(screen.getByTestId('select-team-step')).toBeInTheDocument();
    });

    it('should navigate back from preview to metrics for measurements', () => {
      renderWithProviders();

      fireEvent.click(screen.getByText('Select Measurements'));
      fireEvent.click(screen.getByText('Next Team'));
      fireEvent.click(screen.getByText('Next Metrics'));
      expect(screen.getByTestId('preview-template-step')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Back Preview'));
      expect(screen.getByTestId('select-metrics-step')).toBeInTheDocument();
    });
  });

  describe('Cancel Behavior', () => {
    it('should reset and call onCancel from any step', () => {
      const onCancel = vi.fn();
      renderWithProviders({ onCancel });

      // Navigate to team selection
      fireEvent.click(screen.getByText('Select Athletes'));
      expect(screen.getByTestId('select-team-step')).toBeInTheDocument();

      // Cancel from team selection
      fireEvent.click(screen.getByText('Cancel Team'));

      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe('Complete Behavior', () => {
    it('should reset and call onComplete when done', () => {
      const onComplete = vi.fn();
      renderWithProviders({ onComplete });

      // Navigate through wizard
      fireEvent.click(screen.getByText('Select Athletes'));
      fireEvent.click(screen.getByText('Next Team'));

      // Complete from preview
      fireEvent.click(screen.getByText('Complete Preview'));

      expect(onComplete).toHaveBeenCalled();
    });
  });

  describe('Reset on Close', () => {
    it('should reset state when dialog closes', () => {
      const { rerender } = renderWithProviders();

      // Navigate to team selection
      fireEvent.click(screen.getByText('Select Athletes'));
      expect(screen.getByTestId('select-team-step')).toBeInTheDocument();

      // Close dialog
      rerender(
        <QueryClientProvider client={queryClient}>
          <ImportWizard {...defaultProps} open={false} />
        </QueryClientProvider>
      );

      // Reopen dialog
      rerender(
        <QueryClientProvider client={queryClient}>
          <ImportWizard {...defaultProps} open={true} />
        </QueryClientProvider>
      );

      // Should be back at type selection
      expect(screen.getByTestId('select-type-step')).toBeInTheDocument();
    });
  });

  describe('Step Indicator', () => {
    it('should update step count based on import type', () => {
      renderWithProviders();

      // Athletes flow: 3 steps
      expect(screen.getByTestId('wizard-step-indicator')).toHaveTextContent('3');

      // Switch to measurements
      fireEvent.click(screen.getByText('Select Measurements'));

      // Measurements flow: 4 steps
      expect(screen.getByTestId('wizard-step-indicator')).toHaveTextContent('4');
    });
  });
});
