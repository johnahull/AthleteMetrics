import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Publish from '../publish';

// Mock measurements for sorting tests
const mockMeasurements = [
  {
    id: 'measurement-1',
    value: '1.50',
    date: '2024-03-15',
    metric: 'FLY10_TIME',
    user: {
      id: 'athlete-1',
      fullName: 'Alice Anderson',
      birthYear: 2005,
      sports: ['Basketball', 'Track'],
      teams: [{ id: 'team-1', name: 'Varsity Basketball' }],
    },
  },
  {
    id: 'measurement-2',
    value: '1.45',
    date: '2024-02-10',
    metric: 'FLY10_TIME',
    user: {
      id: 'athlete-2',
      fullName: 'Bob Brown',
      birthYear: 2003,
      sports: ['Football'],
      teams: [{ id: 'team-2', name: 'JV Football' }],
    },
  },
  {
    id: 'measurement-3',
    value: '1.60',
    date: '2024-04-20',
    metric: 'FLY10_TIME',
    user: {
      id: 'athlete-3',
      fullName: 'Charlie Chen',
      birthYear: 2007,
      sports: [],
      teams: [],
    },
  },
  {
    id: 'measurement-4',
    value: '1.48',
    date: '2024-01-05',
    metric: 'FLY10_TIME',
    user: {
      id: 'athlete-4',
      fullName: 'Diana Davis',
      birthYear: 2004,
      sports: ['Soccer', 'Volleyball'],
      teams: [{ id: 'team-3', name: 'Elite Soccer' }],
    },
  },
  {
    id: 'measurement-5',
    value: '1.55',
    date: '2024-05-12',
    metric: 'FLY10_TIME',
    user: {
      id: 'athlete-5',
      fullName: 'Ethan Evans',
      birthYear: 2006,
      sports: ['Baseball'],
      teams: [{ id: 'team-4', name: 'Academy Baseball' }],
    },
  },
];

