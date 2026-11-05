// Luiz (estoquista, Norte Shopping), na caixa de sugestões:
//   "Mercadoria prevista chegar por uma empresa e chega em outra, não consigo dar baixa no
//    app. Necessário lançar número de nota fiscal que às vezes vem mercadoria sem nota, não
//    tem como confirmar recebimento já que o app pede número de nota para poder confirmar."
//
// Eram dois travamentos no mesmo modal. A nota era obrigatória e a exigência reafirmada no
// último ponto antes de gravar — mercadoria sem nota não entrava de jeito nenhum, e o
// estoquista ficava com a mercadoria na mão e nada no app. E não havia onde dizer que quem
// entregou foi outra empresa, então a nota de uma era lançada debaixo do nome da outra.
//
// Decisão do dono: a loja DECLARA "chegou sem nota" com motivo; o recebimento entra igual e
// fica marcado como pendente de documento. O controle continua — nada entra em silêncio.
//
// O teste roda o fluxo de verdade (modal → salvar → confirmar → fila → insert) e olha o que
// chegaria ao banco, interceptando a chamada em vez de ler o HTML.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + LOJAS);
    try {
      await page.waitForFunction(() => { try {
        return typeof abrirModalNotaEntrega === 'function' && typeof confirmarEntrega === 'function'
            && typeof _epNotaGet === 'function' && typeof EP_SEM_NOTA_MOTIVOS !== 'undefined';
      } catch (e) { return false; } }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('o app Lojas não carregou (ou falta o código novo)'); }
  }

  // Cenário: uma provisão de FRIGORIFICO ALFA aguardando recebimento na Pedreira.
  const preparar = () => page.evaluate(() => {
    loja = 'PEDREIRA';
    usuarioAtual = { nome: 'Luiz', cargo: 'estoquista' };
    provisoesEntrega = [{
      id: 'prov-1', fornecedor: 'FRIGORIFICO ALFA', catalogo_id: 'cat-1',
      qtd_prevista: 10, valor_previsto: 500, status: 'AGUARDANDO',
      gn_catalogo: { produto: 'Carne de Sol', und: 'kg' },
    }];
    _epNotaPorForn = {};
    _epFilaPendente = {};
    _epConfirmadosSessao = {};
    window.__gravado = [];
    // Intercepta no ponto onde o dado iria pro banco — é o que importa, não o HTML.
    sbRequest = async (rota, opt) => {
      const corpo = opt && opt.body ? JSON.parse(opt.body) : null;
      window.__gravado.push({ rota, metodo: (opt && opt.method) || 'GET', corpo });
      if (/^gn_provisoes\?id=eq/.test(rota)) return [{ id: 'prov-1' }];   // claim aceito
      return [];
    };
    _epFilaSalvar = () => {};
    render = () => {};
    showToast = () => {};
    _lancarCarneEntregaNoChecklist = () => {};
    confirm = () => true;                 // o "tem certeza" é checado à parte, pelo texto
    // Campos de qtd/valor que a tela normalmente desenha
    ['ep_qtd_prov-1', 'ep_val_prov-1'].forEach((id, i) => {
      let el = document.getElementById(id);
      if (!el) { el = document.createElement('input'); el.id = id; document.body.appendChild(el); }
      el.value = i === 0 ? '10' : '500';
    });
    return true;
  });

  const recebimentoGravado = () => page.evaluate(() =>
    (window.__gravado.find(g => g.rota === 'gn_recebimentos') || {}).corpo || null);

  // ── 1. O caminho normal não pode ter mudado ─────────────────────────────────────────
  await preparar();
  const normal = await page.evaluate(async () => {
    abrirModalNotaEntrega('prov-1');
    document.getElementById('notaEntregaNumero').value = '123456';
    document.getElementById('notaEntregaValor').value = '500';
    _salvarNotaEntrega();
    await new Promise(r => setTimeout(r, 50));
    await _epProcessarFila();
    return { nota: _epNotaGet('FRIGORIFICO ALFA'), modalAberto: !!document.getElementById('modalNotaEntrega') };
  });
  const g1 = await recebimentoGravado();
  check('com nota: grava número e valor como antes',
    g1 && g1.nota_numero === '123456' && Number(g1.nota_valor) === 500);
  check('e sem observação nenhuma (não inventa texto onde não há caso)',
    g1 && g1.observacao === null);
  check('a quantidade conferida continua indo pro banco', g1 && Number(g1.qtd_recebida) === 10);
  check('o modal fecha ao salvar', normal.modalAberto === false);

  // ── 2. Chegou sem nota: o travamento do Luiz ────────────────────────────────────────
  await preparar();
  const semNota = await page.evaluate(async () => {
    abrirModalNotaEntrega('prov-1');
    const antes = { camposVisiveis: document.getElementById('notaEntregaCampos').style.display !== 'none',
                    motivoVisivel: document.getElementById('notaEntregaMotivoBox').style.display !== 'none' };
    document.getElementById('notaEntregaSemNota').checked = true;
    _epNotaToggleSemNota();
    const depois = { camposVisiveis: document.getElementById('notaEntregaCampos').style.display !== 'none',
                     motivoVisivel: document.getElementById('notaEntregaMotivoBox').style.display !== 'none' };
    // Tenta salvar SEM escolher motivo — tem que barrar.
    _salvarNotaEntrega();
    const erroSemMotivo = document.getElementById('notaEntregaErro').textContent;
    const aindaAberto = !!document.getElementById('modalNotaEntrega');
    // Agora com motivo.
    document.getElementById('notaEntregaMotivo').value = EP_SEM_NOTA_MOTIVOS[0];
    _salvarNotaEntrega();
    await new Promise(r => setTimeout(r, 50));
    await _epProcessarFila();
    return { antes, depois, erroSemMotivo, aindaAberto, nota: _epNotaGet('FRIGORIFICO ALFA') };
  });
  check('marcar "sem nota" esconde os campos da nota e pede o motivo',
    semNota.antes.camposVisiveis === true && semNota.antes.motivoVisivel === false &&
    semNota.depois.camposVisiveis === false && semNota.depois.motivoVisivel === true);
  check('sem escolher o motivo, não deixa salvar',
    /motivo/i.test(semNota.erroSemMotivo) && semNota.aindaAberto === true);
  const g2 = await recebimentoGravado();
  check('com motivo, o recebimento É GRAVADO (era isso que travava)', g2 !== null);
  check('a quantidade conferida entra no estoque igual',
    g2 && Number(g2.qtd_recebida) === 10 && Number(g2.valor_recebido) === 500);
  check('não inventa número nem valor de nota', g2 && g2.nota_numero === null && g2.nota_valor === null);
  check('e fica marcado com o motivo, pra Compras cobrar o documento',
    g2 && g2.observacao === 'SEM NOTA: ' + 'Nota vem depois (fornecedor vai mandar)');

  // ── 3. Entregou outra empresa ───────────────────────────────────────────────────────
  await preparar();
  await page.evaluate(async () => {
    abrirModalNotaEntrega('prov-1');
    document.getElementById('notaEntregaNumero').value = '999';
    document.getElementById('notaEntregaValor').value = '500';
    document.getElementById('notaEntregaEntregou').value = 'DISTRIBUIDORA BETA';
    _salvarNotaEntrega();
    await new Promise(r => setTimeout(r, 50));
    await _epProcessarFila();
  });
  const g3 = await recebimentoGravado();
  check('quem entregou de fato fica registrado, junto com a nota',
    g3 && g3.nota_numero === '999' && g3.observacao === 'ENTREGUE POR: DISTRIBUIDORA BETA');

  // ── 4. Os dois casos juntos, que é o relato do Luiz inteiro ─────────────────────────
  await preparar();
  await page.evaluate(async () => {
    abrirModalNotaEntrega('prov-1');
    document.getElementById('notaEntregaSemNota').checked = true;
    _epNotaToggleSemNota();
    document.getElementById('notaEntregaMotivo').value = EP_SEM_NOTA_MOTIVOS[1];
    document.getElementById('notaEntregaEntregou').value = 'DISTRIBUIDORA BETA';
    _salvarNotaEntrega();
    await new Promise(r => setTimeout(r, 50));
    await _epProcessarFila();
  });
  const g4 = await recebimentoGravado();
  check('sem nota E de outra empresa: as duas coisas no mesmo registro',
    g4 && g4.nota_numero === null &&
    g4.observacao === 'SEM NOTA: Transferência de outra loja · ENTREGUE POR: DISTRIBUIDORA BETA');

  // ── 5. O "tem certeza" tem que dizer o que está acontecendo ─────────────────────────
  // Confirmar sem nota sem ver isso escrito é como confirmar sem saber.
  await preparar();
  const textoConfirm = await page.evaluate(async () => {
    let texto = '';
    confirm = (t) => { texto = t; return false; };     // recusa: só queremos o texto
    abrirModalNotaEntrega('prov-1');
    document.getElementById('notaEntregaSemNota').checked = true;
    _epNotaToggleSemNota();
    document.getElementById('notaEntregaMotivo').value = EP_SEM_NOTA_MOTIVOS[4];
    document.getElementById('notaEntregaEntregou').value = 'DISTRIBUIDORA BETA';
    _salvarNotaEntrega();
    await new Promise(r => setTimeout(r, 50));
    return texto;
  });
  check('o aviso de confirmação diz SEM NOTA e o motivo',
    /SEM NOTA/.test(textoConfirm) && /emerg/i.test(textoConfirm));
  check('e diz quem entregou', /Entregue por: DISTRIBUIDORA BETA/.test(textoConfirm));
  check('e não mostra "Nota: undefined" nem valor fantasma',
    !/undefined/.test(textoConfirm) && !/Nota: \s*\(/.test(textoConfirm));

  // ── 6. A declaração vale só pelo dia, como a nota ───────────────────────────────────
  // Herdar "sem nota" de ontem em silêncio seria pior que perguntar de novo: a entrega de
  // hoje passaria marcada sem ninguém ter declarado nada.
  const ontem = await page.evaluate(() => {
    _epNotaPorForn = { PEDREIRA: { 'FRIGORIFICO ALFA': { semNota: true, motivo: 'x', dia: '2020-01-01' } } };
    return _epNotaGet('FRIGORIFICO ALFA');
  });
  check('declaração de "sem nota" de outro dia não vale hoje', ontem === null);

  await ctx.close();
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
