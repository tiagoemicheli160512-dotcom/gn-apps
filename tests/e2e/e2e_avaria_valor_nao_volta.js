// "No app Pedido, aba Terceiros, toda vez que o Matheus coloca o preço parece que salva, mas
//  depois retorna como se não tivesse sido colocado — às vezes." (19/11/2026)
//
// Causa: o app Lojas guarda a cópia local do registro ainda 'pendente' e, no autosave
// (sbPush / sbPushLoja), a cópia local vencia a da nuvem por id — devolvendo o registro pra
// 'pendente' e apagando o valor que o Compras acabou de confirmar. Caso real: carne seca da
// Boulevard (empréstimo pago em dinheiro, 11,3 kg, R$ 655,40) confirmada em 19/10 e 18/11,
// voltou nas duas vezes.
//
// Cobra, rodando o sbPush e o sbPushLoja de verdade contra uma nuvem simulada:
//  · nuvem 'loja_confirmou' + local 'pendente' → grava 'loja_confirmou' com valor e quem;
//  · nuvem 'finalizado' (RH) + local 'loja_confirmou' → continua 'finalizado';
//  · o que a loja edita no registro (ex.: obs) não se perde;
//  · registro novo só local continua subindo; cancelado (removido) não volta.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const LOJAS = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };

const BASE = { id: 'av-carne', insumo: 'CARNE SECA', qtd: 11.3, unidade: 'KG', tipo: 'transferencia_dinheiro', ts: '2026-10-13T13:16:53.773Z', semana: '2026-10-12', custoUnit: 0, valorTotal: 0 };
const CONF = { status: 'loja_confirmou', custoUnit: 58, valorTotal: 655.4, loja_conf_por: 'Matheus', loja_conf_ts: '2026-11-18T19:24:29Z' };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + LOJAS);
    try { await page.waitForFunction(() => { try { return typeof sbPush === 'function' && typeof sbPushLoja === 'function' && typeof avariasAll === 'object'; } catch (e) { return false; } }, null, { timeout: 20000 }); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: o app Lojas não carregou'); process.exit(1); } }
  }

  // Monta a nuvem e o estado local; roda o push escolhido; devolve o que foi gravado.
  const rodar = (cenario) => page.evaluate(async ({ cenario, BASE, CONF }) => {
    const nuvem = { BOULEVARD: { avariasAll: { BOULEVARD: cenario.nuvem } }, CAMPO_GRANDE: { avariasAll: { 'CAMPO GRANDE': [] } } };
    const gravado = {};
    sbRequest = async (rota, opt) => {
      const m = (opt && opt.method) || 'GET';
      const lojaQ = decodeURIComponent((rota.match(/loja=eq\.([^&]+)/) || [])[1] || '');
      if (/^gn_lojas\?/.test(rota) && m === 'GET') return [{ all_data: JSON.parse(JSON.stringify((nuvem[lojaQ.replace(' ', '_')] || nuvem[lojaQ] || {}))) }];
      if (/^gn_lojas\?/.test(rota) && m === 'PATCH') { gravado[lojaQ] = JSON.parse(opt.body).all_data; return null; }
      return [];
    };
    loja = cenario.loja; usuarioAtual = { nome: 'Gerente', cargo: 'gerente' };
    avariasAll = JSON.parse(JSON.stringify(cenario.local));
    if (cenario.removidos) cenario.removidos.forEach(id => _pendingDelIds.avariasAll.add(id));
    if (cenario.via === 'loja') await sbPushLoja(cenario.alvo); else await sbPush();
    const alvo = cenario.via === 'loja' ? cenario.alvo : cenario.loja;
    return { lista: ((gravado[alvo] || {}).avariasAll || {})[alvo] || null, local: avariasAll[alvo] };
  }, { cenario, BASE, CONF });

  // 1. sbPush da própria Boulevard: local pendente, nuvem já confirmada pelo Compras.
  const a = await rodar({ loja: 'BOULEVARD', via: 'push',
    nuvem: [{ ...BASE, ...CONF }], local: { BOULEVARD: [{ ...BASE, status: 'pendente', obs: 'editado na loja' }] } });
  const ra = (a.lista || []).find(x => x.id === 'av-carne') || {};
  check('autosave da loja com cópia "pendente": o valor confirmado pelo Compras NÃO volta (loja_confirmou, R$ 655,40, Matheus)',
    ra.status === 'loja_confirmou' && ra.valorTotal === 655.4 && ra.custoUnit === 58 && ra.loja_conf_por === 'Matheus', ra);
  check('…e o que a loja editou no registro continua', ra.obs === 'editado na loja', ra);
  check('…e a cópia local do aparelho já fica atualizada', (a.local || []).find(x => x.id === 'av-carne').status === 'loja_confirmou', a.local);

  // 2. sbPushLoja (a OUTRA loja do empréstimo grava na linha da Boulevard) — o caso real.
  const b = await rodar({ loja: 'CAMPO GRANDE', via: 'loja', alvo: 'BOULEVARD',
    nuvem: [{ ...BASE, ...CONF }], local: { BOULEVARD: [{ ...BASE, status: 'pendente' }] } });
  const rb = (b.lista || []).find(x => x.id === 'av-carne') || {};
  check('empréstimo: a outra loja gravando na linha da Boulevard também não desfaz a confirmação', rb.status === 'loja_confirmou' && rb.valorTotal === 655.4, rb);

  // 3. Financeiro finalizou; loja ainda com loja_confirmou.
  const c = await rodar({ loja: 'BOULEVARD', via: 'push',
    nuvem: [{ ...BASE, ...CONF, status: 'finalizado', rh_conf_por: 'Renata rh', rh_conf_ts: '2026-11-19T10:00:00Z' }],
    local: { BOULEVARD: [{ ...BASE, ...CONF }] } });
  const rc = (c.lista || []).find(x => x.id === 'av-carne') || {};
  check('Financeiro finalizou: continua finalizado (não volta pra "aguardando Financeiro")', rc.status === 'finalizado' && rc.rh_conf_por === 'Renata rh', rc);

  // 4. Local mais adiante que a nuvem (o próprio aparelho finalizou): vale o local.
  const d = await rodar({ loja: 'BOULEVARD', via: 'push',
    nuvem: [{ ...BASE, ...CONF }], local: { BOULEVARD: [{ ...BASE, ...CONF, status: 'finalizado', rh_conf_por: 'RH local' }] } });
  check('se o aparelho está mais adiante, vale o aparelho', ((d.lista || []).find(x => x.id === 'av-carne') || {}).status === 'finalizado');

  // 5. Novo só no aparelho sobe; removido (cancelado) não volta da nuvem.
  const e = await rodar({ loja: 'BOULEVARD', via: 'push', removidos: ['av-velha'],
    nuvem: [{ ...BASE, ...CONF }, { ...BASE, id: 'av-velha', status: 'pendente' }],
    local: { BOULEVARD: [{ ...BASE, status: 'pendente' }, { ...BASE, id: 'av-nova', status: 'pendente' }] } });
  const ids = (e.lista || []).map(x => x.id).sort().join();
  check('registro novo do aparelho sobe e o cancelado não volta', ids === 'av-carne,av-nova', ids);

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
