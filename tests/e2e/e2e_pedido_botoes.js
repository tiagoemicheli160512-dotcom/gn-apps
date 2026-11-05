// "Após gerar as urgências, aparecer só o botão finalizar, pra não ter erro ou dúvidas."
//
// Os dois botões ficavam lado a lado, do mesmo tamanho, a semana inteira. Quem terminava a
// contagem toda tocava de novo em ⚡ Urgência achando que era aquilo que fechava. Os dois
// modos enviam a mesma contagem, mas só 'final' grava final_em — que é o que o painel do
// Compras lê. Resultado: a loja contava tudo e continuava listada como pendente.
//
// O rastro em gn_alertas_compras: na semana de 07/09 Bangu tocou 15× em ⚡ contra 3× em
// Finalizar; em 08/09 foram envios de 127, 143, 195, 204 e 204 itens pelo ⚡, numa lista de
// urgência de ~70 itens. Norte Shopping 4×, Caxias 3×.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 300)); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + ARQ);
  await page.waitForFunction(() => { try {
    return typeof render === 'function' && typeof _urgAplicavel === 'function' && Array.isArray(PRODUTOS_PEDIDO);
  } catch (e) { return false; } }, { timeout: 30000 });

  // Monta a aba Pedido como a loja vê. urgenciaGlobal com itens REAIS do catálogo, senão
  // _urgItensPresentes() vem vazio e a urgência simplesmente não se aplica.
  const montar = (opts) => page.evaluate((o) => {
    usuarioAtual = { nome: 'Neto', cargo: 'gerente', loja: o.loja };
    loja = o.loja; tab = 'pedido';
    urgenciaGlobal = o.semUrgencia ? [] : PRODUTOS_PEDIDO.slice(0, 12).map(p => String(p.item));
    _urgPendente = !!o.pendente;
    _envioSemana = o.envio || {};
    render();
    const btns = [...document.querySelectorAll('button')];
    const urg = btns.find(b => (b.getAttribute('onclick') || '').includes("_abrirPreviaConfirmar('urgencia')"));
    const fin = btns.find(b => /Finalizar/.test(b.textContent) && !/onclick=""/.test(b.outerHTML));
    // A faixa fixa do topo: é dela que o Finalizar saiu. Medir só "existe" deixaria passar
    // a volta dele pro lado do ⚡, que é o defeito que levou as três lojas a fechar a
    // semana com um quarto do catálogo (ver e2e_urgencia_finalizar).
    const topo = urg ? urg.closest('div[style*="sticky"]') : document.querySelector('div[style*="sticky"][style*="z-index:29"]');
    const y = el => { if (!el) return null; const r = el.getBoundingClientRect();
      return r.height ? Math.round(r.top + r.height / 2 + window.scrollY) : null; };
    return {
      temUrgencia: !!urg,
      temFinalizar: !!fin,
      finalizarNoTopo: !!(fin && topo && topo.contains(fin)),
      distancia: (urg && fin) ? Math.abs(y(fin) - y(urg)) : null,
      aplicavel: _urgAplicavel(),
    };
  }, opts);

  // ── Fase 1: urgência ainda não enviada ──────────────────────────────────────
  const fase1 = await montar({ loja: 'BANGU', pendente: true, envio: {} });
  check('urgência pendente: o botão ⚡ está na tela', fase1.temUrgencia, JSON.stringify(fase1));
  // Antes esta linha cobrava o contrário: que o Finalizar aparecesse ali, travado e com
  // cadeado. Era esse botão — mesmo travado, mesmo tamanho, ao lado do ⚡ — que convidava o
  // toque, e na semana de 02/11 três lojas fecharam a semana em menos de um minuto por
  // causa dele. Agora ele simplesmente não existe enquanto a urgência não sai.
  check('e o Finalizar não está na tela — não dá pra tocar no que não existe',
    !fase1.temFinalizar, JSON.stringify(fase1));

  // ── Fase 2: urgência enviada — é a mudança pedida ───────────────────────────
  const fase2 = await montar({ loja: 'BANGU', pendente: false,
    envio: { urgencia_em: '2026-10-19T09:42:00Z', urgencia_por: 'Neto', urgencia_itens: 66 } });
  check('urgência enviada: o botão ⚡ SAI da tela', !fase2.temUrgencia, JSON.stringify(fase2));
  check('sobra só o Finalizar', fase2.temFinalizar, JSON.stringify(fase2));
  // E ele NÃO herda a faixa do topo: antes ocupava a linha inteira onde o ⚡ estava, e o
  // toque seguinte, no mesmo ponto da tela, finalizava a semana.
  check('e ele não ocupa a faixa fixa do topo, onde o ⚡ estava',
    !fase2.finalizarNoTopo, JSON.stringify(fase2));

  // ── Fase 3: já finalizado — continua sem o ⚡ ────────────────────────────────
  const fase3 = await montar({ loja: 'BANGU', pendente: false,
    envio: { urgencia_em: '2026-10-19T09:42:00Z', final_em: '2026-10-19T16:10:00Z', final_por: 'Neto' } });
  // Finalizado é o fim da linha: nem o ⚡ nem o Finalizar. Quem fechou sem querer tem o
  // botão de reabrir, com senha mestre, dentro da faixa verde (ver e2e_urgencia_finalizar).
  check('depois de finalizar, o ⚡ segue fora e não há o que finalizar de novo',
    !fase3.temUrgencia && !fase3.temFinalizar, JSON.stringify(fase3));

  // ── Fase 4: sem resposta do servidor ────────────────────────────────────────
  // _checarUrgenciaPendencia deixa _envioSemana como estava quando a rede falha. Esconder o
  // ⚡ por FALTA de dado seria tirar da loja o único caminho que ela ainda tem.
  const fase4 = await montar({ loja: 'BANGU', pendente: false, envio: {} });
  check('sem saber se a urgência saiu, o ⚡ continua disponível',
    fase4.temUrgencia && fase4.temFinalizar, JSON.stringify(fase4));

  // ── Fase 5: loja sem item de urgência marcado ───────────────────────────────
  const fase5 = await montar({ loja: 'BANGU', pendente: false, semUrgencia: true,
    envio: { urgencia_em: '2026-10-19T09:42:00Z' } });
  check('loja sem urgência marcada não é afetada', fase5.temUrgencia && !fase5.aplicavel, JSON.stringify(fase5));

  // ── Fase 6: Maglia ──────────────────────────────────────────────────────────
  // A Maglia está fora do fluxo de urgência (_urgAplicavel) e não foi citada no pedido —
  // a tela dela não muda.
  // A chave real da loja é MAIÚSCULA ('MAGLIA'), e as guardas deste arquivo comparam com
  // 'Maglia' — ou seja, _urgAplicavel() devolve TRUE pra ela hoje, ao contrário do que o
  // próprio comentário do código diz. Por isso a exclusão aqui não pode depender dela.
  const fase6 = await montar({ loja: 'MAGLIA', pendente: false,
    envio: { urgencia_em: '2026-10-19T09:42:00Z' } });
  check('a Maglia continua com os dois botões, como antes',
    fase6.temUrgencia && fase6.temFinalizar, JSON.stringify(fase6));
  check('e isso vale mesmo com _urgAplicavel() devolvendo true pra ela (guarda antiga furada)',
    fase6.aplicavel === true, 'aplicavel=' + fase6.aplicavel);

  check('nenhum erro de JS ao montar a aba', erros.length === 0, erros.join(' | '));

  await ctx.close(); await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
