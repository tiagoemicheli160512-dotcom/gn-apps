// "Olhando a arrecadação desse fim de semana, as informações estão confusas nos cards,
//  olhei as lojas não tem nada." (21/11/2026, 19:14, print do Painel › Trios na semana vigente)
//
// O topo dizia "Couvert arrecadado R$ 1.771,00", "Saldo −R$ 12.729,00" e "✅ As 10 lojas com
// trio lançaram o couvert e fecharam positivas" — e todos os cartões "ainda não aconteceu",
// couvert "—". Os R$ 1.771 eram de Bangu (609), Pedreira (455) e São Gonçalo (707), lançados
// no sábado; o painel tratava HOJE como futuro, escondia o valor nos cartões, punha o couvert
// de um dia contra o cachê do fim de semana inteiro e dava "tudo positivo" porque nenhuma
// loja estava em atraso. Linhas abaixo: as do banco nesse momento (gn_trios_agenda).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 600))); c ? ok++ : falhou++; };

const ap = (data, loja, cache, couver, lancado, hora) => ({ data, loja, artista: 'Trio ' + loja + ' ' + data.slice(8), cache, couver_qtd: couver / 7,
  couver_valor: couver, couver_lancado_em: lancado ? data + 'T' + lancado + '.000Z' : null, presenca_confirmada: false, banda_nao_veio: false,
  banda_nao_veio_motivo: null, horario_inicio: hora || '13:00' });
