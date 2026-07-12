// ─── OFFLINE CACHE — network-first para requests Supabase ────
const API_CACHE = 'gn-api-v2';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== API_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = event.request.url;
  if (event.request.method !== 'GET') return;
  if (!url.includes('supabase.co/rest/')) return;

  event.respondWith(
    fetch(event.request.clone())
      .then(response => {
        if (response.ok) {
          caches.open(API_CACHE).then(cache => cache.put(event.request, response.clone()));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(cached =>
          cached || new Response(JSON.stringify([]), {
            headers: { 'Content-Type': 'application/json' }
          })
        )
      )
  );
});

// ─── PUSH NOTIFICATIONS ───────────────────────────────────
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch(e) {}
  const title = data.title || '🚨 Alerta de Estoque';
  const options = {
    body:              data.body || 'Verifique o estoque agora.',
    tag:               data.tag  || 'estoque-alerta',
    requireInteraction: true,
    vibrate:           [300, 100, 300],
    data:              data.data || {}
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/gn-lojas.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('gn-lojas') && 'focus' in c) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});
