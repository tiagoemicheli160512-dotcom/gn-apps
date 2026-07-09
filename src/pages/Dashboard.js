import React, { useState, useEffect, useCallback } from 'react';

const SB_URL = 'https://ncxttwvpafajnilpjbol.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jeHR0d3ZwYWZham5pbHBqYm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NDcyMDEsImV4cCI6MjA5NzQyMzIwMX0.MGDZNGY8GfSzBKAgdR7OhvOeR71i4fj9YseJRhoh5sE';
const SESSION_KEY = 'gn_session_v1';
const TTL = 43200000;

const COR_LOJA = {
  BANGU: '#b81a1a', CAXIAS: '#1a6bbd', 'SÃO GONÇALO': '#8B1A8B',
  'NORTE SHOPPING': '#1a7a4a', BOULEVARD: '#b85a00', RANCHO: '#0e7490',
  PEDREIRA: '#7c3aed', 'NOVA AMERICA': '#b45309', 'CAMPO GRANDE': '#065f46',
  ITAQUERA: '#be123c', GUARULHOS: '#1e40af', GERAL: '#d4a800',
};

const LOJA_DISPLAY = {
  BANGU: 'Bangu', CAXIAS: 'Caxias', 'SÃO GONÇALO': 'São Gonçalo',
  'NORTE SHOPPING': 'Norte Shopping', BOULEVARD: 'Boulevard', RANCHO: 'Rancho',
  PEDREIRA: 'Pedreira', 'NOVA AMERICA': 'Nova América', 'CAMPO GRANDE': 'Campo Grande',
  ITAQUERA: 'Itaquera', GUARULHOS: 'Guarulhos', GERAL: 'Mestre',
};

const LOJA_COM_KEY = {
  BANGU: 'BANGU', CAXIAS: 'CAXIAS', 'SÃO GONÇALO': 'SAO_GONCALO',
  'NORTE SHOPPING': 'NORTE', BOULEVARD: 'BOULEVARD', RANCHO: 'RANCHO',
  PEDREIRA: 'PEDREIRA', 'NOVA AMERICA': 'NOVA_AMERICA',
  'CAMPO GRANDE': 'CAMPO_GRANDE', ITAQUERA: 'ITAQUERA', GUARULHOS: 'GUARULHOS',
};

const LOJAS_LISTA = [
  'BANGU', 'CAXIAS', 'SÃO GONÇALO', 'NORTE SHOPPING', 'BOULEVARD',
  'RANCHO', 'PEDREIRA', 'NOVA AMERICA', 'CAMPO GRANDE', 'ITAQUERA', 'GUARULHOS',
];

const MODULES = [
  { id: 'checklist',  name: 'Check-list',      sub: 'Check-lists diários e pendências',   icon: '✅', perm: 'checklist',  url: '/gn-checklist.html' },
  { id: 'pedidos',    name: 'Pedidos',          sub: 'Catálogo, pedidos e provisões',      icon: '🛒', perm: 'pedidos',    url: '/gn-pedidos.html' },
  { id: 'avaliacoes', name: 'Avaliações',       sub: 'Desempenho da equipe',               icon: '⭐', perm: 'avaliacoes', url: '/gn-avaliacoes.html' },
  { id: 'comissoes',  name: 'Comissões',        sub: 'Folha semanal de pagamentos',        icon: '💰', perm: 'comissoes',  url: '/gn-comissoes.html' },
  { id: 'lojas',      name: 'Lojas',            sub: 'Ficha operacional da loja',          icon: '🏪', perm: 'lojas',      url: '/gn-lojas.html' },
  { id: 'caixa',      name: 'Caixa',            sub: 'Fechamento de caixa e aprovação',    icon: '💵', perm: 'caixa',      url: '/gn-caixa.html' },
  { id: 'mestra',     name: 'Comissões Mestra', sub: 'Visão consolidada — todas as lojas', icon: '🏆', perm: 'mestra',     url: '/gn-comissoes-mestra.html', masterOnly: true },
  { id: 'rh',         name: 'RH / Financeiro',  sub: 'Consolidador de RH e dados financeiros', icon: '👥', perm: 'rh',         url: '/gn-rh.html' },
];

function getSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (s && Date.now() - s.ts < TTL) return s;
  } catch (e) {}
  return null;
}

