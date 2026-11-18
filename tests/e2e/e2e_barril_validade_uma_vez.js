// Nova América, 17/11/2026: chegaram 7 de 10 barris de claro (AMBEV), recebimento parcial.
// A validade dos 7 foi gravada às 12:09:13 e de novo às 12:09:49 — o Painel › Chopp passou
// a mostrar 14 entregues e os vazios de claro caíram 14 em vez de 7. Causa: a validade é
// gravada antes do "Confirmar recebimento?"; quem cancela ali e tenta de novo gravava tudo
// outra vez.
//
// Cobra: 1ª tentativa grava as validades e desconta os vazios uma vez; a 2ª tentativa do
// MESMO recebimento não grava nem desconta de novo e segue pro recebimento; outro
// recebimento (o restante dos 3) continua gravando normalmente.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };

const CLARO = 'd8d457b1-0fb9-4c58-952b-27c175700f1f';

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-17T12:09:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + LOJAS);
    try { await page.waitForFunction(() => { try { return typeof _confirmarValidadeBarrisEProsseguir === 'function' && typeof abrirModalValidadeBarris === 'function'; } catch (e) { return false; } }, null, { timeout: 20000 }); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: o app Lojas não carregou'); process.exit(1); } }
  }

  await page.evaluate(CLARO => {
    loja = 'NOVA AMERICA'; usuarioAtual = { nome: 'Júlia', cargo: 'estoquista' };
    provisoesEntrega = [
      { id: 'prov-7', catalogo_id: CLARO, qtd_prevista: 10, fornecedor: 'AMBEV', gn_catalogo: { produto: 'Barril Chopp claro 50 litros', und: 'BARRIL' } },
      { id: 'prov-resto', catalogo_id: CLARO, qtd_prevista: 3, fornecedor: 'AMBEV', parcial_origem: 'prov-7', gn_catalogo: { produto: 'Barril Chopp claro 50 litros', und: 'BARRIL' } },
    ];
    window.__banco = { validade: [], vazios: 52 }; window.__confirmou = [];
    confirmarEntrega = id => { window.__confirmou.push(id); };   // o "Confirmar recebimento?" (testado em outras suítes)
    carregarBarris = () => {};
    sbRequest = async (rota, opt) => {
      const m = (opt && opt.method) || 'GET'; const b = opt && opt.body ? JSON.parse(opt.body) : null;
      if (/^gn_barris_validade\?/.test(rota) && m === 'GET') {
        const pid = decodeURIComponent((rota.match(/provisao_id=eq\.([^&]+)/) || [])[1] || '');
        return window.__banco.validade.filter(v => !pid || v.provisao_id === pid).map((v, i) => ({ id: 'v' + i }));
      }
      if (rota === 'gn_barris_validade' && m === 'POST') { window.__banco.validade.push(...b); return null; }
      if (/^gn_barris_vazios\?loja_slug/.test(rota) && m === 'GET') return [{ qtd_vazios: window.__banco.vazios }];
      if (/^gn_barris_vazios\?on_conflict/.test(rota)) { window.__banco.vazios = b.qtd_vazios; return null; }
      return [];
    };
  }, CLARO);

  const tentar = (id, qtd) => page.evaluate(async ({ id, qtd }) => {
    abrirModalValidadeBarris(id);
    document.getElementById('barrilModalQtd').value = qtd; _atualizarCamposValidadeBarris();
    document.querySelectorAll('.barril-validade-input').forEach(i => { i.value = '2026-11-25'; });
    await _confirmarValidadeBarrisEProsseguir(id);
    return { validade: window.__banco.validade.length, vazios: window.__banco.vazios, confirmou: window.__confirmou.slice() };
  }, { id, qtd });

  const a = await tentar('prov-7', 7);
  check('1ª tentativa: grava as 7 validades e desconta 7 vazios (52 → 45)', a.validade === 7 && a.vazios === 45 && a.confirmou.length === 1, a);
  const b = await tentar('prov-7', 7);   // cancelou o "Confirmar recebimento?" e tentou de novo
  check('2ª tentativa do MESMO recebimento: não grava de novo (continua 7, não 14) nem desconta os vazios de novo', b.validade === 7 && b.vazios === 45, b);
  check('…e segue pro "Confirmar recebimento?" normalmente', b.confirmou.length === 2 && b.confirmou[1] === 'prov-7', b);
  const c = await tentar('prov-resto', 3);
  check('o restante (outra provisão, 3 barris) grava as validades dele e desconta 3 vazios', c.validade === 10 && c.vazios === 42 && c.confirmou[2] === 'prov-resto', c);

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
