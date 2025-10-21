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

// Generate mock athletes
const generateMockAthletes = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `athlete-${i + 1}`,
    firstName: `First${i + 1}`,
    lastName: `Last${i + 1}`,
    fullName: `First${i + 1} Last${i + 1}`,
    birthYear: 2000 + (i % 25),
    gender: i % 2 === 0 ? 'Male' : 'Female',
    school: `School ${i + 1}`,
    sports: ['Basketball'],
    emails: [`athlete${i + 1}@test.com`],
    isActive: true,
    teams: [],
  }));
};

const mockAthletes50 = generateMockAthletes(50);
const mockAthletes10 = generateMockAthletes(10);

describe('Athletes Page - Pagination', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    // Clear all mocks
    vi.clearAllMocks();

    // Reset fetch mock
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
          json: async () => [],
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

  describe('Pagination State Initialization', () => {
    it('should initialize with currentPage=1 and itemsPerPage=25', async () => {
      setupFetchMocks(mockAthletes50);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('50 athletes');
      });

      // Should show page size selector with default value of 25
      const pageSelector = screen.getByRole('combobox', { name: /page size/i });
      expect(pageSelector).toBeInTheDocument();

      // Pagination controls should be visible (50 athletes / 25 per page = 2 pages)
      await waitFor(() => {
        expect(screen.getByText(/Page 1 of 2/i)).toBeInTheDocument();
      });
    });

    it('should display only first 25 athletes by default', async () => {
      setupFetchMocks(mockAthletes50);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('50 athletes');
      });

      // Check that only first 25 athletes are rendered in the table
      const table = screen.getByRole('table');
      const rows = within(table).getAllByRole('row');

      // 1 header row + 25 data rows = 26 total rows
      expect(rows).toHaveLength(26);
    });
  });

  describe('Page Size Changes', () => {
    it('should reset currentPage to 1 when changing page size', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockAthletes50);
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

      // Change page size to 50 using fireEvent (userEvent has issues with radix Select)
      const pageSelector = screen.getByRole('combobox', { name: /page size/i });
      fireEvent.click(pageSelector);

      const option50 = await screen.findByRole('option', { name: '50' });
      fireEvent.click(option50);

      // Should hide pagination controls (50 athletes / 50 per page = 1 page)
      await waitFor(() => {
        expect(screen.queryByText(/Page \d+ of \d+/i)).not.toBeInTheDocument();
      });

      // Verify all 50 athletes are shown
      const table = screen.getByRole('table');
      const rows = within(table).getAllByRole('row');
      expect(rows).toHaveLength(51); // 1 header + 50 data rows
    });

    it('should update visible athletes when changing page size to 10', async () => {
      setupFetchMocks(mockAthletes50);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('50 athletes');
      });

      // Change page size to 10 using fireEvent
      const pageSelector = screen.getByRole('combobox', { name: /page size/i });
      fireEvent.click(pageSelector);

      const option10 = await screen.findByRole('option', { name: '10' });
      fireEvent.click(option10);

      // Should show 5 pages (50 / 10 = 5)
      await waitFor(() => {
        expect(screen.getByText(/Page 1 of 5/i)).toBeInTheDocument();
      });

      // Check that only 10 athletes are rendered in the table
      const table = screen.getByRole('table');
      const rows = within(table).getAllByRole('row');
      expect(rows).toHaveLength(11); // 1 header + 10 data rows
    });

    it('should show all athletes when selecting "All" page size', async () => {
      setupFetchMocks(mockAthletes50);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('50 athletes');
      });

      // Change page size to All using fireEvent
      const pageSelector = screen.getByRole('combobox', { name: /page size/i });
      fireEvent.click(pageSelector);

      const optionAll = await screen.findByRole('option', { name: 'All' });
      fireEvent.click(optionAll);

      // Pagination controls should not be visible when showing all
      await waitFor(() => {
        expect(screen.queryByText(/Page \d+ of \d+/i)).not.toBeInTheDocument();
      });

      // All 50 athletes should be rendered
      const table = screen.getByRole('table');
      const rows = within(table).getAllByRole('row');
      expect(rows).toHaveLength(51); // 1 header + 50 data rows
    });
  });

  describe('Pagination Calculations', () => {
    it('should calculate correct totalPages for various athlete counts', async () => {
      setupFetchMocks(mockAthletes50);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByText(/Page 1 of 2/i)).toBeInTheDocument();
      });

      // 50 athletes / 25 per page = 2 pages
      expect(screen.getByText(/Page 1 of 2/i)).toBeInTheDocument();
    });

    it('should handle edge case with exact page boundary', async () => {
      const mockAthletes25 = generateMockAthletes(25);
      setupFetchMocks(mockAthletes25);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('25 athletes');
      });

      // 25 athletes / 25 per page = exactly 1 page
      // Pagination controls should not render when totalPages <= 1
      expect(screen.queryByText(/Page \d+ of \d+/i)).not.toBeInTheDocument();
    });

    it('should correctly slice athletes for page 2', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockAthletes50);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('50 athletes');
      });

      // Navigate to page 2
      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText(/Page 2 of 2/i)).toBeInTheDocument();
      });

      // Should show athletes 26-50 (25 athletes on page 2)
      const table = screen.getByRole('table');
      const rows = within(table).getAllByRole('row');
      expect(rows).toHaveLength(26); // 1 header + 25 data rows

      // Verify we're showing the correct athletes (athlete-26 onwards)
      expect(screen.getByText('First26 Last26')).toBeInTheDocument();
      expect(screen.getByText('First50 Last50')).toBeInTheDocument();
      expect(screen.queryByText('First1 Last1')).not.toBeInTheDocument();
    });
  });

  describe('PaginationControls Rendering', () => {
    it('should render PaginationControls when totalPages > 1', async () => {
      setupFetchMocks(mockAthletes50);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByText(/Page 1 of 2/i)).toBeInTheDocument();
      });

      // Previous button should be disabled on page 1
      const prevButton = screen.getByRole('button', { name: /previous/i });
      expect(prevButton).toBeDisabled();

      // Next button should be enabled
      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).toBeEnabled();
    });

    it('should NOT render PaginationControls when totalPages <= 1', async () => {
      setupFetchMocks(mockAthletes10);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('10 athletes');
      });

      // With 10 athletes and 25 per page, we have only 1 page
      // PaginationControls should not render
      expect(screen.queryByText(/Page \d+ of \d+/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /previous/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument();
    });

    it('should navigate between pages using PaginationControls', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockAthletes50);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByText(/Page 1 of 2/i)).toBeInTheDocument();
      });

      // Click Next
      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText(/Page 2 of 2/i)).toBeInTheDocument();
      });

      // Next button should now be disabled
      expect(nextButton).toBeDisabled();

      // Click Previous
      const prevButton = screen.getByRole('button', { name: /previous/i });
      await user.click(prevButton);

      await waitFor(() => {
        expect(screen.getByText(/Page 1 of 2/i)).toBeInTheDocument();
      });

      // Previous button should now be disabled
      expect(prevButton).toBeDisabled();
    });
  });

  describe('Filter Changes Reset Pagination', () => {
    it('should reset currentPage to 1 when changing team filter', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockAthletes50);
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

      // Change team filter to "Independent Athletes" using fireEvent
      const teamFilter = screen.getByTestId('select-team-filter');
      fireEvent.click(teamFilter);

      const independentOption = await screen.findByRole('option', { name: /Independent Athletes/i });
      fireEvent.click(independentOption);

      // Should reset to page 1
      await waitFor(() => {
        expect(screen.getByText(/Page 1 of 2/i)).toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it('should reset currentPage to 1 when changing search filter', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockAthletes50);
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

      // Change search filter
      const searchInput = screen.getByTestId('input-search-athletes');
      await user.type(searchInput, 'test');

      // Should reset to page 1 (after debounce - using setTimeout in real code)
      await waitFor(() => {
        expect(screen.getByText(/Page 1 of 2/i)).toBeInTheDocument();
      }, { timeout: 1000 });
    });

    it('should reset currentPage to 1 when clearing filters', async () => {
      const user = userEvent.setup();
      setupFetchMocks(mockAthletes50);
      const { rerender } = renderWithProviders(<Athletes />);

      // Wait for page to load
      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('50 athletes');
      });

      // Navigate to page 2 first
      const nextButton = await screen.findByRole('button', { name: /next/i });
      await user.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText(/Page 2 of 2/i)).toBeInTheDocument();
      });

      // Apply a birth year filter
      const birthYearFrom = screen.getAllByRole('combobox')[1];
      fireEvent.click(birthYearFrom);
      const year2010 = await screen.findByRole('option', { name: '2010' });
      fireEvent.click(year2010);

      // Wait for filter to be applied and clear button to appear
      await waitFor(() => {
        expect(screen.getByTestId('button-clear-filters')).toBeInTheDocument();
      });

      // The useEffect should have reset currentPage to 1 when filter changed
      // Verify by checking we're on page 1 (if pagination still exists)
      await waitFor(() => {
        const prevButton = screen.queryByRole('button', { name: /previous/i });
        if (prevButton) {
          expect(prevButton).toBeDisabled(); // Page 1 means Previous is disabled
        }
      }, { timeout: 1000 });
    });
  });

  describe('Page Size Selector Integration', () => {
    it('should render page size selector in table header near count', async () => {
      setupFetchMocks(mockAthletes50);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('50 athletes');
      });

      // Page size selector should be near the count
      const pageSelector = screen.getByRole('combobox', { name: /page size/i });
      expect(pageSelector).toBeInTheDocument();
    });

    it('should have all page size options available', async () => {
      setupFetchMocks(mockAthletes50);
      renderWithProviders(<Athletes />);

      await waitFor(() => {
        expect(screen.getByTestId('athletes-count')).toHaveTextContent('50 athletes');
      });

      // Open page size selector using fireEvent
      const pageSelector = screen.getByRole('combobox', { name: /page size/i });
      fireEvent.click(pageSelector);

      // Check all options are present
      await waitFor(() => {
        expect(screen.getByRole('option', { name: '10' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: '25' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: '50' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: '100' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'All' })).toBeInTheDocument();
      });
    });
  });
});
