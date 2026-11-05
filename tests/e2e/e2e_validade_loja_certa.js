// "No card das datas de validade, ao clicar pra ir corrigir não vai pra loja que está:
//  se estou em bangu ela abre outra loja."
//
// O Painel passa a loja pras sub-páginas pela chave gn_nav_loja (token de trânsito de
// 60s), escrita por navTo(). O botão de ação das telas cheias é um <a href> cru — não
// passa por navTo, então a loja não vai junto e o app de destino cai no gn_last_loja,
// que pode ser outra loja de quando se olhou outra.
//
// O teste força exatamente esse estado: olhando BANGU, com CAXIAS guardado como última
// loja. É o caso do usuário.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + extra); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + ARQ);
  await page.waitForFunction(() => { try {
    return typeof navTo === 'function' && typeof abrirListaCard === 'function' && typeof LOJAS_LISTA === 'object';
  } catch (e) { return false; } }, { timeout: 20000 });

  // Mestre olhando BANGU; a última loja visitada foi CAXIAS.
  await page.evaluate(() => {
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    masterLoja = 'BANGU';
    try {
      localStorage.setItem('gn_last_loja', JSON.stringify({ loja: 'CAXIAS', ts: Date.now() }));
      localStorage.removeItem('gn_nav_loja');
    } catch (e) {}
    // A tela cheia que o card de validades registra, com a mesma forma do app.
    window._telasListas['validades_vencidos'] = {
      titulo: 'Vencidos — Bangu', sub: '2 produtos', cor: '#DC2626',
      itens: [{ texto: 'Molho', detalhe: 'Cozinha', extra: 'venceu ontem', extraCor: '#DC2626' }],
      acaoUrl: 'gn-checklist.html', acaoLabel: '📋 Abrir o Check-list',
    };
    abrirListaCard('validades_vencidos');
  });
  await page.waitForTimeout(300);

  const acao = page.locator('a:has-text("Abrir o Check-list"), [data-acao-url]').first();
  check('a tela cheia das validades abre com o botão de ir corrigir',
    (await acao.count()) > 0);

  // A correção NAVEGA de verdade (navTo faz location.href). Então o teste deixa sair e
  // confere o que sobrevive à navegação: o localStorage, que é o canal pelo qual a loja
  // chega no app de destino, e a URL em que foi parar.
  await Promise.all([ page.waitForURL(/gn-checklist\.html/, { timeout: 15000 }).catch(() => {}), acao.click() ]);
  await page.waitForTimeout(400);

  const estado = await page.evaluate(() => {
    const ler = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
    return { nav: ler('gn_nav_loja'), last: ler('gn_last_loja'), url: location.pathname.split('/').pop() };
  });

  check('clicar em "ir corrigir" leva a loja que está aberta no Painel (BANGU)',
    estado.nav && estado.nav.loja === 'BANGU',
    'gn_nav_loja=' + JSON.stringify(estado.nav) + ' · gn_last_loja=' + JSON.stringify(estado.last));
  check('e atualiza a última loja, pra não voltar pra outra depois dos 60s do trânsito',
    estado.last && estado.last.loja === 'BANGU',
    'gn_last_loja=' + JSON.stringify(estado.last));
  check('e o destino continua sendo o Check-list', estado.url === 'gn-checklist.html', 'url=' + estado.url);

  // Em "Todas as lojas", NÃO pode fixar loja nenhuma — senão o mestre abriria o
  // Check-list preso numa loja que ele não escolheu.
  await page.goto('file://' + ARQ);
  await page.waitForFunction(() => { try { return typeof navTo === 'function' && typeof abrirListaCard === 'function'; } catch (e) { return false; } }, { timeout: 20000 });
  await page.evaluate(() => {
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    masterLoja = '';
    try { localStorage.setItem('gn_nav_loja', JSON.stringify({ loja: 'BANGU', ts: Date.now() })); } catch (e) {}
    window._telasListas['t2'] = { titulo: 'X', itens: [], acaoUrl: 'gn-checklist.html', acaoLabel: '📋 Abrir o Check-list' };
    abrirListaCard('t2');
  });
  await page.waitForTimeout(400);
  const acao2 = page.locator('a:has-text("Abrir o Check-list")').first();
  await Promise.all([ page.waitForURL(/gn-checklist\.html/, { timeout: 15000 }).catch(() => {}), acao2.click() ]);
  await page.waitForTimeout(400);
  check('com "todas as lojas" selecionado, o token de trânsito é limpo em vez de fixar uma loja',
    await page.evaluate(() => !localStorage.getItem('gn_nav_loja')));

  // ── O botão do PRÓPRIO card, que é por onde se clica primeiro ─────────────────────
  // O card de validades tem seu próprio "📋 Abrir o Check-list", separado do da tela
  // cheia. Os dois tinham o mesmo buraco; cobrir só um deixaria o outro voltar.
  await page.goto('file://' + ARQ);
  await page.waitForFunction(() => { try { return typeof navTo === 'function' && typeof _renderValidadesHome === 'function'; } catch (e) { return false; } }, { timeout: 20000 });
  await page.evaluate(() => {
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    masterLoja = 'BANGU';
    try {
      localStorage.setItem('gn_last_loja', JSON.stringify({ loja: 'CAXIAS', ts: Date.now() }));
      localStorage.removeItem('gn_nav_loja');
    } catch (e) {}
    // O container do card vive dentro do painel, que só aparece depois do login. O que
    // está sob teste é o caminho do clique, então o botão é montado visível, com
    // exatamente o mesmo onclick que o app gera — e o arquivo é conferido à parte,
    // logo abaixo, pra garantir que é mesmo esse onclick que está lá.
    const a = document.createElement('a');
    a.id = 'btn-card-val'; a.href = 'gn-checklist.html';
    a.setAttribute('onclick', 'return _irComLoja(this)');
    a.textContent = '📋 Abrir o Check-list';
    a.style.cssText = 'display:block;padding:20px;font-size:16px';
    document.body.appendChild(a);
  });
  // O botão REAL do card, lido do arquivo: tem que ter o handler que leva a loja.
  const fonteCard = require('fs').readFileSync(ARQ, 'utf8');
  check('o botão do card de validades passa pelo caminho que leva a loja',
    /<a href="gn-checklist\.html" onclick="return _irComLoja\(this\)"[^>]*>\s*📋 Abrir o Check-list<\/a>/.test(fonteCard));
  await Promise.all([ page.waitForURL(/gn-checklist\.html/, { timeout: 15000 }).catch(() => {}),
                      page.locator('#btn-card-val').click() ]);
  await page.waitForTimeout(400);
  check('e abre o Check-list na loja que está no Painel, não na última visitada',
    await page.evaluate(() => { try { return (JSON.parse(localStorage.getItem('gn_nav_loja')||'null')||{}).loja === 'BANGU'; } catch (e) { return false; } }),
    await page.evaluate(() => localStorage.getItem('gn_nav_loja')));

  // Guarda contra a volta do defeito: nenhum link pra app interno pode ficar sem o
  // caminho que leva a loja. Isto é lido do ARQUIVO, não da tela — pega os que não
  // estiverem renderizados no momento.
  const fs2 = require('fs');
  const fonte = fs2.readFileSync(ARQ, 'utf8');
  const soltos = (fonte.match(/<a href="gn-[a-z-]+\.html"(?![^>]*_irComLoja)[^>]*>/g) || []);
  check('nenhum link pra outro app do GN ficou sem levar a loja junto',
    soltos.length === 0, soltos.slice(0, 3).join(' | '));

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase/i.test(e));
  check('nenhum erro de JS', reais.length === 0);
  reais.slice(0, 3).forEach(e => console.log('      ' + e.slice(0, 180)));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
