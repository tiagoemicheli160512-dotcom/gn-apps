// "No app em visitas no painel de gestão, quando tiro a foto e envio, aparece no meu caso
//  mestre, e no relatório aparece Tiago mestre. Queria mudar nos relatórios essa
//  nomenclatura, dar um ar de superioridade, e também acrescentar bom dia, boa tarde e boa
//  noite de acordo com o horário." (17/11/2026)
//
// O cargo gravado continua "mestre" (é chave de permissão); muda o RÓTULO nos relatórios:
// mestre → Diretoria, supervisor → Supervisão. Saudação pela hora, madrugada é boa noite.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };

async function abrir(browser, quando) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, quando);
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => { try { return typeof _visFotoLegenda === 'function' && typeof _buildTextoVisitasSup === 'function'; } catch (e) { return false; } }, null, { timeout: 25000 });
  return { ctx, page, erros };
}
const VIS = { id: 9, loja: 'BANGU', data: '2026-11-17', visitante: 'Tiago', cargo: 'mestre', hora_chegada: '09:00', hora_saida: '10:30', endereco: 'Rua X' };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const todos = [];
  const a = await abrir(browser, '2026-11-17T09:30:00');
  if (!(await a.page.evaluate(() => typeof window.gnCargoTitulo === 'function' && typeof window.gnSaudacao === 'function'))) {
    console.log('FALHOU: o título do cargo e a saudação não existem neste arquivo (contraprova esperada — são novos)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }
  const r = await a.page.evaluate((v) => {
    const h = n => window.gnSaudacao(new Date(2026, 10, 17, n, 10));
    const legenda = _visFotoLegenda(v, 'chegada');
    _visSupSelecionado = 'Tiago'; _visSupData = [v]; _visSupDe = '2026-11-17'; _visSupAte = '2026-11-17'; _visSupPeriodo = 'dia';
    const texto = _buildTextoVisitasSup(true).texto;
    // Lista da Home (quem visitou): mesmo rótulo.
    const sup = window.gnCargoTitulo('supervisor'), outro = window.gnCargoTitulo('gerente'), vazio = window.gnCargoTitulo('');
    return { horas: [4, 5, 11, 12, 17, 18, 23].map(h), legenda, texto, sup, outro, vazio };
  }, VIS);
  check('saudação pela hora: 04h boa noite, 05h–11h bom dia, 12h–17h boa tarde, 18h+ boa noite',
    JSON.stringify(r.horas) === JSON.stringify(['Boa noite', 'Bom dia', 'Bom dia', 'Boa tarde', 'Boa tarde', 'Boa noite', 'Boa noite']), r.horas);
  check('legenda da foto: "Tiago · Diretoria", não "mestre"', /👤 Tiago · Diretoria/.test(r.legenda) && !/mestre/i.test(r.legenda), r.legenda);
  check('relatório de visitas: abre com "Bom dia!" às 09h30 e traz "Tiago · Diretoria"', /^Bom dia! 👋/.test(r.texto) && /👤 Tiago · Diretoria/.test(r.texto) && !/mestre/i.test(r.texto), r.texto.slice(0, 200));
  check('supervisor vira "Supervisão"; outro cargo só ganha maiúscula; vazio fica vazio', r.sup === 'Supervisão' && r.outro === 'Gerente' && r.vazio === '', r);
  const env = await a.page.evaluate(async (v) => {
    _visFotoReg[v.id] = Object.assign({}, v, { foto_chegada: 'https://x/f.jpg' });
    window.fetch = async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) });
    navigator.canShare = () => true; let t = null; navigator.share = async d => { t = d.text; };
    await _visFotoCompartilhar(String(v.id), 'chegada'); return t;
  }, VIS);
  check('enviar a foto: o texto começa com a saudação e traz Diretoria', /^Bom dia!\n\n📍 Visita — Bangu/.test(env || '') && /Tiago · Diretoria/.test(env || ''), env);
  todos.push(...a.erros); await a.ctx.close();

  const n = await abrir(browser, '2026-11-17T20:15:00');
  const noite = await n.page.evaluate((v) => { _visSupSelecionado = 'Tiago'; _visSupData = [v]; _visSupDe = '2026-11-17'; _visSupAte = '2026-11-17'; _visSupPeriodo = 'dia'; return _buildTextoVisitasSup(true).texto; }, VIS);
  check('às 20h15 o relatório abre com "Boa noite!"', /^Boa noite! 👋/.test(noite), noite.slice(0, 40));
  todos.push(...n.erros); await n.ctx.close();

  check('nenhum erro de JavaScript', todos.length === 0, todos);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
