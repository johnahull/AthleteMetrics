import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (!token) {
      setStatus('error');
      setMessage('Invalid verification link - token is missing');
      return;
    }

    // Verify the email
    fetch(`/api/auth/verify-email/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) {
          setStatus('success');
          setMessage(data.message || 'Email verified successfully!');
        } else {
          setStatus('error');
          setMessage(data.message || 'Verification failed');
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage('An error occurred while verifying your email');
      });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {status === 'verifying' && <Loader2 className="h-16 w-16 text-blue-600 animate-spin" />}
            {status === 'success' && <CheckCircle2 className="h-16 w-16 text-green-600" />}
            {status === 'error' && <XCircle className="h-16 w-16 text-red-600" />}
          </div>
          <CardTitle className="text-2xl">
            {status === 'verifying' && 'Verifying Your Email'}
            {status === 'success' && 'Email Verified!'}
            {status === 'error' && 'Verification Failed'}
          </CardTitle>
          <CardDescription>
            {status === 'verifying' && 'Please wait while we verify your email address...'}
            {status === 'success' && message}
            {status === 'error' && message}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'success' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 text-center">
                Your email has been successfully verified. You can now access all features of your account.
              </p>
              <Button
                onClick={() => setLocation('/dashboard')}
                className="w-full"
              >
                Go to Dashboard
              </Button>
            </div>
          )}
          {status === 'error' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 text-center">
                The verification link may have expired or is invalid. You can request a new verification email from your profile.
              </p>
              <Button
                onClick={() => setLocation('/profile')}
                className="w-full"
              >
                Go to Profile
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
