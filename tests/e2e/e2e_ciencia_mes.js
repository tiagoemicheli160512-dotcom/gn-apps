// "No app home lojas, no 'veja desempenho do mês anterior', hoje não consigo medir se estão
//  vendo de fato o resultado. É possível mover ele mais visível e com um botão que confirma
//  que foi visto, tendo que abrir e clicar dentro do card num botão que indique que foi
//  visto, válido para a senha de gerente."
//
// Três coisas: o card sobe na Home, a ciência só existe DENTRO dele (confirmar sem abrir não
// provaria nada) e vale com a senha da gerência. E, pra ser medível de verdade, o Painel de
// Gestão mostra quem já viu e quem falta — senão medir seria entrar nas 11 lojas uma a uma.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const hoje = new Date();
const fimMesAnt = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
const COMP = fimMesAnt.getFullYear() + '-' + String(fimMesAnt.getMonth() + 1).padStart(2, '0');

const GERENTE   = { id: 27, nome: 'Leandro', cargo: 'gerente' };
const SUBGER    = { id: 13, nome: 'Bárbara', cargo: 'sub_gerente' };

async function abrir(browser, opts) {
  opts = opts || {};
  // null = a linha DESEMPENHO_CIENTE ainda NÃO existe, que é como ela estava em produção.
  // O mock antigo fingia que existia sempre, e por isso não pegou o defeito que deixou a
  // ciência "confirmada" sem nunca ter sido gravada.
  let banco = opts.banco !== undefined ? opts.banco : null;
  const gravacoes = [];
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 430, height: 950 } });
  await ctx.route('**/rest/v1/**', async (r) => {
    const req = r.request(), url = req.url(), m = req.method();
    const json = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/rpc\/verificar_login/.test(url)) return json(opts.login || []);
    if (/gn_lojas/.test(url)) {
      const b = m === 'GET' ? null : JSON.parse(req.postData() || '{}');
      // No upsert o nome da linha vai no CORPO, não na URL (…/gn_lojas?on_conflict=loja).
      // Olhar só a URL fazia a gravação passar batido por este mock.
      if (!(/DESEMPENHO_CIENTE/.test(url) || (b && b.loja === 'DESEMPENHO_CIENTE'))) return json([]);
      if (opts.semRede) return r.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      if (m === 'GET') return json(banco === null ? [] : [{ loja: 'DESEMPENHO_CIENTE', all_data: banco }]);
      if (m === 'PATCH') {
        // Como o PostgREST se comporta de verdade: sem linha casada devolve 204 e não cria
        // nada. Quem confia nesse 204 acha que gravou.
        if (banco === null) return r.fulfill({ status: 204, body: '' });
        gravacoes.push(b); banco = b.all_data || {};
        return r.fulfill({ status: 204, body: '' });
      }
      if (m === 'POST') {
        gravacoes.push(b); banco = b.all_data || {};
        return r.fulfill({ status: 201, body: '' });
      }
    }
    return json([]);
  });
  const page = await ctx.newPage();
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => typeof _cienteBlocoHtml === 'function', { timeout: 25000 });
  return { ctx, page, gravacoes, banco: () => banco };
}

const sessao = (over) => Object.assign(
  { id: 27, nome: 'Leandro', loja: 'BOULEVARD', cargo: 'gerente', permissoes: {} }, over || {});

