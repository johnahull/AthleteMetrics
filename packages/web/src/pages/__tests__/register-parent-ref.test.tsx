/**
 * Regression test — parent registration via the opaque `ref` token.
 *
 * consent-confirmation.tsx now links to /register?role=parent&ref=<token>
 * instead of &email=...&consent=..., so `prefilledEmail` is empty for this
 * flow. The email input's onChange handler was gated on `!isParentMode`
 * alone, which silently discarded every keystroke in parent mode even
 * though the field was not readOnly — the form could never be submitted.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Register from '../register';

vi.mock('wouter', () => ({
  useLocation: () => ['/register', vi.fn()],
}));

vi.mock('@/components/auth/oauth-buttons', () => ({
  OAuthButtons: () => null,
}));

describe('Register page — parent mode email field', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('ref-only flow (no prefilled email): typing in the email field updates its value', () => {
    vi.stubGlobal('location', { search: '?role=parent&ref=sometoken' });

    render(<Register />);

    const emailInput = screen.getByLabelText('Email') as HTMLInputElement;
    expect(emailInput).not.toHaveAttribute('readonly');

    fireEvent.change(emailInput, { target: { value: 'parent@example.com' } });

    expect(emailInput.value).toBe('parent@example.com');
  });

  it('email-prefilled flow (notification link): email field stays read-only and pre-filled', () => {
    vi.stubGlobal('location', { search: '?role=parent&email=parent%40example.com' });

    render(<Register />);

    const emailInput = screen.getByLabelText('Email') as HTMLInputElement;
    expect(emailInput).toHaveAttribute('readonly');
    expect(emailInput.value).toBe('parent@example.com');
  });
});
