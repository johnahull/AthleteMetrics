/**
 * TDD Tests for Individual Reports feature in EventReportsTab
 *
 * Tests the dialog for selecting athletes and generating individual reports
 * with event percentiles and AI insights options.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EventReportsTab } from '../EventReportsTab';

// Polyfill for happy-dom (Radix UI components)
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

// Mock registration data with measurements info
const mockRegistrations = [
  {
    id: 'reg-1',
    eventId: 'event-123',
    userId: 'user-1',
    status: 'checked_in',
    userFullNameSnapshot: 'John Smith',
    registrationNumber: 1,
    checkedInAt: new Date('2025-01-15T09:00:00'),
    measurements: [{ metric: 'FLY10_TIME' }, { metric: 'VERTICAL_JUMP' }],
  },
  {
    id: 'reg-2',
    eventId: 'event-123',
    userId: 'user-2',
    status: 'approved',
    userFullNameSnapshot: 'Maria Garcia',
    registrationNumber: 2,
    checkedInAt: null,
    measurements: [{ metric: 'FLY10_TIME' }],
  },
  {
    id: 'reg-3',
    eventId: 'event-123',
    userId: 'user-3',
    status: 'approved',
    userFullNameSnapshot: 'Tyler Johnson',
    registrationNumber: 3,
    checkedInAt: null,
    measurements: [], // No measurements
  },
];

// Mock mutations
const mockCreateReportMutation = {
  mutateAsync: vi.fn(),
  isPending: false,
};

const mockQuickReportMutation = {
  mutateAsync: vi.fn(),
  isPending: false,
};

const mockExportPDFMutation = {
  mutateAsync: vi.fn(),
  isPending: false,
};

// Mock events-api module
vi.mock('@/lib/events-api', () => ({
  useEventReports: vi.fn(() => ({
    data: [],
    isLoading: false,
    error: null,
  })),
  useEventRegistrations: vi.fn(() => ({
    data: mockRegistrations,
    isLoading: false,
    error: null,
  })),
  useCreateEventReport: vi.fn(() => mockCreateReportMutation),
  useGenerateQuickEventReport: vi.fn(() => mockQuickReportMutation),
  useExportEventReportPDF: vi.fn(() => mockExportPDFMutation),
}));

// Create wrapper with providers
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

describe('EventReportsTab - Individual Reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateReportMutation.mutateAsync.mockClear();
    mockCreateReportMutation.isPending = false;
  });

  describe('Individual Reports Dialog', () => {
    it('should open dialog when Individual button is clicked', async () => {
      render(
        <EventReportsTab
          eventId="event-123"
          eventName="Spring Combine 2025"
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();
      const individualButton = screen.getByText(/individual/i).closest('button');
      expect(individualButton).toBeTruthy();

      await user.click(individualButton!);

      // Dialog should be open
      expect(screen.getByText(/create individual reports/i)).toBeInTheDocument();
    });

    it('should display list of athletes from registrations', async () => {
      render(
        <EventReportsTab
          eventId="event-123"
          eventName="Spring Combine 2025"
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();
      const individualButton = screen.getByText(/individual/i).closest('button');
      await user.click(individualButton!);

      // Should show athletes from registrations
      await waitFor(() => {
        expect(screen.getByText('John Smith')).toBeInTheDocument();
        expect(screen.getByText('Maria Garcia')).toBeInTheDocument();
        expect(screen.getByText('Tyler Johnson')).toBeInTheDocument();
      });
    });

    it('should show all eligible athletes in the list', async () => {
      render(
        <EventReportsTab
          eventId="event-123"
          eventName="Spring Combine 2025"
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();
      const individualButton = screen.getByText(/individual/i).closest('button');
      await user.click(individualButton!);

      // All athletes should be shown including those without measurements
      await waitFor(() => {
        expect(screen.getByText('John Smith')).toBeInTheDocument();
        expect(screen.getByText('Maria Garcia')).toBeInTheDocument();
        expect(screen.getByText('Tyler Johnson')).toBeInTheDocument();
      });
    });

    it('should allow selecting multiple athletes', async () => {
      render(
        <EventReportsTab
          eventId="event-123"
          eventName="Spring Combine 2025"
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();
      const individualButton = screen.getByText(/individual/i).closest('button');
      await user.click(individualButton!);

      await waitFor(() => {
        expect(screen.getByText('John Smith')).toBeInTheDocument();
      });

      // Find and click athlete checkboxes by label (skip Select All)
      const johnCheckbox = screen.getByLabelText(/Remove John Smith/i);
      const mariaCheckbox = screen.getByLabelText(/Remove Maria Garcia/i);
      await user.click(johnCheckbox);
      await user.click(mariaCheckbox);

      // Should show selection count
      expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
    });

    it('should have select all option', async () => {
      render(
        <EventReportsTab
          eventId="event-123"
          eventName="Spring Combine 2025"
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();
      const individualButton = screen.getByText(/individual/i).closest('button');
      await user.click(individualButton!);

      await waitFor(() => {
        expect(screen.getByText(/select all/i)).toBeInTheDocument();
      });

      // Click select all
      const selectAllCheckbox = screen.getByLabelText(/select all/i);
      await user.click(selectAllCheckbox);

      // All 3 should be selected
      expect(screen.getByText(/3 selected/i)).toBeInTheDocument();
    });

    it('should toggle event percentiles option', async () => {
      render(
        <EventReportsTab
          eventId="event-123"
          eventName="Spring Combine 2025"
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();
      const individualButton = screen.getByText(/individual/i).closest('button');
      await user.click(individualButton!);

      // Wait for dialog content to render (athletes list)
      await waitFor(() => {
        expect(screen.getByText('John Smith')).toBeInTheDocument();
      });

      // Find and toggle the option
      const percentileCheckbox = screen.getByRole('checkbox', { name: /event percentiles/i });
      expect(percentileCheckbox).toBeChecked(); // Default on

      await user.click(percentileCheckbox);
      expect(percentileCheckbox).not.toBeChecked();
    });

    it('should toggle AI insights option', async () => {
      render(
        <EventReportsTab
          eventId="event-123"
          eventName="Spring Combine 2025"
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();
      const individualButton = screen.getByText(/individual/i).closest('button');
      await user.click(individualButton!);

      // Wait for dialog content to render (athletes list)
      await waitFor(() => {
        expect(screen.getByText('John Smith')).toBeInTheDocument();
      });

      // Find and toggle the option
      const aiCheckbox = screen.getByRole('checkbox', { name: /ai.*insights/i });
      await user.click(aiCheckbox);
      expect(aiCheckbox).toBeChecked();
    });
  });

  describe('Report Generation', () => {
    it('should call createEventReport API for each selected athlete', async () => {
      mockCreateReportMutation.mutateAsync.mockResolvedValue({
        id: 'report-new',
        name: 'Individual Report',
      });

      render(
        <EventReportsTab
          eventId="event-123"
          eventName="Spring Combine 2025"
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();
      const individualButton = screen.getByText(/individual/i).closest('button');
      await user.click(individualButton!);

      await waitFor(() => {
        expect(screen.getByText('John Smith')).toBeInTheDocument();
      });

      // Select athletes by their labels
      const johnCheckbox = screen.getByLabelText(/Remove John Smith/i);
      const mariaCheckbox = screen.getByLabelText(/Remove Maria Garcia/i);
      await user.click(johnCheckbox);
      await user.click(mariaCheckbox);

      // Click generate button
      const generateButton = screen.getByRole('button', { name: /generate.*report/i });
      await user.click(generateButton);

      await waitFor(() => {
        expect(mockCreateReportMutation.mutateAsync).toHaveBeenCalledWith({
          eventId: 'event-123',
          data: expect.objectContaining({
            reportType: 'individual',
            athleteIds: expect.arrayContaining(['user-1', 'user-2']),
            includeEventPercentiles: true,
          }),
        });
      });
    });

    it('should disable generate button when no athletes selected', async () => {
      render(
        <EventReportsTab
          eventId="event-123"
          eventName="Spring Combine 2025"
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();
      const individualButton = screen.getByText(/individual/i).closest('button');
      await user.click(individualButton!);

      await waitFor(() => {
        expect(screen.getByText('John Smith')).toBeInTheDocument();
      });

      // Generate button should be disabled
      const generateButton = screen.getByRole('button', { name: /generate.*report/i });
      expect(generateButton).toBeDisabled();
    });

    it('should close dialog after successful report generation', async () => {
      mockCreateReportMutation.mutateAsync.mockResolvedValue({
        id: 'report-new',
        name: 'Individual Report',
      });

      render(
        <EventReportsTab
          eventId="event-123"
          eventName="Spring Combine 2025"
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();
      const individualButton = screen.getByText(/individual/i).closest('button');
      await user.click(individualButton!);

      await waitFor(() => {
        expect(screen.getByText('John Smith')).toBeInTheDocument();
      });

      // Select an athlete by label
      const johnCheckbox = screen.getByLabelText(/Remove John Smith/i);
      await user.click(johnCheckbox);

      // Click generate button
      const generateButton = screen.getByRole('button', { name: /generate.*report/i });
      await user.click(generateButton);

      // Dialog should close
      await waitFor(() => {
        expect(screen.queryByText(/create individual reports/i)).not.toBeInTheDocument();
      });
    });

    it('should show loading state during generation', async () => {
      mockCreateReportMutation.isPending = true;

      render(
        <EventReportsTab
          eventId="event-123"
          eventName="Spring Combine 2025"
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();
      const individualButton = screen.getByText(/individual/i).closest('button');
      await user.click(individualButton!);

      await waitFor(() => {
        expect(screen.getByText('John Smith')).toBeInTheDocument();
      });

      // Select an athlete by label
      const johnCheckbox = screen.getByLabelText(/Remove John Smith/i);
      await user.click(johnCheckbox);

      // Button should show loading
      expect(screen.getByRole('button', { name: /generating/i })).toBeInTheDocument();
    });
  });

  describe('Cancel Action', () => {
    it('should close dialog when cancel clicked', async () => {
      render(
        <EventReportsTab
          eventId="event-123"
          eventName="Spring Combine 2025"
        />,
        { wrapper: createWrapper() }
      );

      const user = userEvent.setup();
      const individualButton = screen.getByText(/individual/i).closest('button');
      await user.click(individualButton!);

      await waitFor(() => {
        expect(screen.getByText(/create individual reports/i)).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(screen.queryByText(/create individual reports/i)).not.toBeInTheDocument();
    });
  });
});
