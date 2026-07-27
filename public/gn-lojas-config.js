// Fonte canônica de lojas — atualizar aqui reflete em todos os apps
window.GN_LOJAS = [
  { display:'Bangu',          userKey:'BANGU',         chkKey:'Bangu',          comKey:'BANGU',        lojaSlug:'bangu',          cor:'#b81a1a' },
  { display:'Caxias',         userKey:'CAXIAS',        chkKey:'Caxias',         comKey:'CAXIAS',       lojaSlug:'caxias',         cor:'#1a6bbd' },
  { display:'São Gonçalo',    userKey:'SÃO GONÇALO',   chkKey:'São Gonçalo',    comKey:'SAO_GONCALO',  lojaSlug:'sao_goncalo',    cor:'#8B1A8B' },
  { display:'Norte Shopping', userKey:'NORTE SHOPPING',chkKey:'Norte Shopping', comKey:'NORTE',        lojaSlug:'norte_shopping', cor:'#1a7a4a' },
  { display:'Boulevard',      userKey:'BOULEVARD',     chkKey:'Boulevard',      comKey:'BOULEVARD',    lojaSlug:'boulevard',      cor:'#b85a00' },
  { display:'Rancho',         userKey:'RANCHO',        chkKey:'Rancho',         comKey:'RANCHO',       lojaSlug:'nova_iguacu',    cor:'#0e7490' },
  { display:'Pedreira',       userKey:'PEDREIRA',      chkKey:'Pedreira',       comKey:'PEDREIRA',     lojaSlug:'pedreira',       cor:'#7c3aed' },
  { display:'Nova América',   userKey:'NOVA AMERICA',  chkKey:'Nova América',   comKey:'NOVA_AMERICA', lojaSlug:'nova_america',   cor:'#b45309' },
  { display:'Campo Grande',   userKey:'CAMPO GRANDE',  chkKey:'Campo Grande',   comKey:'CAMPO_GRANDE', lojaSlug:'campo_grande',   cor:'#065f46' },
  { display:'Itaquera',       userKey:'ITAQUERA',      chkKey:'Itaquera',       comKey:'ITAQUERA',     lojaSlug:'itaquera',       cor:'#be123c' },
  { display:'Guarulhos',      userKey:'GUARULHOS',     chkKey:'Guarulhos',      comKey:'GUARULHOS',    lojaSlug:'guarulhos',      cor:'#1e40af' },
];

// ── Compartilhado entre gn-comissoes e gn-comissoes-mestra ────────────────
const ADM = 50;

function fmtBRL(v) {
  if (isNaN(v) || v == null) v = 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}
function fmtBRLShort(v) {
  if (isNaN(v) || v == null) v = 0;
  return 'R$ ' + new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}
function fmtBRLDia(v) {
  if (isNaN(v) || v == null || v === 0) return '—';
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}
function parseBRL(v) {
  if (!v) return 0;
  v = String(v).trim().replace(/R\$\s*/g, '').trim();
  if (v.includes(',') && v.includes('.')) {
    if (v.lastIndexOf(',') > v.lastIndexOf('.')) v = v.replace(/\./g, '').replace(',', '.');
    else v = v.replace(/,/g, '');
  } else if (v.includes(',')) {
    const parts = v.split(',');
    if (parts[parts.length - 1].length <= 2) v = v.replace(',', '.');
    else v = v.replace(/,/g, '');
  }
  return parseFloat(v) || 0;
}

function calcSemana(wd, saldoAnt = 0) {
  const ativos = wd.funcs.filter(f => f.nome.trim());
  const nAtivos = ativos.length;
  const dias = Array.from({ length: 7 }, (_, d) => {
    const e90 = (parseFloat(wd.brutos[d]) || 0) * 0.9;
    const I = ativos.filter(f => f.dias[d] !== 'NÃO TRABALHADO' && f.dias[d] !== 'AFASTAMENTO').length;
    return { e90, cotaUnit: I > 0 ? e90 / I : 0, I };
  });
  const funcCalc = ativos.map(f => {
    let bruta = 0;
    dias.forEach((dia, d) => { if (['PRESENTE', 'HORISTA', 'JOVEM APRENDIZ', 'FOLGA', 'BANCO DE HORAS', 'FÉRIAS'].includes(f.dias[d])) bruta += dia.cotaUnit; });
    const nFS = f.dias.filter(s => ['FALTA', 'SUSPENSÃO'].includes(s)).length;
    const mult = nFS >= 2 ? 0 : nFS === 1 ? 0.5 : 1;
    const AF = bruta * mult;
    const elegivel = f.tipo !== 'JOVEM APRENDIZ' && nFS === 0 && f.dias.filter(s => s === 'ATESTADO' || s === 'JUSTIFICATIVA').length === 0 && f.dias.filter(s => ['PRESENTE', 'HORISTA', 'FOLGA', 'BANCO DE HORAS', 'FÉRIAS'].includes(s)).length > 0;
    const diasEleg = elegivel ? f.dias.filter(s => ['PRESENTE', 'HORISTA', 'FOLGA', 'BANCO DE HORAS', 'FÉRIAS'].includes(s)).length : 0;
    return { ...f, bruta, mult, AF, elegivel, diasEleg, nFS };
  });
  const baseTotal = dias.reduce((s, d) => s + d.e90, 0);
  const sumAF = funcCalc.reduce((s, f) => s + f.AF, 0);
  const poolRateio = Math.max(0, baseTotal - sumAF);
  const saldoTotal = poolRateio + saldoAnt;
  const vD = parseFloat(wd.vDist) || 0;
  const efetivo = wd.dist === 'SIM' ? (vD > 0 ? Math.min(vD, saldoTotal) : saldoTotal) : 0;
  const retido = saldoTotal - efetivo;
  const totalDE = funcCalc.reduce((s, f) => s + f.diasEleg, 0);
  const nPagantes = funcCalc.filter(f => f.AF > 0).length;
  const ff = funcCalc.map(f => {
    const rateio = f.elegivel && totalDE > 0 ? efetivo * f.diasEleg / totalDE : 0;
    const cota = f.AF + rateio;
    const adm = nPagantes > 0 && f.AF > 0 ? ADM / nPagantes : 0;
    return { ...f, rateio, cota, adm, liquido: cota - adm };
  });
  return { dias, funcCalc: ff, baseTotal, poolRateio, saldoAnt, saldoTotal, efetivo, retido, nAtivos, pct: saldoTotal > 0 ? efetivo / saldoTotal : 0 };
}
