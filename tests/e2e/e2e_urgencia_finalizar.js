// "Nos botões de urgência e finalizar: quando tiver na parte da urgência, só aparecer o
//  botão urgência, e só depois aparecer o finalizar — ou colocar o finalizar lá no final,
//  com um aviso em cima. E se alguém ainda finalizar enganado, um botão que só a senha
//  mestra possa enviar novamente, pra que a loja não fique sem o pedido."
//
// MEDIDO na semana de 02/11: Boulevard, Itaquera e Campo Grande finalizaram 53, 24 e 41
// SEGUNDOS depois de mandar a urgência, fechando a semana com 63, 62 e 79 itens contra os
// 190 a 251 das outras oito lojas. Três lojas no mesmo dia não é distração: era o desenho.
// Os dois botões dividiam a mesma faixa fixa no topo e, no instante em que a urgência saía,
// o ⚡ sumia e o Finalizar ESCORREGAVA pro lugar dele — o toque seguinte, no mesmo ponto da
// tela, finalizava. O botão trocava de significado embaixo do dedo.
//
// A suíte cobra as duas pontas: um botão nunca ocupa o lugar do outro, e a finalização
// errada tem volta.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (!c && extra !== undefined ? ' >> ' + String(extra).slice(0, 220) : '')); c ? ok++ : falhou++; };

// Posição vertical do centro de um elemento, pra provar que um botão não nasce onde o
// outro estava. Comparar só "existe/não existe" deixaria passar a troca de lugar, que é
// exatamente o defeito.
const centroY = async (page, sel) => page.evaluate(s => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.height ? Math.round(r.top + r.height / 2 + window.scrollY) : null;
}, sel);

const SEL_URG = '[onclick*="_abrirPreviaConfirmar(\'urgencia\')"]';
const SEL_FIN = '[onclick*="_abrirPreviaConfirmar(\'final\')"]';
const SEL_REABRIR = '[onclick*="_pedirReabrirFinalizacao"]';

