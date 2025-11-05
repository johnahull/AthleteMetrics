import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Publish from '../publish';

// Mock useAuth hook
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'test-user', username: 'testuser', isSiteAdmin: true },
    isAuthenticated: true,
  }),
}));

// Mock useMetricConfig hook
vi.mock('@/hooks/use-metric-config', () => ({
  useMetricConfig: () => ({
    getMetricConfig: (code: string) => ({
      code,
      label: code === 'FLY10_TIME' ? 'Fly-10 Time' : code,
      unit: 's',
      category: 'Speed',
      displayOrder: 1,
    }),
  }),
}));

// Mock useAvailableMetrics hook
vi.mock('@/hooks/use-available-metrics', () => ({
  useAvailableMetrics: () => ({
    metrics: [
      { code: 'FLY10_TIME', label: 'Fly-10 Time', unit: 's', category: 'Speed' },
      { code: 'DASH_40YD', label: '40-Yard Dash', unit: 's', category: 'Speed' },
    ],
    isLoading: false,
  }),
}));

// Mock measurements with different dates
const mockMeasurementsWithDates = [
  {
    id: 'measurement-jan-1',
    value: '4.50',
    date: '2024-01-01',
    metric: 'DASH_40YD',
    user: {
      id: 'athlete-1',
      fullName: 'John Doe',
      birthYear: 2005,
      gender: 'Male',
      sports: ['Football'],
      teams: [{ id: 'team-1', name: 'Varsity Football' }],
    },
  },
  {
    id: 'measurement-jan-15',
    value: '4.60',
    date: '2024-01-15',
    metric: 'DASH_40YD',
    user: {
      id: 'athlete-2',
      fullName: 'Mike Smith',
      birthYear: 2004,
      gender: 'Male',
      sports: ['Track'],
      teams: [{ id: 'team-2', name: 'Track Team' }],
    },
  },
  {
    id: 'measurement-feb-1',
    value: '5.20',
    date: '2024-02-01',
    metric: 'DASH_40YD',
    user: {
      id: 'athlete-3',
      fullName: 'Jane Johnson',
      birthYear: 2006,
      gender: 'Female',
      sports: ['Soccer'],
      teams: [{ id: 'team-3', name: 'Soccer Team' }],
    },
  },
  {
    id: 'measurement-feb-14',
    value: '5.30',
    date: '2024-02-14',
    metric: 'DASH_40YD',
    user: {
      id: 'athlete-4',
      fullName: 'Sarah Williams',
      birthYear: 2005,
      gender: 'Female',
      sports: ['Basketball'],
      teams: [{ id: 'team-4', name: 'Basketball Team' }],
    },
  },
  {
    id: 'measurement-mar-1',
    value: '4.85',
    date: '2024-03-01',
    metric: 'DASH_40YD',
    user: {
      id: 'athlete-5',
      fullName: 'Alex Taylor',
      birthYear: 2004,
      gender: 'Male',
      sports: ['Baseball'],
      teams: [{ id: 'team-5', name: 'Baseball Team' }],
    },
  },
];

