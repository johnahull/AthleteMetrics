/**
 * Tests for GoalProgressCard Component
 * Week 4: Goal Setting System - TDD Phase 1 (RED)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GoalProgressCard } from '@/components/athlete/GoalProgressCard';
import { GoalType, GoalStatus, Goal } from '@/utils/goal-utils';

describe('GoalProgressCard', () => {
  const defaultGoal: Goal = {
    id: 'goal-1',
    userId: 'user-1',
    metric: 'FLY10_TIME',
    goalType: GoalType.TARGET_VALUE,
    targetValue: 1.0,
    baselineValue: 1.2,
    currentValue: 1.1,
    targetDate: '2024-06-01',
    status: GoalStatus.ACTIVE,
    createdAt: '2024-01-01',
  };

  describe('Rendering', () => {
    it('should render goal metric name', () => {
      render(<GoalProgressCard goal={defaultGoal} />);
      expect(screen.getByText(/10-Yard Fly/i)).toBeInTheDocument();
    });

    it('should render target value', () => {
      render(<GoalProgressCard goal={defaultGoal} />);
      expect(screen.getByTestId('goal-target')).toHaveTextContent('1.00s');
    });

    it('should render current value', () => {
      render(<GoalProgressCard goal={defaultGoal} />);
      expect(screen.getByTestId('goal-current')).toHaveTextContent('1.10s');
    });

    it('should render progress bar', () => {
      render(<GoalProgressCard goal={defaultGoal} />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('should render progress percentage', () => {
      render(<GoalProgressCard goal={defaultGoal} />);
      expect(screen.getByTestId('goal-progress')).toHaveTextContent('50%');
    });

    it('should render with data-testid', () => {
      render(<GoalProgressCard goal={defaultGoal} />);
      expect(screen.getByTestId('goal-progress-card')).toBeInTheDocument();
    });
  });

  describe('Progress Bar', () => {
    it('should show correct progress bar width', () => {
      render(<GoalProgressCard goal={defaultGoal} />);
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '50');
    });

    it('should show 100% progress when goal achieved', () => {
      const achievedGoal = {
        ...defaultGoal,
        currentValue: 1.0,
        status: GoalStatus.ACHIEVED,
      };
      render(<GoalProgressCard goal={achievedGoal} />);
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '100');
    });

    it('should show 0% progress when no progress made', () => {
      const noProgressGoal = {
        ...defaultGoal,
        currentValue: 1.2,
      };
      render(<GoalProgressCard goal={noProgressGoal} />);
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '0');
    });
  });

  describe('Status Indicators', () => {
    it('should show blue styling for active goal', () => {
      render(<GoalProgressCard goal={defaultGoal} />);
      const card = screen.getByTestId('goal-progress-card');
      expect(card).toHaveClass('border-blue-200');
    });

    it('should show green styling for achieved goal', () => {
      const achievedGoal = {
        ...defaultGoal,
        status: GoalStatus.ACHIEVED,
        achievedAt: '2024-05-15',
      };
      render(<GoalProgressCard goal={achievedGoal} />);
      const card = screen.getByTestId('goal-progress-card');
      expect(card).toHaveClass('border-green-200');
    });

    it('should show red styling for missed goal', () => {
      const missedGoal = {
        ...defaultGoal,
        status: GoalStatus.MISSED,
      };
      render(<GoalProgressCard goal={missedGoal} />);
      const card = screen.getByTestId('goal-progress-card');
      expect(card).toHaveClass('border-red-200');
    });

    it('should show gray styling for abandoned goal', () => {
      const abandonedGoal = {
        ...defaultGoal,
        status: GoalStatus.ABANDONED,
      };
      render(<GoalProgressCard goal={abandonedGoal} />);
      const card = screen.getByTestId('goal-progress-card');
      expect(card).toHaveClass('border-gray-200');
    });

    it('should show status badge', () => {
      render(<GoalProgressCard goal={defaultGoal} />);
      expect(screen.getByTestId('goal-status-badge')).toHaveTextContent('Active');
    });

    it('should show achieved badge for completed goals', () => {
      const achievedGoal = {
        ...defaultGoal,
        status: GoalStatus.ACHIEVED,
      };
      render(<GoalProgressCard goal={achievedGoal} />);
      expect(screen.getByTestId('goal-status-badge')).toHaveTextContent('Achieved');
    });
  });

  describe('Target Date', () => {
    it('should show target date', () => {
      render(<GoalProgressCard goal={defaultGoal} />);
      expect(screen.getByTestId('goal-target-date')).toBeInTheDocument();
    });

    it('should show days remaining for active goal', () => {
      const futureGoal = {
        ...defaultGoal,
        targetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
      };
      render(<GoalProgressCard goal={futureGoal} />);
      expect(screen.getByTestId('goal-days-remaining')).toBeInTheDocument();
    });

    it('should show overdue warning for past target date', () => {
      const overdueGoal = {
        ...defaultGoal,
        targetDate: '2023-01-01',
      };
      render(<GoalProgressCard goal={overdueGoal} />);
      expect(screen.getByTestId('goal-days-remaining')).toHaveTextContent(/overdue/i);
    });
  });

  describe('Goal Types', () => {
    it('should render improvement percentage goal correctly', () => {
      const percentGoal: Goal = {
        ...defaultGoal,
        goalType: GoalType.IMPROVEMENT_PERCENTAGE,
        targetValue: 10,
      };
      render(<GoalProgressCard goal={percentGoal} />);
      expect(screen.getByTestId('goal-target')).toHaveTextContent('10% improvement');
    });

    it('should render consistency goal correctly', () => {
      const consistencyGoal: Goal = {
        ...defaultGoal,
        goalType: GoalType.CONSISTENCY,
        targetValue: 10,
        currentValue: 5,
        baselineValue: 0,
      };
      render(<GoalProgressCard goal={consistencyGoal} />);
      expect(screen.getByTestId('goal-target')).toHaveTextContent('10 measurements');
      expect(screen.getByTestId('goal-current')).toHaveTextContent('5');
    });
  });

  describe('Higher is Better Metrics', () => {
    it('should correctly display vertical jump goal', () => {
      const jumpGoal: Goal = {
        id: 'goal-2',
        userId: 'user-1',
        metric: 'VERTICAL_JUMP',
        goalType: GoalType.TARGET_VALUE,
        targetValue: 36,
        baselineValue: 30,
        currentValue: 33,
        targetDate: '2024-06-01',
        status: GoalStatus.ACTIVE,
        createdAt: '2024-01-01',
      };
      render(<GoalProgressCard goal={jumpGoal} />);
      expect(screen.getByText(/Vertical Jump/i)).toBeInTheDocument();
      expect(screen.getByTestId('goal-target')).toHaveTextContent('36.0"');
    });
  });

  describe('Interactive Actions', () => {
    it('should call onMarkComplete when mark complete button clicked', async () => {
      const onMarkComplete = vi.fn();
      const almostDoneGoal = {
        ...defaultGoal,
        currentValue: 1.0, // Goal achieved
      };
      render(
        <GoalProgressCard goal={almostDoneGoal} onMarkComplete={onMarkComplete} />
      );

      const button = screen.getByRole('button', { name: /mark complete/i });
      await userEvent.click(button);

      expect(onMarkComplete).toHaveBeenCalledWith(almostDoneGoal.id);
    });

    it('should not show mark complete button for non-achieved goals', () => {
      const onMarkComplete = vi.fn();
      render(
        <GoalProgressCard goal={defaultGoal} onMarkComplete={onMarkComplete} />
      );

      expect(
        screen.queryByRole('button', { name: /mark complete/i })
      ).not.toBeInTheDocument();
    });

    it('should call onAbandon when abandon button clicked', async () => {
      const onAbandon = vi.fn();
      render(<GoalProgressCard goal={defaultGoal} onAbandon={onAbandon} />);

      const button = screen.getByRole('button', { name: /abandon/i });
      await userEvent.click(button);

      expect(onAbandon).toHaveBeenCalledWith(defaultGoal.id);
    });

    it('should not show abandon button for completed goals', () => {
      const achievedGoal = {
        ...defaultGoal,
        status: GoalStatus.ACHIEVED,
      };
      render(<GoalProgressCard goal={achievedGoal} />);

      expect(screen.queryByRole('button', { name: /abandon/i })).not.toBeInTheDocument();
    });
  });

  describe('Compact Mode', () => {
    it('should render in compact mode', () => {
      render(<GoalProgressCard goal={defaultGoal} compact />);
      const card = screen.getByTestId('goal-progress-card');
      expect(card).toHaveClass('compact');
    });

    it('should hide action buttons in compact mode', () => {
      render(<GoalProgressCard goal={defaultGoal} compact onAbandon={() => {}} />);
      expect(screen.queryByRole('button', { name: /abandon/i })).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper aria labels on progress bar', () => {
      render(<GoalProgressCard goal={defaultGoal} />);
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuemin', '0');
      expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    });

    it('should have accessible card with aria-label', () => {
      render(<GoalProgressCard goal={defaultGoal} />);
      const card = screen.getByTestId('goal-progress-card');
      expect(card).toHaveAttribute('aria-label');
    });
  });
});
