// "Verificar o controle de carne no app estoque e pedido aba carne. Ver de onde está puxando
//  as informações e colocar correto, pois quando entro tem loja que não tem nenhuma
//  informação, mesmo mudando a semana. O correto é mostrar o relatório da semana passada na
//  semana atual, pois é onde vemos se deu divergência ou não."
//
// Três coisas estavam erradas no renderCarnesCtrl:
//
// 1. A aba abria na semana ATUAL, cuja contagem ainda está sendo feita — tela vazia pra toda
//    loja. O certo é a semana passada, que é onde se confere divergência.
// 2. A busca usava nome_display. Quem grava em checklist_carnes é o Check-list, com o chkKey
//    de GN_LOJAS — Nova Iguaçu grava "Rancho". A aba dela vinha vazia em TODAS as semanas,
//    com 15 semanas de controle no banco. (O 2º candidato, `lojaObj.loja`, nem existe:
//    gn_lojas_pedido não tem essa coluna.)
// 3. A busca exigia semana_inicio na segunda exata. Sete linhas do banco estão gravadas em
//    outro dia, e em quatro delas é a única linha da semana — semana invisível.
//
// A interceptação é na REDE, não trocando `db`: ele é const no escopo do script, então
// window.db não substitui o que a função usa (um stub assim passa despercebido e dá falso
// positivo, porque a tela vazia também imprime os rótulos das carnes).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const PED = process.env.ARQ_PED || CAMINHOS.pub('gn-pedidos.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

// Os nomes dos campos são os que _carnesCardsHtml lê de verdade: `inicial`,
// `contagem_final` e `ent_<dia>`. Com os três zerados o card nem é desenhado, então o
// marcador precisa entrar em `inicial`.
const marcador = (v) => ({ carne_sol: { inicial: v, contagem_final: 0 } });

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + PED);
    try {
      await page.waitForFunction(() => {
        try { return typeof renderCarnesCtrl === 'function' && typeof getMondayOfWeek === 'function' && S !== undefined; }
        catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) { if (t >= 3) throw e; }
  }

  let linhas = [];              // o "banco" desta rodada
  const consultas = [];         // as requisições que o app realmente fez a checklist_carnes

  await ctx.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.includes('checklist_carnes')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    const p = url.searchParams;
    const q = { loja: p.get('loja'), semana_inicio: p.getAll('semana_inicio') };
    consultas.push(q);
    const val = (f) => (f || '').replace(/^(eq|gte|lte)\./, '');
    const loja = val(q.loja);
    const filtros = q.semana_inicio.map(f => ({ op: (f.split('.')[0]), v: val(f) }));
    const res = linhas.filter(r => r.loja === loja && filtros.every(f =>
      f.op === 'eq' ? r.semana_inicio === f.v :
      f.op === 'gte' ? r.semana_inicio >= f.v :
      f.op === 'lte' ? r.semana_inicio <= f.v : true));
    const objeto = (route.request().headers()['accept'] || '').includes('pgrst.object');
    return route.fulfill({ status: objeto ? (res.length ? 200 : 406) : 200,
      contentType: objeto ? 'application/vnd.pgrst.object+json' : 'application/json',
      body: JSON.stringify(objeto ? (res[0] || {}) : res) });
  });

  const abrir = async ({ slug, dados, semana }) => {
    linhas = dados; consultas.length = 0;
    const r = await page.evaluate(async ({ slug, semana }) => {
      S.lojas = [{ slug_pedido: 'nova_iguacu', nome_display: 'Nova Iguaçu' },
                 { slug_pedido: 'bangu', nome_display: 'Bangu' },
                 { slug_pedido: 'boulevard', nome_display: 'Boulevard' }];
      S.lojaAtiva = slug; S.carnesLoja = slug;
      S.carnesSemana = semana ? new Date(semana + 'T12:00:00') : null;
      try { await renderCarnesCtrl(); } catch (e) { return { erro: String(e && e.message) }; }
      return { semanaUsada: S.carnesSemana.toISOString().slice(0, 10),
               html: document.getElementById('content').innerHTML };
    }, { slug, semana });
    return { ...r, consultas: consultas.slice() };
  };
  // O marcador é um número que só existe no fixture — procurar pelo rótulo "Carne de Sol"
  // daria positivo também na tela vazia, que imprime os mesmos rótulos.
  const mostra = (r, v) => new RegExp('\\b' + v + '(?:[.,]0+)?\\b').test(r.html || '');

  // ── 1. Abre na semana passada ────────────────────────────────────────────────────────
  const semPassada = await page.evaluate(() => getMondayOfWeek(new Date(Date.now() - 7 * 864e5)).toISOString().slice(0, 10));
  const semAtual = await page.evaluate(() => getMondayOfWeek().toISOString().slice(0, 10));
  const r1 = await abrir({ slug: 'bangu', dados: [] });
  check('a aba abre na semana PASSADA, não na atual',
    r1.semanaUsada === semPassada && r1.semanaUsada !== semAtual);

  // ── 2. Nova Iguaçu acha o que está gravado como "Rancho" ─────────────────────────────
  const r2 = await abrir({ slug: 'nova_iguacu', semana: '2026-09-21',
    dados: [{ loja: 'Rancho', semana_inicio: '2026-09-21', semana_fim: '2026-09-27', carnes: marcador(7777), updated_at: '2026-09-28' }] });
  check('Nova Iguaçu acha o controle gravado como "Rancho"', mostra(r2, 7777));
  check('e o chkKey é o PRIMEIRO candidato consultado',
    r2.consultas.length > 0 && r2.consultas[0].loja === 'eq.Rancho');

  // ── 3. Semana gravada fora da segunda aparece ────────────────────────────────────────
  const r3 = await abrir({ slug: 'boulevard', semana: '2026-08-31',
    dados: [{ loja: 'Boulevard', semana_inicio: '2026-09-05', semana_fim: '2026-09-11', carnes: marcador(5555), updated_at: '2026-09-06' }] });
  check('linha gravada no sábado aparece na semana dela (Boulevard, 05/09)', mostra(r3, 5555));
  check('a consulta é por intervalo da semana, não pela segunda exata',
    r3.consultas.length > 0 && r3.consultas[0].semana_inicio.some(f => f.startsWith('gte.'))
      && r3.consultas[0].semana_inicio.some(f => f.startsWith('lte.')));

  // ── 4. Duas linhas na mesma semana: a da segunda ganha ───────────────────────────────
  const r4 = await abrir({ slug: 'bangu', semana: '2026-07-06',
    dados: [
      { loja: 'Bangu', semana_inicio: '2026-07-12', semana_fim: '2026-07-18', carnes: marcador(9999), updated_at: '2026-07-20' },
      { loja: 'Bangu', semana_inicio: '2026-07-06', semana_fim: '2026-07-12', carnes: marcador(1111), updated_at: '2026-07-07' }
    ] });
  check('havendo duas linhas na semana, a da segunda-feira é a usada',
    mostra(r4, 1111) && !mostra(r4, 9999));

  // ── 5. Loja sem controle na semana não quebra ────────────────────────────────────────
  const r5 = await abrir({ slug: 'bangu', semana: '2026-09-21', dados: [] });
  check('loja sem controle na semana não quebra a tela',
    !r5.erro && r5.consultas.length > 0 && !mostra(r5, 7777));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
