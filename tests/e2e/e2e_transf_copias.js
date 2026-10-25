// "No app lojas, nas transferências, tem item que foi marcado já pelos dois lados e que não
//  saiu, e no Nova América um barril de chopp de vinho que ao clicar em Recebi não acontece
//  nada, mas aparece um card laranja dizendo que já foi feito pelos dois lados."
//
// Estado REAL do banco (id msvvi8f0652, BARRIL CHOPP DE VINHO, NOVA AMERICA → BOULEVARD):
//   linha NOVA AMERICA, chave "NOVA AMERICA|2026-08-10" → co=true  cd=true  quitado=true
//   linha BOULEVARD,    chave "BOULEVARD|2026-08-10"    → co=false cd=false quitado=false
//   linha BANGU,        chave "BOULEVARD|2026-08-10"    → co=false cd=false quitado=false
//
// Um empréstimo mora em DUAS chaves de transferAll (origem|semana e destino|semana) e cada
// chave é mesclada isoladamente, então as cópias podem discordar. Com elas discordando, a
// TELA lia a primeira cópia da varredura (aberta) e o BOTÃO agia sobre a última (quitada):
// o card ficava pra sempre e o clique respondia "já quitado".
//
// O teste roda o mesmo cenário contra o arquivo em produção (ARQ_LOJAS=.../mainpub/...) pra
// provar que lá ele falha, e contra o corrigido pra provar que passa.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS_APP = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const BARRIL = {
  id: 'msvvi8f0652', qtd: 1, data: '2026-08-16T14:01:25.788Z', fator: 1,
  insumo: 'BARRIL CHOPP DE VINHO', motivo: 'Não foi entregue ',
  origem: 'NOVA AMERICA', destino: 'BOULEVARD', unidade: 'UN', qtdOriginal: 1,
  quitado: false, dataQuitacao: null,
  confirmadoOrigem: false, confirmadoDestino: false,
  pagDinheiroOrigem: false, pagDinheiroDestino: false,
};
const copia = (o) => Object.assign(JSON.parse(JSON.stringify(BARRIL)), o || {});

// Linhas na ordem em que o Postgres devolve hoje (sem order by): BANGU antes de NOVA AMERICA.
// A ordem importa — é ela que decide qual cópia a varredura encontra primeiro.
const CENARIO_BARRIL = [
  { loja: 'BANGU',        transferAll: { 'BOULEVARD|2026-08-10': [copia()] } },
  { loja: 'BOULEVARD',    transferAll: { 'BOULEVARD|2026-08-10': [copia()] } },
  { loja: 'NOVA AMERICA', transferAll: { 'NOVA AMERICA|2026-08-10': [copia({
      quitado: true, dataQuitacao: '2026-08-27T18:24:35.227Z',
      confirmadoOrigem: true, confirmadoDestino: true })] } },
];

// Mesmo empréstimo, ainda aberto, mas só o DESTINO já confirmou — e a cópia atrasada
// (toda false) é a que a varredura acha primeiro.
const CENARIO_DESTINO_CONFIRMOU = [
  { loja: 'BANGU',        transferAll: { 'BOULEVARD|2026-08-10': [copia()] } },
  { loja: 'BOULEVARD',    transferAll: { 'BOULEVARD|2026-08-10': [copia({ confirmadoDestino: true })] } },
  { loja: 'NOVA AMERICA', transferAll: { 'NOVA AMERICA|2026-08-10': [copia()] } },
];

// Empréstimo normal, cópias de acordo — a regressão que não pode quebrar.
const CENARIO_NORMAL = [
  { loja: 'BOULEVARD',    transferAll: { 'BOULEVARD|2026-08-10': [copia()] } },
  { loja: 'NOVA AMERICA', transferAll: { 'NOVA AMERICA|2026-08-10': [copia()] } },
];

// Caso real: a cópia do destino nunca chegou na linha dele. sbPushLoja(destino) só leva o
// que estiver sob "destino|...", então a confirmação não tinha chave pra viajar.
const PICANHA = {
  id: 'mv9jiaqc2xc', qtd: 12, data: '2026-10-15T12:53:44.532Z', fator: 1,
  insumo: 'PICANHA MATURATA / PICANHA DO CHEFF', motivo: 'EMPRESTIMO',
  origem: 'PEDREIRA', destino: 'NOVA AMERICA', unidade: 'KG', qtdOriginal: 12,
  quitado: false, dataQuitacao: null,
  confirmadoOrigem: true, confirmadoDestino: false,
  pagDinheiroOrigem: false, pagDinheiroDestino: false,
};
const CENARIO_SO_NA_ORIGEM = [
  { loja: 'PEDREIRA',     transferAll: { 'PEDREIRA|2026-10-12': [JSON.parse(JSON.stringify(PICANHA))] } },
  { loja: 'NOVA AMERICA', transferAll: {} },
];

