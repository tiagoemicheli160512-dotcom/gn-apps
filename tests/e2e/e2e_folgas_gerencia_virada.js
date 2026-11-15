// 15/11/2026, dois pedidos:
//  1. "No painel gestão, na aba equipe, tem como incluir as folgas da equipe gerencial, pois
//     hoje tenho que entrar na loja pra saber quem tá de folga."
//  2. "Tem lojas que fecham um pouco mais tarde, e acaba passando de 00h e acaba que trava,
//     caso esteja de folga no outro dia. Tem como ter uma tolerância de 2h após 00h?"
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };

// 02/10/2026 é sexta (semana 38, dia 4); 03/10 é sábado (dia 5).
const SEM = 38, P = 'PRESENTE';
const SEMANA = { funcs: [
  { id: 1, nome: 'Renata ALVES - gerente', setor: 'Gerente', ferias_ini: '', ferias_fim: '', dias: [P, P, P, P, P, 'FOLGA', P] },   // folga no SÁBADO
  { id: 2, nome: 'Marcos ALVES - sub', setor: 'Sub Gerente', ferias_ini: '', ferias_fim: '', dias: [P, P, P, P, 'FOLGA', P, P] },     // folga na SEXTA
] };
const sessao = nome => ({ id: 99, nome: 'X', loja: 'CAXIAS', cargo: 'gerente', permissoes: { escala_nome: nome }, ts: Date.now() });

