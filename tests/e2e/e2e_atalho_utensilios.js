// "Verificar o app check-list, aba utensílios. Preciso criar aba no app home lojas, onde
//  clicando vai direto pra cadastrar os itens e colocar avarias. Atualmente não estão fazendo."
//
// Medido no banco antes de mexer: a aba existe desde 10/10 e, até 22/10, só o BANGU havia
// lançado alguma peça — 1 peça, pela Taynara (a sub-gerente que pediu o recurso). Os 13
// "lançamentos" de utensílio no checklist_diario são o MESMO copo arrastado dia a dia, e o
// saldo descontou uma vez só (3 → 2), como tem que ser. A tela funciona; o que faltava era
// caminho até ela. Comparação: "Estrutura" tem 2.708 lançamentos em 11 lojas.
//
// O teste cobre o atalho novo no Home e o link direto no Check-list, incluindo as duas
// coisas que um atalho não pode quebrar: a trava de pendência essencial e o salto direto
// pro app de quem só tem permissão de Check-list.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const fs = require('fs');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
const CHK  = process.env.ARQ_CHK  || CAMINHOS.pub('gn-checklist.html');
const SB_LIB = fs.readFileSync('' + CAMINHOS.fix('supabase.min.js') + '', 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (extra !== undefined && !c ? '  → ' + String(extra).slice(0,200) : '')); c ? ok++ : falhou++; };

// Saldo real do Bangu hoje, pro badge ser testado com o dado que existe.
const SALDO_BANGU = { 'copo de colocar alcool pra manteiga de garrafa':
  { qtd: 2, nome: 'Copo de colocar álcool pra manteiga de garrafa', inicial: 3, inicial_por: 'Taynara' } };

async function abrirHome(browser, saldo) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status:200, contentType:'application/javascript', body:SB_LIB }));
  await ctx.route('**/rest/v1/**', r => {
    const u = r.request().url();
    if (/gn_lojas/.test(u) && r.request().method() === 'GET') {
      return r.fulfill({ status:200, contentType:'application/json',
        body: JSON.stringify(saldo === null ? [{ all_data: {} }] : [{ all_data: { utensilios_saldo: saldo } }]) });
    }
    return r.fulfill({ status:200, contentType:'application/json', body:'[]' });
  });
  const page = await ctx.newPage();
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => { try { return typeof renderModules === 'function' && Array.isArray(MODULES); } catch (e) { return false; } }, { timeout: 25000 });
  return { ctx, page };
}

const mostrarHome = (page, sess) => page.evaluate(async (sess) => {
  window.gnFetchJson = async (u, h, c, fb) => fb;
  session = sess; masterLoja = '';
  showHome(sess);
  await new Promise(r => setTimeout(r, 600));
  const cards = [...document.querySelectorAll('#mod-list .mod-row')].map(el => ({
    nome: (el.querySelector('.mod-name') || {}).textContent || '',
    sub:  (el.querySelector('.mod-sub')  || {}).textContent || '',
    onclick: el.getAttribute('onclick') || '',
  }));
  const menu = [...document.querySelectorAll('#sb-modules .sbn-mod')].map(el => el.textContent.trim());
  const badge = (document.getElementById('badge-utensilios') || {}).textContent || null;
  return { cards, menu, badge };
}, sess);

