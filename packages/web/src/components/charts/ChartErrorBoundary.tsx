import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface ChartErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

interface ChartErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onRetry?: () => void;
}

export class ChartErrorBoundary extends React.Component<
  ChartErrorBoundaryProps,
  ChartErrorBoundaryState
> {
  constructor(props: ChartErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ChartErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error details for debugging (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.error('Chart Error Boundary caught an error:', error, errorInfo);
    }

    this.setState({
      hasError: true,
      error,
      errorInfo
    });

    // In production, we could send this to an error reporting service
    // reportError(error, errorInfo);
  }

  handleRetry = () => {
    // Reset error boundary state
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });

    // Call optional retry callback
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  render() {
    if (this.state.hasError) {
      const {
        fallbackTitle = 'Chart Error',
        fallbackMessage = 'An error occurred while rendering the chart. Please try refreshing or contact support if the problem persists.'
      } = this.props;

      return (
        <div className="w-full h-64 flex items-center justify-center p-4">
          <Alert className="max-w-md">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="flex items-center gap-2">
              {fallbackTitle}
            </AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{fallbackMessage}</p>

              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
                  <summary className="cursor-pointer font-medium">
                    Technical Details
                  </summary>
                  <div className="mt-2">
                    <div className="font-medium">Error:</div>
                    <div className="text-red-600">{this.state.error.message}</div>

                    {this.state.error.stack && (
                      <>
                        <div className="font-medium mt-2">Stack Trace:</div>
                        <pre className="text-xs overflow-auto">
                          {this.state.error.stack}
                        </pre>
                      </>
                    )}

                    {this.state.errorInfo?.componentStack && (
                      <>
                        <div className="font-medium mt-2">Component Stack:</div>
                        <pre className="text-xs overflow-auto">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      </>
                    )}
                  </div>
                </details>
              )}

              <Button
                onClick={this.handleRetry}
                variant="outline"
                size="sm"
                className="w-full"
              >
                <RefreshCw className="h-3 w-3 mr-2" />
                Try Again
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ChartErrorBoundary;