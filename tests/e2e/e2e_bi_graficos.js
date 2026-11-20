// Pedido do dono (20/11/2026), com a foto de um dashboard de faturamento: "é possível ter um
// dashboard assim também — podem escolher um ou outro". BI › 📊 Indicadores | 📈 Gráficos.
// Escolhidos: faturamento por loja, evolução mês a mês, formas de pagamento, salão × delivery
// + dia da semana; período Mês / Trimestre / Ano só aqui.
//
// Cobra: alternar as duas vistas; período (mês/tri/ano) e navegação sem passar de jul/2026;
// KPIs (total, variação só com período anterior completo, média por dia, maior loja / posição);
// por loja da maior pra menor; evolução por mês; formas de pagamento por bandeira (%);
// salão × delivery; média por dia da semana; escopo de uma loja; paginação de 1.000 linhas;
// Maglia fora; 390 px.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 600))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-20T15:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof _buildBiDashboard === 'function' && typeof _dreRedeLojas === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 }); break; }
    catch (e) { if (t >= 3) { console.log('FALHOU: a Home não carregou'); process.exit(1); } }
  }
  if (!(await page.evaluate(() => typeof _buildBiGraficos === 'function'))) {
    console.log('FALHOU: o BI em gráficos não existe neste arquivo (contraprova esperada — é novo)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }

  const r = await page.evaluate(async () => {
    // Base: Bangu vende 1.000/dia, Caxias 500/dia (salão 400 + delivery 100), Maglia 9.999/dia
    // (não entra), de 10/07 a 20/11. Segunda e domingo da Bangu vendem o dobro.
    const vendas = [];
    for (let d = new Date(2026, 6, 10); d <= new Date(2026, 10, 20); d.setDate(d.getDate() + 1)) {
      const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const dobro = d.getDay() === 0 || d.getDay() === 1;
      vendas.push({ loja: 'BANGU', data_operacao: iso, venda_salao: dobro ? 2000 : 1000, venda_delivery: 0 });
      vendas.push({ loja: 'Caxias', data_operacao: iso, venda_salao: 400, venda_delivery: 100 });
      vendas.push({ loja: 'MAGLIA', data_operacao: iso, venda_salao: 9999, venda_delivery: 0 });
      // As outras 9 lojas com venda zerada: não mexem nas contas, mas passam de 1.000 linhas.
      ['SÃO GONÇALO', 'NORTE SHOPPING', 'BOULEVARD', 'RANCHO', 'PEDREIRA', 'NOVA AMERICA', 'CAMPO GRANDE', 'ITAQUERA', 'GUARULHOS']
        .forEach(l => vendas.push({ loja: l, data_operacao: iso, venda_salao: 0, venda_delivery: 0 }));
    }
    const caixa = [{ loja: 'BANGU', data: '2026-11-10', gn_caixa_comprovante: [{ bandeira: 'Mastercard Crédito', valor: 600 }, { bandeira: 'Pix', valor: 300 }, { bandeira: 'Ticket Restaurante', valor: 100 }],
                     gn_caixa_cancelamento: [{ valor: 180 }, { valor: 0 }], gn_caixa_transferencia: [{ id: 1 }, { id: 2 }, { id: 3 }], gn_caixa_gorjeta: [{ valor: 250 }],
                     gn_caixa_despesa: [{ categoria: 'funcionario_extra', valor: 120, nome: 'João', justificativa: 'cobriu folga do garçom' }, { categoria: 'limpeza', valor: 50 }] },
                   { loja: 'BANGU', data: '2026-10-05', gn_caixa_cancelamento: [{ valor: 999 }] },   // fora de novembro
                   { loja: 'CAXIAS', data: '2026-11-11', gn_caixa_comprovante: [{ bandeira: 'Visa Débito', valor: 200 }, { bandeira: 'IFOOD', valor: 100 }, { bandeira: 'Bitcoin', valor: 10 }] },
                   { loja: 'MAGLIA', data: '2026-11-11', gn_caixa_comprovante: [{ bandeira: 'Pix', valor: 99999 }] }];
    window.__paginas = [];
    window.gnFetchJson = async (url, h, nome, fb) => {
      const u = decodeURIComponent(url);
      const de = (u.match(/=gte\.([\d-]+)/) || [])[1], ate = (u.match(/=lte\.([\d-]+)/) || [])[1];
      const off = +((u.match(/offset=(\d+)/) || [])[1] || 0), lim = +((u.match(/limit=(\d+)/) || [])[1] || 1000);
      if (nome === 'biGraf:vendas') { window.__paginas.push(off); return vendas.filter(v => v.data_operacao >= de && v.data_operacao <= ate).slice(off, off + lim); }
      if (nome === 'biGraf:caixa') return off ? [] : caixa.filter(c => c.data >= de && c.data <= ate);
      if (nome === 'biGraf:comissoes') {
        // Semana de 16–22/11: 2 faltas, 1 atestado, suspensão na quinta (19) e no sábado (21 —
        // ainda não chegou, fica fora), 1 advertência.
        const idx = COMISSOES_CAL.findIndex(s => s.days.some(x => x.y === 2026 && x.m === 11 && x.d === 16));
        window.__semIdx = idx;
        return [{ loja: 'BANGU', ['s' + idx]: { funcs: [{ nome: 'A', dias: ['FALTA', 'FALTA', 'ATESTADO', 'SUSPENSÃO', 'PRESENTE', 'SUSPENSÃO', 'FOLGA'], docs: { ADVERTENCIA: 'x' } }] } }];
      }
      if (nome === 'biGraf:avarias') return [{ loja: 'BANGU', av: { BANGU: [{ id: 'a1', ts: '2026-11-12T15:00:00Z', valorTotal: 40, status: 'finalizado' }, { id: 'a2', ts: '2026-11-12T15:00:00Z', valorTotal: 99, tipo: 'saida_terceiro' }] } }];
      return fb === undefined ? [] : fb;
    };
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('home-screen').style.display = 'flex';
    const el = document.getElementById('dash-section'); el.style.display = 'block';
    _dashTab = 'bi'; _biEscopo = 'REDE';
    renderDashboard = () => { el.innerHTML = _buildBiDashboard(); };
    const esperar = async () => { for (let i = 0; i < 40 && !_biGDados[_biGChave()]; i++) await new Promise(res => setTimeout(res, 50)); renderDashboard(); };
    const out = {};
    _biDados = {}; _biComp = '2026-10'; _biCarregando = true;   // indicadores sem carregar de verdade
    renderDashboard();
    out.padrao = (el.querySelector('.bi-vista-ind.on') ? 'ind' : '') + (el.querySelector('.bi-g-per') ? '+graf' : '');
    el.querySelector('.bi-vista-graf').click(); await esperar();
    out.graf = !!el.querySelector('.bi-g-per') && !!el.querySelector('.bi-vista-graf.on');
    const ler = () => ({ txt: el.innerText.replace(/\s+/g, ' '), rot: (el.querySelector('.bi-g-rot') || {}).innerText,
      lojas: [...el.querySelectorAll('.bi-g-loja')].map(x => x.dataset.loja), meses: [...el.querySelectorAll('.bi-g-mes')].map(x => x.dataset.mes),
      pag: [...el.querySelectorAll('.bi-g-pag-linha')].map(x => x.innerText.replace(/\s+/g, ' ').trim()),
      // As fichas do "Comparar lojas" ficam numa faixa que rola de lado (overflow-x:auto) de
      // propósito — o que importa é a PÁGINA não rolar de lado.
      largos: [...el.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('.bi-g-mets')).length,
      pagina: document.documentElement.scrollWidth <= window.innerWidth + 1 });
    // Mês (novembro, em andamento): 20 dias.
    out.mes = ler();
    // Operação + comparar lojas + PDF (mês de novembro, rede).
    out.op = [...el.querySelectorAll('.bi-g-op')].map(x => x.dataset.met + '=' + x.innerText.replace(/\s+/g, ' ').trim());
    _biGTrocarMet('s10'); out.cmp = [...el.querySelectorAll('.bi-g-cmp')].slice(0, 2).map(x => x.innerText.replace(/\s+/g, ' ').trim());
    out.metOn = (el.querySelector('.bi-g-met.on') || {}).dataset;
    out.metOn = out.metOn && out.metOn.met;
    let pdfOpts = null; const orig = window.gnRelatorioPDF; window.gnRelatorioPDF = o => { pdfOpts = o; };
    gerarPDFBiGraficos(); window.gnRelatorioPDF = orig;
    const doc = document.createElement('div'); doc.innerHTML = pdfOpts ? pdfOpts.html : '';
    out.pdf = pdfOpts && { titulo: pdfOpts.titulo, kpis: pdfOpts.kpis.map(k => k.label + ':' + k.valor), temVar: /var\(--/.test(pdfOpts.html), svgs: doc.querySelectorAll('svg').length,
      semFichas: !doc.querySelector('.bi-g-mets'), linhas: [...doc.querySelectorAll('tbody tr')].map(tr => [...tr.cells].map(c => c.textContent.trim()).join('|')),
      corBarra: (doc.querySelector('.bi-g-loja span span') || {}).getAttribute && doc.querySelector('.bi-g-loja span span').getAttribute('style') };
    // Trimestre: out–dez, período anterior jul–set começa antes de 10/07 → sem comparação.
    _biGTrocarPer('tri'); await esperar(); out.tri = ler();
    // Mês de outubro (fechado): anterior setembro completo → compara.
    _biGTrocarPer('mes'); _biGNav(-1); await esperar(); out.out = ler();
    // Navegar até julho e não passar dele.
    _biGNav(-1); _biGNav(-1); _biGNav(-1); await esperar(); out.jul = ler().rot; _biGNav(-1); await esperar(); out.julDepois = ler().rot;
    // Ano.
    _biGTrocarPer('ano'); await esperar(); out.ano = ler();
    // Escopo Caxias, no mês atual.
    _biGTrocarPer('mes'); _biTrocarEscopo('CAXIAS'); await esperar(); out.cx = ler();
    out.paginas = window.__paginas.slice();
    _biTrocarVista('ind'); out.voltou = !el.querySelector('.bi-g-per') && !!el.querySelector('.bi-controles');
    return out;
  });
  check('o BI abre em 📊 Indicadores e tem o botão 📈 Gráficos; tocar troca de vista', r.padrao === 'ind' && r.graf, r);
  check('Mês (nov/2026, em andamento): faturamento R$ 36.000 (Bangu 14 × 1.000 + 6 dias em dobro = 26.000; Caxias 10.000 · nada da Maglia)', /nov\/2026 · em andamento/.test(r.mes.rot) && /R\$ 36\.000,00/.test(r.mes.txt) && !/Maglia/.test(r.mes.txt), r.mes.txt.slice(0, 400));
  check('…compara com os mesmos 20 dias de outubro (período anterior completo)', /vs R\$ [\d.]+,\d\d no período anterior \(mesmos dias\)/.test(r.mes.txt), r.mes.txt.slice(0, 400));
  check('faturamento por loja: Bangu, depois Caxias (11 lojas na lista, Maglia fora)', r.mes.lojas[0] === 'BANGU' && r.mes.lojas[1] === 'CAXIAS' && r.mes.lojas.length === 11 && !r.mes.lojas.includes('MAGLIA'), r.mes.lojas);
  check('formas de pagamento por bandeira: Crédito 46%, Pix 23%, Débito 15%, Vale 8%, iFood/Online 8%, Outros 1% (Maglia fora)',
    r.mes.pag.some(x => /^Crédito 46%/.test(x)) && r.mes.pag.some(x => /^Pix 23%/.test(x)) && r.mes.pag.some(x => /^Débito 15%/.test(x)) && r.mes.pag.some(x => /^Vale-refeição 8%/.test(x)) && r.mes.pag.some(x => /^iFood \/ Online 8%/.test(x)) && r.mes.pag.some(x => /^Outros 1%/.test(x)), r.mes.pag);
  check('salão × delivery: delivery é só o da Caixas (100 × 20 = R$ 2,0k)', /Delivery 6% · R\$ 2,0k/.test(r.mes.txt), r.mes.txt.match(/Salão[^|]{0,80}/));
  check('média por dia da semana: domingo e segunda (dobro) são os maiores — "melhor: Seg" ou "Dom"', /melhor: (Seg|Dom)/.test(r.mes.txt), r.mes.txt.match(/melhor: \w+/));
  check('evolução: os meses desde jul/2026 (jul a nov), nada antes dos dados', r.mes.meses.join() === '2026-07,2026-08,2026-09,2026-10,2026-11', r.mes.meses);
  check('Trimestre (4º tri, out–dez): SEM comparação, porque o 3º tri começa antes de 10/07', /4º tri 2026 \(out–dez\)/.test(r.tri.rot) && /sem comparação: o período anterior começa antes de 10\/07\/2026/.test(r.tri.txt) && !/▲|▼/.test(r.tri.txt.split('MÉDIA POR DIA')[0] || r.tri.txt.slice(0, 300)), r.tri.txt.slice(0, 300));
  check('Outubro fechado compara com setembro inteiro', /out\/2026/.test(r.out.rot) && !/em andamento/.test(r.out.rot) && /no período anterior/.test(r.out.txt) && !/mesmos dias/.test(r.out.txt), r.out.txt.slice(0, 300));
  check('navegação para em jul/2026 (não vai pra junho, sem dados)', /jul\/2026/.test(r.jul) && /jul\/2026/.test(r.julDepois), [r.jul, r.julDepois]);
  check('Ano 2026: soma do ano todo (Bangu + Caxias desde 10/07)', /^2026/.test(r.ano.rot) && /FATURAMENTO \(ATÉ HOJE\) R\$ [\d.]+,\d\d/i.test(r.ano.txt), r.ano.txt.slice(0, 260));
  check('escopo Caxias: só ela no total (R$ 10.000), delivery 20%, e "Na rede: 2º de 11"', /R\$ 10\.000,00/.test(r.cx.txt) && /Delivery 20%/.test(r.cx.txt) && /2º de 11/.test(r.cx.txt), r.cx.txt.slice(0, 500));
  const op = Object.fromEntries((r.op || []).map(x => x.split('=')));
  check('Operação (nov, rede): cancelamentos 0,50% (R$ 180 de R$ 36.000, 2 lançados) — o de outubro fica fora', /0,50%/.test(op.canc) && /2 · R\$ 180,00/.test(op.canc), op.canc);
  check('…sem 10%: R$ 25,00 de 10% não cobrado (1 nota de R$ 250); transferências 3; avarias R$ 40,00 (saída pra terceiro fora)', /R\$ 25,00/.test(op.s10) && /1 nota/.test(op.s10) && /3/.test(op.transf) && /R\$ 40,00 1 item/.test(op.av), op);
  check('…funcionário extra R$ 120,00 (1 lançamento; limpeza não é extra)', /R\$ 120,00 1 lançamento/.test(op.extra), op.extra);
  check('…faltas 2, atestados 1, suspensões 1, advertências 1 (da escala da semana)', /Faltas 2 dias/i.test(op.falta) && /Atestados 1 dia$/i.test(op.atest) && /Suspensões 1 dia$/i.test(op.susp) && /Advertências 1 documento$/i.test(op.adv), op);
  check('comparar lojas: escolhendo "Sem 10%", a Bangu vem primeiro com R$ 25,00', r.metOn === 's10' && /^Bangu R\$ 25,00/.test(r.cmp[0] || ''), r.cmp);
  check('PDF com gráficos: título, KPIs (faturamento, média, cancelamentos), os gráficos em SVG e a tabela por loja',
    r.pdf && r.pdf.titulo === 'BI — Rede' && r.pdf.kpis[0] === 'Faturamento:R$ 36.000,00' && /^Cancelamentos:0,50%/.test(r.pdf.kpis[2]) && r.pdf.svgs >= 2 && r.pdf.linhas.length === 11 && /^Bangu\|R\$ 26,0k\|0,69%\|R\$ 25,00\|3\|R\$ 40,00\|R\$ 120,00\|2\|1$/.test(r.pdf.linhas.find(l => /^Bangu/.test(l)) || ''), r.pdf);
  check('…no PDF as cores são reais (sem var(--…), que não existem no papel) e sem as fichas de escolha', r.pdf && !r.pdf.temVar && r.pdf.semFichas && /#2a78d6/.test(r.pdf.corBarra || ''), r.pdf && { temVar: r.pdf.temVar, semFichas: r.pdf.semFichas, cor: r.pdf.corBarra });
  check('a consulta de vendas é paginada (mais de 1.000 linhas → segunda página)', r.paginas.includes(1000), r.paginas);
  check('voltar pra 📊 Indicadores', r.voltou, r);
  check('nada passa da largura em 390 px (a página não rola de lado)', r.mes.largos === 0 && r.tri.largos === 0 && r.mes.pagina, [r.mes.largos, r.tri.largos, r.mes.pagina]);
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
