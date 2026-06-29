import React from 'react';

const apps = [
  {
    href: '/gn-lojas.html',
    name: 'GN Lojas',
    description: 'Gestão completa de lojas: pedidos, estoque, vendas, conferência e relatórios.',
    icon: '🏪',
  },
  {
    href: '/gn-estoque.html',
    name: 'GN Estoque',
    description: 'Controle de estoque com pedidos, fichas técnicas, vendas e conferência semanal.',
    icon: '📦',
  },
  {
    href: '/gn-checklist.html',
    name: 'GN Check-list Operacional',
    description: 'Check-list operacional para abertura, fechamento e processos das lojas.',
    icon: '✅',
  },
  {
    href: '/gn-comissoes.html',
    name: 'GN Comissões 2026',
    description: 'Cálculo e acompanhamento de comissões dos vendedores.',
    icon: '💰',
  },
  {
    href: '/gn-comissoes-mestra.html',
    name: 'GN Comissões — MESTRA',
    description: 'Painel mestre de comissões com visão consolidada.',
    icon: '👑',
  },
  {
    href: '/gn-avaliacoes.html',
    name: 'GN Avaliação de Desempenho',
    description: 'Avaliações de desempenho dos colaboradores.',
    icon: '⭐',
  },
];

function Dashboard() {
  return (
    <div>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Bem-vindo ao GN Apps - Selecione um módulo</p>
      </div>

      <div className="cards-grid">
        {apps.map((app) => (
          <a
            key={app.href}
            href={app.href}
            className="card-link"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div className="card">
              <div className="card-icon">{app.icon}</div>
              <h3>{app.name}</h3>
              <p>{app.description}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

export default Dashboard;
