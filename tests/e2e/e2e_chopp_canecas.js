// Chopp em canecas, dia a dia (26/11/2026): "na descrição usar sempre a métrica de canecas por
// barril, igual da Coca: seg tinha 1 e meio, 128 + 64 e o total; chegou 1, acrescentar 128
// canecas, e diminuir da venda do dia … e replicar no home das lojas."
// Mesmo detalhe (gnChoppControle.detalheHtml) no Painel › Barris, no Acompanhamento (Painel e
// Home da loja) e na aba Barris do app Lojas. + legenda do 🍺N da pergunta diária.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 700))); c ? ok++ : falhou++; };
// O exemplo do dono: segunda tinha 1½ barril (1 cheio + 1 na linha pela metade); terça chegou 1.
const S = (st, quando) => ({ semana_inicio: quando.slice(0, 10) === '2026-11-26' ? '2026-11-26' : '2026-11-23', tipo: 'CLARO', status: st, criado_em: quando });
const CONT = [S('CHEIO', '2026-11-23T11:00:00+00:00'), S('NA_LINHA_METADE', '2026-11-23T11:00:00+00:00'), S('VAZIO', '2026-11-23T11:00:00+00:00'),
  S('CHEIO', '2026-11-26T11:00:00+00:00'), S('NA_LINHA_ABAIXO_METADE', '2026-11-26T11:00:00+00:00')];
