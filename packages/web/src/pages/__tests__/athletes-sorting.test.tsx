import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Athletes from '../athletes';

// Mock wouter
const mockSetLocation = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/athletes', mockSetLocation],
}));

// Mock the auth hook
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', isSiteAdmin: true },
    organizationContext: 'test-org-id',
    userOrganizations: [{ organizationId: 'test-org-id' }],
  }),
}));

// Mock the AthleteModal component
vi.mock('@/components/athlete-modal', () => ({
  default: ({ isOpen, onClose }: any) =>
    isOpen ? <div data-testid="athlete-modal">Athlete Modal</div> : null,
}));

// Mock the InvitationModal component
vi.mock('@/components/invitation-modal', () => {
  const InvitationModal = ({ open, onOpenChange }: any) =>
    open ? <div data-testid="invitation-modal">Invitation Modal</div> : null;
  return { InvitationModal };
});

// Generate mock athletes with diverse data for sorting
const mockAthletes = [
  {
    id: 'athlete-1',
    firstName: 'Alice',
    lastName: 'Anderson',
    fullName: 'Alice Anderson',
    birthYear: 2005,
    gender: 'Female',
    school: 'Central High',
    sports: ['Basketball', 'Track'],
    emails: ['alice@test.com'],
    isActive: true,
    teams: [{ id: 'team-1', name: 'Varsity Basketball' }],
  },
  {
    id: 'athlete-2',
    firstName: 'Bob',
    lastName: 'Brown',
    fullName: 'Bob Brown',
    birthYear: 2003,
    gender: 'Male',
    school: 'North Academy',
    sports: ['Football'],
    emails: ['bob@test.com'],
    isActive: false,
    teams: [{ id: 'team-2', name: 'JV Football' }],
  },
  {
    id: 'athlete-3',
    firstName: 'Charlie',
    lastName: 'Chen',
    fullName: 'Charlie Chen',
    birthYear: 2007,
    gender: 'Male',
    school: null, // Test null handling
    sports: [], // Test empty array
    emails: ['charlie@test.com'],
    isActive: true,
    teams: [], // Independent athlete
  },
  {
    id: 'athlete-4',
    firstName: 'Diana',
    lastName: 'Davis',
    fullName: 'Diana Davis',
    birthYear: 2004,
    gender: 'Female',
    school: 'South High',
    sports: ['Soccer', 'Volleyball'],
    emails: ['diana@test.com'],
    isActive: true,
    teams: [{ id: 'team-3', name: 'Elite Soccer' }, { id: 'team-4', name: 'Volleyball Club' }],
  },
  {
    id: 'athlete-5',
    firstName: 'Ethan',
    lastName: 'Evans',
    fullName: 'Ethan Evans',
    birthYear: 2006,
    gender: 'Male',
    school: 'East Academy',
    sports: ['Baseball'],
    emails: ['ethan@test.com'],
    isActive: false,
    teams: [{ id: 'team-5', name: 'Academy Baseball' }],
  },
];