/* ─── ESTILOS INLINE ─────────────────────────────────────────── */
const S = {
  // página inteira
  page: { minHeight: '100vh', background: '#08080f', color: '#e8e8f4', fontFamily: "'-apple-system','BlinkMacSystemFont','Segoe UI',sans-serif", display: 'flex', flexDirection: 'column' },
  // LOGIN
  loginWrap: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 },
  loginLogo: { fontSize: 54, fontWeight: 900, letterSpacing: -3, lineHeight: 1, color: 'var(--cor, #F26419)' },
  loginTag: { fontSize: 11, color: '#44445a', letterSpacing: 3, textTransform: 'uppercase', margin: '6px 0 36px' },
  loginCard: { background: '#0e0e1e', border: '1px solid #1a1a2e', borderRadius: 22, padding: '28px 24px', width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 24px 60px #00000080' },
  loginTitle: { fontSize: 15, fontWeight: 700, color: '#e8e8f4', textAlign: 'center', marginBottom: 2 },
  input: (focused) => ({ background: '#08080f', border: `1.5px solid ${focused ? 'var(--cor, #F26419)' : '#1a1a2e'}`, borderRadius: 12, padding: '14px 16px', fontSize: 15, color: '#e8e8f4', width: '100%', fontFamily: 'inherit', outline: 'none', transition: 'border-color .15s' }),
  loginBtn: (disabled) => ({ background: disabled ? '#2a2a3a' : 'var(--cor, #F26419)', color: disabled ? '#555' : '#fff', border: 'none', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer', letterSpacing: 0.3, transition: 'background .15s' }),
  loginErr: { color: '#f87171', fontSize: 12, minHeight: 16, textAlign: 'center' },
  // HEADER
  hdr: { position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px', background: 'rgba(8,8,15,.94)', backdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(255,255,255,.04)' },
  hdrGN: { fontSize: 20, fontWeight: 900, color: 'var(--cor, #F26419)', letterSpacing: -1 },
  hdrGestao: { fontSize: 9, fontWeight: 800, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(255,255,255,.22)', alignSelf: 'flex-end', marginBottom: 2 },
  hdrSep: { width: 1, height: 18, background: 'rgba(255,255,255,.06)', flexShrink: 0 },
  hdrUser: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.45)' },
  hdrSair: { background: 'transparent', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '6px 13px', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.4)', fontFamily: 'inherit', cursor: 'pointer' },
  // HERO
  heroWrap: { position: 'relative', padding: '24px 20px 36px', overflow: 'hidden' },
  heroBg: { position: 'absolute', inset: 0, background: 'linear-gradient(155deg, var(--cor, #F26419) 0%, rgba(0,0,0,.6) 60%, #08080f 100%)', opacity: 0.55, transition: 'background .4s' },
  heroBlob: { position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'var(--cor, #F26419)', opacity: 0.22, filter: 'blur(40px)', transition: 'background .4s' },
  heroFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 48, background: 'linear-gradient(0deg, #08080f, transparent)' },
  heroInner: { position: 'relative', zIndex: 1 },
  heroRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 },
  heroLoja: { fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1 },
  heroSelBtn: { display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 8, padding: '4px 10px 4px 11px', fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 },
  heroDate: { fontSize: 11, color: 'rgba(255,255,255,.42)', marginBottom: 10 },
  heroGreeting: { fontSize: 20, fontWeight: 800, color: '#fff' },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,.45)', marginTop: 3 },
  // MODULES
  modList: { padding: '4px 14px 90px', display: 'flex', flexDirection: 'column', gap: 7 },
  modRow: (enabled) => ({ display: 'flex', alignItems: 'center', gap: 12, background: '#0e0e1e', border: '1px solid #161628', borderRadius: 16, padding: '13px 14px', cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.27, userSelect: 'none', WebkitUserSelect: 'none', textDecoration: 'none' }),
  modIcon: (cor) => ({ width: 46, height: 46, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0, background: cor + '75', border: `1.5px solid ${cor}` }),
  modBody: { flex: 1, minWidth: 0 },
  modName: { fontSize: 13, fontWeight: 800, color: '#e8e8f4', letterSpacing: 0.2 },
  modSub: { fontSize: 11, color: '#3a3a5a', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  modRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 },
  modArrow: { fontSize: 20, color: 'rgba(255,255,255,.18)', lineHeight: 1, marginLeft: 2 },
  // BADGES
  badge: (c) => {
    const map = { g: ['rgba(34,197,94,.1)', '#22c55e'], b: ['rgba(59,130,246,.1)', '#60a5fa'], o: ['rgba(242,100,25,.1)', '#F26419'], x: ['rgba(255,255,255,.04)', '#44445a'] };
    const [bg, fg] = map[c] || map.x;
    return { fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 7, background: bg, color: fg, whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' };
  },
  // PICKER OVERLAY
  overlay: { display: 'flex', position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 300, alignItems: 'flex-end' },
  sheet: { background: '#0e0e1e', borderRadius: '24px 24px 0 0', borderTop: '1px solid #1c1c35', padding: '20px 16px 40px', width: '100%', maxHeight: '82vh', overflowY: 'auto' },
  pickerTitle: { fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.4)', textAlign: 'center', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 },
  pickerGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  pickBtn: (active, cor) => ({ display: 'flex', alignItems: 'center', gap: 9, background: active ? cor + '22' : '#08080f', border: `1.5px solid ${active ? cor : '#2a2a40'}`, borderRadius: 13, padding: '11px 13px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%' }),
  pickDot: (cor) => ({ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, background: cor, boxShadow: `0 0 6px ${cor}` }),
  pickName: { fontSize: 12, fontWeight: 700, color: '#e8e8f4' },
  pickCancel: { marginTop: 10, width: '100%', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 13, padding: 14, fontSize: 14, fontWeight: 600, color: '#555', fontFamily: 'inherit', cursor: 'pointer' },
  // BOTTOM NAV
  bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200, background: 'rgba(8,8,15,.97)', borderTop: '1px solid rgba(255,255,255,.07)', display: 'flex', backdropFilter: 'blur(16px)' },
  bottomItem: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 0 14px', gap: 3, cursor: 'pointer', textDecoration: 'none', background: 'none', border: 'none', fontFamily: 'inherit' },
  bottomIcon: { fontSize: 22, lineHeight: 1 },
  bottomLabel: (active) => ({ fontSize: 10, fontWeight: 700, color: active ? 'var(--cor, #F26419)' : 'rgba(255,255,255,.3)', letterSpacing: 0.5, textTransform: 'uppercase' }),
};

