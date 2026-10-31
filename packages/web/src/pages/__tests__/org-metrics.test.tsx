/**
 * Coaches can open the org metrics page read-only; only org admins / site admins can change it.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

let authState: any;
const cardProps = vi.fn();
const listProps = vi.fn();

vi.mock('wouter', () => ({
  useParams: () => ({ id: 'org-1' }),
  Redirect: ({ to }: { to: string }) => <div data-testid="redirect">{to}</div>,
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => authState }));
vi.mock('@/lib/organization-api', () => ({
  useOrganization: () => ({ data: { customMetricsEnabled: true }, isLoading: false }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@tanstack/react-query', async (orig) => ({
  ...(await orig<typeof import('@tanstack/react-query')>()),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/components/ui/confirmation-dialog', () => ({
  useConfirmation: () => ({ confirm: vi.fn(), ConfirmationComponent: null }),
}));
vi.mock('@/components/organization-metrics-card', () => ({
  default: (props: any) => {
    cardProps(props);
    return <div data-testid="metrics-card" />;
  },
}));
vi.mock('@/components/custom-metrics', () => ({
  CustomOrgMetricList: (props: any) => {
    listProps(props);
    return <div data-testid="custom-list" />;
  },
}));

import OrgMetricsPage from '../org-metrics';

const as = (role: string, isSiteAdmin = false) => {
  authState = {
    user: { id: 'u', isSiteAdmin },
    userOrganizations: [{ organizationId: 'org-1', role }],
    isLoading: false,
  };
};

beforeEach(() => {
  cardProps.mockClear();
  listProps.mockClear();
});

describe('OrgMetricsPage access', () => {
  it('lets a coach view the page read-only', () => {
    as('coach');
    render(<OrgMetricsPage />);
    expect(screen.getByTestId('metrics-card')).toBeInTheDocument();
    expect(cardProps).toHaveBeenCalledWith(expect.objectContaining({ canEdit: false }));
    expect(listProps).toHaveBeenCalledWith(expect.objectContaining({ canEdit: false }));
    expect(screen.queryByText('Recalculate')).not.toBeInTheDocument();
  });

  it('keeps editing and recalculation for org admins', () => {
    as('org_admin');
    render(<OrgMetricsPage />);
    expect(cardProps).toHaveBeenCalledWith(expect.objectContaining({ canEdit: true }));
    expect(listProps).toHaveBeenCalledWith(expect.objectContaining({ canEdit: true }));
    expect(screen.getByText('Recalculate')).toBeInTheDocument();
  });

  it('redirects athletes', () => {
    as('athlete');
    render(<OrgMetricsPage />);
    expect(screen.getByTestId('redirect')).toBeInTheDocument();
  });
});
