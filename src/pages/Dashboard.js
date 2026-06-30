import React, { useState, useEffect } from 'react';

const MAIN_HREFS = ['/gn-lojas.html', '/gn-checklist.html', '/gn-avaliacoes.html', '/gn-comissoes.html'];

const ICON_COLORS = {
  '/gn-lojas.html': '#E8580A',
  '/gn-checklist.html': '#22C55E',
  '/gn-avaliacoes.html': '#EAB308',
  '/gn-comissoes.html': '#14B8A6',
};

const apps = [
  {
    href: '/gn-lojas.html',
    name: 'GN Lojas',
    description: 'Gestão completa de lojas: pedidos, estoque, vendas, conferência e relatórios.',
    icon: '🏪',
    tag: 'Gestão',
  },
  {
    href: '/gn-estoque.html',
    name: 'GN Estoque',
    description: 'Controle de estoque com pedidos, fichas técnicas, vendas e conferência semanal.',
    icon: '📦',
    tag: 'Estoque',
  },
  {
    href: '/gn-checklist.html',
    name: 'GN Check-list',
    description: 'Check-list operacional para abertura, fechamento e processos das lojas.',
    icon: '✅',
    tag: 'Operações',
  },
  {
    href: '/gn-comissoes.html',
    name: 'GN Comissões',
    description: 'Cálculo e acompanhamento de comissões dos vendedores.',
    icon: '💰',
    tag: 'Financeiro',
  },
  {
    href: '/gn-comissoes-mestra.html',
    name: 'GN Comissões — MESTRA',
    description: 'Painel mestre de comissões com visão consolidada de todas as lojas.',
    icon: '👑',
    tag: 'Financeiro',
  },
  {
    href: '/gn-avaliacoes.html',
    name: 'GN Avaliações',
    description: 'Avaliações de desempenho dos colaboradores.',
    icon: '⭐',
    tag: 'RH',
  },
  {
    href: '/gn-usuarios.html',
    name: 'GN Usuários',
    description: 'Gestão centralizada de usuários: criar, editar, bloquear e controlar acessos.',
    icon: '👤',
    tag: 'Admin',
  },
];

function fmtR(v) {
  return 'R$ ' + (parseFloat(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function readChecklistData() {
  const today = new Date().toISOString().split('T')[0];
  let dayState = null;
  let weekState = null;
  try {
    // Descobre qual loja está com sessão ativa no checklist
    let lojaAtiva = null;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('gn_chk_user_')) continue;
      try {
        const u = JSON.parse(localStorage.getItem(key));
        if (u && u.lojaDisplay) { lojaAtiva = u.lojaDisplay; break; }
      } catch (e) {}
    }

    if (lojaAtiva) {
      // Lê somente os dados da loja do usuário logado
      const lojaKey = lojaAtiva.replace(/\s+/g, '_');
      const dayRaw = localStorage.getItem('gn_chk4_day_' + lojaKey);
      const weekRaw = localStorage.getItem('gn_chk4_week_' + lojaKey);
      if (dayRaw) {
        const parsed = JSON.parse(dayRaw);
        if (parsed && parsed.data === today) dayState = parsed;
      }
      if (weekRaw) weekState = JSON.parse(weekRaw);
    } else {
      // Fallback: sem sessão ativa, varre todas as chaves (comportamento anterior)
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (key.startsWith('gn_chk4_day_') && !dayState) {
          const parsed = JSON.parse(localStorage.getItem(key));
          if (parsed && parsed.data === today) dayState = parsed;
        }
        if (key.startsWith('gn_chk4_week_') && !weekState) {
          weekState = JSON.parse(localStorage.getItem(key));
        }
      }
    }
  } catch (e) {}
  return { dayState, weekState, today };
}

function calcChecklistProgress(dayState) {
  if (!dayState) return null;
  let done = 0, total = 0;
  ['checklist', 'abertura', 'fechamento'].forEach(key => {
    const section = dayState[key] || {};
    Object.values(section).forEach(setor => {
      Object.values(setor).forEach(item => {
        total++;
        if (item.checked) done++;
      });
    });
  });
  return total > 0 ? Math.round((done / total) * 100) : null;
}

