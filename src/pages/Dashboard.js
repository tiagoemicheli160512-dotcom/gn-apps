import React from 'react';
import { Link } from 'react-router-dom';

const reactApps = [
  {
    path: '/comissao',
    name: 'Comissão',
    description: 'Cálculo e acompanhamento de comissões de vendedores.',
    icon: '💰',
  },
  {
    path: '/checklist',
    name: 'Check-list',
    description: 'Listas de verificação para processos e tarefas do dia a dia.',
    icon: '✅',
  },
  {
    path: '/avaliacao',
    name: 'Avaliação',
    description: 'Avaliações de desempenho e pesquisas de satisfação.',
    icon: '⭐',
  },
];

const standaloneApps = [
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
];

function Dashboard() {
  return (
    <div>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Bem-vindo ao GN Apps - Selecione um módulo para começar</p>
      </div>

      <div className="cards-grid">
        {standaloneApps.map((app) => (
          <a
            key={app.href}
            href={app.href}
            className="card-link"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div className="card" style={{ borderColor: 'rgba(233, 69, 96, 0.3)' }}>
              <div className="card-icon">{app.icon}</div>
              <h3>{app.name}</h3>
              <p>{app.description}</p>
              <span
                style={{
                  display: 'inline-block',
                  marginTop: 12,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: 12,
                  background: 'rgba(233, 69, 96, 0.15)',
                  color: '#e94560',
                }}
              >
                App Completo
              </span>
            </div>
          </a>
        ))}

        {reactApps.map((app) => (
          <Link key={app.path} to={app.path} className="card-link" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="card">
              <div className="card-icon">{app.icon}</div>
              <h3>{app.name}</h3>
              <p>{app.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default Dashboard;
