// "Eu já vinha sentindo muita informação..." (06/11/2026) — fase 3. Decisão do dono:
// AGRUPAR sem toque a mais. Mês fechado e fechamento da semana sob "🗂 Fechamentos";
// escala, visita, ocorrências e datas especiais sob "👥 Equipe e agenda". Os cards ficam
// como são. Datas Especiais passa a mostrar só a próxima data, com "+N datas".
//
// Cobra: ordem dentro do grupo; título só com card que tem conteúdo (permissão intacta);
// card que carrega depois reacende o título; reorganizar não tira o foco de um campo.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-06T12:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await CAMINHOS.esperarApp(page, ['LOJAS_LISTA'], ['_homeOrganizarGrupos', '_renderDatasEspeciaisHome', '_datasEspHomeToggle']); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: a Home não carregou (ou falta o código novo)'); console.log('\n0 OK, 1 falhou'); process.exit(1); } }
  }
  await page.evaluate(() => { document.getElementById('home-screen').style.display = 'block'; });
  const espera = () => page.evaluate(() => new Promise(r => setTimeout(r, 40)));
  const card = async (id, html) => { await page.evaluate(({ id, html }) => { document.getElementById(id).innerHTML = html; }, { id, html }); await espera(); };
  const estado = () => page.evaluate(() => {
    const g = id => { const s = document.getElementById(id); return { vis: s.style.display !== 'none', titulo: s.firstElementChild ? s.firstElementChild.textContent : '',
      ids: [...s.querySelectorAll('.home-grupo-corpo > [id]')].filter(e => e.innerHTML.trim()).map(e => e.id) }; };
    return { fech: g('home-sec-fech'), equipe: g('home-sec-equipe') };
  });

  // ── 1. Antes de qualquer card: nada de título solto ─────────────────────────────────
  await page.evaluate(() => _homeOrganizar()); await espera();
  let e = await estado();
  check('sem card com conteúdo, nenhum dos dois títulos aparece', !e.fech.vis && !e.equipe.vis, JSON.stringify(e));

  // ── 2. Cards chegam fora de ordem, depois do organizador (consultas assíncronas) ────
  await card('datas-especiais-home-card', '<div>datas</div>');
  await card('fechamento-semana-home-card', '<div>semana</div>');
  await card('escala-dia-home-card', '<div>escala</div>');
  await card('mes-anterior-home-card', '<div>mês fechado</div>');
  e = await estado();
  check('card que carrega depois acende o título do grupo sozinho', e.fech.vis && e.equipe.vis, JSON.stringify(e));
  check('Fechamentos: mês fechado e depois a semana', e.fech.ids.join(',') === 'mes-anterior-home-card,fechamento-semana-home-card' && /Fechamentos/.test(e.fech.titulo), JSON.stringify(e.fech));
  check('Equipe e agenda: escala e depois datas (visita e ocorrências vazias não contam)',
    e.equipe.ids.join(',') === 'escala-dia-home-card,datas-especiais-home-card' && /Equipe e agenda/.test(e.equipe.titulo), JSON.stringify(e.equipe));
  const ordemTela = await page.evaluate(() => {
    // Ordem no documento (o "Em dia" está escondido aqui, então posição na tela não serve).
    const antes = (a, b) => !!(document.getElementById(a).compareDocumentPosition(document.getElementById(b)) & Node.DOCUMENT_POSITION_FOLLOWING);
    return { resultadoAntes: antes('home-sec-resultado', 'home-sec-fech'), fechAntesEquipe: antes('home-sec-fech', 'home-sec-equipe'), equipeAntesEmDia: antes('home-sec-equipe', 'home-sec-ok') };
  });
  check('na tela: resultado → Fechamentos → Equipe e agenda → Em dia', Object.values(ordemTela).every(Boolean), JSON.stringify(ordemTela));

  // ── 3. Permissão: card esvaziado tira o título ──────────────────────────────────────
  await card('mes-anterior-home-card', ''); await card('fechamento-semana-home-card', '');
  e = await estado();
  check('grupo com todos os cards vazios some (é a senha que não pode ver)', !e.fech.vis && e.equipe.vis, JSON.stringify(e));

  // ── 4. Foco: reorganizar não tira o cursor de um campo ───────────────────────────────
  await card('fechamento-semana-home-card', '<input id="fecha-user-teste">');
  await page.focus('#fecha-user-teste');
  await card('visita-supervisao-home-card', '<div>visita</div>');   // dispara reorganização
  await page.evaluate(() => _homeOrganizar());
  const foco = await page.evaluate(() => document.activeElement && document.activeElement.id);
  check('digitando a senha do fechamento: outro card carregando não tira o foco', foco === 'fecha-user-teste', foco);
  e = await estado();
  check('a visita entra no lugar dela (escala, visita, datas)', e.equipe.ids.join(',') === 'escala-dia-home-card,visita-supervisao-home-card,datas-especiais-home-card', e.equipe.ids.join(','));

  // ── 5. Datas especiais: só a próxima, "+N datas" abre as outras ─────────────────────
  const datas = await page.evaluate(async () => {
    _datasEspHomeAberto = false;
    _renderDatasEspeciaisHome(true, { loja: 'BANGU', cargo: 'gerente' }, false);
    const el = document.getElementById('datas-especiais-home-card');
    const linhas = () => [...el.querySelectorAll('div[style*="justify-content:space-between;background"]')].map(x => x.textContent.replace(/\s+/g, ' ').trim());
    const fechado = { linhas: linhas(), botao: (el.querySelector('.datas-esp-mais') || {}).textContent || '', h: el.getBoundingClientRect().height };
    _datasEspHomeToggle();
    const aberto = { linhas: linhas(), botao: (el.querySelector('.datas-esp-mais') || {}).textContent || '', dica: /Antecipe escala/.test(el.textContent) };
    _datasEspHomeToggle();
    return { fechado, aberto, deNovo: linhas().length };
  });
  check('fechado: só a próxima data (Proclamação da República, 15/11)', datas.fechado.linhas.length === 1 && /Proclamação da República/.test(datas.fechado.linhas[0]), JSON.stringify(datas.fechado));
  check('com o botão "+2 datas"', /\+2 datas/.test(datas.fechado.botao), datas.fechado.botao);
  check('tocar abre as 3, com a dica de antecipar', datas.aberto.linhas.length === 3 && datas.aberto.dica && /menos/.test(datas.aberto.botao), JSON.stringify(datas.aberto));
  check('e fecha de novo', datas.deNovo === 1);
  check('fechado fica baixo (< 130 px; eram 241)', datas.fechado.h < 130, datas.fechado.h);

  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
