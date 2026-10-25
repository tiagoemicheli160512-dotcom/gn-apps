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
    const grid = fin && fin.parentElement ? fin.parentElement.style.gridTemplateColumns : '';
    return {
      temUrgencia: !!urg,
      temFinalizar: !!fin,
      finalizarTravado: !!(fin && /🔒/.test(fin.textContent)),
      colunas: grid,
      aplicavel: _urgAplicavel(),
    };
  }, opts);

  // ── Fase 1: urgência ainda não enviada ──────────────────────────────────────
  const fase1 = await montar({ loja: 'BANGU', pendente: true, envio: {} });
  check('urgência pendente: o botão ⚡ está na tela', fase1.temUrgencia, JSON.stringify(fase1));
  check('e o Finalizar aparece travado, dizendo que ainda não é a hora',
    fase1.temFinalizar && fase1.finalizarTravado, JSON.stringify(fase1));

  // ── Fase 2: urgência enviada — é a mudança pedida ───────────────────────────
  const fase2 = await montar({ loja: 'BANGU', pendente: false,
    envio: { urgencia_em: '2026-10-19T09:42:00Z', urgencia_por: 'Neto', urgencia_itens: 66 } });
  check('urgência enviada: o botão ⚡ SAI da tela', !fase2.temUrgencia, JSON.stringify(fase2));
  check('sobra só o Finalizar, destravado', fase2.temFinalizar && !fase2.finalizarTravado, JSON.stringify(fase2));
  check('e ele ocupa a linha inteira, sem buraco onde era o ⚡',
    fase2.colunas === '1fr', fase2.colunas);

  // ── Fase 3: já finalizado — continua sem o ⚡ ────────────────────────────────
  const fase3 = await montar({ loja: 'BANGU', pendente: false,
    envio: { urgencia_em: '2026-10-19T09:42:00Z', final_em: '2026-10-19T16:10:00Z', final_por: 'Neto' } });
  check('depois de finalizar, o ⚡ segue fora', !fase3.temUrgencia && fase3.temFinalizar, JSON.stringify(fase3));

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