async function abrir(browser, estadoEnvio, opts) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const escritas = [];
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request(), url = req.url(), m = req.method();
    const json = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    // O verificar_login é POST: tratar antes do corte de método, senão a senha mestre
    // sempre cai em "erro de conexão" e o teste mede o dublê, não o app.
    if (url.indexOf('rpc/verificar_login') > -1) {
      const b = (() => { try { return JSON.parse(req.postData() || '{}'); } catch (e) { return {}; } })();
      return json(b.p_senha === 'certa' ? [{ nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } }] : []);
    }
    if (m !== 'GET') {
      let corpo = null; try { corpo = JSON.parse(req.postData() || 'null'); } catch (e) {}
      escritas.push({ tabela: url.split('/rest/v1/')[1].split('?')[0], corpo });
      return r.fulfill({ status: 204, body: '' });
    }
    if (url.indexOf('gn_pedido_envio_semana') > -1) return json(estadoEnvio ? [estadoEnvio] : []);
    return json([]);
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('gn_session_v1', JSON.stringify({ ts: Date.now(), id: 1, nome: 'João', cargo: 'gerente', loja: 'BOULEVARD', permissoes: {} }));
  });
  await page.goto('file://' + ARQ);
  await page.waitForFunction(() => { try { return typeof render === 'function' && typeof _faixaEnvioSemanaHtml === 'function'; } catch (e) { return false; } }, { timeout: 40000 });
  await page.evaluate((o) => {
    loja = 'BOULEVARD';
    usuarioAtual = { nome: 'João', cargo: 'gerente', loja: 'BOULEVARD' };
    semana = getMonday(new Date());
    _urgSemanaIni = wkKey(getMonday(new Date()));
    _envioSemana = o.envio || {};
    // A urgência da semana existe de verdade: sem itens marcados, _urgAplicavel() é falso e
    // o fluxo inteiro que esta suíte mede nem liga — ela passaria sem medir nada.
    urgenciaGlobal = getProdutosPedidoOrdenados().slice(0, 12).map(x => String(x.item));
    _urgPendente = !!o.urgPendente;
    tab = 'pedido';
    render();
  }, { envio: estadoEnvio || {}, urgPendente: !!(opts && opts.urgPendente) });
  return { ctx, page, escritas };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  // ── 1. Urgência pendente: só o ⚡ na tela ──────────────────────────────────────────────
  {
    const a = await abrir(browser, {}, { urgPendente: true });
    const temUrg = await a.page.locator(SEL_URG).count();
    const temFin = await a.page.locator(SEL_FIN).count();
    const travado = await a.page.evaluate(() => !!(_urgPendente && _urgAplicavel()));
    check('com a urgência pendente o botão ⚡ está na tela', temUrg > 0);
    if (travado) {
      // Não basta o botão de FINALIZAR DE VERDADE sumir: na versão antiga ele continuava na
      // tela, cinza e com cadeado, só trocando o onclick por um toast. Um botão escrito
      // "Finalizar" ao lado do ⚡ é o que convida o toque — então o que se cobra aqui é que
      // não exista nenhum, travado ou não.
      const finPorTexto = await a.page.evaluate(() =>
        [...document.querySelectorAll('button')].filter(b => /finalizar/i.test(b.textContent)).length);
      check('e o Finalizar não existe — nem o de verdade, nem um travado só pra olhar',
        temFin === 0 && finPorTexto === 0, 'onclick: ' + temFin + ' · por texto: ' + finPorTexto);
      const txt = await a.page.evaluate(() => document.body.innerText);
      check('o ⚡ diz que é ele que fecha a urgência', /Enviar a urgência/.test(txt));
      check('e a tela avisa onde o Finalizar vai aparecer', /só aparece depois, no fim da lista/i.test(txt));
      check('o aviso do fim da lista explica o que Finalizar agora fecharia', /A urgência ainda não saiu/.test(txt));
    } else {
      // A urgência não se aplica hoje (fora da janela): a trava não liga, e aí o teste
      // acima não teria o que medir. Dito em voz alta pra não passar por verde mudo.
      console.log('· urgência não aplicável hoje — as checagens da trava não rodam');
    }
    await a.ctx.close();
  }

  // ── 2. Urgência já enviada: o Finalizar não nasce no lugar do ⚡ ──────────────────────
  // É o coração do defeito. Não basta o Finalizar existir: ele não pode estar onde o dedo
  // acabou de tocar.
  {
    const semUrg = await abrir(browser, {});
    const yUrg = await centroY(semUrg.page, SEL_URG);
    await semUrg.ctx.close();

    const comUrg = await abrir(browser, { urgencia_em: new Date().toISOString(), urgencia_por: 'João', urgencia_itens: 63 });
    const yFin = await centroY(comUrg.page, SEL_FIN);
    const temUrgDepois = await comUrg.page.locator(SEL_URG).count();
    check('depois da urgência enviada o ⚡ sai da tela', temUrgDepois === 0);
    check('o Finalizar existe', yFin !== null, 'y=' + yFin);
    check('e ele NÃO nasce onde o ⚡ estava — é o toque que fechava a semana sem querer',
      yUrg !== null && yFin !== null && Math.abs(yFin - yUrg) > 300, 'y do ⚡ ' + yUrg + ' · y do Finalizar ' + yFin);
    const txt = await comUrg.page.evaluate(() => document.body.innerText);
    check('e tem aviso ANTES dele, dizendo o que vai ser fechado', /Terminou de contar tudo\?/.test(txt));
    await comUrg.ctx.close();
  }

  // ── 3. Finalizado por engano: a volta existe, e pede senha mestre ─────────────────────
  {
    const a = await abrir(browser, {
      urgencia_em: '2026-11-03T13:53:05Z', urgencia_por: 'João', urgencia_itens: 63,
      final_em: '2026-11-03T13:53:58Z', final_por: 'João', final_itens: 63,
    });
    const txt = await a.page.evaluate(() => document.body.innerText);
    check('a faixa diz que a semana está finalizada', /FINALIZADO/.test(txt));
    check('e oferece a reabertura, dizendo que a contagem não se perde',
      (await a.page.locator(SEL_REABRIR).count()) > 0 && /contagem já lançada não se perde/.test(txt));
    check('com o Finalizar fora da tela: já está finalizado, não há o que fechar de novo',
      (await a.page.locator(SEL_FIN).count()) === 0);

    // O clique: pede a senha mestre ANTES de mexer em qualquer coisa.
    await a.page.evaluate(() => { window.confirm = () => true; _pedirReabrirFinalizacao(); });
    await a.page.waitForTimeout(150);
    const modalAberto = await a.page.evaluate(() => {
      const m = document.getElementById('masterLockModal');
      return !!m && m.style.display === 'flex';
    });
    check('o botão abre o pedido de senha mestre', modalAberto);
    // Só a linha do envio importa: o app salva gn_lojas sozinho a cada render, e isso não
    // tem nada a ver com reabrir.
    check('e nada do envio foi gravado antes dela',
      a.escritas.filter(x => x.tabela === 'gn_pedido_envio_semana').length === 0,
      JSON.stringify(a.escritas.map(x => x.tabela)));

    // Senha certa: a finalização é limpa e quem reabriu fica registrado.
    await a.page.evaluate(() => {
      document.getElementById('masterLockNome').value = 'Tiago';
      document.getElementById('masterLockSenha').value = 'certa';
      return confirmarSenhaMestre();
    });
    await a.page.waitForTimeout(400);
    const grav = a.escritas.filter(x => x.tabela === 'gn_pedido_envio_semana').map(x => x.corpo);
    const linha = grav[0] || {};
    check('a finalização é apagada', grav.length === 1 && linha.final_em === null && linha.final_itens === null, JSON.stringify(linha));
    check('a urgência NÃO é apagada junto', !('urgencia_em' in linha), JSON.stringify(Object.keys(linha)));
    check('e fica registrado quem reabriu', !!linha.reaberto_por && !!linha.reaberto_em, JSON.stringify(linha.reaberto_por));

    const txt2 = await a.page.evaluate(() => document.body.innerText);
    check('depois de reabrir, o Finalizar volta pro fim da lista',
      (await a.page.locator(SEL_FIN).count()) > 0 && /Terminou de contar tudo\?/.test(txt2));
    await a.ctx.close();
  }

  // ── 4. Senha errada não reabre ────────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const escritas = [];
    await ctx.route('**/rest/v1/**', r => {
      const req = r.request(), url = req.url();
      // Senha errada: o RPC responde lista vazia (é assim que o app sabe que não bateu).
      if (url.indexOf('rpc/verificar_login') > -1) return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      if (req.method() !== 'GET') { escritas.push(url.split('/rest/v1/')[1].split('?')[0]); return r.fulfill({ status: 204, body: '' }); }
      // A linha finalizada tem que voltar nas leituras: o app recarrega _envioSemana sozinho
      // e, com [] pra tudo, o teste veria a finalização "sumir" sem ninguém ter reaberto.
      if (url.indexOf('gn_pedido_envio_semana') > -1) return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([{ loja_slug: 'boulevard', final_em: '2026-11-03T13:53:58Z', final_por: 'João', final_itens: 63 }]) });
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => { localStorage.clear(); localStorage.setItem('gn_session_v1', JSON.stringify({ ts: Date.now(), id: 1, nome: 'João', cargo: 'gerente', loja: 'BOULEVARD', permissoes: {} })); });
    await page.goto('file://' + ARQ);
    await page.waitForFunction(() => { try { return typeof confirmarSenhaMestre === 'function'; } catch (e) { return false; } }, { timeout: 40000 });
    const r = await page.evaluate(async () => {
      loja = 'BOULEVARD'; usuarioAtual = { nome: 'João', cargo: 'gerente' };
      _urgSemanaIni = wkKey(getMonday(new Date()));
      _envioSemana = { final_em: '2026-11-03T13:53:58Z', final_por: 'João', final_itens: 63 };
      window.confirm = () => true;
      _pedirReabrirFinalizacao();
      document.getElementById('masterLockNome').value = 'Fulano';
      document.getElementById('masterLockSenha').value = 'errada';
      await confirmarSenhaMestre();
      return { erro: document.getElementById('masterLockErro').textContent, aindaFinal: !!_envioSemana.final_em };
    });
    check('senha errada não reabre nada',
      r.aindaFinal === true && escritas.filter(x => x === 'gn_pedido_envio_semana').length === 0,
      JSON.stringify({ r, escritas }));
    check('e a tela diz o porquê', /incorret/i.test(r.erro), r.erro);
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou  [${ARQ}]`);
  process.exit(falhou ? 1 : 0);
})();