/* ─── UTILITÁRIOS ────────────────────────────────────────────── */
function setCor(cor) {
  document.documentElement.style.setProperty('--cor', cor || '#F26419');
}

function fmtDate() {
  const now = new Date();
  const dias = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  return `${now.getDate()} de ${meses[now.getMonth()]} de ${now.getFullYear()}, ${dias[now.getDay()]}`;
}

function saudacao(nome) {
  const h = new Date().getHours();
  const s = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  return `${s}, ${(nome || '').split(' ')[0]}!`;
}

/* ─── LOGIN ──────────────────────────────────────────────────── */
function LoginScreen({ onLogin }) {
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);
  const [focusNome, setFocusNome] = useState(false);
  const [focusSenha, setFocusSenha] = useState(false);

  const entrar = useCallback(async () => {
    if (!nome.trim() || !senha) { setErro('Preencha usuário e senha.'); return; }
    setErro(''); setLoading(true);
    try {
      const res = await fetch(
        `${SB_URL}/rest/v1/gn_usuarios?nome=eq.${encodeURIComponent(nome.trim())}&senha=eq.${encodeURIComponent(senha)}&ativo=eq.true`,
        { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
      );
      const data = await res.json();
      if (!data || !data.length) { setErro('❌ Nome ou senha incorretos.'); setLoading(false); return; }
      const u = data[0];
      const sess = { id: u.id, nome: u.nome, loja: u.loja, cargo: u.cargo, permissoes: u.permissoes || {}, ts: Date.now() };
      localStorage.setItem(SESSION_KEY, JSON.stringify(sess));
      onLogin(sess);
    } catch (e) {
      setErro('⚠️ Erro de conexão. Tente novamente.');
    }
    setLoading(false);
  }, [nome, senha, onLogin]);

  const onKey = (e) => { if (e.key === 'Enter') entrar(); };

  return (
    <div style={{ ...S.loginWrap, background: 'radial-gradient(ellipse at 50% -10%, rgba(242,100,25,.15) 0%, transparent 60%), #08080f' }}>
      <div style={S.loginLogo}>GN</div>
      <div style={S.loginTag}>Sistema de Gestão</div>
      <div style={S.loginCard}>
        <div style={S.loginTitle}>Entrar no sistema</div>
        <input
          style={S.input(focusNome)}
          type="text" placeholder="Nome de usuário"
          value={nome} onChange={e => { setNome(e.target.value); setErro(''); }}
          onFocus={() => setFocusNome(true)} onBlur={() => setFocusNome(false)}
          onKeyDown={e => e.key === 'Enter' && document.getElementById('inp-senha-r')?.focus()}
          autoComplete="username" autoCorrect="off" autoCapitalize="none"
        />
        <input
          id="inp-senha-r"
          style={S.input(focusSenha)}
          type="password" placeholder="Senha"
          value={senha} onChange={e => { setSenha(e.target.value); setErro(''); }}
          onFocus={() => setFocusSenha(true)} onBlur={() => setFocusSenha(false)}
          onKeyDown={onKey}
          autoComplete="current-password"
        />
        <div style={S.loginErr}>{erro}</div>
        <button style={S.loginBtn(loading)} disabled={loading} onClick={entrar}>
          {loading ? 'Verificando...' : 'Entrar →'}
        </button>
      </div>
    </div>
  );
}

/* ─── BADGE COMPONENT ────────────────────────────────────────── */
function Badge({ id, badges }) {
  const b = badges[id] || { text: '⋯', color: 'x' };
  return <span style={S.badge(b.color)}>{b.text}</span>;
}

/* ─── LOJA PICKER ────────────────────────────────────────────── */
function LojaPicker({ masterLoja, onSelect, onClose }) {
  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.sheet}>
        <div style={S.pickerTitle}>Selecionar loja</div>
        <div style={S.pickerGrid}>
          {LOJAS_LISTA.map(k => (
            <button key={k} style={S.pickBtn(k === masterLoja, COR_LOJA[k])} onClick={() => onSelect(k)}>
              <span style={S.pickDot(COR_LOJA[k])} />
              <span style={S.pickName}>{LOJA_DISPLAY[k] || k}</span>
            </button>
          ))}
          <button style={{ ...S.pickBtn(masterLoja === null, '#F26419'), gridColumn: '1 / -1' }} onClick={() => onSelect(null)}>
            <span style={S.pickDot('#F26419')} />
            <span style={S.pickName}>Todas as lojas (padrão mestre)</span>
          </button>
        </div>
        <button style={S.pickCancel} onClick={onClose}>Cancelar</button>
      </div>
    </div>
  );
}

/* ─── PAINEL GERAL MESTRA ────────────────────────────────────── */
function fmtR(v) {
  return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getWeekRange() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const seg = new Date(d); seg.setDate(d.getDate() + diff);
  const dom = new Date(seg); dom.setDate(seg.getDate() + 6);
  const iso = dt => dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
  return { start: iso(seg), end: iso(dom) };
}

function getISOWeekNum() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return String(Math.ceil((((d - yearStart) / 86400000) + 1) / 7));
}

// Mapa inverso: 'Bangu' -> 'BANGU' (para cruzar com checklist_diario)
const DISPLAY_TO_KEY = {};
LOJAS_LISTA.forEach(k => { DISPLAY_TO_KEY[LOJA_DISPLAY[k]] = k; });

