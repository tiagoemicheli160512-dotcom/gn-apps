import React, { useState } from 'react';

const initialSales = [
  { id: 1, vendedor: 'Carlos Silva', produto: 'Plano Premium', valor: 5000, comissaoPct: 10, data: '2024-12-15' },
  { id: 2, vendedor: 'Ana Souza', produto: 'Plano Básico', valor: 1500, comissaoPct: 8, data: '2024-12-14' },
  { id: 3, vendedor: 'Carlos Silva', produto: 'Serviço Extra', valor: 800, comissaoPct: 12, data: '2024-12-13' },
  { id: 4, vendedor: 'Marcos Lima', produto: 'Plano Premium', valor: 5000, comissaoPct: 10, data: '2024-12-12' },
  { id: 5, vendedor: 'Ana Souza', produto: 'Plano Intermediário', valor: 3000, comissaoPct: 9, data: '2024-12-11' },
];

function Comissao() {
  const [sales, setSales] = useState(initialSales);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ vendedor: '', produto: '', valor: '', comissaoPct: '', data: '' });

  const totalVendas = sales.reduce((sum, s) => sum + s.valor, 0);
  const totalComissoes = sales.reduce((sum, s) => sum + (s.valor * s.comissaoPct) / 100, 0);

  const vendedorStats = sales.reduce((acc, s) => {
    if (!acc[s.vendedor]) {
      acc[s.vendedor] = { vendas: 0, comissao: 0, qtd: 0 };
    }
    acc[s.vendedor].vendas += s.valor;
    acc[s.vendedor].comissao += (s.valor * s.comissaoPct) / 100;
    acc[s.vendedor].qtd += 1;
    return acc;
  }, {});

  const handleSave = () => {
    if (!form.vendedor || !form.produto) return;
    const newSale = {
      id: Date.now(),
      vendedor: form.vendedor,
      produto: form.produto,
      valor: Number(form.valor) || 0,
      comissaoPct: Number(form.comissaoPct) || 0,
      data: form.data || new Date().toISOString().split('T')[0],
    };
    setSales([newSale, ...sales]);
    setShowModal(false);
    setForm({ vendedor: '', produto: '', valor: '', comissaoPct: '', data: '' });
  };

  return (
    <div>
      <div className="page-header">
        <h2>Comissão</h2>
        <p>Gestão de comissões de vendedores</p>
      </div>

      <div className="cards-grid">
        <div className="card">
          <div className="stat-value">
            R$ {totalVendas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <div className="stat-label">Total em Vendas</div>
        </div>
        <div className="card">
          <div className="stat-value" style={{ color: '#28a745' }}>
            R$ {totalComissoes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <div className="stat-label">Total Comissões</div>
        </div>
        <div className="card">
          <div className="stat-value" style={{ color: '#007bff' }}>{sales.length}</div>
          <div className="stat-label">Vendas Registradas</div>
        </div>
      </div>

      <div className="page-header" style={{ marginTop: 12 }}>
        <h2 style={{ fontSize: '1.1rem' }}>Resumo por Vendedor</h2>
      </div>
      <div className="data-table" style={{ marginBottom: 32 }}>
        <table>
          <thead>
            <tr>
              <th>Vendedor</th>
              <th>Vendas</th>
              <th>Total Vendido</th>
              <th>Comissão Total</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(vendedorStats).map(([nome, stats]) => (
              <tr key={nome}>
                <td>{nome}</td>
                <td>{stats.qtd}</td>
                <td>R$ {stats.vendas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td>
                  <span className="badge badge-green">
                    R$ {stats.comissao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="toolbar">
        <h2 style={{ fontSize: '1.1rem' }}>Vendas</h2>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + Nova Venda
        </button>
      </div>

      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Vendedor</th>
              <th>Produto</th>
              <th>Valor</th>
              <th>%</th>
              <th>Comissão</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id}>
                <td>{new Date(s.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td>{s.vendedor}</td>
                <td>{s.produto}</td>
                <td>R$ {s.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td>{s.comissaoPct}%</td>
                <td>
                  <span className="badge badge-green">
                    R$ {((s.valor * s.comissaoPct) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Nova Venda</h3>
            <div className="form-group">
              <label>Vendedor</label>
              <input
                type="text"
                value={form.vendedor}
                onChange={(e) => setForm({ ...form, vendedor: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Produto/Serviço</label>
              <input
                type="text"
                value={form.produto}
                onChange={(e) => setForm({ ...form, produto: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Comissão (%)</label>
              <input
                type="number"
                value={form.comissaoPct}
                onChange={(e) => setForm({ ...form, comissaoPct: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Data</label>
              <input
                type="date"
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
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

export default Comissao;
