// "Ontem o Emanoel, com senha mestra, disse que lançou 3 avarias nos utensílios (quebra) e
//  segundo ele não ficou salvo, na loja do Nova América." (23/11/2026)
//
// No banco, 22/11 de Nova América só tinha as 2 quebras que vinham se repetindo desde 20/11,
// e a linha foi regravada por outro aparelho às 8h28 do dia seguinte. Causa: antes de gravar,
// _mergeManutFromDb só atualizava o STATUS dos itens que o aparelho já conhecia, e saveAll
// grava a lista inteira — o aparelho da loja, aberto com a lista antiga, regravava o dia sem
// os lançamentos do outro. Esta suíte: dois aparelhos, o banco de mentira da e2e_chk_dois_aparelhos.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const SB_LIB = require('fs').readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 400))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-11T15:00:00');
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: SB_LIB }));
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + CHK);
  await page.waitForFunction(() => { try {
    return typeof saveAll === 'function' && typeof loadSupabaseDay === 'function' && typeof initAllStates === 'function'
        && typeof toggleCheck === 'function' && typeof SETORES_ABERTURA === 'object';
  } catch (e) { return false; } }, null, { timeout: 25000 });

  // Servidor de mentira: UMA linha, a de Campo Grande em 11/11. `window.__srv` é o banco.
  const S0 = await page.evaluate(() => {
    hideLogin(); LOJA = 'Nova América'; state.data = '2026-11-22';
    usuarioLogado = { id: 1, nome: 'Augusto', cargo: 'sub_gerente', loja: 'NOVA AMERICA' };
    window.__toasts = []; showToast = (m) => window.__toasts.push(String(m));
    const orig = sb.from.bind(sb);
    window.__gravacoes = 0;
    // As colunas de verdade de checklist_diario (information_schema, 12/11/2026).
    window.__COLUNAS_REAIS = 'id,data_operacao,loja,venda_salao,venda_delivery,checklist,faltas,manutencao,updated_at,created_at,faltas_funcionarios,abertura,fechamento,carnes,semana_inicio,semana_fim,supervisao,repique,dinheiro_caixa,despesas,banda,vendas,checklist_pct,retiradas,supervisao_cozinha,entradas_manuais,auditorias_padrao,concluido_em,dia_fechado_em,dia_fechado_por,iniciado_em'.split(',');
    sb.from = t => {
      if (t !== 'checklist_diario') return orig(t);
      const leitura = { eq() { return this; },
        single: async () => ({ data: window.__srv ? JSON.parse(JSON.stringify(window.__srv)) : null, error: window.__srv ? null : { message: 'sem linha' } }),
        maybeSingle: async () => ({ data: window.__srv ? JSON.parse(JSON.stringify(window.__srv)) : null, error: null }) };
      // Igual ao PostgREST: pedir coluna que não existe é erro 42703 na leitura INTEIRA. O
      // servidor de mentira aceitava qualquer coisa, e foi por isso que esta suíte passou com
      // o SELECT pedindo obs_abertura/obs_checklist/obs_fechamento — que não existem. Em
      // produção, saveAll não salvou nada em loja nenhuma de 11 a 12/11/2026.
      return {
        select: (cols) => {
          const ruins = String(cols || '*').split(',').map(c => c.trim()).filter(c => c && c !== '*' && !window.__COLUNAS_REAIS.includes(c));
          if (!ruins.length) return leitura;
          window.__colunaInexistente = ruins;
          const erro = { data: null, error: { code: '42703', message: 'column checklist_diario.' + ruins[0] + ' does not exist' } };
          return { eq() { return this; }, single: async () => erro, maybeSingle: async () => erro };
        },
        upsert: async p => {
          const corpo = JSON.parse(JSON.stringify(p));   // o corpo sai na hora da chamada, como no fetch
          // Seção 10: segura a gravação "na rede" pra a loja mexer enquanto ela está a caminho.
          if (window.__segurar) { window.__segurado = true; await window.__segurar; }
          window.__gravacoes++; window.__srv = Object.assign({}, window.__srv || {}, corpo); return { error: null };
        },
        update: p => ({ eq() { return this; }, then(res) { window.__srv = Object.assign({}, window.__srv || {}, p); res({ error: null }); } }),
      };
    };
    return Object.keys(SETORES_ABERTURA)[0];
  });

  const q = (id, desc, extra) => Object.assign({ id, setor: 'Copa/Bar', tipo: 'Utensílio / Louça', situacao: 'Quebrou', qtd: '1', descricao: desc,
    contato: '', fotoBase64: '', fotoName: '', status: 'Pendente', prioridade: 'Normal', confirmado_loja: false }, extra || {});
  const semear = () => page.evaluate(({ itens }) => {
    window.__srv = { data_operacao: '2026-11-22', loja: 'Nova América', dinheiro_caixa: 0, abertura: {}, checklist: {}, fechamento: {},
      despesas: [], retiradas: [], entradas_manuais: [], faltas: [], faltas_funcionarios: [], supervisao: {}, supervisao_cozinha: {},
      auditorias_padrao: {}, banda: {}, vendas: {}, venda_salao: 0, venda_delivery: 0, repique: 0, iniciado_em: {}, concluido_em: {}, manutencao: itens };
  }, { itens: [q(1, 'Caneca de chopp'), q(2, 'Prato quadrado grande')] });
  const lojaAbre = () => page.evaluate(async () => { state.manutencao = []; initAllStates(); return await loadSupabaseDay('2026-11-22'); });
  const lojaSalva = () => page.evaluate(async () => await saveAll({ silencioso: true }));
  const banco = () => page.evaluate(() => (window.__srv.manutencao || []).map(m => m.descricao + ':' + m.status));
  const emanoel = (itens) => page.evaluate((itens) => { window.__srv.manutencao = window.__srv.manutencao.concat(itens); }, itens);

  // ══ 1. O caso de Nova América ═══════════════════════════════════════════════════════
  await semear();
  check('a loja abre o dia com as 2 quebras de sempre', (await lojaAbre()) && (await page.evaluate(() => state.manutencao.length)) === 2);
  await emanoel([q(901, 'Copo americano'), q(902, 'Travessa de barro'), q(903, 'Prato fundo')]);
  await lojaSalva();
  let b = await banco();
  check('o aparelho da loja (lista antiga) salva DEPOIS do Emanoel: as 3 quebras dele continuam no banco',
    ['Copo americano', 'Travessa de barro', 'Prato fundo'].every(d => b.some(x => x.startsWith(d + ':'))), b);
  check('e as 2 da loja também (5 no total, sem duplicar)', b.length === 5, b);
  check('a tela da loja passa a mostrar as quebras do Emanoel', (await page.evaluate(() => state.manutencao.map(m => m.descricao))).includes('Copo americano'));

  // ══ 2. Excluir aqui continua excluindo ══════════════════════════════════════════════
  await page.evaluate(() => { window.confirm = () => true; removeManutencao(1); });
  await lojaSalva();
  b = await banco();
  check('a loja exclui a caneca: some do banco e NÃO volta na próxima mesclagem', !b.some(x => x.startsWith('Caneca de chopp:')) && b.length === 4, b);
  await lojaSalva();
  b = await banco();
  check('salvando de novo, a caneca continua fora', !b.some(x => x.startsWith('Caneca de chopp:')), b);

  // ══ 3. Status do app Manutenção continua mesclando ══════════════════════════════════
  await page.evaluate(() => { window.__srv.manutencao.forEach(m => { if (m.descricao === 'Prato quadrado grande') m.status = 'Em andamento'; }); });
  await lojaSalva();
  b = await banco();
  check('o "Em andamento" dado pelo app Manutenção não é desfeito pela loja', b.includes('Prato quadrado grande:Em andamento'), b);

  // ══ 4. Item novo da loja + item novo do outro, ao mesmo tempo ═══════════════════════
  await page.evaluate(() => { state.manutencao.unshift({ id: 777, setor: 'Salão', tipo: 'Estrutura', descricao: 'Lâmpada queimada', status: 'Pendente', prioridade: 'Normal', confirmado_loja: false }); });
  await emanoel([q(904, 'Taça de vinho')]);
  await lojaSalva();
  b = await banco();
  check('lançamento da loja e do outro aparelho no mesmo intervalo: os dois ficam', b.some(x => x.startsWith('Lâmpada queimada:')) && b.some(x => x.startsWith('Taça de vinho:')), b);

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
