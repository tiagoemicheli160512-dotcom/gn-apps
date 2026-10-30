// "Quero ter uma informação mais precisa de quem está na loja. Quando for acessar o
//  aplicativo ele vai precisar confirmar que está na loja, e se tiver na loja fora do
//  horário cadastrado, bloquear e direcionar ele pra corrigir o seu horário na escala."
//
// O card de plantão da Home DEDUZ quem está na loja a partir da escala. Escala não é
// presença — e o dia em que as duas divergem é justamente o dia em que alguém precisa
// saber. Esta trava pede a confirmação.
//
// MEDIDO na base antes de montar:
//  · Login e escala são cadastros SEPARADOS, sem ligação nenhuma. Dos 30 gerentes/subs
//    ativos, `Carol` é `A.CAROLINA OLIVEIRA`, `Felix` é `ANDESON DO NASCIMENTO FELIX`,
//    `Thalyta` é `TALITA SILVA SERPA` (grafia diferente). Casar por primeiro nome erraria
//    em 5 dos 30, e erraria CALADO. Por isso a pessoa escolhe a própria linha uma vez.
//  · O `id` do funcionário na escala NÃO é identidade: em 6 semanas, 192 dos 860 pares
//    (loja,id) trocaram de pessoa. O vínculo é pelo nome, conferido também contra
//    _nomesAnteriores (o histórico de renome que a escala já guarda).
//  · Na semana atual, dos 174 dias-pessoa PRESENTE de gerente/sub, só 2 estão sem horário
//    preenchido — a trava não vai disparar por escala vazia.
//
// O QUE ESTA SUÍTE COBRA, e é o que diferencia a trava de um estorvo: ela cobra o EFEITO
// (o PATCH que saiu, a linha que entrou, a escala que mudou só no dia certo), não a regra
// reescrita aqui e comparada com ela mesma.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || process.env.ARQ || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

// Sexta, 30/10/2026 → semana 42, dia_idx 4 no calendário do app.
const HOJE = '2026-10-30';
const SEM = 42, DIA = 4;

const func = (nome, setor, dias, horarios, extra) => Object.assign({
  id: String(Math.floor(Math.random() * 90)), nome, setor,
  dias, horario_dias: horarios,
}, extra || {});
const h = (e, s) => ({ entrada: e, saida: s });
const SEMPRE = Array(7).fill('PRESENTE');

