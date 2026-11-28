// Painel › Operação › 🏆 Nota (28/11/2026): nota de 0 a 100 por loja juntando o que é cobrável
// da loja — bloqueios da semana, divergência de caixa +7 dias, manutenção parada +5 dias, NF da
// semana fechada e empréstimo com o prazo vencido. Cobra a conta de cada item, os tetos, a
// ordem do ranking, a Maglia fora e a tela (resumo + detalhe ao tocar).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 600))); c ? ok++ : falhou++; };
(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 360, height: 900 }, timezoneId: 'America/Sao_Paulo' });
  await CAMINHOS.fixarRelogio(ctx, '2026-12-02T10:00:00-03:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage(); const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
  for (let t = 1; ; t++) { await page.goto('file://' + HOME); try { await page.waitForFunction(() => { try { return typeof renderDashboard === 'function' && typeof _setDashTab === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 }); break; } catch (e) { if (t >= 4) throw e; } }
  if (!(await page.evaluate(() => typeof _notaCalcular === 'function'))) { console.log('FALHOU: a aba 🏆 Nota não existe neste arquivo (contraprova esperada — é nova)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1); }
  const r = await page.evaluate(async () => {
    const pend = n => Array.from({ length: n }, () => ({ dias: 30 })).concat([{ dias: 2 }]); // +1 recente que não conta
    const entrada = {
      hoje: '2026-12-02',
      bloqRows: [].concat(Array(10).fill({ loja: 'BANGU' }), Array(2).fill({ loja: 'CAXIAS' }), [{ loja: 'MAGLIA' }]),
      divRk: [{ k: 'BANGU', pend: pend(20) }, { k: 'PEDREIRA', pend: pend(3) }],
      manutParada: { BANGU: 3, PEDREIRA: 15 },
      nfSemana: { rec: { bangu: { valor: 1000 }, caxias: { valor: 0 }, pedreira: { valor: 0 }, guarulhos: { valor: 800 } }, nf: { BANGU: { valor: 100 }, CAXIAS: { valor: 0 }, PEDREIRA: { valor: 500 }, GUARULHOS: { valor: 790 } } },
      emprest: [
        { origem: 'CAXIAS', destino: 'BANGU', confirmadoDestino: true, confirmadoOrigem: false },                         // sem data → prazo 30/11 → vencido p/ Caxias
        { origem: 'CAXIAS', destino: 'BANGU', confirmadoDestino: true, confirmadoDestinoEm: '2026-12-01T12:00:00Z' },     // prazo 04/12 → ainda não
        { origem: 'PEDREIRA', destino: 'BANGU', confirmadoOrigem: true, contestacao: { loja: 'BANGU' } },                  // contestado → fora
      ],
    };
    const rk = _notaCalcular(entrada);
    const de = k => rk.find(x => x.k === k);
    // Tela: injeta a nota pronta e renderiza a aba.
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    document.getElementById('home-screen').style.display = 'block'; document.getElementById('dash-section').style.display = 'block';
    _dashFat = {}; _dashManutParada = {}; _notaDados = { em: Date.now(), ok: true, hoje: '2026-12-02', seg: '2026-11-30', rk };
    _setDashTab('nota'); renderDashboard();
    const sec = document.getElementById('dash-section');
    const linhas = [...sec.querySelectorAll('.nota-loja')];
    _notaToggle('BANGU');
    const det = (document.getElementById('dash-section').querySelector('.nota-loja[data-loja="BANGU"] .nota-itens') || {}).innerText || '';
    return { bangu: de('BANGU'), caxias: de('CAXIAS'), pedreira: de('PEDREIRA'), guarulhos: de('GUARULHOS'), maglia: !!de('MAGLIA'),
      ordem: rk.map(x => x.k), telaOrdem: linhas.map(l => l.dataset.loja), resumoBangu: (linhas.find(l => l.dataset.loja === 'BANGU') || { innerText: '' }).innerText.replace(/\s+/g, ' '),
      det: det.replace(/\s+/g, ' '), largura: [document.documentElement.scrollWidth, window.innerWidth] };
  });
  const B = r.bangu.itens, C = r.caxias.itens, P = r.pedreira.itens;
  check('Bangu: 10 bloqueios → −30 (teto), 20 divergências +7 dias → −25 (teto; a recente não conta)', B.bloq.pts === 30 && B.diverg.n === 20 && B.diverg.pts === 25, B);
  check('Bangu: 3 manutenções paradas → −6; NF 100 de 1000 recebidos → −15; empréstimo contestado não conta', B.manut.pts === 6 && B.nf.pts === 15 && B.emp.pts === 0, B);
  check('Bangu: nota = 100 − 76 = 24', r.bangu.nota === 24, r.bangu.nota);
  check('Caxias: 2 bloqueios (−8), sem entrega nem NF (−10), 1 empréstimo vencido (−5; o de prazo até 04/12 não) → 77', C.bloq.pts === 8 && C.nf.pts === 10 && C.emp.n === 1 && C.emp.pts === 5 && r.caxias.nota === 77, r.caxias);
  check('Pedreira: 15 paradas → −20 (teto), 3 divergências → −6, NF sem confirmar entrega → −5 → 69', P.manut.pts === 20 && P.diverg.pts === 6 && P.nf.pts === 5 && r.pedreira.nota === 69, r.pedreira);
  check('loja sem nada a descontar fica com 100 (Guarulhos: NF 790 de 800 recebidos, em dia)', r.guarulhos.nota === 100 && r.guarulhos.itens.nf.txt === 'em dia', r.guarulhos);
  check('Maglia fora', !r.maglia, r.ordem);
  check('ranking do melhor pro pior, e a tela na mesma ordem', r.ordem[r.ordem.length - 1] === 'BANGU' && JSON.stringify(r.telaOrdem) === JSON.stringify(r.ordem), r);
  check('linha da loja mostra a nota e os 2 maiores descontos', /Bangu 24/.test(r.resumoBangu) && /🔒 10 caso\(s\) \(−30\)/.test(r.resumoBangu) && /🚨 20 sem identificar \(−25\)/.test(r.resumoBangu), r.resumoBangu);
  check('tocar mostra a conta de todos os itens', /Bloqueios na semana 10 caso\(s\) · −30/.test(r.det) && /NF da semana fechada NF abaixo do recebido · −15/.test(r.det) && /Empréstimo com prazo vencido 0 vencido\(s\) · 0/.test(r.det), r.det);
  check('cabe em 360 px', r.largura[0] <= r.largura[1], r.largura);
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`); await browser.close(); process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
