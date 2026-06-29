import React, { useState } from 'react';

const initialAvaliacoes = [
  {
    id: 1,
    colaborador: 'Carlos Silva',
    cargo: 'Vendedor',
    data: '2024-12-15',
    pontualidade: 5,
    proatividade: 4,
    trabalhoEquipe: 5,
    qualidade: 4,
    comunicacao: 3,
    observacoes: 'Excelente desempenho em vendas este mês.',
  },
  {
    id: 2,
    colaborador: 'Ana Souza',
    cargo: 'Atendente',
    data: '2024-12-14',
    pontualidade: 5,
    proatividade: 5,
    trabalhoEquipe: 4,
    qualidade: 5,
    comunicacao: 5,
    observacoes: 'Destaque no atendimento ao cliente.',
  },
  {
    id: 3,
    colaborador: 'Marcos Lima',
    cargo: 'Estoquista',
    data: '2024-12-13',
    pontualidade: 3,
    proatividade: 3,
    trabalhoEquipe: 4,
    qualidade: 4,
    comunicacao: 3,
    observacoes: 'Precisa melhorar pontualidade.',
  },
];

const criterios = [
  { key: 'pontualidade', label: 'Pontualidade' },
  { key: 'proatividade', label: 'Proatividade' },
  { key: 'trabalhoEquipe', label: 'Trabalho em Equipe' },
  { key: 'qualidade', label: 'Qualidade do Trabalho' },
  { key: 'comunicacao', label: 'Comunicação' },
];

function getMedia(av) {
  const soma = criterios.reduce((sum, c) => sum + (av[c.key] || 0), 0);
  return (soma / criterios.length).toFixed(1);
}

function getMediaBadge(media) {
  const n = parseFloat(media);
  if (n >= 4.5) return 'badge-green';
  if (n >= 3) return 'badge-yellow';
  return 'badge-red';
}

function StarRating({ value, onChange, readonly }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          onClick={() => !readonly && onChange(star)}
          style={{
            cursor: readonly ? 'default' : 'pointer',
            fontSize: '1.3rem',
            color: star <= value ? '#ffc107' : '#333',
            transition: 'color 0.2s',
          }}
        >
          ★
        </span>
      ))}
    </div>
  );
}

function Avaliacao() {
  const [avaliacoes, setAvaliacoes] = useState(initialAvaliacoes);
  const [showModal, setShowModal] = useState(false);
  const [viewingId, setViewingId] = useState(null);
  const [form, setForm] = useState({
    colaborador: '',
    cargo: '',
    pontualidade: 0,
    proatividade: 0,
    trabalhoEquipe: 0,
    qualidade: 0,
    comunicacao: 0,
    observacoes: '',
  });

  const mediaGeral =
    avaliacoes.length > 0
      ? (avaliacoes.reduce((sum, a) => sum + parseFloat(getMedia(a)), 0) / avaliacoes.length).toFixed(1)
      : '0.0';

  const handleSave = () => {
    if (!form.colaborador || !form.cargo) return;
    const newAv = {
      id: Date.now(),
      ...form,
      data: new Date().toISOString().split('T')[0],
    };
    setAvaliacoes([newAv, ...avaliacoes]);
    setShowModal(false);
    setForm({
      colaborador: '',
      cargo: '',
      pontualidade: 0,
      proatividade: 0,
      trabalhoEquipe: 0,
      qualidade: 0,
      comunicacao: 0,
      observacoes: '',
    });
  };

  const viewing = viewingId ? avaliacoes.find((a) => a.id === viewingId) : null;

  return (
    <div>
      <div className="page-header">
        <h2>Avaliação</h2>
        <p>Avaliações de desempenho dos colaboradores</p>
      </div>

      <div className="cards-grid">
        <div className="card">
          <div className="stat-value">{avaliacoes.length}</div>
          <div className="stat-label">Avaliações Realizadas</div>
        </div>
        <div className="card">
          <div className="stat-value" style={{ color: '#ffc107' }}>{mediaGeral}</div>
          <div className="stat-label">Média Geral</div>
        </div>
        <div className="card">
          <div className="stat-value" style={{ color: '#28a745' }}>
            {avaliacoes.filter((a) => parseFloat(getMedia(a)) >= 4.5).length}
          </div>
          <div className="stat-label">Destaques</div>
        </div>
      </div>

      <div className="toolbar">
        <div />
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + Nova Avaliação
        </button>
      </div>

      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Colaborador</th>
              <th>Cargo</th>
              {criterios.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              <th>Média</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {avaliacoes.map((av) => {
              const media = getMedia(av);
              return (
                <tr key={av.id}>
                  <td>{new Date(av.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                  <td>{av.colaborador}</td>
                  <td>{av.cargo}</td>
                  {criterios.map((c) => (
                    <td key={c.key}>
                      <span style={{ color: '#ffc107' }}>{'★'.repeat(av[c.key])}</span>
                      <span style={{ color: '#333' }}>{'★'.repeat(5 - av[c.key])}</span>
                    </td>
                  ))}
                  <td>
                    <span className={`badge ${getMediaBadge(media)}`}>{media}</span>
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setViewingId(av.id)}
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Nova Avaliação</h3>
            <div className="form-group">
              <label>Colaborador</label>
              <input
                type="text"
                value={form.colaborador}
                onChange={(e) => setForm({ ...form, colaborador: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Cargo</label>
              <input
                type="text"
                value={form.cargo}
                onChange={(e) => setForm({ ...form, cargo: e.target.value })}
              />
            </div>
            {criterios.map((c) => (
              <div className="form-group" key={c.key}>
                <label>{c.label}</label>
                <StarRating
                  value={form[c.key]}
                  onChange={(val) => setForm({ ...form, [c.key]: val })}
                />
              </div>
            ))}
            <div className="form-group">
              <label>Observações</label>
              <textarea
                rows={3}
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
            </div>
            <div className="actions">
              <button className="btn btn-primary" onClick={handleSave}>
                Salvar
              </button>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {viewing && (
        <div className="modal-overlay" onClick={() => setViewingId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Avaliação - {viewing.colaborador}</h3>
            <p style={{ color: '#666', marginBottom: 16, fontSize: '0.85rem' }}>
              {viewing.cargo} | {new Date(viewing.data + 'T12:00:00').toLocaleDateString('pt-BR')}
            </p>
            {criterios.map((c) => (
              <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1f1f3a' }}>
                <span style={{ color: '#aaa', fontSize: '0.9rem' }}>{c.label}</span>
                <StarRating value={viewing[c.key]} readonly />
              </div>
            ))}
            <div style={{ marginTop: 16, padding: '12px 0', borderTop: '1px solid #2a2a4a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>Média</span>
              <span className={`badge ${getMediaBadge(getMedia(viewing))}`} style={{ fontSize: '1rem', padding: '6px 14px' }}>
                {getMedia(viewing)}
              </span>
            </div>
            {viewing.observacoes && (
              <div style={{ marginTop: 16 }}>
                <label style={{ color: '#888', fontSize: '0.85rem', display: 'block', marginBottom: 6 }}>Observações</label>
                <p style={{ color: '#ccc', fontSize: '0.9rem', lineHeight: 1.5 }}>{viewing.observacoes}</p>
              </div>
            )}
            <div className="actions" style={{ marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setViewingId(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Avaliacao;