const LINHAS = [
  ap('2026-11-21', 'bangu', 700, 609, '21:33:31'), ap('2026-11-21', 'boulevard', 700, 0), ap('2026-11-21', 'caxias', 700, 0, null, '19:00'),
  ap('2026-11-21', 'itaquera', 800, 0), ap('2026-11-21', 'norte_shopping', 800, 0), ap('2026-11-21', 'nova_america', 600, 0, null, '19:00'),
  ap('2026-11-21', 'nova_america', 800, 0), ap('2026-11-21', 'nova_iguacu', 600, 0, null, '19:00'),
  ap('2026-11-21', 'pedreira', 600, 455, '19:47:38'), ap('2026-11-21', 'sao_goncalo', 600, 707, '20:34:59'),
  ...['bangu:800', 'boulevard:600', 'caxias:800', 'guarulhos:800', 'itaquera:800', 'norte_shopping:800', 'nova_america:800', 'nova_iguacu:600', 'pedreira:800', 'sao_goncalo:800']
    .map(x => ap('2026-11-22', x.split(':')[0], +x.split(':')[1], 0)),
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-21T19:14:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof _buildTriosPanel === 'function' && typeof _loadTriosGerencia === 'function' && Array.isArray(LOJAS_LISTA); } catch (e) { return false; } }, null, { timeout: 20000 }); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: a Home não carregou'); console.log('\n0 OK, 1 falhou'); process.exit(1); } }
  }
  const montar = (per, off) => page.evaluate(async ({ LINHAS, per, off }) => {
    const orig = window.gnFetchJson;
    window.gnFetchJson = async url => (/gn_trios_agenda/.test(url) ? LINHAS : []);
    _triosPer = per; _triosGerLoaded = false; _triosGerData = null; _triosGerOff = off;
    try { await _loadTriosGerencia(); } finally { window.gnFetchJson = orig; }
    const el = document.createElement('div'); el.innerHTML = _buildTriosPanel();
    const cards = {};
    [...el.querySelectorAll('div')].forEach(dv => {
      if (!/border-left:\s*3px solid/.test(dv.getAttribute('style') || '')) return;
      const nome = (dv.querySelector('span') || {}).textContent;
      if (nome) cards[nome.trim()] = dv.textContent.replace(/\s+/g, ' ').trim();
    });
    const wpp = (_triosRelatorioTexto(true) || {}).msg || '';
    return { txt: el.textContent.replace(/\s+/g, ' ').trim(), cards, wpp };
  }, { LINHAS, per, off });

  const r = await montar('sem', 1);
  check('o aviso verde "fecharam positivas" NÃO aparece com o fim de semana acontecendo', !/fecharam positivas/.test(r.txt), r.txt.slice(0, 500));
  check('no lugar dele: "Fim de semana em andamento: 3 de 10 lojas já lançaram couvert"', /Fim de semana em andamento: 3 de 10 lojas já lançaram couvert/.test(r.txt), r.txt.slice(0, 600));
  check('o aviso lista quem lançou, com o valor', /Já lançado:.*Bangu R\$\s?609,00.*Pedreira R\$\s?455,00.*São Gonçalo R\$\s?707,00/.test(r.txt), r.txt.slice(0, 700));
  check('e quem falta: hoje (Boulevard) e só domingo (Guarulhos, 22/11)', /Aguardando:.*Boulevard \(hoje\).*Guarulhos \(22\/11\)/.test(r.txt), r.txt.slice(0, 900));
  check('couvert do topo segue R$ 1.771,00, marcado "até agora"', /Couvert arrecadado R\$\s?1\.771,00 até agora/.test(r.txt), r.txt.slice(0, 300));
  check('saldo do topo só dos shows lançados: 1.771 − 1.900 = −R$ 129,00 (não −R$ 12.729)', /Saldo até agora −R\$\s?129,00/.test(r.txt) && !/12\.729/.test(r.txt), r.txt.slice(0, 400));
  check('cartão de Bangu: em andamento, couvert R$ 609 até agora, sábado com o valor', /em andamento/i.test(r.cards.Bangu || '') && /Couvert R\$\s?609,00 até agora/.test(r.cards.Bangu || '') && /21\/11.*R\$\s?609,00/.test(r.cards.Bangu || ''), r.cards.Bangu);
  check('cartão de Bangu: saldo ainda "—", fecha depois de 22/11', /Saldo — fecha depois de 22\/11/.test(r.cards.Bangu || ''), r.cards.Bangu);
  check('cartão de Boulevard: sábado "aguardando" (não "sem couvert")', /aguardando/.test(r.cards.Boulevard || '') && !/sem couvert/.test(r.cards.Boulevard || ''), r.cards.Boulevard);
  check('cartão de Boulevard (show de hoje, sem lançar): "aguardando couvert", não "ainda não aconteceu"', /aguardando couvert/i.test(r.cards.Boulevard || '') && !/ainda não aconteceu/i.test(r.cards.Boulevard || '') && /o de hoje ainda não foi lançado/.test(r.cards.Boulevard || ''), r.cards.Boulevard);
  check('legenda do período: "fim de semana acontecendo" no sábado', /semana vigente — fim de semana acontecendo/.test(r.txt), r.txt.slice(0, 200));
  check('Guarulhos (só domingo) segue "ainda não aconteceu"', /ainda não aconteceu/i.test(r.cards.Guarulhos || ''), r.cards.Guarulhos);
  check('ninguém aparece como "sem couvert lançado" nem "saldo negativo"', !/sem o couvert lançado|com saldo negativo/.test(r.txt), (r.txt.match(/.{80}(sem o couvert lançado|saldo negativo).{80}/) || [])[0]);
  check('WhatsApp: saldo até agora e o andamento, sem "Saldo da rede" falso', /Saldo até agora: -R\$\s?129,00/.test(r.wpp) && /em andamento/.test(r.wpp) && !/Saldo da rede/.test(r.wpp) && /Couvert até agora: R\$\s?609,00/.test(r.wpp), r.wpp.slice(0, 600));

  // Mês corrente: o sábado lançado entra (era cortado até ontem); quem não lançou fica pra depois.
  const m = await montar('mes', 0);
  check('mês: o couvert de hoje já lançado entra na conta do cartão de Bangu', /Couvert R\$\s?609,00/.test(m.cards.Bangu || ''), m.cards.Bangu);
  check('mês: Boulevard sem lançamento hoje fica fora (cachê vem à parte, sem cobrança)', !/sem couvert/.test(m.cards.Boulevard || ''), m.cards.Boulevard);

  // Domingo 23h, tudo lançado: aí sim fecha e o aviso verde volta.
  await page.evaluate(() => {});
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
