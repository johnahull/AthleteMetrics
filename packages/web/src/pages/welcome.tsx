import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Users, TrendingUp, BarChart3 } from 'lucide-react';
import { useContextualLabels } from '@/hooks/useContextualLabels';
import { Footer } from '@/components/footer';

export default function Welcome() {
  const labels = useContextualLabels();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // If user is already logged in, redirect to dashboard
  useEffect(() => {
    if (user) {
      setLocation('/dashboard');
    }
  }, [user, setLocation]);

  // Don't render if user is logged in (will redirect)
  if (user) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="flex-1 flex items-center justify-center">
        <Card className="w-full max-w-md mx-4 shadow-lg" role="main">
        <CardContent className="pt-12 pb-8 px-8 space-y-6">
          {/* Logo/Icon */}
          <div className="flex justify-center">
            <img
              src="/logo-128.png"
              alt="AthleteMetrics logo"
              className="h-32 w-32"
              width={128}
              height={128}
            />
          </div>

          {/* Title */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-gray-900">
              AthleteMetrics
            </h1>
            <p className="text-gray-600 text-sm">
              Your data. Your D1 path.
            </p>
          </div>

          {/* Sign In Button */}
          <Button
            onClick={() => setLocation('/login')}
            className="w-full h-12 text-base"
            size="lg"
          >
            Sign In
          </Button>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-500">
                or
              </span>
            </div>
          </div>

          {/* Invitation Link */}
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-2">
              Have an invitation code?
            </p>
            <Button
              onClick={() => setLocation('/accept-invitation')}
              variant="outline"
              className="w-full"
            >
              Accept Invitation
            </Button>
          </div>

          {/* Feature Pills */}
          <div className="pt-4 space-y-3" role="list" aria-label="Key features">
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600" role="listitem">
              <Users className="h-4 w-4 text-primary" aria-hidden="true" />
              <span>See where you stand vs. D1 standards</span>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600" role="listitem">
              <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
              <span>Track speed, power, and agility over time</span>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600" role="listitem">
              <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
              <span>AI-powered insights after every assessment</span>
            </div>
          </div>

          {/* Footer Text */}
          <div className="text-center pt-4">
            <p className="text-xs text-gray-500">
              Developed by Big Time Athletes · Austin, TX
            </p>
          </div>
        </CardContent>
      </Card>
      </div>
      <Footer />
    </div>
  );
}
