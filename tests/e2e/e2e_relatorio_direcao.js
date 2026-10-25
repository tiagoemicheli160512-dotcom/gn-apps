// "Nos relatórios para WhatsApp, e no PDF dos cards das lojas no painel de gestão,
//  poderia colocar as informações mais clean, tipo nome da loja, quantidade vendida, e
//  valor total (...) pois as vezes os emogis, fica muito informações, pra enviar para a
//  direção da empresa. Só dos cards mesmo, os demais pode deixar como está."
//
// Feito como TERCEIRO RECORTE, do mesmo jeito que o "🍖 Rodízio/feijoada" já funcionava:
// os três botões (Gerar PDF / WhatsApp / PDF no Whats) passam a gerar o resumo. O
// relatório completo, que é o operacional do dia a dia, não muda em nada.
//
// O que mais importa aqui:
//  - não sobrar NENHUM emoji no recorte (é o pedido literal);
//  - o total ser o mesmo número do relatório completo, nunca recalculado;
//  - a "quantidade vendida" não encostar no valor de um jeito que faça parecer que as
//    unidades geraram o faturamento inteiro — ela é só de rodízio e feijoada;
//  - não vazar pro relatório completo quando se volta pra ele.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => {
  console.log((c ? 'OK: ' : 'FALHOU: ') + n);
  if (!c && extra) console.log('      ' + extra);
  c ? ok++ : falhou++;
};

// Três lojas com faturamento (duas com buffet, uma sem), uma zerada, e a Maglia — que
// aparece na lista mas fica fora do total consolidado.
const DADOS = {
  range: { label: 'Outubro/2026', isCurrent: true }, per: 'mes', perTipo: 'Mensal',
  // 104420.89 + 94940.30 + 80000 = 279361.19 (a Maglia NÃO entra, como no app)
  total: 279361.19, dtGer: '16/10 09:12', metaFunc: 3500, metaFuncAtencao: 3000,
  lojasDados: [
    { k: 'NORTE_SHOPPING', nome: 'Norte Shopping', v: 104420.89, vP: 95800, meta: 149172,
      funcN: 36, vendaPorFunc: 2900, manut: 0, chkOk: true, porMes: null,
      buf: { rodizioQtd: 0, rodizio: 0, feijoadaQtd: 62, feijoada: 4100 } },
    { k: 'BANGU', nome: 'Bangu', v: 94940.30, vP: 77800, meta: 120177,
      funcN: 35, vendaPorFunc: 2712, manut: 2, chkOk: false, porMes: null,
      buf: { rodizioQtd: 32, rodizio: 2500, feijoadaQtd: 6, feijoada: 419.40 } },
    { k: 'MAGLIA', nome: 'Maglia', v: 51000, vP: 48000, meta: 60000,
      funcN: 12, vendaPorFunc: 4250, manut: 0, chkOk: true, porMes: null, buf: null },
    { k: 'PEDREIRA', nome: 'Pedreira', v: 80000, vP: 0, meta: 100000,
      funcN: 20, vendaPorFunc: 4000, manut: 0, chkOk: true, porMes: null, buf: null },
    { k: 'GUARULHOS', nome: 'Guarulhos', v: 0, vP: 0, meta: 90000,
      funcN: null, vendaPorFunc: null, manut: 0, chkOk: null, porMes: null, buf: null },
  ],
};

