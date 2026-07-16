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
  { id: 'manutencao',  name: 'Manutenção',       sub: 'Acompanhamento de manutenções das lojas', icon: '🔧', perm: 'manutencao',  url: '/gn-manutencao.html', free: true },
  { id: 'inventario',  name: 'Inventário',       sub: 'Inventário de itens e marketing da loja', icon: '📦', perm: 'inventario',  url: '/gn-inventario.html', free: true },
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
  page: { minHeight: '100vh', background: 'color-mix(in srgb, var(--cor, #F26419) 9%, #111118)', color: '#e8e8f4', fontFamily: "'-apple-system','BlinkMacSystemFont','Segoe UI',sans-serif", display: 'flex', flexDirection: 'column' },
  // LOGIN
  loginWrap: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 },
  loginLogo: { fontSize: 54, fontWeight: 900, letterSpacing: -3, lineHeight: 1, color: 'var(--cor, #F26419)' },
  loginTag: { fontSize: 11, color: '#44445a', letterSpacing: 3, textTransform: 'uppercase', margin: '6px 0 36px' },
  loginCard: { background: 'color-mix(in srgb, var(--cor, #F26419) 7%, #141428)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 22, padding: '28px 24px', width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 24px 60px #00000080' },
  loginTitle: { fontSize: 15, fontWeight: 700, color: '#e8e8f4', textAlign: 'center', marginBottom: 2 },
  input: (focused) => ({ background: '#181830', border: `1.5px solid ${focused ? 'var(--cor, #F26419)' : '#2e2e50'}`, borderRadius: 12, padding: '14px 16px', fontSize: 15, color: '#e8e8f4', width: '100%', fontFamily: 'inherit', outline: 'none', transition: 'border-color .15s' }),
  loginBtn: (disabled) => ({ background: disabled ? '#2a2a3a' : 'var(--cor, #F26419)', color: disabled ? '#555' : '#fff', border: 'none', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer', letterSpacing: 0.3, transition: 'background .15s' }),
  loginErr: { color: '#f87171', fontSize: 12, minHeight: 16, textAlign: 'center' },
  // HEADER
  hdr: { position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px', background: 'linear-gradient(90deg, color-mix(in srgb, var(--cor, #F26419) 16%, #0c0c1a) 0%, rgba(12,12,24,.97) 65%)', backdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(255,255,255,.06)' },
  hdrGN: { fontSize: 20, fontWeight: 900, color: 'var(--cor, #F26419)', letterSpacing: -1 },
  hdrGestao: { fontSize: 9, fontWeight: 800, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(255,255,255,.22)', alignSelf: 'flex-end', marginBottom: 2 },
  hdrSep: { width: 1, height: 18, background: 'rgba(255,255,255,.06)', flexShrink: 0 },
  hdrUser: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.45)' },
  hdrSair: { background: 'transparent', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '6px 13px', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.4)', fontFamily: 'inherit', cursor: 'pointer' },
  // HERO
  heroWrap: { position: 'relative', padding: '24px 20px 36px', overflow: 'hidden' },
  heroBg: { position: 'absolute', inset: 0, background: 'linear-gradient(155deg, var(--cor, #F26419) 0%, rgba(0,0,0,.6) 60%, #08080f 100%)', opacity: 0.55, transition: 'background .4s' },
  heroBlob: { position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'var(--cor, #F26419)', opacity: 0.22, filter: 'blur(40px)', transition: 'background .4s' },
  heroFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 48, background: 'linear-gradient(0deg, color-mix(in srgb, var(--cor, #F26419) 9%, #111118), transparent)' },
  heroInner: { position: 'relative', zIndex: 1 },
  heroRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 },
  heroLoja: { fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1 },
  heroSelBtn: { display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 8, padding: '4px 10px 4px 11px', fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 },
  heroDate: { fontSize: 11, color: 'rgba(255,255,255,.42)', marginBottom: 10 },
  heroGreeting: { fontSize: 20, fontWeight: 800, color: '#fff' },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,.45)', marginTop: 3 },
  // MODULES
  modList: { padding: '4px 14px 90px', display: 'flex', flexDirection: 'column', gap: 7 },
  modRow: (enabled) => ({ display: 'flex', alignItems: 'center', gap: 12, background: 'color-mix(in srgb, var(--cor, #F26419) 7%, #141428)', border: '1px solid color-mix(in srgb, var(--cor, #F26419) 18%, #20203a)', borderRadius: 16, padding: '13px 14px', cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.27, userSelect: 'none', WebkitUserSelect: 'none', textDecoration: 'none' }),
  modIcon: (cor) => ({ width: 46, height: 46, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0, background: cor + '75', border: `1.5px solid ${cor}` }),
  modBody: { flex: 1, minWidth: 0 },
  modName: { fontSize: 13, fontWeight: 800, color: '#e8e8f4', letterSpacing: 0.2 },
  modSub: { fontSize: 11, color: '#6a6a8e', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
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
  sheet: { background: 'color-mix(in srgb, var(--cor, #F26419) 7%, #141428)', borderRadius: '24px 24px 0 0', borderTop: '1px solid rgba(255,255,255,.09)', padding: '20px 16px 40px', width: '100%', maxHeight: '82vh', overflowY: 'auto' },
  pickerTitle: { fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.4)', textAlign: 'center', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 },
  pickerGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  pickBtn: (active, cor) => ({ display: 'flex', alignItems: 'center', gap: 9, background: active ? cor + '28' : '#1a1a30', border: `1.5px solid ${active ? cor : '#30305a'}`, borderRadius: 13, padding: '11px 13px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%' }),
  pickDot: (cor) => ({ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, background: cor, boxShadow: `0 0 6px ${cor}` }),
  pickName: { fontSize: 12, fontWeight: 700, color: '#e8e8f4' },
  pickCancel: { marginTop: 10, width: '100%', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 13, padding: 14, fontSize: 14, fontWeight: 600, color: '#555', fontFamily: 'inherit', cursor: 'pointer' },
  // BOTTOM NAV
  bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200, background: 'linear-gradient(0deg, color-mix(in srgb, var(--cor, #F26419) 12%, rgba(12,12,24,.99)), rgba(12,12,24,.97))', borderTop: '1px solid rgba(255,255,255,.07)', display: 'flex', backdropFilter: 'blur(16px)' },
  bottomItem: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 0 14px', gap: 3, cursor: 'pointer', textDecoration: 'none', background: 'none', border: 'none', fontFamily: 'inherit' },
  bottomIcon: { fontSize: 22, lineHeight: 1 },
  bottomLabel: (active) => ({ fontSize: 10, fontWeight: 700, color: active ? 'var(--cor, #F26419)' : 'rgba(255,255,255,.3)', letterSpacing: 0.5, textTransform: 'uppercase' }),
};

/* ─── UTILITÁRIOS ────────────────────────────────────────────── */
function setCor(cor) {
  document.documentElement.style.setProperty('--cor', cor || '#F26419');
}

/* ─── OFFLINE INDICATOR ──────────────────────────────────────── */
function OfflineBar() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const dn = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', dn);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', dn); };
  }, []);
  if (online) return null;
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, zIndex:9999, background:'#1a0a0a', borderBottom:'1px solid #7f1d1d', padding:'8px 16px', display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#f87171', fontWeight:700 }}>
      📵 Sem conexão — alguns dados podem estar desatualizados
    </div>
  );
}

