// "No sistema tem o valor que foi recebido por bandeira (...) seria importante ter o campo
//  pra colocar o valor encontrado no sistema, pra aí sim mostrar as diferenças mais fácil."
//
// Antes o app só tinha UM número do sistema (o "Total Real do Sistema"): dizia "faltam
// R$ 150" e a loja caçava em 10+ bandeiras. Agora o sistema entra bandeira a bandeira e a
// diferença já aparece apontada.
//
// Como sempre nesta tela, o que mais importa provar é que conferir NÃO mexe em dinheiro:
// o teste vigia todas as escritas e confere que nenhum total de bandeira muda.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-caixa.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 320)); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const escritas = [];
  const _fechNoServidor = { id: 'fech-1', loja: 'BANGU', data: '2026-10-20', turno: 'NOITE',
    status: 'ABERTO', suprimento_inicial: 700, conferencia_loja: null };
  await ctx.route('**/rest/v1/**', async r => {
    const req = r.request(), url = req.url(), m = req.method();
    if (m !== 'GET') escritas.push({ metodo: m, alvo: url.split('/rest/v1/')[1].split('?')[0],
                                     body: req.postData() ? JSON.parse(req.postData()) : null });
    // O app pede return=representation no PATCH do fechamento; devolver 204 aqui faria o
    // teste medir o stub, não o app.
    if (/gn_caixa_fechamento/.test(url) && m === 'PATCH') {
      const b = JSON.parse(req.postData() || '{}');
      // Como o PostgREST faz: o PATCH grava e devolve a LINHA INTEIRA, não só os campos
      // enviados. Guardar o estado aqui é o que torna o stub fiel.
      Object.assign(_fechNoServidor, b);
      return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([{ ..._fechNoServidor }]) });
    }
    if (m !== 'GET') return r.fulfill({ status: 204, body: '' });
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + ARQ);
  await page.waitForFunction(() => typeof renderConfBandeiras === 'function', { timeout: 25000 });

  const montar = () => page.evaluate(() => {
    S.user = { nome: 'Tiago', cargo: 'gerente' };
    S.loja = 'BANGU'; S.turnoSel = 'NOITE'; S.modoConsulta = false;
    S.fech = { id: 'fech-1', loja: 'BANGU', data: '2026-10-20', turno: 'NOITE', status: 'ABERTO',
               suprimento_inicial: 700, conferencia_loja: null };
    S.comprovantes = [
      { id:'a1', bandeira:'Dinheiro',           valor:200.00, criado_em:'2026-10-20T20:00:00Z', conferido_em:null },
      { id:'a2', bandeira:'Dinheiro',           valor:150.00, criado_em:'2026-10-20T21:00:00Z', conferido_em:null },
      { id:'a3', bandeira:'Mastercard Débito',  valor:640.50, criado_em:'2026-10-20T21:30:00Z', conferido_em:null },
      { id:'a4', bandeira:'Pix',                valor:100.00, criado_em:'2026-10-20T22:00:00Z', conferido_em:null },
    ];
    S.saidas = []; S.supr = []; S.notas10 = []; S.cancel = []; S.confAtual = null;
    document.getElementById('telaLogin')?.classList.add('hidden');
    document.getElementById('telaTurno')?.classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.querySelectorAll('.pane').forEach(p => p.classList.add('hidden'));
    document.getElementById('pane-fechar').classList.remove('hidden');
    document.getElementById('totalSistema').value = '';
    renderTudo(); renderFechar();
  });
  const linhas = () => page.evaluate(() =>
    [...document.querySelectorAll('#confBandeirasBox .cb-linha:not(.soma)')].map(el => ({
      nome: el.querySelector('.cb-nm').textContent.trim(),
      app: el.querySelector('.cb-app').textContent.trim(),
      sistema: el.querySelector('.cb-in').value,
      dif: el.querySelector('.cb-dif').textContent.trim(),
      ruim: el.classList.contains('ruim'),
    })));
  const txt = sel => page.evaluate(s => (document.querySelector(s)?.textContent || '').replace(/\s+/g, ' ').trim(), sel);

  await montar();

  // ══ 1. A lista existe e começa só com quem teve movimento ════════════════════════
  let ls = await linhas();
  check('a seção aparece na aba Fechar', await page.locator('#secConfBandeiras').isVisible());
  check('lista só as 3 bandeiras com movimento, não as 17',
    ls.length === 3 && ls.map(l => l.nome).sort().join('|') === 'Dinheiro|Mastercard Débito|Pix',
    ls.map(l => l.nome).join(' | '));
  check('mostra o que o app tem em cada uma',
    ls.find(l => l.nome === 'Dinheiro').app === 'R$ 350,00'
    && ls.find(l => l.nome === 'Mastercard Débito').app === 'R$ 640,50', JSON.stringify(ls));
  check('sem o valor do sistema, não inventa diferença', ls.every(l => l.dif === '—'));

  // ══ 2. Lançar o valor do sistema aponta a bandeira errada ════════════════════════
  await page.evaluate(() => { salvarEsperadoLoja('350,00', 'Dinheiro'); });
  await page.evaluate(() => { salvarEsperadoLoja('790,50', 'Mastercard Débito'); });
  await page.evaluate(() => { salvarEsperadoLoja('100,00', 'Pix'); });
  await page.waitForTimeout(300);
  ls = await linhas();
  const md = ls.find(l => l.nome === 'Mastercard Débito');
  const din = ls.find(l => l.nome === 'Dinheiro');
  check('a bandeira que bate fica marcada como certa', din.dif === '✓' && !din.ruim, JSON.stringify(din));
  check('a que não bate mostra quanto falta e fica destacada',
    /150,00/.test(md.dif) && md.ruim, JSON.stringify(md));
  check('e a tela diz quantas não batem, e onde achar o valor',
    /1 bandeira não bate/.test(await txt('#confBandeirasBox'))
    && /Conferir lançamentos/.test(await txt('#confBandeirasBox')), await txt('#confBandeirasBox'));

  // ══ 3. A linha de total soma os dois lados ═══════════════════════════════════════
  const soma = await page.evaluate(() => {
    const el = document.querySelector('#confBandeirasBox .cb-linha.soma');
    return { app: el.querySelector('.cb-app').textContent.trim(),
             sistema: el.querySelector('.cb-in-cab').textContent.trim(),
             dif: el.querySelector('.cb-dif').textContent.trim() };
  });
  check('o total soma app (1.090,50) e sistema (1.240,50), com a diferença de 150',
    soma.app === 'R$ 1.090,50' && soma.sistema === 'R$ 1.240,50' && /150,00/.test(soma.dif),
    JSON.stringify(soma));

  // ══ 4. Soma das bandeiras x Total Real do Sistema ════════════════════════════════
  check('sem total digitado, oferece usar a soma das bandeiras',
    /Usar como Total do Sistema/.test(await txt('#confBandeirasBox')));
  await page.evaluate(() => _usarSomaBandeiras());
  await page.waitForTimeout(250);
  check('o botão preenche o Total Real do Sistema com a soma',
    (await page.evaluate(() => document.getElementById('totalSistema').value)) === '1240,50');
  check('e aí a tela confirma que os dois batem',
    /soma das bandeiras bate/.test(await txt('#confBandeirasBox')), await txt('#confBandeirasBox'));

  await page.evaluate(() => { document.getElementById('totalSistema').value = '1300,00'; calcDifSistema(); });
  await page.waitForTimeout(250);
  check('total digitado diferente da soma: a tela avisa',
    /não bate com o/.test(await txt('#confBandeirasBox'))
    && /1.300,00/.test(await txt('#confBandeirasBox')), await txt('#confBandeirasBox'));

  // ══ 5. A bandeira SEM lançamento — o caso que mais interessa ═════════════════════
  check('dá pra chegar nas outras formas de recebimento',
    /mostrar as outras/.test(await txt('#confBandeirasBox')));
  await page.evaluate(() => _confToggleTodas());
  await page.waitForTimeout(200);
  check('mostrando todas, aparecem as 17', (await linhas()).length === 17);
  await page.evaluate(() => _confToggleTodas());
  await page.waitForTimeout(200);
  // O recebimento que ninguém lançou: sistema tem valor, app tem zero.
  await page.evaluate(() => salvarEsperadoLoja('300,00', 'Elo Débito'));
  await page.waitForTimeout(250);
  ls = await linhas();
  const elo = ls.find(l => l.nome === 'Elo Débito');
  check('bandeira sem nenhum lançamento aparece sozinha quando ganha valor do sistema',
    !!elo && elo.app === 'R$ 0,00' && /300,00/.test(elo.dif) && elo.ruim, JSON.stringify(elo));

  // ══ 6. Apagar volta pra "não preenchido" ═════════════════════════════════════════
  await page.evaluate(() => salvarEsperadoLoja('', 'Elo Débito'));
  await page.waitForTimeout(250);
  check('apagar o campo tira a bandeira da lista, em vez de virar zero',
    !(await linhas()).some(l => l.nome === 'Elo Débito'));

  // ══ 7. Conferir NÃO mexe em dinheiro ═════════════════════════════════════════════
  const totais = await page.evaluate(() => ENTRADAS.map(b => [b.k, totEntradaK(b.k)]));
  await page.evaluate(() => { salvarEsperadoLoja('999,99', 'Pix'); salvarEsperadoLoja('1,00', 'Dinheiro'); });
  await page.waitForTimeout(300);
  const depois = await page.evaluate(() => ENTRADAS.map(b => [b.k, totEntradaK(b.k)]));
  check('nenhum total de bandeira muda ao lançar valores do sistema',
    JSON.stringify(totais) === JSON.stringify(depois));
  check('só grava no fechamento, em nenhuma tabela de valor',
    escritas.every(e => e.alvo === 'gn_caixa_fechamento'),
    JSON.stringify(escritas.filter(e => e.alvo !== 'gn_caixa_fechamento')));
  check('e o que grava é a conferência, por bandeira', escritas.some(e =>
    e.body && e.body.conferencia_loja && e.body.conferencia_loja['Mastercard Débito'] === 790.5));

  // ══ 8. O mesmo número aparece dentro do Conferir da bandeira ════════════════════
  await page.evaluate(() => { abrirModal('Mastercard Débito'); abrirConferir(); });
  await page.waitForTimeout(200);
  const noModal = await page.evaluate(() => document.getElementById('confEsperado').value);
  check('o valor do sistema digitado no Fechar aparece dentro do Conferir', noModal === '790,50', noModal);
  check('e o modal fala em "sistema", não mais em "relatório"',
    /no sistema/i.test(await txt('#confResumo')) && !/No relatório/.test(await txt('#confResumo')),
    await txt('#confResumo'));
  await page.evaluate(() => fecharModal());

  // ══ 9. Digitação não é apagada por refresh ══════════════════════════════════════
  const preservado = await page.evaluate(() => {
    const inp = document.querySelector('#confBandeirasBox .cb-in');
    inp.focus(); inp.value = '123,45';
    renderTudo();                      // é o que refreshCaixaVivo dispara
    const agora = document.querySelector('#confBandeirasBox .cb-in');
    return agora === inp && agora.value === '123,45';
  });
  check('redesenhar com o campo em foco não apaga o que está sendo digitado', preservado);

  // ══ 10. Cabe no celular ═════════════════════════════════════════════════════════
  await page.evaluate(() => { document.activeElement.blur(); renderConfBandeiras(); });
  await page.waitForTimeout(150);
  check('a lista cabe nos 390px', await page.evaluate(() => {
    const box = document.getElementById('confBandeirasBox');
    return [...box.querySelectorAll('*')].every(e => e.getBoundingClientRect().right <= 391);
  }));

  // ══ 11. O "R$" dobrado ═══════════════════════════════════════════════════════════
  // money() já devolve "R$ 1.234,56", e cinco lugares escreviam "R$ " antes dele: a tela
  // mostrava "+ R$ R$ 150,00". Pré-existente (está em origin/main), mas é na mesma tela.
  await page.evaluate(() => {
    S.confAtual = { itens: { bandeiras: { 'Mastercard Débito': { conferido: 790.50, dif: 150 } } } };
    document.querySelectorAll('.pane').forEach(p => p.classList.add('hidden'));
    document.getElementById('pane-receb').classList.remove('hidden');
    document.getElementById('bandGrid').innerHTML = ENTRADAS.map(b =>
      `<button class="band"><span class="nm">${b.k}</span>
         <span class="tot" id="bt-${cssId(b.k)}">R$ 0,00</span></button>`).join('');
    renderTudo();
  });
  await page.waitForTimeout(200);
  const badge = await page.evaluate(() => (document.getElementById('bc-MastercardDbito') || {}).textContent || '');
  check('o badge de divergência não mostra "R$" dobrado', !!badge && !/R\$\s*R\$/.test(badge), badge);
  const semDuplo = await page.evaluate(() =>
    !/R\$\s*R\$/.test(document.body.innerText));
  check('e nenhum "R$ R$" sobra em lugar nenhum da tela',
    semDuplo, await page.evaluate(() => (document.body.innerText.match(/.{0,40}R\$\s*R\$.{0,20}/) || [''])[0]));

  // ══ 12. Nenhum número quebrado em duas linhas ═══════════════════════════════════
  // "R$ 1.510,50" partido no meio é o que torna a grade ilegível justamente na linha do
  // total, que é a que o olho procura.
  const quebrou = await page.evaluate(() =>
    [...document.querySelectorAll('#confBandeirasBox .cb-app, #confBandeirasBox .cb-dif')]
      .filter(e => e.getBoundingClientRect().height > 20)
      .map(e => e.textContent.trim() + ' h=' + Math.round(e.getBoundingClientRect().height)));
  check('nenhum valor quebra em duas linhas na grade', quebrou.length === 0, quebrou.join(' | '));

  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
