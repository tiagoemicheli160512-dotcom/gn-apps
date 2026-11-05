// "Tenho a impressão que algumas informações não são vistas nem abertas."
//
// Medido no banco antes de desenhar qualquer coisa (30 dias): Norte Shopping fechou 48
// caixas e registrou ZERO conferências, São Gonçalo 30 e zero, Campo Grande 29 e zero —
// enquanto Bangu e Caxias conferiram todos os 30. E 57 dos 342 alertas urgentes nunca
// foram confirmados. Acesso não era o problema: gerente e sub-gerente abrem o app todo dia.
//
// Correção do usuário depois da primeira versão: a CONFERÊNCIA do caixa é do RH (app de
// RH, aba Financeiro) — a loja só entra quando sobrou DIVERGÊNCIA, e o que se cobra dela é
// verificar e registrar que verificou. Cobrar conferência da loja seria travá-la em algo
// que não é dela. O teste abaixo protege essa fronteira.
//
// Daí o card "Pra fazer hoje": o que é da gerência hoje, o que falta, e o nome de quem fez.
// A regra que este teste protege é a que faz a coisa não virar teatro: "feito" vem do DADO
// que já existe (conferência gravada, dia fechado), nunca de um "marcar como lido".
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => { try { return typeof _renderPraHojeHome === 'function'; } catch (e) { return false; } }, { timeout: 20000 });

  // cenario: 'nada' | 'metade' | 'tudo'
  const montar = (cenario, cargo) => page.evaluate(async ([cenario, cargo]) => {
    session = { id: 1, nome: 'Tiago', cargo, loja: cargo === 'mestre' ? 'GERAL' : LOJAS_LISTA[0],
                permissoes: cargo === 'mestre' ? { master: true } : {} };
    masterLoja = cargo === 'mestre' ? LOJAS_LISTA[0] : null;
    // Conferido pelo RH; o que muda entre os cenários é a DIVERGÊNCIA estar ou não
    // verificada pela loja.
    const base = { conferido_por: 'RH', conferido_em: new Date().toISOString(), itens: [] };
    const comDiv = { ...base, tem_divergencia: true };
    const divVista = { ...base, tem_divergencia: true,
      divergencia_resolvida: { resolvido_por: 'TAYNARA', resolvido_em: new Date().toISOString(), obs: 'troco do cliente' } };
    const fix = {
      'praHoje:caixa': [{ id: 101, turno: 'NOITE' }, { id: 102, turno: 'DIA' }],
      'praHoje:lojas': [{ all_data: { caixa_conferencias:
        cenario === 'tudo' ? { 101: divVista, 102: divVista } :
        cenario === 'metade' ? { 101: divVista, 102: comDiv } :
        cenario === 'sem_divergencia' ? { 101: base, 102: base } :
        { 101: comDiv, 102: comDiv } } }],
      'praHoje:chk': [cenario === 'tudo'
        ? { checklist_pct: 100, dia_fechado_em: new Date().toISOString(), dia_fechado_por: 'CAROL' }
        : { checklist_pct: 40, dia_fechado_em: null, dia_fechado_por: null }],
      'praHoje:manut': cenario === 'tudo' ? [] : [{ data_operacao: '2026-09-01',
        manutencao: [{ descricao: 'Freezer pingando', setor: 'Cozinha', status: 'Pendente' }] }],
    };
    window.gnFetchJson = async (u, h, c, fb) => (c in fix ? fix[c] : fb);
    await _renderPraHojeHome(true, session, cargo === 'mestre');
    await new Promise(r => setTimeout(r, 120));
    const card = document.getElementById('pra-hoje-card');
    const txt = (card.textContent || '').replace(/\s+/g, ' ');
    return {
      vazio: !card.innerHTML.trim(), txt,
      linhas: card.querySelectorAll('[onclick^="navTo"]').length,
      feitos: [...card.querySelectorAll('[onclick^="navTo"]')].filter(l => /line-through/.test(l.innerHTML)).length,
      temVerTudo: !!card.querySelector('[onclick*="pra_hoje"]'),
    };
  }, [cenario, cargo]);

  // ── Nada feito: o caso das três lojas que nunca conferiram caixa ───────────────────────
  let r = await montar('nada', 'gerente');
  check('com nada feito, o card aparece', !r.vazio);
  check('e diz quantos faltam', /3 de 3 ainda não foram feitos/.test(r.txt));
  check('cobra só a DIVERGÊNCIA do caixa, não a conferência (que é do RH)',
    /Verificar 2 caixas de ontem com divergência/.test(r.txt) && /NOITE · DIA/.test(r.txt)
    && !/Conferir o caixa/.test(r.txt));
  check('cobra o check-list, dizendo quanto falta', /Fechar o Check-list de hoje/.test(r.txt) && /40% preenchido/.test(r.txt));
  check('cobra a manutenção parada', /1 manutenção parada há mais de 5 dias/.test(r.txt));
  check('nada aparece como feito', r.feitos === 0);

  // ── Metade: um turno conferido, outro não ─────────────────────────────────────────────
  r = await montar('metade', 'gerente');
  check('verificar uma divergência e deixar outra em aberto não dá o item por feito',
    /Verificar o caixa de ontem com divergência/.test(r.txt) && r.feitos === 0);

  // ── Tudo feito: o card vira confirmação, com o nome de quem fez ───────────────────────
  r = await montar('tudo', 'gerente');
  check('com tudo feito, o card diz que está tudo feito', /tudo feito/i.test(r.txt));
  check('e risca os itens', r.feitos === 2);
  check('mostrando QUEM verificou a divergência', /por TAYNARA/.test(r.txt));
  check('e quem fechou o check-list', /por CAROL/.test(r.txt));
  check('"feito" nunca é marcação manual: não existe botão de marcar como lido',
    !/marcar como lido|marcar como visto/i.test(r.txt));

  // ── Caixa sem divergência: a loja não é cobrada de nada ───────────────────────────────
  r = await montar('sem_divergencia', 'gerente');
  check('caixa conferido pelo RH e SEM divergência não vira tarefa da loja',
    !/caixa/i.test(r.txt));

  // ── Quem vê ───────────────────────────────────────────────────────────────────────────
  check('sub-gerente vê', !(await montar('nada', 'sub_gerente')).vazio);
  check('mestre dentro de uma loja vê', !(await montar('nada', 'mestre')).vazio);
  const caixa = await montar('nada', 'caixa');
  check('caixa não vê (a lista é da gerência, como combinado)', caixa.vazio);

  // ── A lista inteira em tela cheia ─────────────────────────────────────────────────────
  await montar('metade', 'gerente');
  const cheia = await page.evaluate(async () => {
    document.querySelector('[onclick*="pra_hoje"]').click();
    await new Promise(r => requestAnimationFrame(r));
    const t = document.getElementById('_tela-cheia');
    return { abriu: !!t, txt: t ? t.textContent.replace(/\s+/g, ' ') : '' };
  });
  check('"ver tudo" abre a lista em tela cheia', cheia.abriu);
  check('com o que falta e o que foi feito', /falta/.test(cheia.txt) && /Faltam/.test(cheia.txt));
  // O supabase-js vem de um CDN. Quando ele não vem, o script estoura em createClient e o
  // teste acusava o APP por causa da internet daqui — 1 rodada em 3. É rede, não código.
  const errosReais = erros.filter(e => !/createClient/.test(e));

  check('nenhum erro de JS', errosReais.length === 0);
  if (errosReais.length) errosReais.slice(0, 3).forEach(e => console.log('      ' + e.slice(0, 180)));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
