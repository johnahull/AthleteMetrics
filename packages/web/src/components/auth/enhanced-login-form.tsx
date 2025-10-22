import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, Shield, Mail, Lock, AlertCircle, CheckCircle, Clock } from "lucide-react";
import { useAuth } from "@/lib/auth";

interface LoginFormData {
  email: string;
  password: string;
  mfaToken?: string;
  rememberMe: boolean;
}

interface LoginError {
  type: 'general' | 'email' | 'password' | 'mfa' | 'locked';
  message: string;
  lockUntil?: string;
}

export function EnhancedLoginForm() {
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
    rememberMe: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<'credentials' | 'mfa'>('credentials');
  const [error, setError] = useState<LoginError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [emailSuggestions, setEmailSuggestions] = useState<string[]>([]);
  const [lockTimeRemaining, setLockTimeRemaining] = useState<number>(0);
  
  const { login } = useAuth();

  // Countdown timer for account lockout
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (lockTimeRemaining > 0) {
      interval = setInterval(() => {
        setLockTimeRemaining(prev => {
          if (prev <= 1000) {
            setError(null);
            return 0;
          }
          return prev - 1000;
        });
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [lockTimeRemaining]);

  const validateEmail = (email: string): string => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) return 'Email is required';
    if (!emailRegex.test(email)) return 'Please enter a valid email address';
    
    // Generate domain suggestions for common typos
    const domain = email.split('@')[1];
    if (domain) {
      const commonDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'];
      const suggestions = commonDomains
        .filter(d => {
          // Check for similar domains (edit distance of 1-2)
          const distance = getLevenshteinDistance(domain.toLowerCase(), d);
          return distance > 0 && distance <= 2;
        })
        .slice(0, 2); // Limit to 2 suggestions

      if (suggestions.length > 0) {
        const emailPrefix = email.split('@')[0];
        setEmailSuggestions(suggestions.map(d => `${emailPrefix}@${d}`));
      } else {
        setEmailSuggestions([]);
      }
    }
    
    return '';
  };

  const getLevenshteinDistance = (str1: string, str2: string): number => {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i += 1) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j += 1) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j += 1) {
      for (let i = 1; i <= str1.length; i += 1) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator, // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  };

  const formatTimeRemaining = (ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Validate email
    const emailError = validateEmail(formData.email);
    if (emailError) {
      setError({ type: 'email', message: emailError });
      setIsLoading(false);
      return;
    }

    // Validate password
    if (!formData.password) {
      setError({ type: 'password', message: 'Password is required' });
      setIsLoading(false);
      return;
    }

    // Validate MFA token if on MFA step
    if (step === 'mfa' && (!formData.mfaToken || formData.mfaToken.length !== 6)) {
      setError({ type: 'mfa', message: 'Please enter a valid 6-digit code' });
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
        credentials: 'include'
      });

      const result = await response.json();

      if (result.requiresMFA && step === 'credentials') {
        setStep('mfa');
        setError(null);
      } else if (result.success) {
        // Since we already authenticated successfully, just redirect
        // The session is handled server-side
        window.location.href = result.redirectUrl || '/dashboard';
      } else {
        // Handle various error types
        if (result.accountLocked) {
          const lockUntil = new Date(result.lockUntil);
          const timeRemaining = lockUntil.getTime() - Date.now();
          setLockTimeRemaining(Math.max(0, timeRemaining));
          setError({
            type: 'locked',
            message: `Account locked due to multiple failed attempts. Try again in ${formatTimeRemaining(timeRemaining)}.`,
            lockUntil: result.lockUntil
          });
        } else if (result.requiresEmailVerification) {
          setError({
            type: 'general',
            message: 'Please verify your email address before logging in. Check your inbox for a verification link.'
          });
        } else {
          setError({
            type: step === 'mfa' ? 'mfa' : 'general',
            message: result.message || 'Login failed. Please check your credentials.'
          });
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      setError({
        type: 'general',
        message: 'Login failed. Please check your connection and try again.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setStep('credentials');
    setFormData(prev => ({ ...prev, mfaToken: '' }));
    setError(null);
  };

  const handleEmailSuggestionClick = (suggestion: string) => {
    setFormData(prev => ({ ...prev, email: suggestion }));
    setEmailSuggestions([]);
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">
          {step === 'credentials' ? 'Sign in to AthleteMetrics' : 'Two-Factor Authentication'}
        </CardTitle>
        <CardDescription>
          {step === 'credentials' 
            ? 'Enter your email and password to continue'
            : 'Enter the 6-digit code from your authenticator app'
          }
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {step === 'credentials' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, email: e.target.value }));
                      validateEmail(e.target.value);
                      if (error?.type === 'email') setError(null);
                    }}
                    className={`pl-10 ${error?.type === 'email' ? 'border-red-500' : ''}`}
                    placeholder="Enter your email"
                    disabled={isLoading}
                    autoComplete="email"
                    required
                  />
                </div>
                {error?.type === 'email' && (
                  <p className="text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    {error.message}
                  </p>
                )}
                {emailSuggestions.length > 0 && !error && (
                  <div className="text-sm text-gray-600">
                    Did you mean:{' '}
                    {emailSuggestions.map((suggestion, index) => (
                      <span key={suggestion}>
                        <button
                          type="button"
                          className="text-blue-600 hover:underline"
                          onClick={() => handleEmailSuggestionClick(suggestion)}
                        >
                          {suggestion}
                        </button>
                        {index < emailSuggestions.length - 1 && ', '}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, password: e.target.value }));
                      if (error?.type === 'password') setError(null);
                    }}
                    className={`pl-10 pr-10 ${error?.type === 'password' ? 'border-red-500' : ''}`}
                    placeholder="Enter your password"
                    disabled={isLoading}
                    autoComplete="current-password"
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
                {error?.type === 'password' && (
                  <p className="text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    {error.message}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.rememberMe}
                    onChange={(e) => setFormData(prev => ({ ...prev, rememberMe: e.target.checked }))}
                    className="rounded border-gray-300"
                    disabled={isLoading}
                  />
                  <span className="text-sm text-gray-600">Remember me for 30 days</span>
                </label>
                
                <a 
                  href="/forgot-password" 
                  className="text-sm text-blue-600 hover:underline"
                >
                  Forgot password?
                </a>
              </div>
            </>
          )}

          {step === 'mfa' && (
            <>
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mb-3">
                  <Shield className="h-6 w-6 text-blue-600" />
                </div>
                <p className="text-sm text-gray-600">
                  We've sent a verification code to your authenticator app
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="mfaToken">Authentication Code</Label>
                <Input
                  id="mfaToken"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={formData.mfaToken || ''}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    setFormData(prev => ({ ...prev, mfaToken: value }));
                    if (error?.type === 'mfa') setError(null);
                  }}
                  className={`text-center text-2xl tracking-widest font-mono ${error?.type === 'mfa' ? 'border-red-500' : ''}`}
                  placeholder="000000"
                  disabled={isLoading}
                  autoComplete="one-time-code"
                  required
                />
                {error?.type === 'mfa' && (
                  <p className="text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    {error.message}
                  </p>
                )}
              </div>
              
              <div className="text-center">
                <button
                  type="button"
                  className="text-sm text-blue-600 hover:underline"
                  onClick={handleBack}
                  disabled={isLoading}
                >
                  ← Back to login
                </button>
              </div>
            </>
          )}

          {error && !['email', 'password', 'mfa'].includes(error.type) && (
            <Alert variant={error.type === 'locked' ? 'destructive' : 'destructive'}>
              <div className="flex items-start gap-2">
                {error.type === 'locked' ? (
                  <Clock className="h-4 w-4 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 mt-0.5" />
                )}
                <div className="flex-1">
                  <AlertDescription>
                    {error.message}
                    {error.type === 'locked' && lockTimeRemaining > 0 && (
                      <div className="mt-2 font-mono text-sm">
                        Time remaining: {formatTimeRemaining(lockTimeRemaining)}
                      </div>
                    )}
                  </AlertDescription>
                </div>
              </div>
            </Alert>
          )}

          <Button 
            type="submit" 
            className="w-full" 
            disabled={isLoading || (error?.type === 'locked' && lockTimeRemaining > 0)}
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Signing in...
              </>
            ) : step === 'mfa' ? (
              'Verify & Sign In'
            ) : (
              'Sign In'
            )}
          </Button>
          
          {step === 'credentials' && (
            <div className="text-center text-sm text-gray-600">
              Don't have an account?{' '}
              <a href="/register" className="text-blue-600 hover:underline">
                Sign up
              </a>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}