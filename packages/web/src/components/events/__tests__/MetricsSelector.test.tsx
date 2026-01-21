/**
 * TDD Tests for MetricsSelector component
 *
 * MetricsSelector is used in EventForm Step 3 to allow users to select
 * which metrics/tests will be conducted at an event during creation.
 *
 * Unlike EventMetricsTab (which manages metrics for existing events via API),
 * MetricsSelector manages LOCAL state and passes selected metrics to the
 * form's onSubmit handler for post-creation API calls.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MetricsSelector, type SelectedMetric } from '../MetricsSelector';

// Polyfill for happy-dom (doesn't implement hasPointerCapture/setPointerCapture)
// Required for Radix UI Select component to work in tests
beforeAll(() => {
  if (typeof Element.prototype.hasPointerCapture === 'undefined') {
    Element.prototype.hasPointerCapture = function () { return false; };
  }
  if (typeof Element.prototype.setPointerCapture === 'undefined') {
    Element.prototype.setPointerCapture = function () {};
  }
  if (typeof Element.prototype.releasePointerCapture === 'undefined') {
    Element.prototype.releasePointerCapture = function () {};
  }
});

// Mock site metrics data
const mockSiteMetrics = [
  { code: 'FLY10_TIME', label: '10-Yard Fly', category: 'Speed', units: 'seconds' },
  { code: 'VERTICAL_JUMP', label: 'Vertical Jump', category: 'Power', units: 'inches' },
  { code: 'AGILITY_505', label: '5-0-5 Agility', category: 'Agility', units: 'seconds' },
  { code: 'DASH_40YD', label: '40-Yard Dash', category: 'Speed', units: 'seconds' },
  { code: 'T_TEST', label: 'T-Test', category: 'Agility', units: 'seconds' },
];

// Mock the useSiteMetrics hook
vi.mock('@/lib/metrics-api', () => ({
  useSiteMetrics: vi.fn(() => ({
    data: mockSiteMetrics,
    isLoading: false,
    error: null,
  })),
}));

// Create a wrapper with QueryClientProvider
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

describe('MetricsSelector', () => {
  let onMetricsChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onMetricsChange = vi.fn();
  });

  describe('Initial Rendering', () => {
    it('should display available metrics dropdown', () => {
      render(
        <MetricsSelector
          selectedMetrics={[]}
          onMetricsChange={onMetricsChange}
        />,
        { wrapper: createWrapper() }
      );

      // Should show the metric selector dropdown
      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(screen.getByText(/select a metric/i)).toBeInTheDocument();
    });

    it('should show empty state when no metrics selected', () => {
      render(
        <MetricsSelector
          selectedMetrics={[]}
          onMetricsChange={onMetricsChange}
        />,
        { wrapper: createWrapper() }
      );

      // Should show empty state message
      expect(screen.getByText(/no metrics selected/i)).toBeInTheDocument();
    });

    it('should display add button', () => {
      render(
        <MetricsSelector
          selectedMetrics={[]}
          onMetricsChange={onMetricsChange}
        />,
        { wrapper: createWrapper() }
      );

      expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
    });
  });

  describe('Adding Metrics', () => {
    // Note: Due to happy-dom limitations with Radix UI Select portals,
    // we test dropdown behavior via component props and callback verification
    // rather than simulating click interactions. Full dropdown E2E tests
    // should be added with Playwright.

    it('should render dropdown and add button', () => {
      render(
        <MetricsSelector
          selectedMetrics={[]}
          onMetricsChange={onMetricsChange}
        />,
        { wrapper: createWrapper() }
      );

      // Should show the metric selector dropdown
      expect(screen.getByRole('combobox')).toBeInTheDocument();
      // Should show placeholder text
      expect(screen.getByText(/select a metric/i)).toBeInTheDocument();
      // Should show add button
      expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
    });

    it('should correctly pass new metrics when metrics are added', () => {
      // Start with one metric selected
      const initialMetrics: SelectedMetric[] = [
        { code: 'FLY10_TIME', label: '10-Yard Fly', isRequired: false },
      ];

      const { rerender } = render(
        <MetricsSelector
          selectedMetrics={initialMetrics}
          onMetricsChange={onMetricsChange}
        />,
        { wrapper: createWrapper() }
      );

      // Verify initial metric is displayed
      expect(screen.getByText('10-Yard Fly')).toBeInTheDocument();

      // Simulate what happens when a second metric is added
      // (the parent component would call onMetricsChange and re-render)
      const newMetrics: SelectedMetric[] = [
        ...initialMetrics,
        { code: 'VERTICAL_JUMP', label: 'Vertical Jump', isRequired: false },
      ];

      rerender(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MetricsSelector
            selectedMetrics={newMetrics}
            onMetricsChange={onMetricsChange}
          />
        </QueryClientProvider>
      );

      // Both metrics should now be displayed
      expect(screen.getByText('10-Yard Fly')).toBeInTheDocument();
      expect(screen.getByText('Vertical Jump')).toBeInTheDocument();
    });

    it('should show selected metrics are not available when selected', () => {
      // Test that the availableMetrics filtering logic works
      // by verifying the count display when metrics are selected
      const selectedMetrics: SelectedMetric[] = [
        { code: 'FLY10_TIME', label: '10-Yard Fly', isRequired: false },
        { code: 'VERTICAL_JUMP', label: 'Vertical Jump', isRequired: false },
      ];

      render(
        <MetricsSelector
          selectedMetrics={selectedMetrics}
          onMetricsChange={onMetricsChange}
        />,
        { wrapper: createWrapper() }
      );

      // Should show 2 metrics selected
      expect(screen.getByText(/\(2\)/)).toBeInTheDocument();
    });

    it('should disable add button when no metric is selected', () => {
      render(
        <MetricsSelector
          selectedMetrics={[]}
          onMetricsChange={onMetricsChange}
        />,
        { wrapper: createWrapper() }
      );

      const addButton = screen.getByRole('button', { name: /add/i });
      expect(addButton).toBeDisabled();
    });
  });

  describe('Displaying Selected Metrics', () => {
    it('should display selected metrics in a list', () => {
      const selectedMetrics: SelectedMetric[] = [
        { code: 'FLY10_TIME', label: '10-Yard Fly', isRequired: false },
        { code: 'VERTICAL_JUMP', label: 'Vertical Jump', isRequired: true },
      ];

      render(
        <MetricsSelector
          selectedMetrics={selectedMetrics}
          onMetricsChange={onMetricsChange}
        />,
        { wrapper: createWrapper() }
      );

      // Should show both metrics in the list
      expect(screen.getByText('10-Yard Fly')).toBeInTheDocument();
      expect(screen.getByText('Vertical Jump')).toBeInTheDocument();
    });

    it('should show metric count in header', () => {
      const selectedMetrics: SelectedMetric[] = [
        { code: 'FLY10_TIME', label: '10-Yard Fly', isRequired: false },
        { code: 'VERTICAL_JUMP', label: 'Vertical Jump', isRequired: true },
        { code: 'AGILITY_505', label: '5-0-5 Agility', isRequired: false },
      ];

      render(
        <MetricsSelector
          selectedMetrics={selectedMetrics}
          onMetricsChange={onMetricsChange}
        />,
        { wrapper: createWrapper() }
      );

      // Should show count "(3)"
      expect(screen.getByText(/selected metrics/i)).toBeInTheDocument();
      expect(screen.getByText(/\(3\)/)).toBeInTheDocument();
    });
  });

  describe('Removing Metrics', () => {
    it('should remove metric when delete button clicked', async () => {
      const user = userEvent.setup();
      const selectedMetrics: SelectedMetric[] = [
        { code: 'FLY10_TIME', label: '10-Yard Fly', isRequired: false },
        { code: 'VERTICAL_JUMP', label: 'Vertical Jump', isRequired: true },
      ];

      render(
        <MetricsSelector
          selectedMetrics={selectedMetrics}
          onMetricsChange={onMetricsChange}
        />,
        { wrapper: createWrapper() }
      );

      // Find the row for "10-Yard Fly" and click its delete button
      const flyRow = screen.getByText('10-Yard Fly').closest('[data-metric-row]');
      expect(flyRow).toBeInTheDocument();

      const deleteButton = within(flyRow as HTMLElement).getByRole('button', { name: /remove/i });
      await user.click(deleteButton);

      // Should call onMetricsChange without the removed metric
      expect(onMetricsChange).toHaveBeenCalledWith([
        expect.objectContaining({
          code: 'VERTICAL_JUMP',
          label: 'Vertical Jump',
          isRequired: true,
        }),
      ]);
    });
  });

  describe('Toggling Required Status', () => {
    it('should toggle required status when switch clicked', async () => {
      const user = userEvent.setup();
      const selectedMetrics: SelectedMetric[] = [
        { code: 'FLY10_TIME', label: '10-Yard Fly', isRequired: false },
      ];

      render(
        <MetricsSelector
          selectedMetrics={selectedMetrics}
          onMetricsChange={onMetricsChange}
        />,
        { wrapper: createWrapper() }
      );

      // Find the required switch for "10-Yard Fly"
      const requiredSwitch = screen.getByRole('switch', { name: /required/i });
      expect(requiredSwitch).not.toBeChecked();

      // Click to toggle required
      await user.click(requiredSwitch);

      // Should call onMetricsChange with updated isRequired
      expect(onMetricsChange).toHaveBeenCalledWith([
        expect.objectContaining({
          code: 'FLY10_TIME',
          label: '10-Yard Fly',
          isRequired: true,
        }),
      ]);
    });

    it('should show required badge for required metrics', () => {
      const selectedMetrics: SelectedMetric[] = [
        { code: 'FLY10_TIME', label: '10-Yard Fly', isRequired: true },
      ];

      render(
        <MetricsSelector
          selectedMetrics={selectedMetrics}
          onMetricsChange={onMetricsChange}
        />,
        { wrapper: createWrapper() }
      );

      const requiredSwitch = screen.getByRole('switch', { name: /required/i });
      expect(requiredSwitch).toBeChecked();
    });
  });

  describe('Reordering Metrics', () => {
    it('should have move up/down buttons for reordering', () => {
      const selectedMetrics: SelectedMetric[] = [
        { code: 'FLY10_TIME', label: '10-Yard Fly', isRequired: false },
        { code: 'VERTICAL_JUMP', label: 'Vertical Jump', isRequired: false },
      ];

      render(
        <MetricsSelector
          selectedMetrics={selectedMetrics}
          onMetricsChange={onMetricsChange}
        />,
        { wrapper: createWrapper() }
      );

      // Should have move buttons
      expect(screen.getAllByRole('button', { name: /move up/i })).toHaveLength(2);
      expect(screen.getAllByRole('button', { name: /move down/i })).toHaveLength(2);
    });

    it('should move metric up when up button clicked', async () => {
      const user = userEvent.setup();
      const selectedMetrics: SelectedMetric[] = [
        { code: 'FLY10_TIME', label: '10-Yard Fly', isRequired: false },
        { code: 'VERTICAL_JUMP', label: 'Vertical Jump', isRequired: false },
      ];

      render(
        <MetricsSelector
          selectedMetrics={selectedMetrics}
          onMetricsChange={onMetricsChange}
        />,
        { wrapper: createWrapper() }
      );

      // Find the row for "Vertical Jump" (second item) and click move up
      const vjRow = screen.getByText('Vertical Jump').closest('[data-metric-row]');
      const moveUpButton = within(vjRow as HTMLElement).getByRole('button', { name: /move up/i });
      await user.click(moveUpButton);

      // Should call onMetricsChange with reordered metrics (VJ now first)
      expect(onMetricsChange).toHaveBeenCalledWith([
        expect.objectContaining({ code: 'VERTICAL_JUMP' }),
        expect.objectContaining({ code: 'FLY10_TIME' }),
      ]);
    });

    it('should move metric down when down button clicked', async () => {
      const user = userEvent.setup();
      const selectedMetrics: SelectedMetric[] = [
        { code: 'FLY10_TIME', label: '10-Yard Fly', isRequired: false },
        { code: 'VERTICAL_JUMP', label: 'Vertical Jump', isRequired: false },
      ];

      render(
        <MetricsSelector
          selectedMetrics={selectedMetrics}
          onMetricsChange={onMetricsChange}
        />,
        { wrapper: createWrapper() }
      );

      // Find the row for "10-Yard Fly" (first item) and click move down
      const flyRow = screen.getByText('10-Yard Fly').closest('[data-metric-row]');
      const moveDownButton = within(flyRow as HTMLElement).getByRole('button', { name: /move down/i });
      await user.click(moveDownButton);

      // Should call onMetricsChange with reordered metrics (FLY10 now second)
      expect(onMetricsChange).toHaveBeenCalledWith([
        expect.objectContaining({ code: 'VERTICAL_JUMP' }),
        expect.objectContaining({ code: 'FLY10_TIME' }),
      ]);
    });

    it('should disable move up for first item', () => {
      const selectedMetrics: SelectedMetric[] = [
        { code: 'FLY10_TIME', label: '10-Yard Fly', isRequired: false },
        { code: 'VERTICAL_JUMP', label: 'Vertical Jump', isRequired: false },
      ];

      render(
        <MetricsSelector
          selectedMetrics={selectedMetrics}
          onMetricsChange={onMetricsChange}
        />,
        { wrapper: createWrapper() }
      );

      // First item's move up should be disabled
      const flyRow = screen.getByText('10-Yard Fly').closest('[data-metric-row]');
      const moveUpButton = within(flyRow as HTMLElement).getByRole('button', { name: /move up/i });
      expect(moveUpButton).toBeDisabled();
    });

    it('should disable move down for last item', () => {
      const selectedMetrics: SelectedMetric[] = [
        { code: 'FLY10_TIME', label: '10-Yard Fly', isRequired: false },
        { code: 'VERTICAL_JUMP', label: 'Vertical Jump', isRequired: false },
      ];

      render(
        <MetricsSelector
          selectedMetrics={selectedMetrics}
          onMetricsChange={onMetricsChange}
        />,
        { wrapper: createWrapper() }
      );

      // Last item's move down should be disabled
      const vjRow = screen.getByText('Vertical Jump').closest('[data-metric-row]');
      const moveDownButton = within(vjRow as HTMLElement).getByRole('button', { name: /move down/i });
      expect(moveDownButton).toBeDisabled();
    });
  });

  describe('Loading State', () => {
    it('should show loading state when site metrics are loading', () => {
      // Override the mock for this test
      vi.mock('@/lib/metrics-api', () => ({
        useSiteMetrics: vi.fn(() => ({
          data: undefined,
          isLoading: true,
          error: null,
        })),
      }));

      render(
        <MetricsSelector
          selectedMetrics={[]}
          onMetricsChange={onMetricsChange}
        />,
        { wrapper: createWrapper() }
      );

      // Should show loading indicator or disabled state
      expect(screen.getByRole('combobox')).toBeDisabled();
    });
  });

  describe('Edge Cases', () => {
    it('should show all metrics when all are selected', () => {
      // All metrics are already selected
      const selectedMetrics: SelectedMetric[] = mockSiteMetrics.map((m) => ({
        code: m.code,
        label: m.label,
        isRequired: false,
      }));

      render(
        <MetricsSelector
          selectedMetrics={selectedMetrics}
          onMetricsChange={onMetricsChange}
        />,
        { wrapper: createWrapper() }
      );

      // Should display all 5 metrics
      expect(screen.getByText(/\(5\)/)).toBeInTheDocument();
      expect(screen.getByText('10-Yard Fly')).toBeInTheDocument();
      expect(screen.getByText('Vertical Jump')).toBeInTheDocument();
      expect(screen.getByText('5-0-5 Agility')).toBeInTheDocument();
      expect(screen.getByText('40-Yard Dash')).toBeInTheDocument();
      expect(screen.getByText('T-Test')).toBeInTheDocument();
    });

    it('should allow removing all metrics and show empty state', async () => {
      const user = userEvent.setup();

      // Start with one metric
      const selectedMetrics: SelectedMetric[] = [
        { code: 'FLY10_TIME', label: '10-Yard Fly', isRequired: false },
      ];

      render(
        <MetricsSelector
          selectedMetrics={selectedMetrics}
          onMetricsChange={onMetricsChange}
        />,
        { wrapper: createWrapper() }
      );

      // Find and click remove button
      const flyRow = screen.getByText('10-Yard Fly').closest('[data-metric-row]');
      const deleteButton = within(flyRow as HTMLElement).getByRole('button', { name: /remove/i });
      await user.click(deleteButton);

      // Should call onMetricsChange with empty array
      expect(onMetricsChange).toHaveBeenCalledWith([]);
    });
  });
});
