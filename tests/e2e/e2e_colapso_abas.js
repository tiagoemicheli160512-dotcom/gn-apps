// "Quando seleciona Insumos e Utensílios, ao subir fica inteiro o painel navegável pra
//  clicar, aí dificulta pra digitar. Fazer subir e ficar só a aba com o nome de onde está,
//  como é nos outros."
//
// O recolhimento já existia e o comentário do próprio CSS diz a intenção: "some a grade
// inteira de botões assim que a página rola pra baixo, sobra só essa faixa fina com a aba
// ativa, pra não tomar tanto espaço enquanto se preenche o formulário".
//
// O que impedia era a guarda anti-tremor: ela RECUSAVA colapsar quando sobraria pouca
// rolagem depois de encolher o cabeçalho — e isso acontece justamente nas abas CURTAS, que
// é onde a grade mais atrapalha. Medido antes da correção: Insumos com 1 item dava margem
// de -254px, barrado sempre.
//
// Agora o documento mantém a mesma altura nos dois estados (o espaço da grade vira padding
// no fim, medido), então não há repuxo pro topo nem tremor, e a recusa saiu.
//
// Só isso não bastava: Insumos com UM item (a tela do print) mede 860px numa tela de 844 —
// 16px de rolagem, menos que o gatilho de 24px. Não há rolagem pra disparar o recolhimento.
// Então focar um campo da aba também recolhe, que é o momento do pedido ("dificulta pra
// digitar"). Campo de modal sobreposto não conta.
//
// O teste rola com a RODA DO MOUSE, como o dedo faria — `window.scrollTo` não reproduz o
// mesmo caminho e foi o que fez uma sonda anterior medir scrollY = 0 o tempo todo.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + CHK);
    try {
      await page.waitForFunction(() => { try {
        return typeof switchTab === 'function' && typeof _updateTabsCollapse === 'function'
            && typeof CARNES_DEF !== 'undefined';
      } catch (e) { return false; } }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('o Check-list não carregou'); }
  }

  // Monta a aba com n itens e volta pro topo.
  const abrir = (aba, n) => page.evaluate(async ([aba, n]) => {
    hideLogin();
    usuarioLogado = { id: 1, nome: 'T', cargo: 'gerente', loja: 'BANGU' };
    autoSave = () => {}; _debouncedSaveAll = () => {}; showToast = () => {};
    state.faltas = []; state.manutencao = [];
    for (let i = 0; i < n; i++) {
      if (aba === 'faltas') state.faltas.push({ id: Date.now() + i, insumo: 'Brahma zero lata', qtd: '', urgencia: 'Alta', fotoBase64: '' });
      else state.manutencao.push({ id: Date.now() + i, tipo: aba === 'utensilios' ? 'Utensílio / Louça' : 'Estrutura',
        situacao: 'Quebrou', qtd: '', descricao: 'Copo ' + i, setor: 'Salão', status: 'Pendente',
        prioridade: 'Normal', confirmado_loja: false });
    }
    switchTab(aba, document.querySelector(`[data-sidebar-tab="${aba}"]`));
    // switchTab só desenha Utensílios; Insumos e Manutenção são desenhados por outro
    // caminho no app real. Sem chamar o render aqui, a lista fica vazia, a página mede
    // exatamente a altura da tela, não rola — e o teste "descobre" que o recolhimento não
    // funciona em lugar nenhum. Foi o que a primeira rodada fez.
    if (aba === 'faltas' && typeof renderFaltas === 'function') renderFaltas();
    if (aba === 'manutencao' && typeof renderManutencao === 'function') renderManutencao();
    window.scrollTo(0, 0);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { alturaInicial: document.documentElement.scrollHeight,
             gradeVisivel: !document.body.classList.contains('tabs-collapsed') };
  }, [aba, n]);

  const estado = () => page.evaluate(() => ({
    colapsado: document.body.classList.contains('tabs-collapsed'),
    gradeNaTela: (() => { const w = document.querySelector('.tabs-wrap');
      return !!w && w.offsetHeight > 0 && getComputedStyle(w).display !== 'none'; })(),
    faixaNaTela: (() => { const b = document.getElementById('tabsCollapsedBar');
      return !!b && getComputedStyle(b).display !== 'none'; })(),
    rotulo: ((document.getElementById('tabsCollapsedLabel') || {}).textContent || '').trim(),
    scrollY: Math.round(window.scrollY),
    altura: document.documentElement.scrollHeight,
    padding: document.body.style.paddingBottom || '',
  }));

  const rolar = async (px) => {
    await page.mouse.move(195, 500);
    await page.mouse.wheel(0, px);
    await page.waitForTimeout(220);
  };

  for (const [aba, n, nome] of [['faltas', 1, 'Insumos com 1 item (a tela do print)'],
                                ['utensilios', 1, 'Utensílios com 1 item'],
                                ['faltas', 6, 'Insumos com 6 itens'],
                                ['manutencao', 6, 'Manutenção com 6 itens (já funcionava)']]) {
    const ini = await abrir(aba, n);
    // O gatilho de rolagem é scrollY > 24, então uma página que só rola 16px (Insumos com um
    // item: 860px numa tela de 844) está na prática na mesma situação de não rolar.
    const rola = ini.alturaInicial - 844 > 24;
    console.log(`\n── ${nome}  [página ${ini.alturaInicial}px / tela 844px → ${rola ? 'rola' : 'rolagem inútil: ' + (ini.alturaInicial - 844) + 'px'}]`);

    // ── caminho 1: rolar com o dedo. Só vale quando a página TEM rolagem; numa aba curta
    // não existe evento de rolagem nenhum, e é pra isso que serve o caminho 2.
    if (rola) {
      const antes = await estado();
      await rolar(300);
      const depois = await estado();
      console.log(`   rolando → grade=${depois.gradeNaTela} faixa=${depois.faixaNaTela} scrollY=${depois.scrollY} altura=${depois.altura} padding=${depois.padding||'(nenhum)'} (antes scrollY=${antes.scrollY})`);
      check(`${nome}: a grade some ao rolar`, depois.gradeNaTela === false);
      check(`${nome}: e sobra a faixa com o nome da aba`,
        depois.faixaNaTela === true && depois.rotulo.length > 0);
      // O que causava o tremor: o documento encolher e o navegador repuxar pro topo.
      check(`${nome}: a altura do documento não muda (sem repuxo pro topo)`,
        depois.altura === ini.alturaInicial);
      check(`${nome}: a rolagem ficou onde o dedo deixou`, depois.scrollY > 24);

      // Voltar ao topo reabre a grade e devolve a página ao estado original.
      await rolar(-600);
      const voltou = await estado();
      check(`${nome}: voltando ao topo a grade reabre`,
        voltou.gradeNaTela === true && voltou.faixaNaTela === false);
      check(`${nome}: e o padding de compensação sai junto (sem vão morto)`, voltou.padding === '');
    } else {
      console.log('   (sem rolagem possível — só o caminho do foco se aplica)');
    }

    // ── caminho 2: tocar num campo pra digitar. É o momento exato do pedido.
    await abrir(aba, n);
    const campo = await page.evaluate(() => {
      const painel = document.querySelector('.tab-content.active');
      const el = painel && painel.querySelector('input:not([type=hidden]), select, textarea');
      if (!el) return null;
      el.focus();
      return { tag: el.tagName.toLowerCase(), tipo: el.type || '' };
    });
    await page.waitForTimeout(120);
    const aoDigitar = await estado();
    console.log(`   foco no ${campo ? campo.tag + (campo.tipo ? '[' + campo.tipo + ']' : '') : '(nenhum campo!)'} → grade=${aoDigitar.gradeNaTela} faixa=${aoDigitar.faixaNaTela} altura=${aoDigitar.altura} padding=${aoDigitar.padding||'(nenhum)'}`);
    check(`${nome}: a aba tem campo pra digitar`, !!campo);
    check(`${nome}: focar o campo recolhe a grade`, aoDigitar.gradeNaTela === false);
    check(`${nome}: e sobra a faixa com o nome da aba`,
      aoDigitar.faixaNaTela === true && aoDigitar.rotulo.length > 0);
    check(`${nome}: a altura do documento não muda ao focar`,
      aoDigitar.altura === ini.alturaInicial);
  }

  // Campo de modal (sobreposto) não mexe na grade da página por baixo.
  await abrir('faltas', 1);
  const comModal = await page.evaluate(async () => {
    const painel = document.querySelector('.tab-content.active');
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:#000;z-index:9999';
    ov.innerHTML = '<input id="campoModal">';
    painel.appendChild(ov); // dentro do .tab-content de propósito: o que vale é ser fixed
    document.getElementById('campoModal').focus();
    await new Promise(r => requestAnimationFrame(r));
    const recolheu = document.body.classList.contains('tabs-collapsed');
    // Tirar o overlay é parte do teste: deixá-lo na aba fazia o "último campo de Insumos"
    // virar o campo do modal nos casos seguintes, e eles acusavam falha de mentira.
    ov.remove();
    document.activeElement && document.activeElement.blur();
    return recolheu;
  });
  check('campo dentro de modal sobreposto não recolhe a grade', comModal === false);

  // ── O tremor ────────────────────────────────────────────────────────────────────────
  // Relato depois da primeira correção: "o insumos ainda está com problema, agora nem sobe
  // mais ao selecionar, fica só tremendo". Recolher sobe o conteúdo ~254px, o navegador rola
  // o campo focado de volta pra dentro da tela, a rolagem cai pra perto de zero e o handler
  // de rolagem REABRIA a grade — que empurra tudo pra baixo, que faz o navegador rolar de
  // novo. Medido em Insumos com 2 itens numa tela de 844: recolhia e reabria no mesmo
  // instante, terminando ABERTO.
  //
  // A faixa de risco é quando a página rola COM a grade e não rola mais SEM ela, então o
  // teste varre tamanhos de conteúdo E de tela (400px é o que sobra com o teclado aberto).
  for (const [aba, n, tela] of [['faltas', 1, 844], ['faltas', 2, 844], ['faltas', 3, 844],
                                ['faltas', 1, 400], ['faltas', 2, 400], ['faltas', 3, 400],
                                ['utensilios', 1, 400], ['utensilios', 2, 400]]) {
    await page.setViewportSize({ width: 390, height: tela });
    await abrir(aba, n);
    const r = await page.evaluate(async () => {
      let trocas = 0;
      const obs = new MutationObserver(ms => { for (const m of ms) if (m.attributeName === 'class') trocas++; });
      obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      const campos = document.querySelectorAll('.tab-content.active input:not([type=hidden]), .tab-content.active select, .tab-content.active textarea');
      const campo = campos[campos.length - 1]; // o mais baixo: obriga o navegador a rolar
      if (campo) campo.focus();
      await new Promise(r => setTimeout(r, 1200));
      obs.disconnect();
      return { trocas, colapsado: document.body.classList.contains('tabs-collapsed'),
               focoAindaNoCampo: document.activeElement === campo,
               qualCampo: campo ? campo.tagName.toLowerCase() + '[' + (campo.type || '') + ']' : '(nenhum)' };
    });
    const nome = `${aba} ${n} item(ns), tela ${tela}px`;
    console.log(`   [${nome}] trocas=${r.trocas} colapsado=${r.colapsado} focoNoCampo=${r.focoAindaNoCampo} campo=${r.qualCampo}`);
    check(`${nome}: recolhe UMA vez só (sem tremor)`, r.trocas === 1);
    check(`${nome}: e fica recolhido enquanto se digita`, r.colapsado === true);
    check(`${nome}: o campo não perde o foco no caminho`, r.focoAindaNoCampo === true);
  }
  await page.setViewportSize({ width: 390, height: 844 });

  // Sair do campo com a página no topo devolve a grade — fica como era antes de digitar.
  await abrir('faltas', 1);
  const aoSair = await page.evaluate(async () => {
    const campo = document.querySelector('.tab-content.active input:not([type=hidden])');
    campo.focus();
    await new Promise(r => setTimeout(r, 200));
    const durante = document.body.classList.contains('tabs-collapsed');
    campo.blur();
    await new Promise(r => setTimeout(r, 400));
    return { durante, depois: document.body.classList.contains('tabs-collapsed'),
             padding: document.body.style.paddingBottom || '' };
  });
  check('digitando: recolhido', aoSair.durante === true);
  check('ao sair do campo no topo: a grade volta', aoSair.depois === false);
  check('e o padding de compensação sai junto', aoSair.padding === '');

  // Tocar na faixa reabre a grade na hora — é a saída de quem quer trocar de aba.
  await abrir('faltas', 1);
  await rolar(300);
  const reabriu = await page.evaluate(async () => {
    expandTabsBar();
    await new Promise(r => requestAnimationFrame(r));
    const w = document.querySelector('.tabs-wrap');
    return { grade: !!w && getComputedStyle(w).display !== 'none',
             padding: document.body.style.paddingBottom || '' };
  });
  check('tocar na faixa reabre a grade na hora', reabriu.grade === true);
  check('e também limpa o padding', reabriu.padding === '');

  await ctx.close();
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
