import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, ArrowLeft, CheckCircle, AlertCircle } from "lucide-react";

interface ForgotPasswordFormProps {
  onBack?: () => void;
}

export function ForgotPasswordForm({ onBack }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateEmail = (email: string): string => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) return 'Email is required';
    if (!emailRegex.test(email)) return 'Please enter a valid email address';
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        credentials: 'include'
      });

      const result = await response.json();

      if (result.success) {
        setSubmitted(true);
      } else {
        setError(result.message || 'Failed to send reset email');
      }
    } catch (error) {
      console.error('Password reset request error:', error);
      setError('Failed to send reset email. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-3 mx-auto">
            <CheckCircle className="h-6 w-6 text-green-600" />
          </div>
          <CardTitle className="text-2xl font-bold">Check Your Email</CardTitle>
          <CardDescription>
            We've sent password reset instructions to your email address
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className="text-center text-sm text-gray-600">
            <p>
              If an account with <strong>{email}</strong> exists, you'll receive a password reset link shortly.
            </p>
            <p className="mt-2">
              The link will expire in 1 hour for security reasons.
            </p>
          </div>

          <div className="space-y-3">
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => {
                setSubmitted(false);
                setEmail('');
                setError(null);
              }}
            >
              Send Another Reset Email
            </Button>
            
            {onBack && (
              <Button 
                variant="ghost" 
                className="w-full"
                onClick={onBack}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Sign In
              </Button>
            )}
          </div>

          <div className="text-center text-sm text-gray-600">
            Didn't receive an email? Check your spam folder or{' '}
            <button
              type="button"
              className="text-blue-600 hover:underline"
              onClick={() => {
                setSubmitted(false);
                setError(null);
              }}
            >
              try again
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">Reset Your Password</CardTitle>
        <CardDescription>
          Enter your email address and we'll send you a link to reset your password
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                className={`pl-10 ${error ? 'border-red-500' : ''}`}
                placeholder="Enter your email address"
                disabled={isLoading}
                autoComplete="email"
                required
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                {error}
              </p>
            )}
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            disabled={isLoading || !email}
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Sending Reset Link...
              </>
            ) : (
              'Send Reset Link'
            )}
          </Button>
          
          {onBack && (
            <Button 
              type="button"
              variant="ghost" 
              className="w-full"
              onClick={onBack}
              disabled={isLoading}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Sign In
            </Button>
          )}
        </form>

        <div className="mt-6 text-center text-sm text-gray-600">
          Remember your password?{' '}
          <a href="/login" className="text-blue-600 hover:underline">
            Sign in instead
          </a>
        </div>
      </CardContent>
    </Card>
  );
}