// "Deixar sem ser obrigatório faz ninguém olhar ou responder. Tem que aparecer antes de
//  qualquer coisa e só liberar após ser feito."
//
// O que esta suíte cobra, além de a trava aparecer:
//  0. É SÓ DO FECHAMENTO DA SEMANA — a ciência do mês segue como card normal.
//  1. TRAVA SÓ QUEM DEVE. Caixa, estoquista e o mestre seguem usando a Home.
//  2. FALHA ABERTO. Sem relatório carregado, sem dia de fechamento, sem loja: sem trava.
//     Internet ruim não pode trancar a gerência fora do app.
//  3. SÓ LIBERA DEPOIS DE FEITO. E o "Continuar" só existe quando já foi respondido.
//  4. DEVOLVE O CARD NO LUGAR. A trava move o card pra dentro dela; ao soltar, ele volta
//     pra posição original da Home (senão a Home fica sem o card até recarregar).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (extra !== undefined && !c ? '  → ' + String(extra).slice(0,400) : '')); c ? ok++ : falhou++; };

const VENDA = 94735;
const dias = (n, venda) => Array.from({ length: n }, (_, i) => ({
  data_operacao: '2026-10-' + String(12 + i).padStart(2, '0'),
  venda_salao: venda / n, venda_delivery: 0, faltas: [], manutencao: [],
}));
const CEN = {
  dias: dias(7, VENDA), diasAnt: dias(7, 90000),
  carnes: { carne_sol: { inicial: '104.05', contagem_final: 152.65 }, picanha: { inicial: '49.25', contagem_final: 55.05 } },
  lojaAllData: {}, caixas: 7,
};

async function abrir(browser, { respostas, ciencias } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  // Terça, fixada. O app esconde o fechamento de semana na SEGUNDA (é o dia do pedido e da
  // contagem), então esta suíte passava de terça a domingo e ficava vermelha toda segunda —
  // foi o que derrubou o CI na virada de domingo pra segunda. 20/10 é da mesma semana em
  // que ela vinha passando, então só o dia deixa de ser sorteado pelo calendário.
  await CAMINHOS.fixarRelogio(ctx, '2026-10-20T10:00:00');

  let fecha = JSON.parse(JSON.stringify(respostas || {}));
  let ciente = JSON.parse(JSON.stringify(ciencias || {}));
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request(), url = req.url(), m = req.method();
    const j = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (m === 'POST' && /rpc\/verificar_login/.test(url)) {
      const b = JSON.parse(req.postData() || '{}');
      const u = { leandro: { nome: 'Leandro', cargo: 'gerente' }, barbara: { nome: 'Bárbara', cargo: 'sub_gerente' } }[String(b.p_nome || '').toLowerCase()];
      return (!u || b.p_senha !== 'ok') ? j([]) : j([u]);
    }
    if (m === 'POST' && /gn_lojas/.test(url)) {
      let b = null; try { b = JSON.parse(req.postData() || 'null'); } catch (e) {}
      if (b && b.loja === 'FECHAMENTO_SEMANAL') fecha = b.all_data;
      if (b && b.loja === 'DESEMPENHO_CIENTE') ciente = b.all_data;
      return r.fulfill({ status: 201, body: '' });
    }
    if (/gn_lojas/.test(url) && /FECHAMENTO_SEMANAL/.test(url)) return j([{ all_data: fecha }]);
    if (/gn_lojas/.test(url) && /DESEMPENHO_CIENTE/.test(url)) return j([{ all_data: ciente }]);
    if (/gn_lojas/.test(url)) return j([{ all_data: CEN.lojaAllData }]);
    if (/checklist_carnes/.test(url)) return j([{ carnes: CEN.carnes }]);
    if (/checklist_diario/.test(url)) return j(/gte\.2026-10-05/.test(url) ? CEN.diasAnt : CEN.dias);
    if (/gn_caixa_fechamento/.test(url)) return j(Array.from({ length: CEN.caixas }, (_, i) => ({ data: '2026-10-1' + i })));
    return j([]);
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => { try { return typeof _gateReavaliar === 'function'; } catch (e) { return false; } }, { timeout: 25000 });
  return { ctx, page, erros, fecha: () => fecha };
}

// Desenha a Home como se a pessoa do cargo pedido estivesse logada na loja.
const entrar = (page, cargo, nome) => page.evaluate(async ({ cargo, nome }) => {
  window.gnFetchJson = window.gnFetchJson || (async (u, h, tag, fb) => fb);
  session = { id: 9, nome, cargo, loja: 'BANGU', permissoes: {} };
  masterLoja = null;
  _fechaRel = null; _fechaRelLoja = null; _fechaAllData = null; _fechaQuem = null; _fechaRespostas = {};
  _cienteAllData = null; _gateReset();
  await _fechaCarregarRespostas(true);
  await _renderFechamentoSemanaHome(true, session, false);
}, { cargo, nome });

