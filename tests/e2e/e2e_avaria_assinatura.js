// "Sobre não ter quem assinou a avaria, podemos colocar — é importante saber." (19/11/2026)
// Caso que motivou: BASE NATA do Norte lançada 2x (16/11) sem nada dizendo quem lançou.
//
// Cobra:
//  · app Lojas › Avarias: registrar pede nome + senha (verificar_login); sem assinatura válida
//    não grava nem baixa estoque; usuário de OUTRA loja não assina; da loja ou GERAL assina;
//  · a avaria grava registrado_por (quem assinou) e o aparelho; a lista mostra "Registrado por";
//  · app Pedidos › Avarias: o card mostra quem registrou; avaria antiga diz "sem assinatura";
//    o relatório leva o nome.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
const PEDIDOS = process.env.ARQ_PEDIDOS || CAMINHOS.pub('gn-pedidos.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 400))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 } });
  let loginResp = [];
  await ctx.route('**/rest/v1/**', r => {
    const u = r.request().url();
    if (/rpc\/verificar_login/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(loginResp) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  page.on('dialog', d => d.accept());
  for (let t = 1; ; t++) {
    await page.goto('file://' + LOJAS);
    try { await page.waitForFunction(() => { try { return typeof registrarAvaria === 'function' && typeof avariasAll === 'object'; } catch (e) { return false; } }, null, { timeout: 20000 }); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: o app Lojas não carregou'); process.exit(1); } }
  }
  await page.evaluate(() => { window.__render = render; });
  if (!(await page.evaluate(() => typeof _avariaAssinar === 'function'))) {
    console.log('FALHOU: a assinatura da avaria não existe neste arquivo (contraprova esperada — é nova)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }

  const tentar = async (login) => {
    loginResp = login;
    await page.evaluate(() => {
      loja = 'NORTE SHOPPING'; usuarioAtual = { nome: 'Norte Loja', cargo: 'gerente' }; avariasAll = {}; autoSave = () => {}; render = () => {};
      const k = lojaKey(); estIniAll[k] = { 'BASE NATA': 20 };
      document.querySelectorAll('#avar-insumo,#avar-qtd').forEach(e => e.remove());
      document.body.insertAdjacentHTML('beforeend', '<input id="avar-insumo" value="BASE NATA"><input id="avar-qtd" value="6">');
      registrarAvaria();
    });
    const modal = await page.evaluate(() => !!document.getElementById('avarAssinaModal'));
    if (modal) {
      await page.fill('#avarAssNome', 'Rayanne'); await page.fill('#avarAssSenha', '1234');
      await page.click('#avarAssOk'); await page.waitForTimeout(300);
    }
    return page.evaluate(() => ({ lista: avariasAll['NORTE SHOPPING'] || [], est: estIniAll[lojaKey()]['BASE NATA'],
      erro: (document.getElementById('avarAssErro') || {}).textContent || '', aberto: !!document.getElementById('avarAssinaModal') }));
  };

  const errada = await tentar([]);
  check('senha errada: não grava nem baixa o estoque, e diz o motivo', errada.lista.length === 0 && errada.est === 20 && /incorretos/.test(errada.erro) && errada.aberto, errada);
  await page.evaluate(() => document.getElementById('avarAssinaModal')?.remove());
  const outra = await tentar([{ nome: 'Rayanne', cargo: 'sub_gerente', loja: 'BANGU' }]);
  check('usuário de outra loja não assina', outra.lista.length === 0 && /não é desta loja/.test(outra.erro), outra);
  await page.evaluate(() => document.getElementById('avarAssinaModal')?.remove());
  const certa = await tentar([{ nome: 'Rayanne', cargo: 'sub_gerente', loja: 'NORTE SHOPPING' }]);
  const av = certa.lista[0] || {};
  check('assinatura da loja: grava a avaria com quem assinou e o aparelho, e baixa o estoque (20 → 14)',
    certa.lista.length === 1 && av.registrado_por === 'Rayanne' && av.registrado_cargo === 'sub_gerente' && av.registrado_aparelho === 'Norte Loja' && certa.est === 14, certa);
  const geral = await tentar([{ nome: 'Tiago', cargo: 'mestre', loja: 'GERAL' }]);
  check('usuário GERAL também assina', geral.lista.length === 1 && geral.lista[0].registrado_por === 'Tiago', geral);

  // Lista do app Lojas mostra quem registrou (render de verdade da aba Avarias).
  const lista = await page.evaluate(() => {
    loja = 'NORTE SHOPPING'; avariasAll = { 'NORTE SHOPPING': [{ id: 'x', ts: new Date().toISOString(), semana: wkKey(semana), insumo: 'BASE NATA', qtd: 6, status: 'pendente', custoUnit: 0, valorTotal: 0, registrado_por: 'Rayanne', registrado_aparelho: 'Norte Loja' }] };
    tab = 'avarias'; window.__render();
    const e = document.querySelector('.avar-assinou'); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null;
  });
  check('app Lojas: a lista de avarias mostra quem registrou e o aparelho', /Registrado por Rayanne \(aparelho: Norte Loja\)/.test(lista || ''), lista);
  await page.close();

  // App Pedidos › Avarias.
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 860 } });
  await ctx2.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const p2 = await ctx2.newPage();
  const erros2 = []; p2.on('pageerror', e => erros2.push(String(e.message || e)));
  await p2.goto('file://' + PEDIDOS);
  await p2.waitForFunction(() => { try { return typeof renderTerceiros === 'function' && typeof S === 'object' && S !== null; } catch (e) { return false; } }, null, { timeout: 30000 });
  const r = await p2.evaluate(async () => {
    _fetchSaidasTerceiros = async () => [
      { id: 'a1', insumo: 'BASE NATA', qtd: 6, status: 'pendente', ts: '2026-11-19T10:00:00Z', registrado_por: 'Rayanne', _lojaKey: 'NORTE SHOPPING', _lojaDisplay: 'Norte Shopping' },
      { id: 'a2', insumo: 'CACHACA OURO', qtd: 8, status: 'pendente', ts: '2026-11-11T10:00:00Z', _lojaKey: 'BANGU', _lojaDisplay: 'Bangu' },
    ];
    await renderTerceiros('avarias');
    const txt = document.getElementById('content').innerText.replace(/\s+/g, ' ');
    return { txt, rel: _terceirosRelatorioTexto().msg };
  });
  check('Pedidos › Avarias: o card mostra "Registrado por Rayanne"', /BASE NATA[\s\S]*Registrado por Rayanne/.test(r.txt), r.txt.slice(0, 400));
  check('…e a avaria antiga avisa que não tem assinatura', /CACHACA OURO[\s\S]*sem assinatura/.test(r.txt), r.txt);
  check('…e o relatório leva o nome', /BASE NATA[^\n]*registrado por Rayanne/.test(r.rel), r.rel);

  const todosErros = erros.concat(erros2);
  check('nenhum erro de JavaScript', todosErros.length === 0, todosErros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
