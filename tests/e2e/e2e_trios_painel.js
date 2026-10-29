// "Trazer para o painel de gestão, assim como já acontece com chope e carnes, as
//  informações dos trios das lojas por fim de semana. Preciso saber o saldo, valor a pagar
//  do cachê e valor arrecadado do couver, e apontando as semana que ficaram negativos ou
//  sem informações de couver."
//
// Duas regras vêm da FORMA do dado e nenhuma delas se vê olhando a tela:
//
//  1. O COUVERT É LANÇADO UMA VEZ POR DIA, não por apresentação. O Check-list grava no
//     primeiro registro do dia e ZERA os demais de propósito, pra soma nenhuma contar o
//     mesmo couvert duas vezes (_salvarCouvertBandaHoje). São 28 dias com mais de uma
//     apresentação na base — medindo por apresentação, cada um deles virava "couvert
//     faltando" numa loja que lançou direito. Por isso a unidade é o DIA, e é a primeira
//     coisa que esta suíte cobra.
//
//  2. FIM DE SEMANA QUE AINDA NÃO ACONTECEU não está sem couvert. A agenda vai até 29/11
//     com o cachê já contratado: dos 193 pares loja-semana da base, 50 são futuros e TODOS
//     sem couvert. Marcá-los seriam 50 alarmes falsos.
//
// MEDIDO nos 143 pares cujo fim de semana já passou: 12 sem couvert em nenhum dia, 30 com
// couvert em parte dos dias, 50 negativos com couvert completo, 51 positivos. Na base
// inteira, cachê R$ 286.600 contra R$ 183.596 de couvert. Negativo e sem-couvert são DOIS
// avisos separados: juntos no mesmo vermelho, esconderiam a diferença entre a loja que
// gastou mais do que arrecadou e a loja que só não lançou o que arrecadou.
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

