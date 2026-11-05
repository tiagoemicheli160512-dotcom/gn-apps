// O conserto da entrada duplicada das carnes (#1102) mergeou e mesmo assim a Nova América
// continuou duplicando. MEDIDO no banco, duas horas depois do merge: a linha da semana
// 26/10 sendo reescrita (updated_at 19:44) com a estampa da automação PARADA no valor que
// eu tinha gravado às 17:07. Estampa congelada e linha mudando é a assinatura de um
// aparelho rodando HTML velho: ele mescla dia a dia, não conhece a estampa, e devolve ao
// servidor o dia que a automação de outro aparelho já tinha limpado.
//
// A CAUSA de ele estar velho: o bloco de recarga forçada do topo do arquivo parou de
// funcionar. `var V` ficou em 99 desde o PR #1048 enquanto o título andou até v116 — e o
// bloco só recarrega quando o V do ARQUIVO é maior que o guardado no localStorage. Todo
// aparelho que já tinha 99 guardado nunca mais foi mandado recarregar: ~17 versões em que
// nenhum conserto era empurrado pra quem tinha o app aberto ou em cache.
//
// Não dá pra testar "este deploy precisava de recarga?" — é decisão de quem solta. Dá pra
// testar o que quebrou: o V não pode FICAR PRA TRÁS da versão do título. Enquanto subirem
// juntos, cada versão nova alcança o aparelho na carga seguinte.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const fs = require('fs');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

(async () => {
  // ══ 1. O V não pode ficar pra trás do título ═════════════════════════════════════
  const fonte = fs.readFileSync(CHK, 'utf8');
  const mT = /<title>\s*GN Check-list\s*v(\d+)\s*<\/title>/i.exec(fonte);
  const mV = /var\s+V\s*=\s*(\d+)\s*;/.exec(fonte);
  check('o título traz a versão do app', !!mT, (fonte.match(/<title>[^<]*/) || [''])[0]);
  check('o bloco de recarga traz o V', !!mV, (fonte.match(/var\s+V\s*=[^;]*/) || [''])[0]);
  const vTitulo = mT ? parseInt(mT[1], 10) : -1, vBloco = mV ? parseInt(mV[1], 10) : -1;
  check(`o V (${vBloco}) não fica pra trás da versão do título (${vTitulo})`,
    vBloco >= vTitulo, `V=${vBloco} título=v${vTitulo}`);
  // 9999 é o valor que as suítes gravam pra desligar a recarga durante o teste; um V que
  // chegasse lá desligaria a recarga pra elas e a suíte inteira passaria a testar outra
  // coisa, sem ninguém notar.
  check('e fica abaixo do valor que as suítes usam pra desligar a recarga (9999)',
    vBloco < 9999, String(vBloco));

  // ══ 2. E o bloco realmente recarrega — ou não — conforme o guardado ══════════════
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  // Só o script do topo importa aqui: corta o resto pra não esperar CDN nenhuma.
  const abrir = async (guardado) => {
    const ctx = await browser.newContext();
    await ctx.route('**/*', r => {
      const u = r.request().url();
      if (u.startsWith('file://')) return r.continue();
      return r.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });
    if (guardado !== null) await ctx.addInitScript(([v]) => {
      try { localStorage.setItem('gn_chk_page_ver', v); } catch (e) {} }, [guardado]);
    const page = await ctx.newPage();
    try { await page.goto('file://' + CHK, { waitUntil: 'domcontentloaded', timeout: 30000 }); }
    catch (e) {}
    const r = await page.evaluate(() => ({ url: location.href,
      guardado: (() => { try { return localStorage.getItem('gn_chk_page_ver'); } catch (e) { return null; } })() }));
    await ctx.close();
    return r;
  };

  const novo = await abrir(null);
  check('aparelho que nunca viu esta versão é recarregado com ?v=',
    new URL(novo.url).searchParams.get('v') === String(vBloco), novo.url.slice(-80));
  check('e passa a guardar a versão nova',
    novo.guardado === String(vBloco), JSON.stringify(novo));

  // É o caso do tablet da Nova América: guardou 99 e o V tinha ficado em 99, então ele
  // nunca mais recarregou. Com o V à frente, ele recarrega.
  const atrasado = await abrir('99');
  check('aparelho parado numa versão antiga é recarregado',
    new URL(atrasado.url).searchParams.get('v') === String(vBloco), atrasado.url.slice(-80));

  const emDia = await abrir(String(vBloco));
  check('aparelho já nesta versão NÃO é recarregado',
    new URL(emDia.url).searchParams.get('v') === null, emDia.url.slice(-80));

  const suite = await abrir('9999');
  check('o valor das suítes continua desligando a recarga',
    new URL(suite.url).searchParams.get('v') === null, suite.url.slice(-80));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
