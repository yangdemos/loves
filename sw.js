/**
 * Love & Peace — Reminder Service Worker
 *
 * Handles notification display even when the page is in the background
 * or when the browser is not fully active.
 *
 * Lifecycle:
 *   install  → skipWaiting (take control immediately)
 *   activate → claim clients (control all open tabs)
 *   message  → SHOW_NOTIFICATION → show desktop notification
 */

const SW_VERSION = '1.0.0';
const CACHE_NAME = `love-reminder-sw-v${SW_VERSION}`;

self.addEventListener('install', (event) => {
  // Take control of all clients immediately (no need to wait for reload)
  event.waitUntil(self.skipWaiting());
  console.log(`[SW v${SW_VERSION}] Installed`);
});

self.addEventListener('activate', (event) => {
  // Claim all open tabs so this SW controls them from the start
  event.waitUntil(self.clients.claim());
  console.log(`[SW v${SW_VERSION}] Activated`);
});

/**
 * Listen for messages from the main thread to show notifications.
 * This allows the page to trigger notifications through the SW,
 * which works even when the tab is not focused.
 */
self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'SHOW_NOTIFICATION') return;

  const { title, body, icon, tag, requireInteraction, silent, data } = event.data;

  self.registration.showNotification(title || 'Love & Peace', {
    body: body || '',
    icon: icon || '/images/icon-192.png',
    badge: '/images/icon-96.png',
    tag: tag || 'love-reminder',
    requireInteraction: requireInteraction !== false,  // keep notification visible until user acts
    silent: silent === true,
    data: data || {},
    vibrate: [200, 100, 200],
  });
});

/**
 * When user clicks on the notification, focus or open the page.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If we already have a window open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.host) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
