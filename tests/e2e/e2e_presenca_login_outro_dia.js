// Pedreira, 23/11/2026: o Marlon (sub, turno 15h–23h) aparecia "de folga hoje" no Painel ›
// Equipe e tinha presença confirmada às 07:54 — e às 08:18 e 08:50 nas duas manhãs da semana
// anterior, sempre no computador da loja, minutos antes da gerente da manhã entrar. O login
// vale 12h; o dele, aberto no fim da noite, ainda valia de manhã, e quem abriu o app
// "confirmou presença" por ele. Além disso a escala foi mudada pra folga DEPOIS do login.
//
// Cobra: (1) sessão aberta em outro dia de operação não pergunta "está na loja?" — manda
// entrar com o próprio usuário e NÃO grava presença; (2) a virada das 2h continua valendo
// (quem logou às 23h e fecha a loja à 01:30 não é expulso); (3) sessão de hoje segue o fluxo
// normal; (4) no Painel › Equipe, quem está de folga na escala mas confirmou presença hoje
// aparece com o aviso do conflito.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + String(extra).slice(0, 400))); c ? ok++ : falhou++; };

const SEM = 46;   // 23/11/2026 (segunda) → índice 46, dia 0
const h = (e, s) => ({ entrada: e, saida: s });
const escala = () => ({ [String(SEM)]: { funcs: [
  { id: 0, nome: 'MARLON SIQUEIRA DA SILVA', setor: 'Sub Gerente', dias: ['FOLGA', 'FOLGA', 'PRESENTE', 'PRESENTE', 'PRESENTE', 'PRESENTE', 'PRESENTE'], horario_dias: Array(7).fill(h('15:00', '23:00')) },
  { id: 1, nome: 'VITORIA SANTOS', setor: 'Gerente', dias: Array(7).fill('PRESENTE'), horario_dias: Array(7).fill(h('08:00', '17:00')) },
  { id: 2, nome: 'CARLA DIAS', setor: 'Sub Gerente', dias: ['FOLGA', 'PRESENTE', 'PRESENTE', 'PRESENTE', 'PRESENTE', 'PRESENTE', 'FOLGA'], horario_dias: Array(7).fill(h('15:00', '23:00')) },
] } });

