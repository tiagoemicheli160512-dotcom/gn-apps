// "Tem a caixa que colocamos pra ideia e sugestão, fechou já, vamos tirar ela."
//
// Tirar um bloco grande de um arquivo de 1 MB tem um risco só, mas é o pior possível: deixar
// uma referência pendurada e a Home inteira parar de carregar — e aí ninguém vê nem o
// faturamento do dia. Este teste carrega a página de verdade e cobra três coisas: nenhum
// erro de JS, a Home montando, e nada da caixa sobrando na tela.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    // "Failed to load resource" e REDE, nao erro de JS: sob carga (130 navegadores numa
    // corrida) um recurso esgota retry e isso virava "erro de JS ao carregar a pagina",
    // mandando procurar defeito onde nao ha. O que interessa aqui e excecao do app.
    if (/Failed to load resource|ERR_|net::|favicon/i.test(m.text())) return;
    erros.push('console: ' + m.text());
  });

  await page.goto('file://' + HOME);
  await page.waitForFunction(() => { try { return typeof _relModalHtml === 'function'; } catch (e) { return false; } }, { timeout: 20000 });

  // ── Nada da caixa ficou pra trás ──────────────────────────────────────────────────────
  const r = await page.evaluate(() => ({
    container: !!document.getElementById('sugestoes-app-home-card'),
    simbolos: ['_renderSugestoesHome', '_sugCarregar', '_sugVotar', '_sugEnviar', '_sugItemHtml',
               '_sugPodeVer', 'SUG_PREFIXO', 'SUG_FIM']
      .filter(n => { try { return eval('typeof ' + n) !== 'undefined'; } catch (e) { return false; } }),
    // As funções que rodavam logo depois dela no mesmo trecho precisam continuar de pé.
    vizinhas: ['_renderAvisoEleicoesHome', 'loadBadges', '_ehCargoModuloUnico', '_renderMesAnteriorHome']
      .filter(n => { try { return eval('typeof ' + n) !== 'function'; } catch (e) { return true; } }),
    txt: (document.body.textContent || '').replace(/\s+/g, ' '),
  }));
  check('o container da caixa não existe mais no HTML', r.container === false);
  check('nenhuma função/constante da caixa sobrou', r.simbolos.length === 0);
  if (r.simbolos.length) console.log('      sobraram: ' + r.simbolos.join(', '));
  check('as funções vizinhas do trecho removido continuam de pé', r.vizinhas.length === 0);
  if (r.vizinhas.length) console.log('      quebraram: ' + r.vizinhas.join(', '));
  check('a palavra "sugestão" não aparece mais na tela da Home',
    !/Enviar sugest|Escrever uma sugest|também quero|Caixa aberta at/i.test(r.txt));

  // ── A Home carrega e monta ────────────────────────────────────────────────────────────
  check('nenhum erro de JS ao carregar a página', erros.length === 0);
  if (erros.length) erros.slice(0, 5).forEach(e => console.log('      ' + e.slice(0, 180)));

  const montou = await page.evaluate(() => {
    // Monta a tela como um mestre em "Todas as lojas" — é o caminho onde a caixa era
    // chamada (fora do _mostrarCards), ou seja, o que o corte mais podia ter afetado.
    try {
      session = { id: 1, nome: 'T', cargo: 'mestre', loja: 'GERAL' };
      masterLoja = '';
      if (typeof _renderAvisoEleicoesHome === 'function') _renderAvisoEleicoesHome(true, session, true);
      return { erro: null,
               temDash: !!document.getElementById('dash-section'),
               temMesAnterior: !!document.getElementById('mes-anterior-home-card') };
    } catch (e) { return { erro: String(e) }; }
  });
  check('a Home monta pro mestre em "Todas as lojas" sem quebrar', montou.erro === null);
  if (montou.erro) console.log('      ' + montou.erro);
  check('os cards vizinhos (dash e mês anterior) continuam no lugar',
    montou.temDash === true && montou.temMesAnterior === true);

  await ctx.close();
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