const ENT = [{ catalogo_id: 'd8d457b1-0fb9-4c58-952b-27c175700f1f', produto: 'Barril Chopp claro', criado_em: '2026-11-24T18:00:00+00:00' }];
const L = c => (c * 0.35);
const VEND = [{ data: '2026-11-23', totais: { chopp_l_claro: L(50) } }, { data: '2026-11-24', totais: { chopp_l_claro: L(60) } }, { data: '2026-11-25', totais: { chopp_l_claro: L(45) } }];

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const erros = [];
  const abrir = async (arq, pronto) => {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 360, height: 900 }, timezoneId: 'America/Sao_Paulo' });
    await CAMINHOS.fixarRelogio(ctx, '2026-11-26T15:00:00-03:00');
    await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
    const page = await ctx.newPage(); page.on('pageerror', e => erros.push(String(e.message)));
    for (let t = 1; ; t++) {
      await page.goto('file://' + arq);
      try { await page.waitForFunction(pronto, null, { timeout: 25000 }); break; } catch (e) { if (t >= 4) throw new Error('não carregou ' + arq); }
    }
    return { ctx, page };
  };
  // ── Módulo ──
  let { ctx, page } = await abrir(HOME, () => { try { return !!window.gnChoppControle && typeof renderDashboard === 'function'; } catch (e) { return false; } });
  if (!(await page.evaluate(() => typeof window.gnChoppControle.detalheHtml === 'function'))) {
    console.log('FALHOU: o detalhe em canecas não existe neste arquivo (contraprova esperada — é novo)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }
  const m = await page.evaluate(({ CONT, ENT, VEND }) => {
    const G = window.gnChoppControle;
    const j = G.janelasLoja({ cont: CONT, ent: ENT, tipoDe: () => 'CLARO', vend: VEND, W1: '2026-11-16', W: '2026-11-23', QUI: '2026-11-26', inicio: '2026-11-23' });
    const r = j.acomp.CLARO;
    const d = document.createElement('div'); d.innerHTML = G.detalheHtml(r, { rotIni: 'Contagem de segunda (23/11)', rotFim: 'Contagem de quinta (26/11)' }); document.body.appendChild(d);
    const out = { porDia: r.porDia.map(x => [x.dia, x.ent, Math.round(x.canecas)]), ini: d.querySelector('.chopp-det-ini').innerText, fim: d.querySelector('.chopp-det-fim').innerText,
      linhas: [...d.querySelectorAll('.chopp-dia')].map(t => t.innerText.replace(/\s+/g, ' ').trim()), ver: d.querySelector('.chopp-det-ver').innerText, status: r.status, resumo: G.resumo(r) };
    d.remove();
    // Legenda da pergunta diária no Painel.
    const h = document.createElement('div'); h.innerHTML = _choppRespostasHtml([{ dia: '2026-11-26', r: { resposta: 'SIM', finalizados: 5, respondido_por: 'Júlia' } }]);
    out.legenda = h.innerText.replace(/\s+/g, ' ');
    return out;
  }, { CONT, ENT, VEND });
  check('início: "1 cheio + 1 na linha pela metade = 128 + 64 = 192 canecas (+ 1 vazio)"', /^📋 Contagem de segunda \(23\/11\): 1 cheio \+ 1 na linha pela metade = 128 \+ 64 = 192 canecas \(\+ 1 vazio\)/.test(m.ini), m.ini);
  check('o barril que chegou na terça entra na linha de terça', JSON.stringify(m.porDia) === JSON.stringify([['2026-11-23', 0, 50], ['2026-11-24', 1, 60], ['2026-11-25', 0, 45]]), m.porDia);
  check('dia a dia: seg 192 −50 = 142 · ter 142 +128 −60 = 210 · qua 210 −45 = 165',
    m.linhas[0] === 'seg 23/11 192 — −50 142' && m.linhas[1] === 'ter 24/11 142 +128 (1 barril) −60 210' && m.linhas[2] === 'qua 25/11 210 — −45 165', m.linhas);
  check('fim: "1 cheio + 1 na linha abaixo da metade = 128 + 32 = 160 canecas"', /1 cheio \+ 1 na linha abaixo da metade = 128 \+ 32 = 160 canecas/.test(m.fim), m.fim);
  check('veredito em canecas: contou 160, deveria ter 165 → bate (5 de diferença, precisão de 32)', m.status === 'ok' && /Contou 160 · deveria ter 165 → ✓ bate — diferença de 5 canecas/.test(m.ver), m.ver);
  check('resumo de uma linha: início 192 + chegou 128 (1 barril) − vendeu 155 = deveria ter 165 · contou 160', m.resumo.linha === 'início 192 + chegou 128 (1 barril) − vendeu 155 = deveria ter 165 · contou 160', m.resumo.linha);
  check('Painel: a pergunta diária explica o 🍺N', /🍺N = a loja respondeu que N barris acabaram naquele dia/.test(m.legenda) && /🍺5/.test(m.legenda), m.legenda);
  await ctx.close();

  // ── App Lojas › Barris: o mesmo, só da loja ──
  ({ ctx, page } = await abrir(LOJAS, () => { try { return typeof _barrisVisaoHtml === 'function' && !!window.gnChoppControle; } catch (e) { return false; } }));
  const l = await page.evaluate(({ CONT, ENT, VEND }) => {
    const j = window.gnChoppControle.janelasLoja({ cont: CONT, ent: ENT, tipoDe: () => 'CLARO', vend: VEND, W1: '2026-11-16', W: '2026-11-23', QUI: '2026-11-26', inicio: '2026-11-23' });
    _barrisVisao = { j, W: '2026-11-23', W1: '2026-11-16', QUI: '2026-11-26', resp: [] };
    const d = document.createElement('div'); d.innerHTML = _barrisVisaoHtml(); document.body.appendChild(d);
    d.querySelectorAll('details').forEach(x => x.open = true);
    const out = { txt: d.innerText.replace(/\s+/g, ' '), larg: d.scrollWidth <= window.innerWidth };
    d.remove(); return out;
  }, { CONT, ENT, VEND });
  check('app Lojas: mesma linha em canecas e o mesmo dia a dia', /início 192 \+ chegou 128 \(1 barril\) − vendeu 155 = deveria ter 165 · contou 160 canecas/.test(l.txt) && /ter 24\/11 142 \+128 \(1 barril\) −60 210/.test(l.txt) && /Contagem de quinta \(26\/11\)/.test(l.txt), l.txt);
  check('app Lojas: legenda do 🍺N', /🍺N = N barris acabaram/.test(l.txt), l.txt);
  check('app Lojas: cabe em 360 px', l.larg);
  await ctx.close();
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`); await browser.close(); process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
