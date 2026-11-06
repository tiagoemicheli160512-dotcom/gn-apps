// "Eu já vinha sentindo muita informação. Mas elas são importantes, teria uma forma de
//  redesenhar?" (06/11/2026) — fase 1: o que pede ação vira lista em "⚡ Precisa de você
//  hoje" no topo; o que está em dia vira uma linha "✅ Em dia". Dono: a ordem da proposta, o
//  "Em dia" aparece, e cada senha continua vendo só o que é permitido.
//
// A regra que esta suíte mais cobra: a camada só muda ONDE o card fica. Card vazio (o render
// decidiu não mostrar pra essa senha) não aparece em lugar nenhum.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-06T12:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await CAMINHOS.esperarApp(page, ['LOJAS_LISTA'], ['_homeMarcar', '_homeOrganizar']); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: a Home não carregou (ou falta a organização nova)'); console.log('\n0 OK, 1 falhou'); process.exit(1); } }
  }
  await page.evaluate(() => { document.getElementById('home-screen').style.display = 'block'; });
  const card = (id, txt) => page.evaluate(({ id, txt }) => { document.getElementById(id).innerHTML = txt ? `<div class="x">${txt}</div>` : ''; }, { id, txt });
  const marca = (id, estado, info) => page.evaluate(async ({ id, estado, info }) => { _homeMarcar(document.getElementById(id), estado, info); await new Promise(r => setTimeout(r, 20)); }, { id, estado, info });
  const estado = () => page.evaluate(() => {
    const sec = document.getElementById('home-sec-acao'), ok = document.getElementById('home-sec-ok');
    return {
      acaoVisivel: sec.style.display !== 'none',
      linhas: [...sec.querySelectorAll('[data-home-item]')].map(i => ({ id: i.dataset.homeItem, txt: i.querySelector('.home-acao-row').textContent.replace(/\s+/g, ' ').trim(),
        aberto: i.querySelector('.home-acao-gaveta').style.display !== 'none' })),
      total: sec.querySelector('.home-acao-total') ? sec.querySelector('.home-acao-total').textContent : '',
      okVisivel: ok.style.display !== 'none',
      okTxt: (ok.querySelector('.home-ok-linha') || {}).textContent || '',
      paiDe: id => null,
    };
  });
  const pai = id => page.evaluate(id => { const el = document.getElementById(id); const g = el.closest('.home-acao-gaveta, .home-ok-gaveta');
    return g ? (g.classList.contains('home-ok-gaveta') ? 'ok' : 'acao') : 'lugar'; }, id);

  // Três cards pedindo ação, fora de ordem; um em dia; um vazio com marca de ação.
  await card('pendencias-loja-home-card', 'pendências'); await marca('pendencias-loja-home-card', 'acao', { icone: '🔔', titulo: 'Pendências da loja', n: 4, resumo: '9 manutenções paradas' });
  await card('pra-hoje-card', 'pra hoje'); await marca('pra-hoje-card', 'acao', { icone: '📌', titulo: 'Pra fazer hoje', n: 2, resumo: 'Fechar o Check-list' });
  await card('validades-home-card', 'validades'); await marca('validades-home-card', 'acao', { icone: '⏳', titulo: 'Validades', n: 18, urgente: false, resumo: '18 vencendo' });
  await card('xml-mes-home-card', 'xml ok'); await marca('xml-mes-home-card', 'ok', { titulo: 'XML do mês' });
  await card('barris-semanal-home-card', ''); await marca('barris-semanal-home-card', 'acao', { titulo: 'Barris da semana' });
  let e = await estado();
  check('"Precisa de você hoje" aparece com 3 linhas', e.acaoVisivel && e.linhas.length === 3 && e.total === '3', JSON.stringify(e.linhas.map(l => l.id)));
  check('na ordem combinada: Pra fazer hoje, Validades, Pendências (não na ordem em que carregaram)',
    e.linhas.map(l => l.id).join(',') === 'pra-hoje-card,validades-home-card,pendencias-loja-home-card', e.linhas.map(l => l.id).join(','));
  check('cada linha mostra título, resumo e a contagem', /Pra fazer hoje/.test(e.linhas[0].txt) && /Fechar o Check-list/.test(e.linhas[0].txt) && /2/.test(e.linhas[0].txt), e.linhas[0].txt);
  check('card VAZIO não aparece, mesmo marcado como ação (é a permissão de cada senha valendo)', !e.linhas.some(l => l.id === 'barris-semanal-home-card'));
  check('os cards de ação começam fechados (só a linha aparece)', e.linhas.every(l => !l.aberto));
  check('o card original foi pra dentro da linha, com o mesmo id', (await pai('validades-home-card')) === 'acao');
  check('"Em dia" aparece com o XML do mês', e.okVisivel && /Em dia/.test(e.okTxt) && /XML do mês/.test(e.okTxt), e.okTxt);
  check('e o card em dia sai da frente (vai pra gaveta do "Em dia")', (await pai('xml-mes-home-card')) === 'ok');

  // Tocar abre o card original ali mesmo; tocar de novo fecha.
  await page.evaluate(() => _homeOrgToggle('validades-home-card'));
  e = await estado();
  check('tocar na linha abre o card completo', e.linhas.find(l => l.id === 'validades-home-card').aberto &&
    await page.evaluate(() => getComputedStyle(document.getElementById('validades-home-card')).display !== 'none' && document.getElementById('validades-home-card').offsetHeight > 0));
  await page.evaluate(() => _homeOrgToggle('validades-home-card'));
  check('tocar de novo fecha', !(await estado()).linhas.find(l => l.id === 'validades-home-card').aberto);

  // O render redesenha o card (mesmo id) — continua dentro da linha, com o resumo novo.
  await card('validades-home-card', 'validades v2'); await marca('validades-home-card', 'acao', { icone: '⛔', titulo: 'Validades', n: 3, resumo: '3 vencidos' });
  e = await estado();
  check('quando o card se redesenha, a linha atualiza o resumo e a contagem', /3 vencidos/.test(e.linhas.find(l => l.id === 'validades-home-card').txt) && (await pai('validades-home-card')) === 'acao');

  // A pendência foi resolvida: o card vira "ok" e sai da lista.
  await card('pra-hoje-card', 'tudo feito'); await marca('pra-hoje-card', 'ok', { titulo: 'Pra fazer hoje' });
  e = await estado();
  check('pendência resolvida sai da lista e entra no "Em dia"', !e.linhas.some(l => l.id === 'pra-hoje-card') && /Pra fazer hoje/.test(e.okTxt) && e.total === '2', JSON.stringify(e));
  // Card que deixa de ter marca volta pro lugar de sempre.
  await marca('pendencias-loja-home-card', '', {});
  check('card sem marca volta pro lugar original na Home', (await pai('pendencias-loja-home-card')) === 'lugar' &&
    await page.evaluate(() => document.getElementById('pendencias-loja-home-card').previousSibling.getAttribute('data-home-lugar') === 'pendencias-loja-home-card'));
  // Card que some (render limpou) sai de tudo.
  await card('validades-home-card', ''); await page.evaluate(async () => { _homeOrganizar(); });
  e = await estado();
  check('card que o render esvaziou some da lista', !e.linhas.some(l => l.id === 'validades-home-card'));
  // Nada pendente: a seção some.
  await card('pendencias-loja-home-card', ''); await page.evaluate(() => _homeOrganizar());
  e = await estado();
  check('sem nada pendente, "Precisa de você hoje" some', !e.acaoVisivel, JSON.stringify(e));
  // Em dia abre os cards pra conferir.
  await page.evaluate(() => _homeOrgOkToggle());
  check('tocar no "Em dia" mostra os cards que estão em dia', await page.evaluate(() => document.querySelector('.home-ok-gaveta').style.display === 'block' && document.getElementById('xml-mes-home-card').offsetHeight > 0));

  // Os renders de verdade: XML pendente marca ação, enviado marca em dia.
  const xml = await page.evaluate(async () => {
    session = { id: 1, nome: 'Tiago', cargo: 'gerente', loja: 'BANGU', permissoes: {} }; masterLoja = null;
    const o = window.gnFetchJson;
    window.gnFetchJson = async () => [{ all_data: {} }];
    await _renderXmlMesHome(true, session, false);
    const a = document.getElementById('xml-mes-home-card').dataset.homeEstado;
    window.gnFetchJson = async () => [{ all_data: { xml_enviado_mes: '2026-10', xml_enviado_por: 'Fernando' } }];
    await _renderXmlMesHome(true, session, false);
    const b = document.getElementById('xml-mes-home-card').dataset.homeEstado;
    window.gnFetchJson = o;
    return { a, b };
  });
  check('render real do XML: pendente → ação, enviado → em dia', xml.a === 'acao' && xml.b === 'ok', JSON.stringify(xml));
  // O texto da manutenção não sai mais "manutençãoões".
  const fonte = require('fs').readFileSync(HOME, 'utf8');
  check('plural de manutenção corrigido ("manutençãoões" não existe mais)', !/manutenção\$\{[^}]*'ões'/.test(fonte));

  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
