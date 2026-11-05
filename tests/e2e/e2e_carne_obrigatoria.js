// "No feriado tem que ser obrigatório a contagem, pois ao deixar pra terça o valor muda
//  completamente. (...) criar o mesmo sistema que criamos pro hortifruti, onde tem o botão
//  de liberar a contagem, e assim, ao ser liberado, aparece como obrigatório pra quem
//  acessar colocar. Não permitir colocar zero sem justificar que estava zero mesmo."
//
// MEDIDO no feriado de 02/11/2026 (Finados, segunda): ZERO contagens em gn_contagens_pedido
// naquele dia — nenhuma loja, nenhum item. As 11 contaram na TERÇA 03/11 e a Campo Grande
// na quarta 04/11. Seis lojas (Pedreira 09:38, Nova América 09:54, Campo Grande 10:03,
// Norte Shopping 10:22, Bangu 11:28, São Gonçalo 13:55) abriram a aba Carnes do Check-list
// na segunda e gravaram a linha da semana — mas o estoque de abertura das 4 carnes não vem
// dali. As 11 linhas da semana ficaram carimbadas `inicialDe: 2026-11-03`.
//
// Nenhuma contagem se perdeu no caminho: ninguém contou. É isso que esta trava resolve.
//
// A trava é do app inteiro (decisão do dono), e por isso o que esta suíte mais cobra é a
// SAÍDA: zero passa desde que escrito o porquê, e nenhum estado deixa a loja presa sem
// caminho. Travar a loja fora do app no fim do expediente é pior do que a contagem atrasada.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (!c && extra !== undefined ? ' >> ' + String(extra).slice(0, 220) : '')); c ? ok++ : falhou++; };

