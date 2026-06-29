import React, { useState } from 'react';

const initialLists = [
  {
    id: 1,
    titulo: 'Abertura de Loja',
    items: [
      { id: 1, texto: 'Ligar luzes e ar condicionado', feito: false },
      { id: 2, texto: 'Verificar caixa inicial', feito: false },
      { id: 3, texto: 'Conferir estoque vitrine', feito: false },
      { id: 4, texto: 'Limpar balcões', feito: false },
      { id: 5, texto: 'Ligar sistema de vendas', feito: false },
    ],
  },
  {
    id: 2,
    titulo: 'Fechamento de Loja',
    items: [
      { id: 1, texto: 'Fechar caixa e conferir valores', feito: false },
      { id: 2, texto: 'Desligar equipamentos', feito: false },
      { id: 3, texto: 'Verificar portas e janelas', feito: false },
      { id: 4, texto: 'Ativar alarme', feito: false },
    ],
  },
  {
    id: 3,
    titulo: 'Limpeza Semanal',
    items: [
      { id: 1, texto: 'Limpar vidros e espelhos', feito: false },
      { id: 2, texto: 'Organizar depósito', feito: false },
      { id: 3, texto: 'Verificar validade dos produtos', feito: false },
    ],
  },
];

function Checklist() {
  const [lists, setLists] = useState(initialLists);
  const [showModal, setShowModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [selectedList, setSelectedList] = useState(null);
  const [newListTitle, setNewListTitle] = useState('');
  const [newItemText, setNewItemText] = useState('');

  const toggleItem = (listId, itemId) => {
    setLists(
      lists.map((list) =>
        list.id === listId
          ? {
              ...list,
              items: list.items.map((item) =>
                item.id === itemId ? { ...item, feito: !item.feito } : item
              ),
            }
          : list
      )
    );
  };

  const addList = () => {
    if (!newListTitle.trim()) return;
    setLists([...lists, { id: Date.now(), titulo: newListTitle, items: [] }]);
    setNewListTitle('');
    setShowModal(false);
  };

  const deleteList = (id) => {
    setLists(lists.filter((l) => l.id !== id));
  };

  const openAddItem = (listId) => {
    setSelectedList(listId);
    setNewItemText('');
    setShowItemModal(true);
  };

  const addItem = () => {
    if (!newItemText.trim() || !selectedList) return;
    setLists(
      lists.map((list) =>
        list.id === selectedList
          ? {
              ...list,
              items: [...list.items, { id: Date.now(), texto: newItemText, feito: false }],
            }
          : list
      )
    );
    setNewItemText('');
    setShowItemModal(false);
  };

  const deleteItem = (listId, itemId) => {
    setLists(
      lists.map((list) =>
        list.id === listId
          ? { ...list, items: list.items.filter((item) => item.id !== itemId) }
          : list
      )
    );
  };

  const resetList = (listId) => {
    setLists(
      lists.map((list) =>
        list.id === listId
          ? { ...list, items: list.items.map((item) => ({ ...item, feito: false })) }
          : list
      )
    );
  };

  const getProgress = (items) => {
    if (items.length === 0) return 0;
    return Math.round((items.filter((i) => i.feito).length / items.length) * 100);
  };

  return (
    <div>
      <div className="page-header">
        <h2>Check-list</h2>
        <p>Listas de verificação para processos e tarefas</p>
      </div>

      <div className="toolbar">
        <div />
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + Nova Lista
        </button>
      </div>

      <div className="cards-grid">
        {lists.map((list) => {
          const progress = getProgress(list.items);
          return (
            <div key={list.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
                <h3>{list.titulo}</h3>
                <span className={`badge ${progress === 100 ? 'badge-green' : progress > 0 ? 'badge-yellow' : 'badge-blue'}`}>
                  {progress}%
                </span>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ height: 4, background: '#2a2a4a', borderRadius: 2, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${progress}%`,
                      background: progress === 100 ? '#28a745' : '#e94560',
                      borderRadius: 2,
                      transition: 'width 0.3s',
                    }}
                  />
                </div>
              </div>

              <ul style={{ listStyle: 'none', marginBottom: 12 }}>
                {list.items.map((item) => (
                  <li
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 0',
                      borderBottom: '1px solid #1f1f3a',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={item.feito}
                      onChange={() => toggleItem(list.id, item.id)}
                      style={{ accentColor: '#e94560', width: 16, height: 16, cursor: 'pointer' }}
                    />
                    <span
                      style={{
                        flex: 1,
                        textDecoration: item.feito ? 'line-through' : 'none',
                        color: item.feito ? '#555' : '#ccc',
                        fontSize: '0.85rem',
                      }}
                    >
                      {item.texto}
                    </span>
                    <button
                      onClick={() => deleteItem(list.id, item.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#555',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                      }}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>

              <div className="actions">
                <button className="btn btn-secondary btn-sm" onClick={() => openAddItem(list.id)}>
                  + Item
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => resetList(list.id)}>
                  Resetar
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => deleteList(list.id)}>
                  Excluir
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Nova Lista</h3>
            <div className="form-group">
              <label>Título da Lista</label>
              <input
                type="text"
                value={newListTitle}
                onChange={(e) => setNewListTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addList()}
              />
            </div>
            <div className="actions">
              <button className="btn btn-primary" onClick={addList}>
                Criar
              </button>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showItemModal && (
        <div className="modal-overlay" onClick={() => setShowItemModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Novo Item</h3>
            <div className="form-group">
              <label>Descrição do Item</label>
              <input
                type="text"
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addItem()}
              />
            </div>
            <div className="actions">
              <button className="btn btn-primary" onClick={addItem}>
                Adicionar
              </button>
              <button className="btn btn-secondary" onClick={() => setShowItemModal(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Checklist;