function LiveIndicators() {
  const [data, setData] = useState(null);

  useEffect(() => {
    const { dayState, weekState } = readChecklistData();
    if (!dayState && !weekState) return;
    const fat = (parseFloat(dayState?.vendaSalao) || 0) + (parseFloat(dayState?.vendaDelivery) || 0);
    const fatSemanal = weekState?.fat
      ? ['seg','ter','qua','qui','sex','sab','dom'].reduce((acc, d) => acc + (parseFloat(weekState.fat[d]) || 0), 0)
      : 0;
    const meta = parseFloat(weekState?.metaSemanal) || 0;
    const faltasUrgentes = (dayState?.faltas || []).filter(f => f.urgencia === 'Alta' && f.nome?.trim()).length;
    const manutPendentes = (dayState?.manutencao || []).filter(m => m.status !== 'Resolvido').length;
    const checkPct = calcChecklistProgress(dayState);
    const loja = dayState?.semanaInicio ? null : null;
    setData({ fat, fatSemanal, meta, faltasUrgentes, manutPendentes, checkPct });
  }, []);

  if (!data) return null;

  const { fat, fatSemanal, meta, faltasUrgentes, manutPendentes, checkPct } = data;
  const metaPct = meta > 0 ? Math.min(100, Math.round((fatSemanal / meta) * 100)) : null;
  const metaColor = metaPct === null ? '#E8580A' : metaPct >= 100 ? '#22C55E' : metaPct >= 70 ? '#E8580A' : '#EF4444';

  return (
    <div className="kpi-strip">
      <div className="kpi-card-sm">
        <div className="kpi-label-sm">💰 Faturamento Hoje</div>
        <div className="kpi-value-sm" style={{ color: '#E8580A' }}>{fmtR(fat)}</div>
      </div>
      <div className="kpi-card-sm">
        <div className="kpi-label-sm">📅 Faturamento Semana</div>
        <div className="kpi-value-sm" style={{ color: '#14B8A6' }}>{fmtR(fatSemanal)}</div>
        {metaPct !== null && (
          <div className="kpi-meta-bar">
            <div className="kpi-meta-fill" style={{ width: metaPct + '%', background: metaColor }} />
          </div>
        )}
        {metaPct !== null && (
          <div className="kpi-meta-label" style={{ color: metaColor }}>{metaPct}% da meta</div>
        )}
      </div>
      {faltasUrgentes > 0 && (
        <a href="/gn-checklist.html" className="kpi-card-sm kpi-alert">
          <div className="kpi-label-sm">🍎 Insumos Urgentes</div>
          <div className="kpi-value-sm" style={{ color: '#EF4444' }}>{faltasUrgentes} item{faltasUrgentes > 1 ? 'ns' : ''}</div>
        </a>
      )}
      {manutPendentes > 0 && (
        <a href="/gn-checklist.html" className="kpi-card-sm kpi-alert">
          <div className="kpi-label-sm">🔧 Manutenção Pendente</div>
          <div className="kpi-value-sm" style={{ color: '#EAB308' }}>{manutPendentes} item{manutPendentes > 1 ? 'ns' : ''}</div>
        </a>
      )}
      {checkPct !== null && (
        <div className="kpi-card-sm">
          <div className="kpi-label-sm">✅ Check-list</div>
          <div className="kpi-value-sm" style={{ color: checkPct === 100 ? '#22C55E' : '#E8580A' }}>{checkPct}%</div>
          <div className="kpi-meta-bar">
            <div className="kpi-meta-fill" style={{ width: checkPct + '%', background: checkPct === 100 ? '#22C55E' : '#E8580A' }} />
          </div>
        </div>
      )}
    </div>
  );
}

function Dashboard() {
  const [tab, setTab] = useState('resumo');
  const mainApps = apps.filter((app) => MAIN_HREFS.includes(app.href));

  return (
    <div>
      <div className="mobile-home">
        <div className="mobile-topbar">
          <span className="mobile-topbar-title">Visão Geral</span>
          <span className="mobile-topbar-sub">{apps.length} módulos disponíveis</span>
        </div>
        <div className="mobile-tabs">
          <button
            type="button"
            className={`mobile-tab ${tab === 'resumo' ? 'active' : ''}`}
            onClick={() => setTab('resumo')}
          >
            Resumo
          </button>
          <button
            type="button"
            className={`mobile-tab ${tab === 'todos' ? 'active' : ''}`}
            onClick={() => setTab('todos')}
          >
            Todos
          </button>
        </div>
        {tab === 'resumo' && (
          <>
            <LiveIndicators />
            <div className="mobile-grid">
              {mainApps.map((app) => (
                <a key={app.href} href={app.href} className="mobile-card">
                  <span
                    className="mobile-card-icon-wrap"
                    style={{ background: `${ICON_COLORS[app.href]}26` }}
                  >
                    <span className="mobile-card-icon">{app.icon}</span>
                  </span>
                  <span className="mobile-card-label">{app.name.replace('GN ', '')}</span>
                </a>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="page-header">
        <h2>Seus Apps</h2>
        <p>{apps.length} módulos disponíveis</p>
      </div>

      <div className="desktop-only">
        <LiveIndicators />
      </div>

      <div className={`cards-grid ${tab === 'resumo' ? 'mobile-only-hide' : ''}`}>
        {apps.map((app) => (
          <a key={app.href} href={app.href} className="card-link">
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div className="card-icon">{app.icon}</div>
                <span style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: 20,
                  background: 'rgba(232, 88, 10, 0.1)',
                  color: '#E8580A',
                  letterSpacing: '0.3px',
                  textTransform: 'uppercase',
                }}>
                  {app.tag}
                </span>
              </div>
              <h3>{app.name}</h3>
              <p>{app.description}</p>
              <div className="card-arrow">→</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

export default Dashboard;