const sessaoLoja = (extra) => Object.assign({
  id: 7, nome: 'Taynara', cargo: 'subgerente', loja: 'BANGU',
  permissoes: { checklist: true, caixa: true },
}, extra || {});

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  // ── 1. O atalho aparece e leva direto pra aba, com o formulário aberto ──────────────
  {
    const a = await abrirHome(browser, SALDO_BANGU);
    const r = await mostrarHome(a.page, sessaoLoja());
    const card = r.cards.find(c => /Utens/i.test(c.nome));
    check('o atalho de Utensílios aparece na tela da loja', !!card, JSON.stringify(r.cards.map(c=>c.nome)));
    check('e leva pra aba Utensílios do Check-list já no formulário',
      !!card && /gn-checklist\.html\?tab=utensilios&novo=1/.test(card.onclick), card && card.onclick);
    check('com um subtítulo que diz o que lançar ali',
      !!card && /quebrou|falta/i.test(card.sub), card && card.sub);
    check('e também entra no menu lateral', r.menu.some(t => /Utens/i.test(t)), JSON.stringify(r.menu));
    check('o badge mostra o que a loja já tem no controle',
      /1 peça/.test(r.badge || ''), r.badge);
    await a.ctx.close();
  }

  // ── 2. Loja que nunca lançou: o badge é o próprio empurrão ──────────────────────────
  {
    const a = await abrirHome(browser, null);
    const r = await mostrarHome(a.page, sessaoLoja({ loja: 'CAXIAS' }));
    check('loja sem nada lançado vê "Nada lançado" no badge', /nada lançado/i.test(r.badge || ''), r.badge);
    await a.ctx.close();
  }

  // ── 3. Quem não tem Check-list não vê o atalho ──────────────────────────────────────
  {
    const a = await abrirHome(browser, SALDO_BANGU);
    const r = await mostrarHome(a.page, sessaoLoja({ permissoes: { caixa: true } }));
    check('sem permissão de Check-list, o atalho não aparece',
      !r.cards.some(c => /Utens/i.test(c.nome)), JSON.stringify(r.cards.map(c=>c.nome)));
    check('nem no menu lateral', !r.menu.some(t => /Utens/i.test(t)), JSON.stringify(r.menu));
    await a.ctx.close();
  }

  // ── 4. O atalho não conta como app ──────────────────────────────────────────────────
  //      _appUnicoPermitido (o salto direto pro app de quem só tem um) hoje devolve null em
  //      todo caso, no arquivo de produção também — medido, porque o módulo "Guia" é free e
  //      entra sempre na conta. Então o que este teste cobra não é o salto: é que o atalho
  //      fique FORA dessa conta, pra quando ela voltar a valer um dia.
  {
    const a = await abrirHome(browser, SALDO_BANGU);
    const r = await a.page.evaluate(() => {
      masterLoja = '';
      const sess = { id: 9, nome: 'Ana', cargo: 'gerente', loja: 'BANGU', permissoes: { checklist: true } };
      return {
        unico: (_appUnicoPermitido(sess) || {}).id || null,
        atalhos: MODULES.filter(m => m.atalho).map(m => m.id),
        appsDeVerdade: MODULES.filter(m => !m.atalho).length,
        total: MODULES.length,
      };
    });
    check('o atalho de Utensílios está marcado como atalho', r.atalhos.length === 1 && r.atalhos[0] === 'utensilios', JSON.stringify(r.atalhos));
    check('e não entra na conta de apps da sessão', r.appsDeVerdade === r.total - 1, JSON.stringify(r));
    check('o salto direto pro app único segue como em produção (null)', r.unico === null, JSON.stringify(r));
    await a.ctx.close();
  }

  // ── 5. O link direto funciona no Check-list ─────────────────────────────────────────
  async function abrirChk(query) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status:200, contentType:'application/javascript', body:SB_LIB }));
    await ctx.route('**/rest/v1/**', r => r.fulfill({ status:200, contentType:'application/json', body:'[]' }));
    const page = await ctx.newPage();
    const erros = [];
    page.on('pageerror', e => erros.push(String(e)));
    // Sem sessão o app para na tela de login e o boot (onde o link de aba é lido) nunca roda
    // — é a ponte do gn-home que entrega a loja, igual na navegação de verdade.
    await page.addInitScript(() => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('gn_session_v1', JSON.stringify({
        id: 7, nome: 'Taynara', cargo: 'subgerente', loja: 'BANGU', permissoes: { checklist: true }, ts: Date.now() }));
      localStorage.setItem('gn_nav_loja', JSON.stringify({ loja: 'BANGU', ts: Date.now() }));
    });
    await page.goto('file://' + CHK + (query || ''));
    await page.waitForFunction(() => { try { return typeof switchTab === 'function' && typeof renderUtensilios === 'function'; } catch (e) { return false; } }, { timeout: 30000 });
    return { ctx, page, erros };
  }

  {
    const a = await abrirChk('?tab=utensilios&novo=1');
    await a.page.waitForTimeout(1200);
    const r = await a.page.evaluate(() => ({
      aba: _activeTab,
      abaVisivel: !!document.querySelector('#tab-utensilios.active'),
      campoAberto: !!document.getElementById('utens-novo-nome'),
      textoNaTela: (document.getElementById('tab-utensilios') || {}).innerText || '',
    }));
    check('abrir com ?tab=utensilios cai na aba Utensílios', r.aba === 'utensilios' && r.abaVisivel, r.aba);
    check('e o formulário de lançar já está aberto', r.campoAberto);
    check('com a explicação do que lançar ali', /quebrou/i.test(r.textoNaTela));
    check('sem erro de JS', a.erros.length === 0, a.erros.join(' | '));
    await a.ctx.close();
  }

  // ── 6. Sem o parâmetro, nada é forçado ──────────────────────────────────────────────
  {
    const a = await abrirChk('');
    await a.page.waitForTimeout(1200);
    const r = await a.page.evaluate(() => ({ aba: _activeTab, campo: !!document.getElementById('utens-novo-nome') }));
    check('sem o parâmetro, o app não vai pra Utensílios', r.aba !== 'utensilios', r.aba);
    check('e não abre formulário nenhum', !r.campo);
    await a.ctx.close();
  }

  // ── 7. O link não fura permissão de aba nem a trava de pendência ────────────────────
  {
    const a = await abrirChk('?tab=utensilios&novo=1');
    const r = await a.page.evaluate(() => {
      const out = {};
      // aba escondida por permissão (aplicarPermissaoAbas esconde via style.display)
      switchTab('dados', document.getElementById('tab-btn-dados'));
      document.getElementById('tab-btn-utensilios').style.display = 'none';
      _abrirAbaPorLink();
      out.comAbaEscondida = _activeTab;
      document.getElementById('tab-btn-utensilios').style.display = '';
      // trava de pendência essencial ativa. Fecha o formulário antes: ele já estava aberto
      // pelo link do boot (que funcionou), e sem fechar a asserção passaria por herança.
      _utensNovo = null; renderUtensilios();
      switchTab('dados', document.getElementById('tab-btn-dados'));
      const guardado = _pendenciasEssenciaisAtivas;
      _pendenciasEssenciaisAtivas = [{ chave: 'carnes', tabAlvo: 'carnes', hard: false }];
      _abrirAbaPorLink();
      out.comTrava = _activeTab;
      out.formAberto = !!document.getElementById('utens-novo-nome');
      _pendenciasEssenciaisAtivas = guardado;
      return out;
    });
    check('aba escondida por permissão: o link não força', r.comAbaEscondida !== 'utensilios', r.comAbaEscondida);
    check('pendência essencial travando: o link não passa por cima', r.comTrava !== 'utensilios', r.comTrava);
    check('e não deixa formulário aberto atrás do bloqueio', !r.formAberto);
    await a.ctx.close();
  }

  await browser.close();
  console.log('\n' + ok + ' ok, ' + falhou + ' falhou');
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error('ERRO: ' + e.message); process.exit(2); });
