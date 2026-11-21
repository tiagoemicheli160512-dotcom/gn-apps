// "acho legal esse relatório, com os planos que sugeriu — é possível montar isso ao final de
// cada mês com o resultado todo preenchido, e também do trimestre?" (20/11/2026)
//
// Painel › BI › 📈 Gráficos › 📝 Relatório de gestão: o texto pra diretoria sai dos mesmos
// números do BI (rede, Maglia fora), com "próximos passos" por regra. Cobra:
//   · faturamento, variação contra o período anterior e maiores quedas;
//   · cancelamento que começou a ser lançado no meio do período anterior NÃO é comparado
//     ("antes 0%" inventava piora), e a taxa é sobre a venda dos dias em que já se lançava;
//   · sem 10% por loja só entre lojas que já lançavam antes — quem começou agora aparece
//     como "passaram a lançar", não como "piorou";
//   · passos: queda, cancelamento acima da rede, sem 10% que piorou, meta, faltas
//     concentradas, avarias sem lançamento, delivery baixo;
//   · nos 7 primeiros dias do mês, atalho pro mês que fechou (trimestre só no 1º mês dele);
//   · botões Whats / PDF / Copiar e o texto na tela.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 900))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-12-03T15:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof _buildBiDashboard === 'function' && typeof _dreRedeLojas === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 }); break; }
    catch (e) { if (t >= 3) { console.log('FALHOU: a Home não carregou'); process.exit(1); } }
  }
  if (!(await page.evaluate(() => typeof _biGestaoTexto === 'function'))) {
    console.log('FALHOU: o relatório de gestão não existe neste arquivo (contraprova esperada — é novo)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }

  const r = await page.evaluate(async () => {
    // Out: Bangu 1.000/dia, Caxias 400 salão + 100 delivery. Nov: Bangu cai pra 800/dia.
    // Maglia vende 9.999/dia e cancela R$ 5.000 — não pode aparecer em nada.
    const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const vendas = [];
    for (let d = new Date(2026, 6, 10); d <= new Date(2026, 11, 3); d.setDate(d.getDate() + 1)) {
      const s = iso(d), nov = s >= '2026-11-01';
      vendas.push({ loja: 'BANGU', data_operacao: s, venda_salao: nov ? 800 : 1000, venda_delivery: 0 });
      vendas.push({ loja: 'Caxias', data_operacao: s, venda_salao: 400, venda_delivery: 100 });
      vendas.push({ loja: 'MAGLIA', data_operacao: s, venda_salao: 9999, venda_delivery: 0 });
    }
    const caixa = [
      { loja: 'BANGU', data: '2026-09-20', gn_caixa_gorjeta: [{ valor: 100 }] },                 // Bangu já lançava sem 10% antes de outubro
      { loja: 'BANGU', data: '2026-10-05', gn_caixa_gorjeta: [{ valor: 1500 }] },                // out: 1.500 / 30.000 = 5%
      { loja: 'BANGU', data: '2026-10-20', gn_caixa_cancelamento: [{ valor: 100 }] },            // cancelamento começa em 20/10
      { loja: 'BANGU', data: '2026-11-05', gn_caixa_gorjeta: [{ valor: 2400 }], gn_caixa_cancelamento: [{ valor: 240 }],
        gn_caixa_comprovante: [{ bandeira: 'Mastercard Crédito', valor: 700 }, { bandeira: 'Pix', valor: 300 }], gn_caixa_transferencia: [{ id: 1 }, { id: 2 }] },
      { loja: 'CAXIAS', data: '2026-11-10', gn_caixa_gorjeta: [{ valor: 600 }], gn_caixa_cancelamento: [{ valor: 400 }] },  // Caxias começa a lançar sem 10% em nov
      { loja: 'MAGLIA', data: '2026-11-10', gn_caixa_cancelamento: [{ valor: 5000 }], gn_caixa_gorjeta: [{ valor: 9000 }] },
    ];
    window.gnFetchJson = async (url, h, nome, fb) => {
      const u = decodeURIComponent(url);
      const de = (u.match(/=gte\.([\d-]+)/) || [])[1], ate = (u.match(/=lte\.([\d-]+)/) || [])[1];
      const off = +((u.match(/offset=(\d+)/) || [])[1] || 0), lim = +((u.match(/limit=(\d+)/) || [])[1] || 1000);
      if (nome === 'biGraf:vendas') return vendas.filter(v => v.data_operacao >= de && v.data_operacao <= ate).slice(off, off + lim);
      if (nome === 'biGraf:caixa') return off ? [] : caixa.filter(c => c.data >= de && c.data <= ate);
      if (nome === 'biGraf:comissoes') {
        // Semana de 16–22/11 na Bangu: 2 funcionários, 4 faltas cada = 8 faltas.
        const idx = COMISSOES_CAL.findIndex(s => s.days.some(x => x.y === 2026 && x.m === 11 && x.d === 16));
        const f = { dias: ['FALTA', 'FALTA', 'FALTA', 'FALTA', 'PRESENTE', 'PRESENTE', 'FOLGA'] };
        return [{ loja: 'BANGU', ['s' + idx]: { funcs: [{ nome: 'A', ...f }, { nome: 'B', ...f }] } }];
      }
      // Banco de horas: só a Bangu lançou novembro (+30h e −5h); as outras ficam pendentes.
      if (nome === 'biGraf:banco') { window.__bancoUrl = u; return [{ loja: 'Bangu', mes: 'CONFIG', registros: {} }, { loja: 'Bangu', mes: '2026-11', registros: [{ nome: 'Ana', horas: 30 }, { nome: 'Beto', horas: -5 }] }]; }
      // Trio: Bangu tocou 07 e 08/11 (cachê 800 cada) e só lançou o couvert de 07 (R$ 600);
      // Caxias tocou 14/11 (cachê 500, couvert 300 lançado) → −R$ 200.
      if (nome === 'biGraf:trios') return off ? [] : [
        { data: '2026-11-07', loja: 'bangu', artista: 'Trio A', cache: 800, couver_valor: 600, couver_lancado_em: '2026-11-08T02:00:00Z' },
        { data: '2026-11-08', loja: 'bangu', artista: 'Trio A', cache: 800, couver_valor: 0 },
        { data: '2026-11-14', loja: 'caxias', artista: 'Trio B', cache: 500, couver_valor: 300, couver_lancado_em: '2026-11-15T02:00:00Z' },
      ].filter(r => r.data >= de && r.data <= ate);
      if (nome === 'biGraf:avarias') return [{ loja: 'BANGU', av: { BANGU: [{ id: 'a1', ts: '2026-11-12T15:00:00Z', valorTotal: 40, status: 'finalizado' }] } }];
      return fb === undefined ? [] : fb;
    };
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('home-screen').style.display = 'flex';
    const el = document.getElementById('dash-section'); el.style.display = 'block';
    _dashTab = 'bi'; _biEscopo = 'REDE'; _biVista = 'graf'; _biGPer = 'mes'; _biGOff = 0;
    renderDashboard = () => { el.innerHTML = _buildBiDashboard(); };
    const esperar = async () => { renderDashboard(); for (let i = 0; i < 60 && !_biGDados[_biGChave()]; i++) await new Promise(res => setTimeout(res, 50)); renderDashboard(); };
    const out = {};
    await esperar();
    const ban = el.querySelector('.bi-gest-fechado');
    out.banner = ban ? ban.textContent.trim() : null;
    if (ban) ban.click();
    await esperar();
    out.offDepois = _biGOff;
    out.semBannerNoMesFechado = !el.querySelector('.bi-gest-fechado');
    out.btns = [...el.querySelectorAll('.bi-gest-btns button')].map(b => b.textContent.trim());
    out.cardTxt = (el.querySelector('.bi-gest-txt') || {}).textContent || '';
    const t = _biGestaoTexto(true); out.wpp = t && t.msg; out.titulo = t && t.titulo;
    out.plano = (_biGestaoTexto(false) || {}).msg || '';
    // Loja escolhida no BI → relatório da loja (e o rótulo dos botões diz qual).
    _biEscopo = 'BANGU'; renderDashboard();
    out.rotLoja = ((el.querySelector('.bi-gest-btns span') || {}).textContent || '').trim();
    const tl = _biGestaoTexto(true); out.loja = tl && tl.msg; out.lojaTit = tl && tl.titulo;
    _biEscopo = 'CAXIAS'; out.caxias = (_biGestaoTexto(true) || {}).msg || '';
    _biEscopo = 'REDE'; renderDashboard();
    // Botões: Whats abre wa.me com o texto; PDF manda o texto pro gerador de PDF.
    const abertos = []; window.open = u => { abertos.push(u); return null; };
    const pdfs = []; window.gnRelatorioPDFTexto = (txt, tit) => { pdfs.push([txt, tit]); };
    enviarWppGestaoBi(); gerarPDFGestaoBi();
    out.wa = abertos[0] || ''; out.pdf = pdfs[0] || null;
    // Trimestre: em 03/12 (3º mês do 4º tri) não tem atalho de trimestre fechado.
    _biGPer = 'tri'; _biGOff = 0; await esperar();
    out.bannerTri = !!el.querySelector('.bi-gest-fechado');
    out.triTxt = (_biGestaoTexto(true) || {}).msg || '';
    out.largura = document.documentElement.scrollWidth;
    out.bancoUrl = window.__bancoUrl || '';
    return out;
  });

  check('em 03/12, atalho "o mês de nov/2026 fechou — ver o relatório"', /nov\/2026 fechou/.test(r.banner || ''), r.banner);
  check('…tocar no atalho vai pro mês fechado (e o atalho some)', r.offDepois === -1 && r.semBannerNoMesFechado);
  check('botões Whats / PDF / Copiar do relatório', r.btns.join('|') === '📲 Whats|📄 PDF|📋 Copiar', r.btns);
  check('o texto aparece na tela (pra ler antes de mandar)', /Relatório de Gestão/.test(r.cardTxt) && /Próximos passos/.test(r.cardTxt), r.cardTxt.slice(0, 200));
  const w = r.wpp || '';
  check('título e período fechado (sem "em andamento")', /^\*Relatório de Gestão – Rede Gigante Nordestino\*\n_nov\/2026 – números/.test(w) && !/andamento/.test(w), w.slice(0, 160));
  check('faturamento da rede sem a Maglia: R$ 39.000,00 em 30 dias', /Rede: \*R\$\s?39\.000,00\* em 30 dias/.test(w), w.slice(0, 400));
  check('variação contra outubro: -13,3%', /período anterior: \*-13,3%\*/.test(w), w.slice(0, 500));
  check('maiores quedas: Bangu (-20,0%)', /Maiores quedas: Bangu \(-20,0%\)/.test(w));
  check('cancelamento: 640 de rede = 1,64% (Maglia fora)', /Cancelamentos:\* 2 \(1,64% das vendas = R\$\s?640,00\)/.test(w), (w.match(/.*Cancelamentos.*/) || [])[0]);
  check('cancelamento começou em 20/10: NÃO compara com outubro ("antes 0%" inventava piora)', !/Cancelamentos.*antes/.test(w));
  check('loja com cancelamento acima da rede: Caxias (2,67%), e Bangu (1%) não', /Acima da rede: Caxias \(2,67%\)/.test(w) && !/Acima da rede:.*Bangu/.test(w));
  check('transferências: 2', /Transferências de mesa:\* 2/.test(w));
  check('sem 10%: 2 notas · R$ 300,00 (7,7% das vendas)', /2 notas · \*R\$\s?300,00 de serviço que não entrou\* \(7,7% das vendas\)/.test(w), (w.match(/.*notas ·.*/) || [])[0]);
  check('compara só a loja que já lançava antes: Bangu 5,0% → 10,0% (piorou)', /Em Bangu, única loja que lançou nos dois períodos: 5,0% → \*10,0%\* \(piorou\)/.test(w), (w.match(/.*nos dois períodos.*/) || [])[0]);
  check('Caxias começou a lançar agora: "passaram a lançar", não "piorou"', /Passaram a lançar agora \(sem comparação\): Caxias/.test(w) && !/Pioraram:.*Caxias/.test(w));
  check('faltas concentradas: Bangu soma 8', /Faltas:\* 8 dias.*Bangu soma 8/.test(w), (w.match(/.*Faltas.*/) || [])[0]);
  check('avarias: Caxias sem nenhum lançamento', /Avarias:\* R\$\s?40,00 em 1 item — 1 loja sem nenhum lançamento/.test(w), (w.match(/.*Avarias.*/) || [])[0]);
  const passos = (w.split('*⚠️ Próximos passos*')[1] || '').trim();
  check('passo: entender a queda, começando pela Bangu', /1\. Entender a queda de 13,3% no faturamento, começando por Bangu\./.test(passos), passos);
  check('passo: reduzir cancelamento em Caxias', /Plano para reduzir cancelamentos em Caxias \(rede em 1,64%\)/.test(passos));
  check('passo: cobrar sem 10% de quem piorou (Bangu)', /Cobrar o sem 10% em Bangu, que piorou\./.test(passos));
  check('passo: meta de sem 10% com valor', /Meta de sem 10%: baixar de 7,7% para 3% das vendas — vale cerca de R\$/.test(passos));
  check('passo: presença na Bangu (8 das 8 faltas)', /Plano de presença em Bangu: 8 das 8 faltas/.test(passos));
  check('passo: cobrar avarias em Caxias', /Cobrar o lançamento de avarias em Caxias/.test(passos));
  check('passo: delivery baixo (8%)', /Delivery em 8% das vendas/.test(passos));
  check('Maglia não aparece em nada', !/Maglia/i.test(w));
  check('PDF sai sem os asteriscos do WhatsApp', r.plano && !/\*/.test(r.plano) && /Relatório de Gestão – Rede/.test(r.plano));
  check('botão Whats abre o wa.me com o texto', r.wa.startsWith('https://wa.me/?text=') && decodeURIComponent(r.wa.split('text=')[1]).includes('Próximos passos'));
  check('botão PDF manda o texto com título do período', r.pdf && r.pdf[1] === 'Relatório de Gestão — nov/2026' && /Próximos passos/.test(r.pdf[0]), r.pdf && r.pdf[1]);
  check('trimestre: em dezembro (3º mês do 4º tri) sem atalho de trimestre fechado', r.bannerTri === false);
  check('trimestre em andamento também gera o relatório (até ONTEM: o dia de hoje ainda não fechou)', /4º tri 2026 \(out–dez\) \(em andamento, até 02\/12 — hoje fica de fora, o dia ainda não fechou\)/.test(r.triTxt) && /andamento: os números ainda vão mudar/.test(r.triTxt), r.triTxt.slice(0, 200));

  // "dá pra ter a sugestão por loja do que atuar?" — seção por loja, com o número e a ação.
  const porLoja = (w.split('*🏪 Onde atuar em cada loja*')[1] || '');
  const bloco = k => ((porLoja.split('• *' + k + '*')[1] || '').split('\n• ')[0]);
  check('seção "Onde atuar em cada loja" depois dos próximos passos', porLoja.length > 0 && w.indexOf('Próximos passos') < w.indexOf('Onde atuar em cada loja'));
  check('loja com mais pontos vem primeiro (Bangu: 3, Caxias: 2)', porLoja.indexOf('*Bangu*') > -1 && porLoja.indexOf('*Bangu*') < porLoja.indexOf('*Caxias*'), porLoja.slice(0, 300));
  check('Bangu: queda de faturamento com a ação', /Faturamento -20,0% vs período anterior: entender a queda/.test(bloco('Bangu')), bloco('Bangu'));
  check('Bangu: sem 10% subiu de 5,0% para 10,0% → cobrar os garçons', /Sem 10% subiu de 5,0% para 10,0% das vendas: cobrar os garçons/.test(bloco('Bangu')));
  check('Bangu: 8 faltas (100% da rede) → plano de presença', /8 faltas \(100% da rede\): plano de presença/.test(bloco('Bangu')));
  check('Caxias: cancelamento acima da rede', /Cancelamento em 2,67% das vendas \(rede 1,64%\): rever motivos/.test(bloco('Caxias')), bloco('Caxias'));
  check('avaria sem lançamento NÃO entra na lista por loja (fica só nos passos da rede)', !/avaria/i.test(porLoja) && /Cobrar o lançamento de avarias em Caxias/.test(passos), porLoja);
  check('Caxias não leva "sem 10%" (começou agora, e 4% está abaixo da rede)', !/Sem 10%/.test(bloco('Caxias')));
  // Relatório por loja (20/11/2026: "quando selecionar a loja vem o relatório da rede").
  const lj = r.loja || '';
  check('loja escolhida: botões dizem "Relatório de gestão (Bangu)"', /Relatório de gestão \(Bangu\)/.test(r.rotLoja), r.rotLoja);
  check('loja: título e PDF com o nome da loja', /^\*Relatório de Gestão – Bangu\*/.test(lj) && r.lojaTit === 'Relatório de Gestão — Bangu — nov/2026', lj.slice(0, 80));
  check('loja: faturamento só dela (R$ 24.000,00) e comparação com a rede', /\*R\$\s?24\.000,00\* em 30 dias/.test(lj) && /\*-20,0%\* \(R\$\s?30,0k\); a rede -13,3%/.test(lj), (lj.match(/.*Comparado.*/) || [])[0]);
  check('loja: posição e participação na rede', /1º de 2 na rede · 61,5% do faturamento da rede/.test(lj), (lj.match(/.*na rede ·.*/) || [])[0]);
  check('loja: cancelamento dela contra o da rede', /Cancelamentos:\* 1 \(1,00% das vendas = R\$\s?240,00; rede 1,64%\)/.test(lj), (lj.match(/.*Cancelamentos.*/) || [])[0]);
  check('loja: sem 10% antes → agora (piorou)', /Antes: 5,0% → agora \*10,0%\* \(piorou\)/.test(lj));
  check('loja: faltas com o peso na rede', /Faltas:\* 8 dias.*— 100% da rede/.test(lj));
  const pl = (lj.split('*⚠️ Onde atuar*')[1] || '');
  check('loja: onde atuar — queda pior que a da rede', /1\. Entender a queda de 20,0% no faturamento \(a rede caiu 13,3%\)/.test(pl), pl);
  check('loja: onde atuar — sem 10% subiu, meta e presença', /Sem 10% subiu de 5,0% para 10,0%/.test(pl) && /Meta de sem 10%: baixar de 10,0% para 3%/.test(pl) && /Plano de presença: 8 faltas/.test(pl));
  check('loja: não cobra avaria de quem lançou, nem cancelamento abaixo da rede', !/avarias/.test(pl) && !/cancelamentos/i.test(pl));
  check('loja: não traz a lista "onde atuar em cada loja" da rede', !/Onde atuar em cada loja/.test(lj) && !/Caxias/.test(lj));
  const cx = r.caxias;
  check('Caxias: cancelamento acima da rede e avaria a lançar viram passo', /Reduzir cancelamentos: 2,67% das vendas contra 1,64% da rede/.test(cx) && /Cobrar o lançamento de avarias/.test(cx), (cx.split('Onde atuar*')[1] || ''));
  check('Caxias: sem 10% sem comparação (começou a lançar agora)', /Sem comparação: a loja começou a lançar/.test(cx));
  // Banco de horas e couvert (21/11/2026: "senti falta do banco de horas e do couvert").
  check('rede: couvert × cachê dos trios somado (só dias até o fim do período)', /Couvert × cachê dos trios:\* couvert R\$\s?900,00 − cachê R\$\s?2\.100,00 = \*−R\$\s?1\.200,00\* \(2 lojas com trio\)/.test(w), (w.match(/.*Couvert × cachê dos trios.*/) || [])[0]);
  check('rede: quem não cobriu o cachê e quem não lançou o couvert', /Couvert não cobriu o cachê: Caxias \(−R\$\s?200/.test(w) && /Faltou lançar o couvert: Bangu \(1 dia\)/.test(w));
  check('rede: banco de horas lançado somado e quem não lançou', /Banco de horas:\* \+30h a pagar · −5h a compensar — lançado por 1 de \d+ lojas/.test(w) && /Sem lançamento: .*Caxias \(nov\/2026\)/.test(w), (w.match(/.*Banco de horas.*/g) || []).join(' | '));
  check('rede: passos de couvert e banco', /Cobrar o lançamento do couvert em Bangu/.test(passos) && /Rever o trio em Caxias: o couvert não cobriu o cachê/.test(passos) && /Cobrar o lançamento do banco de horas em .*Caxias/.test(passos), passos);
  check('rede, por loja: Bangu lança o couvert de 08/11; Caxias revê o trio e lança o banco', /Lançar o couvert de 08\/11/.test(bloco('Bangu')) && /Couvert não cobriu o cachê do trio \(−R\$\s?200,00\)/.test(bloco('Caxias')) && /Lançar o banco de horas de nov\/2026/.test(bloco('Caxias')), bloco('Bangu') + ' || ' + bloco('Caxias'));
  check('banco: busca o mês do período e a CONFIG (salário por setor)', /gn_banco_horas\?loja=in\..*Bangu.*&mes=in\.\(CONFIG,.*2026-11/.test(r.bancoUrl || ''), r.bancoUrl);
  check('loja: couvert × cachê da Bangu com o dia sem lançamento', /Couvert × cachê do trio:\* couvert R\$\s?600,00 − cachê R\$\s?1\.600,00 = \*−R\$\s?1\.000,00\* — faltou lançar o couvert de 08\/11/.test(lj), (lj.match(/.*Couvert.*/) || [])[0]);
  check('loja: banco de horas da Bangu (lançado em nov)', /Banco de horas:\* lançado em nov\/2026: \+30h a pagar \(1 pessoa\) · −5h a compensar \(1 pessoa\)/.test(lj), (lj.match(/.*Banco de horas.*/) || [])[0]);
  check('loja: passo "lançar o couvert de 08/11"', /Lançar o couvert de 08\/11: sem ele o resultado do trio não fecha/.test(pl));
  check('Caxias (loja): banco pendente vira passo', /Lançar o banco de horas de nov\/2026/.test(cx));
  check('sem rolagem de lado em 390 px', r.largura <= 390, r.largura);
  check('nenhum erro de JavaScript', erros.length === 0, erros);

  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
