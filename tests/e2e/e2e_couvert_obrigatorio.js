// "Do couvert tem que ser obrigatório colocar a informação, se não tiver nos dias que tem
//  banda, bloquear e abrir direto no preenchimento das bandas, pra evitar essas faltas de
//  preenchimento."
//
// A cobrança JÁ EXISTIA — e nunca podia disparar. A condição era:
//     couvertPendente = !principal.banda_nao_veio &&
//       (principal.couver_valor === null || principal.couver_valor === undefined)
// e a coluna `couver_valor` tem DEFAULT 0 no banco. MEDIDO antes de mexer: das 372
// linhas-dia da base, NENHUMA é nula — 232 com valor e 140 com zero, das quais 44 já
// aconteceram e tiveram show. Ou seja: 44 dias de banda sem couvert lançado e sem uma
// única cobrança, porque a condição pedia um nulo que o banco nunca produz.
//
// O QUE TORNA O CONSERTO DIFÍCIL, e é metade desta suíte: cobrar por "valor = 0" trocaria
// um defeito por outro. Zero lançado de propósito ficaria indistinguível de zero que
// ninguém tocou — e como agora isso BLOQUEIA o app, a loja que faturou zero de couvert
// naquele dia ficaria travada sem saída. É a mesma armadilha da contagem zero do app
// Pedido. Por isso a marca é do ATO de lançar (couver_lancado_em), não do valor.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const SB_LIB = require('fs').readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

