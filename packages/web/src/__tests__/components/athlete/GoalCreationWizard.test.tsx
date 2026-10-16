/**
 * Tests for GoalCreationWizard Component
 * Week 4: Goal Setting System - TDD Phase 1 (RED)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GoalCreationWizard } from '@/components/athlete/GoalCreationWizard';
import { GoalType } from '@/utils/goal-utils';

vi.mock('@/hooks/use-metric-labels', () => ({
  useMetricLabels: () => ({
    labels: {},
    getLabel: (code: string) => code,
    getUnit: (code: string) => ({ FLY10_TIME: 's', VERTICAL_JUMP: 'in' } as Record<string, string>)[code] ?? '',
    isLoading: false,
  }),
}));

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

  describe('time (mm:ss) metrics', () => {
    it('takes a target value as m:ss and creates the goal in seconds', async () => {
      const onCreateGoal = vi.fn();
      const user = userEvent.setup();
      render(
        <GoalCreationWizard
          measurements={[
            { metric: 'MILE_RUN', value: 420, date: '2024-01-01' },
            { metric: 'MILE_RUN', value: 410, date: '2024-02-01' },
          ]}
          availableMetrics={['MILE_RUN']}
          durationMetrics={['MILE_RUN']}
          onCreateGoal={onCreateGoal}
          onCancel={vi.fn()}
        />
      );

      await user.click(screen.getByRole('button', { name: /MILE_RUN/ }));
      await user.click(screen.getByText(/target value/i));
      const targetInput = screen.getByLabelText(/target value/i);
      expect(targetInput).toHaveAttribute('type', 'text');
      await user.type(targetInput, '7:15');

      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 3);
      const dateStr = futureDate.toISOString().split('T')[0];
      const dateInput = screen.getByLabelText(/target date/i);
      await user.clear(dateInput);
      await user.type(dateInput, dateStr);
      await user.click(screen.getByRole('button', { name: /create goal/i }));

      expect(onCreateGoal).toHaveBeenCalledWith(expect.objectContaining({ metric: 'MILE_RUN', targetValue: 435 }));
    });
  });

  describe('direction from the metric list', () => {
    it('takes the fastest time as the baseline for a lower-is-better metric outside the built-in list', async () => {
      const onCreateGoal = vi.fn();
      const user = userEvent.setup();
      render(
        <GoalCreationWizard
          measurements={[
            { metric: 'MILE_RUN', value: 420, date: '2024-01-01' },
            { metric: 'MILE_RUN', value: 410, date: '2024-02-01' },
          ]}
          availableMetrics={['MILE_RUN']}
          durationMetrics={['MILE_RUN']}
          metricTypes={{ MILE_RUN: 'lower_is_better' }}
          onCreateGoal={onCreateGoal}
          onCancel={vi.fn()}
        />
      );

      await user.click(screen.getByRole('button', { name: /MILE_RUN/ }));
      await user.click(screen.getByText(/target value/i));
      await user.type(screen.getByLabelText(/target value/i), '6:30');

      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 3);
      const dateInput = screen.getByLabelText(/target date/i);
      await user.clear(dateInput);
      await user.type(dateInput, futureDate.toISOString().split('T')[0]);
      await user.click(screen.getByRole('button', { name: /create goal/i }));

      expect(onCreateGoal).toHaveBeenCalledWith(
        expect.objectContaining({ metric: 'MILE_RUN', targetValue: 390, baselineValue: 410 })
      );
    });
  });

  describe('persisted improvement target', () => {
    async function fillImprovementGoal(user: ReturnType<typeof userEvent.setup>, metric: RegExp) {
      await user.click(screen.getByRole('button', { name: metric }));
      await user.click(screen.getByText(/improvement percentage/i));
      await user.type(screen.getByLabelText(/improvement percentage/i), '10');
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 3);
      const dateInput = screen.getByLabelText(/target date/i);
      await user.clear(dateInput);
      await user.type(dateInput, futureDate.toISOString().split('T')[0]);
    }

    const dashMeasurements = [
      { metric: 'DASH_10YD', value: 2.0, date: '2024-01-01' },
      { metric: 'DASH_10YD', value: 1.9, date: '2024-02-01' },
    ];

    it('saves the fastest time as the baseline for a built-in time with no metric types (DASH_10YD)', async () => {
      const onCreateGoal = vi.fn();
      const user = userEvent.setup();
      render(
        <GoalCreationWizard
          measurements={dashMeasurements}
          availableMetrics={['DASH_10YD']}
          metricTypes={undefined}
          onCreateGoal={onCreateGoal}
          onCancel={vi.fn()}
        />
      );

      await fillImprovementGoal(user, /DASH_10YD/);
      await user.click(screen.getByRole('button', { name: /create goal/i }));

      expect(onCreateGoal).toHaveBeenCalledWith(
        expect.objectContaining({ metric: 'DASH_10YD', targetValue: 10, baselineValue: 1.9 })
      );
    });

    it('keeps Create Goal disabled while the metric list is loading', async () => {
      const onCreateGoal = vi.fn();
      const user = userEvent.setup();
      render(
        <GoalCreationWizard
          measurements={dashMeasurements}
          availableMetrics={['DASH_10YD']}
          metricTypes={{}}
          metricTypesLoading
          onCreateGoal={onCreateGoal}
          onCancel={vi.fn()}
        />
      );

      await fillImprovementGoal(user, /DASH_10YD/);

      expect(screen.getByRole('button', { name: /loading metrics/i })).toBeDisabled();
    });

    it('keeps Create Goal disabled and says why when the metric list failed to load', async () => {
      const user = userEvent.setup();
      render(
        <GoalCreationWizard
          measurements={dashMeasurements}
          availableMetrics={['DASH_10YD']}
          metricTypes={{}}
          metricTypesError
          onCreateGoal={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      await fillImprovementGoal(user, /DASH_10YD/);

      expect(screen.getByRole('button', { name: /metrics unavailable/i })).toBeDisabled();
    });

    const sprintMeasurements = [
      { metric: 'ORG_SPRINT', value: 5.5, date: '2024-01-01' },
      { metric: 'ORG_SPRINT', value: 5.0, date: '2024-02-01' },
      { metric: 'ORG_OTHER', value: 3, date: '2024-02-01' },
    ];

    it('saves the fastest time for a custom lower-is-better code picked while the list was loading', async () => {
      const onCreateGoal = vi.fn();
      const user = userEvent.setup();
      const props = {
        measurements: sprintMeasurements,
        availableMetrics: ['ORG_SPRINT'],
        onCreateGoal,
        onCancel: vi.fn(),
      };
      const { rerender } = render(<GoalCreationWizard {...props} metricTypes={{}} metricTypesLoading />);

      await fillImprovementGoal(user, /ORG_SPRINT/);
      rerender(
        <GoalCreationWizard {...props} metricTypes={{ ORG_SPRINT: 'lower_is_better' }} metricTypesLoading={false} />
      );
      await user.click(screen.getByRole('button', { name: /create goal/i }));

      expect(onCreateGoal).toHaveBeenCalledWith(
        expect.objectContaining({ metric: 'ORG_SPRINT', targetValue: 10, baselineValue: 5.0 })
      );
    });

    it('hides a measured code with no metric type once the list has loaded', () => {
      render(
        <GoalCreationWizard
          measurements={sprintMeasurements}
          availableMetrics={['ORG_SPRINT', 'ORG_OTHER', 'VERTICAL_JUMP', 'DASH_10YD']}
          metricTypes={{ ORG_SPRINT: 'lower_is_better' }}
          onCreateGoal={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByRole('button', { name: /ORG_SPRINT/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /ORG_OTHER/ })).not.toBeInTheDocument();
      // Built-ins keep their known direction
      expect(screen.getByRole('button', { name: /Vertical Jump/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /DASH_10YD/ })).toBeInTheDocument();
    });

    it('blocks a code picked while loading that has no metric type once loaded', async () => {
      const onCreateGoal = vi.fn();
      const user = userEvent.setup();
      const props = {
        measurements: sprintMeasurements,
        availableMetrics: ['ORG_SPRINT'],
        onCreateGoal,
        onCancel: vi.fn(),
      };
      const { rerender } = render(<GoalCreationWizard {...props} metricTypes={{}} metricTypesLoading />);

      await fillImprovementGoal(user, /ORG_SPRINT/);
      rerender(<GoalCreationWizard {...props} metricTypes={{}} metricTypesLoading={false} />);

      expect(screen.getByRole('button', { name: /create goal/i })).toBeDisabled();
      expect(screen.getByText(/not available for goals/i)).toBeInTheDocument();
    });
  });
});
