// "Nas abas Barris e Provisões, ao clicar em confirmar a tela volta lá pra cima, tendo que
//  voltar lá onde estava. Tem como ao clicar manter a tela onde está?"
//
// A causa: os dois renders começam escrevendo um spinner em $('content'). Isso encolhe a
// página inteira, o navegador limita a rolagem a ~0, e quando a lista volta a pessoa está
// no topo. Não adianta procurar no HTML — o estrago é de layout, então o teste MEDE
// window.scrollY antes e depois, como o olho da pessoa veria.
//
// O fixture monta listas longas de verdade (barris de 12 lojas, provisões de 10), senão a
// página não rola e o teste passaria sem testar nada.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const fakeSupabase = require('' + CAMINHOS.fix('fake_supabase.js') + '');
const PED = process.env.ARQ_PED || CAMINHOS.pub('gn-pedidos.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

async function abrir(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  // Sem o supabase falso, `const db = supabase.createClient(...)` lança e o script inteiro
  // não roda — e as declarações de função, por serem içadas, mentiriam que carregou.
  await ctx.addInitScript(fakeSupabase());
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + PED);
    try {
      await page.waitForFunction(() => { try { return typeof renderBarris === 'function' && typeof renderProvisoes === 'function' && S; } catch (e) { return false; } }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('o app Pedidos não carregou'); }
  }
  return { ctx, page };
}

// Planta listas longas e neutraliza só as buscas de rede — o render e o layout são reais.
const preparar = (page) => page.evaluate(() => {
  // Sem sair do login, #app fica sem a classe .ativo, #content tem altura 0 e a página
  // nunca rola — o teste passaria medindo nada. É o mesmo par de linhas que o login faz.
  $('login').classList.remove('ativo');
  $('app').classList.add('ativo');
  const lojas = ['bangu','caxias','sao_goncalo','norte','boulevard','nova_iguacu','pedreira',
                 'nova_america','campo_grande','itaquera','guarulhos','rancho'];
  S.lojas = lojas.map((s, i) => ({ slug_pedido: s, nome_display: 'Loja ' + (i+1) }));
  S.barris = [];
  lojas.forEach((slug, i) => {
    for (let k = 0; k < 4; k++) {
      S.barris.push({ id: slug + '-' + k, loja_slug: slug, tipo: k % 2 ? 'CLARO' : 'VINHO',
        status: 'ATIVO', validade: '2026-11-0' + ((k % 8) + 1),
        validade_nova_solicitada: k === 0 ? '2026-12-01' : null,
        validade_solicitada_por: k === 0 ? 'Gerente' : null });
    }
  });
  S.provisoes = [];
  lojas.forEach((slug, i) => {
    for (let k = 0; k < 3; k++) {
      S.provisoes.push({ id: slug + '-p' + k, loja_slug: slug, fornecedor: 'FORN ' + k,
        produto: 'Produto ' + k, quantidade: 10 + k, valor: 100 + k, status: 'PENDENTE',
        data_entrega: '2026-10-1' + k, catalogo_id: k });
    }
  });
  // Os grupos de Barris vêm FECHADOS (S.barrisGruposAbertos). Quem vai confirmar um barril
  // abre a loja dele — e é aí que a lista fica longa e o pulo pro topo incomoda. O fixture
  // abre todas, que é o estado em que a pessoa está quando clica em Confirmar.
  S.barrisGruposAbertos = new Set(lojas.map(s => 'barris_loja_' + s.replace(/[^a-z0-9]/gi, '_')));
  S.provisoesPendentes = []; S.provisoesExclusao = []; S.devolucoesLojas = [];
  // As buscas não vão ao banco, mas PRECISAM custar um tique real. Com `async () => {}`
  // elas resolvem num microtask, o navegador nunca recalcula o layout com a página
  // encolhida pelo spinner, e o corte da rolagem — que é o defeito — não acontece. Em
  // produção há uma ida à rede aqui. Foi assim que a primeira versão deste teste passou
  // também na versão ANTIGA do arquivo, medindo nada.
  const comoRede = () => new Promise(r => setTimeout(r, 60));
  carregarBarris = comoRede;
  carregarProvisoes = comoRede;
  carregarProvisoesPendentes = comoRede;
  carregarProvisoesExclusaoPendente = comoRede;
  carregarDevolucoesLojas = comoRede;
  return true;
});

