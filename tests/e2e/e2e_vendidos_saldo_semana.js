// Painel › Vendidos, semana em andamento (23/11/2026): "queria ter a visão do saldo inicial —
// não tem nada ainda, ou vai aparecer amanhã ao lançar a primeira venda?". Não ia: o quadro da
// Coca só abria com a semana fechada. Agora mostra, desde a segunda: saldo inicial (contagem
// de segunda) + o que chegou depois dela − o vendido lançado = o que deveria ter hoje.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + String(extra).slice(0, 400))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-25T15:00:00');   // quarta: segunda e terça já lançadas
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => { try { return typeof _loadVendidosGerencia === 'function' && typeof _buildVendidosPanel === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 });
  const r = await page.evaluate(async () => {
    LOJAS_LISTA = ['BANGU', 'GUARULHOS'];
    const CAT = { lata: 'cat-lata', ks: 'cat-ks' };
    const vend = (loja, data, lata, ks) => ({ loja, data, totais: { coca_un: lata + ks }, itens: { coca_lata: { q: lata, grupo: 'coca' }, coca_ks: { q: ks, grupo: 'coca' } }, lancado_por: 'X' });
    window.gnFetchJson = async (url, h, nome, fb) => {
      if (nome === 'vendidos:diario') return [vend('BANGU', '2026-11-23', 20, 10), vend('BANGU', '2026-11-24', 15, 8)];
      if (nome === 'vendidos:barris') return [];
      if (nome === 'vendidos:cadastro') return [{ id: 'coca_lata', grupo: 'coca', nome: 'Coca-Cola lata 350 ml', ativo: true, item_estoque: 37 }, { id: 'coca_ks', grupo: 'coca', nome: 'Coca-Cola KS 290 ml', ativo: true, item_estoque: 36 }];
      if (nome === 'vendidos:estoqueCat') return [{ id: CAT.lata, item_id: 37, origem_item_id: null, und_por_caixa: 12 }, { id: CAT.ks, item_id: 36, origem_item_id: null, und_por_caixa: 24 }];
      if (nome === 'vendidos:estoqueCont') return [   // contagem real de Bangu em 23/11 (lata 102, KS 124)
        { loja_slug: 'bangu', catalogo_id: CAT.lata, atual: 102, data_contagem: '2026-11-23', criado_em: '2026-11-23T14:49:00Z' },
        { loja_slug: 'bangu', catalogo_id: CAT.ks, atual: 124, data_contagem: '2026-11-23', criado_em: '2026-11-23T14:49:00Z' },
      ];
      if (nome === 'vendidos:estoqueRec') return [
        { qtd_recebida: 2, validado_em: '2026-11-24T13:00:00Z', gn_provisoes: { loja_slug: 'bangu', catalogo_id: CAT.lata } },   // depois da contagem: soma
        { qtd_recebida: 3, validado_em: '2026-11-23T11:00:00Z', gn_provisoes: { loja_slug: 'bangu', catalogo_id: CAT.ks } },     // antes da contagem: já está nela
      ];
      if (nome === 'vendidos:estoquePend') return [{ loja_slug: 'bangu', catalogo_id: CAT.ks, qtd_prevista: 4 }];
      return fb === undefined ? [] : fb;
    };
    _vendGerOff = 1; await _loadVendidosGerencia();
    const el = document.createElement('div'); el.innerHTML = _buildVendidosPanel(); document.body.appendChild(el);
    const box = k => { const x = el.querySelector(`.vend-loja[data-loja="${k}"] .vend-estoque`); return x ? x.innerText.replace(/\s+/g, ' ') : ''; };
    return { bangu: box('BANGU'), guarulhos: box('GUARULHOS') };
  });
  check('Bangu: o quadro de saldo aparece já na semana em andamento, com a hora da contagem', /SALDO DA SEMANA/.test(r.bangu) && /contagem de segunda \(23\/11, 11:49\)/.test(r.bangu), r.bangu);
  check('lata: 102 + 24 (2 cx chegaram depois da contagem) − 35 vendidas em 2 dias = 91', /lata 350 ml 102 \+24 −35 91/.test(r.bangu) && /Vendido \(2 dias\)/.test(r.bangu), r.bangu);
  check('KS: recebimento ANTES da contagem não soma de novo: 124 + 0 − 18 = 106', /KS 290 ml 124 \+0 −18 106/.test(r.bangu), r.bangu);
  check('pedido aguardando no recebimento aparece como aviso', /aguardando/.test(r.bangu) && /KS 290 ml: 4 cx/.test(r.bangu), r.bangu);
  check('Guarulhos sem contagem de segunda: diz isso (não some)', /sem a contagem de segunda/.test(r.guarulhos), r.guarulhos);
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  await browser.close();
  console.log(`\n${ok} ok, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
