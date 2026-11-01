import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequestMock = vi.fn();
const toastMock = vi.fn();
const getMock = vi.fn();

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  STALE_TIME: { REALTIME: 0 },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));

import { PendingMembershipRequests } from '../PendingMembershipRequests';

const request = (over: Record<string, unknown> = {}) => ({
  id: 'req-1',
  userId: 'u-1',
  organizationId: 'org-a',
  status: 'pending',
  requestedRole: 'athlete',
  discoveryMethod: 'join_code',
  createdAt: new Date(Date.now() - 3600_000).toISOString(),
  expiresAt: null,
  user: {
    id: 'u-1', firstName: 'Lucy', lastName: 'Ortiz', fullName: 'Lucy Ortiz', email: 'lucy@example.com',
    isEmailVerified: true, school: 'Central', graduationYear: 2028, birthYear: 2010,
  },
  organization: { id: 'org-a', name: 'Alpha Athletics' },
  ...over,
});

const requestB = request({
  id: 'req-2', userId: 'u-2', organizationId: 'org-b',
  user: { ...request().user, id: 'u-2', fullName: 'Sam Rivera', firstName: 'Sam', lastName: 'Rivera', email: 'sam@example.com', isEmailVerified: false },
  organization: { id: 'org-b', name: 'Beta Club' },
});

let client: QueryClient;

function renderComponent() {
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, queryFn: async ({ queryKey }) => getMock(String(queryKey[0])) },
    },
  });
  vi.spyOn(client, 'invalidateQueries');
  return render(
    <QueryClientProvider client={client}>
      <PendingMembershipRequests />
    </QueryClientProvider>,
  );
}

describe('PendingMembershipRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiRequestMock.mockResolvedValue({ json: async () => ({}) });
    getMock.mockImplementation(async (url: string) => {
      if (url === '/api/membership-requests/pending') return { requests: [request(), requestB] };
      if (url.endsWith('/unlinked-athletes')) {
        return { athletes: [{ id: 'ath-1', fullName: 'Old Athlete', firstName: 'Old', lastName: 'Athlete', birthYear: 2010, school: 'Beta High' }] };
      }
      return {};
    });
  });

  it('loads the cross-organization pending list (not the dead per-org URL) and groups it by organization', async () => {
    renderComponent();
    expect(await screen.findByText('Alpha Athletics')).toBeInTheDocument();
    expect(screen.getByText('Beta Club')).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith('/api/membership-requests/pending');
    expect(screen.getByText(/pending membership requests \(2\)/i)).toBeInTheDocument();
  });

  it('shows the name and email, and flags an unverified email', async () => {
    renderComponent();
    expect(await screen.findByText('Lucy Ortiz')).toBeInTheDocument();
    expect(screen.getByText('lucy@example.com')).toBeInTheDocument();
    expect(screen.getAllByText(/email not verified/i)).toHaveLength(1); // only Sam
  });

  it('approves through the approve endpoint and refreshes everything that changed', async () => {
    renderComponent();
    fireEvent.click(await screen.findByTestId('approve-request-req-1'));
    await waitFor(() =>
      expect(apiRequestMock).toHaveBeenCalledWith('POST', '/api/membership-requests/req-1/approve'),
    );
    await waitFor(() => {
      const keys = (client.invalidateQueries as any).mock.calls.map((c: any[]) => c[0].queryKey[0]);
      expect(keys).toEqual(expect.arrayContaining([
        '/api/membership-requests/pending',
        '/api/organizations-with-users',
        '/api/users/unaffiliated',
        '/api/organizations/org-a/profile',
      ]));
    });
  });

  it('rejects with the typed reason', async () => {
    renderComponent();
    fireEvent.click(await screen.findByTestId('reject-request-req-1'));
    fireEvent.change(screen.getByPlaceholderText(/reason \(optional\)/i), { target: { value: 'Not on the roster' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() =>
      expect(apiRequestMock).toHaveBeenCalledWith('POST', '/api/membership-requests/req-1/reject', { reason: 'Not on the roster' }),
    );
  });

  it("links using the request's own organization, not another organization's athletes", async () => {
    renderComponent();
    fireEvent.click(await screen.findByTestId('link-request-req-2')); // Beta Club's request
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/api/organizations/org-b/unlinked-athletes'));
    expect(getMock).not.toHaveBeenCalledWith('/api/organizations/org-a/unlinked-athletes');

    fireEvent.click(await screen.findByText('Old Athlete'));
    fireEvent.click(screen.getByRole('button', { name: /link & approve/i }));
    await waitFor(() =>
      expect(apiRequestMock).toHaveBeenCalledWith('POST', '/api/membership-requests/req-2/approve', { linkToAthleteId: 'ath-1' }),
    );
    await waitFor(() => {
      const keys = (client.invalidateQueries as any).mock.calls.map((c: any[]) => c[0].queryKey[0]);
      expect(keys).toContain('/api/organizations/org-b/unlinked-athletes');
    });
  });

  it('refreshes the list when a decision fails, so a request someone else already handled disappears', async () => {
    apiRequestMock.mockRejectedValueOnce(new Error('400: {"message":"Only pending requests can be approved"}'));
    renderComponent();
    fireEvent.click(await screen.findByTestId('approve-request-req-1'));
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })));
    await waitFor(() =>
      expect(getMock.mock.calls.filter((c) => c[0] === '/api/membership-requests/pending').length).toBeGreaterThan(1),
    );
  });

  it('closes the link dialog when the link-approve fails (the request was probably already handled)', async () => {
    apiRequestMock.mockRejectedValueOnce(new Error('400: {"message":"Only pending requests can be approved"}'));
    renderComponent();
    fireEvent.click(await screen.findByTestId('link-request-req-2'));
    fireEvent.click(await screen.findByText('Old Athlete'));
    fireEvent.click(screen.getByRole('button', { name: /link & approve/i }));

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('only disables the row being decided, so several can be approved in a row', async () => {
    apiRequestMock.mockReturnValue(new Promise(() => {})); // never settles
    renderComponent();
    fireEvent.click(await screen.findByTestId('approve-request-req-1'));
    await waitFor(() => expect(screen.getByTestId('approve-request-req-1')).toBeDisabled());
    expect(screen.getByTestId('approve-request-req-2')).not.toBeDisabled();
  });

  it('says so when the list was cut off', async () => {
    getMock.mockResolvedValue({ requests: [request(), requestB], truncated: true });
    renderComponent();
    expect(await screen.findByText(/pending membership requests \(2\+\)/i)).toBeInTheDocument();
    expect(screen.getByText(/showing the oldest/i)).toBeInTheDocument();
  });

  it('renders nothing for someone who is not an admin (403)', async () => {
    getMock.mockRejectedValue(new Error('403: {"message":"Organization admin access required"}'));
    const { container } = renderComponent();
    await waitFor(() => expect(getMock).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('shows a fixed error message for other failures, never the server text', async () => {
    getMock.mockRejectedValue(new Error('500: {"message":"relation \\"membership_requests\\" does not exist"}'));
    renderComponent();
    expect(await screen.findByText(/couldn't load membership requests/i)).toBeInTheDocument();
    expect(screen.queryByText(/does not exist/i)).not.toBeInTheDocument();
  });

  it('renders nothing when there are no pending requests', async () => {
    getMock.mockResolvedValue({ requests: [] });
    const { container } = renderComponent();
    await waitFor(() => expect(getMock).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
