// "Na aba Check-list, nos itens com validade, não tem a opção de excluir o item depois de
//  salvar — fica só a opção de mudar a data. Se tiver item duplicado não dá pra excluir."
//
// A lixeira EXISTIA no HTML e chamava _valRemover, que funciona. O que não existia era
// poder tocar nela: o input[type=date] tem largura própria de ~260px e estava com
// flex-shrink:0, então esticava até ocupar a linha inteira (324 de 336px) e empurrava o
// botão pra FORA da tela. Medido em 360, 390 e 430px — em todos, a lixeira terminava além
// da borda direita da linha e a página ganhava rolagem lateral.
//
// Por isso este teste MEDE em vez de procurar o botão no HTML: procurar no HTML dava
// "existe" o tempo todo, inclusive na versão quebrada.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const LARGURAS = [360, 390, 430];
const NOME_LONGO = 'QUEIJO MUSSARELA FATIADO BANDEJA 2KG';

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const medidas = {};

  for (const w of LARGURAS) {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: w, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
    await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    const page = await ctx.newPage();
    let carregou = false;
    for (let t = 1; t <= 4; t++) {
      await page.goto('file://' + CHK);
      try {
        await page.waitForFunction(() => {
          try { return typeof _valLinhaItemHtml === 'function' && VALIDADE_AREAS; } catch (e) { return false; }
        }, { timeout: 15000 });
        carregou = true; break;
      } catch (e) {}
    }
    if (!carregou) { console.log('FALHOU: o Check-list não carregou em ' + w + 'px'); falhou++; await ctx.close(); continue; }

    medidas[w] = await page.evaluate(([nome]) => {
      // O host entra acima da tela de login (que fica por cima de tudo até alguém entrar),
      // senão elementFromPoint devolveria o login e nada pareceria tocável. Conferido com
      // elementsFromPoint: com o z-index abaixo, o botão é o primeiro da pilha.
      const def = VALIDADE_AREAS[0];
      const it = { id: 'x1', nome, validade: '2026-10-09' };
      const host = document.createElement('div');
      host.id = '__val_teste';
      host.style.cssText = 'padding:0 12px;position:relative;z-index:99999;background:#fff';
      host.innerHTML = _valLinhaItemHtml(def, it);
      document.body.appendChild(host);

      const linha = host.firstElementChild;
      const btn = host.querySelector('button[onclick*="_valRemover"]');
      const data = host.querySelector('input[type=date]');
      const r = {};
      if (!btn) { host.remove(); return { semBotao: true }; }
      const cx = linha.getBoundingClientRect(), bx = btn.getBoundingClientRect(), dx = data.getBoundingClientRect();
      const alvo = document.elementFromPoint(bx.left + bx.width / 2, bx.top + bx.height / 2);
      r.dentroDaLinha = bx.right <= cx.right + 0.5 && bx.left >= cx.left - 0.5;
      r.tocavel = !!alvo && (alvo === btn || btn.contains(alvo));
      r.area = Math.round(bx.width) * Math.round(bx.height);
      r.larg = Math.round(bx.width); r.alt = Math.round(bx.height);
      r.dataLarg = Math.round(dx.width);
      r.rolaLado = document.documentElement.scrollWidth > document.documentElement.clientWidth;
      r.nomeVisivel = host.textContent.includes(nome.slice(0, 20));
      host.remove();
      return r;
    }, [NOME_LONGO]);
    await ctx.close();
  }

  // ── O que o relato pedia: dá pra excluir ──────────────────────────────────────
  check('a lixeira existe em todas as larguras',
    LARGURAS.every(w => medidas[w] && !medidas[w].semBotao));
  check('e fica DENTRO da linha, não fora da tela — era o defeito',
    LARGURAS.every(w => medidas[w] && medidas[w].dentroDaLinha === true));
  check('e dá pra tocar nela de verdade (elementFromPoint acha o botão)',
    LARGURAS.every(w => medidas[w] && medidas[w].tocavel === true));
  check('sem jogar a página pra rolar de lado',
    LARGURAS.every(w => medidas[w] && medidas[w].rolaLado === false));

  // ── Sem estragar o que já funcionava ─────────────────────────────────────────
  check('o campo de data continua utilizável (não encolheu a zero)',
    LARGURAS.every(w => medidas[w] && medidas[w].dataLarg >= 120));
  check('o nome do produto continua aparecendo inteiro',
    LARGURAS.every(w => medidas[w] && medidas[w].nomeVisivel === true));
  check('o alvo do toque é grande o bastante pro dedo (≥ 30×28)',
    LARGURAS.every(w => medidas[w] && medidas[w].larg >= 30 && medidas[w].alt >= 28));

  // ── E a exclusão em si tem que funcionar ────────────────────────────────────
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  for (let t = 1; t <= 4; t++) {
    await page.goto('file://' + CHK);
    try { await page.waitForFunction(() => { try { return typeof _valRemover === 'function' && VALIDADE_AREAS; } catch (e) { return false; } }, { timeout: 15000 }); break; } catch (e) {}
  }
  const dup = await page.evaluate(async () => {
    const area = VALIDADE_AREAS[0].area;
    _valDados[area] = { carregado: true, itens: [
      { id: 'a', nome: 'PRESUNTO', validade: '2026-10-10' },
      { id: 'b', nome: 'PRESUNTO', validade: '2026-10-10' },   // o duplicado do relato
      { id: 'c', nome: 'QUEIJO',   validade: '2026-10-12' },
    ] };
    window.confirm = () => true;
    await _valRemover(area, 'b');
    const itens = _valItens(area);
    return { ids: itens.map(i => i.id).join(','), qtd: itens.length };
  });
  check('excluir o duplicado tira só ele', dup.ids === 'a,c' && dup.qtd === 2);

  const naoConfirma = await page.evaluate(async () => {
    const area = VALIDADE_AREAS[0].area;
    window.confirm = () => false;
    await _valRemover(area, 'a');
    return _valItens(area).map(i => i.id).join(',');
  });
  check('e cancelar a confirmação não apaga nada', naoConfirma === 'a,c');

  await ctx.close();
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
