const webpush = require('web-push');

const VAPID_PUBLIC = 'BJTEqdQLTZ1ix8DeXWwytbo1OjNfPc5Kt6RYgHq50dWq3T7514Pv3kb14Gce0MgcOx3ySRtddqtCC41TZyAsBVQ';
const SB_URL = 'https://ncxttwvpafajnilpjbol.supabase.co';
const SB_KEY = process.env.SB_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jeHR0d3ZwYWZham5pbHBqYm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NDcyMDEsImV4cCI6MjA5NzQyMzIwMX0.MGDZNGY8GfSzBKAgdR7OhvOeR71i4fj9YseJRhoh5sE';

if (process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:gn-apps@noreply.com', VAPID_PUBLIC, process.env.VAPID_PRIVATE_KEY);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: 'VAPID_PRIVATE_KEY not configured' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

  // Determine notification to send
  let notification = null;
  if (body.title) {
    // Direct payload (from frontend or cron)
    notification = { title: body.title, body: body.body || '', tag: body.tag || 'gn-alert', data: body.data || {} };
  } else {
    // Supabase Database Webhook format
    notification = buildNotification(body.table, body.record, body.old_record);
  }

  if (!notification) return res.status(200).json({ skipped: true });

  // Fetch all push subscriptions
  const subRes = await fetch(`${SB_URL}/rest/v1/gn_push_subscriptions?select=id,endpoint,subscription`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
  });
  const subs = await subRes.json();

  if (!Array.isArray(subs) || subs.length === 0) {
    return res.status(200).json({ sent: 0, total: 0 });
  }

  const payload = JSON.stringify(notification);

  const results = await Promise.allSettled(
    subs.map(async row => {
      const sub = typeof row.subscription === 'string' ? JSON.parse(row.subscription) : row.subscription;
      try {
        await webpush.sendNotification(sub, payload);
      } catch (err) {
        // Remove expired/invalid subscriptions (410 = Gone, 404 = Not Found)
        if (err.statusCode === 410 || err.statusCode === 404) {
          await fetch(`${SB_URL}/rest/v1/gn_push_subscriptions?id=eq.${row.id}`, {
            method: 'DELETE',
            headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
          }).catch(() => {});
        }
        throw err;
      }
    })
  );

  const sent = results.filter(r => r.status === 'fulfilled').length;
  return res.status(200).json({ sent, total: subs.length });
};

function buildNotification(table, record, old_record) {
  if (!table || !record) return null;

  if (table === 'gn_pedidos') {
    if (record.status === 'CONFIRMADO' && old_record?.status !== 'CONFIRMADO') {
      return {
        title: '📋 Pedido confirmado — GN',
        body: `Pedido da semana ${record.semana_inicio || ''} confirmado e enviado ao fornecedor`,
        tag: 'gn-pedido-confirmado',
        data: { url: '/gn-pedidos.html' }
      };
    }
  }

  if (table === 'gn_provisoes') {
    if (record.status === 'RECEBIDO_OK' && old_record?.status === 'AGUARDANDO') {
      return {
        title: '✅ Entrega confirmada — GN',
        body: 'Recebimento registrado sem divergências',
        tag: 'gn-recebimento-ok',
        data: { url: '/gn-pedidos.html' }
      };
    }
    if (record.status === 'DIVERGENCIA' && old_record?.status === 'AGUARDANDO') {
      return {
        title: '⚠️ Divergência no recebimento — GN',
        body: 'Recebimento com divergência de quantidade ou valor',
        tag: 'gn-recebimento-div',
        data: { url: '/gn-pedidos.html' }
      };
    }
  }

  return null;
}
