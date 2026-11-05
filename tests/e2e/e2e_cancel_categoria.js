// "Tem que ter o motivo, não pode ficar sem."
//
// O campo nunca ficou vazio: os 28 cancelamentos registrados tinham todos um motivo. O
// problema era outro — ele aceitava qualquer coisa, e a dica da tela ("Ex: pedido
// trocado") ensinava a resposta vaga. Campo Grande escreveu "Troca de pedido" e "Falta";
// a segunda tem cinco letras. Na mesma noite, Itaquera escreveu "Cancelou porque não
// tinha sorvete e pegou somente pudim". A diferença não era a pessoa, era o que o campo
// pedia.
//
// Agora são dois: CATEGORIA (eixo do relatório) e DETALHE (o caso). O que este teste
// precisa garantir, e é onde isso quebra de verdade:
//   1. a regra recusa o vago e aceita o que explica — sem virar muro pra quem escreve curto;
//   2. as 28 linhas ANTIGAS, sem categoria, continuam legíveis em toda tela e relatório;
//   3. o agrupamento soma o mesmo total que o topo — senão o quadro mente.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CONFIG = process.env.ARQ_CONFIG || CAMINHOS.pub('gn-lojas-config.js');
const CAIXA = process.env.ARQ_CAIXA || CAMINHOS.pub('gn-caixa.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 300)); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });

  // ── 1. A regra, direto do config ────────────────────────────────────────────
  const cfg = await ctx.newPage();
  await cfg.setContent('<!doctype html><meta charset="utf-8">');
  await cfg.addScriptTag({ path: CONFIG });
  const r = await cfg.evaluate(() => {
    const f = (cat, det) => window.gnCancelMotivoFalta(cat, det);
    return {
      temLista: Array.isArray(window.GN_CANCEL_CATEGORIAS) && window.GN_CANCEL_CATEGORIAS.length >= 5,
      lista: window.GN_CANCEL_CATEGORIAS,
      semCategoria: f('', 'trocou o rodízio por meia porção'),
      semDetalhe: f('Troca de pedido ou produto', ''),
      // Os dois motivos reais que motivaram o pedido
      falta: f('Produto em falta', 'Falta'),
      trocaDePedido: f('Troca de pedido ou produto', 'Troca de pedido'),
      // Os que explicam de verdade, vistos no banco na mesma noite
      itaquera: f('Produto em falta', 'Cancelou porque não tinha sorvete e pegou somente pudim'),
      curtoOk: f('Erro de lançamento', 'Garçom registrou errado'),
      trocaPrato: f('Troca de pedido ou produto', 'troca de prato'),
      // Esta quase passou batida: a 1ª versão da regra recusava QUALQUER detalhe que
      // contivesse as palavras da categoria — e explicação boa costuma começar por elas.
      // Barrar isso travaria o fechamento de quem escreve certo.
      explicaComecandoPelaCategoria: f('Cliente desistiu', 'Cliente desistiu porque demorou 40 minutos'),
      categoriaMaisEnfeite: f('Cliente desistiu', 'Cliente desistiu.'),
      // Exibição
      novo: window.gnCancelMotivoTexto({ motivo_categoria: 'Erro de lançamento', motivo: 'Rodízio pra 2 lançou meia' }),
      antigo: window.gnCancelMotivoTexto({ motivo: 'TROCA DE PEDIDO' }),
      vazio: window.gnCancelMotivoTexto({}),
      nulo: window.gnCancelMotivoTexto(null),
    };
  });
  await cfg.close();

  check('existe uma lista de categorias compartilhada', r.temLista, JSON.stringify(r.lista));
  check('a maior categoria dos dados reais está lá (troca de pedido/produto)',
    (r.lista || []).some(c => /troca/i.test(c)), JSON.stringify(r.lista));
  check('e existe "Outro", senão o caso que não se encaixa vira categoria errada',
    (r.lista || []).some(c => /outro/i.test(c)), JSON.stringify(r.lista));
  check('sem escolher categoria, não grava', !!r.semCategoria, r.semCategoria);
  check('sem detalhe, não grava', !!r.semDetalhe, r.semDetalhe);
  check('"Falta" é recusado — era um dos dois do print', !!r.falta, r.falta);
  check('"Troca de pedido" repetindo a categoria é recusado — era o outro',
    /repetindo/i.test(r.trocaDePedido || ''), r.trocaDePedido);
  check('a explicação de verdade passa', r.itaquera === '', r.itaquera);
  check('quem escreve curto e direto NÃO é barrado ("Garçom registrou errado")',
    r.curtoOk === '', r.curtoOk);
  check('nem "troca de prato", que tem 14 letras e diz o que foi', r.trocaPrato === '', r.trocaPrato);
  check('explicação que COMEÇA pela categoria passa — "Cliente desistiu porque demorou 40 minutos"',
    r.explicaComecandoPelaCategoria === '', r.explicaComecandoPelaCategoria);
  check('mas a categoria com um ponto no fim não vira explicação',
    !!r.categoriaMaisEnfeite, r.categoriaMaisEnfeite);

  // ── 2. Exibição: categoria + detalhe, e a linha antiga intacta ──────────────
  check('registro novo mostra categoria e detalhe juntos',
    r.novo === 'Erro de lançamento — Rodízio pra 2 lançou meia', r.novo);
  check('as 28 linhas antigas, sem categoria, seguem mostrando o motivo que têm',
    r.antigo === 'TROCA DE PEDIDO', r.antigo);
  check('registro sem nada não inventa texto', r.vazio === '' && r.nulo === '', JSON.stringify([r.vazio, r.nulo]));

  // ── 3. No app Caixa ─────────────────────────────────────────────────────────
  const gravados = [];
  await ctx.route('**/rest/v1/**', async rt => {
    const req = rt.request(), url = req.url(), metodo = req.method();
    if (/rpc\/verificar_login/.test(url)) {
      const b = JSON.parse(req.postData() || '{}');
      if (b.p_nome === 'Israel' && b.p_senha === 'certa')
        return rt.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify([{ id: 9, nome: 'Israel Souza', cargo: 'sub_gerente', loja: 'CAMPO GRANDE' }]) });
      return rt.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (/gn_caixa_cancelamento/.test(url) && metodo === 'POST') {
      const b = JSON.parse(req.postData() || '{}'); gravados.push(b);
      return rt.fulfill({ status: 201, contentType: 'application/json',
        body: JSON.stringify([{ id: 'id-' + gravados.length, criado_em: new Date().toISOString(), ...b }]) });
    }
    rt.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + CAIXA);
  await page.waitForFunction(() => { try { return typeof renderTudo === 'function' && typeof S === 'object' && S; }
    catch (e) { return false; } }, { timeout: 20000 });
  await page.evaluate(() => {
    S.user = { nome: 'Tiago', cargo: 'gerente' };
    S.loja = 'CAMPO GRANDE'; S.turnoSel = 'NOITE'; S.modoConsulta = false;
    S.fech = { id: 'f1', loja: 'CAMPO GRANDE', data: '2026-10-17', turno: 'NOITE', status: 'ABERTO',
               operador: 'Tiago', suprimento_inicial: 700, repique: 0 };
    S.comprovantes = []; S.saidas = []; S.supr = []; S.notas10 = []; S.cancel = [];
    renderTudo();
  });

  const opcoes = await page.evaluate(() => [...document.getElementById('cancelCategoria').options].map(o => o.value));
  check('o select na tela foi montado com as categorias', opcoes.length >= 6, JSON.stringify(opcoes));
  check('e começa sem nada escolhido, pra ninguém gravar a primeira por descuido',
    opcoes[0] === '', JSON.stringify(opcoes.slice(0, 2)));
  check('a dica do campo não sugere mais a resposta vaga',
    !/pedido trocado/i.test(await page.evaluate(() => document.getElementById('cancelMotivo').placeholder)),
    await page.evaluate(() => document.getElementById('cancelMotivo').placeholder));

  const tentar = (cat, det) => page.evaluate(async ({ cat, det }) => {
    document.getElementById('cancelVal').value = '89,90';
    document.getElementById('cancelCategoria').value = cat;
    document.getElementById('cancelMotivo').value = det;
    document.getElementById('cancelAutorNome').value = 'Israel';
    document.getElementById('cancelAutorSenha').value = 'certa';
    await addCancelamento();
    return document.getElementById('cancelMsg').textContent;
  }, { cat, det });

  const m1 = await tentar('', 'trocou o rodízio por meia porção');
  check('sem categoria o Caixa não grava', gravados.length === 0 && !!m1, m1);
  const m2 = await tentar('Produto em falta', 'Falta');
  check('"Falta" não grava nem com categoria escolhida', gravados.length === 0 && !!m2, m2);
  const m3 = await tentar('Troca de pedido ou produto', 'trocou o rodízio por meia porção');
  check('com categoria e detalhe, grava', gravados.length === 1, m3 + ' | ' + JSON.stringify(gravados));
  check('e manda a categoria junto pro banco',
    gravados[0] && gravados[0].motivo_categoria === 'Troca de pedido ou produto'
    && gravados[0].motivo === 'trocou o rodízio por meia porção', JSON.stringify(gravados[0]));
  check('continua gravando o nome VERIFICADO de quem autorizou',
    gravados[0] && gravados[0].autorizado_por === 'Israel Souza', JSON.stringify(gravados[0]));

  const naTela = await page.evaluate(() => document.getElementById('listaCancel').textContent);
  check('a lista do Caixa mostra categoria e detalhe',
    /Troca de pedido ou produto/.test(naTela) && /meia porção/.test(naTela), naTela.slice(0, 160));
  const limpou = await page.evaluate(() => document.getElementById('cancelCategoria').value);
  check('e a categoria volta pro vazio depois de gravar', limpou === '', limpou);

  check('nenhum erro de JS no caminho', erros.length === 0, erros.join(' | '));

  await ctx.close(); await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