const HOJE = '2026-11-02';           // o feriado medido
const SLUG = 'bangu';
// Ids do catálogo do RIO (CARNE_OBRIG_ITEM_ID) e os uuids que eles resolvem.
const CAT_RJ = [
  { id: 'uuid-sol',  item_id: 207, origem_item_id: null },
  { id: 'uuid-seca', item_id: 209, origem_item_id: null },
  { id: 'uuid-pic',  item_id: 392, origem_item_id: null },
  { id: 'uuid-cam',  item_id: 237, origem_item_id: null },
];
// São Paulo: mesma carne, item_id próprio, ligada pelo origem_item_id. Itaquera e Guarulhos
// gravariam no item do Rio se isto não fosse respeitado.
const CAT_SP = [
  { id: 'sp-sol',  item_id: 1207, origem_item_id: 207 },
  { id: 'sp-seca', item_id: 1209, origem_item_id: 209 },
  { id: 'sp-pic',  item_id: 1392, origem_item_id: 392 },
  { id: 'sp-cam',  item_id: 1237, origem_item_id: 237 },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, HOJE + 'T09:30:00');

  let obrigatorio = [{ data: HOJE, motivo: 'Finados' }];
  let jaContado = [];                 // linhas de gn_contagens_pedido de hoje
  const gravados = [];
  const catalogoPerguntado = [];
  let catalogoVazio = false;
  let falharGravacao = false;

  await ctx.route('**/rest/v1/**', async r => {
    const req = r.request(), url = decodeURIComponent(req.url());
    const json = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (req.method() !== 'GET') {
      if (/gn_contagens_pedido/.test(url)) {
        if (falharGravacao) return r.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
        try { gravados.push(JSON.parse(req.postData() || '[]')); } catch (e) {}
        return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (/gn_carne_contagem_obrigatoria/.test(url)) return json(obrigatorio);
    if (/gn_catalogo/.test(url)) {
      // SÓ a consulta das 4 carnes. Respondendo toda consulta ao catálogo com estas linhas,
      // o app montava a lista de insumos a partir delas e estourava em `p.produto.trim()` —
      // erro do dublê, não do app (conferido: chamar getTodosInsumos no arquivo limpo e no
      // de origin/main não estoura). De quebra, isto prova que o app pede o filtro certo.
      if (!/item_id=in\.\(/.test(url)) return json([]);
      if (catalogoVazio) return json([]);
      const sp = /regiao=eq\.SP/.test(url);
      catalogoPerguntado.push(sp ? 'SP' : 'RJ');
      // Fiel ao banco: em SP as 4 carnes são linhas com item_id PRÓPRIO (1207, 1209...),
      // e quem as liga aos números do Rio é origem_item_id. Perguntar `item_id=in.(207…)`
      // dentro de regiao=SP não acha nada. Devolver as linhas de SP pra essa pergunta
      // deixava passar o filtro resolvendo pelo campo errado.
      const porOrigem = /origem_item_id=in\.\(/.test(url);
      if (sp) return json(porOrigem ? CAT_SP : []);
      return json(porOrigem ? [] : CAT_RJ);
    }
    if (/gn_contagens_pedido/.test(url)) {
      // Honra o filtro de data que o app manda. Sem isto, trocar `data_contagem=eq.hoje`
      // por qualquer outra coisa passava no teste — a asserção de "contagem de ontem não
      // vale" era vazia, porque o dublê devolvia o mesmo nos dois casos.
      const m = /data_contagem=eq\.([\d-]+)/.exec(url);
      const dia = m ? m[1] : null;
      return json(jaContado.filter(r => !dia || r.data_contagem === dia));
    }
    return json([]);
  });

  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.stack || e.message)));
  await page.goto('file://' + ARQ);
  try {
    await page.waitForFunction(() => {
      try { return typeof _carneObrigVerificar === 'function' && typeof _carneObrigSalvar === 'function'
                && typeof _carneObrigEstado === 'function'; } catch (e) { return false; }
    }, { timeout: 25000 });
  } catch (e) {
    console.log('FALHOU: a trava de contagem de carne não existe neste arquivo (recurso novo — contraprova esperada)');
    console.log('\n0 OK, 35 falhou');
    await browser.close(); process.exit(1);
  }

  const abrir = (lojaNome) => page.evaluate(async (l) => {
    const ov = document.getElementById('carneObrigOverlay'); if (ov) ov.remove();
    // Zera os DOIS caches: o da trava e o do resolvedor compartilhado. Sem o segundo, o
    // mapa de uma rodada anterior sobrevivia e o cenário de "catálogo fora do ar" media
    // um cache quente em vez da falha.
    _carneObrigDia = null; _carneObrigIds = null; _carneObrigFeito = false; _carnesChkCatIds = null;
    loja = l;
    usuarioAtual = { id: 1, nome: 'Tiago', cargo: 'gerente', loja: l };
    await _carneObrigVerificar();
    const o = document.getElementById('carneObrigOverlay');
    return { aberto: !!o, texto: o ? o.textContent : '', feito: _carneObrigFeito };
  }, lojaNome);

  const digitar = (vals, justs) => page.evaluate(({ vals, justs }) => {
    Object.entries(vals).forEach(([k, v]) => {
      const el = document.getElementById('carneObrig_' + k);
      if (el) { el.value = v; }
    });
    Object.entries(justs || {}).forEach(([k, v]) => {
      const el = document.getElementById('carneObrigJustTxt_' + k);
      if (el) el.value = v;
    });
    if (!document.getElementById('carneObrigOverlay')) return { semTrava: true, ok: false, aviso: '', btnTravado: true, justVisivel: [] };
    const st = _carneObrigSync();
    const btn = document.getElementById('carneObrigBtn');
    return { ok: st.ok, aviso: document.getElementById('carneObrigAviso').textContent,
             btnTravado: !!btn.disabled,
             justVisivel: ['carne_sol','picanha','carne_seca','camarao'].filter(k =>
               !document.getElementById('carneObrigJust_' + k).classList.contains('hidden')) };
  }, { vals, justs });

  // ── 1. O dia marcado trava; o dia comum não ───────────────────────────────────────────
  const a = await abrir('BANGU');
  check('no dia marcado, o app abre travado na contagem', a.aberto, a.texto.slice(0, 120));
  check('e diz o motivo que o Compras escreveu', /Finados/.test(a.texto), a.texto.slice(0, 160));
  check('mostra as 4 carnes', ['Carne de Sol','Picanha','Carne Seca','Camarão'].every(n => a.texto.includes(n)));

  obrigatorio = [];
  const semDia = await abrir('BANGU');
  check('num dia que não foi marcado, nada trava', !semDia.aberto, semDia.texto.slice(0, 100));
  obrigatorio = [{ data: HOJE, motivo: 'Finados' }];

  // ── 2. Quem já contou hoje não é travado de novo ──────────────────────────────────────
  const quatro = (dia, atual) => [
    { catalogo_id: 'uuid-sol', atual, data_contagem: dia }, { catalogo_id: 'uuid-seca', atual, data_contagem: dia },
    { catalogo_id: 'uuid-pic', atual, data_contagem: dia }, { catalogo_id: 'uuid-cam', atual, data_contagem: dia }];
  jaContado = quatro(HOJE, 10);
  const jaFez = await abrir('BANGU');
  check('loja que já contou hoje entra direto', !jaFez.aberto && jaFez.feito, jaFez.texto.slice(0, 100));
  // Contagem PARCIAL não vale: faltando uma carne, a semana fica torta do mesmo jeito.
  jaContado = quatro(HOJE, 10).slice(0, 2);
  const parcial = await abrir('BANGU');
  check('contagem pela metade ainda trava — falta carne é semana torta igual', parcial.aberto);
  // Contagem de ONTEM não serve: é justamente o atraso que a trava existe pra evitar. As 4
  // carnes estão contadas, só que no dia errado — se isso liberasse, a trava não serviria.
  jaContado = quatro('2026-10-26', 10);
  const ontem = await abrir('BANGU');
  check('contagem de outro dia não conta como feita hoje', ontem.aberto);
  // Linha gravada sem valor é linha sem contagem: `atual` nulo não pode passar por contado.
  jaContado = quatro(HOJE, null);
  const semValor = await abrir('BANGU');
  check('linha gravada sem valor não conta como contada', semValor.aberto);
  jaContado = [];

  // ── 3. O que a tela exige ─────────────────────────────────────────────────────────────
  const vazio = await digitar({});
  check('com tudo vazio, o botão fica travado e diz o que falta',
    vazio.btnTravado && /Falta contar/.test(vazio.aviso), vazio.aviso);
  const faltaUma = await digitar({ carne_sol: '10', picanha: '5', carne_seca: '2' });
  check('faltando uma carne, continua travado e nomeia qual',
    faltaUma.btnTravado && /Camarão/.test(faltaUma.aviso), faltaUma.aviso);
  const invalido = await digitar({ carne_sol: 'abc', picanha: '5', carne_seca: '2', camarao: '1' });
  check('valor que não é número é recusado', invalido.btnTravado && /inválido/i.test(invalido.aviso), invalido.aviso);
  const negativo = await digitar({ carne_sol: '-3', picanha: '5', carne_seca: '2', camarao: '1' });
  check('e número negativo também', negativo.btnTravado, negativo.aviso);
  const cheio = await digitar({ carne_sol: '10,5', picanha: '5', carne_seca: '2', camarao: '1' });
  check('com as 4 contadas, libera', !cheio.btnTravado && cheio.ok && !cheio.aviso, cheio.aviso);

  // ── 4. O zero, que é o pedido explícito ───────────────────────────────────────────────
  const zeroSemJust = await digitar({ carne_sol: '0', picanha: '5', carne_seca: '2', camarao: '1' }, { carne_sol: '' });
  check('zero sem justificativa NÃO passa', zeroSemJust.btnTravado && /zerado/.test(zeroSemJust.aviso), zeroSemJust.aviso);
  check('e o campo de justificativa aparece só na carne zerada',
    zeroSemJust.justVisivel.join(',') === 'carne_sol', JSON.stringify(zeroSemJust.justVisivel));
  const zeroCurta = await digitar({ carne_sol: '0', picanha: '5', carne_seca: '2', camarao: '1' }, { carne_sol: 'acabou' });
  check('justificativa curta demais não vale (burlar o campo não é justificar)',
    zeroCurta.btnTravado, zeroCurta.aviso);
  const zeroOk = await digitar({ carne_sol: '0', picanha: '5', carne_seca: '2', camarao: '1' },
                               { carne_sol: 'acabou no domingo, entrega só amanha' });
  check('zero COM justificativa passa — é a saída que impede a loja de ficar presa', !zeroOk.btnTravado && zeroOk.ok, zeroOk.aviso);
  const vazioNaoEhZero = await digitar({ carne_sol: '', picanha: '5', carne_seca: '2', camarao: '1' });
  check('campo em branco não é tratado como zero: quem não digitou ainda não contou',
    vazioNaoEhZero.btnTravado && /Falta contar/.test(vazioNaoEhZero.aviso), vazioNaoEhZero.aviso);
  check('e não abre a caixa de "por que está zerado" num campo que ainda está vazio',
    !vazioNaoEhZero.justVisivel.includes('carne_sol'), JSON.stringify(vazioNaoEhZero.justVisivel));

  // ── 5. O que vai pro banco ────────────────────────────────────────────────────────────
  gravados.length = 0;
  await digitar({ carne_sol: '0', picanha: '5,5', carne_seca: '2', camarao: '1' },
                { carne_sol: 'acabou no domingo, entrega só amanha' });
  const salvou = await page.evaluate(async () => {
    await _carneObrigSalvar();
    return { aberto: !!document.getElementById('carneObrigOverlay'), feito: _carneObrigFeito };
  });
  const linhas = gravados[0] || [];
  check('salvar fecha a trava', !salvou.aberto && salvou.feito, JSON.stringify(salvou));
  check('grava as 4 carnes na data de hoje, pra esta loja',
    linhas.length === 4 && linhas.every(l => l.data_contagem === HOJE && l.loja_slug === SLUG),
    JSON.stringify(linhas.map(l => l.data_contagem + '|' + l.loja_slug)));
  check('com o número que a loja digitou, vírgula entendida como decimal',
    linhas.some(l => l.atual === 5.5) && linhas.some(l => l.atual === 0),
    JSON.stringify(linhas.map(l => l.atual)));
  check('e a justificativa do zero vai junto, só na carne zerada',
    linhas.filter(l => l.zero_justificativa).length === 1 &&
    /acabou no domingo/.test(linhas.find(l => l.zero_justificativa).zero_justificativa),
    JSON.stringify(linhas.map(l => l.zero_justificativa)));
  check('grava no mesmo lugar da contagem de segunda (gn_contagens_pedido)',
    linhas.every(l => l.catalogo_id && l.catalogo_id.startsWith('uuid-')),
    JSON.stringify(linhas.map(l => l.catalogo_id)));

  // Botão travado não é a única porta: o Enter e um estado de tela antigo chegam em
  // _carneObrigSalvar do mesmo jeito. Com o formulário incompleto, nada pode ir pro banco.
  gravados.length = 0;
  await abrir('BANGU');   // o salvamento acima fechou a trava; reabre pra testar a outra porta
  await digitar({ carne_sol: '1', picanha: '2' });
  const incompleto = await page.evaluate(async () => {
    await _carneObrigSalvar();
    return !!document.getElementById('carneObrigOverlay');
  });
  check('chamar o salvar com o formulário incompleto não grava nada e não destrava',
    gravados.length === 0 && incompleto, JSON.stringify(gravados));

  // ── 6. São Paulo tem outro item pra mesma carne ───────────────────────────────────────
  jaContado = []; gravados.length = 0;
  await abrir('ITAQUERA');
  await digitar({ carne_sol: '1', picanha: '2', carne_seca: '3', camarao: '4' });
  await page.evaluate(() => _carneObrigSalvar());
  const spLinhas = gravados[0] || [];
  check('em São Paulo grava no item do catálogo de SP, não no do Rio',
    spLinhas.length === 4 && spLinhas.every(l => String(l.catalogo_id).startsWith('sp-')),
    JSON.stringify(spLinhas.map(l => l.catalogo_id)));
  check('e com o slug da loja de SP', spLinhas.every(l => l.loja_slug === 'itaquera'), JSON.stringify(spLinhas.map(l => l.loja_slug)));

  // Troca de loja DENTRO da mesma sessão, sem zerar cache nenhum — é o que o mestre faz.
  // Com o cache do catálogo guardado sem a região, a primeira loja aberta definia o mapa e
  // a segunda gravava no item da região errada, em silêncio.
  jaContado = []; gravados.length = 0;
  await page.evaluate(() => { _carneObrigDia = null; _carneObrigIds = null; _carnesChkCatIds = null; });
  await page.evaluate(async () => {
    loja = 'BANGU'; usuarioAtual = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'BANGU' };
    await _carneObrigVerificar();
  });
  await digitar({ carne_sol: '1', picanha: '2', carne_seca: '3', camarao: '4' });
  await page.evaluate(() => _carneObrigSalvar());
  // Agora troca pra uma loja de SP mantendo a sessão (e o cache) quentes.
  await page.evaluate(async () => {
    const ov = document.getElementById('carneObrigOverlay'); if (ov) ov.remove();
    _carneObrigDia = null; _carneObrigFeito = false;
    loja = 'ITAQUERA'; usuarioAtual = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'ITAQUERA' };
    await _carneObrigVerificar();
  });
  await digitar({ carne_sol: '9', picanha: '8', carne_seca: '7', camarao: '6' });
  await page.evaluate(() => _carneObrigSalvar());
  const trocou = gravados[gravados.length - 1] || [];
  check('trocar de loja no meio da sessão não reaproveita o catálogo da região anterior',
    trocou.length === 4 && trocou.every(l => String(l.catalogo_id).startsWith('sp-')),
    JSON.stringify(trocou.map(l => l.catalogo_id)));

  // ── 7. Nenhum estado deixa a loja presa ───────────────────────────────────────────────
  jaContado = [];
  falharGravacao = true;
  await abrir('BANGU');
  await digitar({ carne_sol: '1', picanha: '2', carne_seca: '3', camarao: '4' });
  const falhou1 = await page.evaluate(async () => {
    await _carneObrigSalvar();
    const btn = document.getElementById('carneObrigBtn');
    return { aberto: !!document.getElementById('carneObrigOverlay'),
             btnVolta: btn && !btn.disabled, aviso: document.getElementById('carneObrigAviso').textContent };
  });
  check('se o salvamento falhar, o botão volta a funcionar em vez de travar de vez',
    falhou1.aberto && falhou1.btnVolta && /internet|de novo/i.test(falhou1.aviso), JSON.stringify(falhou1));
  falharGravacao = false;

  // Catálogo que falha e depois volta: o mapa vazio NÃO pode ficar cacheado. Com ele
  // guardado, toda tentativa seguinte na mesma sessão resolveria vazio e a loja nunca mais
  // conseguiria salvar — sem erro nenhum aparecer na tela.
  jaContado = []; gravados.length = 0;
  catalogoVazio = true;
  await abrir('BANGU');
  await digitar({ carne_sol: '1', picanha: '2', carne_seca: '3', camarao: '4' });
  await page.evaluate(() => _carneObrigSalvar());
  const naFalha = gravados.length;
  catalogoVazio = false;
  await page.evaluate(() => _carneObrigSalvar());
  check('catálogo que falhou e voltou: a segunda tentativa grava (mapa vazio não fica cacheado)',
    naFalha === 0 && gravados.length === 1 && (gravados[0] || []).length === 4,
    'naFalha=' + naFalha + ' depois=' + JSON.stringify(gravados));

  // Rede fora ao verificar: não dá pra saber se hoje é obrigatório. Deixar a loja fora do
  // app por causa disso é pior do que a contagem atrasada.
  await ctx.unroute('**/rest/v1/**');
  await ctx.route('**/rest/v1/**', r => r.abort('failed'));
  const semRede = await abrir('BANGU');
  check('sem internet, o app abre normal em vez de prender a loja do lado de fora', !semRede.aberto);

  // ── 8. Sessão retomada ────────────────────────────────────────────────────────────────
  // Quem já estava logado não passa pela tela de login — e é justamente quem recarrega o
  // app ou volta de outro app. Se a trava só rodasse no login, a loja escaparia dela
  // fechando e abrindo o app.
  await ctx.unroute('**/rest/v1/**');
  await ctx.route('**/rest/v1/**', async r => {
    const url = decodeURIComponent(r.request().url());
    const json = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (r.request().method() !== 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (/gn_carne_contagem_obrigatoria/.test(url)) return json([{ data: HOJE, motivo: 'Finados' }]);
    if (/gn_catalogo/.test(url)) return json(/item_id=in\.\(/.test(url) ? CAT_RJ : []);
    if (/gn_contagens_pedido/.test(url)) return json([]);
    if (/gn_usuarios/.test(url)) return json([{ id: 1, nome: 'Tiago', cargo: 'gerente', loja: 'BANGU', permissoes: {} }]);
    return json([]);
  });
  const p2 = await ctx.newPage();
  await p2.addInitScript(() => {
    try {
      sessionStorage.setItem('gn_usuario', JSON.stringify({ id: 1, nome: 'Tiago', cargo: 'gerente', loja: 'BANGU', validado: true }));
      sessionStorage.setItem('gn_loja_sessao', 'BANGU');
    } catch (e) {}
  });
  await p2.goto('file://' + ARQ);
  let travouNaRetomada = false;
  try {
    await p2.waitForSelector('#carneObrigOverlay', { timeout: 12000 });
    travouNaRetomada = true;
  } catch (e) {}
  check('sessão retomada (recarregou o app) também cai na trava', travouNaRetomada);
  await p2.close();

  check('resolve a carne pela região da loja, não pelo catálogo inteiro',
    catalogoPerguntado.includes('RJ') && catalogoPerguntado.includes('SP'), JSON.stringify(catalogoPerguntado));
  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
