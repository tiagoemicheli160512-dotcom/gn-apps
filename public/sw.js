// ─── OFFLINE CACHE — network-first para requests Supabase ────
const SW_VERSION = 4;
const API_CACHE = 'gn-api-v3';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== API_CACHE && k !== ALERTS_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then(clients => clients.forEach(c => {
        try { c.postMessage({ type: 'GN_SW_UPDATED', version: SW_VERSION }); } catch(e) {}
      }))
  );
});

self.addEventListener('fetch', event => {
  const url = event.request.url;
  if (event.request.method !== 'GET') return;

  // HTML: sempre buscar da rede sem cache para garantir código atualizado
  if (url.includes('.html')) {
    event.respondWith(
      fetch(new Request(event.request, { cache: 'no-store' }))
        .catch(() => fetch(event.request))
    );
    return;
  }

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
        if (new URL(c.url).pathname === new URL(url, self.location).pathname && 'focus' in c) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});

// ─── ALERTAS EM BACKGROUND (Manutenção e Faltas) ──────────
const SB_URL_A = 'https://ncxttwvpafajnilpjbol.supabase.co';
const SB_KEY_A = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jeHR0d3ZwYWZham5pbHBqYm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NDcyMDEsImV4cCI6MjA5NzQyMzIwMX0.MGDZNGY8GfSzBKAgdR7OhvOeR71i4fj9YseJRhoh5sE';
const ALERTS_CACHE = 'gn-alerts-v1';
const ALERTS_STATE = '/gn-sw-state';

self.addEventListener('periodicsync', event => {
  if (event.tag === 'gn-alerts') {
    event.waitUntil(verificarAlertas());
  }
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'GN_CHECK_ALERTS') {
    verificarAlertas().catch(() => {});
  }
});

async function lerEstado() {
  try {
    const c = await caches.open(ALERTS_CACHE);
    const r = await c.match(ALERTS_STATE);
    return r ? await r.json() : { manut: 0, faltas: 0, data: '' };
  } catch(_) { return { manut: 0, faltas: 0, data: '' }; }
}

async function salvarEstado(s) {
  const c = await caches.open(ALERTS_CACHE);
  await c.put(ALERTS_STATE, new Response(JSON.stringify(s), {
    headers: { 'Content-Type': 'application/json' }
  }));
}

async function verificarAlertas() {
  const hj = new Date();
  const hoje = hj.getFullYear() + '-' +
    String(hj.getMonth() + 1).padStart(2, '0') + '-' +
    String(hj.getDate()).padStart(2, '0');
  const H = { apikey: SB_KEY_A, Authorization: 'Bearer ' + SB_KEY_A };

  try {
    const [mr, fr] = await Promise.all([
      fetch(`${SB_URL_A}/rest/v1/checklist_diario?data_operacao=eq.${hoje}&select=manutencao`, { headers: H }).then(r => r.json()),
      fetch(`${SB_URL_A}/rest/v1/checklist_diario?data_operacao=eq.${hoje}&select=faltas`, { headers: H }).then(r => r.json()),
    ]);

    let manut = 0;
    (mr || []).forEach(r => {
      if (Array.isArray(r.manutencao)) {
        manut += r.manutencao.filter(m => m && m.status !== 'Resolvido').length;
      }
    });

    let faltas = 0;
    (fr || []).forEach(r => {
      if (Array.isArray(r.faltas)) faltas += r.faltas.length;
    });

    const prev = await lerEstado();
    const mesmodia = prev.data === hoje;

    // Notify if: count increased, OR first time today with pending items
    const notifManut = manut > 0 && (manut > prev.manut || !mesmodia || !prev.manutNotif);
    const notifFaltas = faltas > 0 && (faltas > prev.faltas || !mesmodia || !prev.faltasNotif);

    if (notifManut) {
      await self.registration.showNotification('🔧 Manutenção pendente — GN', {
        body: `${manut} item${manut !== 1 ? 's' : ''} de manutenção aberto${manut !== 1 ? 's' : ''} hoje`,
        tag: 'gn-manut',
        icon: '/favicon.ico',
        requireInteraction: true,
        vibrate: [300, 100, 300],
        data: { url: '/gn-manutencao.html' },
      });
    }
    if (notifFaltas) {
      await self.registration.showNotification('⚠️ Faltas registradas — GN', {
        body: `${faltas} falta${faltas !== 1 ? 's' : ''} registrada${faltas !== 1 ? 's' : ''} hoje`,
        tag: 'gn-faltas',
        icon: '/favicon.ico',
        requireInteraction: true,
        vibrate: [300, 100, 300],
        data: { url: '/gn-pedidos.html' },
      });
    }

    await salvarEstado({
      manut, faltas, data: hoje,
      manutNotif: mesmodia ? (prev.manutNotif || notifManut) : notifManut,
      faltasNotif: mesmodia ? (prev.faltasNotif || notifFaltas) : notifFaltas,
    });
  } catch(_) {}
}
