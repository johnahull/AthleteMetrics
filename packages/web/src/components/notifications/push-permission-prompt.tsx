/**
 * PushPermissionPrompt - Component to prompt users to enable push notifications
 *
 * Features:
 * - Smart timing (shows after engagement, not immediately)
 * - Explains benefits before asking
 * - Handles all permission states
 * - Responsive design for mobile and desktop
 */

import { useState, useEffect } from 'react';
import { Bell, X, BellOff, Smartphone, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { usePushNotifications } from '@/hooks/use-push-notifications';

interface PushPermissionPromptProps {
  // When to show the prompt (in seconds after page load)
  delaySeconds?: number;
  // Custom title
  title?: string;
  // Custom description
  description?: string;
  // Callback when user subscribes
  onSubscribe?: () => void;
  // Callback when user dismisses
  onDismiss?: () => void;
  // Show as a toast-style notification instead of card
  variant?: 'card' | 'banner' | 'inline';
  // Force show even if already subscribed (for testing)
  forceShow?: boolean;
}

// Local storage key for tracking dismissal
const DISMISSED_KEY = 'push_prompt_dismissed';
const DISMISSED_EXPIRY_DAYS = 7;

export function PushPermissionPrompt({
  delaySeconds = 30,
  title = 'Stay Updated',
  description = 'Enable notifications to get instant updates about wellness surveys, new measurements, and team announcements.',
  onSubscribe,
  onDismiss,
  variant = 'banner',
  forceShow = false,
}: PushPermissionPromptProps) {
  const {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    error,
    subscribe,
  } = usePushNotifications();

  const [isVisible, setIsVisible] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [deviceName, setDeviceName] = useState('');

  // Check if prompt should be shown
  useEffect(() => {
    // Don't show if:
    // - Not supported
    // - Already subscribed
    // - Permission already denied
    // - Recently dismissed (unless forceShow)
    if (!isSupported || isSubscribed || permission === 'denied') {
      return;
    }

    if (!forceShow) {
      // Check if recently dismissed
      const dismissedAt = localStorage.getItem(DISMISSED_KEY);
      if (dismissedAt) {
        const dismissedDate = new Date(dismissedAt);
        const expiryDate = new Date(dismissedDate);
        expiryDate.setDate(expiryDate.getDate() + DISMISSED_EXPIRY_DAYS);

        if (new Date() < expiryDate) {
          return; // Still within dismissal period
        }
      }
    }

    // Show after delay
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delaySeconds * 1000);

    return () => clearTimeout(timer);
  }, [isSupported, isSubscribed, permission, delaySeconds, forceShow]);

  const handleEnable = async () => {
    setIsEnabling(true);
    try {
      const success = await subscribe(deviceName || undefined);
      if (success) {
        setIsVisible(false);
        onSubscribe?.();
      }
    } finally {
      setIsEnabling(false);
    }
  };

  const handleDismiss = () => {
    // Store dismissal time
    localStorage.setItem(DISMISSED_KEY, new Date().toISOString());
    setIsVisible(false);
    onDismiss?.();
  };

  // Don't render if not visible
  if (!isVisible || isLoading) {
    return null;
  }

  // Permission denied state
  if (permission === 'denied') {
    return (
      <PermissionDeniedBanner variant={variant} onDismiss={handleDismiss} />
    );
  }

  // Render based on variant
  if (variant === 'card') {
    return (
      <Card className="w-full max-w-md mx-auto shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <Bell className="h-8 w-8 text-primary" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Check className="h-4 w-4 mt-0.5 text-green-500" />
            <span>Wellness survey reminders</span>
          </div>
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Check className="h-4 w-4 mt-0.5 text-green-500" />
            <span>New measurement alerts</span>
          </div>
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Check className="h-4 w-4 mt-0.5 text-green-500" />
            <span>Team announcements</span>
          </div>
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleDismiss}
          >
            Not Now
          </Button>
          <Button
            className="flex-1"
            onClick={handleEnable}
            disabled={isEnabling}
          >
            {isEnabling ? 'Enabling...' : 'Enable Notifications'}
          </Button>
        </CardFooter>
        {error && (
          <p className="px-6 pb-4 text-sm text-destructive">{error}</p>
        )}
      </Card>
    );
  }

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg border">
        <Bell className="h-6 w-6 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{title}</p>
          <p className="text-xs text-muted-foreground truncate">{description}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDismiss}
          >
            Later
          </Button>
          <Button
            size="sm"
            onClick={handleEnable}
            disabled={isEnabling}
          >
            Enable
          </Button>
        </div>
      </div>
    );
  }

  // Default: banner variant
  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 animate-in slide-in-from-bottom-4">
      <Card className="shadow-lg border-primary/20">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <div className="shrink-0">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Bell className="h-5 w-5 text-primary" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-medium text-sm">{title}</h4>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 -mt-1 -mr-2"
                  onClick={handleDismiss}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {description}
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7"
                  onClick={handleDismiss}
                >
                  Maybe Later
                </Button>
                <Button
                  size="sm"
                  className="text-xs h-7"
                  onClick={handleEnable}
                  disabled={isEnabling}
                >
                  <Smartphone className="h-3 w-3 mr-1" />
                  {isEnabling ? 'Enabling...' : 'Enable'}
                </Button>
              </div>
              {error && (
                <p className="text-xs text-destructive mt-2">{error}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Banner shown when permission was denied
 */
function PermissionDeniedBanner({
  variant,
  onDismiss,
}: {
  variant: 'card' | 'banner' | 'inline';
  onDismiss: () => void;
}) {
  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg border border-orange-200 dark:border-orange-800">
        <BellOff className="h-6 w-6 text-orange-500 shrink-0" />
        <div className="flex-1">
          <p className="font-medium text-sm">Notifications Blocked</p>
          <p className="text-xs text-muted-foreground">
            To enable, update your browser notification settings.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50">
      <Card className="shadow-lg border-orange-200 dark:border-orange-800">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <div className="shrink-0">
              <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center">
                <BellOff className="h-5 w-5 text-orange-500" />
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-medium text-sm">Notifications Blocked</h4>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 -mt-1 -mr-2"
                  onClick={onDismiss}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                You've blocked notifications. To enable them, click the lock
                icon in your browser's address bar and allow notifications.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default PushPermissionPrompt;
