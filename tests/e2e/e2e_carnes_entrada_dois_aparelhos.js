// "Ficou bom as carnes. Porém ainda tem duplicada no recebimento, casos no camarão e na
//  carne seca e carne de sol. Na semana atual."
//
// MEDIDO no banco antes de mexer — semana 26/10, cinco cortes duplicados, e em TODOS um
// recebimento só, com os dois dias trazendo o espelho autoEnt da própria automação:
//   Boulevard    camarão     ent_ter 12  + ent_qua 12   (1 recebimento de 12)
//   Nova América camarão     ent_ter 24  + ent_qua 24   (1 de 24)
//   Nova América carne seca  ent_ter 20  + ent_qui 20   (1 de 20)
//   Pedreira     carne sol   ent_ter 120 + ent_qua 120  (1 de 120)
//   São Gonçalo  camarão     ent_ter 12  + ent_qua 12   (1 de 12)
// Um dia é a data PROGRAMADA da entrega, o outro é o dia em que a portaria validou.
//
// A CAUSA, que o conserto anterior não alcançou: a automação resolve o dia da entrega pela
// fonte (nota casada pelo número → validado_em → data programada) e devolve os sete dias
// como UMA resposta. O aparelho que rodou antes da portaria validar ficou com a resposta
// antiga (terça) no estado dele. A automação de outro aparelho, depois da validação,
// escreve quarta e limpa terça — mas a limpeza era registrada em `_carnesLimpos`, que vive
// no localStorage DAQUELE aparelho, e é zerada no save seguinte. O primeiro aparelho nunca
// soube: no primeiro campo que alguém toca nele, _mesclarCarnesAntesDeSalvar mescla dia a
// dia, o ent_ter dele vence o servidor por ser "não vazio", e a terça volta. O outro limpa
// de novo, esse devolve — fica assim pra sempre, com 12 kg aparecendo como 24.
//
// O conserto: a resposta da automação é um BLOCO e viaja inteiro, de quem rodou por último
// (estampa `autoEntEm`), com os dias que ele não tem indo embora.
//
// O QUE TORNA O CONSERTO DIFÍCIL, e é o que metade desta suíte cobra: o bloco só pode
// levar os dias que são DA AUTOMAÇÃO. A rede corrige entrada à mão, e um bloco guloso
// apagaria a correção da loja a cada carga de semana — bem pior que o número dobrado, que
// pelo menos se vê na tela. Por isso aqui se cobra tanto o dia fantasma sumir quanto o
// número digitado sobreviver, inclusive quando o bloco novo vem do próprio aparelho.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const SB_LIB = require('fs').readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

