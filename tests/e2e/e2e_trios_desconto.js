// "Pedreira disse que no dia 10/10 realmente não teve banda e marcou de fato faltou,
//  precisamos colocar esse desconto pra não gerar erro quando tiver."
//
// Banda que não veio não é paga, então o cachê dela não pode entrar na conta. MEDIDO, é
// exatamente o erro que o dono viu: no fim de semana 10–11/10 a Pedreira aparecia
// NEGATIVA em R$ 459 (cachê R$ 1.600 contra R$ 1.141 de couvert) sem ter perdido um
// centavo — R$ 800 daquele cachê eram do Trio Remelexo, que ficou preso na Dutra e não
// chegou. Com o desconto o mesmo fim de semana fecha em +R$ 341.
//
// A ARMADILHA, e é o que esta suíte protege: descontar pela marca `banda_nao_veio` sozinha
// apaga cachê que foi devido de verdade. Nas três marcas que existem na base inteira, a
// marca quer dizer DUAS coisas diferentes:
//
//   · 10/10 Pedreira — ninguém tocou. Couvert 0. Motivo: "ESTAO NO ENGARRAFAMENTO NA
//     DUTRA... INFELIZMENTE NAO CONSEGUIRAM CHEGAR."                    → desconta.
//   · 26/09 e 27/09 Guarulhos — TROCA de banda. Motivos: "Trocou a banda, venho o trio
//     zambele" e "SP Baião": os dois trios se trocaram de dia, tocaram, e a casa
//     arrecadou R$ 336 (48 pessoas) e R$ 903 (129 pessoas).              → NÃO desconta.
//
// Então o que decide não é a marca, é se a noite ARRECADOU: couvert no caixa quer dizer
// que alguém tocou, e quem tocou recebe. Descontar por marca apagaria R$ 1.600 de cachê
// devido em duas noites com 177 pessoas pagando couvert.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || process.env.ARQ || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

// couver_lancado_em é o ATO de lançar; couver_valor tem DEFAULT 0, então valor > 0 vem
// com a marca e zero vem sem ela — igual ao banco.
const ap = (loja, data, cache, couver, extra) => Object.assign(
  { loja, data, cache, couver_valor: couver, couver_qtd: couver ? Math.round(couver / 7) : 0,
    couver_lancado_em: couver > 0 ? data + 'T23:30:00.000Z' : null,
    artista: 'Trio ' + loja, horario_inicio: '13:00', presenca_confirmada: true,
    banda_nao_veio: false, banda_nao_veio_motivo: null }, extra || {});
const naoVeio = motivo => ({ banda_nao_veio: true, presenca_confirmada: false,
                             banda_nao_veio_motivo: motivo });

