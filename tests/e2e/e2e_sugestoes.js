// "Queria abrir uma aba provisória de uma semana a partir de hoje, onde no app home lojas
//  teria um espaço dedicado para dar sugestões para melhorias do app. Após uma semana
//  veríamos o que foi colocado e filtramos o que de fato é válido."
//
// Decidido com o dono: lista pública COM NOME, e botão "também quero" pra segunda pessoa não
// redigitar — a contagem vira o sinal de prioridade na hora de filtrar. Janela até 09/10;
// depois fecha sozinha, mas mestre e supervisor continuam lendo (senão o material fica
// preso num card que ninguém mais abre).
//
// Cada sugestão é uma LINHA PRÓPRIA em gn_lojas. O que este teste mais cobra é isso: com
// dezenas de pessoas mandando na mesma semana, uma não pode apagar a outra.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const JA_TEM = [
  { loja: 'SUGESTAO_1_a', all_data: { atrapalha: 'A contagem abre item por item, são mais de 200',
      resolveria: 'uma lista só', autor: 'Taynara', autorId: 16, autorLoja: 'BANGU',
      criado_em: '2026-10-02T10:00:00Z', votos: ['Carol', 'Neto'] } },
  { loja: 'SUGESTAO_2_b', all_data: { atrapalha: 'O relatório de caixa não mostra o dia anterior',
      resolveria: '', autor: 'Jandy', autorId: 3, autorLoja: 'CAXIAS',
      criado_em: '2026-10-02T11:00:00Z', votos: [] } },
];

async function abrir(browser, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 430, height: 950 } });
  const posts = [], patches = [];
  let banco = JSON.parse(JSON.stringify(opts.banco || JA_TEM));
  await ctx.route('**/rest/v1/**', async (r) => {
    const req = r.request(), url = req.url(), m = req.method();
    const json = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/gn_lojas/.test(url) && /loja=like/.test(url) && m === 'GET') return json(banco);
    if (/gn_lojas/.test(url) && /loja=eq\.SUGESTAO/.test(url) && m === 'GET') {
      const id = decodeURIComponent((url.match(/loja=eq\.([^&]+)/) || [])[1] || '');
      return json(banco.filter(x => x.loja === id));
    }
    if (/gn_lojas/.test(url) && m === 'POST') {
      const b = JSON.parse(req.postData() || '{}');
      posts.push(b); banco.push(b);
      return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    }
    if (/gn_lojas/.test(url) && m === 'PATCH' && /loja=eq\.SUGESTAO/.test(url)) {
      const id = decodeURIComponent((url.match(/loja=eq\.([^&]+)/) || [])[1] || '');
      const b = JSON.parse(req.postData() || '{}');
      patches.push({ id, body: b });
      const alvo = banco.find(x => x.loja === id);
      if (alvo) alvo.all_data = b.all_data;
      return r.fulfill({ status: 204, body: '' });
    }
    return json([]);
  });
  const page = await ctx.newPage();
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => typeof _renderSugestoesHome === 'function', { timeout: 25000 });
  return { ctx, page, posts, patches, banco: () => banco };
}

const desenhar = (page, sess, master) => page.evaluate(async ([s, m]) => {
  session = s; masterLoja = m;
  _sugLista = null; _sugFormAberto = false; _sugErro = '';
  await _sugCarregar(true);
  _renderSugestoesHome(session, !!masterLoja);
  return document.getElementById('sugestoes-app-home-card').innerHTML;
}, [sess, master]);

