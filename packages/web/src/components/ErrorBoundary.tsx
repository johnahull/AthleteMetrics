/**
 * Error Boundary for chart components to prevent cascading failures
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorId: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { 
      hasError: false,
      errorId: Math.random().toString(36).substr(2, 9)
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return { 
      hasError: true, 
      error,
      errorId: Math.random().toString(36).substr(2, 9)
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Categorize error for better handling
    const errorCategory = this.categorizeError(error);
    
    // Call optional error handler
    this.props.onError?.(error, errorInfo);
    
    // Log error using proper logging service
    this.logError(error, errorInfo, errorCategory);
  }

  private logError(error: Error, errorInfo: ErrorInfo, category: string) {
    const logData = {
      message: error.message,
      stack: error.stack,
      category,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    if (process.env.NODE_ENV === 'production') {
      // In production, send to error monitoring service
      // Example: Sentry.captureException(error, { extra: logData });
      
      // For now, use structured logging that can be picked up by log aggregators
      try {
        fetch('/api/errors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(logData)
        }).catch(() => {
          // Fallback to console if API fails
          console.error('Chart Error Boundary:', logData);
        });
      } catch {
        // Ultimate fallback
        console.error('Chart Error Boundary:', logData);
      }
    } else {
      // Development: detailed console logging
      console.group('🚨 Chart Error Boundary');
      console.error('Error:', error);
      console.error('Category:', category);
      console.error('Component Stack:', errorInfo.componentStack);
      console.error('Additional Info:', logData);
      console.groupEnd();
    }
  }

  private categorizeError(error: Error): 'network' | 'data' | 'rendering' | 'chart' | 'unknown' {
    const message = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || '';

    if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
      return 'network';
    }

    if (message.includes('canvas') || message.includes('chart') || stack.includes('chart.js')) {
      return 'chart';
    }

    if (message.includes('data') || message.includes('null') || message.includes('undefined')) {
      return 'data';
    }

    if (stack.includes('react') || message.includes('render')) {
      return 'rendering';
    }

    return 'unknown';
  }

  private getErrorMessage(category: 'network' | 'data' | 'rendering' | 'chart' | 'unknown'): string {
    switch (category) {
      case 'network':
        return 'Unable to load chart data. Please check your connection and try again.';
      case 'data':
        return 'There was a problem with the chart data. Please refresh and try again.';
      case 'chart':
        return 'Chart rendering failed. This may be due to incompatible data format.';
      case 'rendering':
        return 'Component rendering error. Please refresh the page.';
      default:
        return 'Something went wrong while rendering this chart.';
    }
  }

  handleRetry = () => {
    this.setState({ 
      hasError: false, 
      error: undefined,
      errorId: Math.random().toString(36).substr(2, 9)
    });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI with categorized messaging
      const errorCategory = this.state.error ? this.categorizeError(this.state.error) : 'unknown';
      const userFriendlyMessage = this.getErrorMessage(errorCategory);

      return (
        <Alert variant="destructive" className="m-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <div className="flex-1">
              <p className="font-medium">Chart Error</p>
              <p className="text-sm text-muted-foreground">
                {userFriendlyMessage}
                {process.env.NODE_ENV === 'development' && this.state.error && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs">Error Details (Category: {errorCategory})</summary>
                    <pre className="mt-1 text-xs whitespace-pre-wrap">
                      {this.state.error.toString()}
                    </pre>
                  </details>
                )}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={this.handleRetry}
              className="ml-4"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      );
    }

    return this.props.children;
  }
}

// Hook version for functional components
export function useErrorBoundary() {
  const [error, setError] = React.useState<Error | null>(null);

  const resetError = React.useCallback(() => {
    setError(null);
  }, []);

  const captureError = React.useCallback((error: Error) => {
    setError(error);
  }, []);

  React.useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  return { captureError, resetError };
}

// Higher-order component wrapper
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorFallback?: ReactNode
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary fallback={errorFallback}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}