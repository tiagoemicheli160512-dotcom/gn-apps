// "No app check-list aba banco, está aparecendo nomes duplicados, com nome e outro com
//  sobrenome nome, e tem gente que já saiu como dayane e Cristiane."
//
// Fixture = a Bangu de verdade (gn_banco_horas + cadastro da semana 40), que é a loja do
// print. O 1º ciclo dela fechou em 25/09; o ciclo em vista hoje é 26/09 → 25/03 e só tem
// lançamento em Out/26. Tudo que a tela mostrava a mais vinha de Mar..Set, ciclo encerrado.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const FX  = require('' + CAMINHOS.fix('fx_bangu.json') + '');

const CICLO_ATUAL   = ['2026-10','2026-11','2026-12','2027-01','2027-02','2027-03'];
const CICLO_FECHADO = ['2026-03','2026-04','2026-05','2026-06','2026-07','2026-08','2026-09'];

let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

// Chama _bhTodosFuncionarios com o estado montado. _bhRegistros e comissoesWD são `let` no
// escopo do script — atribuir pelo identificador alcança a mesma binding.
async function lista(page, regs, funcs, meses) {
  return page.evaluate(({ regs, funcs, meses }) => {
    try {
      _bhRegistros = regs;
      comissoesWD = { funcs };
      return meses ? _bhTodosFuncionarios(meses) : _bhTodosFuncionarios();
    } catch (e) { return { erro: String(e && e.message) }; }
  }, { regs, funcs, meses });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();

  let pronto = false;
  for (let t = 1; t <= 3 && !pronto; t++) {
    await page.goto('file://' + CHK);
    try {
      // Esperar so pela funcao nao bastava: ela e icada e ja existe no inicio do script.
      // Sob carga, o evaluate seguinte caia em "Cannot access '_bhRegistros' before
      // initialization" — corrida, nao defeito do app.
      await CAMINHOS.esperarApp(page, ['_bhRegistros', 'LOJA'], ['_bhTodosFuncionarios']);
      pronto = true;
    } catch (e) { /* retry */ }
  }
  if (!pronto) { console.log('FALHOU: a aba Banco não carregou'); process.exit(1); }

  const atual = await lista(page, FX.regs, FX.funcs, CICLO_ATUAL);
  if (atual && atual.erro) { console.log('FALHOU: ' + atual.erro); process.exit(1); }

  // ── 1. Gente que saiu: último lançamento em ciclo já encerrado ──
  ['ELZA QUEIROZ', 'ELZA XAVIER ( CHEFE)', 'IVO QUEIROZ', 'LIA GOMES', 'VERA URBANO'].forEach(n =>
    check(`quem saiu não aparece no ciclo novo: ${n}`, !atual.includes(n)));

  // ── 2. Nome curto ao lado do nome completo ──
  [['CÁIO KLEIN', 'CÁIO WANDER'], ['NARA HORTA', 'NARA OVIDIO'], ['SARA ZENHA', 'TULIO BRAGA'],
   ['UBIRATA SERRA', 'UBIRATA WANDER'], ['VERA HORTA', 'VERA JARDIM']].forEach(([curto, completo]) => {
    check(`"${curto}" sai e "${completo}" fica`, !atual.includes(curto) && atual.includes(completo));
  });
  check('as duas Julianas do cadastro continuam, cada uma na sua linha',
    atual.includes('NARA OVIDIO') && atual.includes('NARA SERRA'));

  // ── 3. Ninguém do cadastro é perdido ──
  const faltando = FX.funcs.filter(f => !f.arquivado).map(f => f.nome.trim()).filter(n => !atual.includes(n));
  check('todo mundo do cadastro continua na lista', faltando.length === 0);
  if (faltando.length) console.log('   faltaram: ' + faltando.join(' | '));

  // ── 4. Quem tem lançamento NO ciclo fica, mesmo fora do cadastro ──
  check('quem tem lançamento no ciclo em vista fica, mesmo fora do cadastro (RUI ZENHA)',
    atual.includes('RUI ZENHA'));

  // ── 5. Sem duplicata ──
  check('nenhum nome repetido na lista', new Set(atual).size === atual.length);

  // ── 6. O apelido de renomeação continua valendo ──
  check('nome antigo gravado pela renomeação não abre linha (BENTO BRAGA)', !atual.includes('BENTO BRAGA'));
  check('nem KELLY MATOS', !atual.includes('KELLY MATOS'));

  // ── 7. O ciclo encerrado devolve todo mundo: lá as horas são deles ──
  const fechado = await lista(page, FX.regs, FX.funcs, CICLO_FECHADO);
  ['ELZA QUEIROZ', 'ELZA XAVIER ( CHEFE)', 'LIA GOMES', 'VERA URBANO', 'NARA HORTA', 'SARA ZENHA', 'UBIRATA SERRA'].forEach(n =>
    check(`consultando o ciclo encerrado, ${n} volta`, fechado.includes(n)));

  // ── 8. Arquivado: sai sem hora no ciclo, fica com hora no ciclo ──
  const comArquivado = FX.funcs.map(f => f.nome === 'PEDRO GOMES' ? { ...f, arquivado: true } : f);
  const semHora = await lista(page, FX.regs, comArquivado, CICLO_ATUAL);
  check('arquivado sem hora no ciclo some da grade', !semHora.includes('PEDRO GOMES'));

  const regsComHora = { ...FX.regs, '2026-11': [{ nome: 'PEDRO GOMES', horas: 6.5, obs: '' }] };
  const comHora = await lista(page, regsComHora, comArquivado, CICLO_ATUAL);
  check('arquivado COM hora no ciclo continua, pra o saldo ser acertado', comHora.includes('PEDRO GOMES'));

  // ── 9. Sem argumento, comportamento antigo (chamada defensiva não quebra) ──
  const tudo = await lista(page, FX.regs, FX.funcs, null);
  check('sem os meses, varre tudo como antes', tudo.includes('ELZA QUEIROZ') && tudo.includes('NARA HORTA'));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
