// Motor do raio-x da loja: _raioxDaLoja(lojaKey, datas) sobre o cru que o Painel já
// carrega. É função pura, e é ela que faz o chip do card, o painel detalhado e o
// relatório saírem do MESMO número — por isso o teste é aqui, não na tela.
//
// O que mais importa: contar cada coisa pela natureza dela. Falta é por DIA (3 faltas é
// 3). Férias é por PESSOA (uma semana inteira de férias é 1 pessoa, não 7). Advertência é
// documento de SEMANA, não de dia. Quadro de funcionários é foto, não soma — somar as
// semanas de um trimestre daria 13x o número de gente que a loja tem.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => {
  console.log((c ? 'OK: ' : 'FALHOU: ') + n);
  if (!c && extra !== undefined) console.log('      ' + extra);
  c ? ok++ : falhou++;
};

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message || e)));

  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try {
      await page.waitForFunction(() => {
        try { return typeof _raioxDaLoja === 'function' && typeof COMISSOES_CAL !== 'undefined' && COMISSOES_CAL.length > 0; }
        catch (e) { return false; }
      }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }

  // Duas semanas reais e consecutivas do calendário, pra montar o cenário em cima das
  // datas de verdade em vez de datas inventadas que não caem em nenhuma semana.
  const cal = await page.evaluate(() => {
    const i = 38;
    const iso = d => d.y + '-' + String(d.m).padStart(2, '0') + '-' + String(d.d).padStart(2, '0');
    return {
      idxA: i, idxB: i + 1,
      semA: COMISSOES_CAL[i].days.map(iso),
      semB: COMISSOES_CAL[i + 1].days.map(iso),
      comKeyBangu: LOJA_COM_KEY['BANGU'], chkKeyBangu: LOJA_DB_KEY['BANGU'],
    };
  });

  // Cenário: 4 pessoas em dois setores. Maria falta 2 dias e tem advertência nas DUAS
  // semanas; João tira a semana A inteira de férias; Ana tem 1 atestado e 1 suspensão;
  // Pedro não tem nada. Cada número abaixo é conferível na mão.
  const D = (dias) => { const a = Array(7).fill('PRESENTE'); Object.entries(dias).forEach(([i, v]) => a[i] = v); return a; };
  const CENARIO = {
    comissoes: [{
      loja: cal.comKeyBangu,
      all_data: {
        [cal.idxA]: { funcs: [
          { nome: 'Maria', setor: 'Cozinha', dias: D({ 0: 'FALTA', 3: 'FALTA' }), docs: { ADVERTENCIA: 'url1' } },
          { nome: 'João',  setor: 'Salão',   dias: D({ 0:'FÉRIAS',1:'FÉRIAS',2:'FÉRIAS',3:'FÉRIAS',4:'FÉRIAS',5:'FÉRIAS',6:'FÉRIAS' }), docs: {} },
          { nome: 'Ana',   setor: 'Cozinha', dias: D({ 2: 'ATESTADO' }), docs: {} },
          { nome: 'Pedro', setor: 'Salão',   dias: D({}), docs: {} },
        ] },
        [cal.idxB]: { funcs: [
          { nome: 'Maria', setor: 'Cozinha', dias: D({}), docs: { ADVERTENCIA: 'url2' } },
          { nome: 'João',  setor: 'Salão',   dias: D({}), docs: {} },
          { nome: 'Ana',   setor: 'Cozinha', dias: D({ 1: 'SUSPENSÃO' }), docs: { DEMISSAO: 'url3' } },
          { nome: 'Pedro', setor: 'Salão',   dias: D({}), docs: {} },
        ] },
      },
    }],
    // Salário do setor: Cozinha 2200 → hora 10,00. Salão sem salário cadastrado.
    bhCfg: { [cal.chkKeyBangu]: { periodo_inicio: '2026-01-01', salariosSetor: { Cozinha: 2200 } } },
    bhMeses: [{ loja: cal.chkKeyBangu, mes: cal.semA[0].slice(0, 7), registros: [
      { nome: 'Maria', horas: -12.5, obs: '' },
      { nome: 'Ana',   horas: 4,     obs: '' },
      { nome: 'Pedro', horas: 0,     obs: '' },
      { nome: 'João',  horas: -3,    obs: '', semBanco: true },
      // Carlos tem saldo mas não está na escala da semana (saiu da loja, ou a escala
      // mudou). Sem escala não há setor, sem setor não há salário — o saldo em horas
      // continua valendo, o valor em R$ é que não dá pra calcular.
      { nome: 'Carlos', horas: 6,    obs: '' },
    ] }],
    cancel: { BANGU: [
      { data: cal.semA[1], valor: 120.50, motivo: 'Cliente desistiu', autor: 'Marcos' },
      { data: cal.semA[1], valor: 45.98,  motivo: 'Erro de comanda',  autor: 'Ana' },
    ] },
    lojas: [{ loja: cal.comKeyBangu, all_data: { avariasAll: { [cal.comKeyBangu]: [
      { ts: cal.semA[2] + 'T10:00:00', valorTotal: 300, tipo: 'quebra', status: 'ok' },
      { ts: cal.semA[2] + 'T11:00:00', valorTotal: 999, tipo: 'quebra', status: 'cancelado' },
      { ts: cal.semA[2] + 'T12:00:00', valorTotal: 888, tipo: 'transferencia_dinheiro', status: 'ok' },
    ] } } }],
    semConf: { BANGU: [{ data: cal.semA[0], turno: 'NOITE' }, { data: cal.semB[0], turno: 'DIA' }] },
  };

  const calc = (datas) => page.evaluate(({ CENARIO, datas }) => {
    // Atribuição por NOME, sem `window.`: as variáveis do painel são `let` no topo do
    // script, e `let` de topo não vira propriedade de window — escrever em
    // window._dashComissoesAll criaria uma propriedade nova que o motor nunca lê.
    _dashComissoesAll = CENARIO.comissoes;
    _dashBhCfg = CENARIO.bhCfg;
    _dashBhMesesRows = CENARIO.bhMeses;
    _dashCancelPer = CENARIO.cancel;
    _dashLojasAll = CENARIO.lojas;
    _dashCaixaSemConferencia = CENARIO.semConf;
    return _raioxDaLoja('BANGU', datas);
  }, { CENARIO, datas });

  const A = await calc(cal.semA);                       // só a semana A
  const AB = await calc(cal.semA.concat(cal.semB));     // as duas semanas
  const umDia = await calc([cal.semA[0]]);              // só a segunda-feira

  // ── Ocorrências: falta é por DIA ────────────────────────────────────────────
  check('conta as 2 faltas da Maria na semana', A.ocor.FALTA === 2, 'veio ' + A.ocor.FALTA);
  check('conta o atestado da Ana', A.ocor.ATESTADO === 1, 'veio ' + A.ocor.ATESTADO);
  check('suspensão fica fora da semana em que não houve', A.ocor['SUSPENSÃO'] === 0);
  check('e aparece na semana em que houve', AB.ocor['SUSPENSÃO'] === 1);

  // ── Advertência é documento de SEMANA, não de dia ───────────────────────────
  check('advertência conta 1 por semana tocada, não 1 por dia',
    A.ocor.ADVERTENCIA === 1 && AB.ocor.ADVERTENCIA === 2,
    'semana=' + A.ocor.ADVERTENCIA + ' duas=' + AB.ocor.ADVERTENCIA);
  check('demissão idem', AB.ocor.DEMISSAO === 1 && A.ocor.DEMISSAO === 0);
  check('o total soma tudo (2 faltas + 1 atestado + 1 advertência)', A.ocor.total === 4, 'veio ' + A.ocor.total);

  // ── Por dia ─────────────────────────────────────────────────────────────────
  check('as faltas ficam datadas no dia certo',
    (A.ocor.porDia[cal.semA[0]] || {}).FALTA === 1 && (A.ocor.porDia[cal.semA[3]] || {}).FALTA === 1,
    JSON.stringify(A.ocor.porDia));
  check('dia sem ocorrência não vira linha vazia', A.ocor.porDia[cal.semA[5]] === undefined);
  check('advertência NÃO é datada num dia (seria inventar a data)',
    !Object.values(A.ocor.porDia).some(d => d.ADVERTENCIA));

  // ── Férias: por PESSOA, não por dia ─────────────────────────────────────────
  check('7 dias de férias do João contam como 1 pessoa, não 7', A.ferias.total === 1, 'veio ' + A.ferias.total);
  check('e por setor', A.ferias.porSetor['Salão'] === 1 && !A.ferias.porSetor['Cozinha']);
  check('com o nome, pra saber quem é', A.ferias.pessoas.length === 1 && A.ferias.pessoas[0].nome === 'João');
  check('quem está de férias não vira falta', A.ocor.FALTA === 2);

  // ── Quadro: foto, não soma ──────────────────────────────────────────────────
  check('o quadro é 4 pessoas na semana', A.equipe.total === 4, 'veio ' + A.equipe.total);
  check('e continua 4 em duas semanas (lotação não se soma)', AB.equipe.total === 4, 'veio ' + AB.equipe.total);
  check('por setor: 2 na Cozinha, 2 no Salão',
    A.equipe.porSetor['Cozinha'] === 2 && A.equipe.porSetor['Salão'] === 2);

  // ── Recorte de um dia só ────────────────────────────────────────────────────
  check('um dia só traz a falta daquele dia', umDia.ocor.FALTA === 1, 'veio ' + umDia.ocor.FALTA);
  check('e as férias de quem estava de férias nele', umDia.ferias.total === 1);

  // ── Banco de horas ──────────────────────────────────────────────────────────
  check('separa horas devidas das horas a receber',
    A.bh.negativas === 12.5 && A.bh.positivas === 10, 'neg=' + A.bh.negativas + ' pos=' + A.bh.positivas);
  check('hora negativa é descontada sem adicional (12,5 × R$ 10)',
    Math.abs(A.bh.valorNegativo - 125) < 0.01, 'veio ' + A.bh.valorNegativo);
  check('hora positiva é paga com o adicional de 50% (4 × R$ 10 × 1,5)',
    Math.abs(A.bh.valorPositivo - 60) < 0.01, 'veio ' + A.bh.valorPositivo);
  check('quem está marcado semBanco fica de fora', !A.bh.graves.some(g => g.nome === 'João'));
  check('saldo zero não entra na lista de graves', !A.bh.graves.some(g => g.nome === 'Pedro'));
  check('os graves vêm do maior saldo pro menor', A.bh.graves[0].nome === 'Maria');
  check('setor sem salário cadastrado é sinalizado, em vez de virar R$ 0',
    A.bh.semSalario === true);
  check('quem tem saldo mas não está na escala mantém as horas e fica sem valor',
    (A.bh.graves.find(g => g.nome === 'Carlos') || {}).horas === 6
    && (A.bh.graves.find(g => g.nome === 'Carlos') || {}).valor === 0,
    JSON.stringify(A.bh.graves));
  check('e o valor em R$ só soma quem tem salário (4h da Ana, não as 6h do Carlos)',
    Math.abs(A.bh.valorPositivo - 60) < 0.01, 'veio ' + A.bh.valorPositivo);

  // ── Cancelamentos, avarias, caixa ───────────────────────────────────────────
  check('soma as notas canceladas do período',
    A.cancel.qtd === 2 && Math.abs(A.cancel.valor - 166.48) < 0.01, JSON.stringify(A.cancel));
  check('guardando quem autorizou', A.cancel.itens.some(i => i.autor === 'Marcos'));
  check('avaria cancelada e transferência de dinheiro não são perda',
    A.avarias.qtd === 1 && A.avarias.valor === 300, JSON.stringify(A.avarias));
  check('caixa sem conferência é recortado pelo período',
    A.caixaSemConf.qtd === 1 && AB.caixaSemConf.qtd === 2);

  // ── Casos de borda ──────────────────────────────────────────────────────────
  // ── Semana herdada não repete o documento ───────────────────────────────────
  // A semana C não tem registro próprio: a escala dela é herdada da B, e a herança copia
  // o funcionário inteiro, docs junto. Se o documento fosse contado na herdada, a mesma
  // advertência da Maria apareceria de novo — num trimestre, treze vezes.
  const semC = await page.evaluate(idx => {
    const iso = d => d.y + '-' + String(d.m).padStart(2,'0') + '-' + String(d.d).padStart(2,'0');
    return COMISSOES_CAL[idx].days.map(iso);
  }, cal.idxB + 1);
  const ABC = await calc(cal.semA.concat(cal.semB).concat(semC));
  check('semana herdada não repete a advertência da semana anterior',
    ABC.ocor.ADVERTENCIA === 2, 'veio ' + ABC.ocor.ADVERTENCIA + ' (duas semanas salvas = 2)');
  check('nem a demissão', ABC.ocor.DEMISSAO === 1, 'veio ' + ABC.ocor.DEMISSAO);
  check('mas o quadro de funcionários continua valendo na semana herdada',
    ABC.equipe.total === 4, 'veio ' + ABC.equipe.total);

  // ── Escala em branco não pode virar "nenhuma ocorrência" ────────────────────
  // Medido no banco: em agosto, Campo Grande ficou com 2 das 5 semanas sem escala
  // lançada e o card do mês deu ZERO falta, enquanto as outras lojas marcaram de 4 a 20.
  // Zero falta num mês inteiro não é mês impecável, é escala que não foi lançada.
  check('o panorama conta as semanas do período', A.escala.semanas === 1 && AB.escala.semanas === 2,
    JSON.stringify({ A: A.escala, AB: AB.escala }));
  check('semana com escala salva não é marcada como em branco', A.escala.semRegistro === 0);
  check('semana sem escala salva é contada e fica visível',
    ABC.escala.semRegistro === 1 && ABC.escala.semanas === 3, JSON.stringify(ABC.escala));

  const vazio = await calc([]);
  check('período vazio devolve panorama zerado, não quebra',
    vazio.ocor.total === 0 && vazio.equipe.total === 0 && vazio.cancel.qtd === 0);
  const semLoja = await page.evaluate(() => _raioxDaLoja('NAO_EXISTE', ['2026-09-21']));
  check('loja desconhecida devolve zerado em vez de estourar', semLoja.ocor.total === 0);

  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));

  await ctx.close();
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
