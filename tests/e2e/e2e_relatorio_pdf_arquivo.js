// "Pode fazer o PDF no Whats do relatório de visitas também" (13/11/2026)
//
// O "📄 PDF" do Painel abre a página no padrão GN e quem vira PDF é a impressão do celular —
// não sai arquivo, e o "PDF no Whats" mandava um PDF de texto corrido, sem formato nenhum.
// Agora o MESMO HTML do padrão vira arquivo (gnRelatorioPDFArquivo): iframe do tamanho da A4,
// foto da página, fatias por página cortando entre blocos.
//
// html2canvas e jsPDF vêm de CDN; aqui são de mentira, pra prova não depender de rede: o que
// se prova é o caminho (mesmo HTML, sem o print automático, várias páginas, arquivo .pdf
// compartilhado) — o desenho em si é das bibliotecas.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 400, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof _visSupPdfHtml === 'function' && typeof window.gnRelatorioHtml === 'function'; } catch (e) { return false; } }, { timeout: 25000 }); break; }
    catch (e) {
      if (t >= 3) {
        const existe = await page.evaluate(() => typeof window.gnRelatorioPDFArquivo === 'function');
        console.log(existe ? 'FALHOU: o painel não carregou' : 'FALHOU: gnRelatorioPDFArquivo não existe neste arquivo (contraprova esperada — é novo)');
        await browser.close(); process.exit(1);
      }
    }
  }

  const R = await page.evaluate(async () => {
    const cap = { h2c: [], paginas: 1, imagens: [], compartilhado: null, impressoes: 0 };
    // ── bibliotecas de mentira ──
    window.html2canvas = async (el, o) => {
      const doc = el.ownerDocument;
      cap.h2c.push({ html: doc.documentElement.outerHTML, temScriptPrint: /window\.print/.test(doc.documentElement.outerHTML), largura: o.width, altura: o.height, escala: o.scale, cors: o.useCORS });
      const c = document.createElement('canvas'); c.width = Math.ceil(o.width * o.scale); c.height = Math.ceil(o.height * o.scale); return c;
    };
    window.jspdf = { jsPDF: class { constructor() { this.internal = { pageSize: { getWidth: () => 595.28, getHeight: () => 841.89 } }; }
      addPage() { cap.paginas++; } addImage(d, f, x, y, w, h) { cap.imagens.push({ f, h: Math.round(h) }); }
      output() { return new Blob(['%PDF-1.3'], { type: 'application/pdf' }); } } };
    navigator.canShare = () => true;
    navigator.share = async (o) => { cap.compartilhado = { nome: o.files[0].name, tipo: o.files[0].type, titulo: o.title }; };

    // ── relatório de visitas de um supervisor, um mês cheio ──
    _visSupSelecionado = 'Carlos'; _visSupPeriodo = 'mensal'; _visSupDe = '2026-10-01'; _visSupAte = '2026-10-31';
    _visSupData = [];
    for (let d = 1; d <= 31; d++) {
      const dia = '2026-10-' + String(d).padStart(2, '0');
      _visSupData.push({ id: 'v' + d, loja: ['Bangu', 'Caxias', 'Itaquera'][d % 3], data: dia, visitante: 'Carlos', hora_chegada: '09:00', hora_saida: '12:00',
        obs: 'Visita de rotina com conferência de estoque, validade, limpeza e treinamento da equipe do turno da manhã.' });
    }
    const r = _visSupPdfHtml();
    const iframesAntes = document.querySelectorAll('iframe').length;
    await enviarPDFVisitasSupWpp();
    cap.iframesSobraram = document.querySelectorAll('iframe').length - iframesAntes;

    // ── o "📄 PDF" de sempre continua abrindo a impressão ──
    window.open = () => ({ document: { write: (h) => { cap.impressoes++; cap.htmlImpressao = h; }, close() {} } });
    gerarPDFVisitasSup();
    cap.r = { titulo: r.titulo };
    return cap;
  });

  const h = R.h2c[0] || {};
  check('o PDF no Whats fotografa a MESMA página do "📄 PDF" (marca GN, título, cartões, calendário, tabela)',
    /Sistema de Gestão/.test(h.html || '') && /Visitas — Carlos/.test(h.html || '') && /Visitas presenciais/i.test(h.html || '') && /class="cal/.test(h.html || '') && /Entradas e saídas/.test(h.html || ''), (h.html || '').slice(0, 200));
  check('…sem o comando de imprimir (não abre a impressão no meio)', h.temScriptPrint === false);
  check('…na largura de uma A4 e com as fotos liberadas (useCORS)', h.largura === 794 && h.cors === true && h.escala >= 1.5, h);
  check('relatório de um mês sai em várias páginas', R.paginas > 1 && R.imagens.length === R.paginas, { paginas: R.paginas, imgs: R.imagens.length });
  check('nenhuma página passa da folha', R.imagens.every(i => i.h <= 842 - 44 + 1), R.imagens.map(i => i.h));
  check('compartilha um ARQUIVO .pdf com o nome do relatório', R.compartilhado && R.compartilhado.tipo === 'application/pdf' && /^Visitas_Carlos_.*Outubro_2026\.pdf$/.test(R.compartilhado.nome), R.compartilhado);
  check('o iframe escondido some depois', R.iframesSobraram === 0, R.iframesSobraram);
  check('o "📄 PDF" de antes continua igual: abre a página com a impressão', R.impressoes === 1 && /window\.print/.test(R.htmlImpressao || ''));

  // Corte entre blocos: com linhas de 120px numa página de ~1053px, o corte cai no fim de uma linha.
  const corte = await page.evaluate(async () => {
    const alturas = [];
    window.jspdf = { jsPDF: class { constructor() { this.internal = { pageSize: { getWidth: () => 595.28, getHeight: () => 841.89 } }; }
      addPage() {} addImage(d, f, x, y, w, hh) { alturas.push(hh * 794 / 595.28); } output() { return new Blob(['%PDF']); } } };
    const linhas = Array.from({ length: 40 }, (_, i) => `<tr><td style="height:120px">Linha ${i + 1}</td></tr>`).join('');
    await gnRelatorioPDFArquivo({ titulo: 'Teste', html: `<table>${linhas}</table>` });
    return alturas.map(a => Math.round(a));
  });
  const pagPx = Math.floor((841.89 - 44) * 794 / 595.28);
  check('o corte cai entre linhas (cada página é menor que a folha cheia, não fatia uma linha no meio)', corte.length > 2 && corte.slice(0, -1).every(a => a < pagPx && a > pagPx * 0.35), { corte, pagPx });
  // ── Os outros relatórios: o "PDF no Whats" usa o "📄 PDF" do próprio relatório ──
  const lig = await page.evaluate(() => {
    const pares = { enviarPDFFeriasWpp: 'gerarPDFFerias', enviarPDFCarnesWpp: 'gerarPDFCarnes', enviarPDFTriosWpp: 'gerarPDFTrios',
      enviarPDFBancoWpp: 'gerarPDFBanco', enviarPDFExtraWpp: 'gerarPDFExtra', enviarPDFBarrisWpp: 'gerarPDFBarris',
      enviarPDFXadrezWpp: 'gerarPDFXadrez', enviarPDFAlertasWpp: 'gerarPDFAlertas', enviarPDFCancelWpp: 'gerarPDFCancel',
      enviarPDFSem10Wpp: 'gerarPDFSem10', compartilharPDFDocRHWpp: 'gerarPDFDocRH', enviarPDFVisitasSupWpp: 'gerarPDFVisitasSup', _relPdfWhatsApp: '_relPDF' };
    return Object.entries(pares).filter(([f, g]) => !new RegExp('_pdfWppComo\\(' + g + '\\)').test(String(window[f]))).map(([f]) => f);
  });
  check('os 13 "PDF no Whats" (Férias, Carnes, Trios, Banco, Extra, Barris, Xadrez, Alertas, Cancelamentos, Sem 10%, Documento RH, Visitas e o relatório do Painel) usam o "📄 PDF" do próprio relatório', lig.length === 0, lig);
  const ferias = await page.evaluate(async () => {
    const cap = {};
    window.html2canvas = async (el, o) => { cap.html = el.ownerDocument.documentElement.outerHTML; const c = document.createElement('canvas'); c.width = 10; c.height = 10; return c; };
    window.jspdf = { jsPDF: class { constructor() { this.internal = { pageSize: { getWidth: () => 595.28, getHeight: () => 841.89 } }; } addPage() {} addImage() {} output() { return new Blob(['%PDF']); } } };
    navigator.share = async (o) => { cap.arquivo = o.files[0].name + '|' + o.files[0].type; };
    let impressao = 0; const abrir = window.open; window.open = () => { impressao++; return null; };
    window._feriasRelatorioTexto = () => ({ titulo: 'Férias — Novembro/2026', msg: 'Férias — Novembro/2026\nBangu:\n  Ana · 01/11 a 30/11' });
    await enviarPDFFeriasWpp();
    window.open = abrir;
    cap.impressao = impressao;
    cap.padraoDeVolta = String(window.gnRelatorioPDF).includes('window.open');
    return cap;
  });
  check('Férias: o PDF no Whats sai no padrão GN (marca, título dourado, conteúdo) como arquivo .pdf', /Sistema de Gestão/.test(ferias.html || '') && /Férias — Novembro\/2026/.test(ferias.html || '') && /Ana · 01\/11 a 30\/11/.test(ferias.html || '') && /^F.rias_Novembro_2026\.pdf\|application\/pdf$/.test(ferias.arquivo || ''), ferias.arquivo);
  check('…sem abrir a janela de impressão, e o "📄 PDF" normal volta a funcionar depois', ferias.impressao === 0 && ferias.padraoDeVolta);
  check('nenhum erro de JavaScript', erros.length === 0, erros);

  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
