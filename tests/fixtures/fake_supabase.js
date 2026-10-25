// Supabase falso pro navegador do sandbox, que não alcança o CDN do supabase-js.
//
// Sem isto, `const db = supabase.createClient(...)` lança na linha 621 do gn-pedidos.html e
// o resto do script inteiro nunca roda. As declarações de função já estão içadas, então
// `typeof renderPedido === 'function'` responde true mesmo assim — a armadilha de sempre.
// Esperar por `S` (um let) é o que prova que o script terminou.
//
// Lê e escreve em window.__DB: { tabela: [linhas] }. window.__DB_ERRO = { tabela: true }
// faz a consulta devolver { data:null, error } — é como se testa falha de rede.
module.exports = function fakeSupabase() {
  const criar = () => {
    function _mk(table) {
      const q = { filtros: [], ordens: [], faixa: null, unico: false };
      const resolver = () => {
        if ((window.__DB_ERRO || {})[table]) return { data: null, error: { message: 'rede caiu' } };
        let rows = ((window.__DB || {})[table] || []).map(r => Object.assign({}, r));
        q.filtros.forEach(f => {
          if (f.op === 'eq') rows = rows.filter(r => String(r[f.col]) === String(f.val));
          else if (f.op === 'in') rows = rows.filter(r => f.val.map(String).indexOf(String(r[f.col])) >= 0);
          else if (f.op === 'gte') rows = rows.filter(r => String(r[f.col]) >= String(f.val));
        });
        if (q.ordens.length) {
          rows.sort((a, b) => {
            for (const o of q.ordens) {
              const x = a[o.col], y = b[o.col];
              if (x === y) continue;
              return (x > y ? 1 : -1) * (o.asc ? 1 : -1);
            }
            return 0;
          });
        }
        if (q.faixa) rows = rows.slice(q.faixa[0], q.faixa[1] + 1);
        return { data: q.unico ? (rows[0] || null) : rows, error: null };
      };
      const api = {
        select() { return api; },
        eq(col, val) { q.filtros.push({ op: 'eq', col, val }); return api; },
        in(col, val) { q.filtros.push({ op: 'in', col, val }); return api; },
        gte(col, val) { q.filtros.push({ op: 'gte', col, val }); return api; },
        order(col, opt) { q.ordens.push({ col, asc: !opt || opt.ascending !== false }); return api; },
        limit() { return api; },
        single() { q.unico = true; return api; },
        range(a, b) { q.faixa = [a, b]; return Promise.resolve(resolver()); },
        insert(linhas) {
          if (!window.__DB[table]) window.__DB[table] = [];
          [].concat(linhas).forEach(l => window.__DB[table].push(Object.assign({ id: 'novo-' + Math.random().toString(36).slice(2, 8) }, l)));
          return api;
        },
        upsert(l) { return api.insert(l); },
        update() { return api; },
        delete() { return api; },
        then(res, rej) { return Promise.resolve(resolver()).then(res, rej); },
      };
      return api;
    }
    return { from: _mk };
  };
  return `window.supabase = { createClient: ${criar.toString()} };
          window.__DB = window.__DB || {}; window.__DB_ERRO = window.__DB_ERRO || {};`;
};
