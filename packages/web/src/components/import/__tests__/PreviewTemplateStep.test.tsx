/**
 * Tests for PreviewTemplateStep component
 *
 * This component is the final step of the Import Wizard, showing:
 * - Generated template preview
 * - Template info (type, teams, metrics, columns)
 * - Toggle for example rows
 * - Copy and download functionality
 */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';
import { PreviewTemplateStep } from '../PreviewTemplateStep';

// Mock useToast hook
const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock template response
const mockTemplateResponse = {
  csvContent: 'firstName,lastName,teamName\nJohn,Doe,Test Team\nJane,Smith,Test Team',
  headers: ['firstName', 'lastName', 'teamName'],
  teams: [{ id: 'team-1', name: 'Test Team' }],
  enabledMetrics: null,
};

const mockMeasurementsTemplateResponse = {
  csvContent: 'firstName,lastName,teamName,metric,value,units\nJohn,Doe,Test Team,FLY10_TIME,1.25,s',
  headers: ['firstName', 'lastName', 'teamName', 'metric', 'value', 'units'],
  teams: [{ id: 'team-1', name: 'Test Team' }],
  enabledMetrics: [{ code: 'FLY10_TIME', label: '10-Yard Fly Time', unit: 's' }],
};

describe('PreviewTemplateStep', () => {
  let queryClient: QueryClient;

  const defaultProps = {
    importType: 'athletes' as const,
    teamIds: ['team-1'],
    metricCodes: [],
    includeExamples: true,
    onToggleExamples: vi.fn(),
    onBack: vi.fn(),
    onComplete: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
        mutations: {
          retry: false,
        },
      },
    });

    // Mock fetch for template generation
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTemplateResponse),
    });
  });

  afterEach(() => {
    queryClient.clear();
    cleanup();
  });

  const renderWithProviders = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <PreviewTemplateStep {...defaultProps} {...props} />
      </QueryClientProvider>
    );
  };

  describe('Loading State', () => {
    it('should show template content when loaded', async () => {
      renderWithProviders();

      // Wait for the template to load and show content
      await waitFor(() => {
        expect(screen.getByText('Preview Template')).toBeInTheDocument();
      });

      // Verify CSV preview is shown
      expect(screen.getByText(/firstName,lastName,teamName/)).toBeInTheDocument();
    });
  });

  describe('Template Display', () => {
    it('should display template preview after loading', async () => {
      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText('Preview Template')).toBeInTheDocument();
      });

      // Check CSV content is displayed
      await waitFor(() => {
        expect(screen.getByText(/firstName,lastName,teamName/)).toBeInTheDocument();
      });
    });

    it('should display template info for athletes', async () => {
      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText('Type:')).toBeInTheDocument();
      });

      // importType is lowercase, but displayed with CSS capitalize
      expect(screen.getByText('athletes')).toBeInTheDocument();
      expect(screen.getByText('Teams:')).toBeInTheDocument();
      expect(screen.getByText('1 selected')).toBeInTheDocument();
      expect(screen.getByText('Columns:')).toBeInTheDocument();
      expect(screen.getByText('3 columns')).toBeInTheDocument();
    });

    it('should display metrics info for measurements', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockMeasurementsTemplateResponse),
      });

      renderWithProviders({
        importType: 'measurements',
        metricCodes: ['FLY10_TIME'],
      });

      await waitFor(() => {
        expect(screen.getByText('Type:')).toBeInTheDocument();
      });

      // importType is lowercase, but displayed with CSS capitalize
      expect(screen.getByText('measurements')).toBeInTheDocument();
      expect(screen.getByText('Metrics:')).toBeInTheDocument();
    });
  });

  describe('Example Rows Toggle', () => {
    it('should render include examples switch', async () => {
      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText('Include example rows')).toBeInTheDocument();
      });

      expect(screen.getByRole('switch')).toBeInTheDocument();
    });

    it('should call onToggleExamples when switch is toggled', async () => {
      const onToggleExamples = vi.fn();
      renderWithProviders({ onToggleExamples });

      await waitFor(() => {
        expect(screen.getByRole('switch')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('switch'));

      expect(onToggleExamples).toHaveBeenCalledWith(false);
    });
  });

  describe('Navigation', () => {
    it('should call onBack when Back button clicked', async () => {
      const onBack = vi.fn();
      renderWithProviders({ onBack });

      await waitFor(() => {
        expect(screen.getByText('Back')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Back'));

      expect(onBack).toHaveBeenCalled();
    });

    it('should call onCancel when Cancel button clicked', async () => {
      const onCancel = vi.fn();
      renderWithProviders({ onCancel });

      await waitFor(() => {
        expect(screen.getByText('Cancel')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Cancel'));

      expect(onCancel).toHaveBeenCalled();
    });

    it('should have download and done buttons', async () => {
      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText('Download Template')).toBeInTheDocument();
      });

      expect(screen.getByText('Done')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should display error message when template generation fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ message: 'Server error' }),
      });

      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeInTheDocument();
      });
    });

    it('should show generic error message when response has no message', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({}),
      });

      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText('Failed to generate template')).toBeInTheDocument();
      });
    });
  });

  describe('Instructions', () => {
    it('should display next steps instructions', async () => {
      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText('Next steps:')).toBeInTheDocument();
      });

      expect(screen.getByText('Download the template CSV file')).toBeInTheDocument();
    });
  });
});
