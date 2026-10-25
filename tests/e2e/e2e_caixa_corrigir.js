// "Achei o erro, tinha dez reais lançados a mais, poderia ter a opção de poder excluir
//  daqui mesmo. E isso corrigir já o caixa. Ai também ter as bandeiras marcadas a
//  divergência quando apontar pela conferência, que fica mais intuitivo qual abrir pra
//  verificar, na aba Recebido."
//
// Duas coisas: excluir sem sair da conferência, e a grade da aba Recebido marcando a
// bandeira que a PRÓPRIA LOJA apontou (antes só pintava divergência do RH).
//
// Excluir é mexer em dinheiro, então o teste cobra o que protege: confirmação, bloqueio
// com o caixa fechado, e o ressincronismo do Check-list — sem ele, apagar um lançamento
// deixa o faturamento e a comissão com o valor antigo pra sempre.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-caixa.html');
const MD = 'Mastercard Débito';
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 320)); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const escritas = [];
  await ctx.route('**/rest/v1/**', async r => {
    const req = r.request(), url = req.url(), m = req.method();
    if (m !== 'GET') escritas.push({ metodo: m, alvo: url.split('/rest/v1/')[1].split('?')[0],
                                     id: (url.match(/id=eq\.([^&]+)/) || [])[1] });
    if (m !== 'GET') return r.fulfill({ status: 204, body: '' });
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  let confirmou = 0, ultimaPergunta = '';
  page.on('dialog', async d => { confirmou++; ultimaPergunta = d.message(); await d.accept(); });
  await page.goto('file://' + ARQ);
  await page.waitForFunction(() => typeof excluirDaConferencia === 'function', { timeout: 25000 });

  const montar = (opts) => page.evaluate(o => {
    S.user = { nome: 'Tiago', cargo: 'gerente' };
    S.loja = 'BANGU'; S.turnoSel = 'NOITE'; S.modoConsulta = !!o.consulta;
    S.fech = { id: 'fech-1', loja: 'BANGU', data: '2026-10-20', turno: 'NOITE',
               status: o.consulta ? 'FECHADO' : 'ABERTO', suprimento_inicial: 700,
               conferencia_loja: o.sistema || null };
    S.comprovantes = [
      { id:'m1', bandeira:'Mastercard Débito', valor:100.00, criado_em:'2026-10-20T10:51:00Z', conferido_em:'2026-10-20T11:00:00Z', conferido_por:'Tiago' },
      { id:'m2', bandeira:'Mastercard Débito', valor: 10.00, criado_em:'2026-10-20T10:52:00Z', conferido_em:null },
      { id:'p1', bandeira:'Pix',               valor:110.00, criado_em:'2026-10-20T10:53:00Z', conferido_em:null },
      { id:'d1', bandeira:'Dinheiro',          valor:110.00, criado_em:'2026-10-20T10:54:00Z', conferido_em:null },
    ];
    S.saidas = []; S.supr = []; S.notas10 = []; S.cancel = [];
    S.confAtual = o.rh || null;
    document.getElementById('telaLogin')?.classList.add('hidden');
    document.getElementById('telaTurno')?.classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('bandGrid').innerHTML = ENTRADAS.map(b =>
      `<button class="band" onclick="abrirModal('${b.k.replace(/'/g, "\\'")}')">
         <span class="nm">${b.k}</span><span class="tot" id="bt-${cssId(b.k)}">R$ 0,00</span></button>`).join('');
    document.querySelectorAll('.pane').forEach(p => p.classList.add('hidden'));
    document.getElementById('pane-receb').classList.remove('hidden');
    renderTudo();
  }, opts);

  const estiloBand = (k) => page.evaluate(kk => {
    const el = document.getElementById('bt-' + cssId(kk));
    const btn = el.parentElement;
    const badge = document.getElementById('bc-' + cssId(kk));
    return { outline: btn.style.outline, badge: badge ? badge.textContent.trim() : null };
  }, k);

  // ══ 1. A bandeira que a LOJA apontou fica marcada na grade ══════════════════════
  // Sistema diz 100,00 no Mastercard; o app tem 110,00 (os 10 a mais do print).
  await montar({ sistema: { 'Mastercard Débito': 100.00, 'Pix': 110.00 } });
  let md = await estiloBand(MD);
  check('a bandeira com divergência da própria loja fica destacada na grade',
    /solid/.test(md.outline), JSON.stringify(md));
  check('e o badge diz que o número veio do SISTEMA, com a diferença',
    /Sistema/.test(md.badge) && /100,00/.test(md.badge) && /10,00/.test(md.badge), md.badge);
  const pix = await estiloBand('Pix');
  check('a bandeira que a loja conferiu e bateu fica verde, com "Confere"',
    /solid/.test(pix.outline) && /Confere/.test(pix.badge), JSON.stringify(pix));
  const dinh = await estiloBand('Dinheiro');
  check('a que ninguém conferiu continua neutra, sem inventar marca',
    !dinh.outline && dinh.badge === null, JSON.stringify(dinh));

  const banner = await page.evaluate(() => (document.getElementById('divBannerDiverg')||{}).textContent || '');
  check('o topo avisa, sem dizer que foi o RH quem achou',
    /não bate com o sistema/.test(banner) && !/RH encontrou/.test(banner), banner);
  check('e manda tocar na bandeira marcada', /Conferir lançamentos/.test(banner), banner);

  // ══ 2. RH continua tendo precedência e o rótulo certo ═══════════════════════════
  await montar({ sistema: { 'Mastercard Débito': 100.00 },
                 rh: { itens: { bandeiras: { 'Mastercard Débito': { conferido: 90.00, dif: 20 } } } } });
  md = await estiloBand(MD);
  check('com RH e loja divergindo, o badge mostra o número do RH',
    /RH/.test(md.badge) && /90,00/.test(md.badge), md.badge);
  check('e o banner volta a falar em RH',
    /RH encontrou/.test(await page.evaluate(() => document.getElementById('divBannerDiverg').textContent)));

  // ══ 3. Excluir sem sair da conferência ══════════════════════════════════════════
  escritas.length = 0; confirmou = 0;
  await montar({ sistema: { 'Mastercard Débito': 100.00 } });
  await page.evaluate(k => { abrirModal(k); abrirConferir(); }, MD);
  await page.waitForTimeout(150);
  check('cada lançamento tem o botão de excluir',
    await page.locator('#confLista .conf-del').count() === 2);

  // Espiona a ressincronização do Check-list: é ela que reescreve faturamento e comissão
  // depois de apagar um comprovante. Verificar só que a função "existe" não provaria nada.
  await page.evaluate(() => {
    window.__sync = [];
    const orig = window.sincronizarChecklist;
    window.sincronizarChecklist = function (d) { window.__sync.push(d); return orig.apply(this, arguments); };
  });
  const antesTotal = await page.evaluate(k => totEntradaK(k), MD);
  await page.locator('#confLista .conf-linha:nth-child(2) .conf-del').click();
  await page.waitForTimeout(400);
  check('excluir pede confirmação antes', confirmou === 1 && /Excluir/.test(ultimaPergunta), ultimaPergunta);
  check('o lançamento some do app', !(await page.evaluate(() => S.comprovantes.some(c => c.id === 'm2'))));
  check('e some da lista da conferência',
    await page.locator('#confLista .conf-linha').count() === 1);
  check('o DELETE foi pro servidor, no lançamento certo',
    escritas.some(e => e.metodo === 'DELETE' && e.alvo === 'gn_caixa_comprovante' && e.id === 'm2'),
    JSON.stringify(escritas));
  check('o total da bandeira cai na hora (110 → 100)',
    (await page.evaluate(k => totEntradaK(k), MD)) === 100 && antesTotal === 110);

  // O ponto do pedido: "isso corrigir já o caixa".
  const res = await page.evaluate(() => document.getElementById('confResumo').textContent.replace(/\s+/g,' '));
  check('e a bandeira passa a BATER com o sistema, sem sair da tela',
    /Bate com o sistema/.test(res) && !/lançados a mais/.test(res), res);

  // Apagar comprovante tem que reescrever faturamento/comissão — senão o Check-list fica
  // com o valor velho pra sempre.
  const sync = await page.evaluate(() => window.__sync || []);
  check('o Check-list é ressincronizado, com a data do caixa',
    sync.length === 1 && sync[0] === '2026-10-20', JSON.stringify(sync));

  // ══ 4. Última linha excluída volta pro painel de lançar ═════════════════════════
  await page.locator('#confLista .conf-del').first().click();
  await page.waitForTimeout(400);
  check('excluindo o último lançamento, volta pro painel de lançar',
    await page.locator('#paneLancar').isVisible() && await page.locator('#paneConferir').isHidden());

  // ══ 5. Caixa fechado: conferir sim, excluir não ════════════════════════════════
  escritas.length = 0; confirmou = 0;
  await montar({ consulta: true, sistema: { 'Mastercard Débito': 100.00 } });
  await page.evaluate(k => { abrirModal(k); abrirConferir(); }, MD);
  await page.waitForTimeout(150);
  check('com o caixa fechado o botão de excluir nem aparece',
    await page.locator('#confLista .conf-del').count() === 0);
  check('e marcar continua funcionando (conferir é auditoria)',
    await page.locator('#confLista .conf-linha').count() === 2);
  await page.evaluate(() => excluirDaConferencia('m2'));
  await page.waitForTimeout(300);
  check('chamar a exclusão direto, com o caixa fechado, não apaga nada',
    (await page.evaluate(() => S.comprovantes.some(c => c.id === 'm2'))) === true
    && !escritas.some(e => e.metodo === 'DELETE'), JSON.stringify(escritas));
  check('e nem pede confirmação', confirmou === 0);

  // ══ 6. Cabe no celular ════════════════════════════════════════════════════════
  await page.evaluate(() => fecharModal());
  await montar({ sistema: { 'Mastercard Débito': 100.00 } });
  await page.evaluate(k => { abrirModal(k); abrirConferir(); }, MD);
  await page.waitForTimeout(200);
  check('a linha com o botão de excluir cabe nos 390px', await page.evaluate(() => {
    const sheet = document.querySelector('#modalBand .modal-sheet');
    return [...sheet.querySelectorAll('*')].every(e => e.getBoundingClientRect().right <= 391);
  }));

  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
