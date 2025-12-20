/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare let self: ServiceWorkerGlobalScope;

// Extended notification options for push notifications (includes non-standard properties)
interface ExtendedNotificationOptions extends NotificationOptions {
  image?: string;
  actions?: Array<{ action: string; title: string; icon?: string }>;
  vibrate?: number | number[];
}

// Take control immediately
clientsClaim();

// Clean up old caches
cleanupOutdatedCaches();

// Precache static assets (injected by vite-plugin-pwa)
precacheAndRoute(self.__WB_MANIFEST);

// ============================================================================
// CACHING STRATEGIES
// ============================================================================

// Cache Google Fonts
registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

// Cache images
registerRoute(
  /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
  new CacheFirst({
    cacheName: 'images-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
      }),
    ],
  })
);

// Network-first for API requests
registerRoute(
  /\/api\/.*/i,
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 10,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 300, // 5 minutes
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

// Stale-while-revalidate for JS/CSS
registerRoute(
  /\.(?:js|css)$/i,
  new StaleWhileRevalidate({
    cacheName: 'static-resources',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
      }),
    ],
  })
);

// ============================================================================
// PUSH NOTIFICATION HANDLERS
// ============================================================================

/**
 * Handle incoming push notifications
 */
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');

  if (!event.data) {
    console.warn('[SW] Push event has no data');
    return;
  }

  try {
    const data = event.data.json();
    console.log('[SW] Push data:', data);

    const options: ExtendedNotificationOptions = {
      body: data.body || 'New notification',
      icon: data.icon || '/icon-192.png',
      badge: data.badge || '/icon-192.png',
      tag: data.tag || `notification-${Date.now()}`,
      data: data.data || {},
      actions: data.actions || [],
      requireInteraction: data.requireInteraction ?? false,
      silent: data.silent ?? false,
      vibrate: data.vibrate || [200, 100, 200],
    };

    // If there's an image, add it
    if (data.image) {
      options.image = data.image;
    }

    event.waitUntil(
      self.registration.showNotification(data.title || 'AthleteMetrics', options as NotificationOptions)
    );
  } catch (error) {
    console.error('[SW] Error parsing push notification:', error);

    // Show generic notification if parsing fails
    event.waitUntil(
      self.registration.showNotification('AthleteMetrics', {
        body: 'You have a new notification',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
      })
    );
  }
});

/**
 * Handle notification click
 */
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification.tag);

  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';
  const notificationId = event.notification.data?.notificationId;

  event.waitUntil(
    (async () => {
      // Try to track the click (non-blocking)
      if (notificationId) {
        try {
          await fetch(`/api/notifications/${notificationId}/clicked`, {
            method: 'POST',
            credentials: 'include',
          });
        } catch (error) {
          console.warn('[SW] Failed to track notification click:', error);
        }
      }

      // Try to focus existing window or open new one
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Check if there's already a window open
      for (const client of windowClients) {
        if (client.url.includes(self.registration.scope)) {
          // Focus existing window and navigate
          await client.focus();
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            url: urlToOpen,
          });
          return;
        }
      }

      // No existing window, open new one
      await self.clients.openWindow(urlToOpen);
    })()
  );
});

/**
 * Handle notification close (for analytics)
 */
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed:', event.notification.tag);

  // Could track dismissal here if needed
});

/**
 * Handle push subscription change
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[SW] Push subscription changed');

  // Cast to ExtendableEvent to access waitUntil
  const extEvent = event as ExtendableEvent;
  extEvent.waitUntil(
    (async () => {
      try {
        // Get the new subscription
        const newSubscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: await getVapidPublicKey(),
        });

        // Send to server to update
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            subscription: {
              endpoint: newSubscription.endpoint,
              keys: {
                p256dh: arrayBufferToBase64(newSubscription.getKey('p256dh')!),
                auth: arrayBufferToBase64(newSubscription.getKey('auth')!),
              },
            },
          }),
        });

        console.log('[SW] Push subscription updated successfully');
      } catch (error) {
        console.error('[SW] Failed to update push subscription:', error);
      }
    })()
  );
});

/**
 * Get VAPID public key from server
 */
async function getVapidPublicKey(): Promise<Uint8Array> {
  const response = await fetch('/api/push/vapid-public-key', {
    credentials: 'include',
  });
  const { publicKey } = await response.json();
  return urlBase64ToUint8Array(publicKey);
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
 * Convert ArrayBuffer to base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
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

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

/**
 * Handle messages from the main app
 */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[SW] Service worker initialized with push notification support');
