import React, { useState } from 'react';

const initialProducts = [
  { id: 1, nome: 'Papel A4 (resma)', categoria: 'Escritório', quantidade: 150, minimo: 50, preco: 24.90 },
  { id: 2, nome: 'Caneta esferográfica', categoria: 'Escritório', quantidade: 300, minimo: 100, preco: 2.50 },
  { id: 3, nome: 'Toner impressora', categoria: 'Informática', quantidade: 8, minimo: 5, preco: 189.00 },
  { id: 4, nome: 'Mouse USB', categoria: 'Informática', quantidade: 25, minimo: 10, preco: 35.00 },
  { id: 5, nome: 'Café 500g', categoria: 'Copa', quantidade: 12, minimo: 5, preco: 18.90 },
];

function Estoque() {
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ nome: '', categoria: '', quantidade: '', minimo: '', preco: '' });

  const filtered = products.filter(
    (p) =>
      p.nome.toLowerCase().includes(search.toLowerCase()) ||
      p.categoria.toLowerCase().includes(search.toLowerCase())
  );

  const totalItems = products.reduce((sum, p) => sum + p.quantidade, 0);
  const lowStock = products.filter((p) => p.quantidade <= p.minimo).length;
  const totalValue = products.reduce((sum, p) => sum + p.quantidade * p.preco, 0);

  const openAdd = () => {
    setForm({ nome: '', categoria: '', quantidade: '', minimo: '', preco: '' });
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (product) => {
    setForm({
      nome: product.nome,
      categoria: product.categoria,
      quantidade: String(product.quantidade),
      minimo: String(product.minimo),
      preco: String(product.preco),
    });
    setEditingId(product.id);
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.nome || !form.categoria) return;
    const data = {
      nome: form.nome,
      categoria: form.categoria,
      quantidade: Number(form.quantidade) || 0,
      minimo: Number(form.minimo) || 0,
      preco: Number(form.preco) || 0,
    };

    if (editingId) {
      setProducts(products.map((p) => (p.id === editingId ? { ...p, ...data } : p)));
    } else {
      setProducts([...products, { id: Date.now(), ...data }]);
    }
    setShowModal(false);
  };

  const handleDelete = (id) => {
    setProducts(products.filter((p) => p.id !== id));
  };

  return (
    <div>
      <div className="page-header">
        <h2>GE Estoque</h2>
        <p>Controle de entrada e saída de produtos</p>
      </div>

      <div className="cards-grid">
        <div className="card">
          <div className="stat-value">{totalItems}</div>
          <div className="stat-label">Itens em estoque</div>
        </div>
        <div className="card">
          <div className="stat-value" style={{ color: lowStock > 0 ? '#dc3545' : '#28a745' }}>
            {lowStock}
          </div>
          <div className="stat-label">Estoque baixo</div>
        </div>
        <div className="card">
          <div className="stat-value" style={{ color: '#28a745' }}>
            R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <div className="stat-label">Valor total</div>
        </div>
      </div>

      <div className="toolbar">
        <input
          type="text"
          className="search-input"
          placeholder="Buscar produto ou categoria..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn btn-primary" onClick={openAdd}>
          + Novo Produto
        </button>
      </div>

      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Categoria</th>
              <th>Qtd</th>
              <th>Mínimo</th>
              <th>Preço</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id}>
                <td>{p.nome}</td>
                <td>{p.categoria}</td>
                <td>{p.quantidade}</td>
                <td>{p.minimo}</td>
                <td>R$ {p.preco.toFixed(2)}</td>
                <td>
                  {p.quantidade <= p.minimo ? (
                    <span className="badge badge-red">Baixo</span>
                  ) : p.quantidade <= p.minimo * 2 ? (
                    <span className="badge badge-yellow">Atenção</span>
                  ) : (
                    <span className="badge badge-green">OK</span>
                  )}
                </td>
                <td>
                  <div className="actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(p)}>
                      Editar
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingId ? 'Editar Produto' : 'Novo Produto'}</h3>
            <div className="form-group">
              <label>Nome do Produto</label>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Categoria</label>
              <input
                type="text"
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Quantidade</label>
              <input
                type="number"
                value={form.quantidade}
                onChange={(e) => setForm({ ...form, quantidade: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Quantidade Mínima</label>
              <input
                type="number"
                value={form.minimo}
                onChange={(e) => setForm({ ...form, minimo: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Preço Unitário (R$)</label>
              <input
                type="number"
                step="0.01"
                value={form.preco}
                onChange={(e) => setForm({ ...form, preco: e.target.value })}
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
    </div>
  );
}

export default Estoque;
