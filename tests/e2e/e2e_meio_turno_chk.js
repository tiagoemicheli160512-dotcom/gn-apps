// O Gorjetas não é o único lugar onde a escala é preenchida: o Check-list tem o mesmo
// editor, gravando no MESMO gn_comissoes. Se o meio turno existisse só num dos dois, o
// <select> do outro não teria a opção — e um dia já marcado como meio turno cairia na
// primeira opção da lista na primeira vez que alguém encostasse nele, trocando o
// pagamento sem avisar ninguém.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + extra); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  // O gn-checklist.html é o maior arquivo da suíte e puxa oito scripts: uma espera única
  // de 20s passava na maioria das vezes e estourava em uma a cada três neste container.
  // Mesma repetição que os outros testes da série já usam — um teste que falha sozinho
  // de vez em quando é pior que teste nenhum, porque ensina a ignorar o vermelho.
  for (let t = 1; ; t++) {
    await page.goto(('file://' + CAMINHOS.pub('gn-checklist.html')));
    try {
      // Esperar por um const avaliado na ordem, não por função içada: declaração de
      // função existe com o script ainda no meio da execução.
      await page.waitForFunction(() => { try {
        return typeof COMISSOES_STATUS === 'object' && COMISSOES_STATUS !== null && typeof gnTurnoDoDia === 'function';
      } catch (e) { return false; } }, { timeout: 30000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('o Check-list não carregou em 4 tentativas'); }
  }

  check('o Check-list conhece o status MEIO TURNO',
    await page.evaluate(() => COMISSOES_STATUS.includes('MEIO TURNO')));
  check('com a mesma abreviação do Gorjetas (MT)',
    await page.evaluate(() => COMISSOES_STATUS_ABREV['MEIO TURNO']) === 'MT');
  check('e o conta como dia trabalhado, não como falta',
    await page.evaluate(() => ESCALA_PRESENTE_SET.has('MEIO TURNO')));
  check('tem cor própria na escala (não cai no cinza de "sem status")',
    !!(await page.evaluate(() => ESCALA_STATUS_COLOR['MEIO TURNO'])));
  check('e sabe gravar o turno', await page.evaluate(() => typeof updComissoesTurno === 'function'));

  // As funções do cálculo chegam aqui pelo gn-lojas-config.js, que o Check-list carrega.
  check('o cálculo compartilhado está disponível no Check-list',
    await page.evaluate(() => typeof gnFatorDoDia === 'function' && typeof gnMeioTurnoFator === 'function'));
  check('e a fração é a mesma dos dois lados: 70% dia, 30% noite',
    await page.evaluate(() => gnMeioTurnoFator('DIA') === 0.7 && gnMeioTurnoFator('NOITE') === 0.3));

  // O editor de escala do Check-list monta o <select> com a lista acima: provar que a
  // opção sai mesmo no HTML, e com o coletor junto.
  const marcado = await page.evaluate(() => {
    const f = { nome: 'Teste', dias: Array(7).fill('PRESENTE'), turnos: Array(7).fill(null) };
    f.dias[2] = 'MEIO TURNO'; f.turnos[2] = 'NOITE';
    const st = f.dias[2];
    const opts = COMISSOES_STATUS.map(s => `<option value="${s}"${s === st ? ' selected' : ''}>${COMISSOES_STATUS_ABREV[s]}</option>`).join('');
    const turnoHtml = st === 'MEIO TURNO' ? `<select class="turno-sel"><option value="DIA"${gnTurnoDoDia(f, 2) === 'DIA' ? ' selected' : ''}>Dia 70%</option><option value="NOITE"${gnTurnoDoDia(f, 2) === 'NOITE' ? ' selected' : ''}>Noite 30%</option></select>` : '';
    const d = document.createElement('div'); d.innerHTML = opts + turnoHtml;
    const sel = d.querySelector('select.turno-sel');
    return { temOpcao: /value="MEIO TURNO" selected/.test(opts), temColetor: !!sel,
             turnoMarcado: sel ? sel.value : null };
  });
  check('o dia marcado como meio turno sai selecionado no <select>', marcado.temOpcao);
  check('e vem com o coletor de turno junto', marcado.temColetor);
  check('respeitando o turno já gravado (noite)', marcado.turnoMarcado === 'NOITE');

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase/i.test(e));
  check('nenhum erro de JS', reais.length === 0);
  reais.slice(0, 3).forEach(e => console.log('      ' + e.slice(0, 180)));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
