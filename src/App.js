import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Estoque from './pages/Estoque';
import Comissao from './pages/Comissao';
import Checklist from './pages/Checklist';
import Avaliacao from './pages/Avaliacao';
import './App.css';

const navItems = [
  { path: '/', label: 'Dashboard' },
  { path: '/estoque', label: 'GE Estoque' },
  { path: '/comissao', label: 'Comissão' },
  { path: '/checklist', label: 'Check-list' },
  { path: '/avaliacao', label: 'Avaliação' },
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
        </ul>
      </nav>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/estoque" element={<Estoque />} />
          <Route path="/comissao" element={<Comissao />} />
          <Route path="/checklist" element={<Checklist />} />
          <Route path="/avaliacao" element={<Avaliacao />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
