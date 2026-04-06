/**
 * Parent Link-a-Child Form (Phase 5)
 *
 * Allows a parent to request linking their account to a child's athlete account.
 * Uses anti-enumeration: the backend always returns 200 regardless of whether
 * the child identifier resolves to a real user.
 *
 * Route: /parent/link-child
 */
import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { UserPlus, Search, AlertCircle, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function ParentLinkChild() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [childIdentifier, setChildIdentifier] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  // Role guard — only parents can access this page
  useEffect(() => {
    if (!user) {
      setLocation('/login');
    } else if (user.role !== 'parent') {
      setLocation('/dashboard');
    }
  }, [user, setLocation]);

  if (!user || user.role !== 'parent') return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!childIdentifier.trim()) {
      setError("Please enter your child's username or email address.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/parent/link-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ childIdentifier: childIdentifier.trim() }),
      });

      if (!res.ok) {
        // Treat all non-2xx responses as a generic network/server error
        throw new Error(`Server error: ${res.status}`);
      }

      // Always show success message (anti-enumeration response from server)
      setSubmitted(true);
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
          <p className="text-sm font-semibold tracking-wide text-primary uppercase mb-2">
            AthleteMetrics
          </p>
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <UserPlus className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Link to a Child's Account</CardTitle>
          <CardDescription>
            Enter your child's username or email to request a link to their account.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {submitted ? (
            <div className="space-y-4">
              <Alert className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-green-800 dark:text-green-200 text-sm">
                  If this user exists, your request has been submitted. Their coach will review it.
                </AlertDescription>
              </Alert>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => setLocation('/parent-dashboard')}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Button>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="childIdentifier">
                    Username or Email <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/70" />
                    <Input
                      id="childIdentifier"
                      type="text"
                      value={childIdentifier}
                      onChange={(e) => setChildIdentifier(e.target.value)}
                      placeholder="child_username or child@example.com"
                      className="pl-10"
                      autoFocus
                      autoComplete="off"
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
                      Sending request...
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Send Link Request
                    </>
                  )}
                </Button>
              </form>

              <Button
                variant="ghost"
                className="w-full text-sm"
                onClick={() => setLocation('/parent-dashboard')}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