// Relógio na QUINTA 29/10/2026 → off 0 é a semana 19/10–25/10, já inteira no passado;
// off 1 é a vigente 26/10–01/11, cujo fim de semana (31/10 e 01/11) ainda não chegou.
const LINHAS = [
  // Pedreira: DOIS trios no sábado. O couvert do dia está no primeiro e o segundo tem 0 de
  // propósito — é o caso que a regra do dia protege.
  ap('pedreira', '2026-10-24', 700, 900),
  ap('pedreira', '2026-10-24', 500, 0),
  ap('pedreira', '2026-10-25', 600, 800),
  // Bangu: lançou só no domingo — falta o sábado.
  ap('bangu', '2026-10-24', 800, 0),
  ap('bangu', '2026-10-25', 800, 1900),
  // Caxias: não lançou couvert em nenhum dia.
  ap('caxias', '2026-10-24', 700, 0),
  ap('caxias', '2026-10-25', 700, 0),
  // Boulevard: lançou tudo e fechou positiva.
  ap('boulevard', '2026-10-24', 600, 1500),
  ap('boulevard', '2026-10-25', 600, 1400),
  // Norte Shopping: a banda não veio, e o cachê continua gravado na linha.
  ap('norte_shopping', '2026-10-24', 900, 0,
     { banda_nao_veio: true, presenca_confirmada: false, banda_nao_veio_motivo: 'carro quebrou' }),
  // Semana VIGENTE: o fim de semana ainda vem.
  ap('pedreira', '2026-10-31', 700, 0),
  ap('pedreira', '2026-11-01', 600, 0),
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
      await page.waitForFunction(() => {
        try { return typeof _buildTriosPanel === 'function' && typeof _loadTriosGerencia === 'function'
               && typeof _triosNav === 'function' && typeof _triosSegundaDe === 'function'
               && Array.isArray(LOJAS_LISTA); }
        catch (e) { return false; }
      }, null, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }

  const montar = (off) => page.evaluate(async ({ LINHAS, off }) => {
    const orig = window.gnFetchJson;
    const urls = [];
    window.gnFetchJson = async (url) => { urls.push(url);
      return /gn_trios_agenda/.test(url) ? LINHAS : []; };
    _triosPer = 'sem';
    _triosGerLoaded = false; _triosGerData = null; _triosGerOff = off;
    try { await _loadTriosGerencia(); } finally { window.gnFetchJson = orig; }
    const html = _buildTriosPanel();
    const el = document.createElement('div'); el.innerHTML = html;
    const sem = (_triosGerData && _triosGerData.porSemana) || {};
    const chave = k => k + '|' + ((_triosGerData || {}).iniISO || '');
    const simples = {};
    Object.keys(sem).forEach(c => { const s = sem[c];
      simples[c] = { cache: s.cache, couver: s.couver, saldo: s.saldo, status: s.status,
                     diasSemCouver: s.diasSemCouver, dias: s.dias.length, naoVeioCache: s.naoVeioCache }; });
    // Cada aviso e cada cartão com o SEU próprio texto: recortar por posição no texto
    // corrido do painel passava do bloco de negativos pro de couvert faltando, e a
    // verificação "não cita a outra loja" passava sozinha.
    const avisos = {};
    [...el.querySelectorAll('div')].forEach(dv => {
      const t1 = dv.firstElementChild;
      if (!t1 || t1.tagName !== 'DIV') return;
      const titulo = t1.textContent.replace(/\s+/g, ' ').trim();
      if (!/^[⚠✅]/.test(titulo)) return;
      avisos[titulo] = dv.textContent.replace(/\s+/g, ' ').trim();
    });
    const cards = {};
    [...el.querySelectorAll('div')].forEach(dv => {
      if (!/border-left:\s*3px solid/.test(dv.getAttribute('style') || '')) return;
      const nome = (dv.querySelector('span') || {}).textContent;
      if (nome) cards[nome.trim()] = dv.textContent.replace(/\s+/g, ' ').trim();
    });
    return { txt: el.textContent.replace(/\s+/g, ' ').trim(), html, urls, simples, avisos, cards,
             iniISO: (_triosGerData || {}).iniISO,
             ped: simples[chave('PEDREIRA')] || null };
  }, { LINHAS, off });

  // ══ 1. A UNIDADE DO COUVERT É O DIA ══════════════════════════════════════════════
  const p = await montar(0);
  check('a semana navegada por padrão é o fim de semana que acabou de passar',
    p.iniISO === '2026-10-19', p.iniISO);
  check('duas apresentações no mesmo dia contam UM couvert, não "sem couvert"',
    p.ped && p.ped.couver === 1700, JSON.stringify(p.ped));
  check('o cachê soma as duas apresentações do dia',
    p.ped && p.ped.cache === 1800, JSON.stringify(p.ped));
  check('a loja com couvert lançado em todos os dias não entra em diasSemCouver',
    p.ped && p.ped.diasSemCouver.length === 0, JSON.stringify(p.ped));
  check('saldo é couvert − cachê',
    p.ped && p.ped.saldo === -100, JSON.stringify(p.ped));
  check('e a loja é marcada como negativo, não como sem couvert',
    p.ped && p.ped.status === 'negativo', JSON.stringify(p.ped));
  check('o dia com dois trios aparece como um dia só',
    p.ped && p.ped.dias === 2, JSON.stringify(p.ped));

  // ══ 2. OS DOIS AVISOS, SEPARADOS ═════════════════════════════════════════════════
  const aviso = (d, re) => { const k = Object.keys(d.avisos).find(x => re.test(x));
    return k ? d.avisos[k] : ''; };
  const avNeg = aviso(p, /saldo negativo/);
  const avFal = aviso(p, /sem o couvert lançado/);
  const avShow = aviso(p, /banda não veio/);
  check('existe um aviso de saldo negativo', !!avNeg, p.txt.slice(0, 300));
  check('existe um aviso, separado, de couvert não lançado', !!avFal, p.txt.slice(0, 300));
  check('o aviso de negativo cita a loja negativa', /Pedreira/.test(avNeg), avNeg);
  check('e NÃO cita a loja que só não lançou couvert', !/Caxias/.test(avNeg), avNeg);
  check('o aviso de couvert faltando cita as duas lojas que não lançaram',
    /Caxias/.test(avFal) && /Bangu/.test(avFal), avFal);
  check('e só elas — a contagem do aviso bate com o que ele lista',
    /^⚠ 2 lojas sem o couvert lançado/.test(avFal), avFal);
  check('e NÃO cita a loja negativa que lançou tudo', !/Pedreira/.test(avFal), avFal);
  check('a loja positiva não aparece em nenhum dos dois avisos',
    !/Boulevard/.test(avNeg) && !/Boulevard/.test(avFal), avNeg + ' || ' + avFal);
  check('o aviso de couvert faltando nomeia o DIA que faltou',
    /24\/10/.test(avFal), avFal);

  // ══ 3. SEM COUVERT NÃO HÁ SALDO ══════════════════════════════════════════════════
  // Mostrar −1.400 pra quem não lançou couvert é inventar um prejuízo que o dado não diz.
  const cax = p.simples['CAXIAS|2026-10-19'], bou = p.simples['BOULEVARD|2026-10-19'],
        ban = p.simples['BANGU|2026-10-19'];
  check('a loja sem couvert em nenhum dia fica com status semCouver',
    cax && cax.status === 'semCouver', JSON.stringify(cax));
  check('a loja com couvert em parte dos dias fica como parcial',
    ban && ban.status === 'parcial', JSON.stringify(ban));
  check('a loja que lançou tudo e sobrou fica positivo',
    bou && bou.status === 'positivo' && bou.saldo === 1700, JSON.stringify(bou));
  // Pelo CARTÃO da loja, não pelo painel inteiro: procurando "Caxias" no HTML corrido, o
  // primeiro achado é o aviso, não o cartão — e a verificação não media o cartão.
  const cardCax = p.cards['Caxias'] || '';
  check('o cartão da loja sem couvert existe', !!cardCax, Object.keys(p.cards).join(', '));
  check('no cartão da loja sem couvert o saldo não vira número',
    /falta couvert pra fechar/.test(cardCax) && !/−R\$/.test(cardCax), cardCax.slice(0, 300));

  // ══ 3b. BANDA QUE NÃO VEIO NÃO É COUVERT FALTANDO ════════════════════════════════
  // Sem apresentação não há couvert a lançar. Cobrar o lançamento aí é cobrança falsa, e
  // era o que esta aba fazia no primeiro desenho.
  const nsh = p.simples['NORTE SHOPPING|2026-10-19'];
  check('a semana em que a banda não veio tem status próprio',
    nsh && nsh.status === 'naoVeio', JSON.stringify(nsh));
  check('e o dia não entra como couvert faltando',
    nsh && nsh.diasSemCouver.length === 0, JSON.stringify(nsh));
  check('a loja em que a banda não veio NÃO é cobrada por couvert',
    !/Norte Shopping/.test(avFal), avFal);
  check('e também não é chamada de negativa, porque o cachê pago é desconhecido',
    !/Norte Shopping/.test(avNeg), avNeg);
  check('ela aparece num aviso próprio, com o cachê que ficou gravado',
    /Norte Shopping/.test(avShow) && /900/.test(avShow), avShow);
  check('e o aviso nomeia o DIA em que a banda não veio',
    /24\/10/.test(avShow), avShow);
  check('no cartão dela o saldo também não vira número',
    /a banda não veio/.test(p.cards['Norte Shopping'] || ''), p.cards['Norte Shopping'] || '');

  // ══ 4. FIM DE SEMANA QUE AINDA NÃO CHEGOU NÃO É COBRANÇA ═════════════════════════
  const v = await montar(1);
  check('a semana vigente é alcançável', v.iniISO === '2026-10-26', v.iniISO);
  const pedV = v.simples['PEDREIRA|2026-10-26'];
  check('o fim de semana que ainda vem fica com status futuro',
    pedV && pedV.status === 'futuro', JSON.stringify(pedV));
  check('e o cachê já contratado aparece',
    pedV && pedV.cache === 1300, JSON.stringify(pedV));
  check('nenhum aviso de couvert faltando na semana que ainda não aconteceu',
    !/sem o couvert lançado/.test(v.txt), JSON.stringify(Object.keys(v.avisos)));
  check('nenhum aviso de saldo negativo na semana que ainda não aconteceu',
    !/com saldo negativo/.test(v.txt), JSON.stringify(Object.keys(v.avisos)));
  check('a tela diz que o couvert ainda não foi arrecadado',
    /ainda não arrecadado/.test(v.txt), v.txt.slice(0, 300));

  // ══ 5. BANDA QUE NÃO VEIO — o cachê não se inventa ═══════════════════════════════
  // O registro não zera o cachê quando a banda não vem, e o app não tem como saber se foi
  // pago. Então soma como está e DIZ que está somando.
  check('a apresentação em que a banda não veio aparece marcada',
    /não veio/.test(p.txt), p.txt.slice(0, 400));
  check('e o painel avisa quanto do cachê é de banda que não veio',
    /inclui R\$ ?900/.test(p.txt.replace(/ /g, ' ')), p.txt.slice(0, 400));

  // ══ 6. MAGLIA FORA ═══════════════════════════════════════════════════════════════
  // Maglia não usa a aba Banda do Check-list e não tem uma linha em gn_trios_agenda.
  check('Maglia não é listada na aba', !/Maglia/.test(p.txt), p.txt.slice(0, 400));

  // ══ 7. NAVEGAÇÃO — pela FUNÇÃO, que é onde vive a trava ══════════════════════════
  const nav = await page.evaluate(async ({ LINHAS }) => {
    const orig = window.gnFetchJson;
    window.gnFetchJson = async (url) => (/gn_trios_agenda/.test(url) ? LINHAS : []);
    try {
      _triosPer = 'sem';
      _triosGerOff = 0; _triosNav(1);  const chegouNaVigente = _triosGerOff;
      _triosNav(1);                    const passouDaVigente = _triosGerOff;
      _triosNav(-1); _triosNav(-1); const voltou = _triosGerOff;
      await new Promise(r => setTimeout(r, 60));
      return { chegouNaVigente, passouDaVigente, voltou };
    } finally { window.gnFetchJson = orig; }
  }, { LINHAS });
  check('a navegação chega na semana vigente', nav.chegouNaVigente === 1, JSON.stringify(nav));
  check('e não passa dela', nav.passouDaVigente === 1, JSON.stringify(nav));
  check('e volta pra trás sem trava', nav.voltou === -1, JSON.stringify(nav));

  // ══ 8. O HISTÓRICO É O QUE APONTA QUAIS SEMANAS ══════════════════════════════════
  // _triosNav dispara a carga de verdade (sem o dublê), então o estado fica na
  // semana errada e com a agenda vazia. Remonta antes de medir — sem isto, as duas
  // verificações abaixo e as do relatório passavam a medir uma tela em branco.
  await montar(0);
  const hist = await page.evaluate(() => {
    const el = document.createElement('div'); el.innerHTML = _buildTriosPanel();
    const i = el.innerHTML.indexOf('Últimas');
    const trecho = i < 0 ? '' : el.innerHTML.slice(i);
    const d = document.createElement('div'); d.innerHTML = trecho;
    const linhas = [...d.querySelectorAll('div')].filter(x => /width:104px/.test(x.innerHTML));
    const pedLinha = [...d.querySelectorAll('div')].find(x => /Pedreira/.test(x.textContent) && /height:18px/.test(x.innerHTML));
    return { temHistorico: i >= 0, nLinhas: linhas.length, semanas: TRIOS_HISTORICO.sem,
             quadrados: pedLinha ? pedLinha.querySelectorAll('span[title]').length : 0,
             pedTxt: pedLinha ? pedLinha.textContent.replace(/\s+/g, ' ').trim() : '' };
  });
  check('o histórico das últimas semanas aparece', hist.temHistorico === true, JSON.stringify(hist));
  // Contra o LITERAL 12, não contra TRIOS_HISTORICO.sem: comparando a tela com a
  // própria constante da página, encurtar a janela mudava os dois lados e a verificação
  // passava sem medir nada.
  check('com um quadrado por semana das 12 do histórico',
    hist.quadrados === 12 && hist.semanas === 12, JSON.stringify(hist));
  check('e a linha da loja conta quantas semanas ficaram negativas',
    /1 neg\./.test(hist.pedTxt), hist.pedTxt);

  // ══ 9. O RELATÓRIO LEVA OS TRÊS NÚMEROS E OS DOIS AVISOS ═════════════════════════
  const rel = await page.evaluate(() => (_triosRelatorioTexto(false) || {}).msg || '');
  check('o relatório traz cachê, couvert e saldo',
    /Cachê a pagar/.test(rel) && /Couvert arrecadado/.test(rel) && /Saldo da rede/.test(rel), rel.slice(0, 300));
  check('e separa as lojas negativas das sem couvert',
    /Saldo negativo: [^\n]*Pedreira/.test(rel) && /Sem couvert lançado: [^\n]*Caxias/.test(rel),
    rel.slice(-300));
  check('o relatório não trata a loja sem couvert como prejuízo',
    !/Caxias[\s\S]{0,120}Saldo: -/.test(rel), rel.slice(0, 600));

  // ══ 10. A consulta pede o histórico junto, numa chamada ══════════════════════════
  check('a agenda é buscada num intervalo que cobre o histórico',
    p.urls.some(u => /gn_trios_agenda/.test(u) && /data=gte\.2026-08-03/.test(u)),
    p.urls.filter(u => /trios/.test(u)).join(' | ').slice(0, 300));

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase|NetworkError|net::/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
