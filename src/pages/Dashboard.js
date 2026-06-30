import React, { useState } from 'react';

const MAIN_HREFS = ['/gn-lojas.html', '/gn-estoque.html', '/gn-checklist.html', '/gn-avaliacoes.html'];

const ICON_COLORS = {
  '/gn-lojas.html': '#E8580A',
  '/gn-estoque.html': '#D97706',
  '/gn-checklist.html': '#22C55E',
  '/gn-avaliacoes.html': '#EAB308',
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
        )}
      </div>

      <div className="page-header">
        <h2>Seus Apps</h2>
        <p>{apps.length} módulos disponíveis</p>
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
