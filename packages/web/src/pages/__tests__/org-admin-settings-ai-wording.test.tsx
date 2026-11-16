/**
 * Component tests for the org AI wording fields (philosophy and three tones) on the org admin settings page.
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

const DEFAULTS = { philosophy: '', toneParent: 'SITE PARENT TONE', toneAthlete: 'DEFAULT ATHLETE TONE', toneCoach: 'DEFAULT COACH TONE' };

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => (String(queryKey[0]).endsWith('/ai-prompt-defaults') ? { defaults: DEFAULTS, maxLength: 1500 } : {}),
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OrgAdminSettings />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockUpdate.mockReset().mockResolvedValue({});
  mockOrg = {
    id: 'org-1', name: 'Org', aiEnabled: true, aiEnabledBySiteAdmin: true, wellnessEnabled: false,
    aiPromptContext: '', aiStyleExample: '', aiPromptOverrides: null,
  };
});

describe('OrgAdminSettings AI wording fields', () => {
  it('shows the four fields when AI is on, with the inherited text as placeholder', async () => {
    renderPage();
    expect(screen.getByLabelText('Coaching philosophy')).toBeInTheDocument();
    expect(screen.getByLabelText('Athlete tone')).toBeInTheDocument();
    expect(screen.getByLabelText('Coach tone')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Parent tone')).toHaveAttribute('placeholder', 'SITE PARENT TONE'));
    expect(screen.queryByLabelText('Role')).toBeNull();
    expect(screen.queryByLabelText('Analysis checklist')).toBeNull();
  });

  it('hides them when AI is off', () => {
    mockOrg.aiEnabled = false;
    renderPage();
    expect(screen.queryByLabelText('Parent tone')).toBeNull();
  });

  it('shows saved org wording', () => {
    mockOrg.aiPromptOverrides = { toneCoach: 'Dry and brief.' };
    renderPage();
    expect(screen.getByLabelText('Coach tone')).toHaveValue('Dry and brief.');
    expect(screen.getByLabelText('Parent tone')).toHaveValue('');
  });

  it('sends only aiPromptOverrides, with the non-empty fields, when one changed', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Parent tone'), { target: { value: 'Warm and plain.' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ aiPromptOverrides: { toneParent: 'Warm and plain.' } }));
  });

  it('keeps unchanged saved fields in the object when another one changes', async () => {
    mockOrg.aiPromptOverrides = { toneCoach: 'Dry.' };
    renderPage();
    fireEvent.change(screen.getByLabelText('Athlete tone'), { target: { value: 'Punchy.' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ aiPromptOverrides: { toneAthlete: 'Punchy.', toneCoach: 'Dry.' } }));
  });

  it('sends null when the last saved field is emptied', async () => {
    mockOrg.aiPromptOverrides = { toneCoach: 'Dry.' };
    renderPage();
    fireEvent.change(screen.getByLabelText('Coach tone'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ aiPromptOverrides: null }));
  });

  it('sends nothing for the wording when untouched', async () => {
    mockOrg.aiPromptOverrides = { toneCoach: 'Dry.' };
    renderPage();
    fireEvent.change(screen.getByLabelText('Example analysis (your style)'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ aiStyleExample: 'x' }));
  });
});