const ONTEM = '2026-10-28';   // relógio na quinta 29/10
const linha = (o) => Object.assign({
  id: 'r' + Math.random().toString(36).slice(2), loja: 'pedreira', data: ONTEM,
  artista: 'Trio', horario_inicio: '20:00', cache: 800,
  couver_qtd: 0, couver_valor: 0, couver_lancado_em: null,
  presenca_confirmada: true, banda_nao_veio: false, banda_nao_veio_motivo: null }, o || {});

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await CAMINHOS.fixarRelogio(ctx, '2026-10-29T12:00:00');
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status:200, contentType:'application/javascript', body:SB_LIB }));
  let AGENDA = [];
  const posts = [];
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request(), url = req.url();
    if (/gn_trios_agenda/.test(url)) {
      if (req.method() !== 'GET') {
        let corpo = null; try { corpo = JSON.parse(req.postData() || 'null'); } catch (e) {}
        posts.push({ url, corpo });
        return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(AGENDA) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + CHK);
  await page.waitForFunction(() => { try {
    return typeof _bandaGapNoDia === 'function' && typeof _salvarCouvertBandaHoje === 'function'
        && typeof _triosLojaSlug === 'function'; } catch (e) { return false; } },
    null, { timeout: 25000 });
  await page.evaluate(() => { hideLogin(); LOJA = 'Pedreira'; state.data = '2026-10-29';
    usuarioLogado = { id:1, nome:'Tiago', cargo:'gerente', loja:'PEDREIRA' }; });
  const slug = await page.evaluate(() => _triosLojaSlug());
  check('a loja da suíte resolve pro slug da agenda', slug === 'pedreira', String(slug));

  const gap = async (rows) => { AGENDA = rows;
    return page.evaluate(async () => await _bandaGapNoDia(1)); };

  // ══ 1. O DIA DE SHOW SEM COUVERT VOLTA A SER COBRADO ═════════════════════════════
  const semMarca = await gap([linha({ couver_valor: 0 })]);
  check('dia com show e sem o couvert lançado é cobrado',
    semMarca && semMarca.couvertPendente === true, JSON.stringify(semMarca));
  check('e isso basta pra pendência existir',
    semMarca && semMarca.pendente === true, JSON.stringify(semMarca));

  // ══ 2. ZERO LANÇADO DE PROPÓSITO NÃO É FALTA ═════════════════════════════════════
  // A metade que importa: com o bloqueio ligado, cobrar por valor deixaria a loja que
  // faturou zero de couvert travada sem nenhuma saída.
  const zeroLancado = await gap([linha({ couver_valor: 0, couver_qtd: 0, couver_lancado_em: ONTEM + 'T23:40:00Z' })]);
  check('zero LANÇADO não é cobrado — a loja tem saída',
    zeroLancado && zeroLancado.couvertPendente === false, JSON.stringify(zeroLancado));
  const comValor = await gap([linha({ couver_valor: 900, couver_lancado_em: ONTEM + 'T23:40:00Z' })]);
  check('e couvert com valor também não', comValor && comValor.couvertPendente === false, JSON.stringify(comValor));

  // ══ 3. SEM APRESENTAÇÃO NÃO HÁ COUVERT A LANÇAR ══════════════════════════════════
  const naoVeio = await gap([linha({ banda_nao_veio: true, presenca_confirmada: false })]);
  check('dia em que a banda não veio não é cobrado por couvert',
    naoVeio && naoVeio.couvertPendente === false, JSON.stringify(naoVeio));

  // ══ 4. A LINHA QUE NÃO VEIO NÃO PODE RESPONDER PELO DIA ══════════════════════════
  // O couvert era lido só da PRIMEIRA linha do dia. Quando a primeira é a banda que não
  // veio e a segunda tocou, olhar só pra ela dava o dia por resolvido — e o couvert da
  // que tocou nunca era cobrado.
  const misto = await gap([
    linha({ horario_inicio: '19:00', banda_nao_veio: true, presenca_confirmada: false, couver_lancado_em: ONTEM + 'T19:10:00Z' }),
    linha({ horario_inicio: '22:00', couver_valor: 0, couver_lancado_em: null }),
  ]);
  check('a banda que tocou é cobrada mesmo quando a primeira do dia não veio',
    misto && misto.couvertPendente === true, JSON.stringify(misto));
  const mistoOk = await gap([
    linha({ horario_inicio: '19:00', banda_nao_veio: true, presenca_confirmada: false }),
    linha({ horario_inicio: '22:00', couver_valor: 700, couver_lancado_em: ONTEM + 'T23:40:00Z' }),
  ]);
  check('e deixa de ser quando essa lança',
    mistoOk && mistoOk.couvertPendente === false, JSON.stringify(mistoOk));

  // ══ 5. SEM AGENDA, NADA A COBRAR ═════════════════════════════════════════════════
  const vazio = await gap([]);
  check('dia sem apresentação agendada não gera cobrança', vazio === null, JSON.stringify(vazio));

  // ══ 6. SALVAR REGISTRA O ATO EM TODAS AS LINHAS DO DIA ═══════════════════════════
  // Em todas, não só na principal: a principal pode ser a que não veio, e aí a marca
  // ficaria na linha que a cobrança não olha.
  posts.length = 0;
  const salvou = await page.evaluate(async () => {
    _triosHojeRecords = [{ id: 'A', couver_valor: 0 }, { id: 'B', couver_valor: 0 }];
    _triosHojeRecord = _triosHojeRecords[0];
    document.body.insertAdjacentHTML('beforeend',
      '<input id="banda-hoje-qtd" value="10"><input id="banda-hoje-valor" value="150">' +
      '<button id="banda-hoje-btn"></button><div id="banda-hoje-rec"></div>');
    const origToast = window.showToast; window.showToast = () => {};
    try { await _salvarCouvertBandaHoje(); } catch (e) {} finally { window.showToast = origToast; }
    return _triosHojeRecords.map(r => ({ id: r.id, v: r.couver_valor, m: !!r.couver_lancado_em }));
  });
  const corpos = posts.map(p => p.corpo).filter(Boolean);
  check('o salvamento grava a marca do lançamento',
    corpos.length >= 2 && corpos.every(c => !!c.couver_lancado_em),
    JSON.stringify(corpos).slice(0, 300));
  check('em TODAS as linhas do dia, não só na principal',
    salvou.length === 2 && salvou.every(r => r.m === true), JSON.stringify(salvou));
  check('e o valor continua indo só pra principal, sem contar duas vezes',
    salvou[0].v === 150 && salvou[1].v === 0, JSON.stringify(salvou));

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase|NetworkError|net::/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
