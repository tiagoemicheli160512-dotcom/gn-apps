// "Estoquista: não ter acesso, só de 08h às 17h na semana; feriado é folga automática, e
//  domingo também; sábado de 08h às 12h; podendo acrescentar folga normalmente em qualquer
//  dia." (18/11/2026)
//
// Cobra (gnEscalaAcesso.verificar com o relógio pedido):
//  · seg–sex 08:00–16:59 entra; 07:59 e 17:00 não; sáb 08:00–11:59 entra, 12:00 não;
//  · domingo e feriado (nacional, inclusive 20/11; estadual/municipal da loja) = folga;
//  · a folga da escala continua valendo em dia útil, dentro do horário;
//  · NÃO pega: gerente/sub/caixa, quem é GERAL, Maglia; liberação de supervisor libera;
//  · a tela explica a regra e não oferece "já corrigiram a escala" (não é escala).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 300))); c ? ok++ : falhou++; };

const P = 'PRESENTE';
// Semana 45 (16–22/11/2026): Jandy de folga na terça 17.
const SEMANA = { funcs: [{ nome: 'Jandy NEVES - estoque', setor: 'Estoque', ferias_ini: '', ferias_fim: '', dias: [P, 'FOLGA', P, P, P, P, 'FOLGA'] }] };
const est = (loja, vinc) => ({ id: 3, nome: 'Jandy', loja: loja || 'CAXIAS', cargo: 'estoquista', permissoes: vinc ? { escala_nome: vinc } : {}, ts: Date.now() });

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 } });
  await ctx.route('**/rest/v1/**', r => {
    const u = decodeURIComponent(r.request().url());
    if (/gn_comissoes/.test(u) && /all_data->/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ '45': SEMANA }]) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => !!window.gnEscalaAcesso && !!window.gnFeriadosLocais, null, { timeout: 30000 });
  if (!(await page.evaluate(() => typeof gnEscalaAcesso._horarioEstoque === 'function'))) {
    console.log('FALHOU: a trava de horário do estoque não existe neste arquivo (contraprova esperada — é nova)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }
  const v = (sess, agora) => page.evaluate(([s, a]) => { try { localStorage.removeItem('gn_escala_cache'); localStorage.removeItem('gn_escala_liberacao'); } catch (e) {}
    return gnEscalaAcesso.verificar(s, { agora: a, hoje: a.slice(0, 10), semCache: true }); }, [sess, agora]);
  const bl = r => r.bloqueado ? r.motivo : 'livre';

  // Dias úteis / sábado / domingo — quarta 18/11, sábado 21/11, domingo 22/11.
  const casos = {
    'qua 07:59': await v(est(), '2026-11-18T07:59:00'), 'qua 08:00': await v(est(), '2026-11-18T08:00:00'),
    'qua 16:59': await v(est(), '2026-11-18T16:59:00'), 'qua 17:00': await v(est(), '2026-11-18T17:00:00'),
    'sáb 08:00': await v(est(), '2026-11-21T08:00:00'), 'sáb 11:59': await v(est(), '2026-11-21T11:59:00'),
    'sáb 12:00': await v(est(), '2026-11-21T12:00:00'), 'dom 10:00': await v(est(), '2026-11-22T10:00:00'),
  };
  const m = Object.fromEntries(Object.entries(casos).map(([k, r]) => [k, bl(r)]));
  check('dia útil: entra de 08:00 a 16:59; 07:59 e 17:00 não', m['qua 07:59'] === 'estoque_horario' && m['qua 08:00'] === 'livre' && m['qua 16:59'] === 'livre' && m['qua 17:00'] === 'estoque_horario', m);
  check('sábado: entra de 08:00 a 11:59; 12:00 não', m['sáb 08:00'] === 'livre' && m['sáb 11:59'] === 'livre' && m['sáb 12:00'] === 'estoque_horario', m);
  check('domingo: folga automática, mesmo de dia', m['dom 10:00'] === 'estoque_domingo', m);

  const fer = {
    consciencia: await v(est(), '2026-11-20T10:00:00'), natal: await v(est(), '2026-12-25T10:00:00'),
    corpus: await v(est(), '2026-06-04T10:00:00'), carnaval: await v(est(), '2026-02-17T10:00:00'),
    caxiasAniv: await v(est('CAXIAS'), '2026-12-31T10:00:00'), bangu3112: await v(est('BANGU'), '2026-12-31T10:00:00'),
    rioSaoSeb: await v(est('BANGU'), '2027-01-20T10:00:00'), rjSaoJorge: await v(est('PEDREIRA'), '2026-04-23T10:00:00'),
    itaqueraSaoJorge: await v(est('ITAQUERA'), '2026-04-23T10:00:00'),
  };
  check('feriado nacional = folga (20/11 Consciência Negra, Natal, Corpus Christi, Carnaval)',
    ['consciencia', 'natal', 'corpus', 'carnaval'].every(k => fer[k].motivo === 'estoque_feriado') && /Consciência Negra/.test(fer.consciencia.feriado), fer);
  check('feriado local só na loja dele (31/12 Caxias sim, Bangu não; 20/01 Rio; São Jorge RJ sim, Itaquera não)',
    fer.caxiasAniv.motivo === 'estoque_feriado' && !fer.bangu3112.bloqueado && fer.rioSaoSeb.motivo === 'estoque_feriado'
    && fer.rjSaoJorge.motivo === 'estoque_feriado' && !fer.itaqueraSaoJorge.bloqueado, Object.fromEntries(Object.entries(fer).map(([k, r]) => [k, bl(r)])));

  const folgaEscala = await v(est('CAXIAS', 'Jandy NEVES - estoque'), '2026-11-17T10:00:00');
  const trabalhaEscala = await v(est('CAXIAS', 'Jandy NEVES - estoque'), '2026-11-18T10:00:00');
  check('folga marcada na escala num dia útil continua valendo (terça 17, dentro do horário)', folgaEscala.bloqueado && folgaEscala.motivo === 'folga', folgaEscala);
  check('…e no dia de trabalho, dentro do horário, entra', !trabalhaEscala.bloqueado, trabalhaEscala);

  const outros = {
    gerente: await v(Object.assign(est(), { cargo: 'gerente' }), '2026-11-18T22:00:00'),
    caixa: await v(Object.assign(est(), { cargo: 'caixa' }), '2026-11-22T10:00:00'),
    geral: await v(Object.assign(est(), { loja: 'GERAL' }), '2026-11-22T10:00:00'),
    maglia: await v(est('MAGLIA'), '2026-11-22T10:00:00'),
  };
  check('não pega gerente (22h), caixa (domingo), GERAL, nem a Maglia', Object.values(outros).every(r => !r.bloqueado), Object.fromEntries(Object.entries(outros).map(([k, r]) => [k, bl(r)])));

  const lib = await page.evaluate(() => { localStorage.setItem('gn_escala_liberacao', JSON.stringify({ uid: 3, dia: '2026-11-22', por: 'Sup', ts: Date.now() }));
    return gnEscalaAcesso.verificar({ id: 3, nome: 'Jandy', loja: 'CAXIAS', cargo: 'estoquista', permissoes: {} }, { agora: '2026-11-22T10:00:00', hoje: '2026-11-22', semCache: true }); });
  check('liberação do supervisor no dia libera o estoquista', !lib.bloqueado, lib);

  const tela = await page.evaluate(() => {
    gnEscalaAcesso.mostrar({ id: 3, nome: 'Jandy', loja: 'CAXIAS' }, { bloqueado: true, motivo: 'estoque_horario', origem: 'horario', hora: '17:05' });
    const e = document.getElementById('gn-escala-bloqueio');
    const out = { txt: e.innerText.replace(/\s+/g, ' '), retry: getComputedStyle(e.querySelector('#gn-eb-retry')).display, liberar: !!e.querySelector('#gn-eb-abrir') };
    gnEscalaAcesso.fechar(); return out;
  });
  check('a tela diz o horário de agora e a regra (seg–sex 08h–17h, sáb 08h–12h, dom/feriado folga)',
    /Fora do horário do estoque/.test(tela.txt) && /17:05/.test(tela.txt) && /segunda a sexta, das 08h às 17h/.test(tela.txt) && /sábado das 08h às 12h/.test(tela.txt) && /Domingo e feriado são folga/.test(tela.txt), tela.txt);
  check('…com liberação por supervisor, sem o "já corrigiram a escala" (não é escala)', tela.liberar && tela.retry === 'none', tela);

  const fonte = require('fs').readFileSync(CAMINHOS.pub('gn-escala-acesso.js'), 'utf8');
  check('com o app aberto, reavalia a cada minuto (fecha às 17h sozinho)', /ESTOQUE_CARGOS\.indexOf[\s\S]{0,120}_rodada\(\); \}\s*\}, 60000\)/.test(fonte));

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
