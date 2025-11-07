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

// Mock measurements with different genders
const mockMeasurementsWithGender = [
  {
    id: 'measurement-male-1',
    value: '4.50',
    date: '2024-03-15',
    metric: 'DASH_40YD',
    user: {
      id: 'athlete-male-1',
      fullName: 'John Doe',
      birthYear: 2005,
      gender: 'Male',
      sports: ['Football'],
      teams: [{ id: 'team-1', name: 'Varsity Football' }],
    },
  },
  {
    id: 'measurement-male-2',
    value: '4.60',
    date: '2024-02-10',
    metric: 'DASH_40YD',
    user: {
      id: 'athlete-male-2',
      fullName: 'Mike Smith',
      birthYear: 2004,
      gender: 'Male',
      sports: ['Track'],
      teams: [{ id: 'team-2', name: 'Track Team' }],
    },
  },
  {
    id: 'measurement-female-1',
    value: '5.20',
    date: '2024-04-20',
    metric: 'DASH_40YD',
    user: {
      id: 'athlete-female-1',
      fullName: 'Jane Johnson',
      birthYear: 2006,
      gender: 'Female',
      sports: ['Soccer'],
      teams: [{ id: 'team-3', name: 'Soccer Team' }],
    },
  },
  {
    id: 'measurement-female-2',
    value: '5.30',
    date: '2024-01-05',
    metric: 'DASH_40YD',
    user: {
      id: 'athlete-female-2',
      fullName: 'Sarah Williams',
      birthYear: 2005,
      gender: 'Female',
      sports: ['Basketball'],
      teams: [{ id: 'team-4', name: 'Basketball Team' }],
    },
  },
  {
    id: 'measurement-notspecified-1',
    value: '4.85',
    date: '2024-05-12',
    metric: 'DASH_40YD',
    user: {
      id: 'athlete-notspecified-1',
      fullName: 'Alex Taylor',
      birthYear: 2004,
      gender: 'Not Specified',
      sports: ['Baseball'],
      teams: [{ id: 'team-5', name: 'Baseball Team' }],
    },
  },
];

