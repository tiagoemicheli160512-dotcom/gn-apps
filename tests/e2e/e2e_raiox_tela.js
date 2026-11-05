// A tela do raio-x: a faixa de chips dentro do card da loja, o painel que ela abre, e o
// recorte Raio-X do relatório. O motor já é testado em e2e_raiox_motor.js — aqui o que
// importa é que os três mostrem o que o motor calculou, e que o card continue legível.
//
// Dois pontos que o card não pode errar: tocar na faixa NÃO pode entrar na loja (o corpo
// do card já faz isso), e chip zerado não pode aparecer — uma fileira de zeros ocupa o
// mesmo espaço de 180px sem informar nada.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => {
  console.log((c ? 'OK: ' : 'FALHOU: ') + n);
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 300));
  c ? ok++ : falhou++;
};

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message || e)));

  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try {
      await page.waitForFunction(() => {
        try { return typeof _raioxFaixaCard === 'function' && typeof _raioxHtml === 'function'
                  && typeof _relTextoRaiox === 'function' && COMISSOES_CAL.length > 0; }
        catch (e) { return false; }
      }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }

  const cal = await page.evaluate(() => {
    const iso = d => d.y + '-' + String(d.m).padStart(2, '0') + '-' + String(d.d).padStart(2, '0');
    return { idx: 38, dias: COMISSOES_CAL[38].days.map(iso), comBangu: LOJA_COM_KEY['BANGU'], chkBangu: LOJA_DB_KEY['BANGU'],
             comCaxias: LOJA_COM_KEY['CAXIAS'] };
  });

  // Bangu com problema de tudo quanto é tipo; Caxias limpa, pra provar o contraste.
  const semear = (extra) => page.evaluate(({ cal, extra }) => {
    const D = o => { const a = Array(7).fill('PRESENTE'); Object.entries(o).forEach(([i, v]) => a[i] = v); return a; };
    _dashComissoesAll = [
      { loja: cal.comBangu, all_data: { [cal.idx]: { funcs: [
        { nome: 'Maria <b>X</b>', setor: 'Cozinha', dias: D({ 0: 'FALTA', 3: 'FALTA' }), docs: { ADVERTENCIA: 'u' } },
        { nome: 'João', setor: 'Salão', dias: D({ 0:'FÉRIAS',1:'FÉRIAS',2:'FÉRIAS',3:'FÉRIAS',4:'FÉRIAS',5:'FÉRIAS',6:'FÉRIAS' }), docs: {} },
        { nome: 'Ana', setor: 'Cozinha', dias: D({ 2: 'ATESTADO' }), docs: {} },
      ] } } },
      { loja: cal.comCaxias, all_data: { [cal.idx]: { funcs: [
        { nome: 'Bia', setor: 'Salão', dias: D({}), docs: {} },
        { nome: 'Caio', setor: 'Cozinha', dias: D({}), docs: {} },
      ] } } },
    ];
    _dashBhCfg = { [cal.chkBangu]: { periodo_inicio: '2026-01-01', salariosSetor: { Cozinha: 2200 } } };
    _dashBhMesesRows = [{ loja: cal.chkBangu, mes: cal.dias[0].slice(0, 7), registros: [{ nome: 'Maria <b>X</b>', horas: -12.5 }] }];
    _dashCancelPer = { BANGU: [{ data: cal.dias[1], valor: 120.5, motivo: 'Cliente <i>desistiu</i>', autor: 'Marcos' }] };
    _dashLojasAll = [{ loja: cal.comBangu, all_data: { avariasAll: { [cal.comBangu]: [
      { ts: cal.dias[2] + 'T10:00:00', valorTotal: 300, tipo: 'quebra', status: 'ok' } ] } } }];
    _dashCaixaSemConferencia = { BANGU: [{ data: cal.dias[0], turno: 'NOITE' }] };
    // Período do Painel = a semana do cenário.
    _dashPer = 'sem';
    const hoje = new Date();
    const alvo = new Date(cal.dias[0] + 'T12:00:00');
    _dashWoff = Math.round((alvo - new Date(_weekRange(0).dates[0] + 'T12:00:00')) / (7 * 86400000));
    Object.assign(window, extra || {});
    return { woff: _dashWoff, semana: _weekRange(_dashWoff).dates[0] };
  }, { cal, extra });

  const ctxSem = await semear();
  check('o cenário caiu na semana certa do calendário', ctxSem.semana === cal.dias[0],
    'esperado ' + cal.dias[0] + ' veio ' + ctxSem.semana);

  // ── A faixa no card ─────────────────────────────────────────────────────────
  const faixa = await page.evaluate(() => ({ bangu: _raioxFaixaCard('BANGU'), caxias: _raioxFaixaCard('CAXIAS') }));
  check('o card mostra o tamanho da equipe sempre', /👥 3/.test(faixa.bangu), faixa.bangu);
  check('mostra as férias quando tem', /🏖 1/.test(faixa.bangu));
  check('mostra as ocorrências somadas (2 faltas + 1 atestado + 1 advertência)', /⚠ 4/.test(faixa.bangu), faixa.bangu);
  check('mostra o valor das notas canceladas', /🧾/.test(faixa.bangu) && /120/.test(faixa.bangu));
  check('mostra as horas devidas do banco', /⏱ -12h30/.test(faixa.bangu), faixa.bangu);
  check('mostra as avarias', /💥/.test(faixa.bangu));
  check('e o caixa por conferir', /🔍 1/.test(faixa.bangu));
  check('loja sem nada mostra só a equipe, sem fileira de zeros',
    /👥 2/.test(faixa.caxias) && !/⚠/.test(faixa.caxias) && !/🏖/.test(faixa.caxias)
    && !/🧾/.test(faixa.caxias) && !/💥/.test(faixa.caxias), faixa.caxias);
  check('tocar na faixa não entra na loja (o corpo do card é que faz isso)',
    /event\.stopPropagation\(\)/.test(faixa.bangu) && /_raioxAbrir\('BANGU'\)/.test(faixa.bangu));
  check('a faixa não aparece enquanto o painel não carregou',
    await page.evaluate(() => { const g = _dashComissoesAll; _dashComissoesAll = null;
      const r = _raioxFaixaCard('BANGU'); _dashComissoesAll = g; return r === ''; }));

  // ── O painel ────────────────────────────────────────────────────────────────
  const painel = await page.evaluate(({ cal }) => {
    _raioxLoja = 'BANGU'; _raioxPer = 'sem';
    _raioxOff = Math.round((new Date(cal.dias[0] + 'T12:00:00') - new Date(_weekRange(0).dates[0] + 'T12:00:00')) / (7 * 86400000));
    _raioxDados = { range: _relRange('sem', _raioxOff), x: _raioxDaLoja('BANGU', cal.dias, { cancel: _dashCancelPer }) };
    return _raioxHtml();
  }, { cal });
  check('o painel tem as quatro opções de período', ['>Dia<', '>Semana<', '>Mês<', '>Trimestre<'].every(p => painel.includes(p)));
  check('traz o quadro por setor', /Cozinha <b[^>]*>2<\/b>/.test(painel) && /Salão <b[^>]*>1<\/b>/.test(painel), painel.match(/Equipe[\s\S]{0,320}/));
  check('traz as férias por setor e com nome', /Férias · 1/.test(painel) && /João/.test(painel));
  check('separa as ocorrências por tipo', /Faltas <b[^>]*>2<\/b>/.test(painel) && /Atestados <b[^>]*>1<\/b>/.test(painel));
  check('quebra as ocorrências por dia', /POR DIA/.test(painel) && /Faltas 1/.test(painel));
  check('e por pessoa', /POR PESSOA/.test(painel));
  check('explica que advertência não é status de dia',
    /documento da semana, não status de dia/.test(painel));
  check('mostra o banco de horas com horas e valor',
    /12h30/.test(painel) && /R\$ 125,00/.test(painel), painel.match(/DEVIDAS[\s\S]{0,260}/));
  check('mostra a nota cancelada com motivo e quem autorizou',
    /autorizado por Marcos/.test(painel) && /R\$ 120,50/.test(painel));
  check('mostra as avarias', /Avarias e perdas · 1/.test(painel) && /R\$ 300,00/.test(painel));
  check('avisa que o caixa por conferir só cobre 30 dias',
    /últimos 30 dias/.test(painel));
  check('nome e motivo vindos do banco saem escapados',
    !/Maria <b>X<\/b>/.test(painel) && !/<i>desistiu<\/i>/.test(painel)
    && /&lt;b&gt;X&lt;\/b&gt;/.test(painel), painel.match(/Maria[\s\S]{0,80}/));
  check('usa tokens de cor, pra funcionar no tema escuro',
    /var\(--t1\)/.test(painel) && !/color:\s*#(1A1D23|1a1d23|555)/.test(painel));

  // Loja limpa não pode parecer problema.
  const painelLimpo = await page.evaluate(({ cal }) => {
    _raioxLoja = 'CAXIAS';
    _raioxDados = { range: _relRange('sem', _raioxOff), x: _raioxDaLoja('CAXIAS', cal.dias, { cancel: {} }) };
    return _raioxHtml();
  }, { cal });
  check('loja sem ocorrência diz isso em verde, em vez de uma seção vazia',
    /Nenhuma ocorrência no período/.test(painelLimpo) && /var\(--txt-green\)/.test(painelLimpo));

  // ── Escala em branco ≠ loja sem ocorrência ──────────────────────────────────
  // Uma semana a mais no período, que nenhuma das duas lojas tem salva.
  const semC = await page.evaluate(idx => {
    const iso = d => d.y+'-'+String(d.m).padStart(2,'0')+'-'+String(d.d).padStart(2,'0');
    return COMISSOES_CAL[idx].days.map(iso);
  }, cal.idx + 1);
  const branco = await page.evaluate(({ cal, semC }) => {
    const r = {};
    r.faixa = (() => { const g = _raioxDaLoja; return null; })();
    _raioxLoja = 'CAXIAS';
    _raioxDados = { range: _relRange('sem', _raioxOff), x: _raioxDaLoja('CAXIAS', cal.dias.concat(semC), { cancel: {} }) };
    r.painel = _raioxHtml();
    r.x = _raioxDaLoja('CAXIAS', cal.dias.concat(semC), { cancel: {} });
    return r;
  }, { cal, semC });
  check('com semana sem escala, o painel NÃO diz "nenhuma ocorrência"',
    !/Nenhuma ocorrência no período/.test(branco.painel), branco.painel.match(/OCORR[\s\S]{0,300}/));
  check('ele diz que não foi lançado e quantas semanas faltam',
    /Nada lançado no período/.test(branco.painel)
    && /1 de 2 semanas do período está sem escala lançada/.test(branco.painel),
    branco.painel.match(/OCORR[\s\S]{0,420}/));
  check('e a seção sai em âmbar, não em verde',
    /var\(--txt-amber\)/.test(branco.painel));
  check('o card ganha um chip avisando, pra não parecer a loja mais limpa do Painel',
    /\? 1sem/.test(await page.evaluate(({cal,semC}) => {
      const orig = _raioxPeriodoAtual;
      window.__dias = cal.dias.concat(semC);
      // força o período do card a incluir a semana sem escala
      _raioxPeriodoAtual = () => ({ dates: window.__dias });
      for (const k in _raioxCache) delete _raioxCache[k];
      const r = _raioxFaixaCard('CAXIAS');
      _raioxPeriodoAtual = orig;
      for (const k in _raioxCache) delete _raioxCache[k];
      return r;
    }, { cal, semC })));
  check('e as outras seções dizem o que está zerado',
    /Ninguém de férias no período/.test(painelLimpo)
    && /Nenhuma nota cancelada lançada no período/.test(painelLimpo)
    && /Nenhum saldo lançado no período/.test(painelLimpo));

  // ── O recorte Raio-X do relatório ───────────────────────────────────────────
  const rel = await page.evaluate(({ cal }) => {
    window._relData = {
      range: { label: 'semana do cenário', isCurrent: false, dates: cal.dias },
      per: 'sem', perTipo: 'Semanal', dtGer: '16/10 09:12', total: 0,
      cancelPorLoja: _dashCancelPer,
      lojasDados: [{ k: 'BANGU', nome: 'Bangu', v: 100 }, { k: 'CAXIAS', nome: 'Caxias', v: 90 }],
    };
    _dashRelSel.clear();
    window._relRecorte = 'rx';
    const wpp = _relTexto(true), pdfTxt = _relTexto(false);
    let pdf = ''; const o = window.open, f = window.fecharTelaSobreposta;
    window.open = () => ({ document: { write: h => { pdf = h; }, close: () => {} } });
    window.fecharTelaSobreposta = () => {};
    try { _relPDF(); } finally { window.open = o; window.fecharTelaSobreposta = f; }
    window._relRecorte = '';
    return { wpp, pdfTxt, pdf, modal: _relModalHtml() };
  }, { cal });
  check('o modal do relatório oferece o recorte Raio-X', /🩻 Raio-X/.test(rel.modal));
  check('o relatório traz o total da rede primeiro', /Equipe:\*? ?5/.test(rel.wpp.replace(/\*/g, '')), rel.wpp.slice(0, 260));
  check('detalha a loja com problema', /Bangu/.test(rel.wpp) && /Faltas 2/.test(rel.wpp));
  check('com quem autorizou o cancelamento', /Marcos/.test(rel.wpp));
  check('e o maior saldo do banco de horas', /maior saldo/.test(rel.wpp) && /12h30/.test(rel.wpp));
  check('loja sem nada vai numa linha só no fim, não num bloco de zeros',
    /Sem ocorrência, férias, cancelamento nem avaria:.*Caxias/.test(rel.wpp)
    && !/📍 \*Caxias\*/.test(rel.wpp), rel.wpp);
  check('a versão do PDF não leva asterisco', !rel.pdfTxt.includes('*'));
  check('o PDF impresso tem a tabela com uma linha por loja',
    /Caixa p\/ conferir/.test(rel.pdf) && /Bangu/.test(rel.pdf) && /Caxias/.test(rel.pdf));
  check('e o detalhe com quem autorizou', /autorizado por Marcos/.test(rel.pdf));

  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));

  await ctx.close();
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  if (process.env.VER) console.log('\n--- relatório Raio-X ---\n' + rel.wpp);
  process.exit(falhou ? 1 : 0);
})();
