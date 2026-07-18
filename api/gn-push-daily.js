const SB_URL = 'https://ncxttwvpafajnilpjbol.supabase.co';
const SB_KEY = process.env.SB_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jeHR0d3ZwYWZham5pbHBqYm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NDcyMDEsImV4cCI6MjA5NzQyMzIwMX0.MGDZNGY8GfSzBKAgdR7OhvOeR71i4fj9YseJRhoh5sE';

const LOJAS = [
  'BANGU','CAXIAS','SÃO GONÇALO','NORTE SHOPPING','BOULEVARD','RANCHO',
  'PEDREIRA','NOVA AMERICA','CAMPO GRANDE','ITAQUERA','GUARULHOS'
];

module.exports = async function handler(req, res) {
  const hoje = new Date().toISOString().slice(0, 10);
  const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

  const [cxRows, clRows, mtRows] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/gn_caixa_fechamento?data=eq.${hoje}&select=loja,status`, { headers: H })
      .then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${SB_URL}/rest/v1/checklist_diario?data_operacao=eq.${hoje}&select=loja,manutencao`, { headers: H })
      .then(r => r.ok ? r.json() : []).catch(() => []),
    // checklist dos últimos 7 dias para manutenções antigas
    fetch(`${SB_URL}/rest/v1/checklist_diario?data_operacao=lt.${hoje}&data_operacao=gte.${_dateMinus(hoje, 7)}&select=loja,manutencao,data_operacao`, { headers: H })
      .then(r => r.ok ? r.json() : []).catch(() => []),
  ]);

  // Lojas sem caixa fechado hoje
  const lojasComCaixa = new Set((cxRows || []).filter(r => r.status === 'FECHADO').map(r => r.loja));
  const semCaixa = LOJAS.filter(l => !lojasComCaixa.has(l));

  // Lojas sem checklist hoje
  const lojasComChk = new Set((clRows || []).map(r => r.loja));
  const semChk = LOJAS.filter(l => !lojasComChk.has(l));

  // Manutenções pendentes hoje
  let manutHoje = 0;
  (clRows || []).forEach(row => {
    if (Array.isArray(row.manutencao))
      manutHoje += row.manutencao.filter(m => m && m.status !== 'Resolvido').length;
  });

  // Manutenções paradas há >3 dias (aparecem em checklist anterior, ainda sem resolução)
  const manutLojasVelhas = new Set();
  (mtRows || []).forEach(row => {
    if (!Array.isArray(row.manutencao)) return;
    const velhas = row.manutencao.filter(m => m && m.status !== 'Resolvido');
    if (velhas.length > 0) manutLojasVelhas.add(row.loja);
  });

  const parts = [];
  if (semCaixa.length)
    parts.push(`${semCaixa.length} loja${semCaixa.length > 1 ? 's' : ''} sem caixa fechado`);
  if (semChk.length)
    parts.push(`${semChk.length} sem checklist`);
  if (manutLojasVelhas.size > 0)
    parts.push(`${manutLojasVelhas.size} loja${manutLojasVelhas.size > 1 ? 's' : ''} com manutenção parada`);
  if (manutHoje > 0 && manutLojasVelhas.size === 0)
    parts.push(`${manutHoje} manutenção pendente`);

  if (!parts.length) return res.status(200).json({ skipped: true, hoje });

  const base = `https://${req.headers.host}`;
  await fetch(`${base}/api/gn-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: '⚠️ Atenção — GN Gestão',
      body: parts.join(' · '),
      tag: 'gn-daily-check',
      data: { url: '/' }
    })
  }).catch(() => {});

  return res.status(200).json({ sent: true, parts });
};

function _dateMinus(isoDate, days) {
  const d = new Date(isoDate + 'T12:00:00');
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