describe('Publish Page - Column Sorting', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  const renderWithProviders = (component: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {component}
      </QueryClientProvider>
    );
  };

  const setupFetchMocks = (measurements: any[]) => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/teams')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: 'team-1', name: 'Varsity Basketball' },
            { id: 'team-2', name: 'JV Football' },
            { id: 'team-3', name: 'Elite Soccer' },
          ],
        });
      }
      if (url.includes('/api/measurements')) {
        return Promise.resolve({
          ok: true,
          json: async () => measurements,
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
  };

  // Helper to select a metric first (required for data to load)
  const selectMetric = async () => {
    const metricSelect = screen.getByTestId('select-metric');
    fireEvent.click(metricSelect);
    const fly10Option = await screen.findByRole('option', { name: 'Fly-10 Time' });
    fireEvent.click(fly10Option);

    await waitFor(() => {
      // Wait for results table to load
      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();
      expect(within(table).getAllByRole('row').length).toBeGreaterThan(1); // More than just header
    });
  };

  describe('Column Headers - Clickability and Icons', () => {
    it('should render column headers as clickable with sort icons', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockMeasurements);
      renderWithProviders(<Publish />);

      await selectMetric();

      // Check all sortable column headers are clickable
      const rankHeader = screen.getByTestId('sort-header-rank');
      const athleteHeader = screen.getByTestId('sort-header-athlete');
      const teamHeader = screen.getByTestId('sort-header-team');
      const sportHeader = screen.getByTestId('sort-header-sport');
      const valueHeader = screen.getByTestId('sort-header-value');
      const dateHeader = screen.getByTestId('sort-header-date');

      expect(rankHeader).toBeInTheDocument();
      expect(athleteHeader).toBeInTheDocument();
      expect(teamHeader).toBeInTheDocument();
      expect(sportHeader).toBeInTheDocument();
      expect(valueHeader).toBeInTheDocument();
      expect(dateHeader).toBeInTheDocument();

      // All should have ArrowUpDown icon initially (unsorted state)
      expect(within(rankHeader).getByTestId('icon-sort-unsorted')).toBeInTheDocument();
      expect(within(athleteHeader).getByTestId('icon-sort-unsorted')).toBeInTheDocument();
      expect(within(teamHeader).getByTestId('icon-sort-unsorted')).toBeInTheDocument();
    });

    it('should show hover state on column headers', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockMeasurements);
      renderWithProviders(<Publish />);

      await selectMetric();

      const athleteHeader = screen.getByTestId('sort-header-athlete');

      // Check that header has cursor-pointer class
      expect(athleteHeader).toHaveClass('cursor-pointer');
    });
  });

  describe('Sort Direction Toggle', () => {
    it('should toggle from unsorted → asc → desc → asc on repeated clicks', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockMeasurements);
      renderWithProviders(<Publish />);

      await selectMetric();

      const athleteHeader = screen.getByTestId('sort-header-athlete');

      // Initial state: unsorted (ArrowUpDown)
      expect(within(athleteHeader).getByTestId('icon-sort-unsorted')).toBeInTheDocument();

      // First click: ascending
      await user.click(athleteHeader);
      await waitFor(() => {
        expect(within(athleteHeader).getByTestId('icon-sort-asc')).toBeInTheDocument();
      });

      // Second click: descending
      await user.click(athleteHeader);
      await waitFor(() => {
        expect(within(athleteHeader).getByTestId('icon-sort-desc')).toBeInTheDocument();
      });

      // Third click: back to ascending
      await user.click(athleteHeader);
      await waitFor(() => {
        expect(within(athleteHeader).getByTestId('icon-sort-asc')).toBeInTheDocument();
      });
    });

    it('should reset other columns to unsorted when sorting a new column', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockMeasurements);
      renderWithProviders(<Publish />);

      await selectMetric();

      const athleteHeader = screen.getByTestId('sort-header-athlete');
      const dateHeader = screen.getByTestId('sort-header-date');

      // Sort by athlete (ascending)
      await user.click(athleteHeader);
      await waitFor(() => {
        expect(within(athleteHeader).getByTestId('icon-sort-asc')).toBeInTheDocument();
      });

      // Sort by date - athlete should go back to unsorted, date should be ascending
      await user.click(dateHeader);
      await waitFor(() => {
        expect(within(dateHeader).getByTestId('icon-sort-asc')).toBeInTheDocument();
        expect(within(athleteHeader).getByTestId('icon-sort-unsorted')).toBeInTheDocument();
      });
    });
  });

  describe('Sort Logic - Rank (Numerical)', () => {
    it('should sort by rank numerically (ascending)', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockMeasurements);
      renderWithProviders(<Publish />);

      await selectMetric();

      const rankHeader = screen.getByTestId('sort-header-rank');
      await user.click(rankHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        const ranks = rows.slice(1).map(row => {
          const cell = within(row).getAllByRole('cell')[1];
          return cell?.textContent?.trim();
        }).filter(Boolean);

        // Ranks should be 1, 2, 3, 4, 5
        expect(ranks).toEqual(['1', '2', '3', '4', '5']);
      });
    });

    it('should sort by rank numerically (descending)', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockMeasurements);
      renderWithProviders(<Publish />);

      await selectMetric();

      const rankHeader = screen.getByTestId('sort-header-rank');

      // Click twice for descending
      await user.click(rankHeader);
      await user.click(rankHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        const ranks = rows.slice(1).map(row => {
          const cell = within(row).getAllByRole('cell')[1];
          return cell?.textContent?.trim();
        }).filter(Boolean);

        // Ranks should be 5, 4, 3, 2, 1
        expect(ranks).toEqual(['5', '4', '3', '2', '1']);
      });
    });
  });

  describe('Sort Logic - Athlete Name', () => {
    it('should sort by athlete name alphabetically (ascending)', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockMeasurements);
      renderWithProviders(<Publish />);

      await selectMetric();

      const athleteHeader = screen.getByTestId('sort-header-athlete');
      await user.click(athleteHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        const names = rows.slice(1).map(row =>
          within(row).getAllByRole('cell')[2]?.textContent?.trim()
        ).filter(Boolean);

        // Expected order: Alice, Bob, Charlie, Diana, Ethan
        expect(names[0]).toContain('Alice Anderson');
        expect(names[1]).toContain('Bob Brown');
        expect(names[2]).toContain('Charlie Chen');
        expect(names[3]).toContain('Diana Davis');
        expect(names[4]).toContain('Ethan Evans');
      });
    });

    it('should sort by athlete name alphabetically (descending)', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockMeasurements);
      renderWithProviders(<Publish />);

      await selectMetric();

      const athleteHeader = screen.getByTestId('sort-header-athlete');

      // Click twice for descending
      await user.click(athleteHeader);
      await user.click(athleteHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        const names = rows.slice(1).map(row =>
          within(row).getAllByRole('cell')[2]?.textContent?.trim()
        ).filter(Boolean);

        // Expected order: Ethan, Diana, Charlie, Bob, Alice
        expect(names[0]).toContain('Ethan Evans');
        expect(names[1]).toContain('Diana Davis');
        expect(names[2]).toContain('Charlie Chen');
        expect(names[3]).toContain('Bob Brown');
        expect(names[4]).toContain('Alice Anderson');
      });
    });
  });

  describe('Sort Logic - Team', () => {
    it('should sort by first team name alphabetically', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockMeasurements);
      renderWithProviders(<Publish />);

      await selectMetric();

      const teamHeader = screen.getByTestId('sort-header-team');
      await user.click(teamHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        const teams = rows.slice(1).map(row =>
          within(row).getAllByRole('cell')[3]?.textContent?.trim()
        ).filter(Boolean);

        // Expected order: Academy Baseball, Elite Soccer, Independent Athlete, JV Football, Varsity Basketball
        expect(teams[0]).toContain('Academy Baseball');
        expect(teams[1]).toContain('Elite Soccer');
        expect(teams[2]).toContain('Independent Athlete');
        expect(teams[3]).toContain('JV Football');
        expect(teams[4]).toContain('Varsity Basketball');
      });
    });

    it('should handle Independent Athlete (no team) in sorting', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockMeasurements);
      renderWithProviders(<Publish />);

      await selectMetric();

      const teamHeader = screen.getByTestId('sort-header-team');
      await user.click(teamHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        const teams = rows.slice(1).map(row =>
          within(row).getAllByRole('cell')[3]?.textContent?.trim()
        ).filter(Boolean);

        // Independent Athlete should be sorted appropriately
        const independentIndex = teams.findIndex(t => t?.includes('Independent'));
        expect(independentIndex).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Sort Logic - Sport', () => {
    it('should sort by first sport alphabetically', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockMeasurements);
      renderWithProviders(<Publish />);

      await selectMetric();

      const sportHeader = screen.getByTestId('sort-header-sport');
      await user.click(sportHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        const sports = rows.slice(1).map(row =>
          within(row).getAllByRole('cell')[4]?.textContent?.trim()
        ).filter(Boolean);

        // Expected order: Baseball, Basketball, Football, Soccer, N/A
        expect(sports[0]).toContain('Baseball');
        expect(sports[1]).toContain('Basketball');
        expect(sports[2]).toContain('Football');
        expect(sports[3]).toContain('Soccer');
        expect(sports[4]).toBe('N/A');
      });
    });

    it('should handle athletes with no sports in sorting', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockMeasurements);
      renderWithProviders(<Publish />);

      await selectMetric();

      const sportHeader = screen.getByTestId('sort-header-sport');
      await user.click(sportHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        const sports = rows.slice(1).map(row =>
          within(row).getAllByRole('cell')[4]?.textContent?.trim()
        ).filter(Boolean);

        // N/A should be at the end for ascending sort
        expect(sports[sports.length - 1]).toBe('N/A');
      });
    });
  });

  describe('Sort Logic - Value (Numerical)', () => {
    it('should sort by value numerically (ascending)', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockMeasurements);
      renderWithProviders(<Publish />);

      await selectMetric();

      const valueHeader = screen.getByTestId('sort-header-value');
      await user.click(valueHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        const values = rows.slice(1).map(row => {
          const cell = within(row).getAllByRole('cell')[5];
          const text = cell?.textContent?.trim() || '';
          return parseFloat(text.replace('s', ''));
        }).filter(v => !isNaN(v));

        // Expected order: 1.45, 1.48, 1.50, 1.55, 1.60
        expect(values).toEqual([1.45, 1.48, 1.50, 1.55, 1.60]);
      });
    });

    it('should sort by value numerically (descending)', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockMeasurements);
      renderWithProviders(<Publish />);

      await selectMetric();

      const valueHeader = screen.getByTestId('sort-header-value');

      // Click twice for descending
      await user.click(valueHeader);
      await user.click(valueHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        const values = rows.slice(1).map(row => {
          const cell = within(row).getAllByRole('cell')[5];
          const text = cell?.textContent?.trim() || '';
          return parseFloat(text.replace('s', ''));
        }).filter(v => !isNaN(v));

        // Expected order: 1.60, 1.55, 1.50, 1.48, 1.45
        expect(values).toEqual([1.60, 1.55, 1.50, 1.48, 1.45]);
      });
    });
  });

  describe('Sort Logic - Date (Chronological)', () => {
    it('should sort by date chronologically (ascending - oldest first)', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockMeasurements);
      renderWithProviders(<Publish />);

      await selectMetric();

      const dateHeader = screen.getByTestId('sort-header-date');
      await user.click(dateHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        const dates = rows.slice(1).map(row =>
          within(row).getAllByRole('cell')[6]?.textContent?.trim()
        ).filter(Boolean);

        // Expected chronological order: 1/5/2024, 2/10/2024, 3/15/2024, 4/20/2024, 5/12/2024
        // Convert to Date objects for comparison
        const parsedDates = dates.map(d => new Date(d!));

        // Verify dates are in ascending order
        for (let i = 0; i < parsedDates.length - 1; i++) {
          expect(parsedDates[i].getTime()).toBeLessThanOrEqual(parsedDates[i + 1].getTime());
        }
      });
    });

    it('should sort by date chronologically (descending - newest first)', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockMeasurements);
      renderWithProviders(<Publish />);

      await selectMetric();

      const dateHeader = screen.getByTestId('sort-header-date');

      // Click twice for descending
      await user.click(dateHeader);
      await user.click(dateHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        const dates = rows.slice(1).map(row =>
          within(row).getAllByRole('cell')[6]?.textContent?.trim()
        ).filter(Boolean);

        // Convert to Date objects for comparison
        const parsedDates = dates.map(d => new Date(d!));

        // Verify dates are in descending order (newest first)
        for (let i = 0; i < parsedDates.length - 1; i++) {
          expect(parsedDates[i].getTime()).toBeGreaterThanOrEqual(parsedDates[i + 1].getTime());
        }
      });
    });
  });

  describe('Pagination Integration', () => {
    it('should reset to page 1 when sorting changes', async () => {
      const user = userEvent.setup();
      const manyMeasurements = Array.from({ length: 50 }, (_, i) => ({
        ...mockMeasurements[i % mockMeasurements.length],
        id: `measurement-${i}`,
        user: {
          ...mockMeasurements[i % mockMeasurements.length].user,
          id: `athlete-${i}`,
          fullName: `Athlete ${i}`,
        },
      }));

      setupFetchMocks(manyMeasurements);
      renderWithProviders(<Publish />);

      await selectMetric();

      await waitFor(() => {
        expect(screen.getByText(/Page 1 of 2/i)).toBeInTheDocument();
      });

      // Navigate to page 2
      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText(/Page 2 of 2/i)).toBeInTheDocument();
      });

      // Sort by athlete name
      const athleteHeader = screen.getByTestId('sort-header-athlete');
      await user.click(athleteHeader);

      // Should reset to page 1
      await waitFor(() => {
        expect(screen.getByText(/Page 1 of 2/i)).toBeInTheDocument();
      });
    });

    it('should maintain sort when changing pages', async () => {
      const user = userEvent.setup();
      const manyMeasurements = Array.from({ length: 50 }, (_, i) => ({
        ...mockMeasurements[i % mockMeasurements.length],
        id: `measurement-${i}`,
        value: (1.40 + i * 0.01).toFixed(2),
        user: {
          ...mockMeasurements[i % mockMeasurements.length].user,
          id: `athlete-${i}`,
          fullName: `Athlete ${String(i).padStart(2, '0')}`,
        },
      }));

      setupFetchMocks(manyMeasurements);
      renderWithProviders(<Publish />);

      await selectMetric();

      await waitFor(() => {
        expect(screen.getByText(/Page 1 of 2/i)).toBeInTheDocument();
      });

      // Sort by athlete name (ascending)
      const athleteHeader = screen.getByTestId('sort-header-athlete');
      await user.click(athleteHeader);

      await waitFor(() => {
        expect(within(athleteHeader).getByTestId('icon-sort-asc')).toBeInTheDocument();
      });

      // Navigate to page 2
      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText(/Page 2 of 2/i)).toBeInTheDocument();
      });

      // Sort icon should still show ascending
      expect(within(athleteHeader).getByTestId('icon-sort-asc')).toBeInTheDocument();
    });
  });

  describe('Sorting Applied Before Pagination', () => {
    it('should sort all data before paginating', async () => {
      const user = userEvent.setup();
      const measurements = [
        { ...mockMeasurements[0], user: { ...mockMeasurements[0].user, fullName: 'Zebra' }, value: '1.50' },
        { ...mockMeasurements[1], user: { ...mockMeasurements[1].user, fullName: 'Apple' }, value: '1.45' },
        { ...mockMeasurements[2], user: { ...mockMeasurements[2].user, fullName: 'Mango' }, value: '1.60' },
      ];

      setupFetchMocks(measurements);
      renderWithProviders(<Publish />);

      await selectMetric();

      // Sort by name ascending
      const athleteHeader = screen.getByTestId('sort-header-athlete');
      await user.click(athleteHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        const names = rows.slice(1).map(row =>
          within(row).getAllByRole('cell')[2]?.textContent?.trim()
        ).filter(Boolean);

        // Should see: Apple, Mango, Zebra
        expect(names[0]).toContain('Apple');
        expect(names[1]).toContain('Mango');
        expect(names[2]).toContain('Zebra');
      });
    });
  });
});
