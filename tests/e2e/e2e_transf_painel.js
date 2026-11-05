// "Quero colocar esse relatório junto com os cancelamentos no app Home painel de gestão,
//  igual temos dos cancelamentos. E quero pedir pra verificar: quando eles colocam a
//  descrição manual não tem como ver na aba de cancelamento, tem que ir no app Caixa,
//  reabrir e ver o que foi escrito. Podemos ver a possibilidade de poder ver nos
//  cancelamentos do painel de gestão mesmo."
//
// Dois pedidos, duas coisas que esta suíte cobra:
//  1. As transferências aparecem na MESMA aba, com mesa de origem/destino, motivo, quem
//     autorizou e a foto da comanda — e as lojas que não tiveram nenhuma, com quem assinou.
//  2. O motivo escrito à mão fica LEGÍVEL na tela: nada de corte com "…" que obrigue a
//     abrir o app Caixa pra ler o que a loja escreveu.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => {
  console.log((c ? 'OK: ' : 'FALHOU: ') + n);
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 320));
  c ? ok++ : falhou++;
};

const MOTIVO_LONGO = 'Desistiu por conta que não tinha mais o acompanhamento que ele queria e já estava esperando havia mais de quarenta minutos';

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
        try { return typeof _buildCancelPanel === 'function' && typeof _transfMacroDados === 'function'
          && typeof _raioxMapearTransf === 'function'; } catch (e) { return false; }
      }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }

  const semear = (cancel, transf, declC, declT) => page.evaluate(({ cancel, transf, declC, declT }) => {
    _dashCancelPer = cancel; _dashDeclPer = declC || {};
    _dashTransfPer = transf; _dashDeclTransfPer = declT || {};
    _dashPer = 'sem'; _dashWoff = 0;
    return { painel: _buildCancelPanel(), wpp: _cancelRelatorioTexto(true).msg,
             pdf: _cancelRelatorioTexto(false).msg, dados: _transfMacroDados() };
  }, { cancel, transf, declC, declT });

  const r = await semear(
    { 'CAMPO GRANDE': [{ data: '2026-10-22', valor: 399.90, motivo: MOTIVO_LONGO, motivo_categoria: 'Cliente desistiu', autor: 'Israel', foto: 'https://sb/c1.jpg' }] },
    {
      BANGU: [
        { data: '2026-10-22', origem: '12', destino: '14', motivo: 'cliente mudou de mesa com o consumo', autor: 'Carol', foto: 'https://sb/t1.jpg' },
        { data: '2026-10-21', origem: '3',  destino: '5',  motivo: 'juntaram as duas mesas na mesma conta', autor: 'Carol', foto: null },
      ],
      CAXIAS: [
        { data: '2026-10-22', origem: '7', destino: '9', motivo: 'casal trocou pra mesa da janela', autor: 'Jandy', foto: 'https://sb/t2.jpg' },
      ],
    },
    {},
    {
      GUARULHOS: { caixas: 4, declarados: 4, abertos: 0, responsaveis: ['Rafael'],
        datasOk: ['19','20','21','22'].map(d => ({ data: '2026-10-' + d, turno: 'NOITE', por: 'Rafael' })), datasFalta: [] },
      ITAQUERA: { caixas: 2, declarados: 0, abertos: 0, responsaveis: [], datasOk: [],
        datasFalta: [{ data: '2026-10-21', turno: 'NOITE' }, { data: '2026-10-22', turno: 'NOITE' }] },
    });

  // ── 1. O relatório de transferências está na mesma aba ──────────────────────────────
  check('a aba traz uma seção de transferências de mesa', /TRANSFERÊNCIAS DE MESA|Transferências de mesa/i.test(r.painel));
  check('conta as transferências da rede, não de uma loja', r.dados.qtd === 3, JSON.stringify(r.dados.qtd));
  check('e as lojas que tiveram', r.dados.lojas.length === 2 && r.dados.lojas[0].nome === 'Bangu',
    r.dados.lojas.map(l => l.nome + ':' + l.itens.length).join(','));
  check('mostra mesa de origem e destino', /Mesa 12 → mesa 14/.test(r.painel), r.painel.slice(r.painel.indexOf('Transferências'), 1400));
  check('mostra o motivo', /cliente mudou de mesa com o consumo/.test(r.painel));
  check('mostra quem autorizou e o dia', /22\/10 · autorizado por Carol/.test(r.painel));
  check('mostra a foto da comanda', /https:\/\/sb\/t1\.jpg/.test(r.painel));
  check('e a que não tem foto aparece como "sem foto", não sumida',
    r.dados.semFoto === 1 && /sem<br>foto/.test(r.painel), 'semFoto=' + r.dados.semFoto);

  // ── 2. Lojas sem transferência: quem assinou e quem não respondeu ───────────────────
  check('lista as lojas sem transferência no período', /Sem transferência · \d+ loja/.test(r.painel));
  check('e nomeia quem confirmou que não houve', /Confirmado por <b[^>]*>Rafael<\/b>/.test(r.painel),
    r.painel.slice(r.painel.indexOf('Sem transferência'), r.painel.indexOf('Sem transferência') + 700));
  check('e cobra a loja que fechou sem ninguém confirmar',
    /sem ninguém confirmar que não houve transferência/.test(r.painel));
  const semT = r.dados.semTransf.map(l => l.k + ':' + l.estado);
  check('quem não respondeu vem antes de quem respondeu',
    semT.indexOf('ITAQUERA:sem_info') < semT.indexOf('GUARULHOS:declarado'), semT.join(','));

  // ── 3. O motivo escrito à mão fica legível (o pedido do print) ──────────────────────
  const recorte = page.evaluate((m) => {
    _dashCancelPer = { 'CAMPO GRANDE': [{ data: '2026-10-22', valor: 399.9, motivo: m, motivo_categoria: 'Cliente desistiu', autor: 'Israel', foto: 'https://sb/c1.jpg' }] };
    _dashDeclPer = {}; _dashTransfPer = {}; _dashDeclTransfPer = {};
    const host = document.createElement('div');
    host.style.cssText = 'width:390px';
    host.innerHTML = _buildCancelPanel();
    document.body.appendChild(host);
    const el = [...host.querySelectorAll('div')].find(d => d.textContent.trim() === m);
    const cs = el ? getComputedStyle(el) : null;
    const r2 = { achou: !!el, whiteSpace: cs && cs.whiteSpace, textOverflow: cs && cs.textOverflow,
                 alturaLinhas: el ? Math.round(el.getBoundingClientRect().height / parseFloat(cs.lineHeight)) : 0,
                 cortado: el ? el.scrollWidth > el.clientWidth + 1 : null };
    host.remove();
    return r2;
  }, MOTIVO_LONGO);
  const leg = await recorte;
  check('o motivo longo do cancelamento está inteiro no HTML', /já estava esperando havia mais de quarenta minutos/.test(r.painel));
  check('e a linha dele quebra em vez de ser cortada', leg.achou && leg.whiteSpace !== 'nowrap', JSON.stringify(leg));
  check('ocupa mais de uma linha na tela de 390px (ou seja: dá pra ler tudo)',
    leg.alturaLinhas >= 2, JSON.stringify(leg));
  check('e nada fica escondido pra fora da caixa', leg.cortado === false, JSON.stringify(leg));

  // ── 4. O relatório exportado leva as duas coisas ────────────────────────────────────
  check('o WhatsApp leva as transferências junto', /TRANSFERÊNCIAS DE MESA/.test(r.wpp), r.wpp.slice(-700));
  check('com mesa, motivo, quem autorizou e o dia',
    /Mesa 12 → 14 — cliente mudou de mesa com o consumo · Carol · 22\/10/.test(r.wpp), r.wpp.slice(-700));
  check('marca a que está sem foto', /· sem foto/.test(r.wpp));
  check('e diz quem confirmou que não houve, e quem não respondeu',
    /confirmado por Rafael/.test(r.wpp) && /Fechou sem ninguém confirmar \(transferência\)/.test(r.wpp), r.wpp.slice(-800));
  check('o PDF leva o mesmo conteúdo', /TRANSFERÊNCIAS DE MESA/.test(r.pdf) && /Mesa 7 → 9/.test(r.pdf));
  check('o motivo longo do cancelamento vai inteiro no relatório também',
    r.wpp.includes('quarenta minutos'), r.wpp.slice(0, 500));

  // ── 5. Sem nenhuma transferência, a seção diz isso em vez de sumir ──────────────────
  const r2 = await semear({}, {}, {}, {
    BANGU: { caixas: 3, declarados: 3, abertos: 0, responsaveis: ['Carol'],
      datasOk: ['20','21','22'].map(d => ({ data: '2026-10-' + d, turno: 'NOITE', por: 'Carol' })), datasFalta: [] } });
  check('período sem nenhuma transferência é dito, não omitido',
    /Nenhuma transferência de mesa no período/.test(r2.painel), r2.painel.slice(-600));
  check('e o relatório diz o mesmo', /Nenhuma das \d+ lojas lançou transferência no período/.test(r2.wpp), r2.wpp.slice(-400));

  // ── 6. Escopo: Maglia fora, como no cancelamento ────────────────────────────────────
  const escopo = await page.evaluate(() => ({
    maglia: typeof gnTransferenciaLiberada === 'function' ? gnTransferenciaLiberada('MAGLIA') : null,
    nLojas: _transfMacroDados().nLojas,
    temMaglia: _transfMacroDados().semTransf.some(l => /maglia/i.test(l.k)),
  }));
  check('a Maglia fica fora da conta (não usa o controle)',
    escopo.maglia === false && escopo.temMaglia === false, JSON.stringify(escopo));
  check('e as outras 11 entram', escopo.nLojas === 11, JSON.stringify(escopo));

  // ── 7. O mapeador lê a transferência pendurada no fechamento ────────────────────────
  const mapeado = await page.evaluate(() => _raioxMapearTransf([
    { loja: 'BANGU', data: '2026-10-22', status: 'FECHADO',
      gn_caixa_transferencia: [{ mesa_origem: '1', mesa_destino: '2', motivo: 'x', autorizado_por: 'Y', foto: null }] },
    { loja: 'LOJA QUE NÃO EXISTE', data: '2026-10-22', gn_caixa_transferencia: [{ mesa_origem: '9' }] },
  ]));
  check('monta por loja a partir da linha do fechamento',
    mapeado.BANGU && mapeado.BANGU.length === 1 && mapeado.BANGU[0].origem === '1' && mapeado.BANGU[0].data === '2026-10-22',
    JSON.stringify(mapeado));
  check('e ignora loja que não está na lista da rede', Object.keys(mapeado).length === 1, JSON.stringify(Object.keys(mapeado)));

  // ── 8. A URL da foto vai pra dentro de atributo HTML ────────────────────────────────
  const xss = await semear({}, { BANGU: [{ data: '2026-10-22', origem: '1', destino: '2',
    motivo: '<img src=x onerror=alert(1)>', autor: '"><b>bold</b>', foto: 'https://sb/a.jpg" onload="alert(1)' }] }, {}, {});
  check('motivo e autor com HTML são escapados',
    !/<img src=x/.test(xss.painel) && /&lt;img src=x/.test(xss.painel), xss.painel.slice(xss.painel.indexOf('Transfer'), xss.painel.indexOf('Transfer') + 900));
  check('e a URL da foto não escapa do atributo',
    !/onload="alert/.test(xss.painel), xss.painel.slice(xss.painel.indexOf('sb/a.jpg') - 120, xss.painel.indexOf('sb/a.jpg') + 120));

  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log('\n' + HOME);
  console.log(ok + ' ok, ' + falhou + ' falhou');
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error('ERRO: ' + e.message); process.exit(2); });
