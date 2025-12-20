/**
 * usePushNotifications - React hook for Web Push notification management
 *
 * Provides a unified interface for:
 * - Checking browser support and permission status
 * - Requesting notification permission
 * - Subscribing/unsubscribing from push notifications
 * - Managing push subscriptions with the backend
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';

// Push subscription status
export type PushPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

export interface PushSubscription {
  id: string;
  endpoint: string;
  deviceName?: string | null;
  createdAt: string;
  lastUsedAt?: string | null;
}

export interface UsePushNotificationsResult {
  // State
  isSupported: boolean;
  permission: PushPermissionStatus;
  isSubscribed: boolean;
  subscription: PushSubscriptionJSON | null;
  subscriptions: PushSubscription[];
  isLoading: boolean;
  error: string | null;

  // Actions
  requestPermission: () => Promise<NotificationPermission>;
  subscribe: (deviceName?: string) => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
  unsubscribeById: (subscriptionId: string) => Promise<boolean>;
  refreshSubscriptions: () => Promise<void>;
  sendTestNotification: () => Promise<boolean>;
}

/**
 * Convert URL-safe base64 to Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

/**
 * Convert ArrayBuffer to URL-safe base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function usePushNotifications(): UsePushNotificationsResult {
  const { user } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<PushPermissionStatus>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscriptionJSON | null>(null);
  const [subscriptions, setSubscriptions] = useState<PushSubscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check browser support
  useEffect(() => {
    const checkSupport = () => {
      const supported =
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window;

      setIsSupported(supported);

      if (!supported) {
        setPermission('unsupported');
        setIsLoading(false);
      }
    };

    checkSupport();
  }, []);

  // Check current permission and subscription status
  useEffect(() => {
    const checkPermission = async () => {
      if (!isSupported || !user) {
        setIsLoading(false);
        return;
      }

      try {
        // Check notification permission
        const notifPermission = Notification.permission;
        setPermission(notifPermission as PushPermissionStatus);

        // Check if we have an active subscription
        const registration = await navigator.serviceWorker.ready;
        const currentSubscription = await registration.pushManager.getSubscription();

        if (currentSubscription) {
          setSubscription(currentSubscription.toJSON());
          setIsSubscribed(true);
        } else {
          setSubscription(null);
          setIsSubscribed(false);
        }
      } catch (err) {
        console.error('Error checking push status:', err);
        setError('Failed to check push notification status');
      } finally {
        setIsLoading(false);
      }
    };

    checkPermission();
  }, [isSupported, user]);

  // Fetch user's subscriptions from the server
  const refreshSubscriptions = useCallback(async () => {
    if (!user) return;

    try {
      const response = await fetch('/api/push/subscriptions', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setSubscriptions(data.subscriptions || []);
      }
    } catch (err) {
      console.error('Error fetching subscriptions:', err);
    }
  }, [user]);

  // Load subscriptions when user changes
  useEffect(() => {
    if (user) {
      refreshSubscriptions();
    } else {
      setSubscriptions([]);
    }
  }, [user, refreshSubscriptions]);

  // Request notification permission
  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (!isSupported) {
      return 'denied';
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result as PushPermissionStatus);
      return result;
    } catch (err) {
      console.error('Error requesting permission:', err);
      setError('Failed to request notification permission');
      return 'denied';
    }
  }, [isSupported]);

  // Subscribe to push notifications
  const subscribe = useCallback(async (deviceName?: string): Promise<boolean> => {
    if (!isSupported || !user) {
      setError('Push notifications are not supported or user is not authenticated');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Request permission if needed
      if (Notification.permission === 'default') {
        const permResult = await Notification.requestPermission();
        setPermission(permResult as PushPermissionStatus);
        if (permResult !== 'granted') {
          setError('Notification permission denied');
          return false;
        }
      } else if (Notification.permission === 'denied') {
        setError('Notification permission was previously denied');
        return false;
      }

      // Get VAPID public key from server
      const vapidResponse = await fetch('/api/push/vapid-public-key', {
        credentials: 'include',
      });

      if (!vapidResponse.ok) {
        throw new Error('Failed to get VAPID public key');
      }

      const { publicKey } = await vapidResponse.json();
      if (!publicKey) {
        throw new Error('Push notifications not configured on server');
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Check for existing subscription
      let pushSubscription = await registration.pushManager.getSubscription();

      if (!pushSubscription) {
        // Create new subscription
        pushSubscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      // Send subscription to server
      const subscribeResponse = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          subscription: {
            endpoint: pushSubscription.endpoint,
            keys: {
              p256dh: arrayBufferToBase64(pushSubscription.getKey('p256dh')),
              auth: arrayBufferToBase64(pushSubscription.getKey('auth')),
            },
          },
          deviceName: deviceName || getDeviceName(),
        }),
      });

      if (!subscribeResponse.ok) {
        const errorData = await subscribeResponse.json();
        throw new Error(errorData.message || 'Failed to register subscription');
      }

      setSubscription(pushSubscription.toJSON());
      setIsSubscribed(true);
      await refreshSubscriptions();
      return true;
    } catch (err: any) {
      console.error('Error subscribing to push:', err);
      setError(err.message || 'Failed to subscribe to push notifications');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, user, refreshSubscriptions]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !user) {
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const currentSubscription = await registration.pushManager.getSubscription();

      if (currentSubscription) {
        // Unsubscribe from browser
        await currentSubscription.unsubscribe();

        // Notify server
        await fetch('/api/push/unsubscribe', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            endpoint: currentSubscription.endpoint,
          }),
        });
      }

      setSubscription(null);
      setIsSubscribed(false);
      await refreshSubscriptions();
      return true;
    } catch (err: any) {
      console.error('Error unsubscribing from push:', err);
      setError(err.message || 'Failed to unsubscribe from push notifications');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, user, refreshSubscriptions]);

  // Unsubscribe a specific subscription by ID
  const unsubscribeById = useCallback(async (subscriptionId: string): Promise<boolean> => {
    if (!user) {
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/push/subscriptions/${subscriptionId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to remove subscription');
      }

      await refreshSubscriptions();

      // Check if this was the current device's subscription
      const registration = await navigator.serviceWorker.ready;
      const currentSubscription = await registration.pushManager.getSubscription();
      const removedSub = subscriptions.find(s => s.id === subscriptionId);

      if (currentSubscription && removedSub?.endpoint === currentSubscription.endpoint) {
        await currentSubscription.unsubscribe();
        setSubscription(null);
        setIsSubscribed(false);
      }

      return true;
    } catch (err: any) {
      console.error('Error removing subscription:', err);
      setError(err.message || 'Failed to remove subscription');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user, subscriptions, refreshSubscriptions]);

  // Send a test notification
  const sendTestNotification = useCallback(async (): Promise<boolean> => {
    if (!user || !isSubscribed) {
      setError('Not subscribed to push notifications');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/push/test', {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to send test notification');
      }

      return true;
    } catch (err: any) {
      console.error('Error sending test notification:', err);
      setError(err.message || 'Failed to send test notification');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user, isSubscribed]);

  return {
    isSupported,
    permission,
    isSubscribed,
    subscription,
    subscriptions,
    isLoading,
    error,
    requestPermission,
    subscribe,
    unsubscribe,
    unsubscribeById,
    refreshSubscriptions,
    sendTestNotification,
  };
}

/**
 * Get a human-readable device name
 */
function getDeviceName(): string {
  const ua = navigator.userAgent;

  // Mobile devices
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) {
    if (/Mobile/.test(ua)) return 'Android Phone';
    return 'Android Tablet';
  }

  // Desktop browsers
  if (/Firefox/.test(ua)) return 'Firefox';
  if (/Chrome/.test(ua)) return 'Chrome';
  if (/Safari/.test(ua)) return 'Safari';
  if (/Edge/.test(ua)) return 'Edge';

  // Fallback
  if (/Mobile/.test(ua)) return 'Mobile Device';
  return 'Desktop Browser';
}

export default usePushNotifications;
