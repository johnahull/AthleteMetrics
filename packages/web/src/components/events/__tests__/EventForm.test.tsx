/**
 * Unit tests for EventForm component
 *
 * Tests the multi-step event creation/edit wizard with steps:
 * Basic Info → Registration Settings → Metrics → Results
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EventForm } from '../EventForm';

// Polyfill for happy-dom (Radix UI components)
beforeAll(() => {
  if (typeof Element.prototype.hasPointerCapture === 'undefined') {
    Element.prototype.hasPointerCapture = function () { return false; };
  }
  if (typeof Element.prototype.setPointerCapture === 'undefined') {
    Element.prototype.setPointerCapture = function () {};
  }
  if (typeof Element.prototype.releasePointerCapture === 'undefined') {
    Element.prototype.releasePointerCapture = function () {};
  }
  if (typeof Element.prototype.scrollIntoView === 'undefined') {
    Element.prototype.scrollIntoView = function () {};
  }
});

// Mock MetricsSelector component
vi.mock('../MetricsSelector', () => ({
  MetricsSelector: ({ onSelectionChange }: { onSelectionChange?: (metrics: any[]) => void }) => (
    <div data-testid="metrics-selector">
      <button type="button" onClick={() => onSelectionChange?.([{ code: 'VERTICAL_JUMP', order: 0 }])}>
        Add Metric
      </button>
    </div>
  ),
}));

// Create wrapper with providers
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

const defaultProps = {
  onSubmit: vi.fn(),
  onCancel: vi.fn(),
  isSubmitting: false,
  organizationId: 'org-123',
};

describe('EventForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Step Navigation', () => {
    it('should display step indicators', () => {
      render(<EventForm {...defaultProps} />, { wrapper: createWrapper() });

      expect(screen.getByText('Basic Info')).toBeInTheDocument();
      expect(screen.getByText('Registration')).toBeInTheDocument();
      expect(screen.getByText('Metrics')).toBeInTheDocument();
      expect(screen.getByText('Results')).toBeInTheDocument();
    });

    it('should start at Step 1 (Basic Info)', () => {
      render(<EventForm {...defaultProps} />, { wrapper: createWrapper() });

      // Check for Step 1 content - the event name input
      expect(screen.getByText('Basic Information')).toBeInTheDocument();
      expect(screen.getByLabelText(/event name/i)).toBeInTheDocument();
    });

    it('should navigate to next step when Next clicked with valid data', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />, { wrapper: createWrapper() });

      // Fill in required fields
      await user.type(screen.getByLabelText(/event name/i), 'Test Event');

      // Get today's date and tomorrow's date for valid input
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0];

      await user.type(screen.getByLabelText(/start date/i), dateStr);

      // Click Next
      await user.click(screen.getByRole('button', { name: /next/i }));

      // Should be on Step 2 - Registration Settings
      await waitFor(() => {
        expect(screen.getByText('Registration Settings')).toBeInTheDocument();
      });
    });

    it('should navigate back when Back button clicked', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />, { wrapper: createWrapper() });

      // Fill in required fields and go to step 2
      await user.type(screen.getByLabelText(/event name/i), 'Test Event');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await user.type(screen.getByLabelText(/start date/i), tomorrow.toISOString().split('T')[0]);
      await user.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText('Registration Settings')).toBeInTheDocument();
      });

      // Click Back
      await user.click(screen.getByRole('button', { name: /back/i }));

      // Should be back on Step 1
      await waitFor(() => {
        expect(screen.getByText('Basic Information')).toBeInTheDocument();
      });
    });

    it('should show progress indicator', () => {
      render(<EventForm {...defaultProps} />, { wrapper: createWrapper() });

      // Progress bar should exist
      const progressBar = document.querySelector('[role="progressbar"]');
      expect(progressBar).toBeInTheDocument();
    });
  });

  describe('Step 1: Basic Info', () => {
    it('should have event name input', () => {
      render(<EventForm {...defaultProps} />, { wrapper: createWrapper() });

      expect(screen.getByLabelText(/event name/i)).toBeInTheDocument();
    });

    it('should have event type selector', () => {
      render(<EventForm {...defaultProps} />, { wrapper: createWrapper() });

      expect(screen.getByLabelText(/event type/i)).toBeInTheDocument();
    });

    it('should have start date input', () => {
      render(<EventForm {...defaultProps} />, { wrapper: createWrapper() });

      expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
    });

    it('should have location input', () => {
      render(<EventForm {...defaultProps} />, { wrapper: createWrapper() });

      expect(screen.getByLabelText(/location/i)).toBeInTheDocument();
    });

    it('should have description textarea', () => {
      render(<EventForm {...defaultProps} />, { wrapper: createWrapper() });

      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    });

    it('should show validation error when event name is empty and Next clicked', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />, { wrapper: createWrapper() });

      // Don't fill in event name, just click Next
      await user.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText(/event name is required/i)).toBeInTheDocument();
      });
    });

    it('should show validation error when start date is empty and Next clicked', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />, { wrapper: createWrapper() });

      await user.type(screen.getByLabelText(/event name/i), 'Test Event');
      // Don't fill in start date, just click Next
      await user.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText(/start date is required/i)).toBeInTheDocument();
      });
    });
  });

  describe('Step 2: Registration Settings', () => {
    async function navigateToStep2(user: ReturnType<typeof userEvent.setup>) {
      // Fill in required Step 1 fields
      await user.type(screen.getByLabelText(/event name/i), 'Test Event');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await user.type(screen.getByLabelText(/start date/i), tomorrow.toISOString().split('T')[0]);
      await user.click(screen.getByRole('button', { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText('Registration Settings')).toBeInTheDocument();
      });
    }

    it('should have visibility options', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />, { wrapper: createWrapper() });

      await navigateToStep2(user);

      // Check for visibility section (label is just "Visibility")
      expect(screen.getByText('Visibility')).toBeInTheDocument();
    });

    it('should have registration mode options', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />, { wrapper: createWrapper() });

      await navigateToStep2(user);

      expect(screen.getByText('Registration Mode')).toBeInTheDocument();
    });

    it('should have max registrations input', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />, { wrapper: createWrapper() });

      await navigateToStep2(user);

      // Check for max capacity label (exact label is "Maximum Capacity")
      expect(screen.getByText('Maximum Capacity')).toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    it('should call onCancel when Cancel button clicked', async () => {
      const user = userEvent.setup();
      render(<EventForm {...defaultProps} />, { wrapper: createWrapper() });

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(defaultProps.onCancel).toHaveBeenCalled();
    });

    it('should have Next button on step 1', () => {
      render(<EventForm {...defaultProps} />, { wrapper: createWrapper() });

      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    });

    it('should have Cancel button on step 1', () => {
      render(<EventForm {...defaultProps} />, { wrapper: createWrapper() });

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });
  });

  describe('Edit Mode', () => {
    it('should populate form with initial data', () => {
      const initialData = {
        name: 'Existing Event',
        eventType: 'combine',
        location: 'Main Stadium',
        description: 'Event description',
      };

      render(<EventForm {...defaultProps} initialData={initialData} mode="edit" />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByLabelText(/event name/i)).toHaveValue('Existing Event');
      expect(screen.getByLabelText(/location/i)).toHaveValue('Main Stadium');
      expect(screen.getByLabelText(/description/i)).toHaveValue('Event description');
    });
  });
});
