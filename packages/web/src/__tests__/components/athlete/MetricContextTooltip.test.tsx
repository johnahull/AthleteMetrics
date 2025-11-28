/**
 * Tests for MetricContextTooltip Component
 * Week 3: Metric Education & Context
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MetricContextTooltip } from '@/components/athlete/MetricContextTooltip';

describe('MetricContextTooltip', () => {
  const defaultProps = {
    metric: 'FLY10_TIME',
    value: 1.1,
    children: <span data-testid="trigger">1.10s</span>,
  };

  describe('Rendering', () => {
    it('should render children as trigger element', () => {
      render(<MetricContextTooltip {...defaultProps} />);

      expect(screen.getByTestId('trigger')).toBeInTheDocument();
      expect(screen.getByText('1.10s')).toBeInTheDocument();
    });

    it('should wrap children in a tooltip trigger', () => {
      render(<MetricContextTooltip {...defaultProps} />);

      const trigger = screen.getByTestId('trigger');
      expect(trigger.closest('[data-testid="tooltip-trigger"]')).toBeInTheDocument();
    });
  });

  describe('Tooltip Behavior', () => {
    it('should show tooltip on hover', async () => {
      const user = userEvent.setup();
      render(<MetricContextTooltip {...defaultProps} />);

      const trigger = screen.getByTestId('tooltip-trigger');
      await user.hover(trigger);

      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
      });
    });

    it('should show tooltip for VERTICAL_JUMP metric', async () => {
      const user = userEvent.setup();
      render(
        <MetricContextTooltip metric="VERTICAL_JUMP" value={32}>
          <span data-testid="trigger">32"</span>
        </MetricContextTooltip>
      );

      const trigger = screen.getByTestId('tooltip-trigger');
      await user.hover(trigger);

      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
      });
    });

    it('should show tooltip for DASH_40YD metric', async () => {
      const user = userEvent.setup();
      render(
        <MetricContextTooltip metric="DASH_40YD" value={4.5}>
          <span data-testid="trigger">4.50s</span>
        </MetricContextTooltip>
      );

      const trigger = screen.getByTestId('tooltip-trigger');
      await user.hover(trigger);

      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
      });
    });

    it('should show tooltip for RSI metric', async () => {
      const user = userEvent.setup();
      render(
        <MetricContextTooltip metric="RSI" value={2.1}>
          <span data-testid="trigger">2.10</span>
        </MetricContextTooltip>
      );

      const trigger = screen.getByTestId('tooltip-trigger');
      await user.hover(trigger);

      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
      });
    });
  });

  describe('With Athlete Data', () => {
    const athleteData = {
      personalBest: 1.05,
      recentAverage: 1.12,
      measurementCount: 15,
      lastMeasurement: 1.1,
    };

    it('should show tooltip with athlete context', async () => {
      const user = userEvent.setup();
      render(
        <MetricContextTooltip {...defaultProps} athleteData={athleteData} />
      );

      const trigger = screen.getByTestId('tooltip-trigger');
      await user.hover(trigger);

      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
      });
    });

    it('should handle PR value', async () => {
      const user = userEvent.setup();
      render(
        <MetricContextTooltip
          {...defaultProps}
          value={1.05}
          athleteData={athleteData}
        />
      );

      const trigger = screen.getByTestId('tooltip-trigger');
      await user.hover(trigger);

      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
      });
    });

    it('should handle new PR value', async () => {
      const user = userEvent.setup();
      render(
        <MetricContextTooltip
          {...defaultProps}
          value={1.0}
          athleteData={athleteData}
        />
      );

      const trigger = screen.getByTestId('tooltip-trigger');
      await user.hover(trigger);

      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
      });
    });
  });

  describe('Gender Filtering', () => {
    it('should render with gender filter', async () => {
      const user = userEvent.setup();
      render(
        <MetricContextTooltip
          metric="VERTICAL_JUMP"
          value={26}
          gender="female"
        >
          <span data-testid="trigger">26"</span>
        </MetricContextTooltip>
      );

      const trigger = screen.getByTestId('tooltip-trigger');
      await user.hover(trigger);

      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
      });
    });
  });

  describe('Unknown Metric', () => {
    it('should render children without tooltip for unknown metric', () => {
      render(
        <MetricContextTooltip metric="UNKNOWN_METRIC" value={10}>
          <span data-testid="trigger">10</span>
        </MetricContextTooltip>
      );

      expect(screen.getByTestId('trigger')).toBeInTheDocument();
    });

    it('should not crash for invalid metric', () => {
      expect(() => {
        render(
          <MetricContextTooltip metric="INVALID" value={0}>
            <span>Test</span>
          </MetricContextTooltip>
        );
      }).not.toThrow();
    });
  });

  describe('Accessibility', () => {
    it('should have proper tooltip role', async () => {
      const user = userEvent.setup();
      render(<MetricContextTooltip {...defaultProps} />);

      const trigger = screen.getByTestId('tooltip-trigger');
      await user.hover(trigger);

      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
      });
    });

    it('should be keyboard accessible', async () => {
      render(<MetricContextTooltip {...defaultProps} />);

      const trigger = screen.getByTestId('tooltip-trigger');
      trigger.focus();

      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
      });
    });
  });

  describe('Compact Mode', () => {
    it('should render in compact mode', async () => {
      const user = userEvent.setup();
      render(<MetricContextTooltip {...defaultProps} compact />);

      const trigger = screen.getByTestId('tooltip-trigger');
      await user.hover(trigger);

      await waitFor(() => {
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
      });
    });
  });
});
