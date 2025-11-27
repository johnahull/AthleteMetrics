import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary Component
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of the
 * component tree that crashed.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error details for debugging
    console.error('Error caught by ErrorBoundary:', error);
    console.error('Component stack:', errorInfo.componentStack);

    // Store error info in state
    this.setState({ errorInfo });

    // Call optional error handler callback
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = (): void => {
    // Reset the error boundary state
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = (): void => {
    // Reload the entire page
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI provided by parent
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <Card className="bg-red-50 border-red-200 max-w-2xl mx-auto mt-8">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0 mt-1" />
              <div className="flex-1 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-red-900 mb-2">
                    Something went wrong
                  </h2>
                  <p className="text-sm text-red-700 mb-4">
                    An unexpected error occurred. You can try refreshing the page or
                    contact support if the problem persists.
                  </p>
                </div>

                {/* Error details (only shown in development) */}
                {process.env.NODE_ENV === 'development' && this.state.error && (
                  <div className="bg-white rounded border border-red-300 p-3">
                    <p className="text-xs font-mono text-red-800 mb-2">
                      {this.state.error.toString()}
                    </p>
                    {this.state.errorInfo && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-red-700 hover:text-red-900">
                          Component Stack
                        </summary>
                        <pre className="mt-2 text-red-600 overflow-x-auto">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      </details>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  <Button
                    onClick={this.handleReset}
                    variant="outline"
                    size="sm"
                    className="border-red-300 text-red-700 hover:bg-red-100"
                  >
                    Try Again
                  </Button>
                  <Button
                    onClick={this.handleReload}
                    variant="default"
                    size="sm"
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Refresh Page
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    // No error, render children normally
    return this.props.children;
  }
}

/**
 * Hook-based alternative for functional components
 * (Note: This doesn't actually catch errors, but provides a consistent API)
 *
 * For actual error catching, you must use the class-based ErrorBoundary component
 */
export function useErrorBoundary() {
  const [error, setError] = React.useState<Error | null>(null);

  if (error) {
    throw error;
  }

  return {
    resetError: () => setError(null),
    showError: (error: Error) => setError(error),
  };
}