async function abrir(browser, quando) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, quando);
  const req = { presenca: [] };
  await ctx.route('**/rest/v1/**', r => {
    const q = r.request(), url = q.url(), m = q.method();
    const json = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/gn_presenca_loja/.test(url) && m === 'POST') { req.presenca.push(JSON.parse(q.postData() || '{}')); return r.fulfill({ status: 201, body: '' }); }
    if (/gn_presenca_loja/.test(url)) return json([]);
    if (/gn_usuarios_publico/.test(url)) return json([{ escala_nome: 'VITORIA SANTOS' }]);
    if (/gn_comissoes/.test(url)) return json([{ all_data: escala() }]);
    return json([]);
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => { try { return typeof gnPresencaGuardiao === 'function' && typeof showHome === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 });
  return { ctx, page, req, erros };
}
// Entra com uma sessão cujo login foi feito em `loginEm` (ISO local).
async function entrar(page, loginEm) {
  await page.evaluate((loginEm) => {
    try { Object.keys(localStorage).filter(k => k.indexOf('gn_presenca_') === 0).forEach(k => localStorage.removeItem(k)); } catch (e) {}
    const ov = document.getElementById('gate-presenca'); if (ov) ov.remove();
    window.__saiu = 0;
    session = { id: 30, nome: 'Vitória', cargo: 'gerente', loja: 'PEDREIRA', permissoes: {}, ts: new Date(loginEm).getTime() };
    masterLoja = null; LOJAS_LISTA = _computeLojasVisiveis(session);
    gnPresencaGuardiao({ sbUrl: SB_URL, sbKey: SB_KEY, sessao: session, aoSair: () => { window.__saiu++; } });
  }, loginEm);
  await page.waitForTimeout(500);
  return page.evaluate(() => { const ov = document.getElementById('gate-presenca'); return ov ? ov.textContent.replace(/\s+/g, ' ').trim() : ''; });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  // ── 1. Manhã de segunda, login aberto domingo à noite ──
  const a = await abrir(browser, '2026-11-23T07:54:00');
  let t = await entrar(a.page, '2026-11-22T22:10:00');
  check('login de domingo 22:10, aberto segunda 07:54: NÃO pergunta "está na loja?"', /Este login é de outro dia/.test(t) && !/Você está na loja|Confirmar/i.test(t), t);
  check('e diz de quem é o login e pra entrar com o próprio usuário', /Vitória/.test(t) && /próprio usuário/.test(t), t);
  check('nenhuma presença é gravada', a.req.presenca.length === 0, JSON.stringify(a.req.presenca));
  await a.page.click('#gn-pres-velha-sair');
  check('o botão sai da conta (manda pro login)', (await a.page.evaluate(() => window.__saiu)) === 1);

  // ── 2. Sessão de hoje: fluxo normal ──
  t = await entrar(a.page, '2026-11-23T07:50:00');
  check('login de hoje 07:50 segue o fluxo normal (pergunta a presença)', t && !/outro dia/.test(t), t);
  a.erros.forEach(e => console.log('   erro:', e));
  const errosA = a.erros.length;
  await a.ctx.close();

  // ── 3. Virada: logou 23:10 de domingo, ainda fechando a loja à 01:30 de segunda ──
  const b = await abrir(browser, '2026-11-23T01:30:00');
  t = await entrar(b.page, '2026-11-22T23:10:00');
  check('virada das 2h: login 23:10, agora 01:30 — continua o mesmo dia, não expulsa', !/outro dia/.test(t), t);
  const errosB = b.erros.length;
  await b.ctx.close();

  // ── 4. Painel › Equipe: folga na escala × presença de hoje ──
  const c = await abrir(browser, '2026-11-23T10:00:00');
  const p = await c.page.evaluate((esc) => {
    LOJAS_LISTA = ['PEDREIRA'];
    _dashComissoesAll = [{ loja: LOJA_COM_KEY['PEDREIRA'] || 'PEDREIRA', all_data: esc }];
    _dashPresencaHoje = [
      { loja: 'PEDREIRA', nome: 'Marlon', cargo: 'sub_gerente', estado: 'fora_do_horario', hora_confirmacao: '07:54', escala_entrada: '15:00', escala_saida: '23:00', escala_nome: 'MARLON SIQUEIRA DA SILVA' },
      { loja: 'PEDREIRA', nome: 'Vitória', cargo: 'gerente', estado: 'no_horario', hora_confirmacao: '07:57', escala_entrada: '08:00', escala_saida: '17:00', escala_nome: 'VITORIA SANTOS' },
    ];
    _folgasOff = 0;
    const h2 = document.createElement('div'); h2.innerHTML = _buildFolgasGerenciaPanel();
    const hoje = h2.querySelector('.folgas-hoje');
    return { txt: hoje ? hoje.textContent.replace(/\s+/g, ' ') : '', conflitos: [...h2.querySelectorAll('.folgas-conflito')].map(x => x.textContent.replace(/\s+/g, ' ').trim()) };
  }, escala());
  check('Marlon de folga hoje aparece com o aviso: confirmou presença às 07:54', p.conflitos.length === 1 && /confirmou presença hoje às 07:54/.test(p.conflitos[0]) && /15:00–23:00/.test(p.conflitos[0]), JSON.stringify(p));
  check('Carla, de folga e SEM presença, aparece sem aviso', /CARLA DIAS/.test(p.txt) && p.conflitos.every(x => !/CARLA/.test(x)), p.txt);
  const errosC = c.erros.length; c.erros.forEach(e => console.log('   erro:', e));
  await c.ctx.close();

  check('nenhum erro de JavaScript', errosA + errosB + errosC === 0);
  await browser.close();
  console.log(`\n${ok} ok, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