// A escala de BANGU: um gerente no horário, um sub fora do horário, uma pessoa de folga,
// e um homônimo parcial pra provar que sugestão ambígua não sugere nada.
function escalaBangu() {
  return {
    [String(SEM)]: {
      funcs: [
        func('A.CAROLINA OLIVEIRA ', 'Sub Gerente', SEMPRE, Array(7).fill(h('15:00', '23:00'))),
        func('ANTÔNIO FERNANDO ', 'Gerente', SEMPRE, Array(7).fill(h('08:00', '16:00'))),
        func('TAYNARA ALVES ', 'Sub Gerente',
          ['PRESENTE', 'PRESENTE', 'PRESENTE', 'PRESENTE', 'FOLGA', 'PRESENTE', 'PRESENTE'],
          Array(7).fill(h('15:00', '23:00'))),
        func('MARIA SILVA', 'Salão', SEMPRE, Array(7).fill(h('10:00', '18:00'))),
        // Dois "SILVA": o login `Silva` não pode ser casado com nenhum dos dois na marra.
        func('JOAO SILVA', 'Gerente', SEMPRE, Array(7).fill(h('09:00', '17:00'))),
        func('PEDRO SILVA', 'Gerente', SEMPRE, Array(7).fill(h('09:00', '17:00'))),
        // Renomeada: o vínculo antigo tem que continuar resolvendo.
        func('BEATRIZ NOVA', 'Gerente', SEMPRE, Array(7).fill(h('12:00', '20:00')),
          { _nomesAnteriores: ['BEATRIZ DOS SANTOS SILVA'] }),
      ],
    },
  };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });

  // O relógio do app fica em 16:20 de 30/10/2026: dentro da janela do sub (15–23), fora da
  // janela do gerente (08–16) por 20 min — dentro ainda, pela tolerância — e fora de vez
  // pra quem tem 09–17... não: 16:20 está dentro de 09–17. Os casos fora são construídos
  // com horário próprio em cada bloco.
  await CAMINHOS.fixarRelogio(ctx, HOJE + 'T16:20:00');

  const req = { patchUsuario: [], patchEscala: [], postPresenca: [], postTrilha: [] };
  let escala = escalaBangu();
  let presencaExistente = [];
  let usuarioEscalaNome = null;
  let falharEscala = false;
  let escalaAntesDoPatch = null;   // retrato que o app leu; usado pra provar a releitura

  await ctx.route('**/rest/v1/**', async r => {
    const q = r.request(), url = q.url(), m = q.method();
    const json = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/gn_presenca_loja/.test(url) && m === 'POST') {
      req.postPresenca.push(JSON.parse(q.postData() || '{}'));
      return r.fulfill({ status: 201, body: '' });
    }
    if (/gn_presenca_loja/.test(url)) return json(presencaExistente);
    if (/gn_escala_correcao/.test(url) && m === 'POST') {
      req.postTrilha.push(JSON.parse(q.postData() || '{}'));
      return r.fulfill({ status: 201, body: '' });
    }
    if (/gn_usuarios_publico/.test(url)) return json([{ escala_nome: usuarioEscalaNome }]);
    if (/gn_usuarios\?/.test(url) && m === 'PATCH') {
      const b = JSON.parse(q.postData() || '{}');
      req.patchUsuario.push(b);
      usuarioEscalaNome = b.escala_nome;
      return r.fulfill({ status: 204, body: '' });
    }
    if (/gn_comissoes/.test(url) && m === 'PATCH') {
      const b = JSON.parse(q.postData() || '{}');
      req.patchEscala.push(b);
      escala = b.all_data;
      return r.fulfill({ status: 204, body: '' });
    }
    if (/gn_comissoes/.test(url)) {
      if (falharEscala) return r.fulfill({ status: 500, body: 'erro' });
      escalaAntesDoPatch = JSON.parse(JSON.stringify(escala));
      return json([{ all_data: escala }]);
    }
    json([]);
  });

  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => { try {
    return typeof gnPresencaGuardiao === 'function' && typeof _presEstadoDoDia === 'function'
        && typeof showHome === 'function' && Array.isArray(LOJAS_LISTA || []);
  } catch (e) { return false; } }, null, { timeout: 25000 });

  // Entra como alguém, do zero, e espera a trava decidir.
  const entrar = async (nome, cargo, loja) => {
    await page.evaluate(({ nome, cargo, loja }) => {
      try { Object.keys(localStorage).filter(k => k.indexOf('gn_presenca_') === 0).forEach(k => localStorage.removeItem(k)); } catch (e) {}
      const ov = document.getElementById('gate-presenca'); if (ov) ov.remove();
      session = { id: 7, nome, cargo, loja, permissoes: {}, ts: Date.now() };
      masterLoja = null;
      LOJAS_LISTA = _computeLojasVisiveis(session);
      gnPresencaGuardiao({ sbUrl: SB_URL, sbKey: SB_KEY, sessao: session, aoSair: doLogout });
    }, { nome, cargo, loja });
    await page.waitForTimeout(450);
  };
  const trava = () => page.locator('#gate-presenca');
  const txt = async () => ((await trava().count()) ? (await trava().textContent()) : '').replace(/\s+/g, ' ').trim();
  const limpar = () => { req.patchUsuario.length = 0; req.patchEscala.length = 0; req.postPresenca.length = 0; req.postTrilha.length = 0; };

  // ══ 1. QUEM É COBRADO ═══════════════════════════════════════════════════════════
  usuarioEscalaNome = null;
  await entrar('Carol', 'sub_gerente', 'BANGU');
  check('gerência sem vínculo cai na pergunta de quem é na escala',
    (await trava().count()) === 1 && /Quem é você na escala/.test(await txt()), await txt());

  await entrar('Alguém', 'caixa', 'BANGU');
  check('caixa não é cobrado', (await trava().count()) === 0, await txt());
  await entrar('Outro', 'estoquista', 'BANGU');
  check('estoquista também não', (await trava().count()) === 0);
  await entrar('Chefe', 'mestre', 'BANGU');
  check('mestre passa direto', (await trava().count()) === 0);
  await entrar('Sup', 'supervisor', 'BANGU');
  check('supervisor também', (await trava().count()) === 0);
  await entrar('Gestor', 'gerente', 'MAGLIA');
  check('a Maglia fica fora da regra', (await trava().count()) === 0);

  // ══ 2. FALHA ABERTO ═════════════════════════════════════════════════════════════
  // A trava trabalha com escala. Sem ela não existe pergunta honesta a fazer, e internet
  // ruim não pode trancar a gerência fora do app.
  falharEscala = true;
  await entrar('Carol', 'sub_gerente', 'BANGU');
  check('escala que não carrega NÃO trava ninguém', (await trava().count()) === 0, await txt());
  falharEscala = false;

  presencaExistente = [{ id: 'x' }];
  await entrar('Carol', 'sub_gerente', 'BANGU');
  check('quem já confirmou hoje não é perguntado de novo', (await trava().count()) === 0);
  presencaExistente = [];

  // ══ 3. A PERGUNTA DE QUEM É — SUGESTÃO SÓ QUANDO NÃO HÁ DÚVIDA ══════════════════
  usuarioEscalaNome = null;
  await entrar('Carol', 'sub_gerente', 'BANGU');
  const marcado = async () => await page.evaluate(() => {
    const el = document.querySelector('input[name="pres-quem"]:checked');
    return el ? el.value.trim() : null;
  });
  check('a sugestão acerta o apelido: Carol → A.CAROLINA OLIVEIRA',
    (await marcado()) === 'A.CAROLINA OLIVEIRA', await marcado());
  check('e a lista mostra só a gerência, não a loja inteira',
    !/MARIA SILVA/.test(await txt()), await txt());

  await entrar('Silva', 'gerente', 'BANGU');
  check('nome ambíguo (dois SILVA na gerência) não vem com nada marcado',
    (await marcado()) === null, await marcado());
  check('mas a lista está lá pra escolher na mão',
    /JOAO SILVA/.test(await txt()) && /PEDRO SILVA/.test(await txt()), await txt());

  // Escolher grava o vínculo — e grava o NOME, que é o que resolve depois.
  limpar();
  await page.evaluate(() => {
    const els = [...document.querySelectorAll('input[name="pres-quem"]')];
    const alvo = els.find(e => e.value.trim() === 'PEDRO SILVA');
    alvo.checked = true;
  });
  await page.click('#gate-presenca button');
  await page.waitForTimeout(400);
  check('escolher o nome grava o vínculo no cadastro do usuário',
    req.patchUsuario.length === 1 && req.patchUsuario[0].escala_nome.trim() === 'PEDRO SILVA',
    JSON.stringify(req.patchUsuario));
  check('com a hora em que foi escolhido',
    !!(req.patchUsuario[0] || {}).escala_nome_em, JSON.stringify(req.patchUsuario));
  check('e a trava segue direto pra confirmação, sem perguntar de novo',
    /Você está na loja/.test(await txt()), await txt());

  // ── A porta de saída tem que levar a algum lugar ───────────────────────────────
  // A trava é overlay fixo por cima de tudo: deslogar sem removê-la deixava a própria
  // trava cobrindo a tela de login, e o aparelho ficava inútil pro resto da equipe —
  // exatamente o que a porta existe pra evitar.
  usuarioEscalaNome = null;
  await entrar('Carol', 'sub_gerente', 'BANGU');
  check('a trava está de pé antes de sair', (await trava().count()) === 1);
  await page.evaluate(() => doLogout());
  await page.waitForTimeout(300);
  check('"Não sou eu — sair" realmente tira a trava da frente',
    (await trava().count()) === 0, await txt());
  check('e devolve a rolagem da página',
    (await page.evaluate(() => document.body.style.overflow)) !== 'hidden',
    await page.evaluate(() => document.body.style.overflow));

  // ══ 4. O VÍNCULO SOBREVIVE A UM RENOME NA ESCALA ════════════════════════════════
  usuarioEscalaNome = 'BEATRIZ DOS SANTOS SILVA';   // nome antigo; na escala virou BEATRIZ NOVA
  await entrar('Beatriz', 'gerente', 'BANGU');
  check('quem foi renomeada na escala continua reconhecida pelo nome anterior',
    /Você está na loja/.test(await txt()) && /BEATRIZ NOVA/.test(await txt()), await txt());

  // ══ 5. DENTRO DO HORÁRIO: CONFIRMA E PRONTO ═════════════════════════════════════
  usuarioEscalaNome = 'A.CAROLINA OLIVEIRA';
  await entrar('Carol', 'sub_gerente', 'BANGU');
  limpar();
  check('no horário, a trava só pede a confirmação',
    /Você está na loja/.test(await txt()) && /15:00–23:00/.test(await txt()), await txt());
  check('e não oferece corrigir horário nenhum',
    !/Corrigir meu horário/.test(await txt()), await txt());
  await page.click('#gate-presenca button');
  await page.waitForTimeout(400);
  check('confirmar registra a presença',
    req.postPresenca.length === 1, JSON.stringify(req.postPresenca));
  const p1 = req.postPresenca[0] || {};
  check('com o estado "no horário", a hora e o que a escala dizia',
    p1.estado === 'no_horario' && p1.hora_confirmacao === '16:20'
      && p1.escala_entrada === '15:00' && p1.escala_saida === '23:00',
    JSON.stringify(p1));
  check('sem ter mexido na escala', req.patchEscala.length === 0, JSON.stringify(req.patchEscala));
  check('e a trava sai da frente', (await trava().count()) === 0);

  // ══ 6. FORA DO HORÁRIO: NÃO LIBERA DIRETO, OFERECE CORRIGIR ═════════════════════
  // O gerente é 08:00–16:00 e são 16:20 — dentro da tolerância de 60 min. Quem está FORA
  // de verdade é quem tem a janela longe: muda o relógio do app pra 03:00.
  await page.evaluate(() => { _presDados = null; });
  usuarioEscalaNome = 'ANTÔNIO FERNANDO';
  await entrar('Fernando', 'gerente', 'BANGU');
  check('20 min depois da saída ainda conta como no horário (tolerância)',
    /Você está na loja/.test(await txt()), await txt());

  await ctx.close();

  // ════ SEGUNDA FASE: 03:00 da madrugada ═════════════════════════════════════════
  // Todo mundo da escala está fora da janela a essa hora. É aqui que mora o pedido:
  // "se ele tiver na loja fora do horário cadastrado, bloquear e direcionar ele pra
  //  corrigir o seu horário na escala, dando a opção dele colocar de fato o horário".
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx2, HOJE + 'T03:00:00');
  escala = escalaBangu();
  let semanaMat = true;          // a semana existe em all_data
  let mexerNaEscalaNoMeio = null; // simula outro aparelho editando entre a leitura e a escrita
  await ctx2.route('**/rest/v1/**', async r => {
    const q = r.request(), url = q.url(), m = q.method();
    const json = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/gn_presenca_loja/.test(url) && m === 'POST') { req.postPresenca.push(JSON.parse(q.postData() || '{}')); return r.fulfill({ status: 201, body: '' }); }
    if (/gn_presenca_loja/.test(url)) return json([]);
    if (/gn_escala_correcao/.test(url) && m === 'POST') { req.postTrilha.push(JSON.parse(q.postData() || '{}')); return r.fulfill({ status: 201, body: '' }); }
    if (/gn_usuarios_publico/.test(url)) return json([{ escala_nome: usuarioEscalaNome }]);
    if (/gn_usuarios\?/.test(url) && m === 'PATCH') { req.patchUsuario.push(JSON.parse(q.postData() || '{}')); return r.fulfill({ status: 204, body: '' }); }
    if (/gn_comissoes/.test(url) && m === 'PATCH') { const b = JSON.parse(q.postData() || '{}'); req.patchEscala.push(b); escala = b.all_data; return r.fulfill({ status: 204, body: '' }); }
    if (/gn_comissoes/.test(url)) {
      const base = semanaMat ? escala : {};
      if (mexerNaEscalaNoMeio) { mexerNaEscalaNoMeio(); mexerNaEscalaNoMeio = null; }
      return json([{ all_data: semanaMat ? escala : base }]);
    }
    json([]);
  });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', e => erros.push(String(e)));
  await p2.goto('file://' + HOME);
  await p2.waitForFunction(() => typeof gnPresencaGuardiao === 'function', null, { timeout: 25000 });
  const entrar2 = async (nome, cargo, loja) => {
    await p2.evaluate(({ nome, cargo, loja }) => {
      try { Object.keys(localStorage).filter(k => k.indexOf('gn_presenca_') === 0).forEach(k => localStorage.removeItem(k)); } catch (e) {}
      const ov = document.getElementById('gate-presenca'); if (ov) ov.remove();
      session = { id: 7, nome, cargo, loja, permissoes: {}, ts: Date.now() };
      masterLoja = null; LOJAS_LISTA = _computeLojasVisiveis(session);
      gnPresencaGuardiao({ sbUrl: SB_URL, sbKey: SB_KEY, sessao: session, aoSair: doLogout });
    }, { nome, cargo, loja });
    await p2.waitForTimeout(450);
  };
  const trava2 = () => p2.locator('#gate-presenca');
  const txt2 = async () => ((await trava2().count()) ? (await trava2().textContent()) : '').replace(/\s+/g, ' ').trim();
  const botao2 = t => p2.locator('#gate-presenca button', { hasText: t });

  // ── Fora do horário: a trava não libera direto ─────────────────────────────────
  usuarioEscalaNome = 'A.CAROLINA OLIVEIRA';
  await entrar2('Carol', 'sub_gerente', 'BANGU');
  limpar();
  check('às 03:00, quem é escalado 15:00–23:00 cai como fora do horário',
    /Fora do horário da sua escala/.test(await txt2()), await txt2());
  check('a tela diz o que a escala manda e que horas são',
    /15:00–23:00/.test(await txt2()) && /03:00/.test(await txt2()), await txt2());
  check('e oferece corrigir o horário de hoje, como pedido',
    (await botao2('Corrigir meu horário de hoje').count()) === 1, await txt2());
  check('a trava explica por que a escala precisa estar certa (banco de horas)',
    /banco de horas/.test(await txt2()), await txt2());
  check('e tem a porta de saída, pra o aparelho não ficar inútil pra equipe',
    (await botao2('Não sou eu').count()) === 1);

  // ── Corrigir: escreve na escala, no dia certo, e só nele ───────────────────────
  await botao2('Corrigir meu horário de hoje').click();
  await p2.waitForTimeout(250);
  check('a tela de correção vem preenchida com o horário atual da escala',
    (await p2.locator('#pres-ent').inputValue()) === '15:00'
      && (await p2.locator('#pres-sai').inputValue()) === '23:00',
    await p2.locator('#pres-ent').inputValue());
  await p2.fill('#pres-ent', '22:00');
  await p2.fill('#pres-sai', '06:00');
  await botao2('Salvar e confirmar').click();
  await p2.waitForTimeout(600);

  check('a correção é gravada NA ESCALA', req.patchEscala.length === 1, JSON.stringify(req.patchEscala).slice(0, 200));
  const novaEscala = (req.patchEscala[0] || {}).all_data || {};
  const funcsPatch = ((novaEscala[String(SEM)] || {}).funcs) || [];
  const carol = funcsPatch.find(f => (f.nome || '').trim() === 'A.CAROLINA OLIVEIRA');
  check('no dia de hoje, com o horário que a pessoa informou',
    carol && carol.horario_dias[DIA].entrada === '22:00' && carol.horario_dias[DIA].saida === '06:00',
    JSON.stringify(carol && carol.horario_dias[DIA]));
  // O resto da semana dela não pode ter andado junto: corrigir hoje é corrigir HOJE.
  check('e sem encostar nos outros dias da semana dela',
    carol && carol.horario_dias.every((x, i) => i === DIA || (x.entrada === '15:00' && x.saida === '23:00')),
    JSON.stringify(carol && carol.horario_dias));
  const outro = funcsPatch.find(f => (f.nome || '').trim() === 'ANTÔNIO FERNANDO');
  check('nem nas outras pessoas da escala',
    outro && outro.horario_dias.every(x => x.entrada === '08:00' && x.saida === '16:00'),
    JSON.stringify(outro && outro.horario_dias[DIA]));
  check('o status do dia continua o que era — corrigir horário não é mudar presença',
    carol && carol.dias[DIA] === 'PRESENTE', JSON.stringify(carol && carol.dias));

  // ── A trilha: sem ela isto vira canal silencioso pra folha ─────────────────────
  check('a correção deixa trilha', req.postTrilha.length === 1, JSON.stringify(req.postTrilha));
  const t1 = req.postTrilha[0] || {};
  check('com o horário ANTERIOR, que é o que permite conferir depois',
    t1.entrada_antes === '15:00' && t1.saida_antes === '23:00', JSON.stringify(t1));
  check('o novo, quem fez, a loja e o dia',
    t1.entrada_depois === '22:00' && t1.saida_depois === '06:00' && t1.nome === 'Carol'
      && t1.loja === 'BANGU' && t1.dia_idx === DIA && t1.sem_idx === SEM,
    JSON.stringify(t1));

  // ── E só então a presença, marcada como corrigida ──────────────────────────────
  check('a presença é registrada depois da correção',
    req.postPresenca.length === 1, JSON.stringify(req.postPresenca));
  const p3 = req.postPresenca[0] || {};
  check('marcada como "corrigiu o horário", e já com a janela nova',
    p3.corrigiu_horario === true && p3.escala_entrada === '22:00' && p3.escala_saida === '06:00',
    JSON.stringify(p3));
  check('e agora 03:00 está DENTRO da janela nova, então o estado é no horário',
    p3.estado === 'no_horario', JSON.stringify(p3));
  check('a trava sai da frente', (await trava2().count()) === 0);

  // ── Entrar sem corrigir também é possível, e fica registrado como tal ──────────
  escala = escalaBangu();
  await entrar2('Carol', 'sub_gerente', 'BANGU');
  limpar();
  await botao2('Estou na loja mesmo assim').click();
  await p2.waitForTimeout(450);
  check('quem entra sem corrigir é registrado como fora do horário',
    req.postPresenca.length === 1 && req.postPresenca[0].estado === 'fora_do_horario'
      && req.postPresenca[0].corrigiu_horario === false,
    JSON.stringify(req.postPresenca));
  check('e a escala não é tocada nesse caminho', req.patchEscala.length === 0);

  // ── Dia de folga: entra marcado como fora de escala (decisão do dono) ──────────
  usuarioEscalaNome = 'TAYNARA ALVES';
  await entrar2('Taynara', 'sub_gerente', 'BANGU');
  limpar();
  check('em dia de folga a trava diz isso, sem fingir que é horário',
    /Hoje não é seu dia de trabalho/.test(await txt2()) && /Folga/.test(await txt2()), await txt2());
  check('não oferece corrigir horário — o que mudaria aí é o status, não a hora',
    (await botao2('Corrigir meu horário').count()) === 0, await txt2());
  await botao2('Estou na loja mesmo assim').click();
  await p2.waitForTimeout(450);
  check('e quem veio cobrir entra, marcado como fora de escala',
    req.postPresenca.length === 1 && req.postPresenca[0].estado === 'fora_de_escala'
      && req.postPresenca[0].escala_status === 'FOLGA',
    JSON.stringify(req.postPresenca));

  // ── Semana ainda não aberta no Check-list: não inventa semana ──────────────────
  // Materializar a semana a partir da herança seria replicar a regra de herança do
  // Check-list como ESCRITA — e uma réplica que divergisse em qualquer detalhe gravaria
  // uma semana errada que o Check-list depois herda. Melhor não escrever.
  semanaMat = false;
  usuarioEscalaNome = 'A.CAROLINA OLIVEIRA';
  await entrar2('Carol', 'sub_gerente', 'BANGU');
  check('sem a semana aberta no Check-list, a trava não aparece em vez de inventar escala',
    (await trava2().count()) === 0, await txt2());
  semanaMat = true;

  // ── Concorrência: a escrita relê a escala imediatamente antes de gravar ────────
  // O Check-list já levou o bug de "salva e minutos depois volta sozinho" por escrever em
  // cima de um retrato velho. Aqui outro aparelho muda a escala entre a abertura da trava
  // e o toque no botão: a edição dele tem que sobreviver.
  escala = escalaBangu();
  await entrar2('Carol', 'sub_gerente', 'BANGU');
  limpar();
  await botao2('Corrigir meu horário de hoje').click();
  await p2.waitForTimeout(250);
  // A edição do outro aparelho entra AQUI, com a trava já aberta e o retrato dela já
  // velho. Não pode depender de a releitura acontecer: era isso que fazia o mutante "não
  // relê" sobreviver — sem segunda leitura, o gancho nunca disparava e a escala ficava
  // intacta por acidente.
  {
    const f = escala[String(SEM)].funcs.find(x => (x.nome || '').trim() === 'ANTÔNIO FERNANDO');
    f.horario_dias = f.horario_dias.map(() => ({ entrada: '07:00', saida: '15:00' }));
  }
  await p2.fill('#pres-ent', '10:00');
  await p2.fill('#pres-sai', '18:00');
  await botao2('Salvar e confirmar').click();
  await p2.waitForTimeout(600);
  const escrita = ((((req.patchEscala[0] || {}).all_data || {})[String(SEM)] || {}).funcs) || [];
  const fernando = escrita.find(f => (f.nome || '').trim() === 'ANTÔNIO FERNANDO');
  check('a edição feita por outro aparelho no meio do caminho NÃO é apagada',
    fernando && fernando.horario_dias[DIA].entrada === '07:00',
    JSON.stringify(fernando && fernando.horario_dias[DIA]));
  const carol2 = escrita.find(f => (f.nome || '').trim() === 'A.CAROLINA OLIVEIRA');
  check('e a correção da pessoa entra junto, sem uma anular a outra',
    carol2 && carol2.horario_dias[DIA].entrada === '10:00',
    JSON.stringify(carol2 && carol2.horario_dias[DIA]));

  // ══ O PLANTÃO PASSA A MOSTRAR A CONFIRMAÇÃO, NÃO A DEDUÇÃO ═════════════════════
  // É o motivo de tudo isto existir: "quero ter uma informação mais precisa de quem está
  // na loja". Sem esta parte, a confirmação ia pro banco e não aparecia em lugar nenhum.
  // Num contexto às 16:20, que é quando a sub (15:00–23:00) está DENTRO da janela: é só
  // aí que "não confirmou" é uma cobrança — às 03:00 ninguém é esperado, e a linha certa
  // continua sendo o horário de hoje.
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx3, HOJE + 'T16:20:00');
  await ctx3.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const p3p = await ctx3.newPage();
  p3p.on('pageerror', e => erros.push(String(e)));
  await p3p.goto('file://' + HOME);
  await p3p.waitForFunction(() => typeof _renderPlantaoHome === 'function', null, { timeout: 25000 });

  const plantao = async confirmacoes => {
    await p3p.evaluate(async ({ escala, confirmacoes }) => {
      window.__pres = confirmacoes;
      const orig = window.gnFetchJson;
      window.gnFetchJson = async (url, ...r) => {
        if (/gn_presenca_loja/.test(url)) return window.__pres;
        if (/gn_comissoes/.test(url)) return [{ all_data: escala }];
        return orig(url, ...r);
      };
      session = { id: 7, nome: 'Carol', cargo: 'sub_gerente', loja: 'BANGU', permissoes: {}, ts: Date.now() };
      masterLoja = null; LOJAS_LISTA = _computeLojasVisiveis(session);
      await _renderPlantaoHome(true, session, false);
      window.gnFetchJson = orig;
    }, { escala: escalaBangu(), confirmacoes });
    await p3p.waitForTimeout(200);
    return (await p3p.locator('#hero-plantao').textContent()).replace(/\s+/g, ' ').trim();
  };

  const semNinguem = await plantao([]);
  check('quem está na janela e não confirmou aparece como NÃO confirmado',
    /A.CAROLINA OLIVEIRA[^·]*· 15:00–23:00 · não confirmou/.test(semNinguem), semNinguem);
  check('e o plantão não afirma que alguém está na loja',
    !/na loja/.test(semNinguem), semNinguem);

  const comCarol = await plantao([
    { nome: 'Carol', escala_nome: 'A.CAROLINA OLIVEIRA', estado: 'no_horario', hora_confirmacao: '15:10', corrigiu_horario: false },
  ]);
  check('quem confirmou aparece como na loja, com a hora',
    /A.CAROLINA OLIVEIRA/.test(comCarol) && /na loja 15:10/.test(comCarol), comCarol);
  check('e quem está na janela sem confirmar continua cobrado',
    /JOAO SILVA[^·]*· 09:00–17:00 · não confirmou/.test(comCarol), comCarol);

  // O caso que o card não sabia mostrar: a escala diz FOLGA e a pessoa está lá.
  const comFolguista = await plantao([
    { nome: 'Taynara', escala_nome: 'TAYNARA ALVES', estado: 'fora_de_escala', hora_confirmacao: '19:40', corrigiu_horario: false },
  ]);
  check('quem está na loja em dia de folga aparece na loja, e marcado como fora da escala',
    /TAYNARA ALVES/.test(comFolguista) && /na loja 19:40, fora da escala/.test(comFolguista),
    comFolguista);
  check('a confirmação vence a escala — não diz mais "Folga" pra quem está lá',
    !/TAYNARA ALVES<\/b><\/span><span[^>]*>· Folga/.test(await p3p.locator('#hero-plantao').innerHTML()),
    comFolguista);

  // ══ A ABA PRESENÇA DO PAINEL ═══════════════════════════════════════════════════
  // A trilha da correção só vale se alguém LÊ. Gravar o antes/depois e não mostrar em
  // lugar nenhum seria auditoria de mentira.
  const painel = await p3p.evaluate(() => {
    _dashPer = 'sem'; _dashWoff = 0;
    _dashPresencaHoje = [
      { loja: 'BANGU', nome: 'Carol', cargo: 'sub_gerente', estado: 'no_horario', hora_confirmacao: '15:08', corrigiu_horario: false, escala_entrada: '15:00', escala_saida: '23:00' },
      { loja: 'BANGU', nome: 'Fernando', cargo: 'gerente', estado: 'fora_do_horario', hora_confirmacao: '07:12', corrigiu_horario: true, escala_entrada: '07:00', escala_saida: '15:00' },
      { loja: 'ITAQUERA', nome: 'Gilda', cargo: 'gerente', estado: 'fora_de_escala', hora_confirmacao: '19:40', corrigiu_horario: false },
      { loja: 'MAGLIA', nome: 'Alguém', cargo: 'gerente', estado: 'no_horario', hora_confirmacao: '12:00', corrigiu_horario: false },
    ];
    _dashCorrecoes = [
      { loja: 'BANGU', data: '2026-10-30', nome: 'Fernando', entrada_antes: '08:00', saida_antes: '16:00', entrada_depois: '07:00', saida_depois: '15:00' },
      { loja: 'PEDREIRA', data: '2026-10-28', nome: 'Marlon', entrada_antes: null, saida_antes: null, entrada_depois: '10:00', saida_depois: '18:00' },
    ];
    const d = _presencaMacroDados();
    const el = document.createElement('div'); el.innerHTML = _buildPresencaPanel();
    return { txt: el.textContent.replace(/\s+/g, ' ').trim(), total: d.total,
             fora: d.foraDoPrevisto, nCorr: d.nCorrecoes, semGente: d.semGente.map(l => l.k) };
  });
  check('o painel conta quem está na loja hoje', painel.total === 3, JSON.stringify(painel.total));
  check('e separa quem está fora do previsto',
    painel.fora === 2 && /Fora do previsto/.test(painel.txt), JSON.stringify(painel.fora));
  check('a Maglia não entra na conta nem aparece',
    painel.total === 3 && !/Maglia/.test(painel.txt), painel.txt.slice(0, 200));
  check('cada pessoa aparece com a hora e o estado',
    /Carol/.test(painel.txt) && /15:08/.test(painel.txt) && /no horário/.test(painel.txt)
      && /fora da escala/.test(painel.txt), painel.txt);
  check('quem corrigiu o horário é marcado como tal',
    /corrigiu o horário/.test(painel.txt), painel.txt);
  // O bloco que o painel de cancelamento ensinou: o silêncio precisa ter nome.
  check('loja sem ninguém confirmado é nomeada, não some',
    painel.semGente.includes('CAXIAS') && /Caxias/.test(painel.txt), JSON.stringify(painel.semGente));

  check('a trilha da correção aparece no painel', painel.nCorr === 2, JSON.stringify(painel.nCorr));
  check('com o horário ANTES e o DEPOIS, que é o ponto da auditoria',
    /08:00–16:00/.test(painel.txt) && /07:00–15:00/.test(painel.txt), painel.txt);
  check('e horário que não existia antes aparece como em branco, não como traço',
    /em branco → 10:00–18:00/.test(painel.txt), painel.txt);
  check('o painel diz por que isso importa, em vez de só listar',
    /banco de horas/.test(painel.txt), painel.txt);
  check('a contagem de correções concorda com o plural',
    /2 correções de horário/.test(painel.txt), painel.txt);

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase|NetworkError|net::/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
