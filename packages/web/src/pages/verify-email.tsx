import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, UserCheck } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading, logout } = useAuth();
  const [status, setStatus] = useState<'verifying' | 'confirm' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('');
  const [signInToRestoreLinks, setSignInToRestoreLinks] = useState(false);
  const redeemed = useRef(false);

  const token = new URLSearchParams(window.location.search).get('token');

  const redeem = () => {
    if (redeemed.current || !token) return;
    redeemed.current = true;
    setStatus('verifying');

    // Verify the email using enhanced auth endpoint. apiRequest sends the session and its CSRF token, so a
    // signed-in redemption by the token's own account also restores linked records.
    apiRequest('POST', '/api/enhanced-auth/verify-email', { token })
      .then(async (res) => {
        const data = await res.json();
        if (data.success) {
          setStatus('success');
          setMessage(data.message || 'Email verified successfully!');
          setSignInToRestoreLinks(data.signInToRestoreLinks === true);
        } else {
          setStatus('error');
          setMessage(data.message || 'Verification failed');
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage('An error occurred while verifying your email');
      });
  };

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Invalid verification link - token is missing');
      return;
    }
    if (authLoading || redeemed.current) return;
    // Signed in: the person confirms which account the link is for before it is redeemed with that session
    if (user) {
      setStatus('confirm');
    } else {
      redeem();
    }
  }, [token, authLoading, user]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {status === 'verifying' && <Loader2 className="h-16 w-16 text-blue-600 animate-spin" />}
            {status === 'confirm' && <UserCheck className="h-16 w-16 text-blue-600" />}
            {status === 'success' && <CheckCircle2 className="h-16 w-16 text-green-600" />}
            {status === 'error' && <XCircle className="h-16 w-16 text-red-600" />}
          </div>
          <CardTitle className="text-2xl">
            {status === 'verifying' && 'Verifying Your Email'}
            {status === 'confirm' && 'Confirm Your Account'}
            {status === 'success' && 'Email Verified!'}
            {status === 'error' && 'Verification Failed'}
          </CardTitle>
          <CardDescription>
            {status === 'verifying' && 'Please wait while we verify your email address...'}
            {status === 'confirm' && 'This link verifies the email address of the account you are signed in to.'}
            {status === 'success' && message}
            {status === 'error' && message}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'confirm' && user && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 text-center">
                Signed in as <span className="font-semibold text-gray-900">{user.username}</span>
              </p>
              <Button onClick={redeem} className="w-full">
                Confirm and verify email
              </Button>
              <Button variant="outline" onClick={() => logout()} className="w-full">
                Not you? Sign out
              </Button>
            </div>
          )}
          {status === 'success' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 text-center">
                Your email has been successfully verified. You can now sign in to your account.
              </p>
              {signInToRestoreLinks && (
                <p className="text-sm text-gray-600 text-center">
                  To restore records linked from your other organizations, sign in and choose
                  &ldquo;Verify your email to restore linked records&rdquo; on your Global Profile page.
                </p>
              )}
              <Button
                onClick={() => setLocation('/login?verified=true')}
                className="w-full"
              >
                Sign In Now
              </Button>
            </div>
          )}
          {status === 'error' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 text-center">
                The verification link may have expired or is invalid. Please sign in and request a new verification email.
              </p>
              <Button
                onClick={() => setLocation('/login')}
                className="w-full"
              >
                Go to Login
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
