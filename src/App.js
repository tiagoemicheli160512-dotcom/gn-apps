import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import './App.css';

const apps = [
  { href: '/gn-lojas.html', label: 'GN Lojas', icon: '🏪' },
  { href: '/gn-estoque.html', label: 'GN Estoque', icon: '📦' },
  { href: '/gn-checklist.html', label: 'GN Check-list', icon: '✅' },
  { href: '/gn-comissoes.html', label: 'GN Comissões', icon: '💰' },
  { href: '/gn-comissoes-mestra.html', label: 'GN Com. Mestra', icon: '👑' },
  { href: '/gn-avaliacoes.html', label: 'GN Avaliações', icon: '⭐' },
  { href: '/gn-usuarios.html', label: 'GN Usuários', icon: '👤' },
];

function App() {
  const location = useLocation();

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="sidebar-header">
          <h1>GN Apps</h1>
        </div>
        <ul className="nav-list">
          <li>
            <Link
              to="/"
              className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
            >
              Dashboard
            </Link>
          </li>
          <li className="nav-section-label">Aplicativos</li>
          {apps.map((item) => (
            <li key={item.href}>
              <a href={item.href} className="nav-link" style={{ textDecoration: 'none' }}>
                <span style={{ fontSize: '1rem' }}>{item.icon}</span>
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
        </Routes>
      </main>

      <nav className="mobile-bottom-nav">
        <a href="/gn-comissoes.html" className="mobile-nav-item">
          <span className="mobile-nav-icon">💰</span>
          <span className="mobile-nav-label">Comissões</span>
        </a>
        <a href="/gn-comissoes-mestra.html" className="mobile-nav-item">
          <span className="mobile-nav-icon">👑</span>
          <span className="mobile-nav-label">Mestra</span>
        </a>
        <a href="/gn-usuarios.html" className="mobile-nav-item mobile-nav-fab-wrap">
          <span className="mobile-nav-fab">⚙️</span>
          <span className="mobile-nav-label">Ajustes</span>
        </a>
      </nav>
    </div>
  );
}

export default App;
