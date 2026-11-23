// "O couvert é um item obrigatório: precisamos ter a confirmação ou não do trio no dia que
//  tem, e a quantidade arrecadada [...] A partir do próximo fim de semana, nos dias que tem,
//  caso esteja faltando alguma informação, temos que bloquear o fechamento do caixa."
//  (23/11/2026)
//
// Mesmas definições da trava do dia seguinte no Check-list: presença confirmada OU "não
// veio" em cada apresentação; couvert do dia LANÇADO (o ato, não o valor) se alguém tocou.
// Só cobra a apresentação que já terminou na hora do fechamento. Vale de 27/11 em diante.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-caixa.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 400))); c ? ok++ : falhou++; };
const linha = o => Object.assign({ artista: 'Trio Remelexo', horario_inicio: '13:00:00', horario_fim: '17:00:00',
  presenca_confirmada: false, banda_nao_veio: false, couver_lancado_em: null, couver_valor: 0 }, o || {});

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const erros = [];
  const abrir = async (relogio) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await CAMINHOS.fixarRelogio(ctx, relogio);
    const estado = { rows: [], falha: false, pedidos: [] };
    await ctx.route('**/rest/v1/**', r => {
      const u = decodeURIComponent(r.request().url());
      if (/gn_trios_agenda/.test(u)) {
        estado.pedidos.push(u);
        if (estado.falha) return r.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(estado.rows) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => erros.push(String(e.message || e)));
    await page.goto('file://' + ARQ);
    await page.waitForFunction(() => { try { return typeof S === 'object' && S !== null && typeof fecharCaixa === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 });
    return { ctx, page, estado };
  };
  const pend = (p, rows, data, loja) => { p.estado.rows = rows; return p.page.evaluate(async ({ data, loja }) => {
    if (typeof trioPendenteNoFechamento !== 'function') return null;
    S.loja = loja || 'BANGU'; S.fech = { id: 'f1', loja: S.loja, data, turno: 'NOITE', status: 'ABERTO' };
    return await trioPendenteNoFechamento();
  }, { data, loja }); };

  const p = await abrir('2026-11-28T22:00:00');
  const r0 = await pend(p, [linha()], '2026-11-28');
  if (r0 === null) { console.log('FALHOU: a trava do trio no fechamento não existe neste arquivo (contraprova esperada)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1); }
  check('sáb 28/11, 22h, trio das 13h sem nada: cobra presença E couvert', r0.length === 2 && /confirme se a apresentação/.test(r0[0]) && /Trio Remelexo 13:00/.test(r0[0]) && /quantidade de couvert/.test(r0[1]), r0);
  check('busca o trio da loja certa (slug bangu) no dia do caixa', p.estado.pedidos.some(u => /gn_trios_agenda\?loja=eq\.bangu&data=eq\.2026-11-28/.test(u)), p.estado.pedidos);
  let r = await pend(p, [linha({ presenca_confirmada: true })], '2026-11-28');
  check('presença confirmada, couvert não lançado: cobra só o couvert', r.length === 1 && /quantidade de couvert/.test(r[0]), r);
  r = await pend(p, [linha({ presenca_confirmada: true, couver_lancado_em: '2026-11-28T20:00:00Z', couver_valor: 0 })], '2026-11-28');
  check('couvert lançado com ZERO (ninguém pagou) é resposta válida: libera', r.length === 0, r);
  r = await pend(p, [linha({ presenca_confirmada: true, couver_valor: 609 })], '2026-11-28');
  check('couvert com valor também libera', r.length === 0, r);
  r = await pend(p, [linha({ banda_nao_veio: true })], '2026-11-28');
  check('banda marcada como "não veio": não há couvert a lançar, libera', r.length === 0, r);
  r = await pend(p, [linha({ presenca_confirmada: true, couver_lancado_em: '2026-11-28T18:00:00Z' }), linha({ artista: 'Trio Noite', horario_inicio: '19:00:00', horario_fim: '23:00:00' })], '2026-11-28');
  check('duas apresentações, a das 19h–23h ainda tocando às 22h: não cobra a que não terminou', r.length === 0, r);
  r = await pend(p, [], '2026-11-28');
  check('dia sem trio na agenda: nada a cobrar', r.length === 0);
  r = await pend(p, [linha()], '2026-11-26');
  check('antes de 27/11: ainda não trava', r.length === 0);
  r = await pend(p, [linha()], '2026-11-28', 'MAGLIA');
  check('Maglia (sem trio): nada', r.length === 0);
  p.estado.falha = true; r = await pend(p, [linha()], '2026-11-28'); p.estado.falha = false;
  check('falha de rede: não trava o caixa', r.length === 0, r);

  // O fechamento de verdade: a lista de obrigatórios traz o trio e o botão pro Check-list.
  p.estado.rows = [linha()];
  const f = await p.page.evaluate(async () => {
    S.user = { nome: 'Tiago', cargo: 'gerente' }; S.loja = 'BANGU'; S.turnoSel = 'NOITE'; S.modoConsulta = false;
    S.fech = { id: 'f1', loja: 'BANGU', data: '2026-11-28', turno: 'NOITE', status: 'ABERTO', operador: 'Tiago', suprimento_inicial: 700, repique: 0 };
    S.comprovantes = []; S.saidas = []; S.supr = []; S.notas10 = []; S.cancel = []; S.transf = [];
    document.querySelectorAll('.pane').forEach(x => x.classList.remove('hidden'));
    document.getElementById('app').classList.remove('hidden');
    renderTudo();
    await fecharCaixa();
    const el = document.getElementById('fecharErro');
    const a = el.querySelector('a');
    return { txt: el.textContent, href: a ? a.getAttribute('href') : null };
  });
  check('fechar o caixa: a lista de obrigatórios cobra o trio', /Trio: confirme se a apresentação/.test(f.txt) && /Trio: lance a quantidade de couvert/.test(f.txt), f.txt.slice(0, 600));
  check('e traz o botão pro Check-list › Banda', f.href === 'gn-checklist.html?tab=banda', f);
  await p.ctx.close();

  const cedo = await abrir('2026-11-28T13:30:00');
  r = await pend(cedo, [linha({ horario_inicio: '19:00:00', horario_fim: '22:00:00' })], '2026-11-28');
  check('fechar o turno do dia às 13h30 com trio às 19h: não trava (ainda nem tocou)', r.length === 0, r);
  r = await pend(cedo, [linha({ horario_inicio: '09:00:00', horario_fim: null })], '2026-11-28');
  check('sem horário de fim: considera início + 4h (9h → 13h) e cobra às 13h30', r.length === 2, r);
  await cedo.ctx.close();

  const madrugada = await abrir('2026-11-29T01:00:00');
  r = await pend(madrugada, [linha({ horario_inicio: '19:00:00', horario_fim: '23:59:00' })], '2026-11-28');
  check('caixa de ontem fechado de madrugada: todas as apresentações já terminaram, cobra', r.length === 2, r);
  await madrugada.ctx.close();

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
