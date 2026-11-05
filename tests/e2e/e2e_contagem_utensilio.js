// "Criar msg pra avisar a gerência, e solicitar na msg a contagem dos itens. Pois não foi
//  feito o inventário."
//
// O pedido não cabia no app: até aqui o saldo de uma peça só nascia junto de um
// "Quebrou"/"Faltando" — a pergunta de quantas a loja tem em bom estado só existia dentro
// de lancarUtensilioNoControle. Uma loja com 40 copos inteiros não tinha onde escrever 40, e
// fazer o inventário só seria possível INVENTANDO uma quebra: manutenção falsa na fila de
// quem conserta e desconto em cima do número recém-informado.
//
// Então o que este teste cobra é a contagem pura: grava no saldo e não cria manutenção
// nenhuma. Mais a trava que não pode cair: recontar peça que já tem saldo é de supervisão,
// mesma regra do botão "corrigir" (a lição da aba Entrada de carnes, onde a loja alterando
// número de controle gerava erro).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const fs = require('fs');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const SB_LIB = fs.readFileSync('' + CAMINHOS.fix('supabase.min.js') + '', 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (extra !== undefined && !c ? '  → ' + String(extra).slice(0,300) : '')); c ? ok++ : falhou++; };

async function abrir(browser, saldoInicial, query) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const escritas = [];
  let saldo = JSON.parse(JSON.stringify(saldoInicial || {}));
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status:200, contentType:'application/javascript', body:SB_LIB }));
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request(), url = req.url(), m = req.method();
    const aceita = String((req.headers() || {})['accept'] || '');
    if (m !== 'GET') {
      let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch(e) {}
      escritas.push({ m, tabela: url.split('/rest/v1/')[1].split('?')[0], body });
      // guarda o saldo gravado, pra leitura seguinte ver o estado novo (o app relê antes
      // de cada gravação de propósito — o app de Manutenção escreve na MESMA linha)
      if (/gn_lojas/.test(url) && body && body.all_data && body.all_data.utensilios_saldo) {
        saldo = body.all_data.utensilios_saldo;
      }
      return r.fulfill({ status:200, contentType:'application/json', body:'[]' });
    }
    if (/gn_lojas/.test(url)) {
      const linha = { all_data: { utensilios_saldo: saldo } };
      // maybeSingle() pede o objeto puro; sem isso o app recebe array e não acha all_data
      return r.fulfill({ status:200, contentType: aceita.includes('pgrst.object') ? 'application/vnd.pgrst.object+json' : 'application/json',
        body: JSON.stringify(aceita.includes('pgrst.object') ? linha : [linha]) });
    }
    return r.fulfill({ status:200, contentType:'application/json', body:'[]' });
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.addInitScript(() => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('gn_session_v1', JSON.stringify({
      id: 7, nome: 'Taynara', cargo: 'subgerente', loja: 'BANGU', permissoes: { checklist: true }, ts: Date.now() }));
    localStorage.setItem('gn_nav_loja', JSON.stringify({ loja: 'BANGU', ts: Date.now() }));
  });
  await page.goto('file://' + CHK + (query || ''));
  await page.waitForFunction(() => { try { return typeof renderUtensilios === 'function' && typeof switchTab === 'function'; } catch(e) { return false; } }, { timeout: 30000 });
  return { ctx, page, escritas, erros, saldoAgora: () => saldo };
}