// Mesmo critério do app: 📊 💰 📍 🏪 ⚠ ✅ 🔧 🍖 🍲 🍽 🗓 👥 🔴 e os variation selectors.
const RE_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{25A0}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}]/u;

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message || e)));

  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try {
      await page.waitForFunction(() => {
        try { return typeof _relTextoDirecao === 'function' && typeof _relPDF === 'function' && typeof _relModalHtml === 'function'; }
        catch (e) { return false; }
      }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }

  const r = await page.evaluate((d) => {
    window._relData = d;
    _dashRelSel.clear();
    // Captura o HTML que _relPDF manda pra janela de impressão, sem abrir janela.
    const capturarPdf = () => {
      let html = '';
      const openOrig = window.open, fecharOrig = window.fecharTelaSobreposta;
      window.open = () => ({ document: { write: h => { html = h; }, close: () => {} } });
      window.fecharTelaSobreposta = () => {};
      try { _relPDF(); } finally { window.open = openOrig; window.fecharTelaSobreposta = fecharOrig; }
      return html;
    };

    window._relRecorte = '';
    const completo = _relTexto(true);
    const pdfCompleto = capturarPdf();

    window._relRecorte = 'dir';
    const dir = _relTexto(true);
    const dirPdfTexto = _relTexto(false);
    const dirPdf = capturarPdf();
    const modalDir = _relModalHtml();

    window._relRecorte = '';
    const completoDepois = _relTexto(true);
    const pdfCompletoDepois = capturarPdf();
    const modalCompleto = _relModalHtml();

    // Período em que nenhuma loja lançou rodízio nem feijoada.
    window._relData = Object.assign({}, d, { lojasDados: d.lojasDados.map(l => Object.assign({}, l, { buf: null })) });
    window._relRecorte = 'dir';
    const dirSemQtd = _relTexto(true);
    const dirPdfSemQtd = capturarPdf();

    // Nenhuma loja com faturamento.
    window._relData = Object.assign({}, d, { total: 0, lojasDados: d.lojasDados.map(l => Object.assign({}, l, { v: 0, buf: null })) });
    const dirVazio = _relTexto(true);

    // Com lojas escolhidas à mão, a Maglia passa a somar — então a nota some.
    window._relData = d;
    _dashRelSel.add('BANGU'); _dashRelSel.add('MAGLIA');
    const dirSelecionado = _relTexto(true);
    _dashRelSel.clear();

    window._relRecorte = '';
    return { completo, pdfCompleto, dir, dirPdfTexto, dirPdf, modalDir,
             completoDepois, pdfCompletoDepois, modalCompleto,
             dirSemQtd, dirPdfSemQtd, dirVazio, dirSelecionado };
  }, DADOS);

  // ── O pedido literal: sem emoji ─────────────────────────────────────────────
  const achaEmoji = t => (t.match(new RegExp(RE_EMOJI.source, 'gu')) || []).join(' ');
  check('a mensagem do WhatsApp não tem nenhum emoji', !RE_EMOJI.test(r.dir), 'achou: ' + achaEmoji(r.dir));
  check('a versão que vira PDF também não', !RE_EMOJI.test(r.dirPdfTexto), 'achou: ' + achaEmoji(r.dirPdfTexto));
  check('e o PDF impresso não tem emoji na tabela nem no título', !RE_EMOJI.test(r.dirPdf), 'achou: ' + achaEmoji(r.dirPdf));
  check('pra comparar: o relatório completo continua cheio deles (não foi ele que mudou)',
    RE_EMOJI.test(r.completo) && /📊/.test(r.completo) && /📍/.test(r.completo));

  // ── As três informações que ele pediu ───────────────────────────────────────
  check('traz o nome de cada loja que faturou',
    /Norte Shopping/.test(r.dir) && /Bangu/.test(r.dir) && /Pedreira/.test(r.dir));
  check('com o valor cheio, não o abreviado do painel',
    /R\$ 104\.420,89/.test(r.dir) && !/104,4k/.test(r.dir));
  check('e a quantidade vendida onde existe',
    /62 rodízio\/feijoada/.test(r.dir) && /38 rodízio\/feijoada/.test(r.dir));
  check('loja sem rodízio nem feijoada sai só com o valor, sem "0"',
    /\*Pedreira\* — R\$ 80\.000,00\s*$/m.test(r.dir));
  check('loja sem faturamento não entra na lista', !/Guarulhos/.test(r.dir));

  // ── A quantidade não pode parecer o que não é ───────────────────────────────
  check('a quantidade vem rotulada, nunca como um número solto antes do valor',
    !/—\s*\d[\d.]*\s*·\s*R\$/.test(r.dir));
  check('e o valor vem antes dela, que é o que a direção lê primeiro',
    /\*Bangu\* — R\$ 94\.940,30 · 38 rodízio\/feijoada/.test(r.dir));
  check('o total de rodízio e feijoada aparece somado, com o aviso de não somar de novo',
    /Rodízio e feijoada: 100 vendidos · R\$ 7\.019,40/.test(r.dir)
    && /já incluído no faturamento de cada loja/i.test(r.dir));

  // ── O total é o do app, não um recalculado ──────────────────────────────────
  check('o faturamento total é exatamente o mesmo número do relatório completo', (() => {
    // O completo escreve "Total:" e o recorte "Faturamento total:" — o rótulo muda, o
    // número é que não pode mudar.
    const a = /[Tt]otal: (R\$ [\d.,]+)/.exec(r.dir);
    const b = /[Tt]otal: (R\$ [\d.,]+)/.exec(r.completo);
    return a && b && a[1] === b[1] && a[1] === 'R$ 279.361,19';
  })(), 'dir=' + (/[Tt]otal: (R\$ [\d.,]+)/.exec(r.dir) || [])[1]);
  check('e some da soma a loja que o consolidado não soma',
    !/R\$ 330\.361,19/.test(r.dir));

  // ── A linha que não soma precisa dizer que não soma ─────────────────────────
  check('a Maglia aparece na lista (ela faturou)', /\*Maglia\* — R\$ 51\.000,00/.test(r.dir));
  check('mas o relatório avisa que ela não entra no total',
    /Maglia não entra no faturamento total consolidado/.test(r.dir));
  check('e quando as lojas são escolhidas à mão, o aviso some (aí ela soma)',
    !/não entra no faturamento total consolidado/.test(r.dirSelecionado));
  check('o PDF traz o mesmo aviso',
    /Maglia aparece na lista mas não entra no faturamento total consolidado/.test(r.dirPdf));

  // ── Período sem quantidade: a coluna/linha some em vez de virar traços ──────
  check('sem rodízio nem feijoada no período, nenhuma linha fala de quantidade',
    !/rodízio\/feijoada/.test(r.dirSemQtd) && !/vendidos/.test(r.dirSemQtd));
  check('e o PDF perde a coluna inteira em vez de encher de "—"',
    !/Rodízio\/feijoada \(qtd\)/.test(r.dirPdfSemQtd));
  check('mas com quantidade o PDF tem a coluna, com cabeçalho dizendo o que ela é',
    /Rodízio\/feijoada \(qtd\)/.test(r.dirPdf)
    && /o valor dela já está dentro do faturamento da loja/.test(r.dirPdf));
  check('período sem faturamento nenhum diz isso, em vez de sair uma lista vazia',
    /Nenhuma loja lançou faturamento neste período/.test(r.dirVazio));

  // ── O PDF é a tabela de 3 colunas, não a de 10 ──────────────────────────────
  check('o PDF do recorte não traz meta, Δ, funcionários nem manutenção',
    !/% Meta/.test(r.dirPdf) && !/Δ vs/.test(r.dirPdf) && !/R\$\/Func/.test(r.dirPdf) && !/Manut\./.test(r.dirPdf));
  check('nem a meta de venda por funcionário no rodapé',
    !/meta de venda por funcionário/.test(r.dirPdf));
  check('tem a linha de total no pé da tabela',
    /<td[^>]*>Total<\/td>/.test(r.dirPdf) && /R\$ 279\.361,19/.test(r.dirPdf));
  check('pra comparar: o PDF completo continua com as 10 colunas',
    /% Meta/.test(r.pdfCompleto) && /Manut\./.test(r.pdfCompleto) && /R\$\/Func/.test(r.pdfCompleto));

  // ── Não vaza pro relatório completo ─────────────────────────────────────────
  check('voltando pro Completo, a mensagem sai idêntica à de antes', r.completoDepois === r.completo);
  check('e o PDF completo também sai idêntico', r.pdfCompletoDepois === r.pdfCompleto);

  // ── O alternador ────────────────────────────────────────────────────────────
  check('o modal mostra os três recortes',
    /Completo/.test(r.modalDir) && /Rodízio\/feijoada/.test(r.modalDir) && /Direção/.test(r.modalDir));
  check('e marca o que está ativo', (() => {
    const botao = (html, arg) => {
      const i = html.indexOf("_relTrocarRecorte('" + arg + "')");
      if (i < 0) return '';
      const fim = html.indexOf('</button>', i);
      return html.slice(i, fim < 0 ? i + 500 : fim);
    };
    const ativo = h => /#CA8A04/.test(h);
    return ativo(botao(r.modalDir, 'dir')) && !ativo(botao(r.modalDir, ''))
        && ativo(botao(r.modalCompleto, '')) && !ativo(botao(r.modalCompleto, 'dir'));
  })());
  check('os três botões continuam lá (o recorte não some com nenhum)',
    /_relPDF\(\)/.test(r.modalDir) && /_relWhatsApp\(\)/.test(r.modalDir) && /_relPdfWhatsApp\(\)/.test(r.modalDir));

  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));

  await ctx.close();
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  console.log('\n--- como fica a mensagem pra direção ---\n' + r.dir);
  process.exit(falhou ? 1 : 0);
})();
