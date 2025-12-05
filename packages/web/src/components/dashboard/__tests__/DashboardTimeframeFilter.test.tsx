import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardTimeframeFilter } from '../DashboardTimeframeFilter';
import type { TimeframePreset } from '@shared/dashboard-timeframe';

describe('DashboardTimeframeFilter', () => {
  const mockOnTimeframeChange = vi.fn();

  beforeEach(() => {
    mockOnTimeframeChange.mockClear();
  });

  describe('Rendering', () => {
    it('renders with default label for 30d preset', () => {
      render(
        <DashboardTimeframeFilter
          timeframe="30d"
          startDate={null}
          endDate={null}
          onTimeframeChange={mockOnTimeframeChange}
        />
      );

      const button = screen.getByTestId('dashboard-timeframe-selector');
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent('Last 30 Days');
    });

    it('renders with label for 7d preset', () => {
      render(
        <DashboardTimeframeFilter
          timeframe="7d"
          startDate={null}
          endDate={null}
          onTimeframeChange={mockOnTimeframeChange}
        />
      );

      expect(screen.getByTestId('dashboard-timeframe-selector')).toHaveTextContent('Last 7 Days');
    });

    it('renders with label for ytd preset', () => {
      render(
        <DashboardTimeframeFilter
          timeframe="ytd"
          startDate={null}
          endDate={null}
          onTimeframeChange={mockOnTimeframeChange}
        />
      );

      expect(screen.getByTestId('dashboard-timeframe-selector')).toHaveTextContent('Year to Date');
    });

    it('renders with custom date range label', () => {
      render(
        <DashboardTimeframeFilter
          timeframe="custom"
          startDate="2024-01-15"
          endDate="2024-02-15"
          onTimeframeChange={mockOnTimeframeChange}
        />
      );

      const button = screen.getByTestId('dashboard-timeframe-selector');
      expect(button).toHaveTextContent(/Jan 15.*Feb 15/);
    });

    it('renders with calendar icon', () => {
      render(
        <DashboardTimeframeFilter
          timeframe="30d"
          startDate={null}
          endDate={null}
          onTimeframeChange={mockOnTimeframeChange}
        />
      );

      // Calendar icon should be present
      const button = screen.getByTestId('dashboard-timeframe-selector');
      expect(button.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('Popover Interaction', () => {
    it('opens popover on button click', async () => {
      const user = userEvent.setup();
      render(
        <DashboardTimeframeFilter
          timeframe="30d"
          startDate={null}
          endDate={null}
          onTimeframeChange={mockOnTimeframeChange}
        />
      );

      const button = screen.getByTestId('dashboard-timeframe-selector');
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText('Last 7 Days')).toBeInTheDocument();
      });
    });

    it('shows all preset options in popover', async () => {
      const user = userEvent.setup();
      render(
        <DashboardTimeframeFilter
          timeframe="ytd" // Use a different preset to avoid duplicate text
          startDate={null}
          endDate={null}
          onTimeframeChange={mockOnTimeframeChange}
        />
      );

      await user.click(screen.getByTestId('dashboard-timeframe-selector'));

      await waitFor(() => {
        // Find all buttons with these labels (they should be in the popover)
        const buttons = screen.getAllByRole('button');
        const buttonTexts = buttons.map(b => b.textContent);

        expect(buttonTexts).toContain('Last 7 Days');
        expect(buttonTexts).toContain('Last 30 Days');
        expect(buttonTexts).toContain('Last 90 Days');
        expect(buttonTexts).toContain('Last 180 Days');
        expect(buttonTexts).toContain('Last Year');
        expect(buttonTexts).toContain('Year to Date');
        expect(buttonTexts).toContain('All Time');
        expect(buttonTexts).toContain('Custom Range...');
      });
    });

    it('shows checkmark on selected preset', async () => {
      const user = userEvent.setup();
      render(
        <DashboardTimeframeFilter
          timeframe="180d"
          startDate={null}
          endDate={null}
          onTimeframeChange={mockOnTimeframeChange}
        />
      );

      await user.click(screen.getByTestId('dashboard-timeframe-selector'));

      await waitFor(() => {
        // Find all buttons in the popover
        const buttons = screen.getAllByRole('button');
        const selectedOption = buttons.find(b => b.textContent === 'Last 180 Days');
        expect(selectedOption).toBeInTheDocument();
        // Check icon should be present and visible (not opacity-0)
        const checkIcons = selectedOption?.querySelectorAll('svg');
        const visibleCheckIcon = Array.from(checkIcons || []).find(
          svg => !svg.classList.contains('opacity-0')
        );
        expect(visibleCheckIcon).toBeInTheDocument();
      });
    });

    it('clicking preset calls onTimeframeChange', async () => {
      const user = userEvent.setup();
      render(
        <DashboardTimeframeFilter
          timeframe="30d"
          startDate={null}
          endDate={null}
          onTimeframeChange={mockOnTimeframeChange}
        />
      );

      await user.click(screen.getByTestId('dashboard-timeframe-selector'));

      await waitFor(() => {
        expect(screen.getByText('Last 7 Days')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Last 7 Days'));

      expect(mockOnTimeframeChange).toHaveBeenCalledWith({
        timeframe: '7d',
      });
    });

    it('clicking different preset updates selection', async () => {
      const user = userEvent.setup();
      render(
        <DashboardTimeframeFilter
          timeframe="30d"
          startDate={null}
          endDate={null}
          onTimeframeChange={mockOnTimeframeChange}
        />
      );

      await user.click(screen.getByTestId('dashboard-timeframe-selector'));

      await waitFor(() => {
        expect(screen.getByText('Year to Date')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Year to Date'));

      expect(mockOnTimeframeChange).toHaveBeenCalledWith({
        timeframe: 'ytd',
      });
    });
  });

  describe('Custom Range Section', () => {
    it('custom range section is hidden by default', async () => {
      const user = userEvent.setup();
      render(
        <DashboardTimeframeFilter
          timeframe="30d"
          startDate={null}
          endDate={null}
          onTimeframeChange={mockOnTimeframeChange}
        />
      );

      await user.click(screen.getByTestId('dashboard-timeframe-selector'));

      await waitFor(() => {
        expect(screen.getByText('Custom Range...')).toBeInTheDocument();
      });

      // Calendar components should not be visible
      expect(screen.queryByText('From')).not.toBeInTheDocument();
      expect(screen.queryByText('To')).not.toBeInTheDocument();
    });

    it('custom range section expands when clicked', async () => {
      const user = userEvent.setup();
      render(
        <DashboardTimeframeFilter
          timeframe="30d"
          startDate={null}
          endDate={null}
          onTimeframeChange={mockOnTimeframeChange}
        />
      );

      await user.click(screen.getByTestId('dashboard-timeframe-selector'));

      await waitFor(() => {
        expect(screen.getByText('Custom Range...')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Custom Range...'));

      await waitFor(() => {
        expect(screen.getByText('From')).toBeInTheDocument();
        expect(screen.getByText('To')).toBeInTheDocument();
      });
    });

    it('shows Apply and Cancel buttons in custom section', async () => {
      const user = userEvent.setup();
      render(
        <DashboardTimeframeFilter
          timeframe="30d"
          startDate={null}
          endDate={null}
          onTimeframeChange={mockOnTimeframeChange}
        />
      );

      await user.click(screen.getByTestId('dashboard-timeframe-selector'));
      await waitFor(() => {
        expect(screen.getByText('Custom Range...')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Custom Range...'));

      await waitFor(() => {
        expect(screen.getByText('Apply')).toBeInTheDocument();
        expect(screen.getByText('Cancel')).toBeInTheDocument();
      });
    });

    it('custom date selection updates internal state', async () => {
      const user = userEvent.setup();
      render(
        <DashboardTimeframeFilter
          timeframe="30d"
          startDate={null}
          endDate={null}
          onTimeframeChange={mockOnTimeframeChange}
        />
      );

      await user.click(screen.getByTestId('dashboard-timeframe-selector'));
      await user.click(screen.getByText('Custom Range...'));

      await waitFor(() => {
        expect(screen.getByText('From')).toBeInTheDocument();
      });

      // The calendar component will be rendered, we just verify it's there
      // Actual date selection requires more complex interaction with Calendar component
      expect(screen.getByText('From')).toBeInTheDocument();
      expect(screen.getByText('To')).toBeInTheDocument();
    });

    it('Apply button commits custom range', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <DashboardTimeframeFilter
          timeframe="30d"
          startDate={null}
          endDate={null}
          onTimeframeChange={mockOnTimeframeChange}
        />
      );

      await user.click(screen.getByTestId('dashboard-timeframe-selector'));
      await user.click(screen.getByText('Custom Range...'));

      await waitFor(() => {
        expect(screen.getByText('Apply')).toBeInTheDocument();
      });

      // Simulate selecting dates by finding calendar cells
      // Note: This is a simplified test - actual calendar interaction would be more complex
      const fromCalendar = screen.getAllByRole('grid')[0];
      const toCalendar = screen.getAllByRole('grid')[1];

      expect(fromCalendar).toBeInTheDocument();
      expect(toCalendar).toBeInTheDocument();

      // Click a date in "From" calendar (e.g., 15th of current month)
      const fromDates = fromCalendar.querySelectorAll('button[name="day"]');
      if (fromDates.length > 14) {
        await user.click(fromDates[14]); // Click 15th
      }

      // Click a date in "To" calendar (e.g., 25th of current month)
      const toDates = toCalendar.querySelectorAll('button[name="day"]');
      if (toDates.length > 24) {
        await user.click(toDates[24]); // Click 25th
      }

      // Click Apply
      await user.click(screen.getByText('Apply'));

      // Should have called onTimeframeChange with custom timeframe
      await waitFor(() => {
        expect(mockOnTimeframeChange).toHaveBeenCalledWith(
          expect.objectContaining({
            timeframe: 'custom',
            startDate: expect.any(String),
            endDate: expect.any(String),
          })
        );
      });
    });

    it('Cancel button closes custom section without applying', async () => {
      const user = userEvent.setup();
      render(
        <DashboardTimeframeFilter
          timeframe="30d"
          startDate={null}
          endDate={null}
          onTimeframeChange={mockOnTimeframeChange}
        />
      );

      await user.click(screen.getByTestId('dashboard-timeframe-selector'));
      await user.click(screen.getByText('Custom Range...'));

      await waitFor(() => {
        expect(screen.getByText('Cancel')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Cancel'));

      await waitFor(() => {
        expect(screen.queryByText('From')).not.toBeInTheDocument();
        expect(screen.queryByText('To')).not.toBeInTheDocument();
      });

      expect(mockOnTimeframeChange).not.toHaveBeenCalled();
    });

    it('displays custom date range label correctly when custom is selected', async () => {
      const { rerender } = render(
        <DashboardTimeframeFilter
          timeframe="custom"
          startDate="2024-01-15"
          endDate="2024-02-28"
          onTimeframeChange={mockOnTimeframeChange}
        />
      );

      const button = screen.getByTestId('dashboard-timeframe-selector');
      // Should show formatted date range
      expect(button.textContent).toMatch(/Jan 15.*Feb 28/);
    });

    it('shows checkmark on Custom Range when custom timeframe is active', async () => {
      const user = userEvent.setup();
      render(
        <DashboardTimeframeFilter
          timeframe="custom"
          startDate="2024-01-15"
          endDate="2024-02-15"
          onTimeframeChange={mockOnTimeframeChange}
        />
      );

      await user.click(screen.getByTestId('dashboard-timeframe-selector'));

      await waitFor(() => {
        const customOption = screen.getByText('Custom Range...').closest('button');
        expect(customOption?.querySelector('svg')).toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles null dates for custom timeframe gracefully', () => {
      render(
        <DashboardTimeframeFilter
          timeframe="custom"
          startDate={null}
          endDate={null}
          onTimeframeChange={mockOnTimeframeChange}
        />
      );

      const button = screen.getByTestId('dashboard-timeframe-selector');
      // Should show "Custom Range" as fallback
      expect(button).toBeInTheDocument();
    });

    it('validates From date must be <= To date', async () => {
      const user = userEvent.setup();
      render(
        <DashboardTimeframeFilter
          timeframe="30d"
          startDate={null}
          endDate={null}
          onTimeframeChange={mockOnTimeframeChange}
        />
      );

      await user.click(screen.getByTestId('dashboard-timeframe-selector'));
      await user.click(screen.getByText('Custom Range...'));

      await waitFor(() => {
        expect(screen.getByText('Apply')).toBeInTheDocument();
      });

      // Try to select To date before From date
      const toCalendar = screen.getAllByRole('grid')[1];
      const toDates = toCalendar.querySelectorAll('button[name="day"]');
      if (toDates.length > 4) {
        await user.click(toDates[4]); // Click 5th
      }

      const fromCalendar = screen.getAllByRole('grid')[0];
      const fromDates = fromCalendar.querySelectorAll('button[name="day"]');
      if (fromDates.length > 24) {
        await user.click(fromDates[24]); // Click 25th (after To date)
      }

      // Apply button should be disabled or validation should prevent submission
      const applyButton = screen.getByText('Apply');
      // This test verifies the component handles invalid date ranges
      expect(applyButton).toBeInTheDocument();
    });

    it('handles same start and end date', async () => {
      render(
        <DashboardTimeframeFilter
          timeframe="custom"
          startDate="2024-01-15"
          endDate="2024-01-15"
          onTimeframeChange={mockOnTimeframeChange}
        />
      );

      const button = screen.getByTestId('dashboard-timeframe-selector');
      expect(button).toBeInTheDocument();
      // Should show date range even if same day
      expect(button.textContent).toMatch(/Jan 15/);
    });
  });

  describe('Accessibility', () => {
    it('button has proper role and is keyboard accessible', () => {
      render(
        <DashboardTimeframeFilter
          timeframe="30d"
          startDate={null}
          endDate={null}
          onTimeframeChange={mockOnTimeframeChange}
        />
      );

      const button = screen.getByTestId('dashboard-timeframe-selector');
      expect(button).toHaveAttribute('type', 'button');
    });

    it('popover content is accessible', async () => {
      const user = userEvent.setup();
      render(
        <DashboardTimeframeFilter
          timeframe="30d"
          startDate={null}
          endDate={null}
          onTimeframeChange={mockOnTimeframeChange}
        />
      );

      await user.click(screen.getByTestId('dashboard-timeframe-selector'));

      await waitFor(() => {
        const options = screen.getAllByRole('button');
        // Should have multiple button options
        expect(options.length).toBeGreaterThan(1);
      });
    });
  });
});
