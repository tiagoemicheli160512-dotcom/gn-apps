import React from 'react';

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
];

function Dashboard() {
  return (
    <div>
      <div className="page-header">
        <h2>Seus Apps</h2>
        <p>{apps.length} módulos disponíveis</p>
      </div>

      <div className="cards-grid">
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
