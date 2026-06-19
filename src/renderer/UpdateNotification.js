import React, { useState, useEffect } from 'react';
import './UpdateNotification.css';

function UpdateNotification() {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return;

    const cleanup = window.electronAPI.onUpdateStatus((data) => {
      setUpdateInfo(data);
      if (data.status === 'available' || data.status === 'downloaded') {
        setDismissed(false);
      }
    });

    return cleanup;
  }, []);

  if (!updateInfo || dismissed) return null;

  const handleCheckUpdates = () => {
    if (window.electronAPI) {
      window.electronAPI.checkForUpdates();
    }
  };

  const handleDownload = () => {
    if (window.electronAPI) {
      window.electronAPI.downloadUpdate();
    }
  };

  const handleInstall = () => {
    if (window.electronAPI) {
      window.electronAPI.installUpdate();
    }
  };

  const renderContent = () => {
    switch (updateInfo.status) {
      case 'checking':
        return (
          <div className="update-content">
            <span className="update-spinner" />
            <span>Verificando atualizações...</span>
          </div>
        );

      case 'available':
        return (
          <div className="update-content">
            <div>
              <strong>Nova versão disponível: v{updateInfo.version}</strong>
              <p>Deseja baixar a atualização?</p>
            </div>
            <div className="update-actions">
              <button className="btn-primary" onClick={handleDownload}>
                Baixar
              </button>
              <button className="btn-secondary" onClick={() => setDismissed(true)}>
                Depois
              </button>
            </div>
          </div>
        );

      case 'downloading':
        return (
          <div className="update-content">
            <div className="download-progress">
              <span>Baixando atualização... {updateInfo.percent}%</span>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${updateInfo.percent}%` }}
                />
              </div>
            </div>
          </div>
        );

      case 'downloaded':
        return (
          <div className="update-content">
            <div>
              <strong>Atualização v{updateInfo.version} pronta!</strong>
              <p>Reinicie o app para aplicar.</p>
            </div>
            <div className="update-actions">
              <button className="btn-primary" onClick={handleInstall}>
                Reiniciar e Atualizar
              </button>
              <button className="btn-secondary" onClick={() => setDismissed(true)}>
                Depois
              </button>
            </div>
          </div>
        );

      case 'up-to-date':
        return (
          <div className="update-content">
            <span>Você está na versão mais recente!</span>
            <button className="btn-secondary" onClick={() => setDismissed(true)}>
              OK
            </button>
          </div>
        );

      case 'error':
        return (
          <div className="update-content update-error">
            <span>Erro ao verificar atualizações.</span>
            <div className="update-actions">
              <button className="btn-secondary" onClick={handleCheckUpdates}>
                Tentar novamente
              </button>
              <button className="btn-secondary" onClick={() => setDismissed(true)}>
                Fechar
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return <div className="update-notification">{renderContent()}</div>;
}

export default UpdateNotification;