async function abrir(browser, quando) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, quando);
  await ctx.route('**/rest/v1/**', r => {
    const url = r.request().url();
    if (/gn_comissoes/.test(url)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ [String(SEM)]: SEMANA }]) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => { try { return !!window.gnEscalaAcesso && typeof _presHojeISO === 'function' && typeof _buildFolgasGerenciaPanel === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 })
    .catch(() => {});
  return { ctx, page, erros };
}
const verificar = (page, nome) => page.evaluate(n => gnEscalaAcesso.verificar({ id: 99, nome: 'X', loja: 'CAXIAS', cargo: 'gerente', permissoes: { escala_nome: n }, ts: Date.now() }, { semCache: true }), nome);

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const erros = [];
  {
    const a = await abrir(browser, '2026-10-03T01:30:00');
    const existe = await a.page.evaluate(() => { try { return typeof _buildFolgasGerenciaPanel === 'function'; } catch (e) { return false; } });
    if (!existe) { console.log('FALHOU: a aba de folgas da gerência não existe neste arquivo (contraprova esperada — é nova)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1); }

    // ── 2. Virada da meia-noite ──
    const r1 = await verificar(a.page, 'Renata ALVES - gerente');
    check('sábado 01h30, fechando a sexta, folga só no sábado: NÃO trava (até 2h vale a sexta)', r1.bloqueado === false, r1);
    const r2 = await verificar(a.page, 'Marcos ALVES - sub');
    check('…e quem estava de folga na SEXTA continua barrado às 01h30 (o dia que vale é a sexta)', r2.bloqueado === true && r2.motivo === 'folga', r2);
    const pres1 = await a.page.evaluate(() => _presHojeISO());
    check('trava de presença às 01h30: ainda é o dia 02/10 (não pede presença do sábado no meio do fechamento)', pres1 === '2026-10-02', pres1);
    erros.push(...a.erros); await a.ctx.close();
  }
  {
    const b = await abrir(browser, '2026-10-03T02:30:00');
    const r3 = await verificar(b.page, 'Renata ALVES - gerente');
    check('sábado 02h30 (passou da tolerância): a folga do sábado trava', r3.bloqueado === true && r3.motivo === 'folga', r3);
    const pres2 = await b.page.evaluate(() => _presHojeISO());
    check('…e a presença já é a do sábado', pres2 === '2026-10-03', pres2);
    erros.push(...b.erros); await b.ctx.close();
  }
  {
    const c = await abrir(browser, '2026-10-02T23:50:00');
    const r4 = await verificar(c.page, 'Marcos ALVES - sub');
    check('sexta 23h50 nada muda: folga da sexta trava', r4.bloqueado === true, r4);
    erros.push(...c.erros); await c.ctx.close();
  }

  // ── 1. Folgas da gerência no Painel ──
  const d = await abrir(browser, '2026-11-15T10:00:00');   // domingo
  const f = await d.page.evaluate(() => {
    const idx = _escalaHomeSemIdx('2026-11-15');
    const P2 = 'PRESENTE', fs = (nome, setor, dias, horas) => ({ nome, setor, dias, horario_dias: horas || [] });
    const sem = (funcs) => ({ [String(idx)]: { funcs } });
    LOJAS_LISTA = ['BANGU', 'CAXIAS', 'PEDREIRA', 'MAGLIA'];
    _folgasOff = 0;
    _dashComissoesAll = [
      { loja: LOJA_COM_KEY.BANGU || 'BANGU', all_data: sem([
        fs('Fernando', 'Gerente', [P2, 'FOLGA', P2, P2, P2, P2, P2], [{ entrada: '10:00', saida: '18:00' }]),
        fs('Carol', 'Sub Gerente', [P2, P2, P2, P2, P2, P2, 'FOLGA']),
        fs('Júlio', 'Salão', [P2, P2, P2, P2, P2, P2, 'FOLGA']) ]) },          // garçom: não é gerência
      { loja: LOJA_COM_KEY.CAXIAS || 'CAXIAS', all_data: sem([
        fs('Renata', 'Gerente', [P2, P2, P2, P2, P2, P2, 'FOLGA']),
        fs('Kelvin', 'Sub Gerente', [P2, P2, P2, P2, P2, P2, 'FÉRIAS']) ]) },  // os dois fora no domingo
      { loja: LOJA_COM_KEY.PEDREIRA || 'PEDREIRA', all_data: sem([
        fs('Marlon', 'Gerente', [P2, P2, P2, P2, P2, P2, P2]) ]) },
      { loja: 'MAGLIA', all_data: sem([ fs('M', 'Gerente', [P2, P2, P2, P2, P2, P2, 'FOLGA']) ]) },
    ];
    const host = document.createElement('div'); host.innerHTML = _buildFolgasGerenciaPanel(); document.body.appendChild(host);
    const hoje = host.querySelector('.folgas-hoje');
    const lojas = [...host.querySelectorAll('.folgas-loja')].map(e => ({ k: e.dataset.loja, pessoas: [...e.querySelectorAll('.folgas-pessoa')].map(x => x.textContent.replace(/\s+/g, ' ').trim()) }));
    const out = { hoje: hoje ? hoje.textContent.replace(/\s+/g, ' ') : '', lojas, txt: host.textContent.replace(/\s+/g, ' ') };
    host.remove();
    // A aba existe no grupo Equipe.
    out.aba = JSON.stringify((typeof DASH_GRUPOS !== 'undefined' ? DASH_GRUPOS : []));
    return out;
  });
  check('Equipe › Folgas: no topo, quem da gerência está fora HOJE (Carol, Renata de folga; Kelvin de férias)',
    /Carol/.test(f.hoje) && /Renata/.test(f.hoje) && /Kelvin.*férias/.test(f.hoje) && !/Fernando/.test(f.hoje), f.hoje);
  check('…e avisa a loja que ficou sem nenhum gerente hoje (Caxias)', /Sem nenhum gerente na escala hoje: Caxias/.test(f.hoje), f.hoje);
  check('a semana de cada loja, com a gerência (Gerente e Sub Gerente) — garçom não entra', f.lojas.find(l => l.k === 'BANGU') && f.lojas.find(l => l.k === 'BANGU').pessoas.length === 2 && !/Júlio/.test(f.txt), f.lojas);
  check('a folga aparece no dia certo (Fernando: F na terça) e o dia trabalhado mostra a entrada (10h)', /Fernando.*10h ?F/.test((f.lojas.find(l => l.k === 'BANGU') || { pessoas: [] }).pessoas[0] || ''), f.lojas);
  check('Maglia fica fora (não citada)', !f.lojas.some(l => l.k === 'MAGLIA'), f.lojas.map(l => l.k));
  check('loja sem ninguém de gerência fora hoje não aparece no aviso (Pedreira)', !/Pedreira/.test(f.hoje), f.hoje);
  erros.push(...d.erros); await d.ctx.close();

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