const ANTES  = '2026-10-28T10:00:00.000Z';   // rodada de antes da portaria validar
const DEPOIS = '2026-10-28T18:30:00.000Z';   // rodada de depois

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await CAMINHOS.fixarRelogio(ctx, '2026-10-29T16:50:00');
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status:200, contentType:'application/javascript', body:SB_LIB }));
  const subiu = [];
  await ctx.route('**/rest/v1/**', r => { subiu.push(r.request().method() + ' ' + r.request().url());
    r.fulfill({ status:200, contentType:'application/json', body:'[]' }); });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + CHK);
  await page.waitForFunction(() => { try {
    return typeof _mesclarCarnesAntesDeSalvar === 'function' && typeof _entDaAutomacao === 'function'
        && typeof _carnesLimposKey === 'function' && Array.isArray(CARNES_DEF)
        && Array.isArray(DIAS_SEMANA);
  } catch (e) { return false; } }, null, { timeout: 25000 });
  await page.evaluate(() => { hideLogin(); LOJA = 'Pedreira'; state.data = '2026-10-29';
    usuarioLogado = { id:1, nome:'Tiago', cargo:(CARGOS_EDITA_ENTRADA_CARNE||['mestre'])[0], loja:'PEDREIRA' }; });

  // Estado limpo e SEM marca de limpeza: o conserto não pode depender dela, que é o que
  // vivia só num aparelho. Se alguma verificação daqui passar por causa da marca, ela não
  // está medindo o conserto.
  const montar = (local) => page.evaluate(({ local }) => {
    stateWeek.semanaInicio = '2026-10-26';
    stateWeek.carnes = {}; CARNES_DEF.forEach(c => { stateWeek.carnes[c.key] = {}; });
    stateWeek.carnes.carne_sol = local;
    _carnesLimpos = new Set();
    try { localStorage.removeItem(_carnesLimposKey()); } catch (e) {}
  }, { local });
  const mesclar = (serv) => page.evaluate(({ serv }) =>
    _mesclarCarnesAntesDeSalvar({ carne_sol: serv }).carne_sol, { serv });
  const somaEnt = (o) => ['seg','ter','qua','qui','sex','sab','dom']
    .reduce((t, d) => t + (parseFloat(o['ent_' + d]) || 0), 0);

  // ══ 1. O APARELHO ATRASADO NÃO DEVOLVE O DIA — o caso da Pedreira ════════════════
  // Local: a resposta de antes da validação (terça). Servidor: a de depois (quarta).
  await montar({ ent_ter: 120, autoEnt_ter: 120, autoEntEm: ANTES });
  const atrasado = await mesclar({ ent_qua: 120, autoEnt_qua: 120, autoEntEm: DEPOIS });
  check('o dia fantasma do aparelho atrasado não volta',
    atrasado.ent_ter === '' || atrasado.ent_ter === undefined, JSON.stringify(atrasado));
  check('e o espelho autoEnt daquele dia também não volta',
    atrasado.autoEnt_ter === undefined, JSON.stringify(atrasado));
  check('o dia certo, do bloco mais novo, permanece',
    Number(atrasado.ent_qua) === 120, JSON.stringify(atrasado));
  check('o total da semana volta a ser UM recebimento, não dois',
    somaEnt(atrasado) === 120, somaEnt(atrasado) + ' ' + JSON.stringify(atrasado));
  check('a estampa que fica é a da rodada mais nova',
    atrasado.autoEntEm === DEPOIS, JSON.stringify(atrasado));

  // A sessão aberta de ANTES do conserto não tem estampa nenhuma — é justamente o aparelho
  // que está com a aba aberta desde a manhã. Ele também não pode devolver o dia.
  await montar({ ent_ter: 120, autoEnt_ter: 120 });
  const semEstampa = await mesclar({ ent_qua: 120, autoEnt_qua: 120, autoEntEm: DEPOIS });
  check('sessão sem estampa (aberta desde antes) não devolve o dia fantasma',
    semEstampa.ent_ter === '' || semEstampa.ent_ter === undefined, JSON.stringify(semEstampa));
  check('e o total também fica em um recebimento',
    somaEnt(semEstampa) === 120, somaEnt(semEstampa) + ' ' + JSON.stringify(semEstampa));

  // Nova América carne seca: a troca foi terça → quinta, não terça → quarta. O dia que
  // some é o que o bloco novo não tem, qualquer que seja.
  await montar({ ent_ter: 20, autoEnt_ter: 20, autoEntEm: ANTES });
  const ate_qui = await mesclar({ ent_qui: 20, autoEnt_qui: 20, autoEntEm: DEPOIS });
  check('vale pra qualquer par de dias (terça → quinta)',
    (ate_qui.ent_ter === '' || ate_qui.ent_ter === undefined) && Number(ate_qui.ent_qui) === 20,
    JSON.stringify(ate_qui));

  // ══ 2. QUEM ACABOU DE RODAR MANDA — o sentido inverso ════════════════════════════
  // Nova América camarão é o caso contrário: a nota casada pelo número devolveu a terça,
  // então é a QUARTA que tem que sumir. O conserto não pode ser "apagar a terça".
  await montar({ ent_ter: 24, autoEnt_ter: 24, autoEntEm: DEPOIS });
  const inverso = await mesclar({ ent_qua: 24, autoEnt_qua: 24, autoEntEm: ANTES });
  check('quando a resposta nova é a terça, é a quarta que sai',
    inverso.ent_qua === '' || inverso.ent_qua === undefined, JSON.stringify(inverso));
  check('e a terça do bloco novo chega ao servidor',
    Number(inverso.ent_ter) === 24, JSON.stringify(inverso));
  check('também aqui o total é de um recebimento',
    somaEnt(inverso) === 24, somaEnt(inverso) + ' ' + JSON.stringify(inverso));

  // O caminho normal: a automação achou um dia que o servidor não tinha. Tem que subir.
  await montar({ ent_qua: 12, autoEnt_qua: 12, autoEntEm: DEPOIS });
  const novoDia = await mesclar({ autoEntEm: ANTES });
  check('dia novo da automação chega ao servidor que não tinha nada',
    Number(novoDia.ent_qua) === 12, JSON.stringify(novoDia));

  // ══ 3. O QUE NÃO PODE ACONTECER: a correção da loja sobrevive ════════════════════
  // É a metade que importa. Um bloco guloso apaga o número que a loja digitou a cada
  // carga de semana — defeito pior que o dobrado, porque não aparece na tela.
  await montar({ ent_ter: 15, autoEnt_ter: 12, autoEntEm: ANTES });
  const mao = await mesclar({ ent_qua: 12, autoEnt_qua: 12, autoEntEm: DEPOIS });
  check('número digitado à mão sobrevive ao bloco mais novo do servidor',
    Number(mao.ent_ter) === 15, JSON.stringify(mao));
  check('e o espelho segue 12 — é como a automação sabe que foi mexido',
    Number(mao.autoEnt_ter) === 12, JSON.stringify(mao));

  // O mesmo pelo outro lado: o bloco novo é o DESTE aparelho e o dia à mão está aqui.
  await montar({ ent_ter: 15, autoEnt_ter: 12, autoEntEm: DEPOIS });
  const maoNova = await mesclar({ ent_ter: 12, autoEnt_ter: 12, autoEntEm: ANTES });
  check('o bloco do próprio aparelho não apaga o número que ele tem digitado',
    Number(maoNova.ent_ter) === 15, JSON.stringify(maoNova));

  // Dia que a automação nunca tocou (compra fora da entrega, lançada à mão).
  await montar({ ent_sex: 8, autoEntEm: ANTES });
  const avulso = await mesclar({ ent_qua: 12, autoEnt_qua: 12, autoEntEm: DEPOIS });
  check('entrada à mão em dia sem espelho nenhum sobrevive',
    Number(avulso.ent_sex) === 8, JSON.stringify(avulso));

  // Campos que não são de dia não entram no bloco.
  await montar({ inicial: 99.8, contagem_final: 77.2, autoEntEm: ANTES });
  const fora = await mesclar({ inicial: '', contagem_final: '', ent_qua: 12, autoEnt_qua: 12, autoEntEm: DEPOIS });
  check('inicial e contagem_final não são do bloco e continuam vencendo',
    Number(fora.inicial) === 99.8 && Number(fora.contagem_final) === 77.2, JSON.stringify(fora));

  // A contagem do dia (ent_ é entrada; `ter` solto é contagem) também não é do bloco.
  await montar({ ter: '219.8', autoEntEm: ANTES });
  const contagem = await mesclar({ ter: '', ent_qua: 12, autoEnt_qua: 12, autoEntEm: DEPOIS });
  check('a contagem do dia não é confundida com a entrada do dia',
    String(contagem.ter) === '219.8', JSON.stringify(contagem));

  // ══ 4. DADO ANTIGO NÃO MUDA DE COMPORTAMENTO ═════════════════════════════════════
  // Sem estampa dos dois lados não há informação sobre quem rodou por último: a mesclagem
  // tem que ficar exatamente como era, senão a mudança alcança semanas já fechadas.
  await montar({ ent_ter: 120, autoEnt_ter: 120 });
  const antigo = await mesclar({ ent_qua: 120, autoEnt_qua: 120 });
  check('sem estampa nos dois lados, o valor local continua vencendo (como antes)',
    Number(antigo.ent_ter) === 120, JSON.stringify(antigo));
  check('e o dia que só o servidor tem permanece (como antes)',
    Number(antigo.ent_qua) === 120, JSON.stringify(antigo));

  // ══ 5. A ESTAMPA NÃO É DADO DA LOJA ══════════════════════════════════════════════
  // Se contasse como dado, toda semana aberta sem nada preenchido viraria linha no banco.
  // Medido pelo EFEITO (o upsert que sai, ou não), não copiando o predicado pra dentro do
  // teste: copiado, ele passava mesmo com a exclusão da estampa desfeita no app.
  const salvarCom = (carnes) => page.evaluate(async ({ carnes }) => {
    state.semanaInicio = '2026-10-26'; stateWeek.semanaInicio = '2026-10-26';
    stateWeek.carnes = {}; CARNES_DEF.forEach(c => { stateWeek.carnes[c.key] = { ...carnes }; });
    _carnesLimpos = new Set();
    try { await saveAll(); } catch (e) {}
  }, { carnes });

  subiu.length = 0;
  await salvarCom({ autoEntEm: '2026-10-29T16:00:00.000Z' });
  const soEstampa = subiu.filter(x => /checklist_carnes/.test(x) && !/^GET/.test(x));
  subiu.length = 0;
  await salvarCom({ autoEntEm: '2026-10-29T16:00:00.000Z', ent_qua: 12, autoEnt_qua: 12 });
  const comDado = subiu.filter(x => /checklist_carnes/.test(x) && !/^GET/.test(x));
  check('semana que só tem a estampa não vira linha no banco',
    soEstampa.length === 0, soEstampa.join(' | '));
  check('e a mesma semana COM entrada vira (a sonda enxerga o upsert)',
    comDado.length > 0, subiu.filter(x => /checklist_carnes/.test(x)).join(' | '));

  // ══ 6. _entDaAutomacao: a fronteira entre o bloco e a loja ═══════════════════════
  const fronteira = await page.evaluate(() => ({
    igual:      _entDaAutomacao({ ent_ter: 12, autoEnt_ter: 12 }, 'ter'),
    igualTexto: _entDaAutomacao({ ent_ter: '12', autoEnt_ter: 12 }, 'ter'),
    limpoPelaAutomacao: _entDaAutomacao({ ent_ter: '', autoEnt_ter: 12 }, 'ter'),
    digitado:   _entDaAutomacao({ ent_ter: 15, autoEnt_ter: 12 }, 'ter'),
    semEspelho: _entDaAutomacao({ ent_ter: 12 }, 'ter'),
    vazioTotal: _entDaAutomacao({}, 'ter'),
  }));
  check('valor igual ao espelho é do bloco', fronteira.igual === true, JSON.stringify(fronteira));
  check('e texto x número não muda isso', fronteira.igualTexto === true, JSON.stringify(fronteira));
  check('dia já limpo pela automação é do bloco', fronteira.limpoPelaAutomacao === true, JSON.stringify(fronteira));
  check('valor diferente do espelho é da loja', fronteira.digitado === false, JSON.stringify(fronteira));
  check('valor sem espelho nenhum é da loja', fronteira.semEspelho === false, JSON.stringify(fronteira));
  check('objeto vazio não é do bloco', fronteira.vazioTotal === false, JSON.stringify(fronteira));

  // ══ 7. A AUTOMAÇÃO ESCREVE A ESTAMPA ═════════════════════════════════════════════
  // Sem isto nada acima funciona em produção: os dois lados ficariam sem estampa pra
  // sempre e a mesclagem seguiria dia a dia, exatamente como no defeito relatado.
  const estampou = await page.evaluate(async () => {
    state.semanaInicio = '2026-10-26';
    stateWeek.semanaInicio = '2026-10-26';
    stateWeek.carnes = {}; CARNES_DEF.forEach(c => { stateWeek.carnes[c.key] = {}; });
    _carnesAutoCarregando = false;
    await _carregarCarnesAutoLojas();
    return CARNES_DEF.map(c => (stateWeek.carnes[c.key] || {}).autoEntEm);
  });
  check('a automação estampa a rodada em todos os cortes',
    estampou.length > 0 && estampou.every(v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)),
    JSON.stringify(estampou));

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase|NetworkError/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
