const SB_URL = 'https://ncxttwvpafajnilpjbol.supabase.co';
const SB_KEY = process.env.SB_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jeHR0d3ZwYWZham5pbHBqYm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NDcyMDEsImV4cCI6MjA5NzQyMzIwMX0.MGDZNGY8GfSzBKAgdR7OhvOeR71i4fj9YseJRhoh5sE';

const LOJAS = [
  'BANGU','CAXIAS','SÃO GONÇALO','NORTE SHOPPING','BOULEVARD','RANCHO',
  'PEDREIRA','NOVA AMERICA','CAMPO GRANDE','ITAQUERA','GUARULHOS'
];
// comKey usado em gn_lojas.all_data.avariasAll
const COM_KEYS = [
  'BANGU','CAXIAS','SAO_GONCALO','NORTE','BOULEVARD','RANCHO',
  'PEDREIRA','NOVA_AMERICA','CAMPO_GRANDE','ITAQUERA','GUARULHOS'
];
// chkKey usado em gn_comissao_foto.loja
const CHK_KEYS = [
  'Bangu','Caxias','São Gonçalo','Norte Shopping','Boulevard','Rancho',
  'Pedreira','Nova América','Campo Grande','Itaquera','Guarulhos'
];
const AVARIA_DIAS_LIMITE = 2; // avisa se avaria aguardando RH há mais de X dias

module.exports = async function handler(req, res) {
  const hoje = new Date().toISOString().slice(0, 10);
  const diaSemana = new Date(hoje + 'T12:00:00').getDay(); // 0=dom .. 6=sáb
  const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

  const [cxRows, clRows, mtRows, lojasRows, fotoRows, triosRows] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/gn_caixa_fechamento?data=eq.${hoje}&select=loja,status`, { headers: H })
      .then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${SB_URL}/rest/v1/checklist_diario?data_operacao=eq.${hoje}&select=loja,manutencao`, { headers: H })
      .then(r => r.ok ? r.json() : []).catch(() => []),
    // checklist dos últimos 7 dias para manutenções antigas
    fetch(`${SB_URL}/rest/v1/checklist_diario?data_operacao=lt.${hoje}&data_operacao=gte.${_dateMinus(hoje, 7)}&select=loja,manutencao,data_operacao`, { headers: H })
      .then(r => r.ok ? r.json() : []).catch(() => []),
    // pendências de RH/Financeiro (avarias, fotos de comissão, bandas)
    fetch(`${SB_URL}/rest/v1/gn_lojas?loja=in.(${COM_KEYS.join(',')})&select=loja,all_data`, { headers: H })
      .then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${SB_URL}/rest/v1/gn_comissao_foto?semana_ini=eq.${_mondayOf(hoje)}&select=loja`, { headers: H })
      .then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${SB_URL}/rest/v1/gn_trios_agenda?data=lte.${hoje}&presenca_confirmada=eq.false&banda_nao_veio=eq.false&select=id`, { headers: H })
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

  // Avarias aguardando confirmação do RH há mais de AVARIA_DIAS_LIMITE dias
  let avariasVelhas = 0;
  (lojasRows || []).forEach(row => {
    const avarias = (row.all_data?.avariasAll || {})[row.loja] || [];
    avarias.forEach(av => {
      if (av.status !== 'loja_confirmou' || !av.loja_conf_ts) return;
      const dias = (Date.now() - new Date(av.loja_conf_ts).getTime()) / 86400000;
      if (dias >= AVARIA_DIAS_LIMITE) avariasVelhas++;
    });
  });
  if (avariasVelhas > 0)
    parts.push(`${avariasVelhas} avaria${avariasVelhas > 1 ? 's' : ''} aguardando RH`);

  // Fotos de comissão pendentes na semana — só cobra a partir de quarta-feira (dá tempo até terça)
  if (diaSemana >= 3 || diaSemana === 0) {
    const lojasComFoto = new Set((fotoRows || []).map(r => r.loja));
    const fotosPendentes = CHK_KEYS.filter(k => !lojasComFoto.has(k)).length;
    if (fotosPendentes > 0)
      parts.push(`${fotosPendentes} foto${fotosPendentes > 1 ? 's' : ''} de comissão pendente${fotosPendentes > 1 ? 's' : ''}`);
  }

  // Bandas já realizadas (ou de hoje) sem presença confirmada nem marcadas como "não veio"
  const bandasPendentes = (triosRows || []).length;
  if (bandasPendentes > 0)
    parts.push(`${bandasPendentes} banda${bandasPendentes > 1 ? 's' : ''} com presença/pagamento pendente`);

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

function _mondayOf(isoDate) {
  const d = new Date(isoDate + 'T12:00:00');
  const day = d.getDay(); // 0=dom .. 6=sáb
  const diff = day === 0 ? -6 : 1 - day; // volta até a segunda-feira
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}
