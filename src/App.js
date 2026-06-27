import React, { useState, useEffect } from 'react';
import UpdateNotification from './renderer/UpdateNotification';
import './App.css';

const isElectron = !!window.electronAPI;

function App() {
  const [version, setVersion] = useState('');

  useEffect(() => {
    if (isElectron) {
      window.electronAPI.getAppVersion().then(setVersion);
    }
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>GN Apps</h1>
        <p className="version">
          {isElectron ? `v${version || '1.0.0'}` : 'Web'}
        </p>
      </header>

      <main className="app-main">
        <div className="welcome-card">
          <h2>Bem-vindo ao GN Apps</h2>
          {isElectron ? (
            <p>
              Este aplicativo possui atualizações automáticas online.
              Quando uma nova versão estiver disponível, você será notificado.
            </p>
          ) : (
            <p>
              Você está acessando a versão web do GN Apps.
              Para a experiência completa com atualizações automáticas,
              baixe a versão desktop.
            </p>
          )}
        </div>
      </main>

      {isElectron && <UpdateNotification />}
    </div>
  );
}

export default App;
