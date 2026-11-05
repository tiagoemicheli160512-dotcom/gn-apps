// Teste de tema genérico, para os apps menores. O mesmo verificador de contraste dos
// grandes (medidor_contraste.js), parametrizado pelo arquivo — escrever sete cópias é
// como o medidor já divergiu duas vezes antes de virar arquivo.
//
//   APP=gn-manutencao node e2e_tema_app.js
//
// @modelo — nao e suite solta: sem APP= nao ha o que medir. O corredor pula arquivos com
// esta marca e diz por que, em vez de conta-los como vermelho.
//
// O que ele protege é o que o usuário já me ensinou na prática:
//   - não basta o botão EXISTIR: tem que estar tocável na largura do celular (eu já
//     entreguei um botão que só existia no computador);
//   - o tema é aplicado ANTES do <style>, senão o app abre claro e pisca a cada entrada;
//   - no escuro, nada pode ficar menos legível do que JÁ É em produção.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const { MEDIDOR } = require('' + CAMINHOS.fix('medidor_contraste.js') + '');
const APP = process.env.APP;
if (!APP) { console.error('falta APP='); process.exit(2); }
const ARQ  = CAMINHOS.pub(`${APP}.html`);
const BASE = CAMINHOS.pub(`_base_${APP}.html`);
// ABAS/FN: os apps que tem navegacao interna precisam ser percorridos, senao o medidor
// mede so a primeira tela — e foi medindo tela de menos que dois testes meus passaram em
// verde sem exercitar nada.
//   APP=gn-inventario ABAS=inventario,marketing,relatorio,auditoria,patrimonio node e2e_tema_app.js
const ABAS = (process.env.ABAS || '').split(',').filter(Boolean);
const FN   = process.env.FN || 'setTab';
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  // Semeia a sessão ANTES da página rodar: sem isto o app para na tela de login, o teste
  // mede uma tela vazia e passa em tudo sem provar nada — foi exatamente o que aconteceu
  // na primeira rodada (0 casos medidos, botão 0x0).
  await ctx.addInitScript(() => {
    const u = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL',
                lojaDisplay: 'Bangu', permissoes: { master: true }, ts: Date.now() };
    const g = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
    g('gn_session_v1', u);
    g('gn_manut_v1', u);               // o Manutenção tem chave própria
    g('gn_mestra_usuario', u);
    try {
      localStorage.setItem('gn_last_loja', JSON.stringify({ loja: 'BANGU', ts: Date.now() }));
      localStorage.setItem('gn_inv_loja_ativa', 'Bangu');
      // gn_nav_loja é lido com JSON.parse e tem a forma {loja,ts}. Guardar a string crua
      // 'Bangu' fazia o parse ESTOURAR, e os apps que leem essa chave caíam no catch e
      // voltavam pra tela de login — o teste media 19 elementos e culpava o botão.
      localStorage.setItem('gn_nav_loja', JSON.stringify({ loja: 'BANGU', ts: Date.now() }));
      localStorage.setItem('gn_aviso_guia_v1', '1');
      // O Comandas guarda a sessão inteira numa chave própria, com a loja junto: sem ela
      // o app para na tela de login e o teste mede uma página de um elemento só.
      localStorage.setItem('gn_comandas_session_v1', JSON.stringify({
        user: { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } },
        loja: 'BANGU', ts: Date.now() }));
    } catch (e) {}
  });
  // Responder [] a TUDO parece inofensivo e nao e: varios destes apps revalidam o usuario
  // em gn_usuarios_publico logo na entrada e, com a lista vazia, chamam doLogout() e ficam
  // na tela de login. O teste entao media uma pagina de dez elementos e passava em verde.
  // O gn-rh carrega a biblioteca do Supabase de um CDN e faz
  //     const db = supabase.createClient(...)
  // no topo do script. Sem rede, `supabase` é undefined, essa linha ESTOURA e o bloco
  // inteiro morre — setTab, S, render, nada existe. O teste então media a casca da página
  // e passava em verde. A biblioteca de verdade é servida do disco.
  const fs = require('fs');
  const SUPA = '' + CAMINHOS.fix('supabase.min.js') + '';
  if (fs.existsSync(SUPA)) {
    const corpoSupa = fs.readFileSync(SUPA, 'utf8');
    await ctx.route('**/supabase*.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: corpoSupa }));
  }
  await ctx.route('**/rest/v1/**', r => {
    const u = r.request().url();
    const corpo = /gn_usuarios_publico/.test(u)
      ? JSON.stringify([{ id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', ativo: true,
                          permissoes: { master: true } }])
      : '[]';
    r.fulfill({ status: 200, contentType: 'application/json', body: corpo });
  });
  const erros = [];

  const abrir = async (pg, arquivo) => {
    for (let t = 1; ; t++) {
      await pg.goto('file://' + arquivo);
      try { await pg.waitForFunction(() => document.readyState === 'complete' && document.body.children.length > 2, { timeout: 12000 }); break; }
      catch (e) { if (t >= 5) throw new Error('não carregou: ' + arquivo); }
    }
    await pg.waitForTimeout(700);
    // ESCONDE o que cobre a tela (login), não remove: vários apps agendam um focus() no
    // campo logo depois de montar, e apagar o elemento faz esse timer estourar — o teste
    // acusaria um erro de JS que ele mesmo criou.
    await pg.evaluate(() => {
      // Esconder o login não basta: estes apps mantêm o corpo em <div id="app" class="hidden">
      // até o login dar certo, e o teste acabava medindo uma tela VAZIA — 1 elemento, zero
      // caracteres — e passando em verde sem exercitar nada.
      // Então: revela o app (o caminho de render é o de verdade) e esconde o login.
      // Revelar NÃO é "apagar o display inline": vários destes apps já entraram sozinhos
      // pela sessão guardada e têm display:flex escrito na mão — limpar isso os ESCONDE,
      // porque a regra de CSS por baixo é display:none. Foi assim que o Comandas, que
      // estava certo, apareceu como uma página de um elemento só.
      const revelar = (e) => {
        e.classList.remove('hidden', 'oculto');
        if (getComputedStyle(e).display !== 'none') return;
        e.style.display = '';
        if (getComputedStyle(e).display !== 'none') return;
        e.style.display = 'flex';
      };
      document.querySelectorAll('#app,#main,#app-screen,.app-wrap,[id$="-app"]').forEach(revelar);
      document.querySelectorAll('#login,[id*="verlay"],[id*="ogin"],[class*="login"],#seletor-loja').forEach(e => {
        try { e.style.display = 'none'; } catch (x) {}
      });
      // E dá um empurrão no render do próprio app, quando ele expõe um.
      // Estas funções são async em vários apps: o try/catch pega o que estoura na hora,
      // mas a REJEIÇÃO da promessa vira pageerror e o teste acusava um erro de JS que ele
      // mesmo tinha criado (o gn-usuarios lê usuarioLogado.nome, que o teste não tem como
      // preencher — é um empurrão pra tela aparecer, não o caminho de login de verdade).
      ['iniciarApp', 'render', 'renderAll', 'init', 'boot'].forEach(f => {
        try { if (typeof window[f] === 'function') { const r = window[f](); if (r && r.catch) r.catch(() => {}); } } catch (e) {}
      });
      document.body.style.overflow = '';
    });
    await pg.waitForTimeout(500);
  };

  const page = await ctx.newPage();
  page.on('pageerror', e => erros.push(String(e)));
  await abrir(page, ARQ);

  // Prova que o app entrou de verdade. Sem isto, tudo abaixo mediria a tela de login
  // escondida e passaria em verde sem exercitar nada.
  // O que prova que o app entrou NÃO é volume de conteúdo: sem rede estes apps abrem com
  // as listas vazias, e exigir "150 caracteres" reprovava um app que estava certo. O que
  // prova é o CROMO estar na tela — cabeçalho visível, com o botão do tema dentro dele.
  const entrou = await page.evaluate(() => {
    // Seletor largo de propósito: cada app nomeia o cabeçalho do seu jeito (.hdr, .header,
    // .app-header, .hdr-title, .hdr-right...). A lista fechada reprovava um botão que
    // estava no lugar certo, só dentro de uma div com outro nome.
    const cab = [...document.querySelectorAll('[class*="hdr"],[class*="header"],#header,header')]
      .filter(e => e.getClientRects().length)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
    const b = document.querySelector('[data-botao-tema]');
    return { temCab: !!(cab && cab.getClientRects().length),
             botaoNoCab: !!(cab && b && cab.contains(b)),
             visiveis: [...document.querySelectorAll('body *')].filter(e => e.getClientRects().length).length };
  });
  check(`o app entrou de verdade: cabeçalho na tela (${entrou.visiveis} elementos visíveis)`, entrou.temCab);
  check('e o botão do tema está dentro dele', entrou.botaoNoCab);

  check('abre no claro por padrão',
    (await page.evaluate(() => document.documentElement.getAttribute('data-tema'))) === null);

  const vis = await page.evaluate(() => {
    const b = document.querySelector('[data-botao-tema]');
    if (!b) return { existe: false };
    const r = b.getBoundingClientRect();
    return { existe: true, naTela: r.width > 14 && r.height > 14 && r.top >= 0 && r.left >= 0 && r.right <= innerWidth,
             w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
  });
  check('o botão do tema existe', vis.existe === true);
  check('e está visível e tocável a 390px', vis.naTela === true);
  if (vis.existe && !vis.naTela) console.log(`      medido: ${vis.w}x${vis.h} no topo ${vis.top}`);

  const t1 = await page.evaluate(() => { gnTrocarTema();
    return { attr: document.documentElement.getAttribute('data-tema'),
             chave: localStorage.getItem('gn_tema'),
             icone: document.querySelector('[data-botao-tema]').textContent.trim() }; });
  check('o botão liga o escuro', t1.attr === 'escuro');
  check('guardando na chave compartilhada entre os apps', t1.chave === 'escuro');
  check('e o ícone vira o de voltar pro claro', t1.icone === '☀️');

  check('o tema é aplicado antes do <style> (sem piscar branco)', await page.evaluate(() => {
    const sc = document.querySelector('script[src*="gn-tema"]'), st = document.querySelector('style');
    if (!sc || !st) return false;
    return !!(sc.compareDocumentPosition(st) & Node.DOCUMENT_POSITION_FOLLOWING);
  }));

  // E o corpo tem que ESCURECER de verdade: sem isto, um app em que o token do fundo não
  // foi traduzido passaria em tudo acima e continuaria branco na mão da pessoa.
  const fundo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const lum = (c) => { const n = (c.match(/[\d.]+/g) || []).map(Number);
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return n.length >= 3 ? 0.2126 * f(n[0]) + 0.7152 * f(n[1]) + 0.0722 * f(n[2]) : 1; };
  check('o fundo da página escurece de verdade', lum(fundo) < 0.2);
  if (lum(fundo) >= 0.2) console.log('      fundo medido: ' + fundo);

  const varrer = async (pg) => {
    // Esperar a TRANSIÇÃO acabar antes de medir. Vários apps têm
    // `transition:all .15s` nos chips e botões: medir no mesmo instante em que o tema
    // troca pega a cor NO MEIO do caminho, e o teste acusa (ou esconde) um contraste
    // que não existe em tela parada. Duas rodadas seguidas davam números diferentes.
    await pg.waitForTimeout(400);
    if (!ABAS.length) return pg.evaluate(MEDIDOR);
    const achados = [];
    for (const aba of ABAS) {
      await pg.evaluate(([f, a]) => { try { window[f] ? window[f](a) : Function('return ' + f)()(a); } catch (e) {}
        window.scrollTo(0, 0); }, [FN, aba]);
      await pg.waitForTimeout(160);
      for (const x of await pg.evaluate(MEDIDOR)) achados.push({ ...x, txt: aba + '|' + x.txt });
    }
    return achados;
  };

  const escuro = await varrer(page);
  await page.evaluate(() => gnTema.aplicar('claro'));
  const claro = await varrer(page);

  const pb = await ctx.newPage();
  await abrir(pb, BASE);
  // A base é medida nos DOIS temas quando ela já tinha um. O gn-rh, por exemplo, já vinha
  // com paleta escura (pelo ajuste do celular) antes desta mudança: comparar o escuro novo
  // contra o claro antigo acusava como "novo" um contraste que já existia em produção.
  const baseR = {};
  const somar = (lista) => { for (const x of lista) if (baseR[x.txt] === undefined || x.r < baseR[x.txt]) baseR[x.txt] = x.r; };
  await pb.evaluate(() => document.documentElement.removeAttribute('data-tema'));
  somar(await varrer(pb));
  const baseTemEscuro = await pb.evaluate(() => /data-theme="dark"|prefers-color-scheme:\s*dark/.test(document.documentElement.innerHTML));
  if (baseTemEscuro) {
    await pb.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    somar(await varrer(pb));
    console.log('      (a base deste app JÁ tinha tema escuro — comparado contra os dois)');
  }
  await pb.close();

  const pior = (lista) => lista.filter(x => baseR[x.txt] === undefined || x.r < baseR[x.txt] - 0.01);
  const pe = pior(escuro), pc = pior(claro);
  check(`no ESCURO nada ficou pior do que já é em produção (${Object.keys(baseR).length} caso(s) lá)`, pe.length === 0);
  pe.slice(0, 6).forEach(x => console.log(`      "${x.txt}": ${baseR[x.txt] === undefined ? 'não existia' : baseR[x.txt]} → ${x.r}:1  (${x.cor} sobre ${x.fundo})`));
  check('no CLARO nada piorou', pc.length === 0);
  pc.slice(0, 6).forEach(x => console.log(`      "${x.txt}": ${baseR[x.txt] === undefined ? 'não existia' : baseR[x.txt]} → ${x.r}:1`));
  console.log(`      (abaixo de 3:1 — produção: ${Object.keys(baseR).length} · escuro: ${escuro.length} · claro: ${claro.length})`);
  // DETALHE=1 lista TODOS os casos fracos do escuro, não só os que pioraram: serve pra
  // olhar o que já era fraco e decidir se vale corrigir junto.
  if (process.env.DETALHE) escuro.forEach(x => console.log(`      · ${x.r}:1  "${x.txt}"  ${x.cor} sobre ${x.fundo}`));

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase/i.test(e));
  check('nenhum erro de JS', reais.length === 0);
  reais.slice(0, 3).forEach(e => console.log('      ' + e.slice(0, 160)));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
