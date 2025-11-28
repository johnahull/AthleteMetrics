/**
 * Tests for GoalCreationWizard Component
 * Week 4: Goal Setting System - TDD Phase 1 (RED)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GoalCreationWizard } from '@/components/athlete/GoalCreationWizard';
import { GoalType } from '@/utils/goal-utils';

describe('GoalCreationWizard', () => {
  const mockMeasurements = [
    { metric: 'FLY10_TIME', value: 1.2, date: '2024-01-01' },
    { metric: 'FLY10_TIME', value: 1.15, date: '2024-01-15' },
    { metric: 'FLY10_TIME', value: 1.12, date: '2024-02-01' },
    { metric: 'VERTICAL_JUMP', value: 30, date: '2024-01-01' },
    { metric: 'VERTICAL_JUMP', value: 31, date: '2024-01-15' },
  ];

  const availableMetrics = ['FLY10_TIME', 'VERTICAL_JUMP', 'DASH_40YD'];

  const defaultProps = {
    measurements: mockMeasurements,
    availableMetrics,
    onCreateGoal: vi.fn(),
    onCancel: vi.fn(),
  };

  describe('Step 1: Metric Selection', () => {
    it('should render metric selection step by default', () => {
      render(<GoalCreationWizard {...defaultProps} />);
      expect(screen.getByText(/select a metric/i)).toBeInTheDocument();
    });

    it('should display available metrics as options', () => {
      render(<GoalCreationWizard {...defaultProps} />);
      // Use getAllByText since metric names may appear multiple times
      expect(screen.getAllByText(/10-Yard Fly/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Vertical Jump/i).length).toBeGreaterThan(0);
    });

    it('should show step indicator', () => {
      render(<GoalCreationWizard {...defaultProps} />);
      expect(screen.getByTestId('step-indicator')).toBeInTheDocument();
      expect(screen.getByText(/step 1/i)).toBeInTheDocument();
    });

    it('should advance to step 2 when metric is selected', async () => {
      const user = userEvent.setup();
      render(<GoalCreationWizard {...defaultProps} />);

      const metricButton = screen.getByRole('button', { name: /10-Yard Fly/i });
      await user.click(metricButton);

      expect(screen.getByText(/choose goal type/i)).toBeInTheDocument();
    });

    it('should show current performance for selected metric', async () => {
      const user = userEvent.setup();
      render(<GoalCreationWizard {...defaultProps} />);

      const metricButton = screen.getByRole('button', { name: /10-Yard Fly/i });
      await user.click(metricButton);

      // Should show current best performance
      expect(screen.getByTestId('current-performance')).toBeInTheDocument();
    });
  });

  describe('Step 2: Goal Type Selection', () => {
    it('should show goal type options', async () => {
      const user = userEvent.setup();
      render(<GoalCreationWizard {...defaultProps} />);

      // Go to step 2
      await user.click(screen.getByRole('button', { name: /10-Yard Fly/i }));

      expect(screen.getByText(/target value/i)).toBeInTheDocument();
      expect(screen.getByText(/improvement percentage/i)).toBeInTheDocument();
      expect(screen.getByText(/consistency/i)).toBeInTheDocument();
    });

    it('should show smart suggestions based on performance', async () => {
      const user = userEvent.setup();
      render(<GoalCreationWizard {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /10-Yard Fly/i }));

      expect(screen.getByTestId('smart-suggestions')).toBeInTheDocument();
    });

    it('should allow selecting a suggested goal', async () => {
      const user = userEvent.setup();
      render(<GoalCreationWizard {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /10-Yard Fly/i }));

      const suggestionButton = screen.getAllByTestId('suggestion-button')[0];
      await user.click(suggestionButton);

      // Should advance to step 3 with pre-filled values
      expect(screen.getByText(/set target/i)).toBeInTheDocument();
    });

    it('should allow going back to step 1', async () => {
      const user = userEvent.setup();
      render(<GoalCreationWizard {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /10-Yard Fly/i }));
      await user.click(screen.getByRole('button', { name: /back/i }));

      expect(screen.getByText(/select a metric/i)).toBeInTheDocument();
    });
  });

  describe('Step 3: Target Setting', () => {
    it('should show target value input', async () => {
      const user = userEvent.setup();
      render(<GoalCreationWizard {...defaultProps} />);

      // Navigate to step 3
      await user.click(screen.getByRole('button', { name: /10-Yard Fly/i }));
      await user.click(screen.getByText(/target value/i));

      expect(screen.getByLabelText(/target value/i)).toBeInTheDocument();
    });

    it('should show target date picker', async () => {
      const user = userEvent.setup();
      render(<GoalCreationWizard {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /10-Yard Fly/i }));
      await user.click(screen.getByText(/target value/i));

      expect(screen.getByLabelText(/target date/i)).toBeInTheDocument();
    });

    it('should validate target value is better than current', async () => {
      const user = userEvent.setup();
      render(<GoalCreationWizard {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /10-Yard Fly/i }));
      await user.click(screen.getByText(/target value/i));

      const targetInput = screen.getByLabelText(/target value/i);
      await user.clear(targetInput);
      await user.type(targetInput, '2.0'); // Worse than current 1.12

      // Should show validation error
      await waitFor(() => {
        expect(screen.getByText(/target should be better/i)).toBeInTheDocument();
      });
    });

    it('should validate target date is in the future', async () => {
      const user = userEvent.setup();
      render(<GoalCreationWizard {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /10-Yard Fly/i }));
      await user.click(screen.getByText(/target value/i));

      const dateInput = screen.getByLabelText(/target date/i);
      await user.clear(dateInput);
      await user.type(dateInput, '2020-01-01'); // Past date

      await waitFor(() => {
        expect(screen.getByText(/date must be in the future/i)).toBeInTheDocument();
      });
    });

    it('should enable create button when form is valid', async () => {
      const user = userEvent.setup();
      render(<GoalCreationWizard {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /10-Yard Fly/i }));
      await user.click(screen.getByText(/target value/i));

      const targetInput = screen.getByLabelText(/target value/i);
      await user.clear(targetInput);
      await user.type(targetInput, '1.05'); // Better than current

      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 3);
      const dateInput = screen.getByLabelText(/target date/i);
      await user.clear(dateInput);
      await user.type(dateInput, futureDate.toISOString().split('T')[0]);

      const createButton = screen.getByRole('button', { name: /create goal/i });
      expect(createButton).not.toBeDisabled();
    });
  });

  describe('Goal Creation', () => {
    it('should call onCreateGoal with correct data', async () => {
      const onCreateGoal = vi.fn();
      const user = userEvent.setup();
      render(<GoalCreationWizard {...defaultProps} onCreateGoal={onCreateGoal} />);

      // Complete wizard
      await user.click(screen.getByRole('button', { name: /10-Yard Fly/i }));
      await user.click(screen.getByText(/target value/i));

      const targetInput = screen.getByLabelText(/target value/i);
      await user.clear(targetInput);
      await user.type(targetInput, '1.05');

      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 3);
      const dateStr = futureDate.toISOString().split('T')[0];
      const dateInput = screen.getByLabelText(/target date/i);
      await user.clear(dateInput);
      await user.type(dateInput, dateStr);

      await user.click(screen.getByRole('button', { name: /create goal/i }));

      expect(onCreateGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          metric: 'FLY10_TIME',
          goalType: GoalType.TARGET_VALUE,
          targetValue: 1.05,
          targetDate: dateStr,
        })
      );
    });

    it('should call onCancel when cancel is clicked', async () => {
      const onCancel = vi.fn();
      const user = userEvent.setup();
      render(<GoalCreationWizard {...defaultProps} onCancel={onCancel} />);

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe('Consistency Goals', () => {
    it('should show measurement count input for consistency goals', async () => {
      const user = userEvent.setup();
      render(<GoalCreationWizard {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /10-Yard Fly/i }));
      await user.click(screen.getByText(/consistency/i));

      expect(screen.getByLabelText(/number of measurements/i)).toBeInTheDocument();
    });

    it('should validate minimum measurement count', async () => {
      const user = userEvent.setup();
      render(<GoalCreationWizard {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /10-Yard Fly/i }));
      await user.click(screen.getByText(/consistency/i));

      const countInput = screen.getByLabelText(/number of measurements/i);
      await user.clear(countInput);
      await user.type(countInput, '0');

      await waitFor(() => {
        expect(screen.getByText(/at least 1/i)).toBeInTheDocument();
      });
    });
  });

  describe('Improvement Percentage Goals', () => {
    it('should show percentage input for improvement goals', async () => {
      const user = userEvent.setup();
      render(<GoalCreationWizard {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /10-Yard Fly/i }));
      await user.click(screen.getByText(/improvement percentage/i));

      expect(screen.getByLabelText(/improvement percentage/i)).toBeInTheDocument();
    });

    it('should show what the target would be based on percentage', async () => {
      const user = userEvent.setup();
      render(<GoalCreationWizard {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /10-Yard Fly/i }));
      await user.click(screen.getByText(/improvement percentage/i));

      const percentInput = screen.getByLabelText(/improvement percentage/i);
      await user.clear(percentInput);
      await user.type(percentInput, '10');

      // Should show calculated target
      expect(screen.getByTestId('calculated-target')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper aria labels', () => {
      render(<GoalCreationWizard {...defaultProps} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should be keyboard navigable', async () => {
      const user = userEvent.setup();
      render(<GoalCreationWizard {...defaultProps} />);

      // Tab through options - should focus on first button (metric option)
      await user.tab();
      expect(document.activeElement?.tagName).toBe('BUTTON');
    });

    it('should announce step changes', async () => {
      const user = userEvent.setup();
      render(<GoalCreationWizard {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /10-Yard Fly/i }));

      expect(screen.getByRole('status')).toHaveTextContent(/step 2/i);
    });
  });

  describe('UI States', () => {
    it('should show loading state while creating goal', async () => {
      const onCreateGoal = vi.fn((): Promise<void> => new Promise(() => {})); // Never resolves
      const user = userEvent.setup();
      render(<GoalCreationWizard {...defaultProps} onCreateGoal={onCreateGoal} />);

      await user.click(screen.getByRole('button', { name: /10-Yard Fly/i }));
      await user.click(screen.getByText(/target value/i));

      const targetInput = screen.getByLabelText(/target value/i);
      await user.clear(targetInput);
      await user.type(targetInput, '1.05');

      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 3);
      const dateInput = screen.getByLabelText(/target date/i);
      await user.clear(dateInput);
      await user.type(dateInput, futureDate.toISOString().split('T')[0]);

      await user.click(screen.getByRole('button', { name: /create goal/i }));

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    it('should have cancel button visible on all steps', async () => {
      const user = userEvent.setup();
      render(<GoalCreationWizard {...defaultProps} />);

      // Step 1
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();

      // Step 2
      await user.click(screen.getByRole('button', { name: /10-Yard Fly/i }));
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();

      // Step 3
      await user.click(screen.getByText(/target value/i));
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });
  });
});
