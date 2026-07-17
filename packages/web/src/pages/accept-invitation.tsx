import { useState, useEffect, useRef } from 'react';
import { useLocation, Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Mail, Building, UserCheck, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { validatePassword, PASSWORD_REQUIREMENTS, getPasswordRequirementsText } from '@shared/password-requirements';
import { validateUsername, getUsernameRequirementsText } from '@shared/username-validation';
import { useContextualLabels } from '@/hooks/useContextualLabels';
import { isUnder13, isMinorAge } from '@shared/coppa-utils';

interface InvitationData {
  email: string;
  role: string;
  organizationId: string;
  playerId?: string; // ID of existing athlete/user if updating
  athleteId?: string;
  athleteData?: {
    id: string;
    firstName: string;
    lastName: string;
    emails: string[];
    teams: Array<{
      id: string;
      name: string;
      sport: string;
    }>;
  };
}

export default function AcceptInvitation() {
  const labels = useContextualLabels();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [token, setToken] = useState<string>('');
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [usernameCheckLoading, setUsernameCheckLoading] = useState(false);
  const [usernameError, setUsernameError] = useState<string>('');
  
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    username: '',
    password: '',
    confirmPassword: '',
    termsAccepted: false,
    birthDate: '',
    parentEmail: '',
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [consentEmailSent, setConsentEmailSent] = useState(false);
  const [consentParentEmail, setConsentParentEmail] = useState('');

  const under13 = (() => {
    if (!formData.birthDate) return false;
    try { return isUnder13(formData.birthDate); } catch { return false; }
  })();
  const minor = (() => {
    if (!formData.birthDate) return false;
    try { return isMinorAge(formData.birthDate); } catch { return false; }
  })();
  const teenMinor = minor && !under13;

  // D1: Clear parentEmail when minor transitions from true → false
  const prevIsMinorRef = useRef(minor);
  useEffect(() => {
    if (prevIsMinorRef.current === true && !minor && formData.parentEmail) {
      setFormData(prev => ({ ...prev, parentEmail: '' }));
    }
    prevIsMinorRef.current = minor;
  }, [minor]);

  // Extract token from URL on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const inviteToken = urlParams.get('token');
    
    if (!inviteToken) {
      setError('No invitation token found in URL');
      setLoading(false);
      return;
    }
    
    setToken(inviteToken);
    fetchInvitationDetails(inviteToken);
  }, []);


  const fetchInvitationDetails = async (inviteToken: string) => {
    try {
      const response = await fetch(`/api/invitations/${inviteToken}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch invitation details');
      }
      
      const data = await response.json();


      setInvitation(data);

      // Pre-populate form with existing athlete data if available
      if (data.athleteData) {
        setFormData(prev => ({
          ...prev,
          firstName: data.athleteData.firstName,
          lastName: data.athleteData.lastName
        }));
      }

      // COPPA prefill: coach-provided birthDate/parentEmail captured at
      // invite-create time. Fields stay editable — the accepter may correct
      // them, and the server re-validates either way.
      if (data.birthDate || data.parentEmail) {
        setFormData(prev => ({
          ...prev,
          birthDate: prev.birthDate || (data.birthDate ?? ''),
          parentEmail: prev.parentEmail || (data.parentEmail ?? ''),
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invitation');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.termsAccepted) {
      setError('You must accept the Terms of Service and Privacy Policy to continue');
      return;
    }

    if (!formData.username.trim()) {
      setError('Username is required');
      return;
    }

    // Validate username using shared validation
    const usernameValidation = validateUsername(formData.username);
    if (!usernameValidation.valid) {
      setError(usernameValidation.errors[0]);
      return;
    }

    if (usernameError) {
      setError(usernameError);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate parent email for under-13 (defense-in-depth alongside HTML required)
    if (under13 && !formData.parentEmail?.trim()) {
      setError('Parent or guardian email is required for users under 13');
      return;
    }

    // Validate password against shared requirements
    const passwordValidation = validatePassword(formData.password);
    if (!passwordValidation.valid) {
      setError(passwordValidation.errors[0]);
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch(`/api/invitations/${token}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          username: formData.username,
          password: formData.password,
          legalAcceptedAt: new Date().toISOString(),
          birthDate: formData.birthDate || undefined,
          parentEmail: minor && formData.parentEmail ? formData.parentEmail.trim().toLowerCase() : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to accept invitation');
      }

      // COPPA: under-13 athletes await parental consent — no redirect to dashboard
      if (data.requiresParentalConsent) {
        setConsentParentEmail(formData.parentEmail);
        setConsentEmailSent(true);
        return;
      }

      toast({
        title: "Welcome!",
        description: data.message || "Account created successfully",
      });

      // Redirect to appropriate page
      setLocation(data.redirectUrl || '/');
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invitation');
    } finally {
      setSubmitting(false);
    }
  };

  // Check username availability with debouncing
  const checkUsernameAvailability = async (username: string) => {
    if (!username.trim() || username.length < 3) {
      setUsernameError('');
      return;
    }

    if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
      setUsernameError('Username can only contain letters, numbers, periods, hyphens, and underscores');
      return;
    }

    setUsernameCheckLoading(true);
    setUsernameError('');

    try {
      // If this is an existing athlete (playerId present), exclude their user ID from the check
      const excludeParam = invitation?.playerId ? `&excludeUserId=${encodeURIComponent(invitation.playerId)}` : '';



      const response = await fetch(`/api/users/check-username?username=${encodeURIComponent(username)}${excludeParam}`);
      const data = await response.json();



      if (!data.available) {
        setUsernameError('Username already taken. Please choose a different username.');
      }
    } catch (error) {
      console.error('Error checking username:', error);
    } finally {
      setUsernameCheckLoading(false);
    }
  };

  // Debounced username checker
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.username) {
        checkUsernameAvailability(formData.username);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formData.username]);

  const handleInputChange = (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear username error when user starts typing
    if (field === 'username') {
      setUsernameError('');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading invitation...</span>
        </div>
      </div>
    );
  }

  // COPPA: show consent-sent holding state for under-13 athletes
  if (consentEmailSent) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <Mail className="h-6 w-6 text-blue-600" />
            </div>
            <CardTitle className="text-2xl">Consent Email Sent</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-gray-600">
              Because you're under 13, federal law (COPPA) requires parental consent before you can access AthleteMetrics.
              A consent request has been sent to <strong>{consentParentEmail}</strong>.
            </p>
            <p className="text-sm text-gray-500">
              Ask your parent or guardian to check their email and click the approval link. Once approved, you'll be able to log in.
            </p>
            <Button variant="outline" className="w-full" onClick={() => setLocation('/login')}>
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Invalid Invitation</h2>
              <p className="text-gray-600 mb-4">{error}</p>
              <Button onClick={() => setLocation('/login')} variant="outline">
                Go to Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary rounded-full flex items-center justify-center mb-4">
            <UserCheck className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold">Accept Invitation</CardTitle>
          <p className="text-gray-600 mt-2">
            You've been invited to join as an athlete
          </p>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Invitation Details */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center space-x-2">
              <Mail className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-600">Email:</span>
              <span className="text-sm font-medium">{invitation?.email}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Building className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-600">Role:</span>
              <span className="text-sm font-medium capitalize">{invitation?.role}</span>
            </div>
          </div>

          {/* Show which specific athlete they're signing up for */}
          {invitation?.athleteData && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <UserCheck className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold text-blue-900">Creating Account For</h3>
              </div>
              <p className="text-blue-800 font-medium">
                {invitation.athleteData?.firstName} {invitation.athleteData?.lastName}
              </p>
              <p className="text-blue-600 text-sm">
                Athlete ID: #{invitation.athleteData?.id?.slice(0, 8)}
              </p>
              {invitation.athleteData?.teams && invitation.athleteData.teams.length > 0 && (
                <div className="mt-3">
                  <p className="text-blue-700 text-sm font-medium mb-1">{labels.teams}:</p>
                  {invitation.athleteData.teams?.map((team, index) => (
                    <div key={team.id} className="text-blue-600 text-sm">
                      • {team.name} ({team.sport})
                    </div>
                  ))}
                </div>
              )}
              <p className="text-blue-600 text-sm mt-2">
                This account will be linked to this specific athlete
              </p>
            </div>
          )}

          {/* Account Setup Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={handleInputChange('firstName')}
                  required
                  data-testid="input-first-name"
                />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={handleInputChange('lastName')}
                  required
                  data-testid="input-last-name"
                />
              </div>
            </div>
            
            {/* Date of Birth — COPPA age gate */}
            <div>
              <Label htmlFor="birthDate">Date of Birth</Label>
              <Input
                id="birthDate"
                type="date"
                value={formData.birthDate}
                onChange={handleInputChange('birthDate')}
                max={new Date().toISOString().split('T')[0]}
                required
              />
            </div>

            {/* Parent/Guardian Email — shown for all minor athletes (under-18) */}
            {minor && (
              <div>
                <Label htmlFor="parentEmail">
                  Parent or Guardian Email {under13 && <span className="text-red-500">*</span>}
                </Label>
                {under13 && (
                  <Alert className="mb-2 border-amber-200 bg-amber-50">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-800 text-sm">
                      Federal law (COPPA) requires parental consent for users under 13. A parent or guardian must approve before you can log in.
                    </AlertDescription>
                  </Alert>
                )}
                {teenMinor && (
                  <p className="text-sm text-muted-foreground mb-2">
                    Optionally provide a parent/guardian email so they can monitor your athletic progress.
                  </p>
                )}
                <Input
                  id="parentEmail"
                  type="email"
                  value={formData.parentEmail}
                  onChange={handleInputChange('parentEmail')}
                  placeholder="parent@example.com"
                  required={under13}
                />
              </div>
            )}

            <div>
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <Input
                  id="username"
                  type="text"
                  value={formData.username}
                  onChange={handleInputChange('username')}
                  placeholder="Choose a unique username"
                  required
                  className={usernameError ? "border-red-500" : ""}
                  data-testid="input-username"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                />
                {usernameCheckLoading && (
                  <div className="absolute right-3 top-3">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  </div>
                )}
              </div>
              {usernameError ? (
                <p className="text-xs text-red-600 mt-1">{usernameError}</p>
              ) : (
                <p className="text-xs text-gray-500 mt-1">
                  Username must be unique and can contain letters, numbers, periods, hyphens, and underscores
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={handleInputChange('password')}
                  required
                  minLength={PASSWORD_REQUIREMENTS.minLength}
                  data-testid="input-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 focus:text-gray-600 focus:outline-none"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {getPasswordRequirementsText()}
              </p>
            </div>

            <div>
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={formData.confirmPassword}
                  onChange={handleInputChange('confirmPassword')}
                  required
                  minLength={PASSWORD_REQUIREMENTS.minLength}
                  data-testid="input-confirm-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 focus:text-gray-600 focus:outline-none"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

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
              disabled={submitting || !formData.termsAccepted}
              data-testid="button-accept-invitation"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Account...
                </>
              ) : (
                'Accept Invitation & Create Account'
              )}
            </Button>
          </form>

          <div className="text-center">
            <button 
              onClick={() => setLocation('/login')}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              Already have an account? Sign in
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}