const prepara = (page, over) => page.evaluate(async ([s, comp]) => {
  session = s; masterLoja = null;
  _cienteAllData = null; _cienteForm = null; _cienteErro = ''; _cienteSalvando = false;
  await _cienteCarregar(true);
  return comp;
}, [sessao(over), COMP]);

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  // ── 1. O card subiu na Home ───────────────────────────────────────────────────────
  const a = await abrir(browser);
  const ordem = await a.page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id$="-home-card"], #dash-section')].map(e => e.id);
    return { ids, mes: ids.indexOf('mes-anterior-home-card'),
             venda: ids.indexOf('venda-mes-home-card'),
             visita: ids.indexOf('visita-supervisao-home-card'),
             docs: ids.indexOf('docs-rh-home-card') };
  });
  // 06/11/2026: subiu de novo, pra cima das validades e do card de vendas ("do jeito que
  // tá não estão vendo"). Ver e2e_mes_anterior_operacao.js.
  check('o card de desempenho vem antes do card de vendas (subiu pra cima das validades)',
    ordem.mes >= 0 && ordem.mes < ordem.venda);
  check('e não mais lá embaixo, depois das visitas',
    ordem.mes < ordem.visita && ordem.mes < ordem.docs);

  // ── 2. A ciência só existe DENTRO do card ────────────────────────────────────────
  await prepara(a.page);
  const bloco = await a.page.evaluate((comp) => ({
    fechado: _cienteBlocoHtml('BOULEVARD', comp, 'setembro'),
    temBotao: /Confirmar que vi o resultado/.test(_cienteBlocoHtml('BOULEVARD', comp, 'setembro')),
  }), COMP);
  check('o botão de confirmar existe no corpo do card', bloco.temBotao === true);
  check('e avisa que é com a senha da gerência', /senha da gerência/i.test(bloco.fechado));

  // ── 3. Senha errada e cargo errado não passam ───────────────────────────────────
  await a.ctx.close();
  const semLogin = await abrir(browser, { login: [] });
  await prepara(semLogin.page);
  const errada = await semLogin.page.evaluate(async (comp) => {
    _cienteForm = 'BOULEVARD';
    document.body.insertAdjacentHTML('beforeend',
      '<div id="t">' + _cienteBlocoHtml('BOULEVARD', comp, 'setembro') + '</div>');
    document.getElementById('ciente-user').value = 'Leandro';
    document.getElementById('ciente-senha').value = 'errada';
    await _cienteConfirmar('BOULEVARD', comp, 'setembro');
    return { erro: _cienteErro, registrou: !!_cienteDe(comp, 'BOULEVARD') };
  }, COMP);
  check('senha errada não registra ciência',
    /incorret/i.test(errada.erro) && errada.registrou === false);
  check('e nada foi gravado no banco', semLogin.gravacoes.length === 0);
  await semLogin.ctx.close();

  const comSub = await abrir(browser, { login: [SUBGER] });
  await prepara(comSub.page, { nome: 'Bárbara', cargo: 'sub_gerente' });
  const sub = await comSub.page.evaluate(async (comp) => {
    _cienteForm = 'BOULEVARD';
    document.body.insertAdjacentHTML('beforeend',
      '<div id="t2">' + _cienteBlocoHtml('BOULEVARD', comp, 'setembro') + '</div>');
    document.getElementById('ciente-user').value = 'Bárbara';
    document.getElementById('ciente-senha').value = 'x';
    await _cienteConfirmar('BOULEVARD', comp, 'setembro');
    return { erro: _cienteErro, registrou: !!_cienteDe(comp, 'BOULEVARD') };
  }, COMP);
  // 12/11/2026: sub-gerência passou a poder confirmar (Felix/Norte e Daniela/Guarulhos
  // tentavam e eram barrados). O cargo fica gravado e aparece no card.
  check('senha de SUB-gerente agora registra a ciência', sub.erro === '' && sub.registrou === true, JSON.stringify(sub));
  const subBloco = await comSub.page.evaluate((comp) => ({ j: _cienteDe(comp, 'BOULEVARD'), html: _cienteBlocoHtml('BOULEVARD', comp, 'setembro') }), COMP);
  check('…gravando o cargo sub_gerente, e o card diz "(sub-gerente)"', subBloco.j && subBloco.j.cargo === 'sub_gerente' && /Bárbara \(sub-gerente\)/.test(subBloco.html), JSON.stringify(subBloco.j));
  check('e foi pro banco', comSub.gravacoes.length === 1);
  await comSub.ctx.close();

  // Quem não é da gerência continua barrado.
  const comCaixa = await abrir(browser, { login: [{ id: 99, nome: 'Tatiana', cargo: 'caixa' }] });
  await prepara(comCaixa.page, { nome: 'Tatiana', cargo: 'caixa' });
  const cx = await comCaixa.page.evaluate(async (comp) => {
    _cienteForm = 'BOULEVARD';
    document.body.insertAdjacentHTML('beforeend', '<div id="t2c">' + _cienteBlocoHtml('BOULEVARD', comp, 'setembro') + '</div>');
    document.getElementById('ciente-user').value = 'Tatiana';
    document.getElementById('ciente-senha').value = 'x';
    await _cienteConfirmar('BOULEVARD', comp, 'setembro');
    return { erro: _cienteErro, registrou: !!_cienteDe(comp, 'BOULEVARD') };
  }, COMP);
  check('senha de CAIXA não vale — a ciência é da gerência e da sub-gerência',
    /gerência e da sub-gerência/i.test(cx.erro) && cx.registrou === false, JSON.stringify(cx));
  check('…e não grava nada', comCaixa.gravacoes.length === 0);

  // Lembrete no card da SEMANA enquanto o mês não foi confirmado (caso Nova América 12/11).
  const lemb = await comCaixa.page.evaluate(() => {
    if (!document.getElementById('mes-anterior-home-card')) { const d = document.createElement('div'); d.id = 'mes-anterior-home-card'; document.body.appendChild(d); }
    const h = new Date(); const comp = _dreCompetencia(new Date(h.getFullYear(), h.getMonth(), 0));
    _cienteAllData = {}; const sem = _fechaLembreteMesHtml('NOVA AMERICA');
    _cienteAllData = { [comp]: { 'NOVA AMERICA': { nome: 'Walter', cargo: 'gerente', em: new Date().toISOString() } } };
    const com = _fechaLembreteMesHtml('NOVA AMERICA');
    return { sem, com };
  });
  check('card da semana lembra que o resultado do MÊS é outra assinatura (enquanto não confirmado)',
    /resultado do mês de .+ ainda não foi confirmado/.test(lemb.sem) && /_fechaIrProMes/.test(lemb.sem), lemb.sem.slice(0, 200));
  check('…e o lembrete some depois que o mês é confirmado', lemb.com === '');
  await comCaixa.ctx.close();

  // ── 4. Senha de gerente registra, com nome e hora ───────────────────────────────
  const g = await abrir(browser, { login: [GERENTE] });
  await prepara(g.page);
  const feito = await g.page.evaluate(async (comp) => {
    _cienteForm = 'BOULEVARD';
    document.body.insertAdjacentHTML('beforeend',
      '<div id="t3">' + _cienteBlocoHtml('BOULEVARD', comp, 'setembro') + '</div>');
    document.getElementById('ciente-user').value = 'Leandro';
    document.getElementById('ciente-senha').value = 'certa';
    await _cienteConfirmar('BOULEVARD', comp, 'setembro');
    const j = _cienteDe(comp, 'BOULEVARD');
    return { erro: _cienteErro, j, bloco: _cienteBlocoHtml('BOULEVARD', comp, 'setembro'),
             formFechou: _cienteForm === null };
  }, COMP);
  check('senha de gerente registra a ciência', feito.erro === '' && !!feito.j);
  check('guardando quem foi, o cargo e a hora',
    feito.j.nome === 'Leandro' && feito.j.cargo === 'gerente' && !!feito.j.em);
  check('o formulário fecha e o card passa a mostrar quem viu',
    feito.formFechou === true && /Resultado do mês visto pela gerência/.test(feito.bloco) && /Leandro/.test(feito.bloco));
  const grav = g.gravacoes.pop();
  check('e foi pro banco na competência do mês fechado',
    !!grav && !!grav.all_data[COMP] && grav.all_data[COMP].BOULEVARD.nome === 'Leandro');

  // ── 5. A ciência é por loja e por mês ───────────────────────────────────────────
  const isolado = await g.page.evaluate((comp) => ({
    outraLoja: _cienteDe(comp, 'BANGU'),
    outroMes: _cienteDe('2001-01', 'BOULEVARD'),
  }), COMP);
  check('confirmar numa loja não confirma pelas outras', isolado.outraLoja === null);
  check('nem vale pro mês seguinte — a ciência é do mês fechado', isolado.outroMes === null);

  // ── 6. Não apaga a ciência que outra loja deu ──────────────────────────────────
  // A linha é compartilhada: gravar o que estava em memória apagaria o vizinho.
  const juntos = await g.page.evaluate(async (comp) => {
    _cienteAllData = null;
    await _cienteCarregar(true);                       // relê: Boulevard já está lá
    _cienteForm = 'BANGU';
    document.body.insertAdjacentHTML('beforeend',
      '<div id="t4">' + _cienteBlocoHtml('BANGU', comp, 'setembro') + '</div>');
    document.getElementById('ciente-user').value = 'Leandro';
    document.getElementById('ciente-senha').value = 'certa';
    await _cienteConfirmar('BANGU', comp, 'setembro');
    return { bangu: !!_cienteDe(comp, 'BANGU'), boulevard: !!_cienteDe(comp, 'BOULEVARD') };
  }, COMP);
  check('a segunda loja entra sem apagar a primeira',
    juntos.bangu === true && juntos.boulevard === true);

  // ── 7. O Painel mostra quem viu e quem falta ──────────────────────────────────
  const painel = await g.page.evaluate(() => {
    session = { id: 38, nome: 'Tiago', loja: 'GERAL', cargo: 'mestre', permissoes: { master: true } };
    masterLoja = null;
    return _buildCienciaMesCard();
  });
  check('o Painel de Gestão tem o cartão de quem já viu o resultado',
    /Resultado de/.test(painel) && /lojas viram/.test(painel));
  check('contando as duas que confirmaram', /2 de 11 lojas/.test(painel));
  check('e mostrando quem ainda falta, pelo nome', /Caxias/.test(painel) && /Pedreira/.test(painel));
  check('a Maglia fica fora da conta (CLAUDE.md — não foi citada, e não tem usuário)',
    !/Maglia/.test(painel) && /de 11 lojas/.test(painel));
  await g.ctx.close();

  // ── 8. Banco fora do ar não inventa que ninguém viu ──────────────────────────
  const off = await abrir(browser, { semRede: true });
  const semRede = await off.page.evaluate(async () => {
    session = { id: 38, nome: 'Tiago', loja: 'GERAL', cargo: 'mestre', permissoes: { master: true } };
    _cienteAllData = null;
    const r = await _cienteCarregar(true);
    return { r, card: _buildCienciaMesCard() };
  });
  check('falha de rede não vira "ninguém confirmou" — o cartão some em vez de mentir',
    semRede.r === null && semRede.card === '');
  await off.ctx.close();

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