const GERENTE = { id: 15, nome: 'Carol', loja: 'BANGU', cargo: 'sub_gerente', permissoes: {} };
const MESTRE  = { id: 38, nome: 'Tiago', loja: 'GERAL', cargo: 'mestre', permissoes: { master: true } };
const CAIXA   = { id: 80, nome: 'Patrícia', loja: 'BANGU', cargo: 'caixa', permissoes: {} };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const a = await abrir(browser);

  // ── 1. O card aparece pra quem usa o app ──────────────────────────────────────────
  const g = await desenhar(a.page, GERENTE, null);
  check('a gerência de loja vê a caixa de sugestões',
    /O que dá pra melhorar no app/.test(g) && /Escrever uma sugestão/.test(g));
  check('e vê o prazo, pra saber que é por tempo limitado', /Caixa aberta até 09\/10/.test(g));

  const c = await desenhar(a.page, CAIXA, null);
  check('caixa da loja também vê — quem usa o app o dia inteiro é quem tem o que dizer',
    /Escrever uma sugestão/.test(c));

  const m = await desenhar(a.page, MESTRE, null);
  check('o mestre em "Todas as lojas" vê igual (é ele que vai ler o que chegou)',
    /O que dá pra melhorar no app/.test(m));

  // ── 2. A lista é pública, com nome, e ordenada por quem mais pediu ────────────────
  check('as sugestões já enviadas aparecem pra todo mundo',
    /contagem abre item por item/.test(g) && /relatório de caixa/.test(g));
  check('com o nome e a loja de quem mandou (decisão do dono)',
    /Taynara/.test(g) && /Bangu/.test(g) && /Jandy/.test(g));
  check('a mais pedida vem primeiro, não a mais recente',
    g.indexOf('contagem abre item por item') < g.indexOf('relatório de caixa'));
  check('a contagem de "também quero" fica à vista', /também quero · 2/.test(g));
  const ordem = await a.page.evaluate(() => _sugLista.map(s => (s.votos || []).length));
  check('e a ordenação é pela contagem mesmo', JSON.stringify(ordem) === '[2,0]');

  // ── 3. Enviar: uma linha por sugestão, sem ler-alterar-gravar ────────────────────
  const enviou = await a.page.evaluate(async () => {
    session = { id: 15, nome: 'Carol', loja: 'BANGU', cargo: 'sub_gerente', permissoes: {} };
    masterLoja = null;
    _sugFormAberto = true; _sugErro = '';
    _renderSugestoesHome(session, false);
    document.getElementById('sug-atrapalha').value = 'O botão de salvar fica escondido no fim da página';
    document.getElementById('sug-resolveria').value = 'deixar fixo no rodapé';
    await _sugEnviar();
    return { erro: _sugErro, formAberto: _sugFormAberto };
  });
  check('enviou sem erro e o formulário fecha sozinho',
    enviou.erro === '' && enviou.formAberto === false);
  check('virou uma LINHA PRÓPRIA, com prefixo de sugestão',
    a.posts.length === 1 && /^SUGESTAO_/.test(a.posts[0].loja));
  check('é um POST independente — nenhuma sugestão existente é reescrita no caminho',
    a.patches.length === 0);
  check('guarda as duas respostas, o autor e a loja',
    a.posts[0].all_data.atrapalha.includes('botão de salvar') &&
    a.posts[0].all_data.resolveria === 'deixar fixo no rodapé' &&
    a.posts[0].all_data.autor === 'Carol' && a.posts[0].all_data.autorLoja === 'BANGU');
  check('e nasce com a lista de votos vazia, não indefinida',
    Array.isArray(a.posts[0].all_data.votos) && a.posts[0].all_data.votos.length === 0);

  // ── 4. Texto vago é barrado, com explicação ─────────────────────────────────────
  const vago = await a.page.evaluate(async () => {
    _sugFormAberto = true; _sugErro = '';
    _renderSugestoesHome(session, false);
    document.getElementById('sug-atrapalha').value = 'melhorar';
    await _sugEnviar();
    return _sugErro;
  });
  check('"melhorar" não passa — pede o caso concreto em vez de aceitar e virar lixo',
    /caso concreto/.test(vago));
  check('e nada foi gravado por causa disso', a.posts.length === 1);

  // ── 5. "Também quero": marca, desmarca, e não duplica ───────────────────────────
  const votou = await a.page.evaluate(async () => {
    session = { id: 80, nome: 'Patrícia', loja: 'BANGU', cargo: 'caixa', permissoes: {} };
    await _sugVotar('SUGESTAO_2_b');
    const depois = (_sugLista.find(s => s.id === 'SUGESTAO_2_b') || {}).votos || [];
    await _sugVotar('SUGESTAO_2_b');
    const retirado = (_sugLista.find(s => s.id === 'SUGESTAO_2_b') || {}).votos || [];
    return { depois, retirado };
  });
  check('clicar em "também quero" soma o voto', votou.depois.join(',') === 'Patrícia');
  check('clicar de novo tira — dá pra desfazer', votou.retirado.length === 0);

  const dobrou = await a.page.evaluate(async () => {
    await _sugVotar('SUGESTAO_1_a');     // Carol já estava nessa lista
    session = { id: 15, nome: 'Carol', loja: 'BANGU', cargo: 'sub_gerente', permissoes: {} };
    await _sugVotar('SUGESTAO_1_a');
    return (_sugLista.find(s => s.id === 'SUGESTAO_1_a') || {}).votos || [];
  });
  check('ninguém conta duas vezes na mesma sugestão',
    dobrou.filter(n => n === 'Carol').length <= 1);
  await a.ctx.close();

  // ── 6. Depois do prazo: fecha pra loja, segue aberto pra quem vai filtrar ───────
  const d = await abrir(browser);
  const depois = await d.page.evaluate(async ([ger, mes]) => {
    const r = {};
    // Finge que já passou de 09/10 trocando o cálculo de hoje.
    const real = _sugHojeISO;
    window._sugHojeISO = () => '2026-10-20';
    _sugHojeISO = () => '2026-10-20';
    session = ger; masterLoja = null; _sugLista = null;
    await _sugCarregar(true);
    _renderSugestoesHome(session, false);
    r.gerente = document.getElementById('sugestoes-app-home-card').innerHTML;
    session = mes;
    _renderSugestoesHome(session, false);
    r.mestre = document.getElementById('sugestoes-app-home-card').innerHTML;
    _sugHojeISO = real;
    return r;
  }, [GERENTE, MESTRE]);
  check('passada a semana, o card some da Home da loja sozinho (sem precisar de deploy)',
    depois.gerente.trim() === '');
  check('mas o mestre continua vendo o que foi mandado',
    /O que dá pra melhorar/.test(depois.mestre) && /contagem abre item por item/.test(depois.mestre));
  check('e já sem o botão de escrever — a caixa fechou',
    !/Escrever uma sugestão/.test(depois.mestre) && /caixa fechou/i.test(depois.mestre));
  await d.ctx.close();

  // ── 7. Sem internet não quebra a Home ──────────────────────────────────────────
  const off = await browser.newContext({ ignoreHTTPSErrors: true });
  await off.route('**/rest/v1/**', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
  const po = await off.newPage();
  const errosPg = [];
  po.on('pageerror', e => errosPg.push(e.message));
  await po.goto('file://' + HOME);
  await po.waitForFunction(() => typeof _renderSugestoesHome === 'function', { timeout: 25000 });
  const semRede = await po.evaluate(async (s) => {
    session = s; masterLoja = null; _sugLista = null;
    await _sugCarregar(true);
    _renderSugestoesHome(session, false);
    return document.getElementById('sugestoes-app-home-card').innerHTML;
  }, GERENTE);
  check('banco fora do ar: o card ainda aparece e deixa escrever',
    /Escrever uma sugestão/.test(semRede) && errosPg.length === 0);
  await off.close();

  // ── 8. Texto de quem escreve não vira HTML ─────────────────────────────────────
  const xss = await abrir(browser, { banco: [{ loja: 'SUGESTAO_x', all_data: {
    atrapalha: '<img src=x onerror=alert(1)>', resolveria: '', autor: '<b>Fulano</b>',
    autorId: 9, autorLoja: 'BANGU', criado_em: '2026-10-02T09:00:00Z', votos: [] } }] });
  const limpo = await desenhar(xss.page, GERENTE, null);
  const temTag = await xss.page.evaluate(() =>
    !!document.querySelector('#sugestoes-app-home-card img'));
  check('o que a pessoa escreve é tratado como texto, nunca como HTML',
    temTag === false && /&lt;img/.test(limpo) && /&lt;b&gt;Fulano/.test(limpo));
  await xss.ctx.close();

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
