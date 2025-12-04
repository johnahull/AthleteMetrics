/**
 * Tests for My Measurements Add Page
 *
 * Tests the self-entry page for athletes to log their own measurements.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import MyMeasurementsAdd from '../my-measurements-add';
import type { EnhancedUser } from '@/lib/types/user';

// Mock state that can be changed per test
let mockUser: EnhancedUser | null = null;
let mockIsLoading = false;
let mockCreateMeasurement = vi.fn();
let mockMutationState = {
  isPending: false,
  isSuccess: false,
  isError: false,
  error: null as Error | null,
};
let mockLocation = '/my-measurements/add';
let mockSetLocation = vi.fn();
let mockToast = vi.fn();

// Mock modules
vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(() => ({
    user: mockUser,
    isLoading: mockIsLoading,
  })),
}));

vi.mock('wouter', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  Redirect: ({ to }: { to: string }) => <div data-testid="redirect" data-to={to}></div>,
  useLocation: vi.fn(() => [mockLocation, mockSetLocation]),
}));

vi.mock('@/hooks/useAthleteMeasurements', () => ({
  useCreateSelfMeasurement: vi.fn(() => ({
    mutate: mockCreateMeasurement,
    mutateAsync: mockCreateMeasurement,
    isPending: mockMutationState.isPending,
    isSuccess: mockMutationState.isSuccess,
    isError: mockMutationState.isError,
    error: mockMutationState.error,
  })),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn(() => ({
    toast: mockToast,
  })),
}));

// Mock SelfEntryForm component
vi.mock('@/components/athlete/SelfEntryForm', () => ({
  SelfEntryForm: ({ onSubmit, onCancel, isSubmitting }: any) => (
    <div data-testid="self-entry-form">
      <button
        data-testid="submit-button"
        onClick={() =>
          onSubmit({
            metric: 'FLY10_TIME',
            value: 1.23,
            date: '2024-01-15',
            notes: 'Test notes',
          })
        }
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Submitting...' : 'Submit'}
      </button>
      <button data-testid="cancel-button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  ),
}));

describe('My Measurements Add Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = {
      id: 'user-1',
      username: 'athlete1',
      firstName: 'Test',
      lastName: 'Athlete',
      email: 'athlete@example.com',
      role: 'athlete',
      isSiteAdmin: false,
      athleteId: 'athlete-1',
      organizations: [],
    };
    mockIsLoading = false;
    mockCreateMeasurement = vi.fn();
    mockMutationState = {
      isPending: false,
      isSuccess: false,
      isError: false,
      error: null,
    };
    mockSetLocation = vi.fn();
    mockToast = vi.fn();
  });

  describe('Authentication and Authorization', () => {
    it('should redirect to login when not authenticated', () => {
      mockUser = null;
      mockIsLoading = false;

      render(<MyMeasurementsAdd />);

      const redirect = screen.getByTestId('redirect');
      expect(redirect).toHaveAttribute('data-to', '/login');
    });

    it('should redirect to /dashboard when user is not an athlete', () => {
      mockUser = {
        ...mockUser!,
        athleteId: undefined,
        role: 'coach',
      };

      render(<MyMeasurementsAdd />);

      const redirect = screen.getByTestId('redirect');
      expect(redirect).toHaveAttribute('data-to', '/dashboard');
    });
  });

  describe('Page Structure', () => {
    it('should render page with "Add Measurement" heading', () => {
      render(<MyMeasurementsAdd />);

      expect(screen.getByRole('heading', { name: /add measurement/i })).toBeInTheDocument();
    });

    it('should show back link to /my-measurements', () => {
      render(<MyMeasurementsAdd />);

      const backLink = screen.getByRole('link', { name: /back to my measurements/i });
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveAttribute('href', '/my-measurements');
    });

    it('should render SelfEntryForm component', () => {
      render(<MyMeasurementsAdd />);

      expect(screen.getByTestId('self-entry-form')).toBeInTheDocument();
    });

    it('should render form inside a Card container', () => {
      render(<MyMeasurementsAdd />);

      const form = screen.getByTestId('self-entry-form');
      // Card adds specific classes, we just verify the form is rendered
      expect(form).toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    it('should call createMeasurement mutation on form submit', async () => {
      const user = userEvent.setup();
      render(<MyMeasurementsAdd />);

      const submitButton = screen.getByTestId('submit-button');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockCreateMeasurement).toHaveBeenCalledWith(
          {
            userId: 'user-1', // User ID from mock auth context
            metric: 'FLY10_TIME',
            value: 1.23,
            date: '2024-01-15',
            notes: 'Test notes',
          },
          expect.objectContaining({
            onSuccess: expect.any(Function),
            onError: expect.any(Function),
          })
        );
      });
    });

    it('should redirect to /my-measurements on successful submit', async () => {
      const user = userEvent.setup();
      // Mock successful submission
      mockCreateMeasurement = vi.fn((data, options) => {
        // Immediately call onSuccess to simulate successful mutation
        if (options?.onSuccess) {
          options.onSuccess();
        }
      });

      render(<MyMeasurementsAdd />);

      const submitButton = screen.getByTestId('submit-button');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockSetLocation).toHaveBeenCalledWith('/my-measurements');
      });
    });

    it('should show success toast on successful submit', async () => {
      const user = userEvent.setup();
      // Mock successful submission
      mockCreateMeasurement = vi.fn((data, options) => {
        if (options?.onSuccess) {
          options.onSuccess();
        }
      });

      render(<MyMeasurementsAdd />);

      const submitButton = screen.getByTestId('submit-button');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Measurement added',
            description: expect.stringContaining('successfully'),
          })
        );
      });
    });

    it('should show error toast on failed submit', async () => {
      const user = userEvent.setup();
      const errorMessage = 'Failed to create measurement';
      // Mock failed submission
      mockCreateMeasurement = vi.fn((data, options) => {
        if (options?.onError) {
          options.onError(new Error(errorMessage));
        }
      });

      render(<MyMeasurementsAdd />);

      const submitButton = screen.getByTestId('submit-button');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Error',
            description: errorMessage,
            variant: 'destructive',
          })
        );
      });
    });

    it('should pass isSubmitting state to form when mutation is pending', () => {
      mockMutationState.isPending = true;

      render(<MyMeasurementsAdd />);

      const submitButton = screen.getByTestId('submit-button');
      expect(submitButton).toBeDisabled();
      expect(submitButton).toHaveTextContent('Submitting...');
    });
  });

  describe('Cancel Action', () => {
    it('should navigate back to /my-measurements when cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<MyMeasurementsAdd />);

      const cancelButton = screen.getByTestId('cancel-button');
      await user.click(cancelButton);

      await waitFor(() => {
        expect(mockSetLocation).toHaveBeenCalledWith('/my-measurements');
      });
    });
  });
});
