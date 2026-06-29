import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import './App.css';

const apps = [
  { href: '/gn-lojas.html', label: 'GN Lojas' },
  { href: '/gn-estoque.html', label: 'GN Estoque' },
  { href: '/gn-checklist.html', label: 'GN Check-list' },
  { href: '/gn-comissoes.html', label: 'GN Comissões' },
  { href: '/gn-comissoes-mestra.html', label: 'GN Com. Mestra' },
  { href: '/gn-avaliacoes.html', label: 'GN Avaliações' },
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
          {apps.map((item) => (
            <li key={item.href}>
              <a href={item.href} className="nav-link" style={{ textDecoration: 'none' }}>
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
    </div>
  );
}

export default App;