describe('Athletes Page - Column Sorting', () => {
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

  const setupFetchMocks = (athletes: any[]) => {
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
      if (url.includes('/api/auth/me/organizations')) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ organizationId: 'test-org-id' }],
        });
      }
      if (url.includes('/api/invitations/athletes')) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }
      if (url.includes('/api/athletes')) {
        return Promise.resolve({
          ok: true,
          json: async () => athletes,
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });
  };

  describe('Column Headers - Clickability and Icons', () => {
    it('should render column headers as clickable with sort icons', async () => {
      setupFetchMocks(mockAthletes);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('5 athletes');
      });

      // Check all sortable column headers are clickable
      const athleteHeader = screen.getByTestId('sort-header-athlete');
      const teamHeader = screen.getByTestId('sort-header-team');
      const birthYearHeader = screen.getByTestId('sort-header-birthYear');
      const genderHeader = screen.getByTestId('sort-header-gender');
      const schoolHeader = screen.getByTestId('sort-header-school');
      const sportHeader = screen.getByTestId('sort-header-sport');
      const statusHeader = screen.getByTestId('sort-header-status');

      expect(athleteHeader).toBeInTheDocument();
      expect(teamHeader).toBeInTheDocument();
      expect(birthYearHeader).toBeInTheDocument();
      expect(genderHeader).toBeInTheDocument();
      expect(schoolHeader).toBeInTheDocument();
      expect(sportHeader).toBeInTheDocument();
      expect(statusHeader).toBeInTheDocument();

      // All should have ArrowUpDown icon initially (unsorted state)
      expect(within(athleteHeader).getByTestId('icon-sort-unsorted')).toBeInTheDocument();
      expect(within(teamHeader).getByTestId('icon-sort-unsorted')).toBeInTheDocument();
      expect(within(birthYearHeader).getByTestId('icon-sort-unsorted')).toBeInTheDocument();
    });

    it('should show hover state on column headers', async () => {
      setupFetchMocks(mockAthletes);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('5 athletes');
      });

      const athleteHeader = screen.getByTestId('sort-header-athlete');

      // Check that header has cursor-pointer class
      expect(athleteHeader).toHaveClass('cursor-pointer');
    });
  });

  describe('Sort Direction Toggle', () => {
    it('should toggle from unsorted → asc → desc → asc on repeated clicks', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockAthletes);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('5 athletes');
      });

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
      setupFetchMocks(mockAthletes);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('5 athletes');
      });

      const athleteHeader = screen.getByTestId('sort-header-athlete');
      const teamHeader = screen.getByTestId('sort-header-team');

      // Sort by athlete (ascending)
      await user.click(athleteHeader);
      await waitFor(() => {
        expect(within(athleteHeader).getByTestId('icon-sort-asc')).toBeInTheDocument();
      });

      // Sort by team - athlete should go back to unsorted, team should be ascending
      await user.click(teamHeader);
      await waitFor(() => {
        expect(within(teamHeader).getByTestId('icon-sort-asc')).toBeInTheDocument();
        expect(within(athleteHeader).getByTestId('icon-sort-unsorted')).toBeInTheDocument();
      });
    });
  });

  describe('Sort Logic - Athlete Name', () => {
    it('should sort athletes by full name alphabetically (ascending)', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockAthletes);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('5 athletes');
      });

      const athleteHeader = screen.getByTestId('sort-header-athlete');
      await user.click(athleteHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        // Skip header row, get data rows
        const names = rows.slice(1).map(row =>
          within(row).getAllByRole('cell')[1]?.textContent?.trim()
        ).filter(Boolean);

        // Expected order: Alice, Bob, Charlie, Diana, Ethan
        expect(names[0]).toContain('Alice Anderson');
        expect(names[1]).toContain('Bob Brown');
        expect(names[2]).toContain('Charlie Chen');
        expect(names[3]).toContain('Diana Davis');
        expect(names[4]).toContain('Ethan Evans');
      });
    });

    it('should sort athletes by full name alphabetically (descending)', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockAthletes);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('5 athletes');
      });

      const athleteHeader = screen.getByTestId('sort-header-athlete');

      // Click twice for descending
      await user.click(athleteHeader);
      await user.click(athleteHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        const names = rows.slice(1).map(row =>
          within(row).getAllByRole('cell')[1]?.textContent?.trim()
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

  describe('Sort Logic - Birth Year', () => {
    it('should sort athletes by birth year numerically (ascending)', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockAthletes);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('5 athletes');
      });

      const birthYearHeader = screen.getByTestId('sort-header-birthYear');
      await user.click(birthYearHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        const years = rows.slice(1).map(row =>
          within(row).getAllByRole('cell')[3]?.textContent?.trim()
        ).filter(Boolean);

        // Expected order: 2003, 2004, 2005, 2006, 2007
        expect(years).toEqual(['2003', '2004', '2005', '2006', '2007']);
      });
    });

    it('should sort athletes by birth year numerically (descending)', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockAthletes);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('5 athletes');
      });

      const birthYearHeader = screen.getByTestId('sort-header-birthYear');

      // Click twice for descending
      await user.click(birthYearHeader);
      await user.click(birthYearHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        const years = rows.slice(1).map(row =>
          within(row).getAllByRole('cell')[3]?.textContent?.trim()
        ).filter(Boolean);

        // Expected order: 2007, 2006, 2005, 2004, 2003
        expect(years).toEqual(['2007', '2006', '2005', '2004', '2003']);
      });
    });
  });

  describe('Sort Logic - Team', () => {
    it('should sort athletes by first team name alphabetically', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockAthletes);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('5 athletes');
      });

      const teamHeader = screen.getByTestId('sort-header-team');
      await user.click(teamHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        const teams = rows.slice(1).map(row =>
          within(row).getAllByRole('cell')[2]?.textContent?.trim()
        ).filter(Boolean);

        // Expected order: Academy Baseball, Elite Soccer, Independent, JV Football, Varsity Basketball
        expect(teams[0]).toContain('Academy Baseball');
        expect(teams[1]).toContain('Elite Soccer');
        expect(teams[2]).toContain('Independent');
        expect(teams[3]).toContain('JV Football');
        expect(teams[4]).toContain('Varsity Basketball');
      });
    });

    it('should handle Independent athletes (no team) in sorting', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockAthletes);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('5 athletes');
      });

      const teamHeader = screen.getByTestId('sort-header-team');

      // Descending - Independent should sort alphabetically (I comes after V, J but before E, A)
      await user.click(teamHeader);
      await user.click(teamHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        const teams = rows.slice(1).map(row =>
          within(row).getAllByRole('cell')[2]?.textContent?.trim()
        ).filter(Boolean);

        // In descending order: Varsity, JV, Independent, Elite, Academy
        const independentIndex = teams.findIndex(t => t?.includes('Independent'));
        expect(independentIndex).toBeGreaterThan(0); // Not first
        expect(independentIndex).toBeLessThan(teams.length - 1); // Not last
      });
    });
  });

  describe('Sort Logic - Gender', () => {
    it('should sort athletes by gender alphabetically', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockAthletes);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('5 athletes');
      });

      const genderHeader = screen.getByTestId('sort-header-gender');
      await user.click(genderHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        const genders = rows.slice(1).map(row =>
          within(row).getAllByRole('cell')[4]?.textContent?.trim()
        ).filter(Boolean);

        // Female should come before Male alphabetically
        const femaleCount = genders.filter(g => g === 'Female').length;
        const maleCount = genders.filter(g => g === 'Male').length;

        expect(femaleCount).toBe(2);
        expect(maleCount).toBe(3);

        // First two should be Female
        expect(genders[0]).toBe('Female');
        expect(genders[1]).toBe('Female');
      });
    });
  });

  describe('Sort Logic - School', () => {
    it('should sort athletes by school name alphabetically', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockAthletes);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('5 athletes');
      });

      const schoolHeader = screen.getByTestId('sort-header-school');
      await user.click(schoolHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        const schools = rows.slice(1).map(row =>
          within(row).getAllByRole('cell')[5]?.textContent?.trim()
        ).filter(Boolean);

        // Schools in alphabetical order (null/"N/A" should be at the end)
        expect(schools[0]).toBe('Central High');
        expect(schools[1]).toBe('East Academy');
        expect(schools[2]).toBe('North Academy');
        expect(schools[3]).toBe('South High');
        expect(schools[4]).toBe('N/A');
      });
    });

    it('should handle null school values in sorting', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockAthletes);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('5 athletes');
      });

      const schoolHeader = screen.getByTestId('sort-header-school');
      await user.click(schoolHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        const schools = rows.slice(1).map(row =>
          within(row).getAllByRole('cell')[5]?.textContent?.trim()
        ).filter(Boolean);

        // N/A (null school) should be at the end when ascending
        expect(schools[schools.length - 1]).toBe('N/A');
      });
    });
  });

  describe('Sort Logic - Sport', () => {
    it('should sort athletes by first sport alphabetically', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockAthletes);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('5 athletes');
      });

      const sportHeader = screen.getByTestId('sort-header-sport');
      await user.click(sportHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        const sports = rows.slice(1).map(row =>
          within(row).getAllByRole('cell')[6]?.textContent?.trim()
        ).filter(Boolean);

        // Baseball, Basketball, Football, Soccer, then N/A (empty sports array)
        expect(sports[0]).toContain('Baseball');
        expect(sports[1]).toContain('Basketball');
        expect(sports[2]).toContain('Football');
        expect(sports[3]).toContain('Soccer');
        expect(sports[4]).toBe('N/A');
      });
    });

    it('should handle athletes with no sports in sorting', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockAthletes);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('5 athletes');
      });

      const sportHeader = screen.getByTestId('sort-header-sport');
      await user.click(sportHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        const sports = rows.slice(1).map(row =>
          within(row).getAllByRole('cell')[6]?.textContent?.trim()
        ).filter(Boolean);

        // N/A should be at the end for ascending sort
        expect(sports[sports.length - 1]).toBe('N/A');
      });
    });
  });

  describe('Sort Logic - Status', () => {
    it('should sort athletes by status (Active first)', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockAthletes);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('5 athletes');
      });

      const statusHeader = screen.getByTestId('sort-header-status');
      await user.click(statusHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        const statuses = rows.slice(1).map(row =>
          within(row).getAllByRole('cell')[7]?.textContent?.trim()
        ).filter(Boolean);

        // Active athletes should come first
        const activeCount = statuses.filter(s => s === 'Active').length;
        const inactiveCount = statuses.filter(s => s === 'Inactive').length;

        expect(activeCount).toBe(3);
        expect(inactiveCount).toBe(2);

        // First 3 should be Active
        expect(statuses[0]).toBe('Active');
        expect(statuses[1]).toBe('Active');
        expect(statuses[2]).toBe('Active');
      });
    });

    it('should sort athletes by status (Inactive first when descending)', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockAthletes);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('5 athletes');
      });

      const statusHeader = screen.getByTestId('sort-header-status');

      // Click twice for descending
      await user.click(statusHeader);
      await user.click(statusHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        const statuses = rows.slice(1).map(row =>
          within(row).getAllByRole('cell')[7]?.textContent?.trim()
        ).filter(Boolean);

        // Inactive athletes should come first
        expect(statuses[0]).toBe('Inactive');
        expect(statuses[1]).toBe('Inactive');
      });
    });
  });

  describe('Pagination Integration', () => {
    it('should reset to page 1 when sorting changes', async () => {
      const user = userEvent.setup();
      const manyAthletes = Array.from({ length: 50 }, (_, i) => ({
        ...mockAthletes[i % mockAthletes.length],
        id: `athlete-${i}`,
        fullName: `Athlete ${i}`,
      }));

      setupFetchMocks(manyAthletes);
      renderWithProviders(<Athletes />);

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
      const manyAthletes = Array.from({ length: 50 }, (_, i) => ({
        ...mockAthletes[i % mockAthletes.length],
        id: `athlete-${i}`,
        fullName: `Athlete ${String(i).padStart(2, '0')}`, // Ensure alphabetical sorting works
        birthYear: 2000 + i,
      }));

      setupFetchMocks(manyAthletes);
      renderWithProviders(<Athletes />);

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

      // Data on page 2 should still be sorted
      const table = screen.getByRole('table');
      const rows = within(table).getAllByRole('row');

      const names = rows.slice(1).map(row =>
        within(row).getAllByRole('cell')[1]?.textContent?.trim()
      ).filter(Boolean);

      // Page 2 should show athletes 26-50 in sorted order
      expect(names[0]).toContain('Athlete 25');
    });
  });

  describe('Sorting Applied Before Pagination', () => {
    it('should sort all data before paginating', async () => {
      const user = userEvent.setup();
      const athletes = [
        { ...mockAthletes[0], fullName: 'Zebra', birthYear: 2005 },
        { ...mockAthletes[1], fullName: 'Apple', birthYear: 2003 },
        { ...mockAthletes[2], fullName: 'Mango', birthYear: 2007 },
      ];

      setupFetchMocks(athletes);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('3 athletes');
      });

      // Sort by name ascending
      const athleteHeader = screen.getByTestId('sort-header-athlete');
      await user.click(athleteHeader);

      await waitFor(() => {
        const table = screen.getByRole('table');
        const rows = within(table).getAllByRole('row');

        const names = rows.slice(1).map(row =>
          within(row).getAllByRole('cell')[1]?.textContent?.trim()
        ).filter(Boolean);

        // Should see: Apple, Mango, Zebra
        expect(names[0]).toContain('Apple');
        expect(names[1]).toContain('Mango');
        expect(names[2]).toContain('Zebra');
      });
    });
  });
});
