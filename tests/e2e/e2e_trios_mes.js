// "Quero que coloque a opção de relatórios mensal também, e que nessa parte de baixo que
//  tem as 12 semanas tivesse só a da semana e do mês ao ser selecionado, e se der dentro
//  desse card indicando vermelho, verde, tivesse a data, e o laranja ficou em dois tons um
//  claro e um escuro, achei o claro melhor de ver."
//
// Quatro mudanças, e a terceira é a que tem uma razão invisível: a data dos quadrados do
// histórico existia só no atributo `title`, que é TOOLTIP DE HOVER. O print veio de um
// celular — onde não existe hover. Então na prática não havia como saber de que fim de
// semana era um quadrado vermelho: a informação estava escrita num lugar que aquele
// aparelho nunca mostra. A data passa a ir numa linha de cabeçalho alinhada às colunas.
// Repetir a data dentro de cada quadrado seriam 132 datas em ~14px de largura cada; no
// cabeçalho ela aparece uma vez por coluna, e esta suíte MEDE que cabe a 390px.
//
// O histórico mensal são 6 meses, não 12: a agenda começa em 27/07, então 12 meses seriam
// oito quadrados cinzas — e cinza aqui quer dizer "sem trio na agenda", que não é verdade
// sobre um mês que simplesmente não existe no sistema ainda.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || process.env.ARQ || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

const ap = (loja, data, cache, couver, extra) => Object.assign(
  { loja, data, cache, couver_valor: couver, couver_qtd: couver ? couver / 10 : 0,
    artista: 'Trio ' + loja, horario_inicio: '20:00', presenca_confirmada: true,
    banda_nao_veio: false, banda_nao_veio_motivo: null }, extra || {});

