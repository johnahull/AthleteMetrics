/**
 * Parental Consent Waiting Page
 * Shown to under-13 athletes after registration while they await parental approval.
 * The athlete cannot log in until the parent/guardian approves via the email link.
 */
import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Mail, Clock, Shield } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { CONSENT_TOKEN_EXPIRY_DAYS } from '@shared/coppa-utils';

export default function ParentalConsentWaiting() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [resending, setResending] = useState(false);

  // D2: Redirect away if user's COPPA status is not pending_consent
  useEffect(() => {
    if (user && user.coppaStatus !== 'pending_consent') {
      setLocation('/login');
    }
  }, [user, setLocation]);

  const handleResendConsent = async () => {
    setResending(true);
    try {
      const res = await fetch('/api/coppa/consent/initiate', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        toast({
          title: 'Consent email resent',
          description: 'A new consent request has been sent to your parent or guardian.',
        });
      } else {
        toast({
          title: 'Unable to resend',
          description: 'Please try again later or contact support.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Network error',
        description: 'Please check your connection and try again.',
        variant: 'destructive',
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
        <CardHeader className="text-center">
          <p className="text-sm font-semibold tracking-wide text-primary uppercase mb-2">AthleteMetrics</p>
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Clock className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Awaiting Parental Approval</CardTitle>
          <CardDescription>
            Your account is pending parental or guardian consent
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-primary/20 bg-primary/5">
            <Shield className="h-4 w-4 text-primary" />
            <AlertDescription className="text-primary text-sm">
              Because you're under 13, federal law (COPPA) requires a parent or guardian to approve
              your account before you can log in. We've sent them a consent email.
            </AlertDescription>
          </Alert>

          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <Mail className="h-4 w-4 text-muted-foreground/70 mt-0.5 shrink-0" />
              <p>Your parent or guardian should check their email for a message from AthleteMetrics.</p>
            </div>
            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 text-muted-foreground/70 mt-0.5 shrink-0" />
              <p>The consent link expires in {CONSENT_TOKEN_EXPIRY_DAYS} days. If it expires, you'll need to request a new one.</p>
            </div>
          </div>

          <div className="border-t pt-4 space-y-2">
            <p className="text-xs text-muted-foreground text-center">
              Didn't receive the email? Ask your parent to check their spam folder, or resend below.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleResendConsent}
              disabled={resending}
            >
              {resending ? 'Resending…' : 'Resend Consent Email'}
            </Button>
            <Button
              variant="ghost"
              className="w-full text-sm"
              onClick={() => setLocation('/login')}
            >
              Back to Login
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
