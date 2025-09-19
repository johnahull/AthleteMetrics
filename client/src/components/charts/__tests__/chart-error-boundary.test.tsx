import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ChartErrorBoundary } from '../ChartErrorBoundary';

// Mock component that can throw an error
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <div>Normal component</div>;
};

// Mock component that renders successfully
const NormalComponent = () => <div>Normal component</div>;

describe('ChartErrorBoundary', () => {
  // Mock console.error to avoid noise in test output
  const originalConsoleError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('should render children normally when no error occurs', () => {
    render(
      <ChartErrorBoundary>
        <NormalComponent />
      </ChartErrorBoundary>
    );

    expect(screen.getByText('Normal component')).toBeInTheDocument();
  });

  it('should catch and display error when child component throws', () => {
    render(
      <ChartErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ChartErrorBoundary>
    );

    expect(screen.getByText('Chart Error')).toBeInTheDocument();
    expect(screen.getByText(/An error occurred while rendering the chart/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('should use custom fallback title and message', () => {
    const customTitle = 'Custom Error Title';
    const customMessage = 'Custom error message for testing';

    render(
      <ChartErrorBoundary
        fallbackTitle={customTitle}
        fallbackMessage={customMessage}
      >
        <ThrowError shouldThrow={true} />
      </ChartErrorBoundary>
    );

    expect(screen.getByText(customTitle)).toBeInTheDocument();
    expect(screen.getByText(customMessage)).toBeInTheDocument();
  });

  it('should call onRetry callback when retry button is clicked', () => {
    const onRetryMock = vi.fn();

    render(
      <ChartErrorBoundary onRetry={onRetryMock}>
        <ThrowError shouldThrow={true} />
      </ChartErrorBoundary>
    );

    const retryButton = screen.getByRole('button', { name: /try again/i });
    fireEvent.click(retryButton);

    expect(onRetryMock).toHaveBeenCalledTimes(1);
  });

  it('should reset error state when retry is clicked', () => {
    const TestComponent = () => {
      const [shouldThrow, setShouldThrow] = React.useState(true);

      return (
        <ChartErrorBoundary
          onRetry={() => setShouldThrow(false)}
        >
          <ThrowError shouldThrow={shouldThrow} />
        </ChartErrorBoundary>
      );
    };

    render(<TestComponent />);

    // Error should be displayed initially
    expect(screen.getByText('Chart Error')).toBeInTheDocument();

    // Click retry button
    const retryButton = screen.getByRole('button', { name: /try again/i });
    fireEvent.click(retryButton);

    // Component should render normally after retry
    expect(screen.getByText('Normal component')).toBeInTheDocument();
    expect(screen.queryByText('Chart Error')).not.toBeInTheDocument();
  });

  it('should show technical details in development mode', () => {
    // Mock NODE_ENV for this test
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    render(
      <ChartErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ChartErrorBoundary>
    );

    expect(screen.getByText('Technical Details')).toBeInTheDocument();

    // Restore original NODE_ENV
    process.env.NODE_ENV = originalEnv;
  });

  it('should not show technical details in production mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    render(
      <ChartErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ChartErrorBoundary>
    );

    expect(screen.queryByText('Technical Details')).not.toBeInTheDocument();

    process.env.NODE_ENV = originalEnv;
  });

  it('should handle multiple error-retry cycles', () => {
    const TestComponent = () => {
      const [errorCount, setErrorCount] = React.useState(0);
      const [shouldThrow, setShouldThrow] = React.useState(true);

      const handleRetry = () => {
        setErrorCount(prev => prev + 1);
        if (errorCount >= 1) {
          setShouldThrow(false); // Stop throwing after 2 errors
        }
      };

      return (
        <ChartErrorBoundary onRetry={handleRetry}>
          <ThrowError shouldThrow={shouldThrow} />
        </ChartErrorBoundary>
      );
    };

    render(<TestComponent />);

    // First error
    expect(screen.getByText('Chart Error')).toBeInTheDocument();

    // First retry - should still throw
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByText('Chart Error')).toBeInTheDocument();

    // Second retry - should succeed
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByText('Normal component')).toBeInTheDocument();
  });

  it('should have proper accessibility attributes', () => {
    render(
      <ChartErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ChartErrorBoundary>
    );

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();

    const retryButton = screen.getByRole('button', { name: /try again/i });
    expect(retryButton).toBeInTheDocument();
    expect(retryButton).not.toBeDisabled();
  });

  it('should handle different types of errors', () => {
    const TypeErrorComponent = () => {
      throw new TypeError('Type error message');
    };

    const ReferenceErrorComponent = () => {
      throw new ReferenceError('Reference error message');
    };

    // Test TypeError
    const { rerender } = render(
      <ChartErrorBoundary>
        <TypeErrorComponent />
      </ChartErrorBoundary>
    );

    expect(screen.getByText('Chart Error')).toBeInTheDocument();

    // Test ReferenceError
    rerender(
      <ChartErrorBoundary>
        <ReferenceErrorComponent />
      </ChartErrorBoundary>
    );

    expect(screen.getByText('Chart Error')).toBeInTheDocument();
  });
});