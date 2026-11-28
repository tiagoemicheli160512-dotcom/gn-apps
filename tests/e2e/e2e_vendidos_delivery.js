// Vendidos: delivery (iFood + 99) no mesmo item, 23/11/2026.
// "Faltou a opção de colocar os itens pra viagem: no Check-list, onde vai o total de cada prato,
//  um campo iFood e 99 — vale a mesma gramatura, só a multiplicação a mais. Sem criar itens só
//  pra viagem. Unir iFood e 99 num campo só (sai junto). Colocar a Coca." (relatório do sistema
//  traz salão e delivery separados — não há dobra.)
// Cobra: pratos e Coca têm o campo de delivery, chopp não; o item grava q = salão + delivery e
// qd = delivery; os kg pela gramatura contam os dois; os totais trazem a parte do delivery;
// corrigir um lançamento traz salão e delivery de volta nos campos certos; lançamento antigo
// (sem qd) abre todo no salão.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };
const CADASTRO = [
  { id: 'p_cs2', grupo: 'prato', nome: 'Carne de sol GIG P2', gramas: { carne_sol: 400 }, ativo: true, ordem: 1 },
  { id: 'p_cam', grupo: 'prato', nome: 'Camarão na nata', gramas: { camarao: 400 }, ativo: true, ordem: 2 },
  { id: 'coca_lata', grupo: 'coca', nome: 'Coca-Cola lata 350 ml', gramas: {}, ativo: true, ordem: 1 },
  { id: 'chopp_claro_350', grupo: 'chopp', nome: 'Chopp claro 350 ml', gramas: {}, ml: 350, chopp_tipo: 'CLARO', ativo: true, ordem: 1 },
];

