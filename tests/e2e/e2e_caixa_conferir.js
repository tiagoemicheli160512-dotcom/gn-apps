// Conferir lançamentos por bandeira, no app Caixa.
//
// "Quando dá uma diferença, pra tentar achar o erro fica difícil, pois os valores ficam
//  misturados." Medido: 27 lançamentos por caixa em média (máx. 317) em 10,7 bandeiras,
//  numa lista só. Por bandeira a média é 2,5.
//
// O que mais importa provar aqui NÃO é o desenho: é que conferir é AUDITORIA e não mexe em
// dinheiro. Por isso o teste vigia todas as escritas que saem da página e confere que os
// totais da bandeira não mudam nem um centavo depois de marcar tudo.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-caixa.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 300)); };

const MD = 'Mastercard Débito';

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  const escritas = [];   // TUDO que a página tentar gravar
  let falharPatch = false;
  await ctx.route('**/rest/v1/**', async r => {
    const req = r.request(), url = req.url(), m = req.method();
    if (m !== 'GET') escritas.push({ metodo: m, alvo: url.split('/rest/v1/')[1].split('?')[0],
                                     id: (url.match(/id=eq\.([^&]+)/) || [])[1],
                                     body: req.postData() ? JSON.parse(req.postData()) : null });
    if (/gn_caixa_comprovante/.test(url) && m === 'PATCH') {
      if (falharPatch) return r.abort('failed');
      return r.fulfill({ status: 204, body: '' });
    }
    if (/gn_caixa_fechamento/.test(url) && m === 'PATCH') {
      if (falharPatch) return r.abort('failed');
      return r.fulfill({ status: 204, body: '' });
    }
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + ARQ);
  await page.waitForFunction(() => { try {
    return typeof renderTudo === 'function' && typeof abrirModal === 'function';
  } catch (e) { return false; } }, { timeout: 20000 });

  // Caixa com valores MISTURADOS, como na vida real: 4 bandeiras, 9 lançamentos.
  const montar = (opts) => page.evaluate((o) => {
    S.user = { nome: 'Tiago', cargo: 'gerente' };
    S.loja = 'BANGU'; S.turnoSel = 'NOITE'; S.modoConsulta = !!o.consulta;
    S.fech = { id: 'fech-1', loja: 'BANGU', data: '2026-10-18', turno: 'NOITE',
               status: o.consulta ? 'FECHADO' : 'ABERTO', operador: 'Tiago', suprimento_inicial: 700 };
    const h = n => '2026-10-18T2' + n + ':10:00Z';
    S.comprovantes = [
      { id: 'c1', bandeira: 'Mastercard Débito', valor: 120.00, criado_em: h(0), conferido_em: null },
      { id: 'c2', bandeira: 'Pix',               valor:  55.00, criado_em: h(0), conferido_em: null },
      { id: 'c3', bandeira: 'Mastercard Débito', valor: 300.00, criado_em: h(1), conferido_em: null },
      { id: 'c4', bandeira: 'Visa Crédito',      valor: 410.00, criado_em: h(1), conferido_em: null },
      { id: 'c5', bandeira: 'Mastercard Débito', valor:  70.50, criado_em: h(2), conferido_em: null },
      { id: 'c6', bandeira: 'Pix',               valor:  12.00, criado_em: h(2), conferido_em: null },
      { id: 'c7', bandeira: 'Mastercard Débito', valor: 200.00, criado_em: h(3), conferido_em: null },
      { id: 'c8', bandeira: 'Dinheiro',          valor:  80.00, criado_em: h(3), conferido_em: null },
      { id: 'c9', bandeira: 'Mastercard Débito', valor:  99.50, criado_em: h(3), conferido_em: null },
    ];
    S.saidas = []; S.supr = []; S.notas10 = []; S.cancel = [];
    S.confAtual = o.conf || null;
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

  const txt = sel => page.evaluate(s => (document.querySelector(s)?.textContent || '').replace(/\s+/g, ' ').trim(), sel);

  // ══ 1. O caminho de lançar continua igual ══════════════════════════════════════════
  await montar({});
  await page.evaluate(k => abrirModal(k), MD);
  check('o modal ainda abre com o campo de lançar valor',
    await page.locator('#modalVal').isVisible() && await page.locator('#paneLancar').isVisible());
  check('e a conferência começa fechada', await page.locator('#paneConferir').isHidden());

  // ══ 2. O botão de conferir conta os lançamentos DAQUELA bandeira ═══════════════════
  check('o botão conta só os 5 lançamentos da bandeira, não os 9 do caixa',
    /5 lançamentos/.test(await txt('#btnAbrirConferir')), await txt('#btnAbrirConferir'));

  await page.evaluate(() => fecharModal());
  await page.evaluate(() => abrirModal('Amex'));
  check('bandeira sem lançamento: o botão avisa e fica desabilitado',
    /Nenhum lançamento/.test(await txt('#btnAbrirConferir'))
    && await page.locator('#btnAbrirConferir').isDisabled());

  // ══ 3. A lista mostra SÓ aquela bandeira — o ponto do pedido ═══════════════════════
  await page.evaluate(() => fecharModal());
  await page.evaluate(k => { abrirModal(k); abrirConferir(); }, MD);
  const valores = () => page.evaluate(() =>
    [...document.querySelectorAll('#confLista .conf-linha .cv')].map(e => e.textContent.trim()));
  let vs = await valores();
  check('a lista traz exatamente os 5 valores da bandeira', vs.length === 5, vs.join(' | '));
  check('e nenhum valor de outra bandeira entra',
    !vs.some(v => /55,00|410,00|12,00|80,00/.test(v)), vs.join(' | '));
  check('em ordem de horário, como saiu na maquininha',
    vs.join('|') === 'R$ 120,00|R$ 300,00|R$ 70,50|R$ 200,00|R$ 99,50', vs.join(' | '));

  // ══ 4. Marcar: a conta anda junto ══════════════════════════════════════════════════
  check('começa com 0 de 5 marcados', /0 de 5/.test(await txt('#confResumo')), await txt('#confResumo'));
  await page.evaluate(() => toggleConferido('c1'));
  await page.evaluate(() => toggleConferido('c3'));
  await page.waitForTimeout(150);
  let res = await txt('#confResumo');
  check('marcou 2 de 5 e somou R$ 420,00', /2 de 5/.test(res) && /420,00/.test(res), res);
  check('e diz quanto ainda falta marcar (R$ 370,00)', /370,00/.test(res), res);
  check('a linha marcada fica visivelmente marcada',
    await page.locator('#confLista .conf-linha.on').count() === 2);

  // ══ 5. O que foi pro servidor ══════════════════════════════════════════════════════
  const pat = escritas.filter(e => e.metodo === 'PATCH');
  check('cada marca virou um PATCH no próprio lançamento', pat.length === 2
    && pat[0].id === 'c1' && pat[1].id === 'c3', JSON.stringify(pat));
  check('gravando quando e quem conferiu',
    !!pat[0].body.conferido_em && pat[0].body.conferido_por === 'Tiago', JSON.stringify(pat[0].body));

  // ══ 6. Desmarcar limpa ═════════════════════════════════════════════════════════════
  await page.evaluate(() => toggleConferido('c1'));
  await page.waitForTimeout(150);
  const ult = escritas.filter(e => e.metodo === 'PATCH').pop();
  check('desmarcar apaga a marca no banco (não grava "false")',
    ult.body.conferido_em === null && ult.body.conferido_por === null, JSON.stringify(ult.body));
  check('e a tela volta pra 1 de 5', /1 de 5/.test(await txt('#confResumo')));

  // ══ 7. Conferir NÃO mexe em dinheiro ═══════════════════════════════════════════════
  const totalAntes = await page.evaluate(k => totEntradaK(k), MD);
  await page.evaluate(() => ['c1','c3','c5','c7','c9'].forEach(toggleConferido));
  await page.waitForTimeout(200);
  check('o total da bandeira não muda nem um centavo depois de conferir',
    (await page.evaluate(k => totEntradaK(k), MD)) === totalAntes, totalAntes);
  check('nenhuma escrita fora do PATCH de conferência',
    escritas.every(e => e.metodo === 'PATCH' && e.alvo === 'gn_caixa_comprovante'),
    JSON.stringify(escritas.filter(e => e.metodo !== 'PATCH')));

  // ══ 8. Divergência do RH: a tela faz a conta ═══════════════════════════════════════
  escritas.length = 0;
  await montar({ conf: { itens: { bandeiras: { [MD]: { conferido: 940.00, dif: 150.00 } } } } });
  await page.evaluate(k => { abrirModal(k); abrirConferir(); }, MD);
  res = await txt('#confResumo');
  check('com divergência, diz quanto falta lançar', /Falta lançar/.test(res) && /150,00/.test(res), res);
  check('mostra o que o RH contou e o que está no app',
    /940,00/.test(res) && /790,00/.test(res), res);
  check('e o botão de conferir vira alerta',
    await page.evaluate(() => { fecharModal(); abrirModal('Mastercard Débito');
      return document.getElementById('btnAbrirConferir').classList.contains('alerta'); }));

  // ══ 9. Marcou tudo e a diferença continua: o app diz o que isso significa ══════════
  await page.evaluate(k => { abrirModal(k); abrirConferir(); }, MD);
  await page.evaluate(() => ['c1','c3','c5','c7','c9'].forEach(toggleConferido));
  await page.waitForTimeout(250);
  res = await txt('#confResumo');
  check('marcou tudo e sobra diferença: aponta que falta um recebimento nunca lançado',
    /nunca foi lançado/.test(res) && /150,00/.test(res), res);

  // ══ 10. Lançamento que ainda não subiu não pode ser marcado ════════════════════════
  escritas.length = 0;
  await montar({});
  await page.evaluate(() => { S.comprovantes.push({ id: 'tmp-1', _pendente: true,
    bandeira: 'Mastercard Débito', valor: 44.00, criado_em: '2026-10-18T23:50:00Z', conferido_em: null }); });
  await page.evaluate(k => { abrirModal(k); abrirConferir(); }, MD);
  check('a linha pendente aparece travada',
    await page.locator('#confLista .conf-linha.travada').count() === 1);
  await page.evaluate(() => toggleConferido('tmp-1'));
  await page.waitForTimeout(150);
  check('e marcar nela não grava nada', escritas.length === 0, JSON.stringify(escritas));

  // ══ 11. Offline: a marca não some da tela ══════════════════════════════════════════
  await montar({});
  await page.evaluate(() => localStorage.removeItem('gnCaixaPendentes'));
  await page.evaluate(k => { abrirModal(k); abrirConferir(); }, MD);
  falharPatch = true;
  await page.evaluate(() => toggleConferido('c1'));
  await page.waitForTimeout(300);
  check('offline: a marca continua na tela', await page.locator('#confLista .conf-linha.on').count() === 1);
  const fila = await page.evaluate(() => {
    const bruto = Object.keys(localStorage).map(k => localStorage.getItem(k)).join('');
    return /"method":"PATCH"/.test(bruto) && /"realId":"c1"/.test(bruto);
  });
  check('e entrou na fila pra subir ao reconectar', fila);
  falharPatch = false;

  // ══ 12. O ✓ também aparece na lista misturada ══════════════════════════════════════
  check('o lançamento conferido fica com ✓ na lista geral de recebimentos',
    /✓/.test(await txt('#listaReceb')), await txt('#listaReceb'));

  // ══ 13. Caixa fechado: conferir continua valendo (é quando o RH aponta) ════════════
  escritas.length = 0;
  await montar({ consulta: true, conf: { itens: { bandeiras: { [MD]: { conferido: 940, dif: 150 } } } } });
  await page.evaluate(k => { abrirModal(k); abrirConferir(); }, MD);
  await page.evaluate(() => toggleConferido('c1'));
  await page.waitForTimeout(200);
  check('em modo consulta ainda dá pra conferir', escritas.some(e => e.metodo === 'PATCH' && e.id === 'c1'),
    JSON.stringify(escritas));

  // ══ 14. Cabe no celular ════════════════════════════════════════════════════════════
  // Mede o modal, não a página: o header do app já estoura 390px no `main` (scrollWidth
  // 450, vindo de .hdr-btns) — medir a página aqui seria cobrar deste recurso um defeito
  // que não é dele.
  check('o modal e tudo dentro dele cabem nos 390px', await page.evaluate(() => {
    const sheet = document.querySelector('#modalBand .modal-sheet');
    const r = sheet.getBoundingClientRect();
    const estouram = [...sheet.querySelectorAll('*')].filter(e => {
      const b = e.getBoundingClientRect();
      return b.width > 0 && (b.right > 391 || b.left < -1);
    });
    return r.left >= -1 && r.right <= 391 && estouram.length === 0;
  }));
  check('a lista rola dentro do modal em vez de esticar a tela', await page.evaluate(() => {
    const l = document.getElementById('confLista');
    return getComputedStyle(l).overflowY === 'auto' && l.getBoundingClientRect().height <= 400;
  }));

  // ══ 15. VALE PRA TUDO — inclusive Dinheiro ════════════════════════════════════════
  // Não é detalhe: medido na rede, Dinheiro é a bandeira que MAIS diverge (42 das 222
  // conferências, 19% — quase o dobro da segunda). Uma exceção aqui tiraria o recurso
  // justamente de onde ele mais seria usado.
  escritas.length = 0;
  const todas = await page.evaluate(() => ENTRADAS.map(b => b.k));
  check('o app tem as 17 formas de recebimento', todas.length === 17, todas.length);
  check('e Dinheiro é uma delas', todas.includes('Dinheiro'));

  // Um lançamento em CADA bandeira, para percorrer todas.
  await page.evaluate(() => {
    S.user = { nome: 'Tiago' }; S.loja = 'BANGU'; S.turnoSel = 'NOITE'; S.modoConsulta = false;
    S.fech = { id: 'fech-1', loja: 'BANGU', data: '2026-10-18', status: 'ABERTO', suprimento_inicial: 700 };
    S.comprovantes = ENTRADAS.map((b, i) => ({ id: 'all-' + i, bandeira: b.k, valor: 10 + i,
      criado_em: '2026-10-18T20:00:00Z', conferido_em: null }));
    S.saidas = []; S.supr = []; S.notas10 = []; S.cancel = [];
    S.confAtual = null;
    renderTudo();
  });

  const porBandeira = [];
  for (const k of todas) {
    const r = await page.evaluate((kk) => {
      fecharModal(); abrirModal(kk);
      const btn = document.getElementById('btnAbrirConferir');
      const oferece = !btn.disabled && /Conferir/.test(btn.textContent);
      abrirConferir();
      const vis = !document.getElementById('paneConferir').classList.contains('hidden');
      const linhas = document.querySelectorAll('#confLista .conf-linha').length;
      const valor = (document.querySelector('#confLista .conf-linha .cv') || {}).textContent;
      return { oferece, vis, linhas, valor: (valor || '').trim() };
    }, k);
    porBandeira.push({ k, ...r });
  }
  await page.evaluate(() => fecharModal());

  const semOpcao = porBandeira.filter(b => !b.oferece || !b.vis);
  check('TODAS as 17 bandeiras oferecem conferir lançamentos, sem exceção',
    semOpcao.length === 0, semOpcao.map(b => b.k).join(' | '));
  const listaErrada = porBandeira.filter(b => b.linhas !== 1);
  check('e cada uma lista o lançamento dela, só dela',
    listaErrada.length === 0, listaErrada.map(b => b.k + '=' + b.linhas).join(' | '));

  const dinheiro = porBandeira.find(b => b.k === 'Dinheiro');
  check('Dinheiro — a bandeira que mais diverge na rede — confere igual às outras',
    dinheiro.oferece && dinheiro.vis && dinheiro.linhas === 1, JSON.stringify(dinheiro));

  // As de lançamento manual (sem código de maquininha) não podem ficar de fora: o
  // "relatório" delas é outro (extrato do iFood, comprovante de Pix, contagem da gaveta),
  // mas o ato de bater valor a valor é o mesmo.
  const manuais = ['Dinheiro', 'IFOOD', 'Online', 'Vale Refeição', 'OUTROS'];
  const manualFora = porBandeira.filter(b => manuais.includes(b.k) && !(b.oferece && b.linhas === 1));
  check('as de lançamento manual (Dinheiro, IFOOD, Online, Vale Refeição, OUTROS) também',
    manualFora.length === 0, manualFora.map(b => b.k).join(' | '));

  // ══ 16. Dinheiro com divergência do RH: a mesma conta das outras ══════════════════
  escritas.length = 0;
  await page.evaluate(() => {
    S.comprovantes = [
      { id: 'd1', bandeira: 'Dinheiro', valor: 200.00, criado_em: '2026-10-18T20:10:00Z', conferido_em: null },
      { id: 'd2', bandeira: 'Dinheiro', valor: 150.00, criado_em: '2026-10-18T21:10:00Z', conferido_em: null },
      { id: 'd3', bandeira: 'Dinheiro', valor:  45.64, criado_em: '2026-10-18T22:10:00Z', conferido_em: null },
    ];
    S.confAtual = { itens: { bandeiras: { Dinheiro: { conferido: 531.28, dif: 135.64 } } } };
    renderTudo(); abrirModal('Dinheiro'); abrirConferir();
  });
  let resD = await txt('#confResumo');
  check('no Dinheiro a tela também diz quanto falta lançar',
    /Falta lançar/.test(resD) && /135,64/.test(resD), resD);
  check('e mostra o que o RH contou contra o que está no app',
    /531,28/.test(resD) && /395,64/.test(resD), resD);
  await page.evaluate(() => ['d1','d2','d3'].forEach(toggleConferido));
  await page.waitForTimeout(250);
  resD = await txt('#confResumo');
  check('marcou tudo no Dinheiro e a sobra continua: aponta recebimento nunca lançado',
    /nunca foi lançado/.test(resD), resD);
  check('e o total do Dinheiro não mudou',
    (await page.evaluate(() => totEntradaK('Dinheiro'))) === 395.64,
    await page.evaluate(() => totEntradaK('Dinheiro')));

  // ══ 17. O texto da tela fala a língua de cada forma de recebimento ═══════════════
  // Pedir "confira no relatório da maquininha" pra quem está contando a gaveta faz a tela
  // parecer coisa de cartão — e o Dinheiro é a que mais diverge.
  const fonteDe = (k) => page.evaluate(kk => {
    fecharModal(); abrirModal(kk); abrirConferir();
    return document.getElementById('confResumo').textContent.replace(/\s+/g, ' ');
  }, k);
  check('no Dinheiro a tela manda conferir a contagem do caixa, não a maquininha',
    /contagem do dinheiro em caixa/.test(await fonteDe('Dinheiro'))
    && !/maquininha/.test(await fonteDe('Dinheiro')), await fonteDe('Dinheiro'));
  check('no cartão continua sendo o relatório da maquininha',
    /relatório da maquininha/.test(await fonteDe('Mastercard Débito')));
  check('no iFood/Online é o extrato da plataforma',
    /extrato da plataforma/.test(await fonteDe('IFOOD'))
    && /extrato da plataforma/.test(await fonteDe('Online')));
  check('e nenhuma bandeira fica sem instrução', await page.evaluate(() =>
    ENTRADAS.every(b => { fecharModal(); abrirModal(b.k); abrirConferir();
      return /Marque cada valor que você achou \S/.test(document.getElementById('confResumo').textContent); })));
  await page.evaluate(() => fecharModal());

  // ══ 18. SEM O RH: a loja acha o erro sozinha ═════════════════════════════════════
  // "Lancei tudo, aí deu diferença no caixa, pra facilitar achar onde foi o erro, esse
  //  recurso ajuda, antes mesmo de ir pro RH." Sem um valor esperado a tela só listava.
  escritas.length = 0;
  await page.evaluate(() => {
    S.user = { nome: 'Tiago' }; S.loja = 'BANGU'; S.turnoSel = 'NOITE'; S.modoConsulta = false;
    S.fech = { id: 'fech-1', loja: 'BANGU', data: '2026-10-18', status: 'ABERTO',
               suprimento_inicial: 700, conferencia_loja: null };
    S.comprovantes = [
      { id: 'm1', bandeira: 'Mastercard Débito', valor: 120.00, criado_em: '2026-10-18T20:10:00Z', conferido_em: null },
      { id: 'm2', bandeira: 'Mastercard Débito', valor: 300.00, criado_em: '2026-10-18T21:10:00Z', conferido_em: null },
      { id: 'm3', bandeira: 'Mastercard Débito', valor:  70.50, criado_em: '2026-10-18T22:10:00Z', conferido_em: null },
    ];
    S.saidas = []; S.supr = []; S.notas10 = []; S.cancel = [];
    S.confAtual = null;   // o RH ainda NEM OLHOU esse caixa
    renderTudo(); abrirModal('Mastercard Débito'); abrirConferir();
  });
  check('sem RH, o campo do valor do relatório está lá', await page.locator('#confEsperado').isVisible());
  check('e começa vazio — "não anotei" não é "anotei zero"',
    (await page.locator('#confEsperado').inputValue()) === '');
  let semRh = await txt('#confResumo');
  check('sem valor anotado, a tela não inventa diferença nenhuma',
    !/Falta lançar/.test(semRh) && !/Bate com/.test(semRh), semRh);

  // A loja digita o que o relatório da maquininha deu.
  await page.evaluate(() => salvarEsperadoLoja('640,50'));
  await page.waitForTimeout(250);
  semRh = await txt('#confResumo');
  check('anotou o relatório e a tela já diz quanto falta, sem o RH',
    /Falta lançar/.test(semRh) && /150,00/.test(semRh), semRh);
  // O total esperado passou a vir do SISTEMA (o PDV diz quanto entrou em cada bandeira),
  // não do relatório da maquininha: é o número que a loja tem em mãos no fechamento.
  check('e mostra o sistema contra o app, com o rótulo certo',
    /No sistema/.test(semRh) && /640,50/.test(semRh) && /490,50/.test(semRh), semRh);
  check('a anotação foi gravada no fechamento', escritas.some(e =>
    e.metodo === 'PATCH' && e.alvo === 'gn_caixa_fechamento'
    && e.body.conferencia_loja['Mastercard Débito'] === 640.5), JSON.stringify(escritas));

  // Marca os três e a diferença continua: é recebimento que nunca foi lançado.
  await page.evaluate(() => ['m1','m2','m3'].forEach(toggleConferido));
  await page.waitForTimeout(250);
  semRh = await txt('#confResumo');
  check('marcou tudo sem RH e o app aponta o recebimento que falta',
    /nunca foi lançado/.test(semRh) && /150,00/.test(semRh), semRh);

  // Lança o que faltava: a tela passa a dizer que bate.
  await page.evaluate(() => { S.comprovantes.push({ id:'m4', bandeira:'Mastercard Débito',
    valor:150.00, criado_em:'2026-10-18T23:00:00Z', conferido_em:null }); renderTudo(); renderConferir(); });
  semRh = await txt('#confResumo');
  check('lançou o que faltava e a bandeira passa a bater',
    /Bate com o sistema/.test(semRh) && !/Falta lançar/.test(semRh), semRh);

  // ══ 19. Apagar a anotação volta pro estado "não anotei" ══════════════════════════
  escritas.length = 0;
  await page.evaluate(() => salvarEsperadoLoja(''));
  await page.waitForTimeout(250);
  semRh = await txt('#confResumo');
  check('apagar o campo não vira "esperado R$ 0,00"',
    !/Falta lançar/.test(semRh) && !/Bate com/.test(semRh), semRh);
  check('e some do que fica gravado, em vez de gravar zero', escritas.some(e =>
    e.metodo === 'PATCH' && !('Mastercard Débito' in (e.body.conferencia_loja || {}))),
    JSON.stringify(escritas));

  // ══ 20. RH tem precedência, e discordância aparece ═══════════════════════════════
  await page.evaluate(() => {
    S.fech.conferencia_loja = { 'Mastercard Débito': 640.50 };
    S.confAtual = { itens: { bandeiras: { 'Mastercard Débito': { conferido: 700.00, dif: 0 } } } };
    renderConferir();
  });
  semRh = await txt('#confResumo');
  check('com RH e anotação divergindo, a conta usa a do RH',
    /RH contou/.test(semRh) && /700,00/.test(semRh), semRh);
  check('e a tela avisa que os dois números não batem entre si',
    /anotou/.test(semRh) && /640,50/.test(semRh), semRh);

  // ══ 21. O botão da bandeira acende sem RH ════════════════════════════════════════
  await page.evaluate(() => {
    // 640,50 lançados contra 700,00 anotados: a loja já sabe que falta 59,50.
    S.confAtual = null; S.fech.conferencia_loja = { 'Mastercard Débito': 700.00 };
    fecharModal(); abrirModal('Mastercard Débito');
  });
  check('a bandeira que a própria loja sabe que não fecha já acende no botão',
    await page.evaluate(() => document.getElementById('btnAbrirConferir').classList.contains('alerta')));
  await page.evaluate(() => fecharModal());

  // ══ 22. A ponte: quem vê a diferença está na aba Fechar ══════════════════════════
  await page.evaluate(() => {
    document.querySelectorAll('.pane').forEach(p => p.classList.add('hidden'));
    document.getElementById('pane-fechar').classList.remove('hidden');
    document.getElementById('totalSistema').value = '';
    calcDifSistema();
  });
  check('sem total do sistema digitado, nenhuma dica na tela',
    await page.locator('#difDica').isHidden());
  // A venda registrada no app é 640,50 (120 + 300 + 70,50 + 150).
  await page.evaluate(() => { document.getElementById('totalSistema').value = '790,50'; calcDifSistema(); });
  check('com diferença, a aba Fechar ensina onde achar o erro',
    await page.locator('#difDica').isVisible()
    && /Conferir lançamentos/.test(await txt('#difDica')), await txt('#difDica'));
  await page.evaluate(() => { document.getElementById('totalSistema').value = '640,50'; calcDifSistema(); });
  check('e quando o caixa fecha certo a dica some',
    await page.locator('#difDica').isHidden());

  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
