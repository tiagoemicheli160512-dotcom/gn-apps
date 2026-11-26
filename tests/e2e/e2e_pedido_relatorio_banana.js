// ETAPA 4 (26/11/2026) — relatórios do Pedido e tipo da banana.
// "Nos relatórios de WhatsApp e PDF, mostrar o valor unitário de cada item, além do total."
// "Três opções para a descrição da banana — verde, madura, de vez — no relatório do
//  WhatsApp e no PDF." A loja escolhe o tipo no Hortifruti do app Lojas; o Pedido cola o
//  tipo ao nome do produto em todo relatório.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const PEDIDOS = process.env.ARQ_PEDIDOS || CAMINHOS.pub('gn-pedidos.html');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 600))); c ? ok++ : falhou++; };

async function abrir(browser, arq, pronto, semCdn) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 }, timezoneId: 'America/Sao_Paulo' });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-26T10:00:00');   // quinta: dia de Hortifruti
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  if (semCdn) await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
  const page = await ctx.newPage();
  page.__erros = []; page.on('pageerror', e => page.__erros.push(String(e.message)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + arq);
    try { await page.waitForFunction(pronto, null, { timeout: 25000 }); break; }
    catch (e) { if (t >= 4) throw new Error('app não carregou: ' + arq); }
  }
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const erros = [];

  // ── Pedido ──
  let { ctx, page } = await abrir(browser, PEDIDOS, () => { try { return typeof S === 'object' && typeof _buildRelatorioFornAllLojas === 'function'; } catch (e) { return false; } });
  if (!(await page.evaluate(() => typeof _relPrecoUnit === 'function' && typeof _prodComVariante === 'function'))) {
    console.log('FALHOU: preço unitário / tipo da banana não existem neste arquivo (contraprova esperada — é novo)');
    console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }
  const ped = await page.evaluate(async () => {
    _perguntarEJuntarRodadaAnterior = async () => {};
    let wpp = ''; window.open = u => { wpp = decodeURIComponent(String(u).split('text=')[1] || ''); };
    S.semanaAtiva = new Date('2026-11-23T12:00:00');
    S.pedidoAtual = { id: 'p1', status: 'ABERTO' };
    S.relLojasFiltro = [];
    S.lojas = [{ slug_pedido: 'bangu', nome_display: 'Bangu' }, { slug_pedido: 'caxias', nome_display: 'Caxias' }];
    S.catalogo = [
      { id: 'c1', ativo: true, fornecedor: 'CEASA', grupo: 'HORTIFRUTI', produto: 'Banana prata', und: 'KG', custo: 4.5 },
      { id: 'c2', ativo: true, fornecedor: 'CEASA', grupo: 'HORTIFRUTI', produto: 'Tomate', und: 'KG', custo: 6 },
      { id: 'c3', ativo: true, fornecedor: 'CEASA', grupo: 'HORTIFRUTI', produto: 'Alho', und: 'CX', custo: 0 },
    ];
    S.pedidoItens = {
      c1: { bangu: { qtd: 18, variante: 'MADURA' }, caxias: { qtd: 10, variante: 'DE_VEZ' } },
      c2: { bangu: { qtd: 5 } },
      c3: { bangu: { qtd: 2 } },
    };
    await gerarWppFornAllLojas('CEASA');
    const pdf = await _relatorioFornAllLojasMsgETitulo('CEASA');
    // Provisão (relatório vindo da provisão: sem custo à mão, unitário = total ÷ qtd).
    const prov = { gn_catalogo: { produto: 'Banana prata', und: 'KG' }, gn_pedido_itens: { variante: 'VERDE' }, qtd_prevista: 20, valor_previsto: '100' };
    return {
      wpp, pdf: pdf && (pdf.msg || pdf.texto || JSON.stringify(pdf)),
      provNome: _prodComVariante(prov), provNomeLista: _prodComVariante({ ...prov, gn_pedido_itens: [{ variante: 'DE_VEZ' }] }),
      provSem: _prodComVariante({ gn_catalogo: { produto: 'Tomate' }, gn_pedido_itens: { variante: null } }),
      provSub: _relPrecoUnit(20, 0, 'KG', 100), semValor: _relPrecoUnit(3, 0, 'KG', 0),
    };
  });
  check('WhatsApp: cada item com unitário e total ("18 KG × R$ 4,50/KG = R$ 81,00")', /Banana prata \(madura\): 18 KG × R\$ 4,50\/KG = R\$ 81,00/.test(ped.wpp) && /Tomate: 5 KG × R\$ 6,00\/KG = R\$ 30,00/.test(ped.wpp), ped.wpp);
  check('WhatsApp: o tipo da banana vai junto do nome, por loja (madura na Bangu, de vez na Caxias)', /Bangu[\s\S]*Banana prata \(madura\)/.test(ped.wpp) && /Caxias[\s\S]*Banana prata \(de vez\): 10 KG/.test(ped.wpp), ped.wpp);
  check('item sem banana não ganha tipo; item sem custo não inventa preço', !/Tomate \(/.test(ped.wpp) && /Alho: 2 CX\n/.test(ped.wpp), ped.wpp);
  check('subtotal e total continuam lá', /Subtotal: R\$ 111,00/.test(ped.wpp) && /Total: R\$ 156,00/.test(ped.wpp), ped.wpp);
  check('PDF: mesmo texto com unitário e tipo', /Banana prata \(madura\): 18 KG × R\$ 4,50\/KG = R\$ 81,00/.test(ped.pdf) && /Banana prata \(de vez\)/.test(ped.pdf), ped.pdf);
  check('relatório da provisão: unitário = total ÷ quantidade (20 KG por R$ 100 → R$ 5,00/KG)', ped.provSub === ' × R$ 5,00/KG = R$ 100,00', ped.provSub);
  check('provisão: tipo vem do item do pedido (objeto ou lista), e nada quando não tem', ped.provNome === 'Banana prata (verde)' && ped.provNomeLista === 'Banana prata (de vez)' && ped.provSem === 'Tomate', ped);
  check('sem valor: não escreve preço', ped.semValor === '', ped.semValor);
  erros.push(...page.__erros);
  await ctx.close();

  // ── App Lojas › Hortifruti ──
  ({ ctx, page } = await abrir(browser, LOJAS, () => { try { return typeof render === 'function' && typeof enviarPedidoHortifruti === 'function'; } catch (e) { return false; } }, true));
  const lj = await page.evaluate(async () => {
    loja = 'BANGU'; usuarioAtual = { nome: 'Ana', cargo: 'gerente', loja: 'BANGU' }; abasPermitidas = null;
    hortifrutiBloqueado = false; window.confirm = () => true;
    _hortifrutiPodeEnviarHoje = () => true;
    hortifrutiCatalogo = [
      { id: 'c1', produto: 'Banana prata', und: 'KG' }, { id: 'c2', produto: 'Tomate', und: 'KG' },
    ];
    hortifrutiQtd = { c1: 18, c2: 5 }; hortifrutiVariante = {};
    let toast = ''; showToast = t => { toast = t; };
    window.__reqs = [];
    sbRequest = async (rota, opt) => { const m = (opt && opt.method) || 'GET';
      window.__reqs.push({ rota, m, b: opt && opt.body ? JSON.parse(opt.body) : null });
      if (/gn_pedidos\?regiao/.test(rota) && m === 'GET') return [{ id: 'ph' }];
      return []; };
    tab = 'hortifruti'; try { render(); } catch (e) {}
    const chips = [...document.querySelectorAll('.horti-variante')].map(x => ({ id: x.dataset.id, botoes: [...x.querySelectorAll('button')].map(b => b.textContent.trim()) }));
    await enviarPedidoHortifruti();
    const bloqueou = { toast, posts: window.__reqs.filter(r => r.m === 'POST').length };
    setHortifrutiVariante('c1', 'MADURA');
    const marcado = (document.querySelector('.horti-variante[data-id="c1"] button[onclick*="MADURA"]') || {}).style?.background || '';
    toast = ''; window.__reqs = [];
    await enviarPedidoHortifruti();
    await new Promise(r => setTimeout(r, 300));
    const post = window.__reqs.find(r => r.m === 'POST' && /gn_pedido_itens/.test(r.rota));
    return { chips, bloqueou, marcado, post, toast };
  });
  check('Hortifruti: a banana mostra os três tipos (Verde · Madura · De vez); o tomate não', lj.chips.length === 1 && lj.chips[0].id === 'c1' && lj.chips[0].botoes.join('|') === 'Verde|Madura|De vez', lj.chips);
  check('sem escolher o tipo da banana, não envia (e avisa)', /tipo da banana/.test(lj.bloqueou.toast) && lj.bloqueou.posts === 0, lj.bloqueou);
  check('tipo escolhido fica marcado', /5, 150, 105|#059669/.test(lj.marcado), lj.marcado);
  const itens = (lj.post && lj.post.b) || [];
  const ban = itens.find(i => i.catalogo_id === 'c1'), tom = itens.find(i => i.catalogo_id === 'c2');
  check('envio grava o tipo no item da banana (MADURA) e nada no tomate', ban && ban.variante === 'MADURA' && ban.qtd_pedida === 18 && tom && tom.variante === null, lj.post);
  erros.push(...page.__erros);
  await ctx.close();

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
