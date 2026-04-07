/**
 * COPPA Consent Recovery Banner (D5)
 *
 * Shown on the athlete profile page (org admin / coach view) when
 * an athlete's coppaStatus is 'consent_revoked'. Allows an admin to
 * re-initiate the parental consent flow by providing the parent's email.
 *
 * Usage:
 *   <ConsentRecoveryBanner
 *     athleteId={athlete.id}
 *     athleteName={`${athlete.firstName} ${athlete.lastName}`}
 *     coppaStatus={athlete.coppaStatus}
 *     parentEmail={athlete.parentEmail}
 *   />
 */
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Shield, RefreshCw, Loader2, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ConsentRecoveryBannerProps {
  athleteId: string;
  athleteName: string;
  coppaStatus?: string;
  parentEmail?: string | null;
}

export function ConsentRecoveryBanner({
  athleteId,
  athleteName,
  coppaStatus,
  parentEmail: initialParentEmail,
}: ConsentRecoveryBannerProps) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [parentEmail, setParentEmail] = useState(initialParentEmail || '');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  // Only show for consent_revoked athletes
  if (coppaStatus !== 'consent_revoked') {
    return null;
  }

  const handleReInitiate = async () => {
    if (!parentEmail.trim()) return;

    setSubmitting(true);

    try {
      const res = await fetch(`/api/admin/coppa/re-initiate/${athleteId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ parentEmail: parentEmail.trim().toLowerCase() }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast({
          title: 'Failed to re-initiate consent',
          description: data.message || 'An error occurred. Please try again.',
          variant: 'destructive',
        });
        return;
      }

      setSent(true);
      setShowForm(false);
      toast({
        title: 'Consent email sent',
        description: `A new consent request has been sent to ${parentEmail.trim()}.`,
      });
    } catch {
      toast({
        title: 'Network error',
        description: 'Please check your connection and try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <Alert className="border-green-200 bg-green-50">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-800 text-sm">
          A new parental consent email has been sent for {athleteName}. Their account will be reactivated once a parent approves.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="border-amber-200 bg-amber-50">
      <Shield className="h-4 w-4 text-amber-600" />
      <AlertDescription className="space-y-3">
        <p className="text-amber-800 text-sm font-medium">
          Parental Consent Revoked
        </p>
        <p className="text-amber-700 text-sm">
          {athleteName}'s account is inactive because a parent or guardian revoked consent.
          You can re-initiate the consent flow to restore account access.
        </p>

        {!showForm ? (
          <Button
            variant="outline"
            size="sm"
            className="border-amber-300 text-amber-800 hover:bg-amber-100"
            onClick={() => setShowForm(true)}
          >
            <RefreshCw className="mr-2 h-3 w-3" />
            Re-initiate Consent
          </Button>
        ) : (
          <div className="space-y-3 pt-1">
            <div className="space-y-1">
              <Label htmlFor="reInitiateEmail" className="text-xs text-amber-800">
                Parent / Guardian Email
              </Label>
              <Input
                id="reInitiateEmail"
                type="email"
                value={parentEmail}
                onChange={(e) => setParentEmail(e.target.value)}
                placeholder="parent@example.com"
                className="h-8 text-sm border-amber-300 focus:ring-amber-300"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700"
                onClick={handleReInitiate}
                disabled={submitting || !parentEmail.trim()}
              >
                {submitting ? (
                  <><Loader2 className="mr-2 h-3 w-3 animate-spin" />Sending…</>
                ) : (
                  'Send Consent Email'
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-amber-700"
                onClick={() => setShowForm(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
