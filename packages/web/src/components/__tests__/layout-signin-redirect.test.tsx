/**
 * Layout: a signed-out visitor on a protected page is sent to /login with a return path
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import Layout from '../layout';
import * as authModule from '@/lib/auth';

const mockSetLocation = vi.fn();
let mockLocation = '/wellness/my-requests';

vi.mock('wouter', () => ({ useLocation: () => [mockLocation, mockSetLocation] }));
vi.mock('@/lib/auth', () => ({ useAuth: vi.fn() }));
vi.mock('@/hooks/useKeyboardShortcuts', () => ({ useKeyboardShortcuts: vi.fn() }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/background-sync', () => ({ backgroundSync: { start: vi.fn(), stop: vi.fn() } }));
vi.mock('../sidebar', () => ({ default: () => null }));
vi.mock('../impersonation-banner', () => ({ default: () => null }));
vi.mock('../keyboard-shortcuts-dialog', () => ({ KeyboardShortcutsDialog: () => null }));
vi.mock('../measurement-form', () => ({ default: () => null }));
vi.mock('../mobile-bottom-nav', () => ({ MobileBottomNav: () => null }));
vi.mock('../offline-status-indicator', () => ({ OfflineStatusIndicator: () => null }));
vi.mock('../footer', () => ({ Footer: () => null }));

function renderSignedOut(location: string, search = '') {
  mockLocation = location;
  window.history.replaceState(null, '', location + search);
  vi.mocked(authModule.useAuth).mockReturnValue({
    user: null,
    userOrganizations: [],
    isLoading: false,
    logout: vi.fn(),
  } as any);
  render(<Layout><div /></Layout>);
}

describe('Layout signed-out redirect', () => {
  beforeEach(() => {
    mockSetLocation.mockReset();
  });

  it('carries the protected path to /login as ?redirect', () => {
    renderSignedOut('/wellness/my-requests', '?tab=history');
    expect(mockSetLocation).toHaveBeenCalledWith(
      `/login?redirect=${encodeURIComponent('/wellness/my-requests?tab=history')}`
    );
  });

  it('does not redirect from a public route', () => {
    renderSignedOut('/login');
    expect(mockSetLocation).not.toHaveBeenCalled();
  });
});