describe('Publish Page - Gender Filter', () => {
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

  const setupFetchMocks = (measurements: any[], genderFilter?: string) => {
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
        // Filter measurements based on gender parameter in URL
        let filteredMeasurements = measurements;
        if (url.includes('gender=')) {
          const urlObj = new URL(url, 'http://localhost');
          const gender = urlObj.searchParams.get('gender');
          if (gender && gender !== 'all') {
            filteredMeasurements = measurements.filter((m: any) => m.user.gender === gender);
          }
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

  describe('Gender Filter UI', () => {
    it('should render gender filter dropdown with correct options', async () => {
      setupFetchMocks(mockMeasurementsWithGender);
      renderWithProviders(<Publish />);

      const genderSelect = screen.getByTestId('select-gender');
      expect(genderSelect).toBeInTheDocument();

      // Click to open dropdown
      fireEvent.click(genderSelect);

      // Verify all gender options are present
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'All Genders' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Male' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Female' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Not Specified' })).toBeInTheDocument();
      });
    });

    it('should default to "All Genders"', async () => {
      setupFetchMocks(mockMeasurementsWithGender);
      renderWithProviders(<Publish />);

      const genderSelect = screen.getByTestId('select-gender');
      expect(genderSelect).toHaveTextContent('All Genders');
    });
  });

  describe('Gender Filter Functionality', () => {
    it('should show all measurements when "All Genders" is selected', async () => {
      setupFetchMocks(mockMeasurementsWithGender);
      renderWithProviders(<Publish />);

      await selectMetric();

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');
        // 1 header row + 5 measurement rows
        expect(rows.length).toBe(6);
      });

      // Verify all genders are present
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Johnson')).toBeInTheDocument();
      expect(screen.getByText('Alex Taylor')).toBeInTheDocument();
    });

    it('should filter to show only male athletes when "Male" is selected', async () => {
      setupFetchMocks(mockMeasurementsWithGender);
      renderWithProviders(<Publish />);

      await selectMetric();

      // Select Male filter
      const genderSelect = screen.getByTestId('select-gender');
      fireEvent.click(genderSelect);
      const maleOption = await screen.findByRole('option', { name: 'Male' });
      fireEvent.click(maleOption);

      // Wait for filtered results
      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');
        // 1 header row + 2 male measurements
        expect(rows.length).toBe(3);
      });

      // Verify only male athletes are shown
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Mike Smith')).toBeInTheDocument();
      expect(screen.queryByText('Jane Johnson')).not.toBeInTheDocument();
      expect(screen.queryByText('Alex Taylor')).not.toBeInTheDocument();
    });

    it('should filter to show only female athletes when "Female" is selected', async () => {
      setupFetchMocks(mockMeasurementsWithGender);
      renderWithProviders(<Publish />);

      await selectMetric();

      // Select Female filter
      const genderSelect = screen.getByTestId('select-gender');
      fireEvent.click(genderSelect);
      const femaleOption = await screen.findByRole('option', { name: 'Female' });
      fireEvent.click(femaleOption);

      // Wait for filtered results
      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');
        // 1 header row + 2 female measurements
        expect(rows.length).toBe(3);
      });

      // Verify only female athletes are shown
      expect(screen.getByText('Jane Johnson')).toBeInTheDocument();
      expect(screen.getByText('Sarah Williams')).toBeInTheDocument();
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
      expect(screen.queryByText('Alex Taylor')).not.toBeInTheDocument();
    });

    it('should filter to show only "Not Specified" athletes', async () => {
      setupFetchMocks(mockMeasurementsWithGender);
      renderWithProviders(<Publish />);

      await selectMetric();

      // Select Not Specified filter
      const genderSelect = screen.getByTestId('select-gender');
      fireEvent.click(genderSelect);
      const notSpecifiedOption = await screen.findByRole('option', { name: 'Not Specified' });
      fireEvent.click(notSpecifiedOption);

      // Wait for filtered results
      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');
        // 1 header row + 1 not specified measurement
        expect(rows.length).toBe(2);
      });

      // Verify only not specified athlete is shown
      expect(screen.getByText('Alex Taylor')).toBeInTheDocument();
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
      expect(screen.queryByText('Jane Johnson')).not.toBeInTheDocument();
    });

    it('should send correct gender parameter to API', async () => {
      setupFetchMocks(mockMeasurementsWithGender);
      renderWithProviders(<Publish />);

      await selectMetric();

      // Select Male filter
      const genderSelect = screen.getByTestId('select-gender');
      fireEvent.click(genderSelect);
      const maleOption = await screen.findByRole('option', { name: 'Male' });
      fireEvent.click(maleOption);

      await waitFor(() => {
        // Check that fetch was called with gender=Male parameter
        const calls = fetchMock.mock.calls;
        const measurementCalls = calls.filter((call: any) =>
          call[0].includes('/api/measurements') && call[0].includes('gender=Male')
        );
        expect(measurementCalls.length).toBeGreaterThan(0);
      });
    });

    it('should not send gender parameter when "All Genders" is selected', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockMeasurementsWithGender);
      renderWithProviders(<Publish />);

      await selectMetric();

      // Gender should default to "all" - verify no gender param in URL
      await waitFor(() => {
        const calls = fetchMock.mock.calls;
        const measurementCalls = calls.filter((call: any) =>
          call[0].includes('/api/measurements')
        );

        // Should have calls to measurements endpoint
        expect(measurementCalls.length).toBeGreaterThan(0);

        // None should have gender parameter (or should have gender=all)
        const callsWithGenderFilter = measurementCalls.filter((call: any) =>
          call[0].includes('gender=Male') ||
          call[0].includes('gender=Female') ||
          call[0].includes('gender=Not')
        );
        expect(callsWithGenderFilter.length).toBe(0);
      });
    });
  });

  describe('Gender Filter Integration with Reset', () => {
    it('should reset gender filter to "All Genders" when Reset Filters is clicked', async () => {
      setupFetchMocks(mockMeasurementsWithGender);
      renderWithProviders(<Publish />);

      await selectMetric();

      // Select Male filter
      const genderSelect = screen.getByTestId('select-gender');
      fireEvent.click(genderSelect);
      const maleOption = await screen.findByRole('option', { name: 'Male' });
      fireEvent.click(maleOption);

      await waitFor(() => {
        expect(genderSelect).toHaveTextContent('Male');
      });

      // Click Reset Filters button
      const resetButton = screen.getByTestId('reset-filters-button');
      fireEvent.click(resetButton);

      // Gender should be reset to "All Genders"
      await waitFor(() => {
        expect(genderSelect).toHaveTextContent('All Genders');
      });
    });
  });

  // Note: View persistence test skipped due to happy-dom limitations with complex UI interactions
  // Gender filter persistence is tested through integration tests instead
});
