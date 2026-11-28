// Painel › Atenção enxuta (28/11/2026): eram 86 alertas e o sino mostrava 86 — o número não
// dizia nada. Cobra: sino conta só o urgente (sev 0–1); manutenção pendente + parada numa
// linha só; informativo (acompanhamento remoto em andamento) num quadro à parte, fora das
// contagens; cada loja mostra os 3 piores e o resto recolhido ("+ N"), com botão pra abrir.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 600))); c ? ok++ : falhou++; };
(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: 'America/Sao_Paulo' });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-28T10:00:00-03:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage(); const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
  for (let t = 1; ; t++) { await page.goto('file://' + HOME); try { await page.waitForFunction(() => { try { return typeof _computeAlertas === 'function' && typeof _buildAlertsFeed === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 }); break; } catch (e) { if (t >= 4) throw e; } }
  const r = await page.evaluate(() => {
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    document.getElementById('home-screen').style.display = 'block'; document.getElementById('dash-section').style.display = 'block';
    // Faturamento igual nos dois períodos (sem 📉) e em todas as lojas (sem "sem faturamento").
    const f = {}; LOJAS_LISTA.forEach(k => f[k] = 1000);
    _dashFat = f; _dashFatPrev = Object.assign({}, f); _dashMetas = {}; _dashChk = new Set(LOJAS_LISTA);
    _dashManut = { BANGU: 28, CAXIAS: 2 }; _dashManutParada = { BANGU: 22 };
    _dashCaixaSemConferencia = { BANGU: [{ data: '2026-11-20', turno: 'DIA' }] };
    _dashVisitasAndamento = {}; LOJAS_LISTA.filter(k => k !== 'MAGLIA').forEach(k => { _dashVisitasAndamento[k] = [{ nome: 'Tiago', origem: 'Visitante', horaChegada: '08:43' }]; });
    _dashEscalaIncompleta = { BANGU: [{ nome: 'A', dias: ['Seg'] }] };
    _dashXmlPendentes = new Set(['BANGU']);
    const A = _computeAlertas();
    _setDashTab('att'); renderDashboard();
    if (typeof _updateHdrBell === 'function') _updateHdrBell();
    const sec = document.getElementById('dash-section');
    const bangu = sec.querySelector('.att-loja[data-loja="BANGU"]');
    const out = {
      manut: A.filter(a => /manut/.test(a.msg) && a.loja === 'BANGU').map(a => a.sev + ' | ' + a.msg),
      urg: typeof _alertasUrgentes === 'function' ? _alertasUrgentes(A).length : null,
      sino: (document.getElementById('hdr-bell-badge') || {}).textContent || '',
      info: (sec.querySelector('.att-info') || {}).innerText || '',
      visitaNaLoja: [...sec.querySelectorAll('.att-loja .alrt-msg')].some(x => /visita em andamento/.test(x.textContent)),
      banguVis: bangu ? bangu.querySelectorAll('.alrt').length : -1,
      banguTot: A.filter(a => a.loja === 'BANGU' && a.sev < 4).length,
      mais: bangu && bangu.querySelector('.att-mais') ? bangu.querySelector('.att-mais').textContent.trim() : '',
      resumo: (sec.querySelector('.att-resumo') || {}).innerText || '',
    };
    if (typeof _attToggleLoja === 'function') _attToggleLoja('BANGU');
    const b2 = document.getElementById('dash-section').querySelector('.att-loja[data-loja="BANGU"]');
    out.banguAberto = b2 ? b2.querySelectorAll('.alrt').length : -1;
    return out;
  });
  check('manutenção de Bangu vira UMA linha: "28 manut. pendentes · 22 paradas há mais de 5 dias", urgente', r.manut.length === 1 && /^0 \| Bangu com 28 manut\. pendentes · 22 paradas há mais de 5 dias/.test(r.manut[0]), r.manut);
  check('urgentes = só sev 0–1 (Bangu manutenção parada + Caxias manutenção pendente)', r.urg === 2, r);
  check('sino mostra só os urgentes (2), não todos', r.sino === '2', r.sino);
  check('acompanhamento remoto (11 lojas) num quadro informativo só, fora das lojas', /Em andamento/i.test(r.info) && /11 lojas/.test(r.info) && /Tiago \(Visitante\) desde 08:43/.test(r.info) && !r.visitaNaLoja, r);
  check('Bangu mostra os 3 piores e recolhe o resto ("+ N alertas menores")', r.banguTot > 3 && r.banguVis === 3 && new RegExp('\\+ ' + (r.banguTot - 3) + ' alerta').test(r.mais), r);
  check('tocar abre todos os alertas da loja', r.banguAberto === r.banguTot, r);
  check('resumo do topo começa pelos urgentes', /^2 urgentes/i.test(r.resumo.trim()), r.resumo);
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`); await browser.close(); process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
