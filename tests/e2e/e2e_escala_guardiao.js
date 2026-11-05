// O guardião é o que de fato fecha a porta: nenhum dos 13 apps tem código disso dentro.
// Ele lê a sessão do localStorage sozinho e cobre a tela. Este teste abre os apps de
// verdade, com uma sessão salva, e confere que a parede aparece — e, mais importante, que
// ela NÃO aparece pra quem está trabalhando.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const P = 'PRESENTE';
// Hoje de verdade: o guardião roda sem parâmetro, usando a data do navegador. O teste
// monta a semana sob a chave do dia de hoje, calculada igual ao app (âncora 05/01/2026).
const hoje = new Date();
const seg = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - ((hoje.getDay() + 6) % 7));
const SEM = Math.round((seg - Date.UTC(2026, 0, 5)) / 604800000);
const DIA = (hoje.getDay() + 6) % 7;

const dias = st => { const d = Array(7).fill(P); d[DIA] = st; return d; };
const SEMANA = { funcs: [
  { id: 0, nome: 'Renata ALVES - gerente', setor: 'Gerente', ferias_ini: '', ferias_fim: '', dias: dias('FOLGA') },
  { id: 1, nome: 'Marcos ALVES - gerente', setor: 'Gerente', ferias_ini: '', ferias_fim: '', dias: dias(P) },
]};

const APPS = [
  { arq: 'gn-home.html',      chave: 'gn_session_v1' },
  { arq: 'gn-caixa.html',     chave: 'gn_session_v1' },
  { arq: 'gn-checklist.html', chave: 'gn_session_v1' },
  { arq: 'gn-lojas.html',     chave: 'gn_session_v1' },
  { arq: 'gn-pedidos.html',   chave: 'gn_session_v1' },
  // Único app com formato de sessão diferente: {user:{...}, loja, ts}.
  { arq: 'gn-comandas.html',  chave: 'gn_comandas_session_v1', aninhado: true },
];

function sessaoPara(app, vinculo) {
  const u = { id: 99, nome: 'Fulano', loja: 'CAXIAS', cargo: 'gerente',
              permissoes: { escala_nome: vinculo, lojas: true, checklist: true, caixa: true,
                            pedidos: true, comandas: true, estoque: true } };
  return app.aninhado ? { user: u, loja: 'CAXIAS', ts: Date.now() }
                      : Object.assign({}, u, { ts: Date.now() });
}

async function abrir(browser, app, vinculo) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 430, height: 950 } });
  await ctx.route('**/rest/v1/**', r => {
    const url = r.request().url();
    const b = /gn_comissoes/.test(url) ? [{ [String(SEM)]: SEMANA }] : [];
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  });
  await ctx.addInitScript(([k, s]) => { try { localStorage.setItem(k, s); } catch (e) {} },
    [app.chave, JSON.stringify(sessaoPara(app, vinculo))]);
  const page = await ctx.newPage();
  await page.goto(('file://' + CAMINHOS.PUBLICO + '/') + app.arq);
  await page.waitForFunction(() => !!window.gnEscalaAcesso, { timeout: 25000 });
  return { ctx, page };
}

const parede = page => page.evaluate(() => {
  const el = document.getElementById('gn-escala-bloqueio');
  return { tem: !!el, texto: el ? el.textContent.slice(0, 120) : '' };
});

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  console.log(`(semana ${SEM}, dia ${DIA} — ${hoje.toISOString().slice(0, 10)})\n`);

  for (const app of APPS) {
    // De folga: tem que fechar.
    const b = await abrir(browser, app, 'Renata ALVES - gerente');
    await b.page.waitForTimeout(1200);
    const bloq = await parede(b.page);
    check(`${app.arq}: de folga, a tela é bloqueada`, bloq.tem && /folga/i.test(bloq.texto));
    await b.ctx.close();

    // Trabalhando: NÃO pode fechar. Esta é a metade que importa.
    const l = await abrir(browser, app, 'Marcos ALVES - gerente');
    await l.page.waitForTimeout(1200);
    const livre = await parede(l.page);
    check(`${app.arq}: trabalhando, o app abre normal`, livre.tem === false);
    await l.ctx.close();
  }

  // Sem sessão salva (tela de login) não pode aparecer parede nenhuma.
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const p = await ctx.newPage();
  await p.goto(('file://' + CAMINHOS.pub('gn-home.html')));
  await p.waitForFunction(() => !!window.gnEscalaAcesso, { timeout: 25000 });
  await p.waitForTimeout(900);
  check('sem ninguém logado, o guardião não faz nada', (await parede(p)).tem === false);

  // A parede tem que aparecer também quando a sessão surge DEPOIS (login dentro do app),
  // que é o caso real: o app não avisa ninguém quando grava a sessão.
  await p.evaluate(s => localStorage.setItem('gn_session_v1', s), JSON.stringify({
    id: 99, nome: 'Fulano', loja: 'CAXIAS', cargo: 'gerente',
    permissoes: { escala_nome: 'Renata ALVES - gerente' }, ts: Date.now() }));
  await ctx.route('**/rest/v1/**', r => {
    const b = /gn_comissoes/.test(r.request().url()) ? [{ [String(SEM)]: SEMANA }] : [];
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  });
  await p.waitForTimeout(4500);
  check('logando dentro do app, a parede aparece sem precisar recarregar', (await parede(p)).tem === true);

  // E sai de cena quando a pessoa sai da conta.
  await p.evaluate(() => localStorage.removeItem('gn_session_v1'));
  await p.waitForTimeout(4000);
  check('ao sair da conta, a parede some', (await parede(p)).tem === false);
  await ctx.close();

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
