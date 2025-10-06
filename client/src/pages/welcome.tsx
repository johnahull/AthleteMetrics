import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BarChart3, Users, TrendingUp } from 'lucide-react';

export default function Welcome() {
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <Card className="w-full max-w-md mx-4 shadow-lg">
        <CardContent className="pt-12 pb-8 px-8 space-y-6">
          {/* Logo/Icon */}
          <div className="flex justify-center">
            <div className="h-20 w-20 rounded-full bg-primary flex items-center justify-center">
              <BarChart3 className="h-10 w-10 text-white" />
            </div>
          </div>

          {/* Title */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-gray-900">
              AthleteMetrics
            </h1>
            <p className="text-gray-600 text-sm">
              Track, analyze, and improve athletic performance
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
          <div className="pt-4 space-y-3">
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
              <Users className="h-4 w-4 text-primary" />
              <span>Team Management</span>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
              <BarChart3 className="h-4 w-4 text-primary" />
              <span>Performance Analytics</span>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span>Data-Driven Insights</span>
            </div>
          </div>

          {/* Footer Text */}
          <div className="text-center pt-4">
            <p className="text-xs text-gray-500">
              For coaches, admins, and athletes
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
