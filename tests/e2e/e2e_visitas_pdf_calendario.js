// "É possível no relatório do PDF, quando for gerar, aparecer assim igual o calendário,
//  podendo selecionar dia, semana e mês, e no relatório ter a entrada e saída o horário."
//
// Antes, o 📄 PDF da aba Relatório (Painel → Visitas) imprimia o texto corrido do
// WhatsApp. Agora ele desenha o período escolhido (Dia/Semana/Mês/Trimestre) como o
// calendário da tela, com entrada → saída em cada visita, e fecha com a tabela de
// entradas e saídas.
//
// O fixture copia o formato real de gn_chk_visitas, inclusive o lote que existe em
// produção: o mesmo acompanhamento remoto lançado em 11 lojas com o mesmo horário. No
// quadrado ele tem que virar UM bloco; na tabela, onze linhas.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const path = require('path');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (!c && extra !== undefined ? ' >> ' + String(extra).slice(0, 240) : '')); c ? ok++ : falhou++; };

const HOJE = '2026-10-20';
const LOTE = ['São Gonçalo','Norte Shopping','Guarulhos','Boulevard','Pedreira','Itaquera','Nova América','Campo Grande','Rancho','Bangu','Caxias'];
const VISITAS = [
  { data: '2026-09-30', loja: 'Bangu', visitante: 'Tiago', hora_chegada: '09:00', hora_saida: '10:00', tipo_visita: 'rotina' }, // fora do mês
  { data: '2026-10-01', loja: 'Campo Grande', visitante: 'Tiago', hora_chegada: '08:41', hora_saida: '11:02', tipo_visita: 'remoto' },
  { data: '2026-10-02', loja: 'Bangu', visitante: 'Tiago', hora_chegada: '18:24', hora_saida: '20:10', tipo_visita: 'rotina', obs: 'Conferência de câmara <fria>' },
  { data: '2026-10-06', loja: 'FOLGA', visitante: 'Tiago', hora_chegada: '00:00', hora_saida: '00:00' },
  { data: '2026-10-09', loja: 'Bangu', visitante: 'Tiago', hora_chegada: '13:08', hora_saida: '13:50', tipo_visita: 'rotina', foto_chegada: 'https://exemplo.test/chegada.jpg', foto_saida: 'https://exemplo.test/saida.jpg' },
  { data: '2026-10-09', loja: 'Caxias', visitante: 'Tiago', hora_chegada: '13:57', hora_saida: null, tipo_visita: 'rotina' },
  ...LOTE.map(l => ({ data: '2026-10-13', loja: l, visitante: 'Tiago', hora_chegada: '07:45', hora_saida: '17:51', tipo_visita: 'remoto' })),
  { data: '2026-10-14', loja: 'Boulevard', visitante: 'Tiago', hora_chegada: '09:15', hora_saida: '10:05', tipo_visita: 'rotina' },
  { data: '2026-10-14', loja: 'Pedreira', visitante: 'Tiago', hora_chegada: 'PLAN', hora_saida: 'PLAN' }, // plano não feito
  { data: '2026-10-15', loja: 'Bangu', visitante: 'Tiago', hora_chegada: '14:15', hora_saida: '16:40', tipo_visita: 'rotina' },
  { data: '2026-10-15', loja: 'Bangu', visitante: 'Tiago', hora_chegada: 'PLAN', hora_saida: 'PLAN' }, // plano cumprido
  { data: '2026-10-28', loja: 'Itaquera', visitante: 'Tiago', hora_chegada: 'PLAN', hora_saida: 'PLAN' }, // previsto (futuro)
];

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 414, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, HOJE + 'T12:00:00');
  await ctx.route('**/rest/v1/**', async r => {
    const u = decodeURIComponent(r.request().url());
    const json = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/gn_chk_visitas/.test(u)) {
      const g = /data=gte\.([\d-]+)/.exec(u), l = /data=lte\.([\d-]+)/.exec(u);
      const de = g ? g[1] : '0000-00-00', ate = l ? l[1] : '9999-99-99';
      return json(VISITAS.filter(v => v.data >= de && v.data <= ate));
    }
    return json([]);
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message)));
  await page.goto('file://' + HOME);
  try {
    await CAMINHOS.esperarApp(page, ['_visSupData', '_visSupPeriodo', 'COR_LOJA'], ['gerarPDFVisitasSup', '_setVisSupPeriodo']);
  } catch (e) { console.log('FALHOU: o Painel não carregou'); console.log('\n0 ok, 1 falhou'); await browser.close(); process.exit(1); }

  // Captura o documento que o botão 📄 PDF escreve na janela nova.
  await page.evaluate(() => {
    window.__pdfs = [];
    window.open = () => { const doc = { _h: '', write(h) { this._h += h; }, close() { window.__pdfs.push(this._h); } }; return { document: doc }; };
  });

  const gerar = (periodo, anchor) => page.evaluate(async ({ periodo, anchor }) => {
    session = { nome: 'Mestre', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    _visSupList = [{ nome: 'Tiago', cargo: 'supervisor' }];
    _visSupSelecionado = 'Tiago';
    _visSupView = 'relatorio';
    _visSupPeriodo = periodo;
    const { de, ate } = _visSupRangeParaPeriodo(new Date(anchor + 'T12:00'), periodo);
    _visSupDe = de; _visSupAte = ate;
    await _carregarVisitasSupData();
    window.__pdfs = [];
    gerarPDFVisitasSup();
    return { html: window.__pdfs[0] || '', de, ate };
  }, { periodo, anchor });

  const semTags = h => h.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

  // ── Mês ──────────────────────────────────────────────────────────────────────────────
  const mes = await gerar('mensal', '2026-10-15');
  const tMes = semTags(mes.html);
  const cal = (mes.html.split('Entradas e saídas')[0]);
  check('o PDF abre a janela de impressão com o documento', /window\.print/.test(mes.html) && mes.html.length > 1000, mes.html.length);
  check('desenha o calendário do mês, Dom→Sáb', /<table class="cal">/.test(mes.html) && /Outubro 2026/.test(mes.html) && /<th>Dom<\/th><th>Seg<\/th>/.test(mes.html));
  const nCelulas = (cal.match(/<td class="cd/g) || []).length;
  check('a grade de outubro/2026 tem 5 semanas (35 quadrados)', nCelulas === 35, nCelulas);
  check('o quadrado traz a loja com entrada → saída', /Bangu[\s\S]{0,120}18:24 → 20:10/.test(cal), cal.slice(0, 300));
  check('presencial com 📍 e remoto com 💻 no quadrado', /📍 18:24/.test(cal) && /💻 08:41 → 11:02/.test(cal));
  check('visita sem saída aparece como "em andamento"', /13:57 → em andamento/.test(cal));
  check('o lote remoto de 11 lojas vira UM bloco no quadrado', /💻 11 lojas/.test(cal) && (cal.match(/07:45 → 17:51/g) || []).length === 1, (cal.match(/07:45 → 17:51/g) || []).length);
  check('e o bloco lista as lojas do lote', /Guarulhos/.test(cal) && /Itaquera/.test(cal));
  check('folga escrita no quadrado', /🌴 Folga/.test(cal));
  check('plano passado sem visita aparece como "não feita"', /📅 Pedreira <i>não feita<\/i>/.test(cal), (cal.match(/📅[^<]*<i>[^<]*/g) || []).join(' | '));
  check('plano futuro aparece como "prevista"', /📅 Itaquera <i>prevista<\/i>/.test(cal));
  check('plano cumprido não aparece de novo como plano', !/📅 Bangu/.test(cal));
  check('dia de setembro não entra no PDF de outubro', !/09:00 → 10:00/.test(mes.html));
  check('tabela com Entrada, Saída e Duração', /<th>Entrada<\/th><th>Saída<\/th><th>Duração<\/th>/.test(mes.html));
  const linhasTab = (mes.html.split('Entradas e saídas')[1] || '').match(/<tr>/g) || [];
  // 17 visitas reais (1+1+2+11+1+1) + 1 folga + o cabeçalho; os planos não entram na tabela.
  check('a tabela lista loja por loja, inclusive as 11 do lote', linhasTab.length === 17 + 1 + 1, linhasTab.length);
  check('duração calculada na tabela', /1h 46min/.test(tMes) && /10h 6min/.test(tMes), tMes.slice(0, 200));
  check('a observação da visita vai na tabela, escapada (< > não vira HTML)', /💬 Conferência de câmara &lt;fria&gt;/.test(mes.html) && !/<fria>/.test(mes.html));
  // Planos: 3 no mês (Pedreira 14 não feita, Bangu 15 cumprida, Itaquera 28 futura) — mesma
  // conta da aba Relatório, que também considera o plano futuro do período.
  check('KPIs: 5 presenciais, 12 remotos e planos 1/3', /Visitas presenciais[\s\S]{0,80}>5</.test(mes.html) && /12 remotos/.test(tMes) && /33%/.test(tMes) && /1\/3/.test(tMes), tMes.slice(0, 300));
  check('mês sai em paisagem e com cor na impressão', /size:A4 landscape/.test(mes.html) && /print-color-adjust:exact/.test(mes.html));
  check('o título do arquivo leva supervisor e período', /<title>Visitas Tiago — Outubro 2026<\/title>/.test(mes.html), (mes.html.match(/<title>[^<]*/) || [''])[0]);

  // ── Semana ───────────────────────────────────────────────────────────────────────────
  const sem = await gerar('semanal', '2026-10-14');
  const calSem = sem.html.split('Entradas e saídas')[0];
  check('semana: 7 quadrados, de segunda a domingo', (calSem.match(/<td class="cd/g) || []).length === 7 && /<th>Seg 12\/10<\/th>/.test(calSem) && /<th>Dom 18\/10<\/th>/.test(calSem), (calSem.match(/<th>[^<]*/g) || []).join(','));
  check('semana: só as visitas da semana', /09:15 → 10:05/.test(sem.html) && !/18:24/.test(sem.html));

  // ── Dia ──────────────────────────────────────────────────────────────────────────────
  const dia = await gerar('diaria', '2026-10-09');
  check('dia: um quadrado só, com dia da semana e data', (dia.html.match(/<td class="cd/g) || []).length === 1 && /<th>Sex 09\/10\/2026<\/th>/.test(dia.html));
  check('dia: entrada e saída das duas visitas', /13:08 → 13:50/.test(dia.html) && /13:57 → em andamento/.test(dia.html));
  check('dia: retrato (sem forçar paisagem)', !/size:A4 landscape/.test(dia.html));

  // ── Trimestre ────────────────────────────────────────────────────────────────────────
  const tri = await gerar('trimestral', '2026-10-15');
  const nMeses = (tri.html.match(/class="mes"/g) || []).length;
  check('trimestre: uma grade por mês (3)', nMeses === 3, nMeses + ' ' + tri.de + '..' + tri.ate);

  // ── Duas opções de PDF (20/11/2026): com ou sem a tabela de entradas e saídas ────────
  // "manter só a lá de cima (o calendário), que fica show, e vai ter mais foco pras fotos".
  const modo = await page.evaluate(() => {
    if (typeof _visSupPdfModoHtml !== 'function') return null;
    const box = document.createElement('div'); box.innerHTML = _visSupPdfModoHtml(); document.body.appendChild(box);
    const btns = [...box.querySelectorAll('.vis-pdf-modo button')];
    const r = { rotulos: btns.map(b => b.textContent.trim()), padraoCom: btns[0].classList.contains('on') && !btns[1].classList.contains('on') };
    btns[1].click();
    r.depoisSem = !_visSupPdfDetalhe && btns[1].classList.contains('on') && !btns[0].classList.contains('on');
    try { r.lembrado = localStorage.getItem('gn_vis_pdf_detalhe'); } catch (e) { r.lembrado = 'sem-storage'; }
    return r;
  });
  check('duas opções de PDF: "Com entradas e saídas" e "Calendário + fotos"', modo && modo.rotulos.join('|') === '🕒 Com entradas e saídas|📷 Calendário + fotos', modo && modo.rotulos);
  check('…o padrão continua com a tabela (como era)', modo && modo.padraoCom);
  check('…tocar em "Calendário + fotos" troca a escolha e ela fica lembrada', modo && modo.depoisSem && modo.lembrado === '0', JSON.stringify(modo));
  const semTab = await gerar('mensal', '2026-10-15');
  check('sem tabela: o calendário continua igual', /<table class="cal">/.test(semTab.html) && /Outubro 2026/.test(semTab.html) && /💻 11 lojas/.test(semTab.html) && /18:24 → 20:10/.test(semTab.html));
  check('sem tabela: some a seção "Entradas e saídas" (e as durações)', !/Entradas e saídas/.test(semTab.html) && !/<table class="det-tab">/.test(semTab.html) && !/10h 6min/.test(semTab.html));
  check('sem tabela: KPIs e legenda continuam', /Visitas presenciais/.test(semTab.html) && /presencial · 💻 remoto/.test(semTab.html));
  // "Pode fazer as fotos maiores também": sem a tabela, as fotos ganham o espaço.
  check('com tabela: fotos no tamanho de sempre (duas por linha, até 330px)', /<div class="fotos">/.test(mes.html) && !/fotos grande/.test(mes.html) && (mes.html.match(/<img src="https:\/\/exemplo/g) || []).length === 2);
  check('sem tabela (mês, paisagem): fotos grandes — duas por linha, até 150mm de altura', /<div class="fotos grande">/.test(semTab.html) && /\.fotos\.grande \.foto img\{max-height:150mm\}/.test(semTab.html) && !/grid-template-columns:1fr;/.test(semTab.html));
  const diaSem = await gerar('diaria', '2026-10-09');
  check('sem tabela (dia, retrato): fotos grandes lado a lado, até 110mm (cabem na 1ª folha, com o rodapé)', /<div class="fotos grande">/.test(diaSem.html) && /\.fotos\.grande \.foto img\{max-height:110mm\}/.test(diaSem.html) && (diaSem.html.match(/<img src="https:\/\/exemplo/g) || []).length === 2);
  {
    const imp3 = await ctx.newPage();
    await imp3.setContent(diaSem.html.replace(/<script>window\.onload[\s\S]*?<\/script>/, ''));
    await imp3.pdf({ path: path.join(CAMINHOS.TMP, 'visitas_pdf_dia_fotos.pdf'), preferCSSPageSize: true, printBackground: true });
    await imp3.close();
  }
  await page.evaluate(() => _visSupSetPdfDetalhe(true));
  const comTab = await gerar('mensal', '2026-10-15');
  check('voltando pra "Com entradas e saídas", a tabela volta', /Entradas e saídas/.test(comTab.html) && /<table class="det-tab">/.test(comTab.html));

  // ── Os outros dois botões continuam como eram ────────────────────────────────────────
  const txtWpp = await page.evaluate(() => (_buildTextoVisitasSup(true) || {}).texto || '');
  check('o texto do WhatsApp continua igual (relatório em texto)', /RELATÓRIO DE VISITAS/.test(txtWpp));

  // ── Impressão de verdade: o HTML vira PDF e um print da primeira página ──────────────
  const imp = await ctx.newPage();
  await imp.setContent(mes.html.replace(/<script>window\.onload[\s\S]*?<\/script>/, ''));
  const saidaPdf = path.join(CAMINHOS.TMP, 'visitas_pdf_mes.pdf');
  await imp.pdf({ path: saidaPdf, preferCSSPageSize: true, printBackground: true });
  const fs = require('fs');
  check('o navegador imprime o documento em PDF', fs.statSync(saidaPdf).size > 10000, fs.statSync(saidaPdf).size);
  await imp.setViewportSize({ width: 1123, height: 794 });
  await imp.emulateMedia({ media: 'print' });
  await imp.screenshot({ path: path.join(CAMINHOS.TMP, 'visitas_pdf_mes.png'), fullPage: true });
  const imp2 = await ctx.newPage();
  await imp2.setContent(sem.html.replace(/<script>window\.onload[\s\S]*?<\/script>/, ''));
  await imp2.pdf({ path: path.join(CAMINHOS.TMP, 'visitas_pdf_semana.pdf'), preferCSSPageSize: true, printBackground: true });

  check('nenhum erro de JavaScript na página', erros.length === 0, erros.join(' | '));
  console.log(`\n${ok} ok, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 ok, 1 falhou'); process.exit(1); });