// Calcula índice de semana igual ao Mestra (âncora: 2026-01-05)
function getMestraWeekIdx() {
  const anchor = new Date(2026, 0, 5);
  const today = new Date();
  const td = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.floor((td - anchor) / (7 * 86400000)));
}

// Replica calcSemana do Mestra — retorna total líquido da semana para a loja
function calcComissaoTotal(wd) {
  if (!wd) return null;
  const ADM = 50;
  const ativos = (wd.funcs || []).filter(f => f.nome && f.nome.trim());
  if (!ativos.length) return null;
  const dias = Array.from({ length: 7 }, (_, d) => {
    const e90 = (parseFloat(wd.brutos?.[d]) || 0) * 0.9;
    const I = ativos.filter(f => f.dias?.[d] !== 'NÃO TRABALHADO').length;
    return { e90, cotaUnit: I > 0 ? e90 / I : 0 };
  });
  const funcCalc = ativos.map(f => {
    let bruta = 0;
    dias.forEach((dia, d) => {
      if (['PRESENTE', 'HORISTA', 'JOVEM APRENDIZ'].includes(f.dias?.[d])) bruta += dia.cotaUnit;
    });
    const nFS = (f.dias || []).filter(s => ['FALTA', 'SUSPENSÃO'].includes(s)).length;
    const mult = nFS >= 2 ? 0 : nFS === 1 ? 0.5 : 1;
    const AF = bruta * mult;
    const elegivel = f.tipo !== 'JOVEM APRENDIZ' && nFS === 0 &&
      !(f.dias || []).some(s => s === 'ATESTADO') &&
      (f.dias || []).some(s => ['PRESENTE', 'HORISTA'].includes(s));
    const diasEleg = elegivel ? (f.dias || []).filter(s => ['PRESENTE', 'HORISTA'].includes(s)).length : 0;
    return { AF, elegivel, diasEleg };
  });
  const baseTotal = dias.reduce((s, d) => s + d.e90, 0);
  const sumAF = funcCalc.reduce((s, f) => s + f.AF, 0);
  const poolRateio = Math.max(0, baseTotal - sumAF);
  const vD = parseFloat(wd.vDist) || 0;
  const efetivo = wd.dist === 'SIM' ? (vD > 0 ? Math.min(vD, poolRateio) : poolRateio) : 0;
  const totalDE = funcCalc.reduce((s, f) => s + f.diasEleg, 0);
  const nPagantes = funcCalc.filter(f => f.AF > 0).length;
  return funcCalc.reduce((s, f) => {
    const rateio = f.elegivel && totalDE > 0 ? efetivo * f.diasEleg / totalDE : 0;
    const cota = f.AF + rateio;
    const adm = nPagantes > 0 && f.AF > 0 ? ADM / nPagantes : 0;
    return s + (cota - adm);
  }, 0);
}

// Gera os 7 dias da semana a partir da data de início (ISO)
function getWeekDates(startIso) {
  const LABELS = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  const d = new Date(startIso + 'T12:00:00');
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(d); dt.setDate(d.getDate() + i);
    const iso = dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
    return { iso, label: LABELS[i] };
  });
}

// Retorna cor e texto para um pct de check-list
function chkDia(pct) {
  if (pct === null || pct === undefined) return { bg: 'rgba(255,255,255,.05)', cor: '#2a2a4a', txt: '—' };
  if (pct === 100)  return { bg: 'rgba(34,197,94,.15)',  cor: '#22c55e', txt: '✓' };
  if (pct > 50)     return { bg: 'rgba(240,192,80,.15)', cor: '#f0c050', txt: pct+'%' };
  return              { bg: 'rgba(232,88,10,.15)',  cor: '#E8580A', txt: pct+'%' };
}

