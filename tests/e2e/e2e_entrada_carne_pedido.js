// Nota de carne × pedido "aguardando" no app Lojas (27/11/2026). Caso real de Bangu: a NF de
// 24 kg de camarão foi lançada nas Entradas e o pedido de 24 kg ficou "aguardando" na Entrega
// (o Painel via como atrasado). Ao lançar a nota, o app pergunta se é o pedido e leva pra
// Entrega com a quantidade da nota no campo. Nada é confirmado sozinho.
const fs = require('fs');
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 600))); c ? ok++ : falhou++; };
const PED = { id: 'prov-cam', pedido_id: 'ped-1', catalogo_id: 'c-cam', loja_slug: 'bangu', fornecedor: 'FAFS /VILLA PESCADOS', fornecedor_entregue: null, parcial_origem: null,
  data_entrega: '2026-11-24', data_entrega_fim: null, qtd_prevista: '24.000', valor_previsto: 1620, status: 'AGUARDANDO', gn_catalogo: { produto: 'Camarão Limpo Drenado 61X70', und: 'kg' }, gn_pedidos: { data_pedido: '2026-11-24' } };

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 }, timezoneId: 'America/Sao_Paulo' });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-25T10:00:00-03:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + LOJAS);
    try { await page.waitForFunction(() => { try { return typeof addEntrada === 'function' && typeof goTab === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 }); break; }
    catch (e) { if (t >= 4) throw new Error('o app Lojas não carregou'); }
  }
  if (!(await page.evaluate(() => typeof _sugerirEntregaCarne === 'function'))) {
    console.log('FALHOU: a pergunta "essa carne é de um pedido?" não existe neste arquivo (contraprova esperada — é nova)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }
  // cfg: { insumo, qtd, dataNF, cargo, abas, peds }
  const lancar = (cfg) => page.evaluate(async ({ cfg, PED }) => {
    document.getElementById('modalEntregaCarneNF')?.remove();
    _entregasVencidasAtivas = []; _notaFiscalPendenciasAtivas = []; _barrisSemPendente = false;
    loja = 'BANGU'; usuarioAtual = { nome: 'Neto', cargo: cfg.cargo || 'gerente', loja }; abasPermitidas = cfg.abas || null;
    _carnesChkCatIds = null; window.__consultas = [];
    const peds = cfg.peds || [PED];
    sbRequest = async (rota) => {
      window.__consultas.push(rota);
      if (/^gn_catalogo/.test(rota)) return [{ id: 'c-cam', item_id: 237, origem_item_id: null }, { id: 'c-pic', item_id: 392, origem_item_id: null }];
      if (/^gn_provisoes\?loja_slug=eq\.bangu&status=eq\.AGUARDANDO&catalogo_id/.test(rota)) return JSON.parse(JSON.stringify(peds));
      return [];
    };
    carregarEntregas = async () => { provisoesEntrega = JSON.parse(JSON.stringify(peds)); render(); };
    autoSave = () => {}; _atualizarTravaNotaFiscal = async () => {};
    tab = 'entradas'; try { render(); } catch (e) {}
    addEntrada(cfg.insumo, cfg.dataNF || '2026-11-23', '268978', 'FAIFS MARICULTURA LTDA', cfg.qtd || 24, 67.5);
    for (let i = 0; i < 20 && !document.getElementById('modalEntregaCarneNF'); i++) await new Promise(r => setTimeout(r, 100));
    const m = document.getElementById('modalEntregaCarneNF');
    return { modal: m ? m.innerText.replace(/\s+/g, ' ') : null, consultouPedidos: window.__consultas.some(r => /gn_provisoes/.test(r)) };
  }, { cfg, PED });

  const cam = await lancar({ insumo: 'CAMARÃO SEM CABEÇA 61/70' });
  check('nota de camarão com pedido aguardando: pergunta se é o pedido', cam.modal && /Essa carne é de um pedido\?/.test(cam.modal), cam);
  check('…mostra a nota e o pedido lado a lado (24 kg × 24 kg · 24/11 · fornecedor)', /Nota 268978: 24 kg · Pedido: 24 kg · 24\/11 · FAFS \/VILLA PESCADOS/.test(cam.modal || ''), cam.modal);
  const ir = await page.evaluate(async () => {
    document.querySelector('#modalEntregaCarneNF .ecnf-ir').click();
    for (let i = 0; i < 40 && !document.getElementById('ep_qtd_prov-cam'); i++) await new Promise(r => setTimeout(r, 100));
    await new Promise(r => setTimeout(r, 300));
    const el = document.getElementById('ep_qtd_prov-cam');
    return { tab, modal: !!document.getElementById('modalEntregaCarneNF'), qtd: el ? el.value : null, visivel: el ? el.offsetParent !== null : false,
      gravouAlgo: (window.__consultas || []).some(r => /gn_recebimentos|status=eq\.AGUARDANDO&?$/.test(r)) };
  });
  check('"É esse pedido" leva pra aba Entrega, com o pedido aberto e a quantidade da nota (24) no campo', ir.tab === 'entrega' && !ir.modal && ir.qtd === '24' && ir.visivel, ir);
  check('…e não confirma nada sozinho (nenhum recebimento gravado)', !ir.gravouAlgo, ir);

  const pic = await lancar({ insumo: 'PICANHA SUINA', peds: [Object.assign({}, PED, { catalogo_id: 'c-pic' })] });
  check('picanha SUÍNA não é a picanha controlada: sem pergunta', !pic.modal && !pic.consultouPedidos, pic);
  const outro = await lancar({ insumo: 'TOMATE' });
  check('nota que não é de carne: sem pergunta e sem consulta', !outro.modal && !outro.consultouPedidos, outro);
  const semPed = await lancar({ insumo: 'CAMARÃO SEM CABEÇA 61/70', peds: [] });
  check('carne sem pedido aguardando (compra avulsa): sem pergunta', !semPed.modal, semPed);
  const longe = await lancar({ insumo: 'CAMARÃO SEM CABEÇA 61/70', dataNF: '2026-11-02' });
  check('pedido a mais de 7 dias da data da nota: não é desse pedido, sem pergunta', !longe.modal, longe);
  const semAba = await lancar({ insumo: 'CAMARÃO SEM CABEÇA 61/70', cargo: 'estoquista', abas: ['entradas', 'pedido'] });
  check('quem não tem a aba Entrega não recebe a pergunta', !semAba.modal && !semAba.consultouPedidos, semAba);

  // As regras de nome têm que ser as MESMAS do Check-list (é por elas que a nota vira entrada de carne).
  const corpo = (txt, nome) => { const i = txt.indexOf('const ' + nome + ' = {'); return i < 0 ? null : txt.slice(txt.indexOf('{', i), txt.indexOf('};', i) + 1).replace(/\\\\/g, '\\').replace(/\s+/g, ''); };
  const a = corpo(fs.readFileSync(CHK, 'utf8'), 'CARNES_ENTRADA_MATCH'), b = corpo(fs.readFileSync(LOJAS, 'utf8'), 'CARNES_NF_MATCH');
  check('regras de nome da carne iguais às do Check-list (CARNES_ENTRADA_MATCH)', a && b && a === b, { checklist: a, lojas: b });
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`); await browser.close(); process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
