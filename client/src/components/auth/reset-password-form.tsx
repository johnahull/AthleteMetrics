import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, Lock, CheckCircle, AlertCircle, Shield } from "lucide-react";
import { PasswordStrengthMeter } from "./password-strength-meter";

interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    validateToken();
  }, [token]);

  const validateToken = async () => {
    setIsValidating(true);
    try {
      const response = await fetch(`/api/auth/validate-reset-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        credentials: 'include'
      });

      const result = await response.json();
      
      if (result.valid) {
        setTokenValid(true);
      } else {
        let message = 'Invalid or expired reset token';
        if (result.expired) message = 'This reset link has expired. Please request a new one.';
        if (result.used) message = 'This reset link has already been used.';
        setValidationError(message);
      }
    } catch (error) {
      console.error('Token validation error:', error);
      setValidationError('Failed to validate reset token. Please try again.');
    } finally {
      setIsValidating(false);
    }
  };

  const validatePasswords = (): string => {
    if (!password) return 'Password is required';
    if (password.length < 12) return 'Password must be at least 12 characters long';
    if (password !== confirmPassword) return 'Passwords do not match';
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const passwordError = validatePasswords();
    if (passwordError) {
      setError(passwordError);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          token, 
          newPassword: password 
        }),
        credentials: 'include'
      });

      const result = await response.json();

      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.message || 'Failed to reset password');
      }
    } catch (error) {
      console.error('Password reset error:', error);
      setError('Failed to reset password. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidating) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className="text-sm text-gray-600">Validating reset link...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (validationError) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-red-100 rounded-full mb-3 mx-auto">
            <AlertCircle className="h-6 w-6 text-red-600" />
          </div>
          <CardTitle className="text-2xl font-bold">Invalid Reset Link</CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{validationError}</AlertDescription>
          </Alert>

          <div className="space-y-3">
            <Button 
              className="w-full"
              onClick={() => window.location.href = '/forgot-password'}
            >
              Request New Reset Link
            </Button>
            
            <Button 
              variant="outline"
              className="w-full"
              onClick={() => window.location.href = '/login'}
            >
              Back to Sign In
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (success) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-3 mx-auto">
            <CheckCircle className="h-6 w-6 text-green-600" />
          </div>
          <CardTitle className="text-2xl font-bold">Password Reset Successfully</CardTitle>
          <CardDescription>
            Your password has been updated. You can now sign in with your new password.
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <Button 
            className="w-full"
            onClick={() => window.location.href = '/login'}
          >
            Continue to Sign In
          </Button>

          <div className="mt-4 text-center text-sm text-gray-600">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Shield className="h-4 w-4 text-green-600" />
              <span>For your security:</span>
            </div>
            <ul className="text-xs space-y-1">
              <li>• All existing sessions have been logged out</li>
              <li>• You'll need to sign in again on all devices</li>
              <li>• This reset link is now invalid</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">Set New Password</CardTitle>
        <CardDescription>
          Choose a strong password for your AthleteMetrics account
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                className="pl-10 pr-10"
                placeholder="Enter your new password"
                disabled={isLoading}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <PasswordStrengthMeter 
            password={password} 
            showRequirements={true}
            className="mb-4"
          />

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (error) setError(null);
                }}
                className={`pl-10 pr-10 ${password && confirmPassword && password !== confirmPassword ? 'border-red-500' : ''}`}
                placeholder="Confirm your new password"
                disabled={isLoading}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                disabled={isLoading}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {password && confirmPassword && password !== confirmPassword && (
              <p className="text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                Passwords do not match
              </p>
            )}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button 
            type="submit" 
            className="w-full" 
            disabled={isLoading || !password || !confirmPassword || password !== confirmPassword}
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Updating Password...
              </>
            ) : (
              'Update Password'
            )}
          </Button>

          <div className="text-center">
            <Button 
              type="button"
              variant="ghost" 
              className="text-sm"
              onClick={() => window.location.href = '/login'}
              disabled={isLoading}
            >
              Cancel and return to sign in
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}