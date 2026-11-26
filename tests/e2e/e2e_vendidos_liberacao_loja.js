// Vendidos (26/11/2026) — caso da São Gonçalo: "pede a senha da supervisão pra liberar, mas
// quando coloco ele só fica liberado no meu aparelho; ao sair volta a travar, aí quem precisa
// acessar pra fazer não consegue."
// A liberação ficava no localStorage do aparelho (e presa ao usuário logado). Agora fica no
// banco (gn_vendidos_liberacao), por loja e dia, e vale em qualquer aparelho da loja.
// Dois aparelhos, um banco só.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 600))); c ? ok++ : falhou++; };

const LOJA = 'SÃO GONÇALO';
const SESS = (id, nome, cargo) => ({ id, nome, loja: LOJA, cargo, permissoes: {}, ts: Date.now() });
const CADASTRO = [{ id: 'p_cs2', grupo: 'prato', nome: 'Carne de sol GIG P2', gramas: { carne_sol: 400 }, ativo: true, ordem: 1 }];

function novoBanco() {
  return { linhas: ['2026-11-23', '2026-11-24'].map(data => ({ loja: LOJA, data, itens: {}, totais: {}, lancado_por: 'Mateus' })), posts: [], libs: [],   // linhas iguais ao banco real
    login: [{ nome: 'Tiago', cargo: 'mestre', loja: 'GERAL' }] };
}
async function abrir(browser, banco, quando, sessao) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 } });
  await CAMINHOS.fixarRelogio(ctx, quando);
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request(), u = decodeURIComponent(req.url().replace(/\+/g, '%20'));
    const json = (b, st) => r.fulfill({ status: st || 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/gn_vendidos_itens/.test(u)) return json(CADASTRO);
    if (/gn_vendidos_diario/.test(u) && req.method() === 'GET') {
      const lj = (u.match(/loja=eq\.([^&]+)/) || [])[1], de = (u.match(/data=gte\.([\d-]+)/) || [])[1], ate = (u.match(/data=lte\.([\d-]+)/) || [])[1];
      return json(banco.linhas.filter(x => (!lj || x.loja === lj) && (!de || x.data >= de) && (!ate || x.data <= ate)));
    }
    if (/gn_vendidos_diario/.test(u) && req.method() === 'POST') {
      const b = JSON.parse(req.postData()); banco.posts.push(b);
      banco.linhas = banco.linhas.filter(x => !(x.loja === b.loja && x.data === b.data)); banco.linhas.push(b); return json([], 201);
    }
    if (/gn_vendidos_liberacao/.test(u) && req.method() === 'GET') {
      const lj = (u.match(/loja=eq\.([^&]+)/) || [])[1], dia = (u.match(/dia=eq\.([\d-]+)/) || [])[1];
      return json(banco.libs.filter(x => x.loja === lj && x.dia === dia));
    }
    if (/gn_vendidos_liberacao/.test(u) && req.method() === 'POST') { banco.libs.push(JSON.parse(req.postData())); return json([], 201); }
    if (/rpc\/verificar_login/.test(u)) return json(banco.login);
    return json([]);
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  page.on('dialog', d => d.accept());
  await page.addInitScript(([s, dia]) => { localStorage.clear(); localStorage.setItem('gn_session_v1', JSON.stringify(Object.assign({}, s, { ts: Date.now() })));
    localStorage.setItem('gn_desp_liberacao', JSON.stringify({ uid: s.id, dia })); }, [sessao, quando.slice(0, 10)]);
  await page.goto('file://' + CHK);
  await page.waitForFunction(() => !!window.gnVendidos, null, { timeout: 30000 });
  return { ctx, page, erros };
}
const travado = p => p.$('#gn-vend-overlay').then(Boolean);
const txt = p => p.evaluate(() => { const o = document.getElementById('gn-vend-overlay'); return o ? o.innerText.replace(/\s+/g, ' ') : ''; });
const supervisao = async (p, botao) => {
  await p.waitForSelector('#gn-vend-sup', { timeout: 10000 });
  await p.click('#gn-vend-sup'); await p.fill('#gv-nome', 'Tiago'); await p.fill('#gv-senha', '1');
  await p.click(botao); await p.waitForTimeout(500);
};

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const erros = [];
  const QUI = '2026-11-26T13:10:00';   // 25/11 sem lançar, prazo 26/11 11h passou

  // ── "Só liberar o acesso hoje" num aparelho vale pro outro ──────────────────
  let banco = novoBanco();
  const A = await abrir(browser, banco, QUI, SESS(1, 'Mateus', 'gerente'));
  if (!(await A.page.evaluate(() => typeof gnVendidos.buscarLiberacoes === 'function'))) {
    console.log('FALHOU: a liberação no banco não existe neste arquivo (contraprova esperada — é nova)');
    console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }
  await A.page.waitForSelector('#gn-vend-overlay', { timeout: 10000 });
  check('São Gonçalo, 13h10, sem os vendidos de 25/11: trava', /Vendidos não lançados/.test(await txt(A.page)));
  await supervisao(A.page, '#gv-acesso');
  check('supervisão libera o acesso: grava no banco por loja e dia (ACESSO, quem liberou)',
    banco.libs.length === 1 && banco.libs[0].loja === LOJA && banco.libs[0].tipo === 'ACESSO' && banco.libs[0].dia === '2026-11-26' && banco.libs[0].liberado_por === 'Tiago' && !(await travado(A.page)), banco.libs);
  const B = await abrir(browser, banco, QUI, SESS(2, 'Joana', 'sub_gerente'));
  await B.page.waitForTimeout(2600);
  check('OUTRO aparelho, OUTRA pessoa da loja: também liberado (era o defeito)', !(await travado(B.page)));
  await A.page.reload(); await A.page.waitForTimeout(2600);
  check('o mesmo aparelho, ao sair e voltar: continua liberado', !(await travado(A.page)));
  erros.push(...A.erros, ...B.erros); await A.ctx.close(); await B.ctx.close();
  const C = await abrir(browser, banco, '2026-11-27T12:00:00', SESS(2, 'Joana', 'sub_gerente'));
  await C.page.waitForSelector('#gn-vend-overlay', { timeout: 10000 }).catch(() => {});
  check('no dia seguinte a liberação de acesso não vale mais (o dia segue pendente)', await travado(C.page));
  erros.push(...C.erros); await C.ctx.close();

  // ── "Liberar o lançamento atrasado" e sair sem lançar: quem vai lançar consegue ─
  banco = novoBanco();
  const D = await abrir(browser, banco, QUI, SESS(1, 'Mateus', 'gerente'));
  await supervisao(D.page, '#gv-lancar');
  await D.page.waitForSelector('.gv-q', { timeout: 8000 });
  check('liberar o lançamento grava no banco (LANCAMENTO de 25/11) e abre o formulário',
    banco.libs.length === 1 && banco.libs[0].tipo === 'LANCAMENTO' && banco.libs[0].data_venda === '2026-11-25' && /liberado por Tiago/.test(await txt(D.page)), banco.libs);
  erros.push(...D.erros); await D.ctx.close();   // saiu sem lançar
  const E = await abrir(browser, banco, '2026-11-26T13:30:00', SESS(2, 'Joana', 'sub_gerente'));
  await E.page.waitForSelector('.gn-vend-lancar', { timeout: 10000 }).catch(() => {});
  const tE = await txt(E.page);
  check('outro aparelho: a tela mostra "liberado por Tiago" e o botão Lançar (sem pedir supervisão de novo)',
    /liberado por Tiago/.test(tE) && !!(await E.page.$('.gn-vend-lancar')) && !(await E.page.$('#gn-vend-sup')) && !/Lembrar daqui/.test(tE), tE);
  await E.page.click('.gn-vend-lancar'); await E.page.waitForSelector('.gv-q', { timeout: 8000 });
  await E.page.fill('.gv-q[data-id="p_cs2"]', '5'); await E.page.click('#gv-seguir');
  banco.login = [{ nome: 'Joana', cargo: 'sub_gerente', loja: LOJA }];
  await E.page.fill('#gv-nome', 'Joana'); await E.page.fill('#gv-senha', '1'); await E.page.click('#gv-ok'); await E.page.waitForTimeout(600);
  const p = banco.posts[0] || {};
  check('quem lança é a sub da loja: grava atrasado, com quem liberou, e destrava',
    p.data === '2026-11-25' && p.atrasado === true && p.liberado_por === 'Tiago' && p.lancado_por === 'Joana' && p.totais && p.totais.carne_sol === 2 && !(await travado(E.page)), p);
  erros.push(...E.erros); await E.ctx.close();

  // ── Lista já aberta: a liberação dada em outro aparelho aparece sem recarregar ─
  banco = novoBanco();
  const F = await abrir(browser, banco, QUI, SESS(2, 'Joana', 'sub_gerente'));
  await F.page.waitForSelector('#gn-vend-sup', { timeout: 10000 });
  banco.libs.push({ loja: LOJA, tipo: 'LANCAMENTO', data_venda: '2026-11-25', dia: '2026-11-26', liberado_por: 'Tiago' });
  await F.page.evaluate(() => gnVendidos.verificarAgora()); await F.page.waitForTimeout(400);
  check('tela travada aberta: na checagem seguinte aparece o botão Lançar (liberado em outro aparelho)', !!(await F.page.$('.gn-vend-lancar')) && /liberado por Tiago/.test(await txt(F.page)));
  banco.libs.push({ loja: LOJA, tipo: 'ACESSO', data_venda: null, dia: '2026-11-26', liberado_por: 'Tiago' });
  await F.page.evaluate(() => gnVendidos.verificarAgora()); await F.page.waitForTimeout(400);
  check('…e se liberarem o acesso, a trava fecha sozinha', !(await travado(F.page)));
  erros.push(...F.erros); await F.ctx.close();

  // ── Liberação de outra loja não vale aqui ─────────────────────────────────
  banco = novoBanco();
  banco.libs.push({ loja: 'BANGU', tipo: 'ACESSO', data_venda: null, dia: '2026-11-26', liberado_por: 'Tiago' });
  const G = await abrir(browser, banco, QUI, SESS(2, 'Joana', 'sub_gerente'));
  await G.page.waitForSelector('#gn-vend-overlay', { timeout: 10000 }).catch(() => {});
  check('liberação de outra loja não destrava esta', await travado(G.page));

  // ── Aba Vendidos: dia liberado mostra "Lançar" em vez de "Supervisão" ──────
  banco.libs.push({ loja: LOJA, tipo: 'LANCAMENTO', data_venda: '2026-11-25', dia: '2026-11-26', liberado_por: 'Tiago' });
  const aba = await G.page.evaluate(async (loja) => {
    gnVendidos.fechar(); const el = document.createElement('div'); document.body.appendChild(el);
    await gnVendidos.renderAba(el, loja, { nome: 'Joana', loja });
    const b = [...el.querySelectorAll('.gv-aba-btn')].find(x => x.dataset.d === '2026-11-25');
    return { t: el.innerText.replace(/\s+/g, ' '), btn: b ? b.textContent : null, lib: b ? b.dataset.lib : null };
  }, LOJA);
  check('aba Vendidos: 25/11 aparece "liberado por Tiago — pode lançar" com botão Lançar', /liberado por Tiago/.test(aba.t) && aba.btn === 'Lançar' && aba.lib === 'Tiago', aba);
  await G.page.evaluate(() => [...document.querySelectorAll('.gv-aba-btn')].find(x => x.dataset.d === '2026-11-25').click());
  await G.page.waitForSelector('.gv-q', { timeout: 8000 }).catch(() => {});
  check('…e o botão abre o formulário direto, marcado como atrasado', /Lançamento atrasado, liberado por Tiago/.test(await txt(G.page)));
  erros.push(...G.erros); await G.ctx.close();

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