// Relógio na quinta 29/10/2026. Mês (off 0) = outubro inteiro; fim de semana (off 0) =
// 19/10–25/10. A Pedreira tem DOIS fins de semana em outubro de propósito: é o que mostra
// o mês somando o que a semana mostra separado.
const LINHAS = [
  ap('pedreira', '2026-10-10', 600, 700), ap('pedreira', '2026-10-11', 600, 800),
  ap('pedreira', '2026-10-24', 700, 900), ap('pedreira', '2026-10-25', 600, 800),
  // Bangu: couvert só no domingo do último fim de semana — o mês fica parcial.
  ap('bangu', '2026-10-24', 800, 0), ap('bangu', '2026-10-25', 800, 1900),
  // Caxias: nenhum couvert no mês inteiro.
  ap('caxias', '2026-10-10', 700, 0), ap('caxias', '2026-10-11', 700, 0),
  // Setembro, pra o histórico mensal ter mais de uma coluna com dado.
  ap('pedreira', '2026-09-26', 500, 600), ap('pedreira', '2026-09-27', 500, 400),
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-10-29T12:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try {
      await page.waitForFunction(() => { try {
        return typeof _buildTriosPanel === 'function' && typeof _triosSetPer === 'function'
            && typeof _triosNav === 'function' && typeof _triosRotuloColuna === 'function'
            && TRIOS_HISTORICO && Array.isArray(LOJAS_LISTA); } catch (e) { return false; } },
        null, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }

  const montar = (per, off) => page.evaluate(async ({ LINHAS, per, off }) => {
    const orig = window.gnFetchJson;
    const urls = [];
    window.gnFetchJson = async (url) => { urls.push(url);
      return /gn_trios_agenda/.test(url) ? LINHAS : []; };
    _triosPer = per;
    _triosGerLoaded = false; _triosGerData = null; _triosGerOff = off;
    try { await _loadTriosGerencia(); } finally { window.gnFetchJson = orig; }
    const html = _buildTriosPanel();
    const el = document.createElement('div'); el.innerHTML = html;
    const sem = (_triosGerData && _triosGerData.porSemana) || {};
    const simples = {};
    Object.keys(sem).forEach(c => { const s = sem[c];
      simples[c] = { cache: s.cache, couver: s.couver, saldo: s.saldo, status: s.status,
                     diasSemCouver: s.diasSemCouver, dias: s.dias.length,
                     fdsemanas: (s.fdsemanas || []).map(w => w.sem) }; });
    const cards = {};
    [...el.querySelectorAll('div')].forEach(dv => {
      if (!/border-left:\s*3px solid/.test(dv.getAttribute('style') || '')) return;
      const nome = (dv.querySelector('span') || {}).textContent;
      if (nome) cards[nome.trim()] = dv.textContent.replace(/\s+/g, ' ').trim();
    });
    return { txt: el.textContent.replace(/\s+/g, ' ').trim(), html, urls, simples, cards,
             iniISO: (_triosGerData || {}).iniISO, per: (_triosGerData || {}).per,
             colunas: ((_triosGerData || {}).semanas || []).length };
  }, { LINHAS, per, off });

  // ══ 1. O SELETOR DE PERÍODO ══════════════════════════════════════════════════════
  const sem = await montar('sem', 0);
  check('a aba abre no fim de semana que acabou de passar',
    sem.per === 'sem' && sem.iniISO === '2026-10-19', JSON.stringify({ per: sem.per, ini: sem.iniISO }));
  // Pelos BOTÕES, não pelo texto corrido: os dois rótulos saem colados ("semanaMês") e
  // uma busca por palavra no texto passa ou falha por acidente de concatenação.
  const botoes = await page.evaluate((html) => {
    const el = document.createElement('div'); el.innerHTML = html;
    return [...el.querySelectorAll('button')]
      .filter(b => /_triosSetPer/.test(b.getAttribute('onclick') || ''))
      .map(b => ({ rot: b.textContent.trim(), onclick: b.getAttribute('onclick') }));
  }, sem.html);
  check('o seletor oferece os dois períodos, cada um chamando o seu',
    botoes.length === 2
      && botoes.some(b => /Fim de semana/.test(b.rot) && /'sem'/.test(b.onclick))
      && botoes.some(b => /Mês/.test(b.rot) && /'mes'/.test(b.onclick)),
    JSON.stringify(botoes));

  const troca = await page.evaluate(({ LINHAS }) => {
    const orig = window.gnFetchJson;
    window.gnFetchJson = async (url) => (/gn_trios_agenda/.test(url) ? LINHAS : []);
    try {
      _triosPer = 'sem'; _triosGerOff = -3;
      _triosSetPer('mes');
      return { per: _triosPer, off: _triosGerOff };
    } finally { window.gnFetchJson = orig; }
  }, { LINHAS });
  check('trocar de período muda o modo', troca.per === 'mes', JSON.stringify(troca));
  // -3 semanas não quer dizer -3 meses: carregar o período errado em silêncio é pior que
  // voltar pro atual.
  check('e zera a navegação, porque o offset de semana não vale pra mês',
    troca.off === 0, JSON.stringify(troca));

  const mes = await montar('mes', 0);
  check('no mês o título é o mês, não um intervalo de dias',
    /OUT\/2026/.test(mes.txt) && !/19\/10 – 25\/10/.test(mes.txt), mes.txt.slice(0, 200));
  check('e o período carregado começa no dia 1º',
    mes.iniISO === '2026-10-01', mes.iniISO);

  // ══ 2. O MÊS AGREGA OS FINS DE SEMANA ════════════════════════════════════════════
  const pedMes = mes.simples['PEDREIRA|2026-10-01'];
  const pedSem = sem.simples['PEDREIRA|2026-10-19'];
  check('o mês soma o cachê dos dois fins de semana',
    pedMes && pedMes.cache === 2500, JSON.stringify(pedMes));
  check('e o couvert',  pedMes && pedMes.couver === 3200, JSON.stringify(pedMes));
  check('e o saldo é couvert − cachê do mês inteiro',
    pedMes && pedMes.saldo === 700, JSON.stringify(pedMes));
  check('enquanto o fim de semana sozinho traz só o dele',
    pedSem && pedSem.cache === 1300 && pedSem.couver === 1700, JSON.stringify(pedSem));
  // A loja que lançou couvert num fim de semana e não no outro: no mês isso é PARCIAL,
  // não "sem couvert" — somar os dois fins de semana não pode apagar a diferença.
  const banMes = mes.simples['BANGU|2026-10-01'], caxMes = mes.simples['CAXIAS|2026-10-01'];
  check('o mês com couvert em parte dos dias fica parcial',
    banMes && banMes.status === 'parcial', JSON.stringify(banMes));
  check('e o mês sem couvert em nenhum dia fica sem couvert',
    caxMes && caxMes.status === 'semCouver', JSON.stringify(caxMes));
  check('o mês positivo continua positivo', pedMes && pedMes.status === 'positivo', JSON.stringify(pedMes));

  // ══ 3. A NAVEGAÇÃO MUDA DE TRAVA COM O PERÍODO ═══════════════════════════════════
  const nav = await page.evaluate(({ LINHAS }) => {
    const orig = window.gnFetchJson;
    window.gnFetchJson = async (url) => (/gn_trios_agenda/.test(url) ? LINHAS : []);
    try {
      _triosPer = 'mes'; _triosGerOff = 0;
      _triosNav(1); const mesFuturo = _triosGerOff;
      _triosNav(-1); const mesAnterior = _triosGerOff;
      _triosPer = 'sem'; _triosGerOff = 0;
      _triosNav(1); const semVigente = _triosGerOff;
      _triosNav(1); const semFuturo = _triosGerOff;
      return { mesFuturo, mesAnterior, semVigente, semFuturo };
    } finally { window.gnFetchJson = orig; }
  }, { LINHAS });
  check('no mês não dá pra passar do mês corrente', nav.mesFuturo === 0, JSON.stringify(nav));
  check('mas dá pra voltar', nav.mesAnterior === -1, JSON.stringify(nav));
  check('no fim de semana a vigente continua alcançável', nav.semVigente === 1, JSON.stringify(nav));
  check('e ela segue sendo o limite', nav.semFuturo === 1, JSON.stringify(nav));

  // ══ 4. O HISTÓRICO SEGUE O PERÍODO SELECIONADO ═══════════════════════════════════
  check('no fim de semana o histórico tem 12 colunas', sem.colunas === 12, String(sem.colunas));
  check('no mês tem 6 — doze meses seriam oito cinzas, que a agenda não tem',
    mes.colunas === 6, String(mes.colunas));
  check('e o título do histórico diz qual unidade está na tela',
    /Últimas 12 semanas/.test(sem.txt) && /Últimos 6 meses/.test(mes.txt),
    (sem.txt.match(/Últim[^.]{0,30}/) || []) + ' || ' + (mes.txt.match(/Últim[^.]{0,30}/) || []));
  // As DUAS pontas do intervalo. O dublê do fetch devolve tudo ignorando a URL, então sem
  // cobrar a URL um mês que terminasse no dia 07 passava aqui e em produção perdia três
  // semanas de agenda — foi exatamente a mutação que escapou.
  const urlMes = mes.urls.find(u => /gn_trios_agenda/.test(u)) || '';
  check('a consulta do mês começa 6 meses atrás',
    /data=gte\.2026-05-01/.test(urlMes), urlMes.slice(0, 220));
  check('e vai até o ÚLTIMO dia do mês navegado, não até o fim da primeira semana',
    /data=lte\.2026-10-31/.test(urlMes), urlMes.slice(0, 220));
  const urlSem = sem.urls.find(u => /gn_trios_agenda/.test(u)) || '';
  check('e a do fim de semana vai de 12 semanas atrás até o domingo dele',
    /data=gte\.2026-08-03/.test(urlSem) && /data=lte\.2026-10-25/.test(urlSem), urlSem.slice(0, 220));

  // ══ 5. A DATA APARECE NA TELA, NÃO SÓ NO HOVER ═══════════════════════════════════
  const rot = await page.evaluate(() => ({
    semana: _triosRotuloColuna('2026-10-19', 'sem'),   // segunda 19 → sábado 24
    mes:    _triosRotuloColuna('2026-10-01', 'mes'),
  }));
  // O quadrado é o FIM DE SEMANA. Rotular com a segunda (19) mandaria procurar uma data
  // que não aparece em lugar nenhum da tela — os cartões mostram 24/10 e 25/10.
  check('o rótulo da coluna é o sábado do fim de semana, não a segunda',
    rot.semana.baixo === '24', JSON.stringify(rot.semana));
  check('e traz o mês junto', rot.semana.topo === 'out', JSON.stringify(rot.semana));
  check('no mês o rótulo é o mês abreviado com o ano',
    rot.mes.baixo === 'out' && rot.mes.topo === '26', JSON.stringify(rot.mes));

  // O rótulo de cima só aparece quando MUDA, e sempre na primeira coluna. Repetido em
  // todas vira ruído (seis "26" iguais no mês não informam nada); ausente na primeira, a
  // fileira começa sem dizer de onde parte.
  const topos = (html) => page.evaluate((h) => {
    const el = document.createElement('div'); el.innerHTML = h;
    const cab = [...el.querySelectorAll('div')].find(d => /align-items:flex-end/.test(d.getAttribute('style') || ''));
    return cab ? [...cab.children[1].children].map(c => c.children[0].textContent.replace(/\u00a0/g, '').trim()) : [];
  }, html);
  const topoSem = await topos(sem.html), topoMes = await topos(mes.html);
  check('a primeira coluna sempre diz de que mês parte',
    topoSem[0] === 'ago', JSON.stringify(topoSem));
  check('e o mês só reaparece quando vira',
    topoSem.filter(Boolean).join(',') === 'ago,set,out', JSON.stringify(topoSem));
  check('no mês o ano aparece uma vez só, não nas seis colunas',
    topoMes.filter(Boolean).length === 1 && topoMes[0] === '26', JSON.stringify(topoMes));

  // A medição que justifica o desenho: a 390px, o rótulo cabe na coluna?
  const medida = await page.evaluate((html) => {
    const box = document.createElement('div');
    // 390 de viewport menos o respiro lateral do painel.
    box.style.cssText = 'width:358px;position:absolute;left:-9999px;top:0';
    box.innerHTML = html;
    document.body.appendChild(box);
    const linhaCab = [...box.querySelectorAll('div')].find(d =>
      /align-items:flex-end/.test(d.getAttribute('style') || ''));
    if (!linhaCab) { document.body.removeChild(box); return { achou: false }; }
    const cels = [...linhaCab.children[1].children];
    const r = { achou: true, n: cels.length,
      larguras: cels.map(c => Math.round(c.getBoundingClientRect().width)),
      estourou: cels.filter(c => [...c.children].some(l => l.scrollWidth > l.clientWidth + 1)).length };
    document.body.removeChild(box);
    return r;
  }, sem.html);
  check('a linha de cabeçalho existe, com uma coluna por quadrado',
    medida.achou && medida.n === 12, JSON.stringify(medida));
  check(`e o rótulo cabe na coluna a 390px (${medida.larguras ? medida.larguras[0] : '?'}px por coluna)`,
    medida.estourou === 0, JSON.stringify(medida));
  // Sem isto a verificação de cima passaria com colunas de 2px, onde nada é legível.
  check('com coluna larga o bastante pra ler dois dígitos',
    medida.larguras && medida.larguras.every(w => w >= 11), JSON.stringify(medida.larguras));

  // ══ 6. UM AMARELO SÓ, O MAIS VISÍVEL ═════════════════════════════════════════════
  const ambar = await page.evaluate(() => ({
    semCouver: _TRIOS_STATUS.semCouver.fundo, parcial: _TRIOS_STATUS.parcial.fundo,
    naoVeio: _TRIOS_STATUS.naoVeio.fundo,
    bordas: [_TRIOS_STATUS.semCouver.borda, _TRIOS_STATUS.parcial.borda, _TRIOS_STATUS.naoVeio.borda],
  }));
  check('os três estados amarelos usam o MESMO fundo',
    ambar.semCouver === ambar.parcial && ambar.parcial === ambar.naoVeio, JSON.stringify(ambar));
  check('e a mesma borda', new Set(ambar.bordas).size === 1, JSON.stringify(ambar.bordas));
  // O tom fraco (.08) sumia no tema escuro — era o "escuro" que ficou pior de ver.
  check('e é o tom mais visível, não o fraco que sumia no escuro',
    /\.12\)$/.test(ambar.semCouver) && !/\.08\)/.test(ambar.semCouver), ambar.semCouver);

  // ══ 7. O CARTÃO NO MÊS LISTA FINS DE SEMANA, NÃO DIAS CORRIDOS ═══════════════════
  check('no mês o cartão da loja agrupa por fim de semana',
    pedMes && pedMes.fdsemanas.length === 2, JSON.stringify(pedMes && pedMes.fdsemanas));
  check('e o rótulo da linha é o intervalo sábado–domingo',
    /10\/10–11\/10/.test(mes.cards['Pedreira'] || ''), (mes.cards['Pedreira'] || '').slice(0, 220));
  check('no fim de semana o cartão continua dia a dia, com o artista',
    /Trio pedreira/i.test(sem.cards['Pedreira'] || ''), (sem.cards['Pedreira'] || '').slice(0, 220));

  // ══ 8. O RELATÓRIO SEGUE O PERÍODO ═══════════════════════════════════════════════
  // _triosNav dispara a carga de verdade (sem o dublê) e deixa o estado na semana vigente
  // com a agenda vazia. Sem remontar, as duas verificações abaixo mediam uma tela em branco.
  await montar('mes', 0);
  const relMes = await page.evaluate(() => (_triosRelatorioTexto(false) || {}).msg || '');
  check('o relatório do mês se identifica como do mês',
    /Mês out\/2026/.test(relMes), relMes.slice(0, 160));
  // 2.500 da Pedreira + 1.600 do Bangu + 1.400 do Caxias. Contra o valor EXATO: com um
  // "maior que zero" a verificação passaria com o total de um fim de semana só.
  check('e traz os totais do mês, não os de um fim de semana',
    /Cachê a pagar: R\$ ?5\.500/.test(relMes.replace(/\s/g, ' ')), relMes.slice(0, 220));
  await montar('sem', 0);
  const relSem = await page.evaluate(() => (_triosRelatorioTexto(false) || {}).msg || '');
  check('e o do fim de semana continua dizendo o fim de semana',
    /Fim de semana 19\/10 a 25\/10/.test(relSem), relSem.slice(0, 160));

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase|NetworkError|net::/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
