import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2, Loader2, Mail, XCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { apiClient } from '@/lib/api';
import { isUnder13, isMinorAge } from '@shared/coppa-utils';

export default function CompleteProfile() {
  const { user, isLoading, logout } = useAuth();
  const [, setLocation] = useLocation();
  const missing = user?.missingProfileFields ?? [];
  const needDob = missing.includes('birthDate');
  const needEmail = missing.includes('email');

  const [birthDate, setBirthDate] = useState('');
  const [email, setEmail] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [consentSent, setConsentSent] = useState(false);
  const [emailChecking, setEmailChecking] = useState(false);
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [emailError, setEmailError] = useState('');

  const under13 = (() => {
    if (!birthDate) return false;
    try { return isUnder13(birthDate); } catch { return false; }
  })();
  const minor = (() => {
    if (!birthDate) return false;
    try { return isMinorAge(birthDate); } catch { return false; }
  })();

  useEffect(() => {
    if (!isLoading && !user && !consentSent) setLocation('/login');
    // Nothing left to complete (e.g. fixed in another session): leave the page
    if (!isLoading && user && missing.length === 0 && !submitting) setLocation('/dashboard');
  }, [isLoading, user, missing.length, submitting, consentSent, setLocation]);

  // Debounced availability check, same endpoint as registration
  useEffect(() => {
    if (!needEmail || !email.includes('@')) {
      setEmailAvailable(null);
      setEmailError('');
      return;
    }
    const timer = setTimeout(async () => {
      setEmailChecking(true);
      try {
        const response = await fetch(`/api/auth/check-email?email=${encodeURIComponent(email)}`);
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
  }, [email, needEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (under13 && !parentEmail.trim()) {
      setError('A parent or guardian email is required for athletes under 13.');
      return;
    }
    const body: Record<string, string> = {};
    if (needDob) body.birthDate = birthDate;
    if (needEmail) body.email = email.trim().toLowerCase();
    if (needDob && minor && parentEmail.trim()) body.parentEmail = parentEmail.trim().toLowerCase();

    setSubmitting(true);
    try {
      const data = await apiClient.post<{ requiresParentalConsent?: boolean }>('/profile/complete', body);
      if (data.requiresParentalConsent) {
        setConsentSent(true);
        return;
      }
      // Full load re-runs the auth check, so the layout sees the completed profile
      window.location.assign('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile');
    } finally {
      setSubmitting(false);
    }
  };

  if (consentSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Check with your parent</CardTitle>
            <CardDescription>
              A consent email has been sent to your parent or guardian. You will be able to log in once they approve your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => window.location.assign('/login')}>
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src="/logo-128.png" alt="AthleteMetrics logo" className="h-16 w-16 mx-auto mb-4" />
          <CardTitle className="text-2xl">Complete your profile</CardTitle>
          <CardDescription>
            We need a few more details before you continue. Your date of birth is used to apply the right privacy protections.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {needDob && (
              <div className="grid gap-y-2">
                <Label htmlFor="birthDate">Date of Birth</Label>
                <Input
                  id="birthDate"
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  max={format(new Date(), 'yyyy-MM-dd')}
                  required
                />
              </div>
            )}

            {needDob && minor && (
              <div className="grid gap-y-2">
                <Label htmlFor="parentEmail">
                  Parent or Guardian Email {under13 && <span className="text-red-500">*</span>}
                </Label>
                {under13 && (
                  <Alert className="border-amber-200 bg-amber-50">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-800 text-sm">
                      Federal law (COPPA) requires parental consent for users under 13. A consent email will be sent to your parent or guardian. You will be able to log in once they approve.
                    </AlertDescription>
                  </Alert>
                )}
                <Input
                  id="parentEmail"
                  type="email"
                  value={parentEmail}
                  onChange={(e) => setParentEmail(e.target.value)}
                  placeholder="parent@example.com"
                  required={under13}
                />
              </div>
            )}

            {needEmail && (
              <div className="grid gap-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="pl-10"
                    required
                  />
                  {emailChecking && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-gray-400" />}
                  {!emailChecking && emailAvailable === true && <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-green-500" />}
                  {!emailChecking && emailAvailable === false && <XCircle className="absolute right-3 top-3 h-4 w-4 text-red-500" />}
                </div>
                {emailError && <p className="text-sm text-red-500">{emailError}</p>}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={submitting || emailAvailable === false}>
              {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : 'Continue'}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={logout}>
              Log out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
