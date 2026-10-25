// "Acho que essa questão de ir passando pelos avisos sem ter que de fato verificar pode
//  fazer as pessoas não verem. Como a venda dia a dia com a meta. Não sei se tem como ter a
//  opção de fazer olhar nem que seja uma vez e confirmar que viu, e aí sim liberar o acesso."
//
// Medido antes de desenhar: tudo que é voluntário neste app para em ~20% (ciência do mês:
// 2 de 11 lojas; "Fechar o dia": 76 de 341 dias). O único que chega perto de todos é o
// alerta urgente — o único que bloqueia. Mas ele some com UM TOQUE, e mesmo assim leva
// 1h50 de mediana: é a prova de que botão de "li e confirmo" vira reflexo.
//
// Daí a regra que este teste protege, e que é o PONTO da tela: a liberação não é um toque,
// é responder o que só se sabe olhando. E duas fronteiras que valem mais que a tela:
//   1. ela nunca pode trancar a loja pra fora (falha de rede, erro meu, o que for);
//   2. errar não pune — só faz chutar custar mais caro que ler.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + CHK);
    try {
      // Esperar só pelas FUNÇÕES não serve: declaração de função é içada pro topo do bloco,
      // então elas existem com o script ainda no meio da execução — e o teste caía em
      // "Cannot access 'LOJA' before initialization". `let LOJA` é avaliado na ordem, então
      // é ele que prova que o bloco terminou.
      await page.waitForFunction(() => { try {
        return typeof LOJA === 'string' && typeof _aberturaDoDia === 'function'
            && typeof gnAvisosAtivos === 'function' && typeof sb === 'object';
      } catch (e) { return false; } }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('o Check-list não carregou (ou falta o código novo)'); }
  }

  // Banco de mentira: `vendaOntem` null = dia sem venda lançada; `gravar` false = a escrita
  // falha (é o caso da internet caindo no meio do almoço, que não pode trancar ninguém).
  const montar = (opts) => page.evaluate(async (o) => {
    window.__gravado = [];
    window.__falhouGravar = false;
    LOJA = o.loja || 'Bangu';
    usuarioLogado = { id: 1, nome: o.nome || 'Taynara', cargo: o.cargo || 'gerente', loja: 'BANGU' };
    state.data = o.hoje || '2026-10-12';
    stateWeek.metaSemanal = o.meta != null ? o.meta : 70000;
    // Quem já viu é SEMPRE a Taynara: montar com `nome: 'Uilson'` testa a outra pessoa da
    // loja. Chavear por o.nome marcaria como vista justamente a pessoa sob teste — foi o
    // que fez esta checagem falhar acusando o código de um erro que era do fixture.
    const jaViu = o.jaViu ? { [o.hoje || '2026-10-12']: { Taynara: { em: 'x' } } } : {};
    sb.from = (tabela) => ({
      select: () => ({
        eq: function () { return this; },
        maybeSingle: async () => {
          if (tabela === 'checklist_diario') {
            return o.vendaOntem == null ? { data: null } : { data: { venda_salao: o.vendaOntem, venda_delivery: 0 } };
          }
          if (o.lerQuebra) throw new Error('sem rede');
          return { data: { all_data: { abertura_leitura: jaViu } } };
        },
      }),
      update: (payload) => ({
        eq: async () => {
          if (o.gravar === false) { window.__falhouGravar = true; return { error: new Error('sem rede') }; }
          window.__gravado.push(payload.all_data.abertura_leitura);
          return { error: null };
        },
      }),
    });
    const ov = document.getElementById('abertura-overlay'); if (ov) ov.remove();
    await _aberturaDoDia();
    await new Promise(r => setTimeout(r, 60));
    const el = document.getElementById('abertura-overlay');
    return {
      apareceu: !!el,
      txt: el ? el.textContent.replace(/\s+/g, ' ') : '',
      opcoes: el ? [...el.querySelectorAll('button[onclick^="_aberturaResponder"]')].map(b => b.textContent.trim()) : [],
      temSair: !!document.getElementById('abertura-sair'),
      appUsavel: getComputedStyle(document.body).overflow !== 'hidden',
    };
  }, opts);

  const responder = (idx) => page.evaluate(async (i) => {
    const bs = [...document.querySelectorAll('#abertura-overlay button[onclick^="_aberturaResponder"]')];
    bs[i].click();
    await new Promise(r => setTimeout(r, 80));
    const el = document.getElementById('abertura-overlay');
    const sair = document.getElementById('abertura-sair');
    return { txt: el ? el.textContent.replace(/\s+/g, ' ') : '', fechou: !el,
             sairTravado: !!(sair && sair.disabled), gravado: window.__gravado };
  }, idx);

  // ── 1. A tela aparece, e só pra quem é dela ──────────────────────────────────────────
  let r = await montar({ vendaOntem: 12480 });
  check('a tela de abertura aparece pro gerente', r.apareceu);
  check('e bloqueia o app enquanto está aberta', !r.appUsavel);
  check('perguntando a venda de ontem, com três opções', r.opcoes.length === 3);
  check('sem botão de sair antes de responder — é isso que impede passar batido', !r.temSair);
  check('e o aviso ativo aparece junto', /Eleição/.test(r.txt));

  check('sub-gerente também vê', (await montar({ vendaOntem: 9000, cargo: 'sub_gerente' })).apareceu);
  check('caixa não vê (o conteúdo é da gerência, como combinado)',
    !(await montar({ vendaOntem: 9000, cargo: 'caixa' })).apareceu);
  check('Maglia fica fora (CLAUDE.md — não foi citada no pedido)',
    !(await montar({ vendaOntem: 9000, loja: 'Maglia' })).apareceu);

  // ── 2. Uma vez por dia, por PESSOA ───────────────────────────────────────────────────
  check('quem já viu hoje não vê de novo', !(await montar({ vendaOntem: 9000, jaViu: true })).apareceu);
  check('mas a OUTRA pessoa da loja vê, no mesmo aparelho',
    (await montar({ vendaOntem: 9000, jaViu: true, nome: 'Uilson' })).apareceu);

  // ── 3. Acertar libera; errar não pune, mas custa ────────────────────────────────────
  await montar({ vendaOntem: 12480 });
  const certa = await page.evaluate(() => {
    const bs = [...document.querySelectorAll('#abertura-overlay button[onclick^="_aberturaResponder"]')];
    return bs.findIndex(b => /12\.480,00/.test(b.textContent));
  });
  check('a resposta certa está entre as opções', certa >= 0);
  let resp = await responder(certa);
  check('acertando, a tela mostra o número e a meta da semana',
    /12\.480,00/.test(resp.txt) && /Meta da semana/.test(resp.txt));
  check('e fica registrado que a pessoa ACERTOU',
    resp.gravado.length === 1 && Object.values(resp.gravado[0]['2026-10-12'])[0].acertou === true);

  await montar({ vendaOntem: 12480 });
  const errada = await page.evaluate(() => {
    const bs = [...document.querySelectorAll('#abertura-overlay button[onclick^="_aberturaResponder"]')];
    return bs.findIndex(b => !/12\.480,00/.test(b.textContent));
  });
  resp = await responder(errada);
  check('errando, o número certo aparece em destaque', /12\.480,00/.test(resp.txt));
  check('e a tela diz que não era aquela, sem xingar ninguém',
    /Não era essa/.test(resp.txt) && !/errou|erro/i.test(resp.txt));
  check('a saída fica travada por alguns segundos — chutar custa mais caro que ler',
    resp.sairTravado === true);
  check('e o chute fica registrado (é esse número que diz quem está lendo)',
    Object.values(resp.gravado[0]['2026-10-12'])[0].acertou === false);
  const destravou = await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 3200));
    const b = document.getElementById('abertura-sair');
    return { liberou: !!(b && !b.disabled), txt: b ? b.textContent.trim() : '' };
  });
  check('mas destrava sozinha depois — não é castigo, e ninguém fica preso',
    destravou.liberou && /pode liberar/.test(destravou.txt));

  // ── 4. As fronteiras que não podem quebrar ───────────────────────────────────────────
  check('sem venda de ontem e sem aviso, a tela não existe',
    !(await montar({ vendaOntem: null, hoje: '2026-11-20' })).apareceu);
  r = await montar({ vendaOntem: null });
  check('sem venda lançada, mas com aviso, a tela aparece só com o aviso',
    r.apareceu && /Eleição/.test(r.txt) && r.opcoes.length === 0);
  check('e aí a saída é direta, porque não há número pra perguntar', r.temSair);

  // A falha de gravação é o caso que mais me preocupou: a pessoa JÁ viu a tela, e travar a
  // entrada dela por um problema meu seria punir a loja pelo meu erro.
  await montar({ vendaOntem: 12480, gravar: false });
  const idx = await page.evaluate(() => [...document.querySelectorAll('#abertura-overlay button[onclick^="_aberturaResponder"]')].findIndex(b => /12\.480,00/.test(b.textContent)));
  await responder(idx);
  const apos = await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 900));
    return { fechou: !document.getElementById('abertura-overlay'),
             appLiberado: getComputedStyle(document.body).overflow !== 'hidden',
             falhou: window.__falhouGravar };
  });
  check('se a gravação falhar, a pessoa entra no app do mesmo jeito',
    apos.falhou === true && apos.fechou && apos.appLiberado);

  const leituraQuebrada = await montar({ vendaOntem: 12480, lerQuebra: true });
  check('se nem der pra saber se já viu, a tela aparece (mostrar 2x é melhor que trancar)',
    leituraQuebrada.apareceu);

  // ── 5. As opções precisam ser plausíveis ─────────────────────────────────────────────
  const opc = await page.evaluate(() => {
    state.data = '2026-10-12';
    const o = _aberturaOpcoes(12480);
    return { n: o.length, unicas: new Set(o).size, temCerta: o.includes(12480),
             // Nenhuma pode ser absurda: opção redonda demais se descarta sozinha e a
             // pergunta volta a ser respondível sem olhar o número.
             razoaveis: o.every(v => v > 12480 * 0.6 && v < 12480 * 1.5) };
  });
  check('são três opções distintas, incluindo a certa',
    opc.n === 3 && opc.unicas === 3 && opc.temCerta);
  check('e os distratores são plausíveis, senão dá pra acertar sem olhar', opc.razoaveis);
  // O supabase-js vem de um CDN. Quando ele não vem, o script estoura em createClient e o
  // teste acusava o APP por causa da internet daqui — 1 rodada em 3. É rede, não código.
  const errosReais = erros.filter(e => !/createClient/.test(e));

  check('nenhum erro de JS', errosReais.length === 0);
  if (errosReais.length) errosReais.slice(0, 3).forEach(e => console.log('      ' + e.slice(0, 180)));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