async function abrir(browser, rows, lojaSessao) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  const patches = [];
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request();
    const url = req.url();
    const metodo = req.method();
    if (metodo === 'PATCH' || metodo === 'POST') {
      if (metodo === 'PATCH') { let b = null; try { b = JSON.parse(req.postData() || 'null'); } catch (e) {}
        patches.push({ url, body: b }); }
      return r.fulfill({ status: 204, body: '' });
    }
    if (url.indexOf('gn_lojas') === -1) {
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    // _fetchAllDataAtual: gn_lojas?loja=eq.X&select=all_data
    const m = /loja=eq\.([^&]+)/.exec(url);
    const sel = rows
      .filter(x => !m || x.loja === decodeURIComponent(m[1]).replace(/\+/g, ' '))
      .map(x => ({ loja: x.loja, all_data: { transferAll: x.transferAll }, updated_at: '2026-10-22T00:00:00Z' }));
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sel) });
  });
  const page = await ctx.newPage();
  await page.addInitScript((l) => {
    localStorage.clear();
    localStorage.setItem('gn_session_v1', JSON.stringify({
      ts: Date.now(), id: 1, nome: 'Tiago', cargo: 'mestre', loja: l, permissoes: {} }));
  }, lojaSessao);
  for (let t = 1; ; t++) {
    await page.goto('file://' + LOJAS_APP + '?tab=transf');
    try {
      await page.waitForFunction(() => {
        try { return typeof getTransfPorLoja === 'function' && typeof quitarEmprestimo === 'function'
                   && Object.keys(transferAll).length > 0; } catch (e) { return false; }
      }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('o app Lojas não carregou com os empréstimos'); }
  }
  await page.evaluate(() => { loja = (JSON.parse(localStorage.getItem('gn_session_v1')) || {}).loja; tab = 'transf'; render(); });
  return { ctx, page, patches };
}

