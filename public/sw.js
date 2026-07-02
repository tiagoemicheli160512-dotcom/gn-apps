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
