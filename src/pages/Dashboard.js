import React from 'react';
import { Link } from 'react-router-dom';

const apps = [
  {
    path: '/estoque',
    name: 'GE Estoque',
    description: 'Controle de estoque com entrada, saída e alertas de quantidade mínima.',
    icon: '📦',
    color: '#e94560',
  },
  {
    path: '/comissao',
    name: 'Comissão',
    description: 'Cálculo e acompanhamento de comissões de vendedores.',
    icon: '💰',
    color: '#28a745',
  },
  {
    path: '/checklist',
    name: 'Check-list',
    description: 'Listas de verificação para processos e tarefas do dia a dia.',
    icon: '✅',
    color: '#007bff',
  },
  {
    path: '/avaliacao',
    name: 'Avaliação',
    description: 'Avaliações de desempenho e pesquisas de satisfação.',
    icon: '⭐',
    color: '#ffc107',
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
        {apps.map((app) => (
          <Link key={app.path} to={app.path} className="card-link">
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