// Relógio na QUINTA 15/10/2026 → a segunda da semana é 12/10, então off 0 é o fim de
// semana 10–11/10: o da Pedreira, já inteiro no passado.
const LINHAS = [
  // ── PEDREIRA: o caso do dono, com os números reais do banco ────────────────────
  ap('pedreira', '2026-10-10', 800, 0,
     { ...naoVeio('ESTAO NO ENGARRAFAMENTO NA DUTRA DESDE AS 11:40, NAO CONSEGUIRAM CHEGAR.'),
       // marcar "não veio" grava couver_lancado_em com valor 0 — é o que o app faz,
       // e é por isso que a marca de lançamento sozinha não serve de prova de couvert.
       couver_lancado_em: '2026-10-10T17:12:44.825Z' }),
  ap('pedreira', '2026-10-11', 800, 1141),
  // ── GUARULHOS: a TROCA de banda. Marca igual, dinheiro na mão. ──────────────────
  ap('guarulhos', '2026-10-10', 800, 336, naoVeio('Trocou a banda, venho o trio zambele')),
  ap('guarulhos', '2026-10-11', 800, 903, naoVeio('SP Baião')),
  // ── BANGU: fim de semana comum, sem marca nenhuma. O controle. ─────────────────
  ap('bangu', '2026-10-10', 700, 1000),
  ap('bangu', '2026-10-11', 700, 1500),
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-10-15T12:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try {
      await CAMINHOS.esperarApp(page, ['_triosGerOff'],
        ['_buildTriosPanel', '_loadTriosGerencia', '_triosRelatorioTexto'], 20000);
      break;
    } catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }

  const r = await page.evaluate(async ({ LINHAS }) => {
    const orig = window.gnFetchJson;
    window.gnFetchJson = async (url) => (/gn_trios_agenda/.test(url) ? LINHAS : []);
    _triosPer = 'sem'; _triosGerLoaded = false; _triosGerData = null; _triosGerOff = 0;
    try { await _loadTriosGerencia(); } finally { window.gnFetchJson = orig; }
    const el = document.createElement('div');
    el.innerHTML = _buildTriosPanel();
    const ini = (_triosGerData || {}).iniISO;
    const sem = (_triosGerData || {}).porSemana || {};
    const pega = pref => { const c = Object.keys(sem).find(x => x.startsWith(pref) && x.endsWith('|' + ini));
      if (!c) return null; const s = sem[c];
      return { cache: s.cache, cacheDevido: s.cacheDevido, cacheDescontado: s.cacheDescontado,
               naoVeioCache: s.naoVeioCache, couver: s.couver, saldo: s.saldo, status: s.status,
               diasSemCouver: s.diasSemCouver, diasSemShow: s.diasSemShow,
               dias: s.dias.map(d => ({ dia: d.dia, cache: d.cache, cacheDevido: d.cacheDevido,
                                        cacheDescontado: d.cacheDescontado, couver: d.couver,
                                        lancado: d.lancado })) }; };
    // O cartão lido por PARTES, não como um texto corrido: os valores das células ficam
    // colados no textContent ("CachêR$ 800,00➖R$ 800,00 descontados"), e aí cobrar o
    // número do cachê casava com o do desconto — mostrar o contratado no lugar do devido
    // passava batido. Com a célula lida pelo rótulo, o valor cobrado é o daquele campo.
    const cards = {};
    [...el.querySelectorAll('div')].forEach(dv => {
      if (!/border-left:\s*3px solid/.test(dv.getAttribute('style') || '')) return;
      const nome = (dv.querySelector('span') || {}).textContent;
      if (!nome) return;
      const celulas = {};
      [...dv.querySelectorAll('div')].forEach(c => {
        const f = c.firstElementChild, v = f && f.nextElementSibling;
        if (!f || !v || f.tagName !== 'DIV' || v.tagName !== 'DIV') return;
        const rot = f.textContent.trim();
        if (/^(Cachê|Couvert|Saldo)$/.test(rot)) celulas[rot] = v.textContent.trim();
      });
      // Uma linha por dia do detalhe: [data, artistas, cachê do dia, couvert do dia].
      const linhas = [...dv.querySelectorAll('div')].filter(c => {
        const sp = c.children;
        return sp.length === 4 && /^\d{2}\/\d{2}$/.test((sp[0].textContent || '').trim());
      }).map(c => [...c.children].map(x => x.textContent.replace(/\s+/g, ' ').trim()));
      cards[nome.trim()] = { txt: dv.textContent.replace(/\s+/g, ' ').trim(), celulas, linhas };
    });
    return { ini, txt: el.textContent.replace(/\s+/g, ' ').trim(), cards,
             ped: pega('PEDREIRA'), gua: pega('GUARULHOS'), ban: pega('BANGU'),
             rel: (_triosRelatorioTexto(false) || {}).msg || '' };
  }, { LINHAS });
  const semNbsp = s => String(s).replace(/ /g, ' ');

  check('o painel está no fim de semana 10–11/10', r.ini === '2026-10-05', r.ini);

  // ══ 1. O CASO DO DONO: PEDREIRA, 10–11/10 ═══════════════════════════════════════
  const p = r.ped || {};
  check('o cachê contratado da semana continua gravado como era (R$ 1.600)',
    p.cache === 1600, JSON.stringify(p));
  check('e a noite sem banda está registrada como tal (R$ 800)',
    p.naoVeioCache === 800, JSON.stringify(p));
  check('o cachê DESCONTADO é o da banda que não veio',
    p.cacheDescontado === 800, JSON.stringify(p));
  check('sobrando R$ 800 a pagar, não R$ 1.600',
    p.cacheDevido === 800, JSON.stringify(p));
  // O número exato do erro que o dono viu, dos dois lados.
  check('o saldo deixa de ser −459 e passa a ser +341',
    p.saldo === 341 && p.couver === 1141, JSON.stringify(p));
  check('e a loja deixa de aparecer como negativa',
    p.status === 'positivo', JSON.stringify(p));
  check('o dia sem banda não deve mais nada',
    (p.dias || []).some(d => d.dia === '2026-10-10' && d.cacheDevido === 0 && d.cache === 800),
    JSON.stringify(p.dias));
  check('e o dia em que a banda veio continua devendo o cachê inteiro',
    (p.dias || []).some(d => d.dia === '2026-10-11' && d.cacheDevido === 800 && d.cacheDescontado === 0),
    JSON.stringify(p.dias));

  // ══ 2. A TROCA DE BANDA NÃO PODE SER DESCONTADA ═════════════════════════════════
  // Mesma marca, outra história: alguém tocou e a casa arrecadou. Descontar aqui seria
  // apagar R$ 1.600 de cachê devido.
  const g = r.gua || {};
  check('a noite marcada como "não veio" que ARRECADOU não é descontada',
    g.cacheDescontado === 0, JSON.stringify(g));
  check('o cachê dela continua devido por inteiro (R$ 1.600)',
    g.cacheDevido === 1600 && g.cache === 1600, JSON.stringify(g));
  check('mesmo com a marca de "banda não veio" nos dois dias',
    g.naoVeioCache === 1600, JSON.stringify(g));
  check('o saldo dela é o couvert menos o cachê cheio (1.239 − 1.600)',
    g.saldo === -361 && g.couver === 1239, JSON.stringify(g));
  // E as duas leituras que o painel fazia errado nesses dias.
  check('a noite que arrecadou NÃO é tratada como "não houve apresentação"',
    (g.diasSemShow || []).length === 0, JSON.stringify(g.diasSemShow));
  check('nem como "couvert não lançado" — o dinheiro está no registro',
    (g.diasSemCouver || []).length === 0 && (g.dias || []).every(d => d.lancado),
    JSON.stringify(g.dias));

  // ══ 3. QUEM NÃO TEM MARCA NENHUMA NÃO MUDA ══════════════════════════════════════
  const b = r.ban || {};
  check('a loja sem nenhuma marca segue com o cachê cheio e sem desconto',
    b.cache === 1400 && b.cacheDevido === 1400 && b.cacheDescontado === 0, JSON.stringify(b));
  check('e o saldo dela é o de sempre (2.500 − 1.400)',
    b.saldo === 1100, JSON.stringify(b));

  // ══ 4. O NÚMERO DESCONTADO APARECE NA TELA ══════════════════════════════════════
  // Desconto silencioso é pior que desconto nenhum: quem confere o pagamento do trio
  // precisa ver de onde saiu a diferença, sem refazer a subtração de cabeça.
  // Contratado: 1.600 (Pedreira) + 1.600 (Guarulhos) + 1.400 (Bangu) = R$ 4.600.
  // Devido: 4.600 − 800 = R$ 3.800. O contratado não pode aparecer no lugar do devido.
  check('o resumo da rede soma o cachê já descontado (R$ 3.800, não R$ 4.600)',
    /R\$ ?3\.800,00/.test(semNbsp(r.txt)) && !/R\$ ?4\.600,00/.test(semNbsp(r.txt)),
    semNbsp(r.txt).slice(0, 400));
  check('e diz quanto foi descontado, com o motivo',
    /R\$ ?800,00 descontados/.test(semNbsp(r.txt)) && /banda que não veio não é paga/.test(r.txt),
    semNbsp(r.txt).slice(0, 500));
  const ped = r.cards['Pedreira'] || { celulas: {}, linhas: [], txt: '' };
  const cardPed = semNbsp(ped.txt);
  check('o cartão da Pedreira mostra o desconto',
    /R\$ ?800,00 descontados/.test(cardPed), cardPed.slice(0, 300));
  // O NÚMERO do campo Cachê é o DEVIDO. Com o contratado ali, quem paga o trio leria
  // R$ 1.600 e teria que fazer a subtração de cabeça pra chegar no que realmente sai.
  check('e o campo Cachê do cartão traz o devido, não o contratado',
    semNbsp(ped.celulas['Cachê']) === 'R$ 800,00', JSON.stringify(ped.celulas));
  check('com o couvert e o saldo do mesmo fim de semana ao lado',
    semNbsp(ped.celulas['Couvert']) === 'R$ 1.141,00' && semNbsp(ped.celulas['Saldo']) === 'R$ 341,00',
    JSON.stringify(ped.celulas));
  check('e marca o dia em que o cachê foi descontado',
    /não veio — cachê descontado/.test(cardPed), cardPed.slice(0, 400));
  // A linha do dia 10/10 não pode dizer "cachê descontado" e mostrar o cachê cheio ao
  // lado — seria a mesma linha se contradizendo.
  const l1010 = (ped.linhas || []).find(l => l[0] === '10/10') || [];
  check('e a linha desse dia mostra R$ 0,00 de cachê, não os R$ 800 contratados',
    semNbsp(l1010[2]) === 'R$ 0,00', JSON.stringify(ped.linhas));
  // E a mesma linha não pode cobrar couvert de uma noite sem banda: "sem couvert" em
  // amarelo é pendência, e aí a loja aparece devendo um lançamento que não existe.
  check('e não cobra couvert de uma noite em que ninguém tocou',
    semNbsp(l1010[3]) === 'sem show', JSON.stringify(ped.linhas));
  const l1110 = (ped.linhas || []).find(l => l[0] === '11/10') || [];
  check('enquanto o dia em que a banda veio segue com o cachê cheio',
    semNbsp(l1110[2]) === 'R$ 800,00', JSON.stringify(ped.linhas));
  check('e com o couvert que ele arrecadou',
    semNbsp(l1110[3]) === 'R$ 1.141,00', JSON.stringify(ped.linhas));
  const gua = r.cards['Guarulhos'] || { celulas: {}, linhas: [], txt: '' };
  const cardGua = semNbsp(gua.txt);
  check('o cartão de quem trocou de banda diz que o cachê foi MANTIDO',
    /cachê mantido/.test(cardGua) && !/descontados/.test(cardGua), cardGua.slice(0, 400));
  check('e o campo Cachê dele continua o contratado inteiro',
    semNbsp(gua.celulas['Cachê']) === 'R$ 1.600,00', JSON.stringify(gua.celulas));

  // ══ 5. O RELATÓRIO FALA O MESMO NÚMERO DA TELA ══════════════════════════════════
  // Tela e PDF que discordam sobre dinheiro é pior do que os dois errados juntos.
  const rel = semNbsp(r.rel);
  check('o relatório traz o cachê já descontado',
    /Cachê a pagar: R\$ ?3\.800,00/.test(rel), rel.slice(0, 400));
  check('e diz quanto saiu e por quê',
    /R\$ ?800,00 descontados — banda que não veio não é paga/.test(rel), rel.slice(0, 400));
  check('a Pedreira sai com o cachê devido e o desconto ao lado',
    /Cachê: R\$ ?800,00 \(R\$ ?800,00 descontados\)/.test(rel), rel.slice(0, 900));
  check('e com o saldo positivo, não o negativo de antes',
    /Saldo: R\$ ?341,00/.test(rel) && !/Saldo: -R\$ ?459,00/.test(rel), rel.slice(0, 900));
  check('a troca de banda é dita no relatório, em vez de virar desconto',
    /outro trio tocou, o cachê segue devido/.test(rel), rel.slice(0, 1200));

  // ══ 6. NO MÊS, A NOITE SEM BANDA NÃO PODE APAGAR O COUVERT DO FIM DE SEMANA ═════
  // No modo Mês o detalhe é por FIM DE SEMANA, e a linha inteira dizia "sem couvert"
  // porque UM dos dias não tinha lançamento — justamente o sábado em que o trio não
  // chegou. Resultado: os R$ 1.141 que a Pedreira arrecadou no domingo sumiam da tela,
  // e o fim de semana aparecia como pendência de lançamento que não existe.
  const m = await page.evaluate(async ({ LINHAS }) => {
    const orig = window.gnFetchJson;
    window.gnFetchJson = async (url) => (/gn_trios_agenda/.test(url) ? LINHAS : []);
    _triosPer = 'mes'; _triosGerLoaded = false; _triosGerData = null; _triosGerOff = 0;
    try { await _loadTriosGerencia(); } finally { window.gnFetchJson = orig; }
    const el = document.createElement('div');
    el.innerHTML = _buildTriosPanel();
    const cards = {};
    [...el.querySelectorAll('div')].forEach(dv => {
      if (!/border-left:\s*3px solid/.test(dv.getAttribute('style') || '')) return;
      const nome = (dv.querySelector('span') || {}).textContent;
      if (!nome) return;
      const linhas = [...dv.querySelectorAll('div')].filter(c => {
        const sp = c.children;
        return sp.length === 4 && /^\d{2}\/\d{2}–\d{2}\/\d{2}$/.test((sp[0].textContent || '').trim());
      }).map(c => [...c.children].map(x => x.textContent.replace(/\s+/g, ' ').trim()));
      cards[nome.trim()] = { txt: dv.textContent.replace(/\s+/g, ' ').trim(), linhas };
    });
    return { cards, txt: el.textContent.replace(/\s+/g, ' ').trim() };
  }, { LINHAS });
  const mPed = m.cards['Pedreira'] || { linhas: [], txt: '' };
  const fds = (mPed.linhas || []).find(l => /10\/10/.test(l[0])) || [];
  check('no mês, o fim de semana 10–11/10 aparece no detalhe da Pedreira',
    fds.length === 4, JSON.stringify(mPed.linhas));
  check('e mostra o couvert que o domingo arrecadou, não "sem couvert"',
    semNbsp(fds[3]) === 'R$ 1.141,00', JSON.stringify(mPed.linhas));
  check('com o cachê já descontado na mesma linha',
    semNbsp(fds[2]) === 'R$ 800,00', JSON.stringify(mPed.linhas));
  // E a Guarulhos, cujos dois dias arrecadaram, também não pode virar pendência.
  const mGua = m.cards['Guarulhos'] || { linhas: [], txt: '' };
  const fdsG = (mGua.linhas || []).find(l => /10\/10/.test(l[0])) || [];
  check('o fim de semana da troca de banda também mostra o que arrecadou',
    semNbsp(fdsG[3]) === 'R$ 1.239,00' && semNbsp(fdsG[2]) === 'R$ 1.600,00',
    JSON.stringify(mGua.linhas));

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase|NetworkError|net::/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
