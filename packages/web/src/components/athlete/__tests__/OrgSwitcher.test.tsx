import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrgSwitcher } from '../OrgSwitcher';
import { AthleteOrgProvider } from '@/lib/athlete-org-context';
import * as authModule from '@/lib/auth';
import type { EnhancedUser, UserOrganization } from '@/lib/types/user';

// Mock organization data
const mockOrganizations: UserOrganization[] = [
  { organizationId: 'org-1', organizationName: 'College Athletics', role: 'athlete', createdAt: '2024-01-01' },
  { organizationId: 'org-2', organizationName: 'High School Sports', role: 'athlete', createdAt: '2024-01-01' },
  { organizationId: 'org-3', organizationName: 'Club Team', role: 'athlete', createdAt: '2024-01-01' },
];

// Mock user
const mockUser: EnhancedUser = {
  id: 'user-123',
  username: 'athlete1',
  role: 'athlete',
  athleteId: 'athlete-123',
  isSiteAdmin: false,
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
};

// Mock useAuth hook
const createMockUseAuth = (overrides = {}) => ({
  user: mockUser,
  userOrganizations: mockOrganizations,
  login: vi.fn(),
  logout: vi.fn(),
  isLoading: false,
  organizationContext: null,
  setOrganizationContext: vi.fn(),
  impersonationStatus: null,
  startImpersonation: vi.fn(),
  stopImpersonation: vi.fn(),
  checkImpersonationStatus: vi.fn(),
  ...overrides,
});

// Wrapper component that provides context
const createWrapper = (authOverrides = {}) => {
  const mockUseAuth = createMockUseAuth(authOverrides);

  // Mock the useAuth hook
  vi.spyOn(authModule, 'useAuth').mockReturnValue(mockUseAuth);

  return ({ children }: { children: React.ReactNode }) => (
    <AthleteOrgProvider>{children}</AthleteOrgProvider>
  );
};

