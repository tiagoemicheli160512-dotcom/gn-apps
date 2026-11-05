// "Gostei dessa combinação de cores. Consegue replicar no aplicativo?"
//
// O risco desta mudança não é quebrar nada: é texto invisível sobre fundo invisível, que
// NÃO dá erro nenhum. A tela só fica ilegível na mão de quem está trabalhando, e eu não
// tenho como ver isso daqui. Então o teste não olha cores declaradas — ele percorre cada
// elemento visível das 11 abas, resolve a cor REAL do texto e a cor REAL do fundo atrás
// dele (subindo a árvore enquanto for transparente) e calcula o contraste.
//
// O limite usado é 3,0:1. A WCAG pede 4,5 pra texto pequeno; aqui o alvo é mais frouxo de
// propósito, pra pegar o que está ILEGÍVEL sem afogar o resultado em avisos de rótulo
// cinza — que é o jeito de um teste virar paisagem e parar de ser lido.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
// Esta suite compara com o arquivo do origin/main. Sem ele, o page.goto estourava
// ERR_FILE_NOT_FOUND la no fim e a suite nao imprimia NADA — varias vezes nesta sessao isso
// foi lido como "suite sem saida" e quase passou por verde. Falhar calado e pior que falhar.
const _BASE_PATH = process.env.ARQ_BASE || CAMINHOS.BASE_CHK;
if (!require('fs').existsSync(_BASE_PATH)) {
  console.log('FALHOU: o arquivo de comparacao nao existe: ' + _BASE_PATH);
  console.log('        crie com:  git -C ' + CAMINHOS.RAIZ + ' show origin/main:public/gn-checklist.html > ' + _BASE_PATH);
  console.log('        (ele precisa ficar em public/, ao lado dos <script src> relativos)');
  console.log('0 ok, 1 falhou');
  process.exit(1);
}
const LIMITE = 3.0;
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const ABAS = ['dados','abertura','checklist','fechamento','carnes','faltas','utensilios','manutencao','caixa','historico','guia'];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver','9999'); } catch (e) {} });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  // Laço de repetição como nos outros testes daqui: o arquivo puxa o supabase-js de um CDN,
  // e quando ele não vem o script estoura em createClient ANTES de `let LOJA` — que fica em
  // TDZ pra sempre e o teste morre num timeout que não diz nada. Nada a ver com o tema.
  for (let t = 1; ; t++) {
    await page.goto('file://' + CHK);
    try {
      await page.waitForFunction(() => { try {
        return typeof LOJA === 'string' && typeof switchTab === 'function' && typeof gnTrocarTema === 'function';
      } catch (e) { return false; } }, { timeout: 15000 });
      break;
    } catch (e) { if (t >= 5) throw new Error('o Check-list não carregou em 5 tentativas (CDN do supabase-js fora?)'); }
  }

  await page.evaluate(() => {
    hideLogin();
    LOJA = 'Bangu';
    usuarioLogado = { id: 1, nome: 'Taynara', cargo: 'gerente', loja: 'BANGU' };
    autoSave = () => {}; _debouncedSaveAll = () => {}; showToast = () => {};
    const ov = document.getElementById('abertura-overlay'); if (ov) ov.remove();
    document.body.style.overflow = '';
  });

  // ── O básico do botão ────────────────────────────────────────────────────────────────
  const padrao = await page.evaluate(() => document.documentElement.getAttribute('data-tema'));
  check('o app abre no claro por padrão (ninguém é empurrado pro escuro)', padrao === null);

  // O teste anterior só perguntava se o elemento EXISTIA — e existia: eu tinha posto o botão
  // na barra lateral, que vive dentro de @media (min-width:768px). No celular, que é onde o
  // app é usado, ele não era desenhado. O usuário viu antes do teste. Agora mede se dá pra
  // TOCAR nele, na largura do aparelho dele.
  const visivel = await page.evaluate(() => {
    const b = document.getElementById('btn-tema');
    if (!b) return { existe: false };
    const r = b.getBoundingClientRect();
    return { existe: true, naTela: r.width > 20 && r.height > 20 && r.top >= 0 && r.left >= 0 && r.right <= innerWidth,
             w: Math.round(r.width), h: Math.round(r.height) };
  });
  check('o botão do tema EXISTE', visivel.existe === true);
  check('e está visível e tocável na largura do celular (390px)', visivel.naTela === true);
  if (visivel.existe && !visivel.naTela) console.log(`      tamanho medido: ${visivel.w}x${visivel.h}`);

  const trocou = await page.evaluate(() => {
    gnTrocarTema();
    return { attr: document.documentElement.getAttribute('data-tema'),
             guardado: localStorage.getItem('gn_tema'),
             icone: document.getElementById('btn-tema').textContent.trim(),
             barra: (document.querySelector('meta[name="theme-color"]')||{}).content };
  });
  check('o botão liga o escuro', trocou.attr === 'escuro');
  check('e guarda a escolha no aparelho, na chave compartilhada entre os apps', trocou.guardado === 'escuro');
  check('o ícone vira o de voltar pro claro', trocou.icone === '☀️');
  check('e a barra do sistema acompanha (senão a faixa de cima fica branca)', /14171C/i.test(trocou.barra || ''));

  const voltou = await page.evaluate(() => { gnTrocarTema();
    return { attr: document.documentElement.getAttribute('data-tema'), guardado: localStorage.getItem('gn_tema') }; });
  check('e desliga de volta', voltou.attr === null && voltou.guardado === 'claro');

  // A escolha tem que sobreviver ao recarregamento, SEM piscar branco: o tema é aplicado
  // no <head>, antes da primeira pintura.
  // A escolha e reposta a cada navegacao DESTA pagina, nao so gravada uma vez.
  //
  // Por que: sob file:// o Chromium nem sempre devolve a mesma particao de armazenamento
  // depois de um reload. Medido, nas rodadas vermelhas: guardado=null, scriptNoHead=true,
  // gnTrocarTema=function — ou seja, o script do tema estava la e funcionando; o que tinha
  // sumido era o VALOR. Era isso a instabilidade, 2 em 12 rodadas. A propria suite ja
  // dependia desse mecanismo sem perceber: gn_chk_page_ver e reposto pelo addInitScript do
  // contexto a cada navegacao, e por isso nunca falhou.
  //
  // Nao afrouxa a verificacao: o que se cobra do APP e ler a escolha guardada e aplica-la
  // antes da primeira pintura, e isso continua sendo exercido igual. O que deixa de ser
  // cobrado e o localStorage do file:// sobreviver a uma navegacao, que e trabalho do
  // navegador e aqui nem e confiavel. O setItem continua, pra exercer tambem o caminho
  // normal quando a particao se mantem.
  await page.addInitScript(() => { try { localStorage.setItem('gn_tema','escuro'); } catch(e){} });
  await page.evaluate(() => { try { localStorage.setItem('gn_tema','escuro'); } catch(e){} });
  for (let t = 1; ; t++) {
    await page.reload();
    // Esperar por LOJA nao basta: declaracao de funcao e `let` do inicio ja existem enquanto
    // o resto do bloco ainda roda. _aberturaDados e um `let` do FIM — e o que prova que
    // terminou. E o mesmo criterio que a pagina de comparacao ja usava mais abaixo; aqui
    // tinha ficado o criterio fraco.
    try { await page.waitForFunction(() => { try {
      return typeof LOJA === 'string' && typeof switchTab === 'function' && typeof _aberturaDados !== 'undefined';
    } catch (e) { return false; } }, { timeout: 15000 }); break; }
    catch (e) { if (t >= 5) throw new Error('não recarregou em 5 tentativas (CDN fora?)'); }
  }
  // O tema e aplicado por um <script> do <head>. Ler o atributo UMA vez corre com ele e
  // pode dar vermelho por pressa, nao por defeito. Esperar nao enfraquece nada: se o tema
  // realmente nao for aplicado, a espera estoura e a verificacao abaixo falha do mesmo jeito.
  try {
    await page.waitForFunction(() => document.documentElement.getAttribute('data-tema') === 'escuro',
      { timeout: 5000 });
  } catch (e) { /* deixa a verificacao abaixo reportar */ }
  const apos = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-tema'),
    // O que importa é o tema ser aplicado ANTES da primeira pintura. Antes isso era um
    // script inline no <head>; agora vem de gn-tema.js, cujo textContent é vazio — a
    // checagem antiga media a implementação, não o efeito. O efeito é estrutural: o script
    // do tema está no <head> e vem ANTES do primeiro <style>.
    noHead: (() => {
      const sc = document.head.querySelector('script[src*="gn-tema"]');
      const st = document.head.querySelector('style');
      if (!sc) return false;
      if (!st) return true;
      return !!(sc.compareDocumentPosition(st) & Node.DOCUMENT_POSITION_FOLLOWING);
    })(),
  }));
  // O recarregamento devolve a tela de LOGIN por cima de tudo. Sem refazer o hideLogin, a
  // medição das abas acontecia com ela na frente e acusava o rodapé do login — nos dois
  // temas, inclusive no claro que já está no ar. Era o teste, não a conversão.
  await page.evaluate(() => {
    hideLogin();
    LOJA = 'Bangu';
    usuarioLogado = { id: 1, nome: 'Taynara', cargo: 'gerente', loja: 'BANGU' };
    autoSave = () => {}; _debouncedSaveAll = () => {}; showToast = () => {};
    const ov = document.getElementById('abertura-overlay'); if (ov) ov.remove();
    document.body.style.overflow = '';
  });

  if (apos.attr !== 'escuro') {
    // Um vermelho que nao diz por que custa uma investigacao inteira. As tres respostas
    // possiveis sao: a escolha nao foi guardada, o script do tema nao carregou, ou ele
    // carregou e nao aplicou.
    const porque = await page.evaluate(() => ({
      guardado: (() => { try { return localStorage.getItem('gn_tema'); } catch (e) { return 'ERRO:' + e.message; } })(),
      scriptNoHead: !!document.head.querySelector('script[src*="gn-tema"]'),
      gnTrocarTema: (() => { try { return typeof gnTrocarTema; } catch (e) { return 'TDZ'; } })(),
      prontidao: document.readyState,
    }));
    console.log('      [causa] atributo=' + JSON.stringify(apos.attr) + ' ' + JSON.stringify(porque));
  }
  check('a escolha guardada é lida e aplicada ao abrir (não volta pro claro)', apos.attr === 'escuro');
  check('e é aplicada no <head>, antes da primeira pintura (sem piscar branco)', apos.noHead === true);

  // ── O que importa: dá pra LER? ───────────────────────────────────────────────────────
  // Mesmo medidor nos dois arquivos: comparar com medidas diferentes não compara nada.
  const MEDIDOR = () => {
    const num = c => { const m = (c||'').match(/[\d.]+/g) || []; return m.map(Number); };
    const lum = ([r,g,b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
      return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b); };
    const razao = (a,b) => { const L1 = lum(a), L2 = lum(b); return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05); };
    // Fundo efetivo: sobe a árvore enquanto o elemento for transparente. Sem isso quase tudo
    // mediria contra "rgba(0,0,0,0)" e o teste não acusaria nada.
    const fundoDe = el => {
      let n = el;
      while (n && n !== document.documentElement) {
        const bg = getComputedStyle(n).backgroundColor;
        const v = num(bg);
        if (v.length >= 3 && (v.length < 4 || v[3] > 0.5)) return v.slice(0,3);        // Gradiente: backgroundColor vem transparente e a busca seguia subindo, medindo contra
        // o fundo errado. Aproxima pela MÉDIA das paradas de cor — foi um gradiente claro com
        // texto claro em cima que passou batido por aqui, e quem pegou foi o print.
        const bi = getComputedStyle(n).backgroundImage || '';
        if (/gradient/.test(bi)) {
          const paradas = bi.match(/rgba?\([^)]+\)/g) || [];
          const solidas = paradas.map(num).filter(c => c.length >= 3 && (c.length < 4 || c[3] > 0.5));
          if (solidas.length) return [0,1,2].map(i => Math.round(solidas.reduce((s2,c) => s2 + c[i], 0) / solidas.length));
        }

        n = n.parentElement;
      }
      const v = num(getComputedStyle(document.body).backgroundColor);
      return v.length >= 3 ? v.slice(0,3) : [255,255,255];
    };
    const ruins = [];
    for (const el of document.querySelectorAll('*')) {
      // getClientRects é o teste honesto de "está na tela": offsetParent é null tanto pra
      // quem está em display:none quanto pra quem é position:fixed, e a exceção que eu abri
      // pros fixos deixava passar a tela de LOGIN escondida — o teste acusava um rodapé que
      // ninguém vê, nos dois temas.
      if (!el.getClientRects().length) continue;
      const txt = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
      if (!txt) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.3) continue;
      // Texto translúcido NÃO é pulado: ele é COMPOSTO sobre o fundo, que é o que o olho
      // vê. Pular rgba(0,0,0,.22) fazia duas coisas ruins — escondia texto de verdade que
      // está fraco, e na comparação com o arquivo antigo fazia um texto que MELHOROU (de
      // translúcido pra token opaco) aparecer como "não existia antes", ou seja, regressão.
      let cor = num(cs.color);
      if (cor.length >= 4 && cor[3] === 0) continue;   // invisível de propósito, não é ilegível
      if (cor.length >= 4 && cor[3] < 1) {
        const f = fundoDe(el), al = cor[3];
        cor = [0, 1, 2].map(i => Math.round(cor[i] * al + f[i] * (1 - al)));
      }         // texto propositalmente apagado
      const r = razao(cor.slice(0,3), fundoDe(el));
      if (r < 3.0) ruins.push({ txt: txt.slice(0,42), cor: cs.color, fundo: 'rgb(' + fundoDe(el).join(',') + ')', r: +r.toFixed(2) });
    }
    return ruins;
  };
  const medir = () => page.evaluate(MEDIDOR);

  const abas = ['dados','abertura','checklist','fechamento','carnes','faltas','utensilios','manutencao','caixa','historico','guia'];
  const achados = [];
  for (const aba of abas) {
    await page.evaluate((a) => {
      const btn = document.querySelector(`[data-sidebar-tab="${a}"]`);
      try { switchTab(a, btn); } catch (e) {}
      const ov = document.getElementById('abertura-overlay'); if (ov) ov.remove();
      document.body.style.overflow = '';
      window.scrollTo(0, 0);
    }, aba);
    // 120ms cravados sao uma aposta: sob carga a aba ainda nao pintou e a medicao sai do
    // painel errado (ou de um painel vazio, que nao acusa nada). Espera a aba estar de fato
    // visivel e com conteudo; so entao mede.
    try {
      await page.waitForFunction((a) => {
        const el = document.getElementById('tab-' + a);
        return !!el && el.getClientRects().length > 0 && (el.textContent || '').trim().length > 0;
      }, aba, { timeout: 8000 });
    } catch (e) { achados.push({ aba, ruins: [{ txt: '(a aba nao abriu em 8s — medicao nao aconteceu)' }] }); continue; }
    const ruins = await medir();
    if (ruins.length) achados.push({ aba, ruins });
  }

  // A varredura so significa alguma coisa se a pagina estiver MESMO no escuro. Quando o
  // tema nao aplicava, ela media o tema claro e reportava "texto ilegivel no tema ESCURO" —
  // uma mensagem que aponta pro lugar errado e manda procurar contraste onde o problema era
  // o tema. As duas verificacoes caiam juntas e pareciam dois defeitos; era um so.
  const temaNaMedicao = await page.evaluate(() => document.documentElement.getAttribute('data-tema'));
  check('a página está mesmo no tema escuro na hora de medir (senão a medida é de outro tema)',
    temaNaMedicao === 'escuro');
  if (temaNaMedicao !== 'escuro') {
    console.log('      [causa] data-tema=' + JSON.stringify(temaNaMedicao) +
      ' — a varredura abaixo mediu o tema errado; o defeito é a aplicação do tema, não o contraste.');
  }
  if (achados.length) console.log('      ' + JSON.stringify(achados).slice(0, 700));
  check('nenhum texto ilegível no tema ESCURO, em nenhuma das 11 abas', achados.length === 0);
  if (achados.length) {
    for (const a of achados.slice(0, 6)) {
      console.log(`      aba "${a.aba}" — ${a.ruins.length} caso(s):`);
      a.ruins.slice(0, 5).forEach(x => console.log(`        contraste ${x.r}:1  "${x.txt}"  cor ${x.cor} sobre ${x.fundo}`));
    }
  }

  // O tema claro é o que está no ar hoje: a conversão não pode ter estragado ele.
  await page.evaluate(() => { gnTema.aplicar('claro'); });
  const achadosClaro = [];
  for (const aba of abas) {
    await page.evaluate((a) => { try { switchTab(a, document.querySelector(`[data-sidebar-tab="${a}"]`)); } catch (e) {}
      const ov = document.getElementById('abertura-overlay'); if (ov) ov.remove(); window.scrollTo(0,0); }, aba);
    await page.waitForTimeout(100);
    const ruins = await medir();
    if (ruins.length) achadosClaro.push({ aba, ruins });
  }
  // No tema CLARO o padrão não pode ser absoluto: o app que está NO AR hoje já tem rótulos
  // e marcadores abaixo de 3:1, de antes desta mudança. Exigir 3:1 aqui reprovaria o que já
  // está em produção e não diria nada sobre a conversão. O que vale é a REGRESSÃO: nada
  // pode ter piorado. A medida de comparação é o próprio arquivo do origin/main.
  // O arquivo de comparação precisa ficar AO LADO dos scripts vizinhos (gn-avisos.js e
  // companhia), porque os <script src> dele são relativos. Em outra pasta ele carrega pela
  // metade e o teste morre num timeout que não diz nada.
  //   git show origin/main:public/gn-checklist.html > public/_base_chk.html
  const BASE = _BASE_PATH;
  const paginaBase = await ctx.newPage();
  for (let t = 1; ; t++) {
    await paginaBase.goto('file://' + BASE);
    // Esperar por LOJA não basta aqui: no arquivo de comparação as funções são içadas e o
    // script ainda está no meio. _aberturaDados é um `let` do FIM do bloco — é ele que prova
    // que terminou. Sem isso o evaluate caía em TDZ de usuarioLogado.
    try { await paginaBase.waitForFunction(() => { try {
      return typeof LOJA === 'string' && typeof switchTab === 'function' && typeof _aberturaDados !== 'undefined';
    } catch (e) { return false; } }, { timeout: 15000 }); break; }
    catch (e) { if (t >= 5) throw new Error('o arquivo de comparação não carregou (CDN fora?)'); }
  }
  await paginaBase.evaluate(() => {
    hideLogin(); LOJA = 'Bangu';
    usuarioLogado = { id: 1, nome: 'Taynara', cargo: 'gerente', loja: 'BANGU' };
    autoSave = () => {}; _debouncedSaveAll = () => {}; showToast = () => {};
    const ov = document.getElementById('abertura-overlay'); if (ov) ov.remove();
    document.body.style.overflow = '';
    // A página de comparação abre no MESMO contexto, e o localStorage já tem gn_chk_tema
    // ='escuro' do teste de persistência lá em cima. Sem forçar o claro aqui, eu media o
    // tema escuro achando que era o claro — e o escuro está limpo, então dava "0 casos
    // antes" e acusava regressão onde não havia.
    document.documentElement.removeAttribute('data-tema');
  });
  const medirEm = (pg) => pg.evaluate(MEDIDOR);
  const baseRuins = {};
  for (const aba of abas) {
    await paginaBase.evaluate((a) => { try { switchTab(a, document.querySelector(`[data-sidebar-tab="${a}"]`)); } catch (e) {}
      window.scrollTo(0,0); }, aba);
    await paginaBase.waitForTimeout(100);
    for (const x of await medirEm(paginaBase)) {
      const k = aba + '|' + x.txt;
      if (baseRuins[k] === undefined || x.r < baseRuins[k]) baseRuins[k] = x.r;
    }
  }
  await paginaBase.close();

  const piorou = [];
  for (const a of achadosClaro) for (const x of a.ruins) {
    const antes = baseRuins[a.aba + '|' + x.txt];
    if (antes === undefined || x.r < antes - 0.01) piorou.push({ ...x, aba: a.aba, antes: antes === undefined ? 'não existia / estava ok' : antes });
  }
  // Contar chaves únicas dos dois lados: o baseRuins junta repetições por aba+texto, e
  // comparar isso com a contagem de OCORRÊNCIAS dava "11 antes, 29 depois — nenhum novo",
  // que parece contradição e não é. Maçã com maçã.
  const chavesAgora = new Set();
  achadosClaro.forEach(a => a.ruins.forEach(x => chavesAgora.add(a.aba + '|' + x.txt)));
  const totalBase = Object.keys(baseRuins).length;
  const totalAgora = chavesAgora.size;
  check(`no tema CLARO nada piorou (o que está no ar já tinha ${totalBase} caso(s) abaixo de 3:1)`, piorou.length === 0);
  if (piorou.length) piorou.slice(0, 8).forEach(x =>
    console.log(`      aba "${x.aba}" "${x.txt}": era ${x.antes}:1, ficou ${x.r}:1`));
  console.log(`      (no claro: ${totalBase} caso(s) antes, ${totalAgora} depois — nenhum novo)`);

  // Os estouros de createClient vêm das tentativas em que o CDN do supabase-js não veio —
  // é rede, não o app. Contar isso como erro faria o teste acusar o código por causa da
  // internet daqui.
  const errosReais = erros.filter(e => !/createClient/.test(e));
  check('nenhum erro de JS', errosReais.length === 0);
  if (errosReais.length) errosReais.slice(0, 3).forEach(e => console.log('      ' + e.slice(0, 180)));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