describe('Publish Page - Date Filter', () => {
  let queryClient: QueryClient;
  let fetchMock: any;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          queryFn: async ({ queryKey }) => {
            const url = typeof queryKey[0] === 'string' ? queryKey[0] : '';
            const response = await fetch(url);
            if (!response.ok) {
              throw new Error('Network response was not ok');
            }
            return response.json();
          },
        },
      },
    });

    vi.clearAllMocks();
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  const renderWithProviders = (component: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {component}
      </QueryClientProvider>
    );
  };

  const setupFetchMocks = (measurements: any[]) => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/teams')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: 'team-1', name: 'Varsity Football' },
            { id: 'team-2', name: 'Track Team' },
            { id: 'team-3', name: 'Soccer Team' },
          ],
        });
      }
      if (url.includes('/api/measurements')) {
        // Filter measurements based on date parameters in URL
        let filteredMeasurements = measurements;
        const urlObj = new URL(url, 'http://localhost');
        const dateFrom = urlObj.searchParams.get('dateFrom');
        const dateTo = urlObj.searchParams.get('dateTo');

        if (dateFrom || dateTo) {
          filteredMeasurements = measurements.filter((m: any) => {
            const measurementDate = new Date(m.date);

            if (dateFrom) {
              const fromDate = new Date(dateFrom);
              if (measurementDate < fromDate) return false;
            }

            if (dateTo) {
              const toDate = new Date(dateTo);
              if (measurementDate > toDate) return false;
            }

            return true;
          });
        }

        return Promise.resolve({
          ok: true,
          json: async () => filteredMeasurements,
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
  };

  const selectMetric = async () => {
    const metricSelect = screen.getByTestId('select-metric');
    fireEvent.click(metricSelect);
    const dashOption = await screen.findByRole('option', { name: '40-Yard Dash' });
    fireEvent.click(dashOption);

    await waitFor(() => {
      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();
    });
  };

  describe('Date Filter UI', () => {
    it('should render date from and date to input fields', async () => {
      setupFetchMocks(mockMeasurementsWithDates);
      renderWithProviders(<Publish />);

      const dateFromInput = screen.getByTestId('input-date-from');
      const dateToInput = screen.getByTestId('input-date-to');

      expect(dateFromInput).toBeInTheDocument();
      expect(dateToInput).toBeInTheDocument();
      expect(dateFromInput).toHaveAttribute('type', 'date');
      expect(dateToInput).toHaveAttribute('type', 'date');
    });

    it('should have min attribute set to 1970-01-01', async () => {
      setupFetchMocks(mockMeasurementsWithDates);
      renderWithProviders(<Publish />);

      const dateFromInput = screen.getByTestId('input-date-from');
      const dateToInput = screen.getByTestId('input-date-to');

      expect(dateFromInput).toHaveAttribute('min', '1970-01-01');
      expect(dateToInput).toHaveAttribute('min', '1970-01-01');
    });

    it('should default to empty date fields', async () => {
      setupFetchMocks(mockMeasurementsWithDates);
      renderWithProviders(<Publish />);

      const dateFromInput = screen.getByTestId('input-date-from') as HTMLInputElement;
      const dateToInput = screen.getByTestId('input-date-to') as HTMLInputElement;

      expect(dateFromInput.value).toBe('');
      expect(dateToInput.value).toBe('');
    });
  });

  describe('Date Filter Functionality', () => {
    it('should show all measurements when no date filters are set', async () => {
      setupFetchMocks(mockMeasurementsWithDates);
      renderWithProviders(<Publish />);

      await selectMetric();

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');
        // 1 header row + 5 measurement rows
        expect(rows.length).toBe(6);
      });

      // Verify all athletes are present
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Mike Smith')).toBeInTheDocument();
      expect(screen.getByText('Jane Johnson')).toBeInTheDocument();
      expect(screen.getByText('Sarah Williams')).toBeInTheDocument();
      expect(screen.getByText('Alex Taylor')).toBeInTheDocument();
    });

    it('should filter measurements from a specific date onwards (dateFrom)', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockMeasurementsWithDates);
      renderWithProviders(<Publish />);

      await selectMetric();

      // Set dateFrom to 2024-02-01
      const dateFromInput = screen.getByTestId('input-date-from');
      await user.clear(dateFromInput);
      await user.type(dateFromInput, '2024-02-01');

      // Wait for filtered results
      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');
        // 1 header row + 3 measurements (Feb 1, Feb 14, Mar 1)
        expect(rows.length).toBe(4);
      });

      // Verify only measurements from Feb 1 onwards are shown
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument(); // Jan 1
      expect(screen.queryByText('Mike Smith')).not.toBeInTheDocument(); // Jan 15
      expect(screen.getByText('Jane Johnson')).toBeInTheDocument(); // Feb 1
      expect(screen.getByText('Sarah Williams')).toBeInTheDocument(); // Feb 14
      expect(screen.getByText('Alex Taylor')).toBeInTheDocument(); // Mar 1
    });

    it('should filter measurements up to a specific date (dateTo)', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockMeasurementsWithDates);
      renderWithProviders(<Publish />);

      await selectMetric();

      // Set dateTo to 2024-02-14
      const dateToInput = screen.getByTestId('input-date-to');
      await user.clear(dateToInput);
      await user.type(dateToInput, '2024-02-14');

      // Wait for filtered results
      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');
        // 1 header row + 4 measurements (up to Feb 14)
        expect(rows.length).toBe(5);
      });

      // Verify only measurements up to Feb 14 are shown
      expect(screen.getByText('John Doe')).toBeInTheDocument(); // Jan 1
      expect(screen.getByText('Mike Smith')).toBeInTheDocument(); // Jan 15
      expect(screen.getByText('Jane Johnson')).toBeInTheDocument(); // Feb 1
      expect(screen.getByText('Sarah Williams')).toBeInTheDocument(); // Feb 14
      expect(screen.queryByText('Alex Taylor')).not.toBeInTheDocument(); // Mar 1
    });

    it('should filter measurements within a date range (dateFrom and dateTo)', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockMeasurementsWithDates);
      renderWithProviders(<Publish />);

      await selectMetric();

      // Set date range: 2024-01-15 to 2024-02-14
      const dateFromInput = screen.getByTestId('input-date-from');
      const dateToInput = screen.getByTestId('input-date-to');

      await user.clear(dateFromInput);
      await user.type(dateFromInput, '2024-01-15');

      await user.clear(dateToInput);
      await user.type(dateToInput, '2024-02-14');

      // Wait for filtered results
      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');
        // 1 header row + 3 measurements (Jan 15, Feb 1, Feb 14)
        expect(rows.length).toBe(4);
      });

      // Verify only measurements within range are shown
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument(); // Jan 1 (before range)
      expect(screen.getByText('Mike Smith')).toBeInTheDocument(); // Jan 15
      expect(screen.getByText('Jane Johnson')).toBeInTheDocument(); // Feb 1
      expect(screen.getByText('Sarah Williams')).toBeInTheDocument(); // Feb 14
      expect(screen.queryByText('Alex Taylor')).not.toBeInTheDocument(); // Mar 1 (after range)
    });

    it('should handle dates before the 2nd of the month correctly', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockMeasurementsWithDates);
      renderWithProviders(<Publish />);

      await selectMetric();

      // Test with January 1st (the date that was causing crashes)
      const dateFromInput = screen.getByTestId('input-date-from');
      await user.clear(dateFromInput);
      await user.type(dateFromInput, '2024-01-01');

      // Wait for filtered results - should not crash
      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');
        // Should show all measurements from Jan 1 onwards (all 5)
        expect(rows.length).toBe(6); // header + 5 measurements
      });

      // Verify all measurements are shown
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Mike Smith')).toBeInTheDocument();
      expect(screen.getByText('Jane Johnson')).toBeInTheDocument();
    });

    it('should handle dates on the 2nd of the month correctly', async () => {
      const user = userEvent.setup();
      setupFetchMocks([
        ...mockMeasurementsWithDates,
        {
          id: 'measurement-jan-2',
          value: '4.55',
          date: '2024-01-02',
          metric: 'DASH_40YD',
          user: {
            id: 'athlete-6',
            fullName: 'Bob Jones',
            birthYear: 2005,
            gender: 'Male',
            sports: ['Football'],
            teams: [{ id: 'team-1', name: 'Varsity Football' }],
          },
        },
      ]);
      renderWithProviders(<Publish />);

      await selectMetric();

      // Test with January 2nd
      const dateFromInput = screen.getByTestId('input-date-from');
      await user.clear(dateFromInput);
      await user.type(dateFromInput, '2024-01-02');

      // Wait for filtered results
      await waitFor(() => {
        const table = screen.getByRole('table');
        expect(table).toBeInTheDocument();
      });

      // Verify measurements from Jan 2 onwards are shown
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument(); // Jan 1
      expect(screen.getByText('Bob Jones')).toBeInTheDocument(); // Jan 2
      expect(screen.getByText('Mike Smith')).toBeInTheDocument(); // Jan 15
    });

    it('should send correct ISO datetime parameters to API', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockMeasurementsWithDates);
      renderWithProviders(<Publish />);

      await selectMetric();

      // Set date range
      const dateFromInput = screen.getByTestId('input-date-from');
      const dateToInput = screen.getByTestId('input-date-to');

      await user.clear(dateFromInput);
      await user.type(dateFromInput, '2024-01-01');

      await user.clear(dateToInput);
      await user.type(dateToInput, '2024-02-01');

      await waitFor(() => {
        // Check that fetch was called with ISO datetime parameters
        const calls = fetchMock.mock.calls;
        const measurementCalls = calls.filter((call: any) =>
          call[0].includes('/api/measurements')
        );

        // Find the call with date parameters
        const callWithDates = measurementCalls.find((call: any) => {
          const url = call[0];
          return url.includes('dateFrom=') && url.includes('dateTo=');
        });

        expect(callWithDates).toBeTruthy();

        // Verify ISO datetime format (contains 'T' and 'Z')
        const url = callWithDates[0];
        const urlObj = new URL(url, 'http://localhost');
        const dateFrom = urlObj.searchParams.get('dateFrom');
        const dateTo = urlObj.searchParams.get('dateTo');

        // Should be ISO datetime format (e.g., 2024-01-01T00:00:00.000Z)
        expect(dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        expect(dateTo).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      });
    });

    it('should set dateFrom to start of day (00:00:00.000Z)', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockMeasurementsWithDates);
      renderWithProviders(<Publish />);

      await selectMetric();

      const dateFromInput = screen.getByTestId('input-date-from');
      await user.clear(dateFromInput);
      await user.type(dateFromInput, '2024-01-15');

      await waitFor(() => {
        const calls = fetchMock.mock.calls;
        const callWithDate = calls.find((call: any) =>
          call[0].includes('dateFrom=2024-01-15T00:00:00.000Z')
        );
        expect(callWithDate).toBeTruthy();
      });
    });

    it('should set dateTo to end of day (23:59:59.999Z)', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockMeasurementsWithDates);
      renderWithProviders(<Publish />);

      await selectMetric();

      const dateToInput = screen.getByTestId('input-date-to');
      await user.clear(dateToInput);
      await user.type(dateToInput, '2024-02-01');

      await waitFor(() => {
        const calls = fetchMock.mock.calls;
        const callWithDate = calls.find((call: any) =>
          call[0].includes('dateTo=2024-02-01T23:59:59.999Z')
        );
        expect(callWithDate).toBeTruthy();
      });
    });
  });

  describe('Date Filter Integration with Reset', () => {
    it('should reset date filters when Reset Filters is clicked', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockMeasurementsWithDates);
      renderWithProviders(<Publish />);

      await selectMetric();

      // Set date filters
      const dateFromInput = screen.getByTestId('input-date-from') as HTMLInputElement;
      const dateToInput = screen.getByTestId('input-date-to') as HTMLInputElement;

      await user.clear(dateFromInput);
      await user.type(dateFromInput, '2024-01-15');

      await user.clear(dateToInput);
      await user.type(dateToInput, '2024-02-14');

      // Verify dates are set
      expect(dateFromInput.value).toBe('2024-01-15');
      expect(dateToInput.value).toBe('2024-02-14');

      // Click Reset Filters button
      const resetButton = screen.getByTestId('reset-filters-button');
      fireEvent.click(resetButton);

      // Date filters should be reset to empty
      await waitFor(() => {
        expect(dateFromInput.value).toBe('');
        expect(dateToInput.value).toBe('');
      });
    });
  });

  describe('Date Filter Edge Cases', () => {
    it('should handle leap year dates correctly', async () => {
      const user = userEvent.setup();
      const leapYearMeasurements = [
        {
          id: 'measurement-leap',
          value: '4.50',
          date: '2024-02-29', // Leap year date
          metric: 'DASH_40YD',
          user: {
            id: 'athlete-1',
            fullName: 'Leap Year Athlete',
            birthYear: 2005,
            gender: 'Male',
            sports: ['Football'],
            teams: [{ id: 'team-1', name: 'Varsity Football' }],
          },
        },
      ];

      setupFetchMocks(leapYearMeasurements);
      renderWithProviders(<Publish />);

      await selectMetric();

      // Set dateFrom to leap year date
      const dateFromInput = screen.getByTestId('input-date-from');
      await user.clear(dateFromInput);
      await user.type(dateFromInput, '2024-02-29');

      // Should not crash and should filter correctly
      await waitFor(() => {
        expect(screen.getByText('Leap Year Athlete')).toBeInTheDocument();
      });
    });

    it('should handle single-day date range correctly', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockMeasurementsWithDates);
      renderWithProviders(<Publish />);

      await selectMetric();

      // Set both dates to the same day
      const dateFromInput = screen.getByTestId('input-date-from');
      const dateToInput = screen.getByTestId('input-date-to');

      await user.clear(dateFromInput);
      await user.type(dateFromInput, '2024-02-01');

      await user.clear(dateToInput);
      await user.type(dateToInput, '2024-02-01');

      // Should show only measurements from Feb 1
      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');
        // 1 header row + 1 measurement (Feb 1)
        expect(rows.length).toBe(2);
      });

      expect(screen.getByText('Jane Johnson')).toBeInTheDocument(); // Feb 1
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument(); // Jan 1
      expect(screen.queryByText('Sarah Williams')).not.toBeInTheDocument(); // Feb 14
    });
  });
});
