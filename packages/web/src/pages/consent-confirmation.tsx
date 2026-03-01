/**
 * Parental Consent Confirmation Page
 * Fully public — parents follow the emailed link to this page to grant or deny consent.
 * No authentication required. Token validation happens server-side.
 *
 * Route: /consent/:token
 */
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Shield, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';

type TokenStatus = 'loading' | 'valid' | 'expired' | 'used' | 'invalid';
type SubmitStatus = 'idle' | 'submitting' | 'granted' | 'denied';

interface ConsentData {
  athleteName: string;
  expiresAt: string;
}

export default function ConsentConfirmation() {
  const { token } = useParams<{ token: string }>();

  const [tokenStatus, setTokenStatus] = useState<TokenStatus>('loading');
  const [consentData, setConsentData] = useState<ConsentData | null>(null);
  const [aiConsentGranted, setAiConsentGranted] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle');
  const [submitError, setSubmitError] = useState('');
  // Synchronous guard prevents double-click from firing two requests before
  // React state update (setSubmitStatus) disables the buttons
  const submittingRef = useRef(false);

  // Verify the token on mount
  useEffect(() => {
    if (!token) {
      setTokenStatus('invalid');
      return;
    }
    fetch(`/api/coppa/consent/verify/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (res.status === 200) {
          const data = await res.json();
          setConsentData(data);
          setTokenStatus('valid');
        } else if (res.status === 410) {
          setTokenStatus('expired');
        } else if (res.status === 400) {
          setTokenStatus('used');
        } else {
          setTokenStatus('invalid');
        }
      })
      .catch(() => setTokenStatus('invalid'));
  }, [token]);

  const handleSubmit = async (granted: boolean) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitStatus('submitting');
    setSubmitError('');
    try {
      const res = await fetch(`/api/coppa/consent/verify/${encodeURIComponent(token!)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ granted, aiConsentGranted: granted ? aiConsentGranted : false }),
      });
      if (res.ok) {
        setSubmitStatus(granted ? 'granted' : 'denied');
      } else {
        const body = await res.json().catch(() => ({}));
        setSubmitError(body.message || 'Something went wrong. Please try again.');
        setSubmitStatus('idle');
        submittingRef.current = false;
      }
    } catch {
      setSubmitError('Network error. Please check your connection and try again.');
      setSubmitStatus('idle');
      submittingRef.current = false;
    }
  };

  // ── Token validation states ──
  if (tokenStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (tokenStatus === 'expired') {
    return (
      <ConsentStatusCard
        icon={<AlertCircle className="h-8 w-8 text-amber-600" />}
        iconBg="bg-amber-100"
        title="Link Expired"
        description="This parental consent link has expired (links are valid for 30 days)."
      >
        <Alert className="border-amber-200 bg-amber-50">
          <AlertDescription className="text-amber-800 text-sm">
            Please ask your child to log in to AthleteMetrics and request a new consent email.
          </AlertDescription>
        </Alert>
      </ConsentStatusCard>
    );
  }

  if (tokenStatus === 'used') {
    return (
      <ConsentStatusCard
        icon={<AlertCircle className="h-8 w-8 text-gray-600" />}
        iconBg="bg-gray-100"
        title="Already Responded"
        description="This consent link has already been used."
      >
        <p className="text-sm text-gray-600 text-center">
          If you need to change your decision, please contact support.
        </p>
      </ConsentStatusCard>
    );
  }

  if (tokenStatus === 'invalid') {
    return (
      <ConsentStatusCard
        icon={<XCircle className="h-8 w-8 text-red-600" />}
        iconBg="bg-red-100"
        title="Invalid Link"
        description="This consent link is not valid."
      >
        <p className="text-sm text-gray-600 text-center">
          Please check the email and click the link again. If you continue to see this error, contact support.
        </p>
      </ConsentStatusCard>
    );
  }

  // ── Post-submit states ──
  if (submitStatus === 'granted') {
    return (
      <ConsentStatusCard
        icon={<CheckCircle2 className="h-8 w-8 text-green-600" />}
        iconBg="bg-green-100"
        title="Permission Granted"
        description={`You've approved ${consentData?.athleteName ?? 'the athlete'}'s AthleteMetrics account.`}
      >
        <Alert className="border-green-200 bg-green-50">
          <AlertDescription className="text-green-800 text-sm">
            {consentData?.athleteName ?? 'The athlete'} can now log in and use AthleteMetrics.
            {aiConsentGranted && ' AI-powered coaching insights have also been enabled for their account.'}
          </AlertDescription>
        </Alert>
      </ConsentStatusCard>
    );
  }

  if (submitStatus === 'denied') {
    return (
      <ConsentStatusCard
        icon={<XCircle className="h-8 w-8 text-red-600" />}
        iconBg="bg-red-100"
        title="Permission Denied"
        description={`You've denied ${consentData?.athleteName ?? 'the athlete'}'s account request.`}
      >
        <Alert className="border-red-200 bg-red-50">
          <AlertDescription className="text-red-800 text-sm">
            The account will remain inactive. If you change your mind, please contact support.
          </AlertDescription>
        </Alert>
      </ConsentStatusCard>
    );
  }

  // ── Main consent form ──
  const expiresDate = consentData?.expiresAt
    ? new Date(consentData.expiresAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <Shield className="h-8 w-8 text-blue-600" />
          </div>
          <CardTitle className="text-2xl">Parental Consent Request</CardTitle>
          <CardDescription>
            Review and respond to the consent request for{' '}
            <strong>{consentData?.athleteName ?? 'an athlete'}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* What AthleteMetrics collects */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-gray-900">What AthleteMetrics Collects</h3>
            <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
              <li>Athletic performance measurements (speeds, jump heights, agility times)</li>
              <li>Basic profile information (name, date of birth, sport)</li>
              <li>Progress data over time</li>
            </ul>
          </div>

          {/* How it's used */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-gray-900">How This Data Is Used</h3>
            <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
              <li>To track your child's athletic performance over time</li>
              <li>To share progress with coaches and team staff within your child's organization</li>
              <li>Data is never sold to third parties</li>
            </ul>
          </div>

          {/* AI consent opt-in */}
          <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
            <h3 className="font-semibold text-sm text-gray-900">Optional: AI Coaching Insights</h3>
            <p className="text-sm text-gray-600">
              AthleteMetrics can generate personalized coaching insights using AI based on your child's performance data.
              This is optional — you may grant or withhold this separately.
            </p>
            <div className="flex items-center gap-2">
              <Checkbox
                id="aiConsent"
                checked={aiConsentGranted}
                onCheckedChange={(checked) => setAiConsentGranted(checked === true)}
              />
              <Label htmlFor="aiConsent" className="text-sm cursor-pointer">
                Allow AI-powered coaching insights for this athlete
              </Label>
            </div>
          </div>

          {/* Parent rights */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-gray-900">Your Rights as a Parent/Guardian</h3>
            <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
              <li>Review your child's personal information at any time</li>
              <li>Request deletion of your child's account and data</li>
              <li>Revoke this consent at any time by contacting support</li>
            </ul>
          </div>

          {expiresDate && (
            <p className="text-xs text-gray-500 text-center">
              This consent link expires on {expiresDate}.
            </p>
          )}

          {submitError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-3 pt-2">
            <Button
              className="w-full bg-green-600 hover:bg-green-700"
              onClick={() => handleSubmit(true)}
              disabled={submitStatus === 'submitting'}
            >
              {submitStatus === 'submitting' ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing…</>
              ) : (
                <><CheckCircle2 className="mr-2 h-4 w-4" />Grant Permission</>
              )}
            </Button>
            <Button
              variant="outline"
              className="w-full border-red-200 text-red-600 hover:bg-red-50"
              onClick={() => handleSubmit(false)}
              disabled={submitStatus === 'submitting'}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Deny
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Reusable card for terminal/status states
function ConsentStatusCard({
  icon,
  iconBg,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className={`mx-auto w-16 h-16 ${iconBg} rounded-full flex items-center justify-center mb-4`}>
            {icon}
          </div>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </div>
  );
}
