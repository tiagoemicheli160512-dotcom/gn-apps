import React, { useState, useEffect } from 'react';
import UpdateNotification from './renderer/UpdateNotification';
import './App.css';

const LOJAS = [
  { id: 'estoque', nome: 'Estoque Geral', arquivo: 'lojas/estoque.html', cor: '#E8580A' },
  { id: 'caxias', nome: 'Caxias', arquivo: 'lojas/caxias.html', cor: '#ef4444' },
  { id: 'norte-shopping', nome: 'Norte Shopping', arquivo: 'lojas/norte-shopping.html', cor: '#3b82f6' },
  { id: 'sao-goncalo', nome: 'São Gonçalo', arquivo: 'lojas/sao-goncalo.html', cor: '#10b981' },
  { id: 'boulevard', nome: 'Boulevard', arquivo: 'lojas/boulevard.html', cor: '#8b5cf6' },
  { id: 'bangu', nome: 'Bangu', arquivo: 'lojas/bangu.html', cor: '#f59e0b' },
  { id: 'rancho', nome: 'Rancho', arquivo: 'lojas/rancho.html', cor: '#06b6d4' },
  { id: 'pedreira', nome: 'Pedreira', arquivo: 'lojas/pedreira.html', cor: '#ec4899' },
  { id: 'nova-america', nome: 'Nova América', arquivo: 'lojas/nova-america.html', cor: '#14b8a6' },
  { id: 'campo-grande', nome: 'Campo Grande', arquivo: 'lojas/campo-grande.html', cor: '#f97316' },
  { id: 'itaquera', nome: 'Itaquera', arquivo: 'lojas/itaquera.html', cor: '#6366f1' },
  { id: 'guarulhos', nome: 'Guarulhos', arquivo: 'lojas/guarulhos.html', cor: '#84cc16' },
];

function App() {
  const [version, setVersion] = useState('');
  const [lojaAtiva, setLojaAtiva] = useState(null);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getAppVersion().then(setVersion);
    }
  }, []);

  if (lojaAtiva) {
    return (
      <div className="app app-loja">
        <div className="loja-topbar">
          <button className="btn-voltar" onClick={() => setLojaAtiva(null)}>
            &#8249; Voltar
          </button>
          <span className="loja-topbar-nome">
            <span className="loja-topbar-dot" style={{ background: lojaAtiva.cor }} />
            {lojaAtiva.nome}
          </span>
        </div>
        <iframe
          className="loja-iframe"
          src={lojaAtiva.arquivo}
          title={lojaAtiva.nome}
        />
        <UpdateNotification />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>GN Apps</h1>
          <span className="version">v{version || '1.0.0'}</span>
        </div>
        {window.electronAPI && (
          <button className="btn-check-update" onClick={() => window.electronAPI.checkForUpdates()}>
            Verificar atualizações
          </button>
        )}
      </header>

      <main className="app-main">
        <div className="section-label">Selecione uma loja</div>
        <div className="lojas-grid">
          {LOJAS.map((loja) => (
            <button
              key={loja.id}
              className="loja-card"
              onClick={() => setLojaAtiva(loja)}
            >
              <span className="loja-dot" style={{ background: loja.cor }} />
              <div className="loja-info">
                <span className="loja-nome">{loja.nome}</span>
                <span className="loja-sub">GN Estoque</span>
              </div>
              <span className="loja-arrow">&#8250;</span>
            </button>
          ))}
        </div>
      </main>

      <UpdateNotification />
    </div>
  );
}

export default App;
