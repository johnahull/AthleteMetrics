/**
 * COPPA Collect Parent Email Page (D4)
 *
 * Shown to athletes whose COPPA status is 'needs_parent_email'.
 * The athlete must provide their parent/guardian's email address
 * so a consent request can be sent.
 *
 * Works without authentication — designed for the post-login-block flow.
 * Pass ?username= in the query string so the backend can identify the user.
 *
 * Route: /coppa/collect-parent-email
 */
import { useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Shield, Mail, AlertCircle, Loader2 } from 'lucide-react';

export default function CoppaCollectParentEmail() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Read username from query params (passed after login block)
  const searchParams = new URLSearchParams(window.location.search);
  const usernameFromUrl = searchParams.get('username') || '';

  const [parentEmail, setParentEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!parentEmail.trim()) {
      setError("Parent or guardian's email is required.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/coppa/consent/update-parent-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: usernameFromUrl,
          parentEmail: parentEmail.trim().toLowerCase(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.code === 'parent_email_must_differ') {
          setError("Your parent's email must be different from your own email address.");
        } else {
          setError(data.message || 'Failed to send consent email. Please try again.');
        }
        return;
      }

      toast({
        title: 'Consent email sent',
        description: `We've sent a parental consent request to ${parentEmail.trim()}.`,
      });

      setLocation('/parental-consent');
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
        <CardHeader className="text-center">
          <p className="text-sm font-semibold tracking-wide text-primary uppercase mb-2">AthleteMetrics</p>
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Parent Email Required</CardTitle>
          <CardDescription>
            To activate your account, please provide your parent or guardian's email address.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Alert className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertDescription className="text-amber-800 dark:text-amber-200 text-sm">
              Federal law (COPPA) requires parental consent for users under 13.
              We will send your parent or guardian an approval email.
              You will be able to log in once they approve.
            </AlertDescription>
          </Alert>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="parentEmail">
                Parent or Guardian Email <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/70" />
                <Input
                  id="parentEmail"
                  type="email"
                  value={parentEmail}
                  onChange={(e) => setParentEmail(e.target.value)}
                  placeholder="parent@example.com"
                  className="pl-10"
                  required
                  autoFocus
                />
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending consent email...
                </>
              ) : (
                'Send Consent Email'
              )}
            </Button>
          </form>

          <Button
            variant="ghost"
            className="w-full text-sm"
            onClick={() => setLocation('/login')}
          >
            Back to Login
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
