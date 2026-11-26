// Acompanhamento — o detalhe não pode empurrar a tela pros lados (26/11/2026).
// Print do dono: "No app home das lojas, a parte do barril estourou, claro e vinho." A
// diferença do chopp é uma frase ("−60 canecas (usou mais chopp do que vendeu)") e estava
// travada numa linha só: a Home da loja ia a 637 px numa tela de 360. Medido com os dados
// reais nas 11 lojas a 320 px: 27 detalhes estouravam (chopp claro, vinho e Coca); agora 0.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };
const BANCO_JS = `
  const CAT_CS = 'cat-cs-rj', CAT_LATA = 'cat-lata';
  const carnesPed = { carne_sol: { inicial: 50, ter: 40, qua: 42, ent_ter: 10 }, picanha: { inicial: 20, ter: 17, qua: 15.2 }, carne_seca: { inicial: 10, ter: 10 }, camarao: { inicial: 8, ter: 4, qua: 4 } };
  const tot = (cs, pc, cam) => ({ carne_sol: cs, picanha: pc, carne_seca: 0, camarao: cam, coca_un: 10, chopp_l_claro: 0, chopp_l_vinho: 0 });
  window.__BANCO = {
    'acomp:carnes': [{ loja: 'Pedreira', semana_inicio: '2026-11-23', carnes: carnesPed, updated_at: '2026-11-25T14:00:00Z' }],
    'acomp:vendidos': [
      { loja: 'PEDREIRA', data: '2026-11-23', totais: tot(10, 3, 4), itens: { coca_lata: { q: 10 } } },
      { loja: 'PEDREIRA', data: '2026-11-24', totais: tot(6, 1.8, 0), itens: { coca_lata: { q: 10 } } },
      { loja: 'PEDREIRA', data: '2026-11-25', totais: tot(5, 1, 0), itens: { coca_lata: { q: 10 } } },
    ],
    'acomp:rodizio': [],
    'acomp:cadastro': [{ id: 'coca_lata', grupo: 'coca', nome: 'Coca-Cola lata 350 ml', item_estoque: 37, ativo: true }],
    'acomp:choppCont': [], 'acomp:choppEnt': [],
    'acomp:carnesCat': [{ id: CAT_CS, item_id: 207, origem_item_id: null, regiao: 'RJ' }],
    'acomp:carnesRec': [],
    'acomp:estoqueCat': [{ id: CAT_LATA, item_id: 37, origem_item_id: null, und_por_caixa: 12 }],
    'acomp:estoqueCont': [{ loja_slug: 'pedreira', catalogo_id: CAT_LATA, atual: 100, data_contagem: '2026-11-23', criado_em: '2026-11-23T13:00:00Z' }],
    'acomp:estoqueRec': [], 'acomp:estoquePend': [],
  };
  window.gnFetchJson = async (url, h, nome, fb) => { (window.__CONSULTAS = window.__CONSULTAS || []).push(nome); return nome in window.__BANCO ? JSON.parse(JSON.stringify(window.__BANCO[nome])) : (fb === undefined ? [] : fb); };
`;
// Chopp da Pedreira com consumo e quase nenhuma venda → a frase longa da diferença.
const CHOPP_JS = `
  const C = (s, st, em) => ({ loja_slug: 'pedreira', semana_inicio: s, tipo: 'CLARO', status: st, criado_em: em });
  window.__BANCO['acomp:choppCont'] = [C('2026-11-16', 'CHEIO', '2026-11-16T13:00:00Z'), C('2026-11-23', 'CHEIO', '2026-11-23T13:00:00Z'), C('2026-11-23', 'CHEIO', '2026-11-23T13:00:00Z'),
    C('2026-11-26', 'NA_LINHA_METADE', '2026-11-26T13:00:00Z')];
  window.__BANCO['acomp:vendidos'].forEach(v => { v.totais.chopp_l_claro = 0.35; });
`;

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const erros = [];
  for (const largura of [320, 360]) {
    const ctx = await browser.newContext({ viewport: { width: largura, height: 800 }, timezoneId: 'America/Sao_Paulo' });
    await CAMINHOS.fixarRelogio(ctx, '2026-11-26T14:00:00');
    await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    const page = await ctx.newPage();
    page.on('pageerror', e => erros.push(String(e.message)));
    for (let t = 1; ; t++) {
      await page.goto('file://' + HOME);
      try { await page.waitForFunction(() => { try { return typeof showHome === 'function' && !!window.gnAcomp; } catch (e) { return false; } }, null, { timeout: 25000 }); break; }
      catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
    }
    await page.evaluate(BANCO_JS); await page.evaluate(CHOPP_JS);
    const r = await page.evaluate(async (largura) => {
      const s = { id: 7, nome: 'Ana', cargo: 'gerente', loja: 'PEDREIRA', permissoes: {}, ts: Date.now() };
      session = s; masterLoja = ''; try { showHome(s); } catch (e) {}
      for (let i = 0; i < 40 && !document.querySelector('#acomp-home-loja .acomp-cel'); i++) await new Promise(r => setTimeout(r, 100));
      const out = { largura, itens: {} };
      for (let i = 0; i < 7; i++) {
        const cel = document.querySelector(`#acomp-home-loja .acomp-cel[data-i="${i}"]`);
        cel.click(); await new Promise(r => setTimeout(r, 50));
        out.itens[i] = { w: document.documentElement.scrollWidth, det: (document.querySelector('#acomp-home-loja .acomp-detalhe') || {}).innerText || '' };
        document.querySelector(`#acomp-home-loja .acomp-cel[data-i="${i}"]`).click();
      }
      return out;
    }, largura);
    const estouros = Object.entries(r.itens).filter(([, v]) => v.w > largura).map(([i, v]) => i + ':' + v.w + 'px');
    check(`${largura} px: nenhum dos 7 detalhes empurra a Home pros lados`, estouros.length === 0, estouros);
    check(`${largura} px: o detalhe do chopp mostra a frase longa inteira (quebrando linha)`, /canecas \(usou mais chopp do que vendeu\)/.test(r.itens[4].det), r.itens[4].det.slice(0, 300));
    await ctx.close();
  }
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
