// Dois defeitos do Check-list achados em 06/11/2026, olhando dados que o dono estranhou.
//
// 1. A LINHA CONFIG DO BANCO DE HORAS SUMIA. O Norte Shopping amanheceu com a linha CONFIG
//    contendo só { salarioIncompletoDesde: "2026-11-06" } — sem o ciclo (periodo_inicio/fim)
//    e sem os salários por setor. Causa: _checarSalarioIncompleto lia a linha, e o cliente do
//    Supabase NÃO lança exceção quando a consulta falha — devolve { data: null, error }. A
//    leitura falha virava "loja sem salário", e a gravação seguinte mandava a linha INTEIRA
//    só com a marca. Os dois salvamentos de salário tinham o mesmo buraco: com _bhConfig
//    ainda não carregado, gravavam só os salários e apagavam o ciclo.
//    Agora toda gravação da CONFIG passa por _bhConfigGravar: lê a linha atual, aplica só o
//    que mudou, e se a leitura falhar não grava nada.
//
// 2. COUVERT DIGITADO POR PESSOA. Boulevard, 01/11: 88 pessoas e "Valor couvert" 7 — o
//    preço por pessoa no campo do TOTAL (que a tela calcula sozinha, 88 × R$ 7 = R$ 616).
//    Medido: em todo outro lançamento da base o valor é exatamente qtd × R$ 7. Agora, se
//    não bate, a tela pergunta antes de salvar.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const SB_LIB = require('fs').readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-06T12:00:00');
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: SB_LIB }));
  // Estado do "banco": a linha CONFIG da loja e se a leitura dela falha.
  const st = { config: null, falharLeitura: false, gravacoes: [], agenda: [] };
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request(), url = req.url(), m = req.method();
    const json = (b, status) => r.fulfill({ status: status || 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/gn_banco_horas/.test(url)) {
      if (m === 'GET') {
        if (st.falharLeitura) return json({ message: 'timeout', code: '57014' }, 500);
        return json(st.config ? [{ registros: st.config }] : []);
      }
      let corpo = null; try { corpo = JSON.parse(req.postData() || 'null'); } catch (e) {}
      st.gravacoes.push(corpo);
      const linha = Array.isArray(corpo) ? corpo[0] : corpo;
      if (linha && linha.registros) st.config = linha.registros;
      return json([]);
    }
    if (/gn_trios_agenda/.test(url)) {
      if (m !== 'GET') { let corpo = null; try { corpo = JSON.parse(req.postData() || 'null'); } catch (e) {} st.agenda.push({ url, corpo }); }
      return json([]);
    }
    return json([]);
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.goto('file://' + CHK);
  await page.waitForFunction(() => { try {
    return typeof _checarSalarioIncompleto === 'function' && typeof _bhConfigGravar === 'function'
        && typeof salvarSalariosSetor === 'function' && typeof _salvarCouvertBandaHoje === 'function'; } catch (e) { return false; } },
    null, { timeout: 25000 });
  await page.evaluate(() => { hideLogin(); LOJA = 'Norte Shopping'; usuarioLogado = { id: 1, nome: 'Tiago', cargo: 'gerente', loja: 'NORTE SHOPPING' };
    window._temAcessoAbaChecklist = () => true; showToast = () => {}; renderBancoHoras = () => {}; renderSalariosSetorCard = () => {}; });
  const CICLO = { periodo_inicio: '2026-06-26', periodo_fim: '2026-12-25' };
  const reset = (cfg, falhar) => { st.config = cfg ? JSON.parse(JSON.stringify(cfg)) : null; st.falharLeitura = !!falhar; st.gravacoes = []; };

  // ══ 1. Leitura que FALHA não grava nada (era o que apagava o Norte Shopping) ═══════════
  reset(CICLO, true);
  const r1 = await page.evaluate(async () => await _checarSalarioIncompleto());
  check('leitura da CONFIG falhando: não vira pendência de salário', r1 === null, JSON.stringify(r1));
  check('…e NÃO grava nada por cima da linha', st.gravacoes.length === 0, JSON.stringify(st.gravacoes));

  // ══ 2. Leitura ok, loja sem salário: a marca entra SEM apagar o ciclo ══════════════════
  reset(CICLO, false);
  const r2 = await page.evaluate(async () => await _checarSalarioIncompleto());
  check('loja sem salário (leitura ok) continua virando pendência', r2 && r2.chave === 'salario', JSON.stringify(r2));
  check('a marca salarioIncompletoDesde é gravada junto com o ciclo, não no lugar dele',
    st.config && st.config.salarioIncompletoDesde === '2026-11-06' && st.config.periodo_inicio === '2026-06-26' && st.config.periodo_fim === '2026-12-25', JSON.stringify(st.config));

  // ══ 3. Salvar salários sem a aba Banco carregada não apaga o ciclo ══════════════════════
  reset(Object.assign({}, CICLO, { salarioIncompletoDesde: '2026-11-06' }), false);
  await page.evaluate(async () => {
    _bhConfig = null;   // aba Banco nunca carregou nesta sessão
    const box = document.createElement('div'); box.id = 'card-salarios-setor';
    box.innerHTML = ['ASG', 'Salão', 'Cozinha', 'Caixa', 'Gerente'].map((s2, i) => `<input data-setor="${s2}" value="${1600 + i * 10}">`).join('');
    document.body.appendChild(box);
    await salvarSalariosSetor();
    box.remove();
  });
  check('salvar salários com a CONFIG não carregada mantém o ciclo da loja',
    st.config && st.config.periodo_inicio === '2026-06-26' && st.config.salariosSetor && st.config.salariosSetor.Cozinha === 1620, JSON.stringify(st.config));

  // ══ 4. Com 5 setores, a marca sai — e só ela ════════════════════════════════════════════
  const r4 = await page.evaluate(async () => await _checarSalarioIncompleto());
  check('com salários cadastrados a pendência some', r4 === null);
  check('a marca é removida sem levar o ciclo e os salários junto',
    st.config && !('salarioIncompletoDesde' in st.config) && st.config.periodo_inicio === '2026-06-26' && Object.keys(st.config.salariosSetor || {}).length === 5, JSON.stringify(st.config));

  // ══ 5. Salvar salário com a leitura falhando: não grava (melhor que apagar) ═════════════
  reset(CICLO, true);
  await page.evaluate(async () => {
    _bhConfig = null;
    const box = document.createElement('div'); box.id = 'card-salarios-setor';
    box.innerHTML = '<input data-setor="ASG" value="1600">';
    document.body.appendChild(box);
    await salvarSalariosSetor();
    box.remove();
  });
  check('salvar salário com a leitura da CONFIG falhando não grava nada', st.gravacoes.length === 0, JSON.stringify(st.gravacoes));

  // ══ 6. Só existe UM lugar no Check-list que grava a CONFIG ══════════════════════════════
  const fonte = require('fs').readFileSync(CHK, 'utf8');
  const escritas = (fonte.match(/mes:\s*'CONFIG'/g) || []).length;
  check('toda gravação da CONFIG passa por _bhConfigGravar (uma escrita só no arquivo)', escritas === 1, String(escritas));

  // ══ 7. Couvert: valor que não bate com qtd × R$ 7 ═══════════════════════════════════════
  const salvarCouvert = (qtd, valor, respostas) => page.evaluate(async ({ qtd, valor, respostas }) => {
    _triosHojeRecords = [{ id: 'b1', loja: 'boulevard', data: '2026-11-01', cache: 0, couver_qtd: 0, couver_valor: 0 }];
    _renderBandaHoje = () => {}; _preencherBandaDiaFromAgenda = () => {};
    window._perguntas = []; let n = 0;
    confirm = (t) => { window._perguntas.push(t); return respostas[n++]; };
    ['banda-hoje-qtd', 'banda-hoje-valor'].forEach((id, i) => { let el = document.getElementById(id); if (!el) { el = document.createElement('input'); el.id = id; document.body.appendChild(el); } el.value = String(i ? valor : qtd); });
    await _salvarCouvertBandaHoje();
    return window._perguntas;
  }, { qtd, valor, respostas });
  const valorGravado = () => { const p = st.agenda.filter(x => x.corpo && 'couver_valor' in x.corpo).pop(); return p ? Number(p.corpo.couver_valor) : null; };

  st.agenda = [];
  let perg = await salvarCouvert(88, 7, [true]);
  check('88 pessoas e R$ 7 digitado: pergunta, mostrando R$ 616,00', perg.length === 1 && /R\$ 616,00/.test(perg[0]) && /88 × R\$ 7,00/.test(perg[0]), JSON.stringify(perg));
  check('…e ao confirmar grava R$ 616 (o caso do Boulevard em 01/11)', valorGravado() === 616, String(valorGravado()));
  st.agenda = [];
  perg = await salvarCouvert(88, 7, [false, true]);
  check('quem quiser mesmo outro valor confirma de novo e grava o digitado', perg.length === 2 && valorGravado() === 7, String(valorGravado()));
  st.agenda = [];
  perg = await salvarCouvert(88, 7, [false, false]);
  check('cancelando as duas perguntas, nada é gravado', perg.length === 2 && st.agenda.length === 0, JSON.stringify(st.agenda));
  st.agenda = [];
  perg = await salvarCouvert(88, 616, []);
  check('valor certo (qtd × R$ 7) salva direto, sem perguntar', perg.length === 0 && valorGravado() === 616, JSON.stringify(perg));

  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
