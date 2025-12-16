import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import {
  Mail,
  User,
  Lock,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { validatePassword, getPasswordRequirementsText } from '@shared/password-requirements';
import { validateUsername, getUsernameRequirementsText } from '@shared/username-validation';
import { OAuthButtons } from '@/components/auth/oauth-buttons';

interface PasswordRequirement {
  label: string;
  met: boolean;
}

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);

  // Form data
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    termsAccepted: false
  });

  // Validation states
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameError, setUsernameError] = useState<string>('');
  const [emailChecking, setEmailChecking] = useState(false);
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [emailError, setEmailError] = useState<string>('');

  // Password visibility
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Password requirements
  const passwordRequirements: PasswordRequirement[] = [
    { label: 'At least 12 characters', met: formData.password.length >= 12 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(formData.password) },
    { label: 'One lowercase letter', met: /[a-z]/.test(formData.password) },
    { label: 'One number', met: /[0-9]/.test(formData.password) },
    { label: 'One special character', met: /[^a-zA-Z0-9]/.test(formData.password) },
  ];

  // Debounced username check
  useEffect(() => {
    if (!formData.username || formData.username.length < 3) {
      setUsernameAvailable(null);
      setUsernameError('');
      return;
    }

    // Validate format first
    const validation = validateUsername(formData.username);
    if (!validation.valid) {
      setUsernameError(validation.errors[0]);
      setUsernameAvailable(false);
      return;
    }

    const timer = setTimeout(async () => {
      setUsernameChecking(true);
      try {
        const response = await fetch(`/api/auth/check-username/${formData.username.toLowerCase()}`);
        const data = await response.json();
        setUsernameAvailable(data.available);
        setUsernameError(data.available ? '' : data.message);
      } catch {
        setUsernameError('Unable to check username');
      } finally {
        setUsernameChecking(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formData.username]);

  // Debounced email check
  useEffect(() => {
    if (!formData.email || !formData.email.includes('@')) {
      setEmailAvailable(null);
      setEmailError('');
      return;
    }

    const timer = setTimeout(async () => {
      setEmailChecking(true);
      try {
        const response = await fetch(`/api/auth/check-email?email=${encodeURIComponent(formData.email)}`);
        const data = await response.json();
        setEmailAvailable(data.available);
        setEmailError(data.available ? '' : data.message);
      } catch {
        setEmailError('Unable to check email');
      } finally {
        setEmailChecking(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formData.email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate required fields
    if (!formData.firstName.trim()) {
      setError('First name is required');
      return;
    }

    if (!formData.lastName.trim()) {
      setError('Last name is required');
      return;
    }

    if (!formData.email.trim()) {
      setError('Email is required');
      return;
    }

    if (!formData.termsAccepted) {
      setError('You must accept the Terms of Service and Privacy Policy to continue');
      return;
    }

    // Validate username
    const usernameValidation = validateUsername(formData.username);
    if (!usernameValidation.valid) {
      setError(usernameValidation.errors[0]);
      return;
    }

    if (!usernameAvailable) {
      setError(usernameError || 'Please choose a different username');
      return;
    }

    // Validate email
    if (!emailAvailable) {
      setError(emailError || 'Please use a different email address');
      return;
    }

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password requirements
    const passwordValidation = validatePassword(formData.password);
    if (!passwordValidation.valid) {
      setError(passwordValidation.errors[0]);
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          email: formData.email.trim().toLowerCase(),
          username: formData.username.trim().toLowerCase(),
          password: formData.password,
          legalAcceptedAt: new Date().toISOString(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Registration failed');
      }

      // Success!
      setSuccess(true);
      toast({
        title: "Account created!",
        description: "Please check your email to verify your account.",
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Success state - show verification message
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Mail className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Check your email</CardTitle>
            <CardDescription>
              We've sent a verification link to <strong>{formData.email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600 text-center">
              Click the link in the email to verify your account and start using AthleteMetrics.
            </p>
            <p className="text-xs text-gray-500 text-center">
              Didn't receive the email? Check your spam folder or{' '}
              <button
                onClick={async () => {
                  try {
                    await fetch('/api/auth/resend-verification', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email: formData.email }),
                    });
                    toast({
                      title: "Email sent",
                      description: "If your email is registered, you'll receive a new verification link.",
                    });
                  } catch {
                    toast({
                      title: "Error",
                      description: "Failed to resend verification email.",
                      variant: "destructive",
                    });
                  }
                }}
                className="text-blue-600 hover:underline"
              >
                click here to resend
              </button>
            </p>
            <Button
              variant="outline"
              className="w-full mt-4"
              onClick={() => setLocation('/login')}
            >
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img
            src="/logo-128.png"
            alt="AthleteMetrics logo"
            className="h-16 w-16 mx-auto mb-4"
          />
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>
            Join AthleteMetrics to track your athletic performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* OAuth buttons */}
          <OAuthButtons />

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-muted-foreground">
                Or continue with email
              </span>
            </div>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  placeholder="John"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder="Doe"
                  required
                />
              </div>
            </div>

            {/* Email field */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="you@example.com"
                  className="pl-10"
                  required
                />
                {emailChecking && (
                  <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-gray-400" />
                )}
                {!emailChecking && emailAvailable === true && (
                  <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                )}
                {!emailChecking && emailAvailable === false && (
                  <XCircle className="absolute right-3 top-3 h-4 w-4 text-red-500" />
                )}
              </div>
              {emailError && (
                <p className="text-sm text-red-500">{emailError}</p>
              )}
            </div>

            {/* Username field */}
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="username"
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="johndoe"
                  className="pl-10"
                  required
                />
                {usernameChecking && (
                  <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-gray-400" />
                )}
                {!usernameChecking && usernameAvailable === true && (
                  <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                )}
                {!usernameChecking && usernameAvailable === false && (
                  <XCircle className="absolute right-3 top-3 h-4 w-4 text-red-500" />
                )}
              </div>
              {usernameError && (
                <p className="text-sm text-red-500">{usernameError}</p>
              )}
              <p className="text-xs text-gray-500">{getUsernameRequirementsText()}</p>
            </div>

            {/* Password field */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••••••"
                  className="pl-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Password requirements checklist */}
              {formData.password && (
                <div className="space-y-1 mt-2">
                  {passwordRequirements.map((req, index) => (
                    <div key={index} className="flex items-center gap-2 text-xs">
                      {req.met ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <XCircle className="h-3 w-3 text-gray-300" />
                      )}
                      <span className={req.met ? 'text-green-600' : 'text-gray-500'}>
                        {req.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Confirm Password field */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="••••••••••••"
                  className="pl-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                <p className="text-sm text-red-500">Passwords do not match</p>
              )}
            </div>

            {/* Legal Acceptance Checkbox */}
            <div className="flex items-start space-x-2">
              <Checkbox
                id="termsAccepted"
                checked={formData.termsAccepted}
                onCheckedChange={(checked) =>
                  setFormData(prev => ({ ...prev, termsAccepted: checked === true }))
                }
                data-testid="checkbox-terms-accepted"
                className="mt-1"
                aria-describedby="terms-description"
                aria-required="true"
              />
              <Label
                htmlFor="termsAccepted"
                id="terms-description"
                className="text-sm leading-relaxed cursor-pointer"
              >
                I am 18+ or have parental consent, and I agree to the{' '}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                  aria-label="Privacy Policy (opens in new tab)"
                >
                  Privacy Policy
                </a>
                {' '}and{' '}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                  aria-label="Terms of Service (opens in new tab)"
                >
                  Terms of Service
                </a>
              </Label>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={submitting || !usernameAvailable || !emailAvailable || !formData.termsAccepted}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                'Create Account'
              )}
            </Button>
          </form>

          <div className="text-center text-sm text-gray-600 mt-6">
            Already have an account?{' '}
            <a href="/login" className="text-blue-600 hover:underline">
              Sign in
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
