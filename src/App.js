import React, { useState, useEffect } from 'react';
import UpdateNotification from './renderer/UpdateNotification';
import './App.css';

function App() {
  const [version, setVersion] = useState('');

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getAppVersion().then(setVersion);
    }
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>GN Apps</h1>
        <p className="version">v{version || '1.0.0'}</p>
      </header>

      <main className="app-main">
        <div className="welcome-card">
          <h2>Bem-vindo ao GN Apps</h2>
          <p>
            Este aplicativo possui atualizações automáticas online.
            Quando uma nova versão estiver disponível, você será notificado.
          </p>
        </div>
      </main>

      <UpdateNotification />
    </div>
  );
}

export default App;
