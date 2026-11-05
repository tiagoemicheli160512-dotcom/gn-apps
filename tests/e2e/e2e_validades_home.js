// "Buscar essa informação e colocar ela no app Home lojas, pra ficar registrado sempre que
//  entrar no alerta pra vencer."
//
// O card lê as mesmas linhas VALIDADES_<comKey>_<area> que o Check-list escreve. Mostra o
// que já venceu (que fecha os apps) e o que vence em até 3 dias — que é o único grupo que
// ainda dá pra aproveitar se alguém vir a tempo.
//
// O fixture usa o dado real de 08/10: Campo Grande com 1 vencido em câmaras e 1 em estoque,
// ambos de 07/10, mais itens vencendo nos dias seguintes.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const hoje = new Date();
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const mais = n => iso(new Date(hoje.getTime() + n * 86400000));

const LINHAS = [
  { loja: 'VALIDADES_CAMPO_GRANDE_camaras', all_data: { itens: [
    { id: '1', nome: 'CARNE DE SOL', validade: mais(-1) },        // venceu ontem
    { id: '2', nome: 'QUEIJO COALHO', validade: mais(2) },        // vence em 2 dias
    { id: '3', nome: 'PICANHA', validade: mais(40) } ] } },       // longe — não aparece
  { loja: 'VALIDADES_CAMPO_GRANDE_estoque', all_data: { itens: [
    { id: '4', nome: 'ARROZ TIPO 1', validade: mais(-3) },        // venceu há 3 dias
    { id: '5', nome: 'FEIJÃO', validade: mais(0) } ] } },         // vence HOJE
  { loja: 'VALIDADES_CAMPO_GRANDE_salao', all_data: { itens: [
    { id: '6', nome: 'GUARANÁ LATA', validade: mais(90) } ] } },
];
const SO_FUTURO = [
  { loja: 'VALIDADES_CAMPO_GRANDE_salao', all_data: { itens: [
    { id: '9', nome: 'COCA LATA', validade: mais(60) } ] } },
];

async function abrir(browser, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 430, height: 950 } });
  await ctx.route('**/rest/v1/**', (r) => {
    const u = r.request().url();
    if (/VALIDADES/.test(decodeURIComponent(u))) {
      if (opts.semRede) return r.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(opts.linhas || []) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try {
      await page.waitForFunction(() => { try { return typeof _renderValidadesHome === 'function' && LOJAS_TODAS; } catch (e) { return false; } }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }
  return { ctx, page };
}

const render = (page) => page.evaluate(async () => {
  session = { id: 9, nome: 'Thalyta', cargo: 'gerente', loja: 'CAMPO GRANDE', permissoes: {} };
  masterLoja = null;
  LOJAS_LISTA = LOJAS_TODAS;
  const login = document.getElementById('login-screen'); if (login) login.style.display = 'none';
  const home = document.getElementById('home-screen'); if (home) home.style.display = 'block';
  await _renderValidadesHome(true, session, false);
  const el = document.getElementById('validades-home-card');
  const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
  const cx = el.getBoundingClientRect();
  return {
    vazio: txt === '',
    txt,
    link: !!el.querySelector('a[href="gn-checklist.html"]'),
    larg: Math.round(cx.width),
    rolaLado: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
});

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  // ── 1. Com vencido: o card tem que gritar ──────────────────────────────────
  const a = await abrir(browser, { linhas: LINHAS });
  const r = await render(a.page);
  check('o card aparece na Home', r.vazio === false);
  check('diz que há produto vencido', /Produto vencido na loja/.test(r.txt));
  check('e avisa que os apps ficam fechados, menos o Check-list',
    /apps ficam fechados/.test(r.txt) && /só o Check-list abre/i.test(r.txt));
  check('conta os dois vencidos', /Vencidos \(2\)/.test(r.txt));
  check('nomeando produto e setor', /CARNE DE SOL/.test(r.txt) && /ARROZ TIPO 1/.test(r.txt)
    && /Câmaras frias/.test(r.txt) && /Estoque/.test(r.txt));
  check('com há quanto tempo venceu', /venceu ontem/.test(r.txt) && /venceu há 3 dias/.test(r.txt));

  // ── 2. O que ainda dá pra aproveitar ──────────────────────────────────────
  check('mostra também o que vence em breve', /Vence em breve \(2\)/.test(r.txt));
  check('com "vence HOJE" separado de "em N dias"', /vence HOJE/.test(r.txt) && /vence em 2 dias/.test(r.txt));
  check('e deixa de fora o que está longe', !/PICANHA/.test(r.txt) && !/GUARANÁ/.test(r.txt));
  check('com o caminho pro Check-list', r.link === true);
  check('cabendo na largura do celular', r.larg > 0 && r.rolaLado === false);
  await a.ctx.close();

  // ── 3. Sem nada pra avisar, o card some ──────────────────────────────────
  // Um card verde todo dia vira paisagem — e aí ninguém repara no dia em que fica vermelho.
  const b = await abrir(browser, { linhas: SO_FUTURO });
  const r2 = await render(b.page);
  check('loja sem vencido nem vencendo não mostra card nenhum', r2.vazio === true);
  await b.ctx.close();

  const c = await abrir(browser, { linhas: [] });
  const r3 = await render(c.page);
  check('loja sem lista de validades também não', r3.vazio === true);
  await c.ctx.close();

  // ── 4. Falha de rede não pode virar "está tudo certo" ───────────────────
  const d = await abrir(browser, { semRede: true });
  const r4 = await render(d.page);
  check('sem conexão, avisa em vez de sumir calado',
    r4.vazio === false && /não consegui carregar/i.test(r4.txt));
  check('e não inventa vencido nenhum', !/Produto vencido/.test(r4.txt));
  await d.ctx.close();

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
