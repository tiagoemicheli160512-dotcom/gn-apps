// "Pode corrigir sim" (07/11/2026): num celular de 320 px o Painel de Gestão rolava de lado.
// Três culpados, medidos: a linha do período (Semanal/Mensal ‹ 02/11–08/11 · atual › 📄)
// não cabia; a grade dos cards das lojas tinha colunas "1fr" que crescem com o nome mais
// comprido; e o login do DRE da rede, num grid igual, com o "olho" da senha travando a
// largura medida do campo. Cobra: nenhuma das 15 abas passa da tela a 320 e 360 px.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  for (const largura of [320, 360]) {
    const ctx = await browser.newContext({ viewport: { width: largura, height: 800 } });
    await CAMINHOS.fixarRelogio(ctx, '2026-11-07T12:00:00');
    await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    const page = await ctx.newPage();
    const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
    for (let t = 1; ; t++) {
      await page.goto('file://' + HOME);
      try { await CAMINHOS.esperarApp(page, ['LOJAS_LISTA'], ['renderDashboard', '_setDashTab']); break; }
      catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
    }
    const r = await page.evaluate(async () => {
      session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } }; masterLoja = null;
      document.getElementById('home-screen').style.display = 'block';
      document.getElementById('dash-section').style.display = 'block';
      // Valores com variação e posição (o que alarga o card de verdade).
      const fat = {}, prev = {}; LOJAS_LISTA.forEach((k, i) => { fat[k] = 1234567 - i * 1000; prev[k] = 999999; });
      _dashFat = fat; _dashFatPrev = prev;
      const out = {};
      for (const t of ['fat', 'att', 'cancel', 'sem10', 'presenca', 'ferias', 'xadrez', 'bi', 'barris', 'carnes', 'trios', 'banco', 'extra', 'dre', 'metas']) {
        _setDashTab(t); await new Promise(r => setTimeout(r, 60));
        out[t] = document.documentElement.scrollWidth;
      }
      // Fora da aba atual: o período de outra semana (sem o "· atual") também cabe.
      _setDashTab('fat'); _dashNav(-1); await new Promise(r => setTimeout(r, 60));
      out['fat (semana passada)'] = document.documentElement.scrollWidth;
      return out;
    });
    const largas = Object.entries(r).filter(([, w]) => w > largura + 1);
    check(`${largura} px: nenhuma das 15 abas rola de lado`, largas.length === 0, JSON.stringify(largas));
    check(`${largura} px: nenhum erro de JavaScript`, erros.length === 0, erros.join(' | '));
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