const preparar = (page, cargo) => page.evaluate((cargo) => {
  LOJA = 'Bangu';
  usuarioLogado = { nome: 'Taynara', cargo: cargo };
  switchTab('utensilios', document.getElementById('tab-btn-utensilios'));
  renderUtensilios();
  return _activeTab;
}, cargo);

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  // ── 1. O caminho existe na tela ─────────────────────────────────────────────────────
  {
    const a = await abrir(browser, {});
    await preparar(a.page, 'subgerente');
    const r = await a.page.evaluate(() => {
      const aba = document.getElementById('tab-utensilios');
      const temBotao = !!aba.querySelector('button[onclick="abrirContagemUtensilio()"]');
      abrirContagemUtensilio();
      return {
        temBotao,
        campoNome: !!document.getElementById('utens-contar-nome'),
        campoQtd: !!aba.querySelector('#utens-contar input[type=number]'),
        texto: (document.getElementById('utens-contar') || {}).innerText || '',
      };
    });
    check('a aba tem o botão de contar', r.temBotao);
    check('e o formulário pede a peça e a quantidade', r.campoNome && r.campoQtd);
    check('dizendo que é o que a loja tem em bom estado', /bom estado/i.test(r.texto), r.texto);
    check('e que não cria manutenção', /não cria manuten/i.test(r.texto), r.texto);
    await a.ctx.close();
  }

  // ── 2. O núcleo: contar grava no saldo e NÃO cria manutenção ───────────────────────
  {
    const a = await abrir(browser, {});
    await preparar(a.page, 'subgerente');
    const r = await a.page.evaluate(async () => {
      const manutAntes = (state.manutencao || []).length;
      abrirContagemUtensilio();
      _utensContarSet('nome', 'Copo de chopp');
      _utensContarSet('qtd', '40');
      await _utensContarSalvar();
      await new Promise(res => setTimeout(res, 300));
      const reg = _utensilioDe('Copo de chopp');
      return { manutAntes, manutDepois: (state.manutencao || []).length,
               qtd: reg && reg.qtd, contado: reg && reg.contado, inicial: reg && reg.inicial,
               por: reg && reg.contado_por, formFechou: !_utensContar };
    });
    check('a contagem entra no saldo com o número informado', r.qtd === 40, JSON.stringify(r));
    check('marcada como contagem, com quem contou', r.contado === true && r.por === 'Taynara', JSON.stringify(r));
    check('e guarda esse número como o inicial da peça', r.inicial === 40, JSON.stringify(r));
    check('SEM criar manutenção nenhuma', r.manutDepois === r.manutAntes, JSON.stringify(r));
    check('e o formulário fecha depois de salvar', r.formFechou);

    const grav = a.escritas.filter(e => e.tabela === 'gn_lojas' && e.body && e.body.all_data);
    const chave = 'copo de chopp';
    check('o saldo é gravado na linha da loja',
      grav.some(e => (e.body.all_data.utensilios_saldo || {})[chave] &&
                     (e.body.all_data.utensilios_saldo || {})[chave].qtd === 40), JSON.stringify(grav.map(e=>e.body.all_data.utensilios_saldo)));
    check('nenhuma manutenção foi pro banco',
      !a.escritas.some(e => e.tabela === 'checklist_diario' && e.body &&
        JSON.stringify(e.body).includes('Utensílio / Louça')));
    const aud = a.escritas.filter(e => e.tabela === 'gn_chk_auditoria');
    check('a contagem fica na auditoria',
      aud.some(e => JSON.stringify(e.body).includes('CONTAR_UTENSILIO')), JSON.stringify(aud.map(e=>e.body)));
    await a.ctx.close();
  }

  // ── 3. Zero é resposta válida: a loja pode não ter nenhuma em bom estado ───────────
  {
    const a = await abrir(browser, {});
    await preparar(a.page, 'subgerente');
    const r = await a.page.evaluate(async () => {
      abrirContagemUtensilio();
      _utensContarSet('nome', 'Prato de sobremesa');
      _utensContarSet('qtd', '0');
      const podia = !document.getElementById('utens-contar-ok').disabled;
      await _utensContarSalvar();
      await new Promise(res => setTimeout(res, 300));
      const reg = _utensilioDe('Prato de sobremesa');
      return { podia, qtd: reg && reg.qtd };
    });
    check('contar zero é permitido', r.podia && r.qtd === 0, JSON.stringify(r));
    await a.ctx.close();
  }

  // ── 4. Faltando o nome ou a quantidade, não grava ─────────────────────────────────
  {
    const a = await abrir(browser, {});
    await preparar(a.page, 'subgerente');
    const r = await a.page.evaluate(async () => {
      const out = {};
      abrirContagemUtensilio();
      _utensContarSet('nome', '   ');
      _utensContarSet('qtd', '10');
      out.semNome = document.getElementById('utens-contar-ok').disabled;
      out.dicaSemNome = (document.getElementById('utens-contar-dica') || {}).textContent || '';
      _utensContarSet('nome', 'Garfo');
      _utensContarSet('qtd', '');
      out.semQtd = document.getElementById('utens-contar-ok').disabled;
      _utensContarSet('qtd', '-3');
      out.negativa = document.getElementById('utens-contar-ok').disabled;
      await _utensContarSalvar();
      await new Promise(res => setTimeout(res, 200));
      out.gravou = !!_utensilioDe('Garfo');
      return out;
    });
    check('sem a peça, o botão não libera', r.semNome, JSON.stringify(r));
    check('e a tela diz o que falta', /qual é a peça/i.test(r.dicaSemNome), r.dicaSemNome);
    check('sem a quantidade, também não', r.semQtd);
    check('quantidade negativa não passa', r.negativa && !r.gravou, JSON.stringify(r));
    await a.ctx.close();
  }

  // ── 5. A trava que não pode cair: peça que já tem saldo é da supervisão ───────────
  const SALDO_EXISTENTE = { 'copo de chopp': { nome: 'Copo de chopp', qtd: 12, inicial: 15 } };
  {
    const a = await abrir(browser, SALDO_EXISTENTE);
    await preparar(a.page, 'subgerente');
    const r = await a.page.evaluate(async () => {
      let aviso = null; const antigo = window.showToast;
      window.showToast = (m) => { aviso = m; };
      abrirContagemUtensilio();
      _utensContarSet('nome', 'copo de chopp');   // mesma peça, grafia diferente
      _utensContarSet('qtd', '99');
      await _utensContarSalvar();
      await new Promise(res => setTimeout(res, 300));
      window.showToast = antigo;
      return { aviso, qtd: (_utensilioDe('Copo de chopp') || {}).qtd };
    });
    check('a loja não reescreve saldo que já existe', r.qtd === 12, JSON.stringify(r));
    check('e é avisada de que isso é com a supervisão', /supervis/i.test(r.aviso || ''), r.aviso);
    check('o aviso diz quanto está lá hoje', /12/.test(r.aviso || ''), r.aviso);
    check('nada foi gravado', !a.escritas.some(e => e.tabela === 'gn_lojas' && e.m !== 'GET'),
      JSON.stringify(a.escritas.map(e => e.m + ' ' + e.tabela)));
    await a.ctx.close();
  }

  // ── 6. Supervisão reconta ─────────────────────────────────────────────────────────
  {
    const a = await abrir(browser, SALDO_EXISTENTE);
    await preparar(a.page, 'mestre');
    const r = await a.page.evaluate(async () => {
      abrirContagemUtensilio();
      _utensContarSet('nome', 'Copo de chopp');
      _utensContarSet('qtd', '9');
      await _utensContarSalvar();
      await new Promise(res => setTimeout(res, 300));
      const reg = _utensilioDe('Copo de chopp');
      return { qtd: reg && reg.qtd, corrigido: reg && reg.corrigido, inicial: reg && reg.inicial };
    });
    check('supervisão reconta a peça', r.qtd === 9, JSON.stringify(r));
    check('fica marcado como corrigido', r.corrigido === true, JSON.stringify(r));
    check('e o inicial da peça não é reescrito', r.inicial === 15, JSON.stringify(r));
    await a.ctx.close();
  }

  // ── 7. Os dois formulários não ficam abertos juntos ──────────────────────────────
  {
    const a = await abrir(browser, {});
    await preparar(a.page, 'subgerente');
    const r = await a.page.evaluate(() => {
      addUtensilio();
      const antes = { novo: !!document.getElementById('utens-novo-nome'), contar: !!document.getElementById('utens-contar-nome') };
      abrirContagemUtensilio();
      const depois = { novo: !!document.getElementById('utens-novo-nome'), contar: !!document.getElementById('utens-contar-nome') };
      return { antes, depois };
    });
    check('abrir a contagem fecha o lançamento', r.antes.novo && !r.depois.novo && r.depois.contar, JSON.stringify(r));
    await a.ctx.close();
  }

  // ── 8. Link direto pra contagem (pro aviso da gerência) ─────────────────────────
  {
    const a = await abrir(browser, {}, '?tab=utensilios&contar=1');
    await a.page.waitForTimeout(1200);
    const r = await a.page.evaluate(() => ({
      aba: _activeTab,
      contar: !!document.getElementById('utens-contar-nome'),
      novo: !!document.getElementById('utens-novo-nome'),
    }));
    check('o link ?contar=1 abre direto a contagem', r.aba === 'utensilios' && r.contar, JSON.stringify(r));
    check('e não abre o formulário de quebra junto', !r.novo, JSON.stringify(r));
    check('sem erro de JS', a.erros.length === 0, a.erros.join(' | '));
    await a.ctx.close();
  }

  await browser.close();
  console.log('\n' + ok + ' ok, ' + falhou + ' falhou  [' + CHK + ']');
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error('ERRO: ' + e.message); process.exit(2); });
