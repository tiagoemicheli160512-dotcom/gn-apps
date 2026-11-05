// "Buscar as validades do Check-list e colocar no app Home lojas, pra ficar registrado
//  sempre que entrar no alerta pra vencer. Se tiver alguma vencida, não permitir o acesso
//  do app só após a modificação da data."
//
// Combinado: bloqueia TUDO MENOS o Check-list (que é onde se corrige — fechar ele também
// trancaria a loja por dentro), destrava quando não sobrar nenhum vencido (corrigir a data
// OU excluir o item), e mestre/supervisão não são bloqueados.
//
// Metade das checagens é sobre não trancar quem não deve: falha de rede, sessão sem loja,
// Maglia, GERAL, e sobretudo o Check-list.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const GUARD = process.env.ARQ_GUARD || CAMINHOS.pub('gn-validade-acesso.js');
const CFG = CAMINHOS.pub('gn-lojas-config.js');
const fs = require('fs');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const HOJE = '2026-10-08';
// Dado real: Campo Grande tinha 1 vencido em câmaras e 1 em estoque, ambos de 07/10.
const LINHAS_CG = [
  { loja: 'VALIDADES_CAMPO_GRANDE_camaras', all_data: { itens: [
    { id: '1', nome: 'CARNE DE SOL', validade: '2026-10-07' },
    { id: '2', nome: 'QUEIJO COALHO', validade: '2026-10-20' } ] } },
  { loja: 'VALIDADES_CAMPO_GRANDE_estoque', all_data: { itens: [
    { id: '3', nome: 'ARROZ TIPO 1', validade: '2026-10-07' },
    { id: '4', nome: 'FEIJÃO', validade: '2026-11-30' } ] } },
  { loja: 'VALIDADES_CAMPO_GRANDE_salao', all_data: { itens: [
    { id: '5', nome: 'GUARANÁ LATA', validade: '2026-10-25' } ] } },
];
const LINHAS_LIMPAS = [
  { loja: 'VALIDADES_PEDREIRA_camaras', all_data: { itens: [
    { id: '9', nome: 'PICANHA', validade: '2026-10-30' } ] } },
];

async function abrir(browser, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 430, height: 950 } });
  let pedidos = [];
  await ctx.route('**/rest/v1/**', (r) => {
    pedidos.push(r.request().url());
    if (opts.semRede) return r.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(opts.linhas || []) });
  });
  const page = await ctx.newPage();
  // Uma página com o caminho do app que se quer simular — o guardião se exime no Check-list
  // olhando location.pathname, então o caminho faz parte do caso de teste.
  await page.goto('file://' + (opts.comoChecklist
    ? CAMINHOS.pub('gn-checklist.html')
    : CAMINHOS.pub('gn-home.html')));
  await page.evaluate(() => { document.querySelectorAll('script').forEach(s => s.remove()); });
  await page.addScriptTag({ content: fs.readFileSync(CFG, 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(GUARD, 'utf8') });
  await page.waitForFunction(() => !!window.gnValidadeAcesso, { timeout: 15000 });
  return { ctx, page, pedidos: () => pedidos };
}

