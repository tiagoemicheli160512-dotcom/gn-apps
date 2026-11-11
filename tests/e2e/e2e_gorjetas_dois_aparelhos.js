// "Fui fazer uma correção no app pelo celular, na loja de Campo Grande [Check-list, aba
//  Dados → Funcionários, Emanoel], e a loja estava fazendo pelo computador; salvei, mas
//  voltou ao antigo." (11/11/2026)
//
// A escala da aba Dados é a mesma linha do app Gorjetas (gn_comissoes.all_data). O Gorjetas
// mescla por SEMANA: quem tem o _lastEdit mais novo da semana leva todos os funcionários
// dela. O computador da loja, aberto com a cópia de antes, mexia em qualquer coisa da semana
// e a cópia velha dele do Emanoel subia por cima da correção.
//
// Agora o app guarda a assinatura de cada vaga como estava no servidor (baseSync) e só
// regrava a vaga que ELE mudou. Esta suíte faz o papel dos dois aparelhos:
//   1. a loja edita OUTRA pessoa depois da correção do celular: a correção fica;
//   2. e a edição da loja sobe;
//   3. saída confirmada no celular não é apagada pela loja editando uma folga;
//   4. a loja parada passa a ver a correção na atualização automática;
//   5. os dois na MESMA pessoa: regra de antes (semana mais recente);
//   6. exclusão feita no celular não é desfeita; exclusão feita na loja sobe;
//   7. sem assinatura (primeira abertura depois da atualização), nada quebra.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ_COM || CAMINHOS.pub('gn-comissoes.html');
const SB_LIB = require('fs').readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

const mk = (nome, i, tipo) => ({ id: i, nome, tipo: tipo || 'CLT / MENSALISTA', setor: 'Salão', turno: 'NOITE',
  horario: '16:00-00:00', dias: Array(7).fill('PRESENTE'), turnos: Array(7).fill(null) });
