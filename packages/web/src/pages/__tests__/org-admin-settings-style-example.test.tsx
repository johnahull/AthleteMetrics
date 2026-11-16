/**
 * Component tests for the "Example analysis (your style)" field on the org admin settings page.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OrgAdminSettings from '../org-admin-settings';

let mockOrg: Record<string, unknown>;
const mockUpdate = vi.fn();

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1', username: 'admin', role: 'org_admin', isSiteAdmin: false } }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('wouter', () => ({
  useParams: () => ({ id: 'org-1' }),
  useLocation: () => ['/', vi.fn()],
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));
vi.mock('@/components/ui/confirmation-dialog', () => ({
  useConfirmation: () => ({ confirm: vi.fn(), ConfirmationComponent: null }),
}));
vi.mock('@/components/invitation-modal', () => ({ InvitationModal: () => null }));
vi.mock('@/components/organization-metrics-card', () => ({ default: () => null }));
vi.mock('@/components/notifications/org-notification-settings-card', () => ({
  OrgNotificationSettingsCard: () => null,
}));
vi.mock('@/lib/organization-api', () => ({
  useOrganization: () => ({ data: mockOrg, isLoading: false, error: null }),
  useUpdateOrgAdminSettings: () => ({ mutateAsync: mockUpdate, isPending: false }),
}));
vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn() },
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async () => ({}) } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <OrgAdminSettings />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockUpdate.mockReset().mockResolvedValue({});
  mockOrg = {
    id: 'org-1', name: 'Org', aiEnabled: true, aiEnabledBySiteAdmin: true, wellnessEnabled: false, // site settings are not loaded in this test, so the form forces it off
    aiPromptContext: '', aiStyleExample: '',
  };
});

describe('OrgAdminSettings style example field', () => {
  it('renders the textarea with helper text and a 1500 counter', () => {
    renderPage();
    expect(screen.getByLabelText('Example analysis (your style)')).toBeInTheDocument();
    expect(screen.getByText('Paste one analysis written the way you want AI insights to read. Remove athlete names.')).toBeInTheDocument();
    expect(screen.getByText('0 / 1500')).toBeInTheDocument();
  });

  it('shows the saved example and its length', () => {
    mockOrg.aiStyleExample = 'Hello world';
    renderPage();
    expect(screen.getByLabelText('Example analysis (your style)')).toHaveValue('Hello world');
    expect(screen.getByText('11 / 1500')).toBeInTheDocument();
  });

  it('sends only aiStyleExample when only it changed', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Example analysis (your style)'), { target: { value: 'My style\n- bullet' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ aiStyleExample: 'My style\n- bullet' }));
  });

  it('sends null when the example is cleared', async () => {
    mockOrg.aiStyleExample = 'Old example';
    renderPage();
    fireEvent.change(screen.getByLabelText('Example analysis (your style)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ aiStyleExample: null }));
  });

  it('lets an admin remove a saved example while AI insights are off', async () => {
    mockOrg.aiEnabled = false;
    mockOrg.aiStyleExample = 'Old example';
    renderPage();
    expect(screen.getByLabelText('Example analysis (your style)')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /clear saved example/i }));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ aiStyleExample: null }));
  });

  it('shows no clear button when nothing is saved', () => {
    mockOrg.aiEnabled = false;
    renderPage();
    expect(screen.queryByRole('button', { name: /clear saved example/i })).toBeNull();
  });

  it('is disabled while AI insights are off, with an enable-first hint', () => {
    mockOrg.aiEnabled = false;
    renderPage();
    expect(screen.getByLabelText('Example analysis (your style)')).toBeDisabled();
    expect(screen.getAllByText('Enable Coaching Insights above to edit this field.')).toHaveLength(2);
  });
});