const sessao = (o) => Object.assign({ id: 9, nome: 'Thalyta', loja: 'CAMPO GRANDE', cargo: 'gerente', permissoes: {}, ts: Date.now() }, o || {});

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  // ── 1. A regra pura ───────────────────────────────────────────────────────────
  const a = await abrir(browser, { linhas: LINHAS_CG });
  const regra = await a.page.evaluate((hoje) => {
    const itens = [
      { area: 'camaras', nome: 'CARNE DE SOL', validade: '2026-10-07' },
      { area: 'estoque', nome: 'ARROZ', validade: hoje },
      { area: 'salao', nome: 'GUARANÁ', validade: '2026-12-01' },
    ];
    const r = gnValidadeAcesso._avaliar(itens, hoje);
    const semVencido = gnValidadeAcesso._avaliar(itens.slice(1), hoje);
    const vazio = gnValidadeAcesso._avaliar([], hoje);
    return { bloq: r.bloqueado, qtd: r.vencidos.length, areas: Object.keys(r.porArea),
             semVencido: semVencido.bloqueado, vazio: vazio.bloqueado };
  }, HOJE);
  check('item com data anterior a hoje bloqueia', regra.bloq === true && regra.qtd === 1);
  check('item que vence HOJE ainda não está vencido', regra.areas.join() === 'camaras');
  check('sem vencido, não bloqueia', regra.semVencido === false);
  check('lista vazia não bloqueia', regra.vazio === false);

  // ── 2. O caso real: Campo Grande com 2 vencidos ──────────────────────────────
  const cg = await a.page.evaluate(([s, hoje]) =>
    gnValidadeAcesso.verificar(s, { hoje, semCache: true }).then(r => ({
      bloq: r.bloqueado, qtd: r.vencidos.length, areas: Object.keys(r.porArea).sort().join(','),
    })), [sessao(), HOJE]);
  check('Campo Grande fica bloqueada pelos 2 vencidos', cg.bloq === true && cg.qtd === 2);
  check('e a tela sabe dizer em quais setores', cg.areas === 'camaras,estoque');

  // ── 3. A tela mostra o que fazer, e o caminho de volta ──────────────────────
  const tela = await a.page.evaluate(([s, hoje]) =>
    gnValidadeAcesso.verificar(s, { hoje, semCache: true }).then(r => {
      gnValidadeAcesso.mostrar(s, r);
      const el = document.getElementById('gn-validade-bloqueio');
      const txt = el.textContent.replace(/\s+/g, ' ');
      const res = {
        cobre: !!el,
        temProduto: /CARNE DE SOL/.test(txt) && /ARROZ TIPO 1/.test(txt),
        temSetor: /Câmaras frias/.test(txt) && /Estoque/.test(txt),
        dizCorrigir: /corrija a data/i.test(txt), dizExcluir: /exclua o item/i.test(txt),
        temBotaoChecklist: !!el.querySelector('#gn-val-ir'),
        temRevalidar: !!el.querySelector('#gn-val-revalidar'),
        cobreTudo: el.getBoundingClientRect().width >= window.innerWidth - 1,
      };
      gnValidadeAcesso.fechar();
      res.fechou = !document.getElementById('gn-validade-bloqueio');
      return res;
    }), [sessao(), HOJE]);
  check('a tela de bloqueio cobre o app inteiro', tela.cobre && tela.cobreTudo);
  check('nomeando o produto e o setor', tela.temProduto && tela.temSetor);
  check('e dizendo as duas saídas: corrigir a data ou excluir', tela.dizCorrigir && tela.dizExcluir);
  check('com o caminho de volta pro Check-list', tela.temBotaoChecklist && tela.temRevalidar);
  check('e sai da frente quando resolve', tela.fechou === true);

  // ── 4. O que NÃO pode ser bloqueado ─────────────────────────────────────────
  const livres = await a.page.evaluate(([hoje]) => {
    const P = (s, o) => gnValidadeAcesso.verificar(s, Object.assign({ hoje, semCache: true }, o || {})).then(r => r.bloqueado);
    const base = { id: 9, nome: 'X', loja: 'CAMPO GRANDE', cargo: 'gerente', permissoes: {}, ts: Date.now() };
    return Promise.all([
      P(Object.assign({}, base, { cargo: 'mestre' })),
      P(Object.assign({}, base, { cargo: 'supervisor' })),
      P(Object.assign({}, base, { loja: 'GERAL' })),
      P(Object.assign({}, base, { loja: 'Maglia' })),
      P(null),
      P(Object.assign({}, base, { loja: '' })),
    ]).then(v => ({ mestre: v[0], supervisor: v[1], geral: v[2], maglia: v[3], semSessao: v[4], semLoja: v[5] }));
  }, [HOJE]);
  check('mestre não é bloqueado', livres.mestre === false);
  check('supervisor não é bloqueado', livres.supervisor === false);
  check('quem é GERAL não é bloqueado', livres.geral === false);
  check('Maglia fica de fora (não foi citada — CLAUDE.md)', livres.maglia === false);
  check('sessão ausente ou sem loja nunca bloqueia', livres.semSessao === false && livres.semLoja === false);
  await a.ctx.close();

  // ── 5. O Check-list é a porta de saída e NUNCA pode ser coberto ────────────
  const chk = await abrir(browser, { linhas: LINHAS_CG, comoChecklist: true });
  const noChecklist = await chk.page.evaluate(([s, hoje]) =>
    gnValidadeAcesso.verificar(s, { hoje, semCache: true }).then(r => r.bloqueado), [sessao(), HOJE]);
  check('com os mesmos vencidos, o Check-list NÃO é bloqueado — é onde se corrige',
    noChecklist === false);
  // E a regra continua enxergando o vencido quando perguntada explicitamente: o que muda é
  // só a decisão de cobrir ESTE app.
  const aindaVe = await chk.page.evaluate(([s, hoje]) =>
    gnValidadeAcesso.verificar(s, { hoje, semCache: true, ignorarApp: true }).then(r => r.vencidos.length), [sessao(), HOJE]);
  check('mas o vencido continua lá (a isenção é do app, não da regra)', aindaVe === 2);
  await chk.ctx.close();

  // ── 6. Falha de rede libera ────────────────────────────────────────────────
  const semRede = await abrir(browser, { semRede: true });
  const r6 = await semRede.page.evaluate(([s, hoje]) =>
    gnValidadeAcesso.verificar(s, { hoje, semCache: true }).then(r => r.bloqueado), [sessao(), HOJE]);
  check('sem internet, libera — trancar a loja por um blip de rede é pior', r6 === false);
  await semRede.ctx.close();

  // ── 7. Loja sem vencido passa, e o cache não gruda no bloqueado ───────────
  const limpa = await abrir(browser, { linhas: LINHAS_LIMPAS });
  const r7 = await limpa.page.evaluate(([hoje]) => {
    const s = { id: 1, nome: 'V', loja: 'PEDREIRA', cargo: 'gerente', permissoes: {}, ts: Date.now() };
    return gnValidadeAcesso.verificar(s, { hoje, semCache: true }).then(r => ({
      bloq: r.bloqueado, cache: localStorage.getItem('gn_validade_cache') !== null }));
  }, [HOJE]);
  check('loja sem vencido passa', r7.bloq === false);
  check('e só o resultado LIBERADO é guardado em cache', r7.cache === true);
  await limpa.ctx.close();

  // Corrigiu: a releitura tem que liberar na hora, sem esperar cache expirar.
  const corrigiu = await abrir(browser, { linhas: LINHAS_CG });
  const r8 = await corrigiu.page.evaluate(([s, hoje, limpas]) => {
    return gnValidadeAcesso.verificar(s, { hoje, semCache: true }).then(antes => {
      // Simula a correção: a loja arruma as datas no Check-list.
      window.__corrigido = limpas;
      return { antes: antes.bloqueado, cacheDepoisDeBloquear: localStorage.getItem('gn_validade_cache') };
    });
  }, [sessao(), HOJE, LINHAS_LIMPAS]);
  check('bloqueado não deixa cache pra trás (senão a tela teima depois de corrigir)',
    r8.antes === true && r8.cacheDepoisDeBloquear === null);
  await corrigiu.ctx.close();

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
