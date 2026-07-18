const SB_URL = 'https://ncxttwvpafajnilpjbol.supabase.co';
const SB_KEY = process.env.SB_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jeHR0d3ZwYWZham5pbHBqYm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NDcyMDEsImV4cCI6MjA5NzQyMzIwMX0.MGDZNGY8GfSzBKAgdR7OhvOeR71i4fj9YseJRhoh5sE';

module.exports = async function handler(req, res) {
  const hoje = new Date().toISOString().slice(0, 10);

  // Count provisões AGUARDANDO with past data_entrega
  const r = await fetch(
    `${SB_URL}/rest/v1/gn_provisoes?status=eq.AGUARDANDO&data_entrega=lt.${hoje}&select=id`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: 'count=exact' } }
  );
  const count = parseInt(r.headers.get('content-range')?.split('/')[1] || '0') || 0;

  if (count === 0) return res.status(200).json({ skipped: true });

  // Call push sender
  const base = `https://${req.headers.host}`;
  await fetch(`${base}/api/gn-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: '⏰ Entrega pendente — GN',
      body: `${count} entrega${count > 1 ? 's' : ''} com prazo vencido aguardando confirmação`,
      tag: 'gn-entrega-vencida',
      data: { url: '/gn-pedidos.html' }
    })
  });

  return res.status(200).json({ sent: true, count });
};
