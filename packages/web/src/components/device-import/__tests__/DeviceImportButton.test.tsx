import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeviceImportButton } from '../DeviceImportButton';

const authState: { user: any; userOrganizations: any } = { user: null, userOrganizations: null };

vi.mock('@/lib/auth', () => ({
  useAuth: () => authState,
}));

vi.mock('../DeviceImportDialog', () => ({
  DeviceImportDialog: () => null,
}));

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
});

const member = (role: string, organizationId = 'org-1') => [{ organizationId, role }];

describe('DeviceImportButton visibility', () => {
  beforeEach(() => {
    authState.user = { id: 'u1', isSiteAdmin: false };
    authState.userOrganizations = null;
  });

  it.each(['org_admin', 'coach'])('shows for a %s of the event organization (no currentOrganization on user)', (role) => {
    authState.userOrganizations = member(role);
    render(<DeviceImportButton organizationId="org-1" />);
    expect(screen.getByRole('button', { name: /import device data/i })).toBeTruthy();
  });

  it('is hidden for an athlete of the organization', () => {
    authState.userOrganizations = member('athlete');
    render(<DeviceImportButton organizationId="org-1" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is hidden for a coach of a different organization', () => {
    authState.userOrganizations = member('coach', 'org-2');
    render(<DeviceImportButton organizationId="org-1" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows for a site admin', () => {
    authState.user = { id: 'u1', isSiteAdmin: true };
    render(<DeviceImportButton organizationId="org-1" />);
    expect(screen.getByRole('button', { name: /import device data/i })).toBeTruthy();
  });

  it('is disabled with a tooltip for a non testing_day event', async () => {
    authState.userOrganizations = member('org_admin');
    render(<DeviceImportButton organizationId="org-1" eventId="e1" eventType="combine" />);
    const button = screen.getByRole('button', { name: /import device data/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await userEvent.hover(button.parentElement!);
    expect(
      (await screen.findAllByText('Device import is only available for Testing Day events')).length
    ).toBeGreaterThan(0);
  });
});
