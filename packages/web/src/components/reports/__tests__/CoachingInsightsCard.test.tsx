/**
 * Component tests for CoachingInsightsCard — COPPA locked-state (GAP 9)
 *
 * Focuses exclusively on the aiConsentGranted prop guard that gates AI insight
 * rendering for minor athletes. The full happy-path (generate / edit / save) is
 * tested separately; these cases validate the fail-closed COPPA boundary.
 *
 * Key design note (documented as a known trap):
 *   The component declares `aiConsentGranted = true` as its default prop value.
 *   This means that omitting the prop entirely results in UNBLOCKED access for
 *   any athlete — including minors if the parent component forgot to pass the
 *   prop. The tests below document and verify this default-true behaviour so
 *   that any future change to a safer default (e.g. `false`) is caught
 *   immediately by the test suite.
 *
 * Fail-closed rule (from component source):
 *   if (aiConsentGranted !== true) { return <locked amber card> }
 *   This means null, undefined, false, and 0 all render the locked state.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CoachingInsightsCard } from '../CoachingInsightsCard';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Silence toast side-effects; not under test here
const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Stub out the React-Query mutation hooks — we only care about rendering,
// not about what happens when the user interacts with the card.
vi.mock('@/lib/reports-api', () => ({
  useGenerateInsights: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    data: null,
  }),
  useUpdateInsights: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
  }),
}));

// Stub MAX_INSIGHTS_LENGTH from shared schema so tests are not coupled to
// the exact numeric constant.
vi.mock('@shared/schema', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    MAX_INSIGHTS_LENGTH: 10000,
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const baseProps = {
  reportId: 'report-abc-123',
  aiEnabled: true,
  initialInsights: null,
  generatedAt: null,
  model: null,
};

// ── Locked-state tests (aiConsentGranted !== true) ────────────────────────

describe('CoachingInsightsCard — COPPA locked state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the amber locked card when aiConsentGranted={false}', () => {
    render(<CoachingInsightsCard {...baseProps} aiConsentGranted={false} />);

    // Amber card heading
    expect(screen.getByText('AI Coaching Insights')).toBeInTheDocument();

    // Consent-required badge
    expect(screen.getByText('Parental Consent Required')).toBeInTheDocument();

    // Explanatory copy
    expect(
      screen.getByText(/parental consent for ai data processing has not been granted/i)
    ).toBeInTheDocument();

    // Must NOT show the normal "Coaching Insights" card actions
    expect(screen.queryByRole('button', { name: /generate insights/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /regenerate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
  });

  it('renders the locked card when aiConsentGranted={null as any} — fails-closed', () => {
    // null is not === true, so the component must block access
    render(<CoachingInsightsCard {...baseProps} aiConsentGranted={null as any} />);

    expect(screen.getByText('Parental Consent Required')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /generate insights/i })).not.toBeInTheDocument();
  });

  it('renders the OPEN card when aiConsentGranted={undefined} — JS default-parameter trap', () => {
    // JavaScript default parameters: passing `undefined` is identical to omitting the
    // argument entirely, so `aiConsentGranted = true` kicks in.
    //
    // This means:
    //   <CoachingInsightsCard aiConsentGranted={undefined} />   → OPEN (default = true)
    //   <CoachingInsightsCard aiConsentGranted={null} />        → LOCKED (null !== true)
    //   <CoachingInsightsCard aiConsentGranted={false} />       → LOCKED (false !== true)
    //
    // The component therefore does NOT fail-closed for undefined — a parent that passes
    // `athleteConsentStatus ? true : undefined` will accidentally grant access.
    // Safe practice: always pass an explicit boolean, never undefined.
    render(<CoachingInsightsCard {...baseProps} aiConsentGranted={undefined} />);

    // undefined triggers the default (true) → normal card is rendered
    expect(screen.getByText('Coaching Insights')).toBeInTheDocument();
    expect(screen.queryByText('Parental Consent Required')).not.toBeInTheDocument();
  });

  it('renders the locked card for any other non-true value (0)', () => {
    render(<CoachingInsightsCard {...baseProps} aiConsentGranted={0 as any} />);

    expect(screen.getByText('Parental Consent Required')).toBeInTheDocument();
  });
});

// ── Unlocked state (aiConsentGranted={true}) ─────────────────────────────────

describe('CoachingInsightsCard — normal (unlocked) state when aiConsentGranted={true}', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the normal card (not locked) when aiConsentGranted={true}', () => {
    render(<CoachingInsightsCard {...baseProps} aiConsentGranted={true} />);

    // The normal card uses "Coaching Insights" without the amber treatment
    expect(screen.getByText('Coaching Insights')).toBeInTheDocument();

    // Should NOT show the COPPA badge
    expect(screen.queryByText('Parental Consent Required')).not.toBeInTheDocument();

    // Without insights, the generate button should be present
    expect(screen.getByRole('button', { name: /generate insights/i })).toBeInTheDocument();
  });

  it('renders the normal card with existing insights when aiConsentGranted={true}', () => {
    render(
      <CoachingInsightsCard
        {...baseProps}
        aiConsentGranted={true}
        initialInsights="Great performance this season."
        generatedAt="2025-01-15T10:00:00Z"
      />
    );

    // The display view shows the Edit and Regenerate actions
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument();

    // Should NOT show the COPPA badge
    expect(screen.queryByText('Parental Consent Required')).not.toBeInTheDocument();
  });
});

// ── Default prop value documentation ─────────────────────────────────────────
//
// COPPA TRAP — read carefully before changing the default.
//
// The component signature is:
//   aiConsentGranted = true   (default value)
//
// This means: when a parent component renders <CoachingInsightsCard reportId="..." aiEnabled />
// without passing aiConsentGranted at all, the card OPENS (grants access) rather than blocking.
//
// For adult athletes this is intentional — the prop is only meaningful for minors and the
// component's JSDoc says "Defaults to true for adult athletes (COPPA not applicable)."
//
// However, this creates a risk: if a new callsite renders the card for a minor and forgets
// to pass aiConsentGranted, the minor's AI data will be processed without verifying consent.
//
// The test below documents the CURRENT behaviour (default = open). If this default is ever
// changed to false (safer), this test will fail and force a deliberate decision.

describe('CoachingInsightsCard — default prop value (COPPA trap documentation)', () => {
  it('KNOWN TRAP: omitting aiConsentGranted entirely renders the OPEN (unlocked) card because the default is true', () => {
    // No aiConsentGranted prop passed — relies on the default.
    render(<CoachingInsightsCard reportId="report-xyz" aiEnabled={true} />);

    // The unlocked / normal card is rendered (not the amber blocked state).
    // This is the INTENDED behaviour for adult-athlete callsites.
    // For minor-athlete callsites, the parent MUST explicitly pass aiConsentGranted.
    expect(screen.getByText('Coaching Insights')).toBeInTheDocument();
    expect(screen.queryByText('Parental Consent Required')).not.toBeInTheDocument();
  });
});

// ── aiEnabled=false guard (pre-COPPA check) ──────────────────────────────────

describe('CoachingInsightsCard — aiEnabled=false returns null before COPPA check', () => {
  it('renders nothing when aiEnabled={false} regardless of aiConsentGranted', () => {
    const { container } = render(
      <CoachingInsightsCard {...baseProps} aiEnabled={false} aiConsentGranted={true} />
    );

    expect(container.firstChild).toBeNull();
  });
});