/* ─── PULL-TO-REFRESH ────────────────────────────────────────── */
function usePullToRefresh(onRefresh) {
  const startY = React.useRef(null);
  const [refreshing, setRefreshing] = useState(false);
  const onTouchStart = useCallback(e => {
    if (window.scrollY === 0) startY.current = e.touches[0].clientY;
  }, []);
  const onTouchEnd = useCallback(async e => {
    if (startY.current === null) return;
    const dy = e.changedTouches[0].clientY - startY.current;
    startY.current = null;
    if (dy > 80 && !refreshing) {
      setRefreshing(true);
      try { await onRefresh(); } catch(e) {}
      setRefreshing(false);
    }
  }, [onRefresh, refreshing]);
  return { onTouchStart, onTouchEnd, refreshing };
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
    <div style={{ ...S.loginWrap, background: 'radial-gradient(ellipse at 50% -10%, color-mix(in srgb, var(--cor, #F26419) 18%, transparent) 0%, transparent 60%), color-mix(in srgb, var(--cor, #F26419) 9%, #111118)' }}>
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

/* ─── META EDITOR ────────────────────────────────────────────── */
function MetaEditor({ metasLocal, onSave, onClose }) {
  const [vals, setVals] = useState(() => {
    const v = {};
    LOJAS_LISTA.forEach(k => { v[k] = metasLocal[k] ? String(metasLocal[k]) : ''; });
    return v;
  });

  const handleSave = () => {
    const mt = {};
    LOJAS_LISTA.forEach(k => {
      const n = parseFloat(String(vals[k]).replace(/\./g,'').replace(',','.'));
      if (n > 0) mt[k] = n;
    });
    try { localStorage.setItem('gn_metas_v1', JSON.stringify(mt)); } catch(_) {}
    onSave(mt);
    onClose();
  };

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...S.sheet, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={S.pickerTitle}>⚙️ Metas Semanais por Loja</div>
        <div style={{ fontSize: 11, color: '#5a5a7a', textAlign: 'center', marginBottom: 14 }}>
          Usado como padrão quando o check-list não tem meta cadastrada
        </div>
        {LOJAS_LISTA.map(k => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
            <div style={{ width: 9, height: 9, borderRadius: '50%', background: COR_LOJA[k], flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: '#e8e8f4' }}>{LOJA_DISPLAY[k]}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#5a5a7a' }}>
              <span>R$</span>
              <input
                type="number" min="0" step="1000" placeholder="0"
                value={vals[k]}
                onChange={e => setVals(v => ({ ...v, [k]: e.target.value }))}
                style={{ width: 90, padding: '6px 8px', background: '#1a1a30', border: '1px solid #2e2e50', borderRadius: 8, color: '#e8e8f4', fontSize: 12, fontFamily: 'inherit', outline: 'none', textAlign: 'right' }}
              />
            </div>
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 16 }}>
          <button style={S.pickCancel} onClick={onClose}>Cancelar</button>
          <button style={{ padding: 12, background: 'var(--cor, #F26419)', border: 'none', borderRadius: 13, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }} onClick={handleSave}>
            Salvar
          </button>
        </div>
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
  const [freqData, setFreqData] = useState({});
  const [funcData, setFuncData] = useState({});
  const [caixaData, setCaixaData] = useState({});
  const [cmvPorLoja, setCmvPorLoja] = useState({});
  const [cmv, setCmv] = useState(null);
  const [semIdx, setSemIdx] = useState(() => getMestraWeekIdx());
  const [viewMode, setViewMode] = useState('sem');
  const [semAntDados, setSemAntDados] = useState({});
  const [manutPorLoja, setManutPorLoja] = useState({});
  const [sortBy, setSortBy] = useState('fat');
  const [filtroAtencao, setFiltroAtencao] = useState(false);
  const [tendDados, setTendDados] = useState({});
  const [mesAntDados, setMesAntDados] = useState({});
  const [metasLocal, setMetasLocal] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gn_metas_v1') || '{}'); } catch(_) { return {}; }
  });
  const [metaEditorOpen, setMetaEditorOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    setCmv(null);
    setFreqData({});
    setFuncData({});
    setCaixaData({});
    setCmvPorLoja({});
    setComissoes({});
    setMetas({});
    setDados({});
    setSemAntDados({});
    setManutPorLoja({});
    setTendDados({});
    setMesAntDados({});

    // Calcula datas de início e fim conforme modo
    const anchor = new Date(2026, 0, 5);
    const iso = dt => dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
    let start, end;
    if (viewMode === 'mes') {
      const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + semIdx * 7);
      const first = new Date(d.getFullYear(), d.getMonth(), 1);
      const last  = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      start = iso(first); end = iso(last);
      const label = first.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      setSemana(label.charAt(0).toUpperCase() + label.slice(1));
      setWeekDates([]);
    } else {
      const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + semIdx * 7);
      const e = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6);
      start = iso(d); end = iso(e);
      const br = s => s.slice(5).split('-').reverse().join('/');
      const isCurrent = semIdx === getMestraWeekIdx();
      setSemana(`${br(start)} – ${br(end)}${isCurrent ? ' · atual' : ''}`);
      setWeekDates(getWeekDates(start));
    }

    // Faturamento + check-list
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

    // Comissão + Frequência — apenas modo semanal
    const pCom = viewMode === 'sem' ? fetch(
      `${SB_URL}/rest/v1/gn_comissoes?select=loja,all_data`,
      { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
    )
      .then(r => r.json())
      .then(rows => {
        const coms = {};
        const freq = {};
        const fData = {};
        const dbParaDisplay = {};
        Object.entries(LOJA_COM_KEY).forEach(([display, db]) => { dbParaDisplay[db] = display; });
        (rows || []).forEach(row => {
          if (!row.all_data) return;
          const allData = row.all_data;
          const wd = allData[String(semIdx)];
          const total = calcComissaoTotal(wd);
          const displayKey = dbParaDisplay[row.loja] || row.loja;
          if (total !== null) coms[displayKey] = total;

          // Frequência consolidada por tipo
          if (wd?.funcs) {
            const sm = {};
            ['CLT / MENSALISTA','HORISTA','JOVEM APRENDIZ'].forEach(s => { sm[s] = {P:0,F:0,AT:0,total:0}; });
            wd.funcs.filter(f => f.nome?.trim()).forEach(f => {
              const s = f.tipo || 'CLT / MENSALISTA';
              if (!sm[s]) return;
              (f.dias || []).forEach(st => {
                sm[s].total++;
                if (['PRESENTE','HORISTA','JOVEM APRENDIZ','FOLGA','BANCO DE HORAS'].includes(st)) sm[s].P++;
                else if (['FALTA','SUSPENSÃO'].includes(st)) sm[s].F++;
                else if (st === 'ATESTADO') sm[s].AT++;
              });
            });
            freq[displayKey] = sm;
          }

          // Func ativos (com fallback para semana mais recente com dados)
          let wdFuncs = wd;
          if (!wdFuncs?.funcs?.filter(f => f.nome?.trim()).length) {
            const keys = Object.keys(allData).map(Number).sort((a, b) => b - a);
            for (const k of keys) {
              const w = allData[String(k)];
              if (w?.funcs?.filter(f => f.nome?.trim()).length) { wdFuncs = w; break; }
            }
          }
          const count = wdFuncs?.funcs?.filter(f => f.nome?.trim()).length || 0;

          // Faltas/suspensões/atestados da semana selecionada
          let faltas = 0, suspensoes = 0, atestados = 0;
          (wd?.funcs || []).filter(f => f.nome?.trim()).forEach(f => {
            (f.dias || []).forEach(st => {
              if (st === 'FALTA') faltas++;
              else if (st === 'SUSPENSÃO') suspensoes++;
              else if (st === 'ATESTADO') atestados++;
            });
          });
          fData[displayKey] = { count, faltas, suspensoes, atestados };
        });
        setComissoes(coms);
        setFreqData(freq);
        setFuncData(fData);
      }) : Promise.resolve();

    // Caixa fechamentos por loja — ambos os modos
    const pCaixa = fetch(
      `${SB_URL}/rest/v1/gn_caixa_fechamento?data=gte.${start}&data=lte.${end}&select=loja,total_real`,
      { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
    ).then(r => r.json()).then(rows => {
      const cx = {};
      (rows || []).forEach(r => {
        if (!cx[r.loja]) cx[r.loja] = 0;
        cx[r.loja] += parseFloat(r.total_real) || 0;
      });
      setCaixaData(cx);
    }).catch(() => {});

    // Metas — apenas modo semanal
    const pMeta = viewMode === 'sem' ? fetch(
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
        // metasLocal como padrão, Supabase sobrescreve por semana
        setMetas({ ...metasLocal, ...mt });
      }).catch(() => {}) : Promise.resolve();

    // CMV — consolidado + por loja, ambos os modos
    Promise.all([
      fetch(`${SB_URL}/rest/v1/checklist_diario?data_operacao=gte.${start}&data_operacao=lte.${end}&select=loja,venda_salao,venda_delivery`,
        { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }).then(r => r.json()),
      fetch(`${SB_URL}/rest/v1/gn_recebimentos?data=gte.${start}&data=lte.${end}&select=loja,valor_recebido`,
        { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }).then(r => r.json()),
    ]).then(([dias, recbs]) => {
      const vendasPorLoja = {}, custosPorLoja = {};
      let totalVendas = 0, totalReceb = 0;
      (dias || []).forEach(r => {
        const v = (r.venda_salao || 0) + (r.venda_delivery || 0);
        totalVendas += v;
        const k = DISPLAY_TO_KEY[r.loja];
        if (k) { vendasPorLoja[k] = (vendasPorLoja[k] || 0) + v; }
      });
      (recbs || []).forEach(r => {
        const c = parseFloat(r.valor_recebido) || 0;
        totalReceb += c;
        const k = DISPLAY_TO_KEY[r.loja] || r.loja;
        if (k) { custosPorLoja[k] = (custosPorLoja[k] || 0) + c; }
      });
      if (totalVendas > 0) setCmv(Math.round((totalReceb / totalVendas) * 1000) / 10);
      const cl = {};
      Object.keys(vendasPorLoja).forEach(k => {
        const v = vendasPorLoja[k];
        if (v > 0) cl[k] = Math.round(((custosPorLoja[k] || 0) / v) * 1000) / 10;
      });
      setCmvPorLoja(cl);
    }).catch(() => {});

    // Semana anterior — comparativo de faturamento (apenas semanal)
    if (viewMode === 'sem') {
      const anchorSA = new Date(2026, 0, 5);
      const isoSA = dt => dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
      const dSA = new Date(anchorSA.getFullYear(), anchorSA.getMonth(), anchorSA.getDate() + (semIdx - 1) * 7);
      const eSA = new Date(dSA.getFullYear(), dSA.getMonth(), dSA.getDate() + 6);
      fetch(
        `${SB_URL}/rest/v1/checklist_diario?data_operacao=gte.${isoSA(dSA)}&data_operacao=lte.${isoSA(eSA)}&select=loja,venda_salao,venda_delivery`,
        { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
      ).then(r => r.json()).then(rows => {
        const ant = {};
        (rows || []).forEach(row => {
          const k = DISPLAY_TO_KEY[row.loja];
          if (!k) return;
          ant[k] = (ant[k] || 0) + (parseFloat(row.venda_salao)||0) + (parseFloat(row.venda_delivery)||0);
        });
        setSemAntDados(ant);
      }).catch(() => {});
    }

    // Tendência — últimas 4 semanas por loja (modo semanal)
    if (viewMode === 'sem') {
      const d4w = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + (semIdx - 3) * 7);
      const e4w = new Date(d4w.getFullYear(), d4w.getMonth(), d4w.getDate() + 27);
      fetch(
        `${SB_URL}/rest/v1/checklist_diario?data_operacao=gte.${iso(d4w)}&data_operacao=lte.${iso(e4w)}&select=loja,data_operacao,venda_salao,venda_delivery`,
        { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
      ).then(r => r.json()).then(rows => {
        const tend = {};
        (rows||[]).forEach(row => {
          const k = DISPLAY_TO_KEY[row.loja]; if (!k) return;
          const rowDate = new Date(row.data_operacao + 'T12:00:00');
          const wIdx = Math.floor((rowDate - anchor) / (7 * 86400000));
          if (!tend[k]) tend[k] = {};
          tend[k][wIdx] = (tend[k][wIdx] || 0) + (parseFloat(row.venda_salao)||0) + (parseFloat(row.venda_delivery)||0);
        });
        setTendDados(tend);
      }).catch(() => {});
    }

    // Mês anterior — comparativo (modo mensal)
    if (viewMode === 'mes') {
      const dMes = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + semIdx * 7);
      const prevFirst = new Date(dMes.getFullYear(), dMes.getMonth() - 1, 1);
      const prevLast  = new Date(dMes.getFullYear(), dMes.getMonth(), 0);
      fetch(
        `${SB_URL}/rest/v1/checklist_diario?data_operacao=gte.${iso(prevFirst)}&data_operacao=lte.${iso(prevLast)}&select=loja,venda_salao,venda_delivery`,
        { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
      ).then(r => r.json()).then(rows => {
        const ant = {};
        (rows||[]).forEach(row => {
          const k = DISPLAY_TO_KEY[row.loja]; if (!k) return;
          ant[k] = (ant[k] || 0) + (parseFloat(row.venda_salao)||0) + (parseFloat(row.venda_delivery)||0);
        });
        setMesAntDados(ant);
      }).catch(() => {});
    }

    // Manutenções pendentes por loja (últimos 30 dias)
    (() => {
      const hoje30 = new Date(); hoje30.setDate(hoje30.getDate() - 30);
      const iso30 = hoje30.getFullYear() + '-' + String(hoje30.getMonth()+1).padStart(2,'0') + '-' + String(hoje30.getDate()).padStart(2,'0');
      fetch(
        `${SB_URL}/rest/v1/checklist_diario?data_operacao=gte.${iso30}&select=loja,manutencao`,
        { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
      ).then(r => r.json()).then(rows => {
        const counts = {};
        (rows || []).forEach(row => {
          const k = DISPLAY_TO_KEY[row.loja];
          if (!k || !Array.isArray(row.manutencao)) return;
          const pend = row.manutencao.filter(m => m && m.status && m.status !== 'Resolvido').length;
          if (pend > 0) counts[k] = (counts[k] || 0) + pend;
        });
        setManutPorLoja(counts);
      }).catch(() => {});
    })();

    Promise.all([pFat, pCom, pMeta, pCaixa]).catch(() => {}).finally(() => setLoading(false));
  }, [semIdx, viewMode]);

  const totalBruto    = Object.values(dados).reduce((s, d) => s + d.fat, 0);
  const lojasComDados = Object.keys(dados).length;
  const totalMeta     = Object.values(metas).reduce((s, m) => s + m, 0);
  const metaPct       = totalMeta > 0 ? Math.min(100, Math.round((totalBruto / totalMeta) * 100)) : null;
  const metaFalta     = totalMeta > 0 && totalBruto < totalMeta ? totalMeta - totalBruto : 0;

  // Ordenação e filtro de lojas
  let lojasOrdenadas = [...LOJAS_LISTA];
  if (sortBy === 'fat') {
    lojasOrdenadas.sort((a, b) => (dados[b]?.fat || 0) - (dados[a]?.fat || 0));
  } else if (sortBy === 'meta') {
    const pctK = k => metas[k] && dados[k] ? Math.round((dados[k].fat / metas[k]) * 100) : 999;
    lojasOrdenadas.sort((a, b) => pctK(a) - pctK(b));
  }
  if (filtroAtencao) {
    lojasOrdenadas = lojasOrdenadas.filter(k => {
      const abaixoMeta = metas[k] && dados[k] && (dados[k].fat / metas[k] * 100) < 70;
      const semCL = dados[k] && weekDates.some(({iso}) => fatDias[k]?.[iso] && clSemana[k]?.[iso] === undefined);
      return abaixoMeta || semCL || (manutPorLoja[k] || 0) > 0;
    });
  }

  const btnCtrl = (active) => ({ background: active ? 'rgba(232,88,10,.25)' : 'rgba(255,255,255,.05)', border: `1px solid ${active ? '#E8580A' : 'rgba(255,255,255,.1)'}`, borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700, color: active ? '#E8580A' : '#5a5a7a', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 });

  const pSec  = { fontSize: 10, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase', color: '#d4a800', marginBottom: 10, paddingLeft: 2 };
  const pCard = (cor, temDados) => ({ display: 'flex', flexDirection: 'column', gap: 0, background: `color-mix(in srgb, ${cor} ${temDados ? 10 : 5}%, #141428)`, border: `1px solid ${temDados ? cor + '45' : '#20203a'}`, borderRadius: 14, padding: '11px 13px', cursor: 'pointer' });

  const freqCons = {};
  ['CLT / MENSALISTA','HORISTA','JOVEM APRENDIZ'].forEach(s => { freqCons[s] = {P:0,F:0,AT:0,total:0}; });
  Object.values(freqData).forEach(sm => {
    Object.entries(sm).forEach(([s,d]) => { if (freqCons[s]) { freqCons[s].P+=d.P; freqCons[s].F+=d.F; freqCons[s].AT+=d.AT; freqCons[s].total+=d.total; } });
  });
  const hasFreqData = Object.values(freqCons).some(c => c.total > 0);

  const exportarCSV = () => {
    const cols = ['Loja', 'Faturamento', 'Meta', '% Meta', 'CL Médio%', 'Comissão', 'CMV%'];
    const rows = lojasOrdenadas.map(k => {
      const fat = dados[k]?.fat || 0;
      const meta = metas[k] || 0;
      const metaPct = meta > 0 ? Math.min(100, Math.round((fat / meta) * 100)) : '';
      const clVals = Object.values(clSemana[k] || {});
      const clMedia = clVals.length ? Math.round(clVals.reduce((s, v) => s + v, 0) / clVals.length) : '';
      const com = comissoes[k] != null ? comissoes[k].toFixed(2) : '';
      const cmvV = cmvPorLoja[k] != null ? cmvPorLoja[k].toFixed(1) : '';
      return [LOJA_DISPLAY[k], fat.toFixed(2), meta.toFixed(2), metaPct, clMedia, com, cmvV];
    });
    const csv = [cols, ...rows].map(r => r.join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gn-${semana.replace(/[\s/–]/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: '0 14px 90px' }}>

      {/* Lembrete segunda-feira — enviar relatório semanal */}
      {(() => {
        const hoje = new Date();
        if (hoje.getDay() !== 1 || viewMode !== 'sem') return null;
        const anchor = new Date(2026, 0, 5);
        const isoFn = dt => dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
        const semStart = isoFn(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + semIdx * 7));
        const weekKey = 'gn_rel_sem_' + semStart;
        let jaEnviou = false;
        try { jaEnviou = !!localStorage.getItem(weekKey); } catch(_) {}
        if (jaEnviou || loading || !totalBruto) return null;
        return (
          <div style={{ background:'rgba(212,168,0,.1)', border:'1px solid rgba(212,168,0,.25)', borderRadius:12, padding:'10px 14px', display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
            <span style={{ fontSize:18, flexShrink:0 }}>📊</span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#d4a800', lineHeight:1 }}>Relatório da semana passada pronto</div>
              <div style={{ fontSize:10, color:'#7a6a00', marginTop:3 }}>Segunda-feira — hora de enviar o resumo para a equipe</div>
            </div>
            <button
              onClick={() => {
                try { localStorage.setItem('gn_rel_sem_' + semStart, '1'); } catch(_) {}
                const hoje2 = new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
                const linhas = LOJAS_LISTA.filter(k => dados[k]).map(k => {
                  const fat = dados[k]?.fat || 0;
                  const mt = metas[k] || 0;
                  const mpct = mt > 0 ? Math.min(100, Math.round((fat/mt)*100)) : null;
                  return `• ${LOJA_DISPLAY[k]}: ${fmtR(fat)}${mpct!==null?' ('+mpct+'% meta)':''}`;
                });
                const total = Object.values(dados).reduce((s,d)=>s+d.fat,0);
                const msg = `*GN Apps — Resumo Semanal*\n${semana}\n\n${linhas.join('\n')}\n\n*Total: ${fmtR(total)}*\n_Gerado em ${hoje2}_`;
                window.open('https://api.whatsapp.com/send?text='+encodeURIComponent(msg),'_blank');
              }}
              style={{ background:'#d4a800', border:'none', borderRadius:8, padding:'7px 11px', fontSize:11, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}
            >
              Enviar →
            </button>
          </div>
        );
      })()}

      {/* Controles de ordenação e filtro */}
      <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap' }}>
        <button onClick={() => setSortBy(s => s === 'fat' ? 'default' : 'fat')} style={btnCtrl(sortBy === 'fat')}>
          ↓ {sortBy === 'fat' ? 'Faturamento' : 'Faturamento'}
        </button>
        <button onClick={() => setSortBy(s => s === 'meta' ? 'default' : 'meta')} style={btnCtrl(sortBy === 'meta')}>
          🎯 {sortBy === 'meta' ? 'Por meta' : 'Por meta'}
        </button>
        <button onClick={() => setFiltroAtencao(v => !v)} style={btnCtrl(filtroAtencao)}>
          ⚠️ Atenção{filtroAtencao && lojasOrdenadas.length > 0 ? ` (${lojasOrdenadas.length})` : ''}
        </button>
        <button onClick={() => setMetaEditorOpen(true)} style={btnCtrl(false)} title="Configurar metas por loja">
          ⚙️ Metas
        </button>
      </div>

      {/* Modal editor de metas */}
      {metaEditorOpen && (
        <MetaEditor
          metasLocal={metasLocal}
          onSave={mt => { setMetasLocal(mt); setMetas(prev => ({ ...mt, ...prev })); }}
          onClose={() => setMetaEditorOpen(false)}
        />
      )}

      {/* Toggle Semanal/Mensal + navegação */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
        <div style={{ display:'flex', background:'#0e0e1e', border:'1px solid #161628', borderRadius:10, overflow:'hidden', flexShrink:0 }}>
          <button onClick={() => setViewMode('sem')} style={{ padding:'7px 12px', fontSize:11, fontWeight:700, border:'none', cursor:'pointer', background: viewMode==='sem' ? '#F26419' : 'transparent', color: viewMode==='sem' ? '#fff' : '#5a5a7a', fontFamily:'inherit' }}>Semanal</button>
          <button onClick={() => setViewMode('mes')} style={{ padding:'7px 12px', fontSize:11, fontWeight:700, border:'none', cursor:'pointer', background: viewMode==='mes' ? '#F26419' : 'transparent', color: viewMode==='mes' ? '#fff' : '#5a5a7a', fontFamily:'inherit' }}>Mensal</button>
        </div>
        <button
          onClick={() => {
            if (viewMode === 'mes') {
              const anchor = new Date(2026, 0, 5);
              const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + semIdx * 7);
              const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
              setSemIdx(Math.max(0, Math.round((prev - anchor) / (7 * 86400000))));
            } else { setSemIdx(i => Math.max(0, i - 1)); }
          }}
          style={{ background:'#0e0e1e', border:'1px solid #161628', borderRadius:8, width:32, height:32, fontSize:18, cursor:'pointer', color:'#8888aa', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
        >‹</button>
        <div style={{ flex:1, textAlign:'center', fontSize:10, color:'#5a5a7a', fontWeight:600, lineHeight:1.3 }}>{semana}</div>
        <button
          onClick={() => {
            const max = getMestraWeekIdx();
            if (viewMode === 'mes') {
              const anchor = new Date(2026, 0, 5);
              const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + semIdx * 7);
              const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
              setSemIdx(Math.min(max, Math.round((next - anchor) / (7 * 86400000))));
            } else { setSemIdx(i => Math.min(max, i + 1)); }
          }}
          style={{ background:'#0e0e1e', border:'1px solid #161628', borderRadius:8, width:32, height:32, fontSize:18, cursor:'pointer', color: semIdx >= getMestraWeekIdx() ? '#2a2a4a' : '#8888aa', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
        >›</button>
      </div>

      {/* Totalizador */}
      <div style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--cor, #d4a800) 16%, #111118) 0%, color-mix(in srgb, var(--cor, #d4a800) 6%, #111118) 100%)', border: '1px solid rgba(212,168,0,.3)', borderRadius: 18, padding: '16px', marginBottom: 18 }}>
        <div style={pSec}>{viewMode === 'sem' ? 'Semana' : 'Mês'} · Consolidado</div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: '#44445a', fontWeight: 700, marginBottom: 3 }}>FATURAMENTO TOTAL</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#e8e8f4', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {loading ? '…' : fmtR(totalBruto)}
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#44445a' }}>
          {loading ? 'Carregando…' : `${lojasComDados} de ${LOJAS_LISTA.length} lojas com dados ${viewMode === 'sem' ? 'esta semana' : 'este mês'}`}
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

      {/* Frequência Consolidada */}
      {hasFreqData && (
        <div style={{ background: '#0e0e1e', border: '1px solid #161628', borderRadius: 14, padding: '13px 14px', marginBottom: 12 }}>
          <div style={pSec}>👥 Frequência — Semana Atual</div>
          {['CLT / MENSALISTA','HORISTA','JOVEM APRENDIZ'].map(tipo => {
            const c = freqCons[tipo];
            if (!c || c.total === 0) return null;
            const pct = Math.round((c.P / c.total) * 100);
            return (
              <div key={tipo} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 0', borderBottom:'1px solid #101020' }}>
                <div style={{ flex:1, fontSize:11, color:'#5a5a7a', fontWeight:600 }}>{tipo}</div>
                <div style={{ fontSize:11, color:'#22c55e', fontWeight:700 }}>✓ {c.P}</div>
                {c.F > 0 && <div style={{ fontSize:11, color:'#ef4444', fontWeight:700 }}>✗ {c.F}</div>}
                {c.AT > 0 && <div style={{ fontSize:11, color:'#f0c050', fontWeight:700 }}>AT {c.AT}</div>}
                <div style={{ fontSize:11, fontWeight:800, color: pct>=90?'#22c55e':pct>=75?'#f0c050':'#ef4444', minWidth:36, textAlign:'right' }}>{pct}%</div>
              </div>
            );
          })}
          <button
            onClick={() => { try { localStorage.setItem('gn_mestra_tab', JSON.stringify('frequencia')); } catch(e){} window.location.href='/gn-comissoes-mestra.html'; }}
            style={{ marginTop:10, width:'100%', background:'rgba(255,255,255,.04)', border:'1px solid #161628', borderRadius:8, padding:'8px', fontSize:11, color:'#5a5a8a', cursor:'pointer', fontFamily:'inherit' }}
          >Ver frequência por loja →</button>
        </div>
      )}

      {/* CMV Semanal */}
      {cmv !== null && (
        <div style={{ background:'#0e0e1e', border:'1px solid #161628', borderRadius:14, padding:'13px 14px', marginBottom:12 }}>
          <div style={pSec}>💰 CMV — Semana Atual</div>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ fontSize:30, fontWeight:900, color: cmv<=30?'#22c55e':cmv<=38?'#f0c050':'#ef4444', fontVariantNumeric:'tabular-nums', lineHeight:1 }}>{cmv.toFixed(1)}%</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, color:'#5a5a7a', fontWeight:600 }}>Custo de Mercadoria Vendida</div>
              <div style={{ fontSize:10, color: cmv<=30?'#22c55e':cmv<=38?'#f0c050':'#ef4444', fontWeight:700, marginTop:2 }}>{cmv<=30?'✓ Ótimo':cmv<=38?'⚠ Atenção':'✗ Alto'}</div>
            </div>
            <button
              onClick={() => { try { localStorage.setItem('gn_mestra_tab', JSON.stringify('financeiro')); } catch(e){} window.location.href='/gn-comissoes-mestra.html'; }}
              style={{ background:'rgba(255,255,255,.04)', border:'1px solid #161628', borderRadius:8, padding:'7px 12px', fontSize:10, color:'#5a5a8a', cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}
            >Detalhar →</button>
          </div>
        </div>
      )}

      {/* Cards por loja */}
      <div style={pSec}>Lojas — clique para entrar{filtroAtencao && lojasOrdenadas.length === 0 ? ' · nenhuma loja em alerta' : ''}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {lojasOrdenadas.map(k => {
          const d        = dados[k];
          const temDados = !!d;
          const cor      = COR_LOJA[k] || '#444';
          const clDias   = clSemana[k] || {};
          const fatDiasK = fatDias[k] || {};
          const comissao = comissoes[k] != null ? comissoes[k] : null;
          const metaLoja = metas[k] || 0;
          const metaLojaPct = metaLoja > 0 && d ? Math.min(100, Math.round((d.fat / metaLoja) * 100)) : null;
          const fd = funcData[k];
          const cx = caixaData[k];

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
                  {/* ▲/▼ vs semana anterior */}
                  {viewMode === 'sem' && semAntDados[k] != null && semAntDados[k] > 0 && d && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: d.fat >= semAntDados[k] ? '#22c55e' : '#ef4444', fontVariantNumeric: 'tabular-nums' }}>
                      {d.fat >= semAntDados[k] ? '▲' : '▼'} {Math.abs(Math.round(((d.fat - semAntDados[k]) / semAntDados[k]) * 100))}% vs ant.
                    </div>
                  )}
                  {/* ▲/▼ vs mês anterior */}
                  {viewMode === 'mes' && mesAntDados[k] != null && mesAntDados[k] > 0 && d && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: d.fat >= mesAntDados[k] ? '#22c55e' : '#ef4444', fontVariantNumeric: 'tabular-nums' }}>
                      {d.fat >= mesAntDados[k] ? '▲' : '▼'} {Math.abs(Math.round(((d.fat - mesAntDados[k]) / mesAntDados[k]) * 100))}% vs mês ant.
                    </div>
                  )}
                  {/* Manutenções pendentes */}
                  {(manutPorLoja[k] || 0) > 0 && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#f97316' }}>
                      🔧 {manutPorLoja[k]} pend.
                    </div>
                  )}
                  {/* Sem check-list no dia com faturamento */}
                  {weekDates.some(({iso}) => fatDias[k]?.[iso] && clSemana[k]?.[iso] === undefined) && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444' }}>⚠️ CL faltando</div>
                  )}
                </div>
                <div style={{ fontSize: 18, color: 'rgba(255,255,255,.15)', flexShrink: 0, marginLeft: 4 }}>›</div>
              </div>

              {/* Métricas operacionais: func / faltas / atestados / caixa */}
              {(fd || cx != null) && (
                <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:9, paddingTop:8, borderTop:'1px solid rgba(255,255,255,.04)' }}>
                  {fd && (
                    <>
                      <div style={{ flex:1, textAlign:'center' }}>
                        <div style={{ fontSize:14, fontWeight:900, color:'#3b82f6', fontVariantNumeric:'tabular-nums', lineHeight:1 }}>{fd.count}</div>
                        <div style={{ fontSize:8, color:'#3a3a5a', fontWeight:700, textTransform:'uppercase', letterSpacing:.5, marginTop:2 }}>Func.</div>
                      </div>
                      <div style={{ flex:1, textAlign:'center' }}>
                        <div style={{ fontSize:14, fontWeight:900, color: fd.faltas>0?'#ef4444':'#22c55e', fontVariantNumeric:'tabular-nums', lineHeight:1 }}>{fd.faltas}</div>
                        <div style={{ fontSize:8, color:'#3a3a5a', fontWeight:700, textTransform:'uppercase', letterSpacing:.5, marginTop:2 }}>Faltas</div>
                      </div>
                      <div style={{ flex:1, textAlign:'center' }}>
                        <div style={{ fontSize:14, fontWeight:900, color: fd.suspensoes>0?'#f97316':'#22c55e', fontVariantNumeric:'tabular-nums', lineHeight:1 }}>{fd.suspensoes}</div>
                        <div style={{ fontSize:8, color:'#3a3a5a', fontWeight:700, textTransform:'uppercase', letterSpacing:.5, marginTop:2 }}>Susp.</div>
                      </div>
                      <div style={{ flex:1, textAlign:'center' }}>
                        <div style={{ fontSize:14, fontWeight:900, color: fd.atestados>0?'#f0c050':'#22c55e', fontVariantNumeric:'tabular-nums', lineHeight:1 }}>{fd.atestados}</div>
                        <div style={{ fontSize:8, color:'#3a3a5a', fontWeight:700, textTransform:'uppercase', letterSpacing:.5, marginTop:2 }}>Ates.</div>
                      </div>
                    </>
                  )}
                  {cx != null && (
                    <div style={{ flex:fd?2:1, textAlign: fd?'right':'center' }}>
                      <div style={{ fontSize:11, fontWeight:800, color: cx>0?'#22c55e':'#3a3a5a', fontVariantNumeric:'tabular-nums', lineHeight:1 }}>{fmtR(cx)}</div>
                      <div style={{ fontSize:8, color:'#3a3a5a', fontWeight:700, textTransform:'uppercase', letterSpacing:.5, marginTop:2 }}>Caixa</div>
                    </div>
                  )}
                </div>
              )}

              {/* CMV por loja */}
              {cmvPorLoja[k] != null && (
                <div style={{ display:'flex', alignItems:'center', gap:8, marginTop: (fd || cx != null) ? 7 : 9, paddingTop: (fd || cx != null) ? 7 : 8, borderTop:'1px solid rgba(255,255,255,.04)' }}>
                  <div style={{ fontSize:9, color:'#3a3a5a', fontWeight:700, textTransform:'uppercase', letterSpacing:.5, flexShrink:0 }}>CMV</div>
                  <div style={{ flex:1, height:4, borderRadius:2, background:'rgba(255,255,255,.05)', overflow:'hidden' }}>
                    <div style={{ height:'100%', width:Math.min(100,cmvPorLoja[k]/50*100)+'%', background:cmvPorLoja[k]<=30?'#22c55e':cmvPorLoja[k]<=38?'#f0c050':'#ef4444', borderRadius:2 }} />
                  </div>
                  <div style={{ fontSize:12, fontWeight:900, color:cmvPorLoja[k]<=30?'#22c55e':cmvPorLoja[k]<=38?'#f0c050':'#ef4444', fontVariantNumeric:'tabular-nums', flexShrink:0 }}>{cmvPorLoja[k].toFixed(1)}%</div>
                  <div style={{ fontSize:9, color:cmvPorLoja[k]<=30?'#22c55e':cmvPorLoja[k]<=38?'#f0c050':'#ef4444', fontWeight:700, flexShrink:0 }}>{cmvPorLoja[k]<=30?'✓ Ótimo':cmvPorLoja[k]<=38?'⚠ Aten.':'✗ Alto'}</div>
                </div>
              )}

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

              {/* Sparkline — tendência últimas 4 semanas */}
              {viewMode === 'sem' && (() => {
                const td = tendDados[k];
                if (!td) return null;
                const wks = [semIdx - 3, semIdx - 2, semIdx - 1, semIdx];
                const vals = wks.map(w => td[w] || 0);
                if (!vals.some(v => v > 0)) return null;
                const max = Math.max(...vals, 1);
                return (
                  <div style={{ marginTop: 5, display: 'flex', gap: 2, alignItems: 'flex-end', height: 16 }}>
                    {vals.map((v, i) => (
                      <div key={i} style={{ flex: 1, background: i === 3 ? cor : cor + '50', borderRadius: '2px 2px 0 0', minHeight: 2, height: Math.max(2, Math.round((v / max) * 16)) }} title={`${['S-3','S-2','S-1','Esta'][i]}: ${fmtR(v)}`} />
                    ))}
                  </div>
                );
              })()}

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

      {/* Botões de ação — WhatsApp + Exportar CSV */}
      {!loading && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={exportarCSV}
            style={{ width: '100%', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 13, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: '#7a7aaa' }}
          >
            <span style={{ fontSize: 16 }}>⬇️</span> Exportar CSV
          </button>
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
  const [miniPainel, setMiniPainel] = useState(null);
  const [manutBadgeCount, setManutBadgeCount] = useState(0);
  const [streak, setStreak] = useState(null);
  const [notifPerm, setNotifPerm] = useState(() => {
    if (typeof Notification !== 'undefined') return Notification.permission;
    return 'unsupported';
  });

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
        const hoje = (d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'))(new Date());
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

    // Badge de manutenção com count real de pendências (últimos 30 dias)
    const lojaDispQ = LOJA_DISPLAY[loja] || loja;
    const d30 = new Date(); d30.setDate(d30.getDate() - 30);
    const d30s = d30.getFullYear()+'-'+String(d30.getMonth()+1).padStart(2,'0')+'-'+String(d30.getDate()).padStart(2,'0');
    fetch(
      `${SB_URL}/rest/v1/checklist_diario?data_operacao=gte.${d30s}&loja=eq.${encodeURIComponent(lojaDispQ)}&select=manutencao`,
      { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
    ).then(r => r.json()).then(rows => {
      let pend = 0;
      (rows || []).forEach(row => {
        if (Array.isArray(row.manutencao)) pend += row.manutencao.filter(m => m && m.status && m.status !== 'Resolvido').length;
      });
      setManutBadgeCount(pend);
      set('manutencao', pend > 0 ? `⚠️ ${pend} pendente${pend > 1 ? 's' : ''}` : '✓ Em dia', pend > 0 ? 'o' : 'g');
    }).catch(() => set('manutencao', 'Online', 'g'));

    // Mini painel do dia (apenas para view de loja específica)
    if (!isMaster || masterLoja) {
      setMiniPainel(null);
      const hojeD = new Date();
      const hojeISO = hojeD.getFullYear()+'-'+String(hojeD.getMonth()+1).padStart(2,'0')+'-'+String(hojeD.getDate()).padStart(2,'0');
      fetch(
        `${SB_URL}/rest/v1/checklist_diario?data_operacao=eq.${hojeISO}&loja=eq.${encodeURIComponent(lojaDispQ)}&select=checklist_pct,venda_salao,venda_delivery,manutencao`,
        { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
      ).then(r => r.json()).then(data => {
        const row = data?.[0];
        const fat = row ? (parseFloat(row.venda_salao)||0) + (parseFloat(row.venda_delivery)||0) : 0;
        const pend = row && Array.isArray(row.manutencao) ? row.manutencao.filter(m => m && m.status && m.status !== 'Resolvido').length : 0;
        setMiniPainel({ pct: row?.checklist_pct ?? null, fat, manut: pend });
      }).catch(() => setMiniPainel({ pct: null, fat: 0, manut: 0 }));

      // Streak — dias consecutivos com CL 100%
      fetch(
        `${SB_URL}/rest/v1/checklist_diario?data_operacao=gte.${d30s}&loja=eq.${encodeURIComponent(lojaDispQ)}&select=data_operacao,checklist_pct&order=data_operacao.desc`,
        { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
      ).then(r => r.json()).then(rows => {
        const byDate = {};
        (rows || []).forEach(r => { if (r.checklist_pct !== null) byDate[r.data_operacao] = r.checklist_pct; });
        let s = 0;
        const today = new Date();
        for (let i = 0; i < 30; i++) {
          const dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
          const iso = dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
          if (byDate[iso] === 100) s++;
          else break;
        }
        setStreak(s);
      }).catch(() => {});
    }
  }, [session, masterLoja, lojaEfetiva, isMaster]);

  // Notificação local quando CL não preenchido após 20h
  useEffect(() => {
    if (!miniPainel || miniPainel.pct !== null) return;
    if (notifPerm !== 'granted') return;
    const h = new Date().getHours();
    if (h < 20) return;
    const hoje = new Date().toISOString().slice(0, 10);
    const key = 'gn_cl_notif_' + (lojaEfetiva || 'GERAL');
    try {
      if (localStorage.getItem(key) === hoje) return;
      localStorage.setItem(key, hoje);
      new Notification('⚠️ GN Apps — Check-list não preenchido', {
        body: (LOJA_DISPLAY[lojaEfetiva] || lojaEfetiva) + ': o check-list de hoje ainda não foi preenchido!',
        tag: 'gn-cl-alert',
        icon: '/favicon.ico',
      });
    } catch(_) {}
  }, [miniPainel, notifPerm, lojaEfetiva]);

  const habilitarNotif = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    const p = await Notification.requestPermission();
    setNotifPerm(p);
  }, []);

  const navTo = (url) => {
    if (masterLoja) localStorage.setItem('gn_nav_loja', JSON.stringify({ loja: masterLoja, ts: Date.now() }));
    else localStorage.removeItem('gn_nav_loja');
    const sep = url.includes('?') ? '&' : '?';
    window.location.href = url + sep + '_t=' + Date.now();
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

  // Pull-to-refresh hook
  const { onTouchStart, onTouchEnd, refreshing } = usePullToRefresh(async () => {
    // Re-fetch badges by remounting — reload window as simplest approach
    window.location.reload();
  });

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* OFFLINE */}
      <OfflineBar />
      {/* Pull-to-refresh indicator */}
      {refreshing && (
        <div style={{ textAlign: 'center', padding: '8px', fontSize: 11, color: '#5a5a7a', background: 'rgba(255,255,255,.03)' }}>
          🔄 Atualizando…
        </div>
      )}
      {/* HEADER */}
      <header style={S.hdr}>
        <span style={S.hdrGN}>GN</span>
        <span style={S.hdrGestao}>GESTÃO</span>
        <div style={S.hdrSep} />
        <div style={S.hdrUser}>{session.nome}{session.cargo ? ' · ' + session.cargo : ''}</div>
        {notifPerm !== 'unsupported' && (
          <button
            onClick={notifPerm === 'granted' ? undefined : habilitarNotif}
            title={notifPerm === 'granted' ? 'Notificações ativas' : 'Habilitar notificações'}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '5px 9px', fontSize: 14, lineHeight: 1, color: notifPerm === 'granted' ? '#22c55e' : 'rgba(255,255,255,.25)', fontFamily: 'inherit', cursor: notifPerm === 'granted' ? 'default' : 'pointer', flexShrink: 0 }}
          >{notifPerm === 'granted' ? '🔔' : '🔕'}</button>
        )}
        <button style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '5px 9px', fontSize: 14, lineHeight: 1, color: 'rgba(255,255,255,.35)', fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0 }} onClick={abrirSenha} title="Trocar login e senha">🔑</button>
        <button style={{ ...S.hdrSair, fontSize: 11 }} onClick={async () => {
          try { if ('caches' in window) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } } catch(e) {}
          window.location.href = window.location.pathname.split('?')[0] + '?v=' + Date.now();
        }} title="Forçar atualização do app">↻ Atualizar</button>
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

      {/* MINI PAINEL DO DIA (apenas para view de loja) */}
      {(!isMaster || masterLoja) && miniPainel && (
        <div style={{ padding: '0 14px 4px' }}>
          <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: '12px 14px', display: 'flex', gap: 0 }}>
            {/* Check-list % */}
            <div style={{ flex: 1, textAlign: 'center', borderRight: '1px solid rgba(255,255,255,.06)' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: miniPainel.pct === 100 ? '#22c55e' : miniPainel.pct > 50 ? '#f0c050' : miniPainel.pct != null ? '#ef4444' : '#2a2a4a', lineHeight: 1 }}>
                {miniPainel.pct != null ? miniPainel.pct + '%' : '—'}
              </div>
              <div style={{ fontSize: 9, color: '#44445a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 3 }}>Check-list hoje</div>
            </div>
            {/* Faturamento hoje */}
            <div style={{ flex: 1, textAlign: 'center', borderRight: '1px solid rgba(255,255,255,.06)' }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: miniPainel.fat > 0 ? '#e8e8f4' : '#2a2a4a', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {miniPainel.fat > 0 ? fmtR(miniPainel.fat) : '—'}
              </div>
              <div style={{ fontSize: 9, color: '#44445a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 3 }}>Faturamento hoje</div>
            </div>
            {/* Manutenções pendentes */}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: miniPainel.manut > 0 ? '#f97316' : '#22c55e', lineHeight: 1 }}>
                {miniPainel.manut > 0 ? miniPainel.manut : '✓'}
              </div>
              <div style={{ fontSize: 9, color: '#44445a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 3 }}>Manut. pend.</div>
            </div>
          </div>
        </div>
      )}

      {/* Alerta: check-list do dia ainda não preenchido */}
      {(!isMaster || masterLoja) && miniPainel && miniPainel.pct === null && (
        <div style={{ margin: '0 14px 6px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.22)', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f87171', lineHeight: 1 }}>Check-list de hoje não preenchido</div>
            <div style={{ fontSize: 10, color: '#7a3a3a', marginTop: 3 }}>Registre as operações para manter os dados atualizados</div>
          </div>
          <button onClick={() => navTo('/gn-checklist.html')} style={{ background: '#ef4444', border: 'none', borderRadius: 8, padding: '7px 11px', fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
            Preencher →
          </button>
        </div>
      )}

      {/* Streak de check-list */}
      {(!isMaster || masterLoja) && streak !== null && streak > 0 && (
        <div style={{ margin: '0 14px 6px', background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.18)', borderRadius: 12, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>🔥</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', lineHeight: 1 }}>
              {streak} dia{streak > 1 ? 's' : ''} consecutivo{streak > 1 ? 's' : ''} com CL 100%!
            </div>
            <div style={{ fontSize: 10, color: '#1a4a2a', marginTop: 2 }}>Continue mantendo o check-list em dia</div>
          </div>
        </div>
      )}

      {/* MODULES ou PAINEL GERAL */}
      {isMaster && !masterLoja ? (
        <PainelGeral onSelectLoja={(loja) => setMasterLoja(loja)} />
      ) : (
        <div style={S.modList}>
          {MODULES.filter(m => !m.masterOnly || isMaster).map(m => {
            const enabled = m.free || (isMaster ? perms[m.perm] !== false : !!perms[m.perm]);
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
        <button style={S.bottomItem} onClick={() => navTo('/gn-manutencao.html')}>
          <span style={S.bottomIcon}>🔧</span>
          <span style={S.bottomLabel(false)}>Manutenção</span>
        </button>
        <button style={S.bottomItem} onClick={() => navTo('/gn-inventario.html')}>
          <span style={S.bottomIcon}>📦</span>
          <span style={S.bottomLabel(false)}>Inventário</span>
        </button>
      </nav>
    </div>
  );
}

/* ─── DASHBOARD (raiz) ───────────────────────────────────────── */
function Dashboard() {
  const [session, setSession] = useState(getSession);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

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
      <OfflineBar />
      {session
        ? <HomeScreen session={session} onLogout={handleLogout} />
        : <LoginScreen onLogin={setSession} />
      }
    </div>
  );
}

export default Dashboard;