function fmtK(v) {
  if (!v || v === 0) return null;
  if (v >= 1000) return 'R$' + (v / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + 'k';
  return 'R$' + Math.round(v);
}

function PainelGeral({ onSelectLoja }) {
  const [dados, setDados] = useState({});
  const [clSemana, setClSemana] = useState({}); // { BANGU: { '2026-07-01': 85, ... } }
  const [fatDias, setFatDias] = useState({});    // { BANGU: { '2026-07-01': 5000, ... } }
  const [comissoes, setComissoes] = useState({}); // { BANGU: 1234.56, ... }
  const [metas, setMetas] = useState({});         // { BANGU: 15000, ... }
  const [weekDates, setWeekDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [semana, setSemana] = useState('');

  useEffect(() => {
    const { start, end } = getWeekRange();
    const wk = getISOWeekNum();
    const br = (iso) => iso.slice(5).split('-').reverse().join('/');
    setSemana(`${br(start)} – ${br(end)} (sem. ${wk})`);
    setWeekDates(getWeekDates(start));
    const semIdx = getMestraWeekIdx();

    // Faturamento + check-list da semana
    const pFat = fetch(
      `${SB_URL}/rest/v1/checklist_diario?data_operacao=gte.${start}&data_operacao=lte.${end}&select=loja,data_operacao,venda_salao,venda_delivery,checklist_pct`,
      { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
    )
      .then(r => r.json())
      .then(rows => {
        const fat = {};
        const cl  = {};
        const fd  = {};
        (rows || []).forEach(row => {
          const k = DISPLAY_TO_KEY[row.loja];
          if (!k) return;
          if (!fat[k]) fat[k] = { fat: 0 };
          const vendaDia = (row.venda_salao || 0) + (row.venda_delivery || 0);
          fat[k].fat += vendaDia;
          if (!fd[k]) fd[k] = {};
          if (vendaDia > 0) fd[k][row.data_operacao] = vendaDia;
          if (!cl[k]) cl[k] = {};
          if (row.checklist_pct !== null && row.checklist_pct !== undefined) {
            cl[k][row.data_operacao] = Number(row.checklist_pct);
          }
        });
        setDados(fat);
        setClSemana(cl);
        setFatDias(fd);
      });

    // Comissão real da semana vigente via gn_comissoes (mesmo cálculo do Mestra)
    const pCom = fetch(
      `${SB_URL}/rest/v1/gn_comissoes?select=loja,all_data`,
      { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
    )
      .then(r => r.json())
      .then(rows => {
        const coms = {};
        // Mapa inverso: chave do banco (ex: 'NORTE') → chave de exibição (ex: 'NORTE SHOPPING')
        const dbParaDisplay = {};
        Object.entries(LOJA_COM_KEY).forEach(([display, db]) => { dbParaDisplay[db] = display; });
        (rows || []).forEach(row => {
          if (!row.all_data) return;
          const wd = row.all_data[String(semIdx)];
          const total = calcComissaoTotal(wd);
          const displayKey = dbParaDisplay[row.loja] || row.loja;
          if (total !== null) coms[displayKey] = total;
        });
        setComissoes(coms);
      });

    // Metas semanais por loja (checklist_carnes.fat.meta)
    const pMeta = fetch(
      `${SB_URL}/rest/v1/checklist_carnes?semana_inicio=eq.${start}&select=loja,fat`,
      { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
    )
      .then(r => r.json())
      .then(rows => {
        const mt = {};
        (rows || []).forEach(row => {
          const k = DISPLAY_TO_KEY[row.loja];
          if (!k) return;
          const m = parseFloat(row.fat?.meta) || 0;
          if (m > 0) mt[k] = m;
        });
        setMetas(mt);
      }).catch(() => {});

    Promise.all([pFat, pCom, pMeta]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const totalBruto    = Object.values(dados).reduce((s, d) => s + d.fat, 0);
  const lojasComDados = Object.keys(dados).length;
  const totalMeta     = Object.values(metas).reduce((s, m) => s + m, 0);
  const metaPct       = totalMeta > 0 ? Math.min(100, Math.round((totalBruto / totalMeta) * 100)) : null;
  const metaFalta     = totalMeta > 0 && totalBruto < totalMeta ? totalMeta - totalBruto : 0;

  const pSec  = { fontSize: 10, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase', color: '#d4a800', marginBottom: 10, paddingLeft: 2 };
  const pCard = (cor, temDados) => ({ display: 'flex', flexDirection: 'column', gap: 0, background: '#0e0e1e', border: `1px solid ${temDados ? cor + '35' : '#161628'}`, borderRadius: 14, padding: '11px 13px', cursor: 'pointer' });

  return (
    <div style={{ padding: '0 14px 90px' }}>

      {/* Totalizador */}
      <div style={{ background: 'linear-gradient(135deg, #1a1500 0%, #0e0e1e 100%)', border: '1px solid rgba(212,168,0,.22)', borderRadius: 18, padding: '16px', marginBottom: 18 }}>
        <div style={pSec}>Semana atual · Consolidado</div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: '#44445a', fontWeight: 700, marginBottom: 3 }}>FATURAMENTO TOTAL</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#e8e8f4', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {loading ? '…' : fmtR(totalBruto)}
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#44445a' }}>
          {loading ? 'Carregando…' : `${lojasComDados} de ${LOJAS_LISTA.length} lojas com dados esta semana`}
        </div>
        {semana ? <div style={{ fontSize: 10, color: '#2a2a4a', marginTop: 4 }}>{semana}</div> : null}

        {/* Barra de meta consolidada */}
        {!loading && totalMeta > 0 && (
          <div style={{ marginTop: 14, borderTop: '1px solid rgba(212,168,0,.15)', paddingTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: '#d4a800' }}>🎯 Meta semanal consolidada</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: metaPct >= 100 ? '#22c55e' : metaPct >= 70 ? '#F26419' : '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{metaPct}%</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#44445a', marginBottom: 5, fontVariantNumeric: 'tabular-nums' }}>
              <span>{fmtR(totalBruto)} de {fmtR(totalMeta)}</span>
              {metaFalta > 0 && <span style={{ color: '#ef4444' }}>falta {fmtR(metaFalta)}</span>}
              {metaFalta === 0 && metaPct !== null && <span style={{ color: '#22c55e' }}>✓ Atingida</span>}
            </div>
            <div style={{ height: 6, borderRadius: 4, background: 'rgba(255,255,255,.07)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 4, width: metaPct + '%', background: metaPct >= 100 ? '#22c55e' : metaPct >= 70 ? '#F26419' : '#ef4444', transition: 'width .6s ease' }} />
            </div>
          </div>
        )}
      </div>

      {/* Cards por loja */}
      <div style={pSec}>Lojas — clique para entrar</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {LOJAS_LISTA.map(k => {
          const d        = dados[k];
          const temDados = !!d;
          const cor      = COR_LOJA[k] || '#444';
          const clDias   = clSemana[k] || {};
          const fatDiasK = fatDias[k] || {};
          const comissao = comissoes[k] != null ? comissoes[k] : null;
          const metaLoja = metas[k] || 0;
          const metaLojaPct = metaLoja > 0 && d ? Math.min(100, Math.round((d.fat / metaLoja) * 100)) : null;

          return (
            <div key={k} onClick={() => onSelectLoja(k)} style={pCard(cor, temDados)}>
              {/* Linha principal */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: cor, flexShrink: 0, boxShadow: temDados ? `0 0 7px ${cor}` : 'none' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#e8e8f4', lineHeight: 1 }}>{LOJA_DISPLAY[k]}</div>
                  <div style={{ fontSize: 11, color: temDados ? '#5a5a7a' : '#252538', marginTop: 2 }}>
                    {temDados ? 'Faturamento registrado esta semana' : 'Sem dados esta semana'}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                  {temDados && (
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#e8e8f4', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtR(d.fat)}
                    </div>
                  )}
                  {comissao !== null && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', fontVariantNumeric: 'tabular-nums' }}>
                      Comissão: {fmtR(comissao)}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 18, color: 'rgba(255,255,255,.15)', flexShrink: 0, marginLeft: 4 }}>›</div>
              </div>

              {/* Grade de dias da semana — check-list + faturamento */}
              <div style={{ display: 'flex', gap: 3, marginTop: 9 }}>
                {weekDates.map(({ iso, label }) => {
                  const pct = clDias[iso] !== undefined ? clDias[iso] : null;
                  const { bg, cor: c, txt } = chkDia(pct);
                  const fatV = fmtK(fatDiasK[iso]);
                  return (
                    <div key={iso} style={{ flex: 1, background: bg, borderRadius: 5, padding: '4px 0', textAlign: 'center' }}>
                      <div style={{ fontSize: 7, fontWeight: 800, color: c, letterSpacing: 0.3 }}>{label}</div>
                      <div style={{ fontSize: 8, fontWeight: 700, color: c, marginTop: 2 }}>{txt}</div>
                      {fatV && <div style={{ fontSize: 7, fontWeight: 700, color: c, opacity: 0.8, marginTop: 1 }}>{fatV}</div>}
                    </div>
                  );
                })}
              </div>

              {/* Mini barra de meta por loja */}
              {metaLojaPct !== null && (
                <div style={{ marginTop: 7 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#44445a', marginBottom: 3, fontVariantNumeric: 'tabular-nums' }}>
                    <span>🎯 Meta {fmtR(metaLoja)}</span>
                    <span style={{ color: metaLojaPct >= 100 ? '#22c55e' : metaLojaPct >= 70 ? '#F26419' : '#ef4444', fontWeight: 700 }}>{metaLojaPct}%</span>
                  </div>
                  <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 2, width: metaLojaPct + '%', background: metaLojaPct >= 100 ? '#22c55e' : metaLojaPct >= 70 ? '#F26419' : '#ef4444' }} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Botão WhatsApp — resumo semanal */}
      {!loading && (
        <div style={{ marginTop: 16 }}>
          <button
            onClick={() => {
              const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
              const linhas = LOJAS_LISTA
                .filter(k => dados[k])
                .map(k => {
                  const fat = dados[k]?.fat || 0;
                  const clDias = clSemana[k] || {};
                  const dias = weekDates.filter(({ iso }) => clDias[iso] !== undefined);
                  const media = dias.length ? Math.round(dias.reduce((s, { iso }) => s + clDias[iso], 0) / dias.length) : null;
                  const mt = metas[k] || 0;
                  const mpct = mt > 0 ? Math.min(100, Math.round((fat / mt) * 100)) : null;
                  return `• ${LOJA_DISPLAY[k]}: ${fmtR(fat)}${mpct !== null ? ' (' + mpct + '% da meta)' : ''}${media !== null ? ' · CL ' + media + '%' : ''}`;
                });
              const total = Object.values(dados).reduce((s, d) => s + d.fat, 0);
              const metaTotal = Object.values(metas).reduce((s, m) => s + m, 0);
              const metaLinha = metaTotal > 0 ? `\nMeta consolidada: ${fmtR(metaTotal)} (${Math.min(100, Math.round((total/metaTotal)*100))}%)` : '';
              const msg = `*GN Apps — Resumo Semanal*\n${semana}\n\n${linhas.join('\n')}\n\n*Total: ${fmtR(total)}*${metaLinha}\n_Gerado em ${hoje}_`;
              const url = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(msg);
              window.open(url, '_blank');
            }}
            style={{ width: '100%', background: '#25D366', border: 'none', borderRadius: 13, padding: '13px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: '#fff' }}
          >
            <span style={{ fontSize: 18 }}>📲</span> Enviar resumo no WhatsApp
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── HOME SCREEN ────────────────────────────────────────────── */
function HomeScreen({ session: sessionProp, onLogout }) {
  const [session, setSession] = useState(sessionProp);
  const [masterLoja, setMasterLoja] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [badges, setBadges] = useState({});
  const [senhaOpen, setSenhaOpen] = useState(false);
  const [tsNome, setTsNome] = useState('');
  const [tsSenha, setTsSenha] = useState('');
  const [tsConf, setTsConf] = useState('');
  const [tsErr, setTsErr] = useState('');
  const [tsSaving, setTsSaving] = useState(false);

  const isMaster = session.loja === 'GERAL' || !!(session.permissoes || {}).master;
  const lojaEfetiva = masterLoja || session.loja;
  const cor = COR_LOJA[lojaEfetiva] || '#F26419';

  useEffect(() => { setCor(cor); }, [cor]);

  const lojaDisp = masterLoja
    ? 'Loja ' + (LOJA_DISPLAY[masterLoja] || masterLoja)
    : isMaster ? 'Todas as lojas' : 'Loja ' + (LOJA_DISPLAY[session.loja] || session.loja);

  // Carregar badges ao vivo
  useEffect(() => {
    const perms = session.permissoes || {};
    const loja = lojaEfetiva;
    const disp = LOJA_DISPLAY[loja] || loja;

    const set = (id, text, color) => setBadges(b => ({ ...b, [id]: { text, color } }));

    if (perms.checklist || isMaster) {
      if (isMaster && !masterLoja) { set('checklist', 'Todas as lojas', 'o'); }
      else {
        const hoje = new Date().toISOString().split('T')[0];
        fetch(`${SB_URL}/rest/v1/checklist_diario?data_operacao=eq.${hoje}&loja=eq.${encodeURIComponent(loja)}&select=id`, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } })
          .then(r => r.json()).then(d => set('checklist', d && d.length ? 'Hoje ✓' : 'Novo hoje', d && d.length ? 'g' : 'b'))
          .catch(() => set('checklist', '—', 'x'));
      }
    }

    if (perms.avaliacoes || isMaster) {
      if (isMaster && !masterLoja) { set('avaliacoes', 'Todas as lojas', 'o'); }
      else {
        try {
          const norm = (disp || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
          const avs = JSON.parse(localStorage.getItem('gn_aval_v5_' + norm) || '[]');
          const fin = avs.filter(a => a.finalizada).length;
          set('avaliacoes', fin > 0 ? `${fin} finalizada${fin > 1 ? 's' : ''}` : 'Nenhuma ainda', fin > 0 ? 'g' : 'x');
        } catch (e) { set('avaliacoes', '—', 'x'); }
      }
    }

    if (perms.comissoes || isMaster) {
      if (isMaster && !masterLoja) { set('comissoes', 'Todas as lojas', 'o'); }
      else {
        const ck = LOJA_COM_KEY[loja] || loja;
        fetch(`${SB_URL}/rest/v1/gn_comissoes?loja=eq.${ck}&select=updated_at&order=updated_at.desc&limit=1`, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } })
          .then(r => r.json()).then(d => {
            if (d && d.length && d[0]?.updated_at) {
              const dt = new Date(d[0].updated_at);
              set('comissoes', 'Atualizado ' + dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), 'g');
            } else set('comissoes', 'Sem dados', 'x');
          }).catch(() => set('comissoes', '—', 'x'));
      }
    }

    if (perms.lojas    || isMaster) set('lojas',   'Online', 'g');
    if (perms.pedidos  || isMaster) set('pedidos', 'Online', 'g');
    if (isMaster && perms.mestra !== false) set('mestra',  'Visão consolidada', 'o');
    if (perms.rh  || isMaster) set('rh', 'Online', 'b');
  }, [session, masterLoja, lojaEfetiva, isMaster]);

  const navTo = (url) => {
    if (masterLoja) localStorage.setItem('gn_nav_loja', JSON.stringify({ loja: masterLoja, ts: Date.now() }));
    else localStorage.removeItem('gn_nav_loja');
    window.location.href = url;
  };

  const abrirSenha = () => {
    setTsNome(session.nome);
    setTsSenha('');
    setTsConf('');
    setTsErr('');
    setTsSaving(false);
    setSenhaOpen(true);
  };

  const salvarSenha = async () => {
    if (!tsNome.trim()) { setTsErr('Nome não pode ser vazio.'); return; }
    if (tsSenha && tsSenha !== tsConf) { setTsErr('Senhas não conferem.'); return; }
    setTsErr(''); setTsSaving(true);
    const payload = { nome: tsNome.trim(), atualizado_em: new Date().toISOString() };
    if (tsSenha) payload.senha = tsSenha;
    try {
      const res = await fetch(
        `${SB_URL}/rest/v1/gn_usuarios?id=eq.${session.id}`,
        { method: 'PATCH', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(payload) }
      );
      if (!res.ok) { setTsErr('⚠️ Erro ao salvar. Tente novamente.'); setTsSaving(false); return; }
      const updated = { ...session, nome: tsNome.trim() };
      localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
      setSession(updated);
      setSenhaOpen(false);
    } catch (e) {
      setTsErr('⚠️ Erro de conexão.');
    }
    setTsSaving(false);
  };

  const perms = session.permissoes || {};

  return (
    <>
      {/* HEADER */}
      <header style={S.hdr}>
        <span style={S.hdrGN}>GN</span>
        <span style={S.hdrGestao}>GESTÃO</span>
        <div style={S.hdrSep} />
        <div style={S.hdrUser}>{session.nome}{session.cargo ? ' · ' + session.cargo : ''}</div>
        <button style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '5px 9px', fontSize: 14, lineHeight: 1, color: 'rgba(255,255,255,.35)', fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0 }} onClick={abrirSenha} title="Trocar login e senha">🔑</button>
        <button style={S.hdrSair} onClick={onLogout}>Sair</button>
      </header>

      {/* HERO */}
      <div style={S.heroWrap}>
        <div style={S.heroBg} />
        <div style={S.heroBlob} />
        <div style={S.heroFade} />
        <div style={S.heroInner}>
          <div style={S.heroRow}>
            <div style={S.heroLoja}>{lojaDisp}</div>
            {isMaster && (
              <button style={S.heroSelBtn} onClick={() => setPickerOpen(true)}>
                Trocar loja <span style={{ fontSize: 14 }}>⌄</span>
              </button>
            )}
          </div>
          <div style={S.heroDate}>{fmtDate()}</div>
          <div style={S.heroGreeting}>{saudacao(session.nome)}</div>
          <div style={S.heroSub}>
            {isMaster && !masterLoja ? 'Acesso mestre — selecione uma loja ou acesse a Mestra' : session.cargo || ''}
          </div>
        </div>
      </div>

      {/* MODULES ou PAINEL GERAL */}
      {isMaster && !masterLoja ? (
        <PainelGeral onSelectLoja={(loja) => setMasterLoja(loja)} />
      ) : (
        <div style={S.modList}>
          {MODULES.filter(m => !m.masterOnly || isMaster).map(m => {
            const enabled = isMaster ? perms[m.perm] !== false : !!perms[m.perm];
            return (
              <div
                key={m.id}
                style={S.modRow(enabled)}
                onClick={enabled ? () => navTo(m.url) : undefined}
              >
                <div style={S.modIcon(cor)}>{m.icon}</div>
                <div style={S.modBody}>
                  <div style={S.modName}>{m.name}</div>
                  <div style={S.modSub}>{m.sub}</div>
                </div>
                <div style={S.modRight}>
                  {enabled
                    ? <Badge id={m.id} badges={badges} />
                    : <span style={S.badge('x')}>🔒 Sem acesso</span>
                  }
                </div>
                {enabled && <div style={S.modArrow}>›</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* LOJA PICKER */}
      {pickerOpen && (
        <LojaPicker
          masterLoja={masterLoja}
          onSelect={(loja) => { setMasterLoja(loja); setPickerOpen(false); }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {/* TROCAR LOGIN/SENHA */}
      {senhaOpen && (
        <div style={{ ...S.overlay, alignItems: 'center', justifyContent: 'center' }} onClick={e => e.target === e.currentTarget && setSenhaOpen(false)}>
          <div style={{ ...S.sheet, borderRadius: 20, maxWidth: 340, maxHeight: 'none' }}>
            <div style={S.pickerTitle}>Trocar login e senha</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 4px 12px' }}>
              <div>
                <label style={{ fontSize: 11, color: '#7A7A9A', display: 'block', marginBottom: 4 }}>Nome de usuário</label>
                <input style={{ width: '100%', padding: '10px 12px', background: '#1a1a2e', border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, color: '#fff', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} type="text" value={tsNome} onChange={e => setTsNome(e.target.value)} autoComplete="off" />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#7A7A9A', display: 'block', marginBottom: 4 }}>Nova senha</label>
                <input style={{ width: '100%', padding: '10px 12px', background: '#1a1a2e', border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, color: '#fff', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} type="password" value={tsSenha} onChange={e => setTsSenha(e.target.value)} autoComplete="new-password" />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#7A7A9A', display: 'block', marginBottom: 4 }}>Confirmar nova senha</label>
                <input style={{ width: '100%', padding: '10px 12px', background: '#1a1a2e', border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, color: '#fff', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} type="password" value={tsConf} onChange={e => setTsConf(e.target.value)} autoComplete="new-password" />
              </div>
              <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,.04)', borderRadius: 8, fontSize: 12, color: '#7A7A9A' }}>
                🏪 Loja: <span style={{ color: 'rgba(255,255,255,.6)' }}>{LOJA_DISPLAY[session.loja] || session.loja}</span>
              </div>
              {tsErr && <div style={{ color: '#f87171', fontSize: 12 }}>{tsErr}</div>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 4px' }}>
              <button style={S.pickCancel} onClick={() => setSenhaOpen(false)}>Cancelar</button>
              <button style={{ padding: 12, background: 'var(--cor, #F26419)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: tsSaving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: tsSaving ? 0.6 : 1 }} onClick={salvarSenha} disabled={tsSaving}>{tsSaving ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM NAV */}
      <nav style={S.bottomNav}>
        <button style={S.bottomItem} onClick={() => navTo('/gn-pedidos.html')}>
          <span style={S.bottomIcon}>🛒</span>
          <span style={S.bottomLabel(false)}>Pedidos</span>
        </button>
        {isMaster && (
          <button style={S.bottomItem} onClick={() => navTo('/gn-comissoes-mestra.html')}>
            <span style={S.bottomIcon}>🏆</span>
            <span style={S.bottomLabel(false)}>Mestra</span>
          </button>
        )}
        {isMaster && (
          <button style={S.bottomItem} onClick={() => navTo('/gn-usuarios.html')}>
            <span style={S.bottomIcon}>🔐</span>
            <span style={S.bottomLabel(false)}>Senhas</span>
          </button>
        )}
        {(perms.rh || isMaster) && (
          <button style={S.bottomItem} onClick={() => navTo('/gn-rh.html')}>
            <span style={S.bottomIcon}>👥</span>
            <span style={S.bottomLabel(false)}>RH</span>
          </button>
        )}
      </nav>
    </>
  );
}

/* ─── DASHBOARD (raiz) ───────────────────────────────────────── */
function Dashboard() {
  const [session, setSession] = useState(getSession);

  useEffect(() => {
    if (!session) setCor('#F26419');
  }, [session]);

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('gn_nav_loja');
    setSession(null);
  };

  return (
    <div style={S.page}>
      {session
        ? <HomeScreen session={session} onLogout={handleLogout} />
        : <LoginScreen onLogin={setSession} />
      }
    </div>
  );
}

export default Dashboard;
