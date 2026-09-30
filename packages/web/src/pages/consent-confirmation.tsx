/**
 * Parental Consent Confirmation Page
 * Fully public — parents follow the emailed link to this page to grant or deny consent.
 * No authentication required. Token validation happens server-side.
 *
 * Route: /consent/:token
 */
import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Shield, CheckCircle2, XCircle, AlertCircle, Loader2, UserPlus, ChevronDown } from 'lucide-react';
import { CONSENT_TOKEN_EXPIRY_DAYS } from '@shared/coppa-utils';

type TokenStatus = 'loading' | 'valid' | 'expired' | 'used' | 'invalid';
type SubmitStatus = 'idle' | 'submitting' | 'granted' | 'denied';

interface ConsentData {
  athleteName: string;
  expiresAt: string;
  consentId?: string;
  parentEmail?: string;
}

export default function ConsentConfirmation() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();

  const [tokenStatus, setTokenStatus] = useState<TokenStatus>('loading');
  const [consentData, setConsentData] = useState<ConsentData | null>(null);
  const [aiConsentGranted, setAiConsentGranted] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle');
  const [submitError, setSubmitError] = useState('');
  const [registrationToken, setRegistrationToken] = useState('');
  const [showParentAccountCta, setShowParentAccountCta] = useState(true);
  const [dataCollectionOpen, setDataCollectionOpen] = useState(false);
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
        const body = await res.json().catch(() => ({}));
        if (granted && body.registrationToken) {
          setRegistrationToken(body.registrationToken);
        }
        setSubmitStatus(granted ? 'granted' : 'denied');
      } else {
        const body = await res.json().catch(() => ({}));
        setSubmitError(body.message || 'Something went wrong. Please try again.');
        setSubmitStatus('idle');
      }
    } catch {
      setSubmitError('Network error. Please check your connection and try again.');
      setSubmitStatus('idle');
    } finally {
      submittingRef.current = false;
    }
  };

  // ── Token validation states ──
  if (tokenStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (tokenStatus === 'expired') {
    return (
      <ConsentStatusCard
        icon={<AlertCircle className="h-8 w-8 text-amber-600 dark:text-amber-400" />}
        iconBg="bg-amber-100 dark:bg-amber-900/30"
        title="Link Expired"
        description={`This parental consent link has expired (links are valid for ${CONSENT_TOKEN_EXPIRY_DAYS} days).`}
      >
        <Alert className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
          <AlertDescription className="text-amber-800 dark:text-amber-200 text-sm">
            Please ask your child to log in to AthleteMetrics and request a new consent email.
          </AlertDescription>
        </Alert>
      </ConsentStatusCard>
    );
  }

  if (tokenStatus === 'used') {
    return (
      <ConsentStatusCard
        icon={<AlertCircle className="h-8 w-8 text-muted-foreground" />}
        iconBg="bg-muted"
        title="Already Responded"
        description="This consent link has already been used."
      >
        <p className="text-sm text-muted-foreground text-center">
          If you need to change your decision, please contact support.
        </p>
      </ConsentStatusCard>
    );
  }

  if (tokenStatus === 'invalid') {
    return (
      <ConsentStatusCard
        icon={<XCircle className="h-8 w-8 text-destructive" />}
        iconBg="bg-destructive/10"
        title="Invalid Link"
        description="This consent link is not valid."
      >
        <p className="text-sm text-muted-foreground text-center">
          Please check the email and click the link again. If you continue to see this error, contact support.
        </p>
      </ConsentStatusCard>
    );
  }

  // ── Post-submit states ──
  if (submitStatus === 'granted') {
    const athleteName = consentData?.athleteName ?? 'the athlete';

    // registrationToken is an opaque, single-use, server-issued reference —
    // it replaces putting the parent's email/consentId in the URL, where they
    // would leak into browser history, referrer headers, and access logs.
    const registerUrl = `/register?role=parent${registrationToken ? `&ref=${encodeURIComponent(registrationToken)}` : ''}`;

    return (
      <ConsentStatusCard
        icon={<CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />}
        iconBg="bg-green-100 dark:bg-green-900/30"
        title="Permission Granted"
        description={`You've approved ${athleteName}'s AthleteMetrics account.`}
        animated
      >
        <Alert className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30">
          <AlertDescription className="text-green-800 dark:text-green-200 text-sm">
            {athleteName} can now log in and use AthleteMetrics.
            {aiConsentGranted && ' AI-powered coaching insights have also been enabled for their account.'}
          </AlertDescription>
        </Alert>

        {showParentAccountCta && (
          <div className="border rounded-lg p-4 bg-primary/5 border-primary/20 space-y-3 mt-2">
            <p className="text-sm font-medium text-primary">
              Would you like to create a parent account to track {athleteName}'s progress?
            </p>
            <p className="text-xs text-primary/80">
              A parent account lets you monitor measurements, view reports, and stay informed about your child's athletic development.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                className="w-full bg-primary hover:bg-primary/90"
                onClick={() => setLocation(registerUrl)}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Create Parent Account
              </Button>
              <Button
                variant="ghost"
                className="w-full text-sm text-primary"
                onClick={() => setShowParentAccountCta(false)}
              >
                No thanks
              </Button>
            </div>
          </div>
        )}
      </ConsentStatusCard>
    );
  }

  if (submitStatus === 'denied') {
    return (
      <ConsentStatusCard
        icon={<XCircle className="h-8 w-8 text-destructive" />}
        iconBg="bg-destructive/10"
        title="Permission Denied"
        description={`You've denied ${consentData?.athleteName ?? 'the athlete'}'s account request.`}
        animated
      >
        <Alert className="border-destructive/20 bg-destructive/5">
          <AlertDescription className="text-destructive text-sm">
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
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <p className="text-sm font-semibold tracking-wide text-primary uppercase mb-2">AthleteMetrics</p>
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Parental Consent Request</CardTitle>
          <CardDescription>
            Review and respond to the consent request for{' '}
            <strong>{consentData?.athleteName ?? 'an athlete'}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Collapsible data collection details */}
          <Collapsible open={dataCollectionOpen} onOpenChange={setDataCollectionOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${dataCollectionOpen ? 'rotate-180' : ''}`}
                />
                {dataCollectionOpen ? 'Hide' : 'View'} data collection details
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 mt-3">
              {/* What AthleteMetrics collects */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-foreground">What AthleteMetrics Collects</h3>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Athletic performance measurements (speeds, jump heights, agility times)</li>
                  <li>Basic profile information (name, date of birth, sport)</li>
                  <li>Progress data over time</li>
                </ul>
              </div>

              {/* How it's used */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-foreground">How This Data Is Used</h3>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>To track your child's athletic performance over time</li>
                  <li>To share progress with coaches and team staff within your child's organization</li>
                  <li>Data is never sold to third parties</li>
                </ul>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* AI consent opt-in */}
          <div className="border rounded-lg p-4 bg-muted/50 space-y-3">
            <h3 className="font-semibold text-sm text-foreground">Optional: AI Coaching Insights</h3>
            <p id="ai-consent-description" className="text-sm text-muted-foreground">
              AthleteMetrics can generate personalized coaching insights using AI based on your child's performance data.
              This is optional — you may grant or withhold this separately.
            </p>
            <div className="flex items-center gap-2">
              <Checkbox
                id="aiConsent"
                aria-describedby="ai-consent-description"
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
            <h3 className="font-semibold text-sm text-foreground">Your Rights as a Parent/Guardian</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Review your child's personal information at any time</li>
              <li>Request deletion of your child's account and data</li>
              <li>Revoke this consent at any time by contacting support</li>
            </ul>
          </div>

          {expiresDate && (
            <p className="text-xs text-muted-foreground/70 text-center">
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
              className="w-full bg-green-600 dark:bg-green-500 hover:bg-green-700 dark:hover:bg-green-600"
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
              className="w-full border-destructive/20 text-destructive hover:bg-destructive/5"
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
  animated = false,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  children: React.ReactNode;
  animated?: boolean;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className={animated ? 'animate-in fade-in zoom-in-95 duration-300 w-full max-w-md' : 'w-full max-w-md'}>
        <Card>
          <CardHeader className="text-center">
            <p className="text-sm font-semibold tracking-wide text-primary uppercase mb-2">AthleteMetrics</p>
            <div className={`mx-auto w-16 h-16 ${iconBg} rounded-full flex items-center justify-center mb-4`}>
              {icon}
            </div>
            <CardTitle className="text-2xl">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">{children}</CardContent>
        </Card>
      </div>
    </div>
  );
}