const T0 = Date.parse('2026-11-10T12:00:00Z');
const semente = () => ({
  '43': { funcs: [mk('ANA', 0), mk('EMANOEL', 1), mk('BRUNO', 2)], brutos: [1, 2, 3, 4, 5, 6, 7], dist: 'SIM', saidas: [], _lastEdit: T0 - 1000 },
  '44': { funcs: [mk('ANA', 0), mk('EMANOEL', 1), mk('BRUNO', 2)], brutos: [100, 200, 0, 0, 0, 0, 0], dist: 'SIM', saidas: [], _lastEdit: T0 },
  ferias_geral: { x: 1 },
});

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  let srv = semente(), patches = 0;
  const novoAparelho = async (localAllData) => {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
    // Quarta 11/11/2026 15:00 — semana de índice 44.
    await CAMINHOS.fixarRelogio(ctx, '2026-11-11T15:00:00');
    await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: SB_LIB }));
    await ctx.route('**/rest/v1/**', r => {
      const u = r.request().url(), m = r.request().method();
      if (/gn_comissoes\?/.test(u) && m === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ all_data: srv }]) });
      if (/gn_comissoes\?/.test(u) && m === 'PATCH') { srv = JSON.parse(JSON.stringify(r.request().postDataJSON().all_data)); patches++; return r.fulfill({ status: 204, body: '' }); }
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    const page = await ctx.newPage();
    const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
    await page.addInitScript(({ localAllData }) => { try {
      if (localStorage.getItem('__semeado')) return;
      localStorage.setItem('__semeado', '1');
      localStorage.setItem('gn_session_v1', JSON.stringify({ id: 1, nome: 'Thalyta', cargo: 'sub_gerente', loja: 'RANCHO', permissoes: { master: true, comissoes: true }, ts: Date.now() }));
      localStorage.setItem('gn_RANCHO_usuario', JSON.stringify('Thalyta'));
      localStorage.setItem('gn_aviso_guia_v1', '1');
      if (localAllData) localStorage.setItem('gn_RANCHO_allData', JSON.stringify(localAllData));
    } catch (e) {} }, { localAllData });
    await page.goto('file://' + ARQ);
    await page.waitForFunction(() => { try { return typeof _syncNow === 'function' && LOJA === 'RANCHO' && state.semIdx === 44
      && ((state.allData['44'] || {}).funcs || []).length > 0; } catch (e) { return false; } }, null, { timeout: 25000 });
    // Deixa a carga inicial da nuvem terminar (é ela que grava a primeira assinatura).
    await page.evaluate(async () => { clearTimeout(syncTimer); await carregarDaNuvem(true); });
    return { ctx, page, erros };
  };
  const f = (i, sem) => srv[sem || '44'].funcs[i];
  // A loja edita e sincroniza já (o debounce do app só atrasaria o teste).
  const lojaEdita = (page, fn) => page.evaluate(new Function('return (async () => { (' + fn + ')(); clearTimeout(syncTimer); await _syncNow(); return syncStatus; })()'));

  // ══ 1–3. O caso do pedido ═══════════════════════════════════════════════════════════
  let loja = await novoAparelho(null);
  check('(controle) a loja abre com a escala do servidor', await loja.page.evaluate(() => getWD(44).funcs[1].nome === 'EMANOEL' && getWD(44).funcs[1].tipo === 'CLT / MENSALISTA'));
  // O CELULAR corrige o Emanoel e confirma uma saída, direto no servidor.
  f(1).tipo = 'HORISTA'; f(1).horario = '18:00-23:00';
  srv['44'].saidas = [{ id: 's1', valor: 400, motivo: 'PAGAMENTO EXTRA' }];
  srv['44']._lastEdit = T0 + 60000;
  // A LOJA, com a tela de antes, dá uma folga pro Bruno.
  const st = await lojaEdita(loja.page, `() => { const wd = { ...getWD(44) }; wd.funcs = [...wd.funcs]; wd.funcs[2] = { ...wd.funcs[2], dias: ['FOLGA','PRESENTE','PRESENTE','PRESENTE','PRESENTE','PRESENTE','PRESENTE'] }; setWD(44, wd); }`);
  check('a sincronização da loja termina bem', st === 'ok', st);
  check('a correção do celular no Emanoel NÃO volta ao antigo', f(1).tipo === 'HORISTA' && f(1).horario === '18:00-23:00', JSON.stringify(f(1)));
  check('a folga que a loja deu pro Bruno sobe', f(2).dias[0] === 'FOLGA', JSON.stringify(f(2).dias));
  check('a saída confirmada no celular não é apagada pela edição da loja', (srv['44'].saidas || []).length === 1 && srv['44'].saidas[0].id === 's1', JSON.stringify(srv['44'].saidas));
  check('a tela da loja passa a mostrar o Emanoel corrigido', await loja.page.evaluate(() => getWD(44).funcs[1].tipo === 'HORISTA'));
  check('o que não é semana (ferias_geral) continua intacto', srv.ferias_geral && srv.ferias_geral.x === 1, JSON.stringify(srv.ferias_geral));
  check('a semana anterior não foi tocada', JSON.stringify(srv['43'].funcs.map(x => x.tipo)) === JSON.stringify(['CLT / MENSALISTA', 'CLT / MENSALISTA', 'CLT / MENSALISTA']));

  // ══ 4. A loja parada vê a correção na atualização automática ════════════════════════
  f(0).setor = 'Cozinha'; srv['44']._lastEdit = T0 + 120000;
  await loja.page.evaluate(async () => { await carregarDaNuvem(true); });
  check('sem editar nada, a loja recebe a correção feita em outro aparelho', await loja.page.evaluate(() => getWD(44).funcs[0].setor === 'Cozinha'));
  const antes = patches;
  await lojaEdita(loja.page, `() => { const wd = { ...getWD(44) }; wd.funcs = [...wd.funcs]; wd.funcs[2] = { ...wd.funcs[2], turno: 'DIA' }; setWD(44, wd); }`);
  check('e a edição seguinte da loja não desfaz essa correção', f(0).setor === 'Cozinha' && f(2).turno === 'DIA' && patches === antes + 1, JSON.stringify([f(0).setor, f(2).turno]));

  // ══ 5. Os dois na MESMA pessoa: a regra de antes (semana mais recente) ═══════════════
  f(1).setor = 'Bar'; srv['44']._lastEdit = T0 + 180000;
  await lojaEdita(loja.page, `() => { const wd = { ...getWD(44) }; wd.funcs = [...wd.funcs]; wd.funcs[1] = { ...wd.funcs[1], setor: 'Caixa' }; setWD(44, wd); }`);
  check('os dois editaram o Emanoel: vale o de quem editou a semana por último (a loja)', f(1).setor === 'Caixa', f(1).setor);

  // ══ 6. Exclusões ════════════════════════════════════════════════════════════════════
  const agora = Date.parse('2026-11-11T18:00:00Z');   // o relógio fixo da página
  srv['44'].funcs[0] = { id: 0, nome: '', tipo: 'CLT / MENSALISTA', dias: Array(7).fill('PRESENTE'), _removidoEm: agora - 5000, _removidoNome: 'ANA', _removidoMotivo: 'DEMISSAO' };
  srv['44']._lastEdit = agora - 5000;
  await lojaEdita(loja.page, `() => { const wd = { ...getWD(44) }; wd.funcs = [...wd.funcs]; wd.funcs[2] = { ...wd.funcs[2], horario: '10:00-18:00' }; setWD(44, wd); }`);
  check('exclusão feita no celular não é desfeita pela loja com a tela antiga', f(0).nome === '' && f(0)._removidoNome === 'ANA', JSON.stringify(f(0)));
  await loja.page.evaluate(() => _removerFuncionarioConfirmado(2, 'BRUNO', 'ERRO_CADASTRO'));
  await loja.page.evaluate(async () => { clearTimeout(syncTimer); await _syncNow(); });
  check('exclusão feita na loja sobe', f(2).nome === '' && f(2)._removidoNome === 'BRUNO', JSON.stringify(f(2)));
  check('sem erro de JavaScript no aparelho da loja', loja.erros.length === 0, loja.erros.join(' | '));
  await loja.ctx.close();

  // ══ 7. Primeira abertura depois da atualização: cópia local antiga, sem assinatura ══
  srv = semente(); f(1).tipo = 'HORISTA'; srv['44']._lastEdit = T0 + 60000;
  const velha = semente();   // o que ficou no localStorage do computador da loja
  const l2 = await novoAparelho(velha);
  check('sem assinatura ainda, a carga usa a regra de antes e traz o servidor mais novo', await l2.page.evaluate(() => getWD(44).funcs[1].tipo === 'HORISTA'));
  check('e a assinatura passa a existir depois da primeira carga', await l2.page.evaluate(() => { const b = ld('baseSync', null); return !!(b && b['44'] && b['44'].f.length === 3 && b['44'].m); }));
  check('a assinatura é pequena (não é uma segunda cópia do all_data)', await l2.page.evaluate(() => JSON.stringify(ld('baseSync', {})).length < 400));
  check('sem erro de JavaScript', l2.erros.length === 0, l2.erros.join(' | '));
  await l2.ctx.close();

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