async function abrir(browser, linhas) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-24T09:00:00');
  const banco = { linhas: (linhas || []).slice(), posts: [] };
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request(), u = decodeURIComponent(req.url().replace(/\+/g, '%20'));
    const json = (b, st) => r.fulfill({ status: st || 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/gn_vendidos_itens/.test(u)) return json(CADASTRO);
    if (/gn_vendidos_diario/.test(u) && req.method() === 'GET') return json(banco.linhas);
    if (/gn_vendidos_diario/.test(u) && req.method() === 'POST') { const b = JSON.parse(req.postData()); banco.posts.push(b); banco.linhas = [b]; return json([], 201); }
    if (/rpc\/verificar_login/.test(u)) return json([{ nome: 'Rayanne', cargo: 'sub_gerente', loja: 'NORTE SHOPPING' }]);
    return json([]);
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + CHK);
  await page.waitForFunction(() => !!window.gnVendidos, null, { timeout: 30000 });
  await page.evaluate(() => { document.getElementById('gn-vend-overlay') && document.getElementById('gn-vend-overlay').remove(); gnVendidos.abrirLancamento('NORTE SHOPPING', '2026-11-23', { nome: 'Rayanne', loja: 'NORTE SHOPPING', cargo: 'sub_gerente' }); });
  await page.waitForSelector('.gv-q', { timeout: 8000 });
  return { ctx, page, erros, banco };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const erros = [];
  const a = await abrir(browser, []);
  const campos = await a.page.evaluate(() => ({ s: [...document.querySelectorAll('.gv-q')].map(i => i.dataset.id), d: [...document.querySelectorAll('.gv-qd')].map(i => i.dataset.id), txt: document.getElementById('gn-vend-overlay').innerText }));
  check('pratos e Coca têm o campo de delivery; chopp não', campos.d.join() === 'p_cs2,p_cam,coca_lata' && campos.s.includes('chopp_claro_350'), campos);
  check('o cabeçalho diz "SALÃO" e "iFOOD+99"', /SALÃO/.test(campos.txt) && /iFOOD\+99/.test(campos.txt), campos.txt.slice(0, 300));
  const f = (cls, id, v) => a.page.fill(`.${cls}[data-id="${id}"]`, v);
  await f('gv-q', 'p_cs2', '10'); await f('gv-qd', 'p_cs2', '4'); await f('gv-q', 'coca_lata', '30'); await f('gv-qd', 'coca_lata', '12'); await f('gv-q', 'chopp_claro_350', '20');
  await a.page.waitForFunction(() => /Coca 12 un/.test((document.getElementById('gv-tot') || {}).innerText || ''), null, { timeout: 5000 }).catch(() => {});
  const tot = await a.page.evaluate(() => document.getElementById('gv-tot').innerText.replace(/\s+/g, ' '));
  check('a conta ao vivo soma os dois: carne de sol (10+4)×400 g = 5,6 kg; Coca 42 un', /Carne de Sol: 5,6 kg/.test(tot) && /Coca-Cola: 42 un/.test(tot), tot);
  check('…e mostra a parte do delivery: carne de sol 1,6 kg · Coca 12 un', /dos quais no delivery: Carne de Sol 1,6 kg · Coca 12 un/.test(tot), tot);
  await a.page.click('#gv-seguir'); await a.page.waitForSelector('#gv-nome');
  const ass = await a.page.evaluate(() => document.getElementById('gn-vend-overlay').innerText.replace(/\s+/g, ' '));
  check('a tela de assinar também mostra o delivery', /dos quais no delivery \(iFood \+ 99\): Carne de Sol 1,6 kg · Coca 12 un/.test(ass), ass.slice(0, 300));
  await a.page.fill('#gv-nome', 'Rayanne'); await a.page.fill('#gv-senha', '1'); await a.page.click('#gv-ok');
  for (let i = 0; i < 100 && !a.banco.posts.length; i++) await a.page.waitForTimeout(100);   // espera o envio de verdade
  // Falhou no CI 1× (28/11/2026) com tudo "{}" — nada tinha sido enviado ainda, mas o motivo
  // ficava só no log bruto. Agora é uma verificação própria, com a tela e os erros no resumo.
  const telaAss = a.banco.posts.length ? '' : await a.page.evaluate(() => { const o = document.getElementById('gn-vend-overlay'); return o ? o.innerText.replace(/\s+/g, ' ').slice(0, 300) : 'sem overlay'; });
  check('a assinatura envia o lançamento (em até 10 s)', a.banco.posts.length > 0, { tela: telaAss, erros: a.erros.slice(0, 3) });
  const b = a.banco.posts[0] || {};
  const it = b.itens || {};
  check('grava q = salão + delivery e qd = delivery (carne de sol 14 / 4; Coca 42 / 12)', it.p_cs2 && it.p_cs2.q === 14 && it.p_cs2.qd === 4 && it.coca_lata.q === 42 && it.coca_lata.qd === 12, it);
  check('chopp e item sem delivery não ganham qd', it.chopp_claro_350 && it.chopp_claro_350.q === 20 && !('qd' in it.chopp_claro_350) && !('qd' in it.p_cam), it);
  check('totais: carne de sol 5,6 kg e Coca 42 (o que o Painel já lê), com delivery {carne_sol 1,6, coca 12}', b.totais && b.totais.carne_sol === 5.6 && b.totais.coca_un === 42 && b.totais.delivery && b.totais.delivery.carne_sol === 1.6 && b.totais.delivery.coca_un === 12, b.totais);
  erros.push(...a.erros); await a.ctx.close();

  // Corrigir: volta salão e delivery nos campos certos; lançamento antigo abre tudo no salão
  const c = await abrir(browser, [{ loja: 'NORTE SHOPPING', data: '2026-11-23', lancado_por: 'Rayanne', itens: { p_cs2: { q: 14, qd: 4, grupo: 'prato' }, coca_lata: { q: 9, grupo: 'coca' } } }]);
  const v = await c.page.evaluate(() => ({ s: document.querySelector('.gv-q[data-id="p_cs2"]').value, d: document.querySelector('.gv-qd[data-id="p_cs2"]').value, cs: document.querySelector('.gv-q[data-id="coca_lata"]').value, cd: document.querySelector('.gv-qd[data-id="coca_lata"]').value }));
  check('ao corrigir: carne de sol volta 10 no salão e 4 no delivery', v.s === '10' && v.d === '4', v);
  check('lançamento antigo sem delivery (Coca 9) abre todo no salão', v.cs === '9' && v.cd === '', v);
  erros.push(...c.erros); await c.ctx.close();

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  await browser.close();
  console.log(`\n${ok} ok, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