// O que a LOJA vê na aba Empréstimos, e o que o app acha que o registro é.
const estado = (page, id) => page.evaluate((id) => {
  const tf = getTransfPorLoja();
  const abertosEnv = tf.enviadas.filter(t => !t.quitado);
  const abertosRec = tf.recebidas.filter(t => !t.quitado);
  const txt = document.getElementById('content') ? document.getElementById('content').innerText : document.body.innerText;
  const copias = [];
  Object.keys(transferAll).forEach(k => (transferAll[k] || []).forEach(t => {
    if (t && t.id === id) copias.push({ chave: k, quitado: !!t.quitado, co: !!t.confirmadoOrigem, cd: !!t.confirmadoDestino });
  }));
  return {
    abertosEnv: abertosEnv.length, abertosRec: abertosRec.length,
    naTela: (txt.match(/BARRIL CHOPP DE VINHO/g) || []).length,
    naPendencia: /pendência\(s\) de empréstimo/.test(txt) || /Você deve \d+ empréstimo/.test(txt)
      || /Aguardando devolução de \d+ empréstimo/.test(txt),
    temBotaoRecebi: txt.indexOf('Recebi de volta') > -1,
    temAvisoOutraConfirmou: txt.indexOf('confirmou! Confirme o recebimento') > -1,
    copias,
  };
}, id);

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  // ── 1. O caso relatado: Nova América (origem) e o barril já quitado numa cópia ────────
  {
    const a = await abrir(browser, CENARIO_BARRIL, 'NOVA AMERICA');
    const antes = await estado(a.page, BARRIL.id);
    check('Nova América não vê mais o barril como pendência', antes.abertosEnv === 0);
    check('o card do barril sai das pendências', !antes.naPendencia);
    check('as cópias do barril concordam que está quitado',
      antes.copias.length === 2 && antes.copias.every(c => c.quitado));
    check('e concordam nas duas confirmações', antes.copias.every(c => c.co && c.cd));

    // Mesmo quem clicar num card velho (aba aberta de antes) não pode ficar sem resposta.
    const depoisDoClique = await a.page.evaluate(async (id) => {
      let aviso = null; const antigo = window.showToast;
      window.showToast = (m) => { aviso = m; };
      await quitarEmprestimo(id);
      window.showToast = antigo;
      return { aviso, abertos: getTransfPorLoja().enviadas.filter(t => !t.quitado).length };
    }, BARRIL.id);
    check('clicar num card velho avisa que já está quitado', /quitado/i.test(depoisDoClique.aviso || ''));
    check('e não reabre a pendência', depoisDoClique.abertos === 0);
    await a.ctx.close();
  }

  // ── 2. O outro lado da mesma divergência: Boulevard (destino) ────────────────────────
  {
    const a = await abrir(browser, CENARIO_BARRIL, 'BOULEVARD');
    const e = await estado(a.page, BARRIL.id);
    check('Boulevard também deixa de ver o barril a devolver', e.abertosRec === 0);
    check('e não sobra nenhuma pendência pra ela', !e.naPendencia);
    await a.ctx.close();
  }

  // ── 3. Destino já confirmou: a origem tem que VER isso, não a cópia atrasada ─────────
  {
    const a = await abrir(browser, CENARIO_DESTINO_CONFIRMOU, 'NOVA AMERICA');
    const e = await estado(a.page, BARRIL.id);
    check('o empréstimo segue aberto (ninguém quitou ainda)', e.abertosEnv === 1);
    check('aparece uma vez só, sem duplicar por cópia', e.naTela === 1);
    check('a tela avisa que o Boulevard já confirmou', e.temAvisoOutraConfirmou);
    check('a confirmação do destino está em todas as cópias', e.copias.length === 2 && e.copias.every(c => c.cd));
    check('e nenhuma cópia inventou a confirmação da origem', e.copias.every(c => !c.co));

    const r = await a.page.evaluate(async (id) => {
      let aviso = null; const antigo = window.showToast;
      window.showToast = (m) => { aviso = m; };
      await quitarEmprestimo(id);
      await new Promise(res => setTimeout(res, 600));
      window.showToast = antigo;
      return { aviso, abertos: getTransfPorLoja().enviadas.filter(t => !t.quitado).length };
    }, BARRIL.id);
    check('clicar em "Recebi de volta" quita de verdade', r.abertos === 0);
    check('e avisa que as duas confirmaram', /ambas/i.test(r.aviso || ''));

    const grav = a.patches.filter(p => p.body && p.body.all_data && p.body.all_data.transferAll);
    const quitadoNaLinha = (l) => grav.filter(p => p.url.indexOf(encodeURIComponent(l)) > -1)
      .some(p => Object.values(p.body.all_data.transferAll)
        .some(lista => (lista || []).some(t => t.id === BARRIL.id && t.quitado === true)));
    check('a quitação é gravada na linha da Nova América', quitadoNaLinha('NOVA AMERICA'));
    check('e na linha do Boulevard', quitadoNaLinha('BOULEVARD'));
    await a.ctx.close();
  }

  // ── 4. Regressão: empréstimo normal continua funcionando ponta a ponta ───────────────
  {
    const a = await abrir(browser, CENARIO_NORMAL, 'NOVA AMERICA');
    const e = await estado(a.page, BARRIL.id);
    check('empréstimo normal aparece como pendência', e.abertosEnv === 1 && e.naTela === 1);
    check('com o botão de confirmar recebimento', e.temBotaoRecebi);
    check('sem aviso falso de que a outra loja confirmou', !e.temAvisoOutraConfirmou);

    const r = await a.page.evaluate(async (id) => {
      let aviso = null; const antigo = window.showToast;
      window.showToast = (m) => { aviso = m; };
      await quitarEmprestimo(id);
      await new Promise(res => setTimeout(res, 600));
      window.showToast = antigo;
      const t = getTransfPorLoja().enviadas.find(x => x.id === id);
      return { aviso, co: !!(t || {}).confirmadoOrigem, cd: !!(t || {}).confirmadoDestino, quitado: !!(t || {}).quitado };
    }, BARRIL.id);
    check('a origem confirma a sua ponta', r.co);
    check('sem quitar sozinha', !r.quitado && !r.cd);
    check('e o aviso diz que falta o destino', /aguardando\s+boulevard/i.test(r.aviso || ''));
    await a.ctx.close();
  }

  // ── 5. Empréstimo que existe só na linha da origem (caso real: 12 KG de picanha de
  //       PEDREIRA pra NOVA AMERICA, 15/10, sem cópia nenhuma na linha do destino) ───────
  {
    const a = await abrir(browser, CENARIO_SO_NA_ORIGEM, 'NOVA AMERICA');
    const e = await a.page.evaluate(() => {
      const tf = getTransfPorLoja();
      const txt = (document.getElementById('content') || document.body).innerText;
      return { recebidas: tf.recebidas.filter(t => !t.quitado).length,
               naTela: txt.indexOf('PICANHA') > -1,
               chavesDoDestino: Object.keys(transferAll).filter(k => k.indexOf('NOVA AMERICA|') === 0).length };
    });
    check('o destino vê os 12 KG de picanha que recebeu', e.recebidas === 1 && e.naTela);
    check('mesmo sem cópia na própria linha', e.chavesDoDestino === 0);

    const r = await a.page.evaluate(async (id) => {
      let aviso = null; const antigo = window.showToast;
      window.showToast = (m) => { aviso = m; };
      await quitarEmprestimo(id);
      await new Promise(res => setTimeout(res, 600));
      window.showToast = antigo;
      return { aviso, abertos: getTransfPorLoja().recebidas.filter(t => !t.quitado).length };
    }, PICANHA.id);
    check('o destino confirma a devolução e o empréstimo quita', r.abertos === 0);

    const grav = a.patches.filter(p => p.body && p.body.all_data && p.body.all_data.transferAll);
    const temNaLinha = (l) => grav.filter(p => p.url.indexOf(encodeURIComponent(l)) > -1)
      .some(p => Object.values(p.body.all_data.transferAll)
        .some(lista => (lista || []).some(t => t.id === PICANHA.id && t.quitado === true)));
    check('a quitação é gravada na linha da Pedreira', temNaLinha('PEDREIRA'));
    check('e a linha do destino passa a ter a sua cópia', temNaLinha('NOVA AMERICA'));
    await a.ctx.close();
  }

  // ── 6. O poll de 20s chegando no meio do clique: a confirmação não pode se perder ─────
  {
    const a = await abrir(browser, CENARIO_NORMAL, 'NOVA AMERICA');
    const r = await a.page.evaluate(async (id) => {
      let aviso = null; const antigo = window.showToast;
      window.showToast = (m) => { aviso = m; };
      // Simula o sbPull do polling caindo exatamente durante o await de quitarEmprestimo:
      // ele reescreve transferAll com as cópias da nuvem, que ainda não têm a confirmação.
      const fetchOriginal = _fetchAllDataAtual;
      _fetchAllDataAtual = async (l) => { await sbPull(true); return fetchOriginal(l); };
      await quitarEmprestimo(id);
      await new Promise(res => setTimeout(res, 800));
      _fetchAllDataAtual = fetchOriginal;
      window.showToast = antigo;
      const t = getTransfPorLoja().enviadas.find(x => x.id === id);
      const copias = [];
      Object.keys(transferAll).forEach(k => (transferAll[k] || []).forEach(x => {
        if (x && x.id === id) copias.push({ chave: k, co: !!x.confirmadoOrigem });
      }));
      return { aviso, co: !!(t || {}).confirmadoOrigem, copias };
    }, BARRIL.id);
    check('a confirmação sobrevive ao poll que chega no meio do clique', r.co);
    check('e fica em todas as cópias, não só na que o clique tinha na mão',
      r.copias.length > 0 && r.copias.every(c => c.co));

    const grav = a.patches.filter(p => p.body && p.body.all_data && p.body.all_data.transferAll);
    const confirmadoNaLinha = (l) => grav.filter(p => p.url.indexOf(encodeURIComponent(l)) > -1)
      .some(p => Object.values(p.body.all_data.transferAll)
        .some(lista => (lista || []).some(t => t.id === BARRIL.id && t.confirmadoOrigem === true)));
    check('e é gravada na linha do Boulevard mesmo assim', confirmadoNaLinha('BOULEVARD'));
    await a.ctx.close();
  }

  await browser.close();
  console.log('\n' + ok + ' ok, ' + falhou + ' falhou  [' + LOJAS_APP + ']');
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error('ERRO: ' + e.message); process.exit(2); });
