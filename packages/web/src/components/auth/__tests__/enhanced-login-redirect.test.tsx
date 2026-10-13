import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EnhancedLoginForm } from '../enhanced-login-form';

vi.mock('wouter', () => ({ useLocation: () => ['/login', vi.fn()] }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ login: vi.fn() }) }));
vi.mock('../oauth-buttons', () => ({ OAuthButtons: () => null }));

async function signIn(search: string, redirectUrl = '/dashboard') {
  const loc = { search, pathname: '/login', origin: 'http://localhost', href: 'http://localhost/login' };
  vi.stubGlobal('location', loc);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user: { id: 'u1' }, redirectUrl }) }),
  );
  render(<EnhancedLoginForm />);
  fireEvent.change(screen.getByLabelText('Username or Email'), { target: { value: 'lucy' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
  fireEvent.click(screen.getByTestId('button-login'));
  await waitFor(() => expect(loc.href).not.toBe('http://localhost/login'));
  return loc.href;
}

describe('EnhancedLoginForm ?redirect', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('a safe ?redirect wins over the backend redirectUrl', async () => {
    expect(await signIn('?redirect=/join/JOINBTA')).toBe('/join/JOINBTA');
  });

  it('an unsafe ?redirect falls back to the backend redirectUrl', async () => {
    expect(await signIn('?redirect=//evil.com', '/my-dashboard')).toBe('/my-dashboard');
  });

  it('no ?redirect keeps the backend redirectUrl', async () => {
    expect(await signIn('', '/admin')).toBe('/admin');
  });
});
