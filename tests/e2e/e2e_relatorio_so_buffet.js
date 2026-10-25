// "Poderia também colocar a opção de gerar o relatório só das vendas do rodízio e da
//  feijoada."
//
// Feito como ALTERNADOR, não como quarto botão: ligado, os três botões que já existem
// passam a gerar o recorte. Os dois de WhatsApp saem do mesmo _relTexto (o "PDF no
// WhatsApp" transforma o próprio texto em PDF); o "Gerar PDF" tem tabela própria.
//
// O que mais importa aqui é o que o recorte NÃO pode fazer: inventar total somando de
// novo o que já está no faturamento, e vazar pro relatório completo quando se desliga.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

// Mesmos números do print do dono, mais uma loja sem buffet e uma sem venda nenhuma.
const DADOS = {
  range: { label: '01/10 a 09/10', isCurrent: true }, per: 'mes', perTipo: 'Período',
  total: 300000, dtGer: '09/10/2026 14:51', metaFunc: 3500, metaFuncAtencao: 3000,
  storesWithData: 3,
  lojasDados: [
    { nome: 'Norte Shopping', v: 104420.89, vP: 95800, meta: 149172, funcN: 36,
      vendaPorFunc: 2900, manut: 0, chkOk: true,
      buf: { rodizioQtd: 0, rodizio: 0, feijoadaQtd: 62, feijoada: 4100 } },
    { nome: 'Bangu', v: 94940.30, vP: 77800, meta: 120177, funcN: 35,
      vendaPorFunc: 2712, manut: 2, chkOk: false,
      buf: { rodizioQtd: 32, rodizio: 2500, feijoadaQtd: 6, feijoada: 419.40 } },
    { nome: 'Pedreira', v: 80000, vP: 0, meta: 100000, funcN: 20,
      vendaPorFunc: 4000, manut: 0, chkOk: true, buf: null },
    { nome: 'Guarulhos', v: 0, vP: 0, meta: 90000, funcN: null,
      vendaPorFunc: null, manut: 0, chkOk: null, buf: null },
  ],
};
const brl = n => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try {
      await page.waitForFunction(() => { try { return typeof _relTextoBuffet === 'function' && typeof _relModalHtml === 'function'; } catch (e) { return false; } }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }

  const r = await page.evaluate((d) => {
    window._relData = d;
    window._relRecorte = '';
    const completo = _relTexto(true);
    window._relRecorte = 'buf';
    const buffet = _relTexto(true);
    const buffetPdf = _relTexto(false);
    const modalLigado = _relModalHtml();
    window._relRecorte = '';
    const completoDepois = _relTexto(true);
    const modalDesligado = _relModalHtml();
    return { completo, buffet, buffetPdf, modalLigado, modalDesligado, completoDepois };
  }, DADOS);

  // ── O recorte tem só o buffet ────────────────────────────────────────────────
  check('o título diz do que é o relatório', /🍽 \*GN Rodízio e Feijoada — Período 01\/10 a 09\/10\*/.test(r.buffet));
  check('não traz faturamento, meta nem funcionário',
    !/104\.420,89/.test(r.buffet) && !/meta 70%/.test(r.buffet) && !/👥/.test(r.buffet) && !/\/func/.test(r.buffet));
  check('traz os totais de rodízio e de feijoada separados',
    /🍖 \*Rodízio: 32 · R\$ 2\.500,00\*/.test(r.buffet) && /🍲 \*Feijoada: 68 · R\$ 4\.519,40\*/.test(r.buffet));
  check('e o total do buffet, que é a soma dos dois',
    /💰 \*Total: R\$ 7\.019,40\*/.test(r.buffet));

  // ── O total não pode ser inventado ──────────────────────────────────────────
  // 2500 + 419,40 + 4100 = 7019,40. Se alguém somar faturamento junto, estoura.
  check('o total é exatamente a soma do buffet das lojas, nada mais', (() => {
    const m = /💰 \*Total: R\$ ([\d.,]+)\*/.exec(r.buffet);
    return m && m[1] === brl(2500 + 419.40 + 4100);
  })());
  check('e o aviso de não somar de novo está lá',
    /já estão dentro do faturamento de cada loja/i.test(r.buffet));

  // ── Ordem e conteúdo por loja ───────────────────────────────────────────────
  const lojas = r.buffet.split('\n').filter(l => /^📍/.test(l));
  check('lista quem vendeu mais buffet primeiro', (() => {
    // Norte Shopping 4.100 > Bangu 2.919,40
    return lojas.length === 2 && /Norte Shopping/.test(lojas[0]) && /Bangu/.test(lojas[1]);
  })());
  check('loja sem buffet não entra na lista', !lojas.some(l => /Pedreira|Guarulhos/.test(l)));
  check('mas é nomeada no fim, pra não parecer esquecida',
    /Sem rodízio nem feijoada:.*Pedreira.*Guarulhos/.test(r.buffet));
  check('a loja que só vendeu feijoada não mostra rodízio zerado', (() => {
    const i = r.buffet.split('\n').findIndex(l => /Norte Shopping/.test(l));
    const det = r.buffet.split('\n')[i + 1];
    return /🍲 62/.test(det) && !/🍖/.test(det);
  })());
  check('a loja com os dois mostra os dois', (() => {
    const i = r.buffet.split('\n').findIndex(l => /Bangu/.test(l));
    const det = r.buffet.split('\n')[i + 1];
    return /🍖 32/.test(det) && /🍲 6 /.test(det);
  })());
  check('mostra quanto o buffet representa do faturamento da loja', (() => {
    const i = r.buffet.split('\n').findIndex(l => /Norte Shopping/.test(l));
    // 4100 / 104420,89 = 3,9%
    return /3,9% do faturamento/.test(r.buffet.split('\n')[i + 1]);
  })());
  check('mantém o alfinete e o espaço entre lojas, como no relatório completo',
    /\n\n📍 \*Bangu\*/.test(r.buffet));

  // ── Não vaza pro relatório completo ─────────────────────────────────────────
  check('com o recorte desligado, o relatório completo volta igual', r.completoDepois === r.completo);
  check('e o completo continua trazendo faturamento e meta',
    /104\.420,89/.test(r.completo) && /meta 70%/.test(r.completo));

  // ── A versão do PDF não leva asterisco ──────────────────────────────────────
  check('no PDF o recorte sai sem asterisco', !r.buffetPdf.includes('*'));
  check('e com o mesmo conteúdo', /Rodízio: 32/.test(r.buffetPdf) && /Total: R\$ 7\.019,40/.test(r.buffetPdf));

  // ── O alternador no modal ───────────────────────────────────────────────────
  check('o modal mostra os três recortes', /Completo/.test(r.modalLigado) && /🍖 Rodízio\/feijoada/.test(r.modalLigado) && /Direção/.test(r.modalLigado));
  check('e marca a que está ativa', (() => {
    // Mede cada botão pelo SEU proprio onclick: olhar "os N caracteres antes do rótulo"
    // pegava o botão vizinho, que no modo desligado é justamente o ativo.
    const botao = (html, arg) => {
      const i = html.indexOf("_relTrocarRecorte('" + arg + "')");
      if (i < 0) return '';
      const fim = html.indexOf('</button>', i);
      return html.slice(i, fim < 0 ? i + 500 : fim);
    };
    const ativo = h => /#CA8A04/.test(h);
    return ativo(botao(r.modalLigado, 'buf')) && !ativo(botao(r.modalLigado, ''))
        && ativo(botao(r.modalDesligado, '')) && !ativo(botao(r.modalDesligado, 'buf'));
  })());
  check('os três botões continuam no modal (o recorte não some com nenhum)',
    /_relPDF\(\)/.test(r.modalLigado) && /_relWhatsApp\(\)/.test(r.modalLigado) && /_relPdfWhatsApp\(\)/.test(r.modalLigado));

  // ── Período sem nenhuma venda de buffet ─────────────────────────────────────
  const vazio = await page.evaluate((d) => {
    window._relData = Object.assign({}, d, { lojasDados: d.lojasDados.map(l => Object.assign({}, l, { buf: null })) });
    window._relRecorte = 'buf';
    const t = _relTexto(true);
    window._relRecorte = '';
    return t;
  }, DADOS);
  check('período sem buffet diz isso, em vez de sair vazio ou com total zerado',
    /Nenhuma venda de rodízio ou feijoada lançada neste período/.test(vazio) && !/R\$ 0,00/.test(vazio));

  await ctx.close();
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  console.log('\n--- como fica a mensagem ---\n' + r.buffet);
  process.exit(falhou ? 1 : 0);
})();