const estado = page => page.evaluate(() => {
  const ov = document.getElementById('gate-obrigatorio');
  const card = document.getElementById('fechamento-semana-home-card');
  const btn = document.getElementById('gate-obrigatorio-continuar');
  return {
    travado: !!ov,
    ativo: _gateAtivo,
    titulo: ov ? (document.getElementById('gate-obrigatorio-titulo').textContent || '') : '',
    texto: ov ? ov.innerText : '',
    zIndex: ov ? getComputedStyle(ov).zIndex : null,
    bodyTravado: document.body.style.overflow === 'hidden',
    cardDentro: !!(ov && card && ov.contains(card)),
    cardNoLugar: !!(card && card.previousElementSibling && card.previousElementSibling.id === 'mes-anterior-home-card'),
    continuarVisivel: !!(btn && btn.style.display !== 'none'),
    temSair: !!(ov && /Não sou eu/.test(ov.innerText)),
  };
});

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const CIENTE_OK = { '2026-09': { BANGU: { nome: 'Leandro', cargo: 'gerente', em: '2026-10-01T10:00:00Z' } } };

  // ── 1. Gerente devendo a semana: trava ──────────────────────────────────────────────
  {
    const a = await abrir(browser, { ciencias: CIENTE_OK });
    await entrar(a.page, 'gerente', 'Leandro');
    const e = await estado(a.page);
    check('gerente devendo o fechamento é travado', e.travado && e.ativo === true, JSON.stringify(e));
    check('a trava cobre a tela e prende a rolagem da Home', e.bodyTravado, JSON.stringify(e));
    check('o card do fechamento vai pra dentro da trava', e.cardDentro);
    check('a trava diz o que ele tem que fazer', /fechamento da semana/i.test(e.titulo), e.titulo);
    check('as perguntas (ou o login) aparecem dentro dela', /Entre pra responder|responda sobre a semana/i.test(e.texto), e.texto.slice(0,200));
    check('"Continuar" NÃO aparece antes de responder', !e.continuarVisivel);
    check('tem a saída "Não sou eu — sair"', e.temSair);
    check('fica abaixo do alerta urgente (99999)', Number(e.zIndex) < 99999, e.zIndex);
    check('sem erro de JS', a.erros.length === 0, a.erros.join(' | '));
    // O card tem a setinha de recolher. Dentro da trava, recolher deixaria a tela vazia
    // com uma trava de pé — sem saída nenhuma.
    await a.page.evaluate(() => _fechaToggle());
    await a.page.waitForTimeout(300);
    const e2 = await estado(a.page);
    check('recolher o card dentro da trava não deixa a tela vazia', e2.travado && /Entre pra responder|responda sobre a semana/i.test(e2.texto), e2.texto.slice(0,160));
    await a.ctx.close();
  }

  // ── 2. Quem não deve a resposta não é travado ───────────────────────────────────────
  for (const [cargo, nome] of [['caixa', 'Patrícia'], ['estoquista', 'Rafa'], ['supervisor', 'Carla']]) {
    const a = await abrir(browser, { ciencias: CIENTE_OK });
    await entrar(a.page, cargo, nome);
    const e = await estado(a.page);
    check(cargo + ' não é travado (não pode resolver a pendência)', !e.travado, JSON.stringify(e));
    await a.ctx.close();
  }
  {
    const a = await abrir(browser, { ciencias: CIENTE_OK });
    await a.page.evaluate(async () => {
      window.gnFetchJson = window.gnFetchJson || (async (u,h,t,fb) => fb);
      session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
      masterLoja = 'BANGU'; _gateReset();
      await _fechaCarregarRespostas(true);
      await _renderFechamentoSemanaHome(true, session, true);
    });
    const e = await estado(a.page);
    check('o mestre olhando a loja não é travado', !e.travado, JSON.stringify(e));
    await a.ctx.close();
  }

  // ── 3. Quem já respondeu passa direto ───────────────────────────────────────────────
  {
    const resp = { '2026-10-12': { BANGU: { gerente: { nome: 'Leandro', acertos: 3, total: 3, respostas: [], ordem: 1 } } } };
    const a = await abrir(browser, { respostas: resp, ciencias: CIENTE_OK });
    await entrar(a.page, 'gerente', 'Leandro');
    check('gerente que já respondeu não é travado', !(await estado(a.page)).travado);
    await entrar(a.page, 'sub_gerente', 'Bárbara');
    const e = await estado(a.page);
    check('mas o sub que não respondeu continua travado', e.travado && e.ativo === true, JSON.stringify(e));
    await a.ctx.close();
  }

  // ── 4. Falha aberto ─────────────────────────────────────────────────────────────────
  {
    const a = await abrir(browser, { ciencias: CIENTE_OK });
    await entrar(a.page, 'gerente', 'Leandro');
    check('(controle) travado antes do teste de falha', (await estado(a.page)).travado);
    await a.page.evaluate(async () => { _fechaRel = null; _fechaRelLoja = null; _gateReavaliar(); });
    const e = await estado(a.page);
    check('sem relatório carregado, a trava solta', !e.travado, JSON.stringify(e));
    check('e a rolagem da Home volta', !e.bodyTravado);
    await a.page.evaluate(async () => { _fechaAllData = null; _gateReavaliar(); });
    check('sem as respostas carregadas, idem', !(await estado(a.page)).travado);
    await a.ctx.close();
  }
  {
    const a = await abrir(browser, { ciencias: CIENTE_OK });
    await entrar(a.page, 'gerente', 'Leandro');
    const seg = await a.page.evaluate(() => {
      const orig = _fechaJaAbriu;
      _fechaJaAbriu = () => false;          // segunda-feira
      _gateReavaliar();
      const t = !!document.getElementById('gate-obrigatorio');
      _fechaJaAbriu = orig;
      return t;
    });
    check('na segunda (sem semana fechada pra cobrar) não trava', seg === false);
    await a.ctx.close();
  }

  // ── 5. Responder libera — e só então ────────────────────────────────────────────────
  {
    const a = await abrir(browser, { ciencias: CIENTE_OK });
    await entrar(a.page, 'gerente', 'Leandro');
    await a.page.fill('#fecha-user', 'leandro');
    await a.page.fill('#fecha-senha', 'ok');
    await a.page.click("#gate-obrigatorio button:has-text(\"Entrar\")");
    await a.page.waitForTimeout(500);
    let e = await estado(a.page);
    check('depois do login a trava segue de pé, agora com as perguntas', e.travado && /responda sobre a semana/i.test(e.texto), e.texto.slice(0,160));
    const qtd = await a.page.evaluate(() => _fechaPerguntasDe(_fechaRel).length);
    check('tem pergunta pra responder', qtd > 0, qtd);
    await a.page.evaluate(() => { _fechaPerguntasDe(_fechaRel).forEach(q => _fechaMarcar(q.id, q.correta)); });
    await a.page.waitForTimeout(200);
    e = await estado(a.page);
    check('marcar as respostas sozinho não libera', e.travado, JSON.stringify(e));
    await a.page.click("#gate-obrigatorio button:has-text(\"Enviar respostas\")");
    await a.page.waitForTimeout(600);
    e = await estado(a.page);
    check('respondeu: a trava mostra o relatório, não solta ainda', e.travado && /Relatório da semana/i.test(e.titulo), e.titulo);
    check('e agora o "Continuar" aparece', e.continuarVisivel, JSON.stringify(e));
    check('o relatório está na tela', /Resultado da semana|Venda da semana/i.test(e.texto), e.texto.slice(0,200));
    await a.page.click('#gate-obrigatorio-continuar');
    await a.page.waitForTimeout(300);
    e = await estado(a.page);
    check('"Continuar" libera a Home', !e.travado && !e.bodyTravado, JSON.stringify(e));
    check('e o card volta pro lugar dele na Home', e.cardNoLugar, JSON.stringify(e));
    const gravou = a.fecha();
    check('a resposta foi gravada no banco', !!(gravou['2026-10-12'] && gravou['2026-10-12'].BANGU && gravou['2026-10-12'].BANGU.gerente), JSON.stringify(gravou).slice(0,200));
    await a.ctx.close();
  }

  // ── 6. A ciência do mês NÃO trava (é card normal; a trava é só do fechamento) ──────
  {
    const a = await abrir(browser, {});            // nenhuma ciência dada
    await entrar(a.page, 'gerente', 'Leandro');
    const e = await estado(a.page);
    check('sem a ciência do mês, a trava é a da semana — não a do mês', e.travado && e.ativo === true, JSON.stringify(e));
    check('o card do mês não foi levado pra dentro da trava', await a.page.evaluate(() => {
      const c = document.getElementById('mes-anterior-home-card');
      const ov = document.getElementById('gate-obrigatorio');
      return !!c && !(ov && ov.contains(c));
    }));
    await a.page.evaluate(() => { _gateFeito = true; _gateReavaliar(); });
    check('respondida a semana, nada mais trava por causa do mês', !(await estado(a.page)).travado);
    await a.ctx.close();
  }

  // ── 7. Sair zera a trava pro próximo que entrar ─────────────────────────────────────
  {
    const a = await abrir(browser, { ciencias: CIENTE_OK });
    await entrar(a.page, 'gerente', 'Leandro');
    await a.page.evaluate(() => { _gateFeito = true; _gateReavaliar(); });
    check('(controle) liberado depois do Continuar', !(await estado(a.page)).travado);
    await a.page.evaluate(() => { _gateReset(); });
    await entrar(a.page, 'gerente', 'Leandro');
    check('depois de sair, a trava volta pro próximo login', (await estado(a.page)).travado);
    await a.ctx.close();
  }

  await browser.close();
  console.log('\n' + HOME);
  console.log(ok + ' ok, ' + falhou + ' falhou');
  process.exit(falhou ? 1 : 0);
})();