describe('OrgSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear localStorage before each test
    localStorage.clear();
  });

  describe('Rendering current selection', () => {
    it('should render "All Organizations" label when filter mode is "all"', () => {
      render(<OrgSwitcher />, { wrapper: createWrapper() });

      expect(screen.getByText('All Organizations')).toBeInTheDocument();
    });

    it('should render "Personal Only" label when filter mode is "personal"', async () => {
      const user = userEvent.setup();
      render(<OrgSwitcher />, { wrapper: createWrapper() });

      // Open dropdown and select "Personal Only"
      const trigger = screen.getByRole('combobox', { name: /organization filter/i });
      await user.click(trigger);

      const personalOption = screen.getByRole('menuitemcheckbox', { name: /personal only/i });
      await user.click(personalOption);

      await waitFor(() => {
        expect(screen.getByText('Personal Only')).toBeInTheDocument();
      });
    });

    it('should render organization name when specific org is selected', async () => {
      const user = userEvent.setup();
      render(<OrgSwitcher />, { wrapper: createWrapper() });

      // Open dropdown
      const trigger = screen.getByRole('combobox', { name: /organization filter/i });
      await user.click(trigger);

      // Select specific org
      const orgOption = screen.getByRole('menuitemcheckbox', { name: /college athletics/i });
      await user.click(orgOption);

      await waitFor(() => {
        expect(screen.getByText('College Athletics')).toBeInTheDocument();
      });
    });

    it('should display correct icon for each filter mode', async () => {
      const user = userEvent.setup();
      const { container } = render(<OrgSwitcher />, { wrapper: createWrapper() });

      // "All Organizations" should show Globe icon (initial state)
      expect(container.querySelector('svg[data-icon="globe"]')).toBeInTheDocument();

      // Switch to "Personal Only"
      const trigger = screen.getByRole('combobox', { name: /organization filter/i });
      await user.click(trigger);
      const personalOption = screen.getByRole('menuitemcheckbox', { name: /personal only/i });
      await user.click(personalOption);

      // Wait for dropdown to close and state to update
      await waitFor(() => {
        expect(screen.getByText('Personal Only')).toBeInTheDocument();
      });

      // Personal should show User icon
      expect(container.querySelector('svg[data-icon="user"]')).toBeInTheDocument();
    });
  });

  describe('Dropdown options', () => {
    it('should show all options when dropdown is opened', async () => {
      const user = userEvent.setup();
      render(<OrgSwitcher />, { wrapper: createWrapper() });

      const trigger = screen.getByRole('combobox', { name: /organization filter/i });
      await user.click(trigger);

      // Should show "All Organizations" (menuitemcheckbox, not menuitem)
      expect(screen.getByRole('menuitemcheckbox', { name: /all organizations/i })).toBeInTheDocument();

      // Should show "Personal Only"
      expect(screen.getByRole('menuitemcheckbox', { name: /personal only/i })).toBeInTheDocument();

      // Should show all organizations
      expect(screen.getByRole('menuitemcheckbox', { name: /college athletics/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitemcheckbox', { name: /high school sports/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitemcheckbox', { name: /club team/i })).toBeInTheDocument();
    });

    it('should show visual separator between special options and organizations', async () => {
      const user = userEvent.setup();
      render(<OrgSwitcher />, { wrapper: createWrapper() });

      const trigger = screen.getByRole('combobox', { name: /organization filter/i });
      await user.click(trigger);

      // Check for separator element - Radix UI DropdownMenuSeparator has role="separator"
      const separators = screen.getAllByRole('separator');
      expect(separators.length).toBeGreaterThan(0);
    });

    it('should show checkmark/indicator on selected option', async () => {
      const user = userEvent.setup();
      render(<OrgSwitcher />, { wrapper: createWrapper() });

      const trigger = screen.getByRole('combobox', { name: /organization filter/i });
      await user.click(trigger);

      // The "All Organizations" option should be marked as selected (initial state)
      const allOrgsOption = screen.getByRole('menuitemcheckbox', { name: /all organizations/i });
      expect(allOrgsOption).toHaveAttribute('data-state', 'checked');
    });
  });

  describe('User interactions', () => {
    it('should call setFilterMode when option is selected', async () => {
      const user = userEvent.setup();
      render(<OrgSwitcher />, { wrapper: createWrapper() });

      const trigger = screen.getByRole('combobox', { name: /organization filter/i });
      await user.click(trigger);

      const personalOption = screen.getByRole('menuitemcheckbox', { name: /personal only/i });
      await user.click(personalOption);

      // Verify state changed by checking displayed text
      await waitFor(() => {
        expect(screen.getByText('Personal Only')).toBeInTheDocument();
      });
    });

    it('should close dropdown after selection', async () => {
      const user = userEvent.setup();
      render(<OrgSwitcher />, { wrapper: createWrapper() });

      const trigger = screen.getByRole('combobox', { name: /organization filter/i });
      await user.click(trigger);

      // Verify dropdown is open
      expect(screen.getByRole('menuitemcheckbox', { name: /personal only/i })).toBeInTheDocument();

      const personalOption = screen.getByRole('menuitemcheckbox', { name: /personal only/i });
      await user.click(personalOption);

      // Dropdown should close
      await waitFor(() => {
        expect(screen.queryByRole('menuitemcheckbox', { name: /personal only/i })).not.toBeInTheDocument();
      });
    });

    it('should persist selection to localStorage via context', async () => {
      const user = userEvent.setup();
      render(<OrgSwitcher />, { wrapper: createWrapper() });

      const trigger = screen.getByRole('combobox', { name: /organization filter/i });
      await user.click(trigger);

      const orgOption = screen.getByRole('menuitemcheckbox', { name: /college athletics/i });
      await user.click(orgOption);

      // Wait for state update
      await waitFor(() => {
        expect(screen.getByText('College Athletics')).toBeInTheDocument();
      });

      // Verify localStorage was updated (stored as JSON string)
      const stored = localStorage.getItem('athlete-org-filter-user-123');
      expect(stored).toBe('"org-1"'); // JSON.stringify adds quotes
    });
  });

  describe('Edge cases', () => {
    it('should only show "Personal Only" option when user has 0 organizations', async () => {
      const user = userEvent.setup();
      render(<OrgSwitcher />, {
        wrapper: createWrapper({ userOrganizations: [] }),
      });

      const trigger = screen.getByRole('combobox', { name: /organization filter/i });
      await user.click(trigger);

      // Should show "Personal Only"
      expect(screen.getByRole('menuitemcheckbox', { name: /personal only/i })).toBeInTheDocument();

      // Should NOT show "All Organizations" or any org options
      expect(screen.queryByRole('menuitemcheckbox', { name: /all organizations/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('menuitemcheckbox', { name: /college athletics/i })).not.toBeInTheDocument();
    });

    it('should auto-select "personal" when user has 0 organizations', () => {
      render(<OrgSwitcher />, {
        wrapper: createWrapper({ userOrganizations: [] }),
      });

      // Should display "Personal Only" immediately
      expect(screen.getByText('Personal Only')).toBeInTheDocument();
    });

    it('should show loading skeleton when auth is loading', () => {
      // Create wrapper that returns null for user (simulating loading state before auth completes)
      const mockUseAuth = createMockUseAuth({ user: null, isLoading: true, userOrganizations: null });
      vi.spyOn(authModule, 'useAuth').mockReturnValue(mockUseAuth);

      const Wrapper = ({ children }: { children: React.ReactNode }) => (
        <AthleteOrgProvider>{children}</AthleteOrgProvider>
      );

      render(<OrgSwitcher />, { wrapper: Wrapper });

      // Should show skeleton instead of dropdown
      expect(screen.getByTestId('org-switcher-skeleton')).toBeInTheDocument();
    });

    it('should show all options even with single organization', async () => {
      const user = userEvent.setup();
      const singleOrg = [{ organizationId: 'org-1', organizationName: 'Single Org', role: 'athlete' as const, createdAt: '2024-01-01' }];

      render(<OrgSwitcher />, {
        wrapper: createWrapper({ userOrganizations: singleOrg }),
      });

      const trigger = screen.getByRole('combobox', { name: /organization filter/i });
      await user.click(trigger);

      // All options should be available
      expect(screen.getByRole('menuitemcheckbox', { name: /all organizations/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitemcheckbox', { name: /personal only/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitemcheckbox', { name: /single org/i })).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA label on trigger', () => {
      render(<OrgSwitcher />, { wrapper: createWrapper() });

      const trigger = screen.getByRole('combobox', { name: /organization filter/i });
      expect(trigger).toBeInTheDocument();
    });

    it('should be keyboard navigable', async () => {
      const user = userEvent.setup();
      render(<OrgSwitcher />, { wrapper: createWrapper() });

      const trigger = screen.getByRole('combobox', { name: /organization filter/i });

      // Focus trigger
      await user.tab();
      expect(trigger).toHaveFocus();

      // Open with Enter
      await user.keyboard('{Enter}');

      // Verify dropdown opened
      await waitFor(() => {
        expect(screen.getByRole('menuitemcheckbox', { name: /all organizations/i })).toBeInTheDocument();
      });
    });

    it('should have descriptive labels for screen readers', async () => {
      const user = userEvent.setup();
      render(<OrgSwitcher />, { wrapper: createWrapper() });

      const trigger = screen.getByRole('combobox', { name: /organization filter/i });
      await user.click(trigger);

      // Each menu item should have descriptive text
      expect(screen.getByRole('menuitemcheckbox', { name: /all organizations/i })).toHaveAccessibleName();
      expect(screen.getByRole('menuitemcheckbox', { name: /personal only/i })).toHaveAccessibleName();
    });
  });

  describe('Integration with AthleteOrgContext', () => {
    it('should use filterMode from context', () => {
      render(<OrgSwitcher />, { wrapper: createWrapper() });

      // Default filterMode is "all"
      expect(screen.getByText('All Organizations')).toBeInTheDocument();
    });

    it('should use organizations array from context', async () => {
      const user = userEvent.setup();
      render(<OrgSwitcher />, { wrapper: createWrapper() });

      const trigger = screen.getByRole('combobox', { name: /organization filter/i });
      await user.click(trigger);

      // All organizations from context should be rendered
      mockOrganizations.forEach(org => {
        expect(screen.getByRole('menuitemcheckbox', { name: new RegExp(org.organizationName, 'i') })).toBeInTheDocument();
      });
    });
  });
});
