// Painel › Caixa › 🚨 Divergências (27/11/2026): divergências de caixa do Financeiro que a loja
// não registrou como identificadas, TODAS as datas, ranking da loja com mais pendências e, por
// loja, da mais antiga pra mais nova. Cobra também:
//  - a loja vem do fechamento, não da linha onde a conferência está gravada (cópia solta da
//    Caxias na linha "SÃO GONÇALO" não vira pendência de São Gonçalo nem duplica a Caxias);
//  - identificada não conta como pendente; sem divergência não entra; Maglia fora;
//  - relatório de WhatsApp com a lista.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 700))); c ? ok++ : falhou++; };
const DIV = (v, por) => ({ tem_divergencia: true, conferido_por: por || 'Financeiro', conferido_em: '2026-11-20T15:00:00Z',
  itens: { bandeiras: { 'Visa Crédito': { label: 'Visa Crédito', sistema: 100, conferido: 100 + v, dif: v } }, total_real: { label: 'Total Real (Cofre)', sistema: 1, conferido: 1, dif: 0 } } });
const RES = c => Object.assign({}, c, { divergencia_resolvida: { resolvido_por: 'Ana', resolvido_em: '2026-11-21T10:00:00Z' } });
const CONF = {
  CAXIAS: { cx1: DIV(-20), cx2: DIV(15), cx3: RES(DIV(-5)), cx4: { tem_divergencia: false, itens: {} } },
  BANGU: { bg1: DIV(-50), bg2: DIV(-10), bg3: DIV(30) },
  PEDREIRA: { pd1: DIV(-7) },
  MAGLIA: { mg1: DIV(-99) },
};
// Cópia solta: as conferências da Caxias também gravadas na linha "SÃO GONÇALO".
const STRAY = { cx1: CONF.CAXIAS.cx1, cx2: CONF.CAXIAS.cx2 };
const FECH = [
  { id: 'cx1', loja: 'CAXIAS', data: '2026-09-02', turno: 'NOITE' }, { id: 'cx2', loja: 'CAXIAS', data: '2026-11-24', turno: 'DIA' },
  { id: 'cx3', loja: 'CAXIAS', data: '2026-11-10', turno: 'DIA' }, { id: 'cx4', loja: 'CAXIAS', data: '2026-11-11', turno: 'DIA' },
  { id: 'bg1', loja: 'BANGU', data: '2026-10-05', turno: 'DIA' }, { id: 'bg2', loja: 'BANGU', data: '2026-11-26', turno: 'NOITE' }, { id: 'bg3', loja: 'BANGU', data: '2026-11-01', turno: 'DIA' },
  { id: 'pd1', loja: 'PEDREIRA', data: '2026-11-27', turno: 'DIA' }, { id: 'mg1', loja: 'MAGLIA', data: '2026-11-20', turno: 'DIA' },
];
(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 360, height: 900 }, timezoneId: 'America/Sao_Paulo' });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-27T18:00:00-03:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof renderDashboard === 'function' && typeof _setDashTab === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 }); break; }
    catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }
  if (!(await page.evaluate(() => typeof _buildDivergPanel === 'function'))) {
    console.log('FALHOU: a aba 🚨 Divergências não existe neste arquivo (contraprova esperada — é nova)');
    console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }
  const r = await page.evaluate(async ({ CONF, STRAY, FECH }) => {
    const out = { urls: [] }, abertos = [];
    window.gnFetchJson = async (url, h, nome, fb) => {
      out.urls.push(nome + ' ' + decodeURIComponent(url));
      if (nome === 'diverg:conferencias') {
        const pedidas = decodeURIComponent(url).match(/loja=in\.\(([^)]*)\)/)[1].split(',').map(x => x.replace(/"/g, ''));
        const rows = Object.entries(CONF).filter(([k]) => pedidas.includes(k)).map(([loja, conf]) => ({ loja, conf }));
        if (pedidas.includes('SÃO GONÇALO')) rows.push({ loja: 'SÃO GONÇALO', conf: STRAY });
        return rows;
      }
      if (nome === 'diverg:fechamentos') { const ids = decodeURIComponent(url).match(/id=in\.\(([^)]*)\)/)[1].split(','); return FECH.filter(f => ids.includes(f.id)); }
      return fb === undefined ? [] : fb;
    };
    window.open = u => { abertos.push(decodeURIComponent(String(u).split('text=')[1] || '')); return null; };
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    document.getElementById('home-screen').style.display = 'block';
    document.getElementById('dash-section').style.display = 'block';
    // Simula também a linha "SÃO GONÇALO" sendo lida (pior caso): a loja tem que vir do fechamento.
    const _orig = LOJA_COM_KEY['SÃO GONÇALO']; LOJA_COM_KEY['SÃO GONÇALO'] = 'SÃO GONÇALO';
    _dashGrupoIr('caixa');
    out.abaInicialCaixa = _dashTab;
    for (let i = 0; i < 40 && !document.querySelector('.div-loja'); i++) await new Promise(r => setTimeout(r, 100));
    LOJA_COM_KEY['SÃO GONÇALO'] = _orig;
    const lojas = [...document.querySelectorAll('.div-loja')];
    out.ordem = lojas.map(l => l.dataset.loja);
    out.pend = lojas.map(l => l.querySelector('.div-pend').textContent.trim());
    out.resumoCaxias = (lojas.find(l => l.dataset.loja === 'CAXIAS') || { textContent: '' }).querySelector('.div-resumo').textContent.replace(/\s+/g, ' ');
    out.tot = (document.querySelector('.div-tot') || {}).textContent || '';
    out.sem = (document.querySelector('.div-sem') || {}).textContent || '';
    out.maglia = /Maglia/.test(document.getElementById('dash-section').textContent);
    _divToggle('BANGU');
    await new Promise(r => setTimeout(r, 50));
    out.casosBangu = [...document.querySelectorAll('.div-loja[data-loja="BANGU"] .div-caso')].map(c => c.textContent.replace(/\s+/g, ' ').trim());
    const sec = document.getElementById('dash-section');
    out.largura = [document.documentElement.scrollWidth, window.innerWidth];
    // Alerta do Painel › Atenção: só o que passou de 7 dias, um por loja.
    out.alertas = _computeAlertas().filter(a => a.tipo === 'diverg').map(a => a.loja + ' | ' + a.msg + ' | ' + a.sub);
    gerarWppDiverg();
    out.wpp = abertos[0] || '';
    return out;
  }, { CONF, STRAY, FECH });
  check('o grupo 🧾 Caixa abre direto em Divergências', r.abaInicialCaixa === 'diverg', r.abaInicialCaixa);
  check('ranking: Bangu (3) › Caxias (2) › Pedreira (1)', JSON.stringify(r.ordem) === JSON.stringify(['BANGU', 'CAXIAS', 'PEDREIRA']), r);
  check('Caxias conta 2, não 4: a cópia solta não duplica e a identificada não entra', r.pend[1] === '2 pendentes', r.pend);
  check('São Gonçalo não ganha pendência da cópia da Caxias', !r.ordem.includes('SÃO GONÇALO') && /São Gonçalo/.test(r.sem), r);
  check('Maglia fora', !r.maglia, r);
  check('total da rede: 6 pendentes', /^6 pendentes/.test(r.tot.trim()), r.tot);
  check('resumo da Caxias: mais antiga 02/09 (há 86 dias), R$ 35,00, 1 identificada', /Mais antiga: 02\/09 \(há 86 dias\)/.test(r.resumoCaxias) && /R\$ 35,00 em diferenças/.test(r.resumoCaxias) && /1 já identificada/.test(r.resumoCaxias), r.resumoCaxias);
  check('Bangu aberta: da mais antiga (05/10) pra mais nova (26/11), com o item e a diferença', r.casosBangu.length === 3 && /^05\/10/.test(r.casosBangu[0]) && /^01\/11/.test(r.casosBangu[1]) && /^26\/11 · NOITE\s*ontem/.test(r.casosBangu[2]) && /Visa Crédito\s*-R\$ 50,00/.test(r.casosBangu[0]) && /Visa Crédito\s*\+R\$ 30,00/.test(r.casosBangu[1]) && !/Total Real/.test(r.casosBangu.join('')), r.casosBangu);
  check('cabe em 360 px sem rolagem de lado', r.largura[0] <= r.largura[1], r.largura);
  check('WhatsApp: lista as lojas, cada caixa e como tirar da lista', /1º Bangu\* — 3 pendentes/.test(r.wpp) && /02\/09 NOITE: Visa Crédito -R\$ 20,00/.test(r.wpp) && /Marcar como identificado/.test(r.wpp) && !/Maglia/.test(r.wpp), r.wpp);
  check('Atenção: alerta pra Bangu (2 com mais de 7 dias; a de ontem não conta) e Caxias (1; a de 3 dias não conta)',
    r.alertas.length === 2 && r.alertas.some(a => /^BANGU \| Bangu com 2 divergências de caixa sem identificar há mais de 7 dias · total = igual há 7 dias \| Mais antiga 05\/10 \(há 53 dias\) · R\$ 80,00/.test(a))
      && r.alertas.some(a => /^CAXIAS \| Caxias com 1 divergência de caixa sem identificar há mais de 7 dias · total ▼ 1 em 7 dias \| Mais antiga 02\/09 \(há 86 dias\) · R\$ 20,00/.test(a)), r.alertas);
  check('Atenção: Pedreira (só de hoje) e Maglia sem alerta', !r.alertas.some(a => /^(PEDREIRA|MAGLIA)/.test(a)), r.alertas);
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`); await browser.close(); process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