const medir = (page, aba, render) => page.evaluate(async ([aba, render]) => {
  S.tab = aba;
  S._renderAoTopo = true;            // como se tivesse acabado de entrar na aba
  await window[render]();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const altura = document.documentElement.scrollHeight;
  const rolavel = altura - window.innerHeight;
  if (rolavel < 300) return { rolavel, erro: 'a lista não ficou longa o bastante pra rolar' };

  // A pessoa rola até o meio da lista e age numa linha de lá.
  const alvo = Math.round(rolavel * 0.6);
  window.scrollTo(0, alvo);
  await new Promise(r => requestAnimationFrame(r));
  const antes = Math.round(window.scrollY);

  // Exatamente o que um "Confirmar" faz no fim: re-renderiza a aba.
  await window[render]();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const depois = Math.round(window.scrollY);
  return { rolavel, antes, depois, voltouAoTopo: depois < 50, manteve: Math.abs(depois - antes) <= 4 };
}, [aba, render]);

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const a = await abrir(browser);
  await preparar(a.page);

  // ── Barris ────────────────────────────────────────────────────────────────────
  const b = await medir(a.page, 'barris', 'renderBarris');
  check('a lista de barris é longa o bastante pra o teste valer', !b.erro && b.rolavel >= 300);
  if (b.erro) console.log('      ' + b.erro);
  check('Barris: a tela fica onde estava depois de re-renderizar',
    b.manteve === true && b.voltouAoTopo === false);
  if (!b.manteve) console.log(`      estava em ${b.antes}px, foi parar em ${b.depois}px`);

  // ── Provisões ────────────────────────────────────────────────────────────────
  const p = await medir(a.page, 'provisoes', 'renderProvisoes');
  check('a lista de provisões é longa o bastante', !p.erro && p.rolavel >= 300);
  if (p.erro) console.log('      ' + p.erro);
  check('Provisões: a tela fica onde estava depois de re-renderizar',
    p.manteve === true && p.voltouAoTopo === false);
  if (!p.manteve) console.log(`      estava em ${p.antes}px, foi parar em ${p.depois}px`);

  // ── Trocar de aba CONTINUA indo pro topo ─────────────────────────────────────
  // É a exceção de propósito: a lista é outra, restaurar a posição da aba anterior
  // deixaria a pessoa no meio de uma lista que ela não estava lendo.
  const troca = await a.page.evaluate(async () => {
    S.tab = 'barris'; S._renderAoTopo = true; await renderBarris();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.scrollTo(0, Math.round((document.documentElement.scrollHeight - window.innerHeight) * 0.6));
    await new Promise(r => requestAnimationFrame(r));
    const antes = Math.round(window.scrollY);
    // Entrar em Provisões como setTab faz
    S._renderAoTopo = true; S.tab = 'provisoes'; await renderProvisoes();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { antes, depois: Math.round(window.scrollY) };
  });
  check('trocar de aba continua começando do topo', troca.antes > 100 && troca.depois < 50);

  // ── A flag não pode ficar grudada ────────────────────────────────────────────
  const flag = await a.page.evaluate(async () => {
    S._renderAoTopo = true;
    await renderBarris();
    const depoisDeUsar = S._renderAoTopo;
    await renderBarris();
    return { depoisDeUsar, aindaFalsa: S._renderAoTopo };
  });
  check('a flag de "ir pro topo" vale só pro render seguinte',
    flag.depoisDeUsar === false && flag.aindaFalsa === false);

  // ── Lista vazia não quebra (early return do renderBarris) ────────────────────
  const vazio = await a.page.evaluate(async () => {
    S.barris = [];
    let erro = null;
    try { S._renderAoTopo = true; await renderBarris(); } catch (e) { erro = String(e); }
    return { erro, temVazio: /Nenhum barril em acompanhamento/.test($('content').innerHTML) };
  });
  check('aba sem nenhum barril não quebra e mostra o estado vazio',
    vazio.erro === null && vazio.temVazio === true);

  await a.ctx.close();
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
