import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Comissao from './pages/Comissao';
import Checklist from './pages/Checklist';
import Avaliacao from './pages/Avaliacao';
import './App.css';

const navItems = [
  { path: '/', label: 'Dashboard' },
  { path: '/comissao', label: 'Comissão' },
  { path: '/checklist', label: 'Check-list' },
  { path: '/avaliacao', label: 'Avaliação' },
];

const externalApps = [
  { href: '/gn-lojas.html', label: 'GN Lojas' },
  { href: '/gn-estoque.html', label: 'GN Estoque' },
  { href: '/gn-checklist.html', label: 'GN Check-list' },
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
          {navItems.map((item) => (
            <li key={item.path}>
              <Link
                to={item.path}
                className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
              >
                {item.label}
              </Link>
            </li>
          ))}
          <li style={{ padding: '12px 20px 6px', fontSize: '0.7rem', fontWeight: 700, color: '#444', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Apps Completos
          </li>
          {externalApps.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="nav-link"
                style={{ textDecoration: 'none' }}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/comissao" element={<Comissao />} />
          <Route path="/checklist" element={<Checklist />} />
          <Route path="/avaliacao" element={<Avaliacao />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
