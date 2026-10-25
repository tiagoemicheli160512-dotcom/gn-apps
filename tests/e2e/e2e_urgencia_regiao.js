// "No app estoque e pedido as urgências de São Paulo estão cadastradas? Itaquera sinalizou
//  que no app lojas aba pedido dele não tá aparecendo nenhuma urgência."
//
// Não estavam. A lista de urgência é UMA só pra rede, mas os ids são por região: o catálogo
// do Rio vai de 0 a 512 e o de São Paulo de 1004 a 1506, sem um id em comum. Os 88 marcados
// eram todos do Rio — nenhum de SP.
//
// O efeito em Itaquera não era "nenhuma urgência aparece": era uma trava de lista VAZIA. A
// tela escondia o catálogo inteiro, bloqueava o Finalizar e dizia, ao mesmo tempo, "88 itens
// marcados" e "0 ainda sem contagem lançada" — os dois números na foto do relato.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

// Faixas reais de item_id em gn_catalogo.
const prod = (item, nome, grupo) => ({ item, produto: nome, fornecedor: 'AMBEV', grupo: grupo || 'BEBIDAS',
  subgrupo: 'REFRIGERANTE', und: 'CX', custo: 35.28 });
const CATALOGO_SP = [prod(1004, 'Agua Tonica cx c/ 12 und'), prod(1011, 'Guaraná cx LT cx c/ 12 unds'),
                     prod(1120, 'Queijo coalho Fardo c/ 46 Kg', 'PERECÍVEIS'), prod(1506, 'Carne de Sol', 'PRODUÇÃO')];
const CATALOGO_RJ = [prod(14, 'Agua Tonica cx c/ 12 und'), prod(16, 'Guaraná cx LT cx c/ 12 unds'),
                     prod(222, 'Queijo coalho Fardo c/ 46 Kg', 'PERECÍVEIS'), prod(344, 'Carne de Sol', 'PRODUÇÃO'),
                     prod(377, 'CORONA LN ZERO')];
// Os marcados hoje, todos do Rio.
const URGENCIA_RJ = ['14', '16', '222', '344'];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 420, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + LOJAS);
    try {
      await page.waitForFunction(() => {
        try { return typeof render === 'function' && typeof _urgAplicavel === 'function' && PRODUTOS_PEDIDO; }
        catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) { if (t >= 3) { console.log('FALHOU: o app Lojas não carregou'); await browser.close(); process.exit(1); } }
  }

  const temFix = await page.evaluate(() => typeof _urgItensPresentes === 'function');
  if (!temFix) console.log('· contraprova: arquivo sem _urgItensPresentes — rodando o comportamento antigo');

  // Monta a aba Pedido de uma loja, com o catálogo da região dela.
  const abrir = (lojaKey, catalogo, urg) => page.evaluate(([lojaKey, catalogo, urg]) => {
    usuarioAtual = { nome: 'Teste', cargo: 'estoquista', loja: lojaKey };
    loja = lojaKey;
    urgenciaGlobal = urg;
    PRODUTOS_PEDIDO.length = 0; PRODUTOS_PEDIDO.push(...catalogo);
    pedidoCustom = []; pedidoRemovidos = [];
    _urgPendente = _urgAplicavel();          // é o que _checarUrgenciaPendencia conclui sem envio na semana
    _envioSemana = {};
    window._pedidoFiltro = ''; window._pedidoGrupo = '__TODOS__'; // sem trava a tela filtra por grupo; aqui interessa a lista inteira
    tab = 'pedido';
    render();
    const html = document.getElementById('content').innerHTML;
    return {
      aplicavel: _urgAplicavel(),
      presentes: typeof _urgItensPresentes === 'function' ? _urgItensPresentes().length : null,
      faltamContar: _urgFaltamContar(),
      linhas: document.querySelectorAll('#content .row-item[data-pid]').length,
      travado: /Conte primeiro a urgência/.test(html),
      finalizarBloqueado: /Envie a urgência primeiro/.test(html),
      badge: (html.match(/(?:🔒 Urgência|⚡ Urg) \((\d+)\)/) || [])[1] || null,
    };
  }, [lojaKey, catalogo, urg]);

  // ── 1. Itaquera (SP) com a urgência do Rio: o caso do relato ──────────────────────
  const sp = await abrir('ITAQUERA', CATALOGO_SP, URGENCIA_RJ);
  check('nenhum item da urgência do Rio existe na lista de SP', sp.presentes === 0 || sp.presentes === null);
  check('SP não entra na trava de urgência', sp.aplicavel === false);
  check('a lista abre inteira em vez de vazia', sp.linhas === CATALOGO_SP.length);
  check('e o Finalizar volta a funcionar', sp.finalizarBloqueado === false && sp.travado === false);
  check('a tela não promete itens que não existem lá', sp.badge === null);
  // O sintoma que denunciava a incoerência na foto: 88 marcados e 0 a contar.
  check('some a contradição "N marcados / 0 a contar"',
    !(sp.badge && Number(sp.badge) > 0 && sp.faltamContar === 0 && sp.linhas === 0));

  // ── 2. Rio continua exatamente como está hoje ─────────────────────────────────────
  const rj = await abrir('BANGU', CATALOGO_RJ, URGENCIA_RJ);
  check('no Rio a trava continua valendo', rj.aplicavel === true && rj.travado === true);
  check('mostrando só os itens de urgência', rj.linhas === URGENCIA_RJ.length);
  check('com o número certo no selo', rj.badge === String(URGENCIA_RJ.length));
  check('e o Finalizar segue bloqueado até a urgência sair', rj.finalizarBloqueado === true);
  check('com a contagem pendente batendo', rj.faltamContar === URGENCIA_RJ.length);

  // ── 3. Marcação parcial: o selo conta o que a loja tem, não o que a rede marcou ───
  const parcial = await abrir('BANGU', [prod(14, 'Agua Tonica cx c/ 12 und'), prod(377, 'CORONA LN ZERO')], URGENCIA_RJ);
  check('loja com só 1 dos 4 marcados mostra 1, não 4', parcial.badge === '1' && parcial.presentes === 1);
  check('e a trava vale, porque há o que priorizar', parcial.aplicavel === true && parcial.linhas === 1);

  // ── 4. Guardas que já existiam continuam de pé ───────────────────────────────────
  const semMarcacao = await abrir('BANGU', CATALOGO_RJ, []);
  check('sem nada marcado na rede, nada trava', semMarcacao.aplicavel === false && semMarcacao.linhas === CATALOGO_RJ.length);
  const maglia = await abrir('Maglia', CATALOGO_RJ, URGENCIA_RJ);
  check('Maglia continua fora da trava', maglia.aplicavel === false);

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
