// "No app lojas, na aba pedido tem a opção de liberar o finalizar o pedido com a senha, agora
//  tive um problema na loja de Nova Iguaçu que apertaram a urgência indevidamente e precisam
//  enviar novamente pois só contaram parcialmente, podemos colocar um botão pra reabrir a
//  urgência também, no mesmo padrão do finalizar." (16/11/2026)
//
// Real: Nova Iguaçu mandou a urgência às 10h24 (61 itens, Juan) e o app barrava a 2ª urgência
// da semana com "fale com o Compras". Agora a faixa "FALTA FINALIZAR" tem a volta, com senha
// mestre, igual à da finalização.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ_LOJAS || CAMINHOS.pub('gn-lojas.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (!c && extra !== undefined ? ' >> ' + String(extra).slice(0, 300) : '')); c ? ok++ : falhou++; };

const SEL_URG = '[onclick*="_abrirPreviaConfirmar(\'urgencia\')"]';
const SEL_REABRIR_URG = '[onclick*="_pedirReabrirUrgencia"]';
const URG = { loja_slug: 'nova_iguacu', urgencia_em: '2026-11-16T13:24:00Z', urgencia_por: 'Juan', urgencia_itens: 61 };

async function abrir(browser, envio, senhaCerta) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const escritas = [];
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request(), url = req.url(), m = req.method();
    const json = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (url.indexOf('rpc/verificar_login') > -1) {
      const b = (() => { try { return JSON.parse(req.postData() || '{}'); } catch (e) { return {}; } })();
      return json(senhaCerta && b.p_senha === 'certa' ? [{ nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } }] : []);
    }
    if (m !== 'GET') {
      let corpo = null; try { corpo = JSON.parse(req.postData() || 'null'); } catch (e) {}
      escritas.push({ tabela: url.split('/rest/v1/')[1].split('?')[0], corpo });
      return r.fulfill({ status: 204, body: '' });
    }
    // A linha volta nas leituras: o app recarrega _envioSemana sozinho.
    if (url.indexOf('gn_pedido_envio_semana') > -1) return json(envio ? [envio] : []);
    return json([]);
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('gn_session_v1', JSON.stringify({ ts: Date.now(), id: 1, nome: 'Juan', cargo: 'gerente', loja: 'RANCHO', permissoes: {} }));
  });
  await page.goto('file://' + ARQ);
  await page.waitForFunction(() => { try { return typeof render === 'function' && typeof _faixaEnvioSemanaHtml === 'function'; } catch (e) { return false; } }, { timeout: 40000 });
  await page.evaluate((e) => {
    loja = 'RANCHO';
    usuarioAtual = { nome: 'Juan', cargo: 'gerente', loja: 'RANCHO' };
    semana = getMonday(new Date());
    _urgSemanaIni = wkKey(getMonday(new Date()));
    _envioSemana = Object.assign({}, e || {});
    urgenciaGlobal = getProdutosPedidoOrdenados().slice(0, 12).map(x => String(x.item));
    _urgPendente = false;
    tab = 'pedido';
    render();
  }, envio);
  return { ctx, page, escritas, erros };
}
const envioGravado = (a) => a.escritas.filter(x => x.tabela === 'gn_pedido_envio_semana').map(x => x.corpo);

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const erros = [];

  // ── 1. Urgência enviada, falta finalizar: a volta existe ──
  {
    const a = await abrir(browser, URG, true);
    const txt = await a.page.evaluate(() => document.body.innerText);
    check('a faixa mostra a urgência enviada (Juan, 61 itens)', /FALTA FINALIZAR/.test(txt) && /Juan/.test(txt) && /61 itens/.test(txt), txt.slice(0, 400));
    check('e oferece 🔓 Reabrir a urgência, dizendo que a contagem não se perde',
      (await a.page.locator(SEL_REABRIR_URG).count()) === 1 && /Reabrir a urgência pra enviar de novo/.test(txt) && /contagem já lançada não se perde/.test(txt));
    check('o ⚡ não está na tela antes de reabrir', (await a.page.locator(SEL_URG).count()) === 0);

    // Toque direto no ⚡ (por código) ainda é barrado, e o aviso aponta o botão novo.
    const aviso = await a.page.evaluate(async () => {
      let msg = ''; const orig = showToast; showToast = (m) => { msg = m; }; await confirmarPedido('urgencia'); showToast = orig; return msg;
    });
    check('mandar a urgência de novo sem reabrir continua barrado, e o aviso diz onde reabrir', /Reabrir a urgência/.test(aviso) && !/Fale com o Compras/.test(aviso), aviso);

    await a.page.evaluate(() => { window.confirm = () => true; _pedirReabrirUrgencia(); });
    await a.page.waitForTimeout(150);
    const modal = await a.page.evaluate(() => { const m = document.getElementById('masterLockModal'); return !!m && m.style.display === 'flex'; });
    check('o botão pede a senha mestre', modal);
    check('…e nada foi gravado antes dela', envioGravado(a).length === 0, JSON.stringify(a.escritas.map(x => x.tabela)));

    await a.page.evaluate(() => {
      document.getElementById('masterLockNome').value = 'Tiago';
      document.getElementById('masterLockSenha').value = 'certa';
      return confirmarSenhaMestre();
    });
    await a.page.waitForTimeout(400);
    const grav = envioGravado(a); const linha = grav[0] || {};
    check('senha certa: a urgência é apagada da semana', grav.length === 1 && linha.urgencia_em === null && linha.urgencia_itens === null && linha.urgencia_por === null, JSON.stringify(linha));
    check('…sem tocar na finalização nem no reabrir da finalização', !('final_em' in linha) && !('reaberto_em' in linha), JSON.stringify(Object.keys(linha)));
    check('…e fica registrado quem AUTORIZOU com a senha (Tiago, não o Juan logado) e quando', linha.urgencia_reaberta_por === 'Tiago' && !!linha.urgencia_reaberta_em, JSON.stringify(linha));
    const depois = await a.page.evaluate(() => ({ pend: _urgPendente, aplic: _urgAplicavel() }));
    check('a trava da urgência volta (a loja recompleta a contagem dos itens de urgência)', depois.pend === depois.aplic, JSON.stringify(depois));
    check('o ⚡ Enviar a urgência volta pra tela', (await a.page.locator(SEL_URG).count()) > 0);
    const aviso2 = await a.page.evaluate(async () => {
      let msg = ''; const orig = showToast; showToast = (m) => { msg = m; };
      const ini = confirmarPedido('urgencia'); _confirmandoPedido = false; showToast = orig; return msg;
    });
    check('…e o envio não é mais barrado', !/já foi enviada/.test(aviso2), aviso2);
    erros.push(...a.erros); await a.ctx.close();
  }

  // ── 2. Senha errada não reabre ──
  {
    const a = await abrir(browser, URG, false);
    const r = await a.page.evaluate(async () => {
      window.confirm = () => true;
      _pedirReabrirUrgencia();
      document.getElementById('masterLockNome').value = 'Fulano';
      document.getElementById('masterLockSenha').value = 'errada';
      await confirmarSenhaMestre();
      return { erro: document.getElementById('masterLockErro').textContent, ainda: !!_envioSemana.urgencia_em };
    });
    check('senha errada não reabre nada', r.ainda && envioGravado(a).length === 0, JSON.stringify(r));
    erros.push(...a.erros); await a.ctx.close();
  }

  // ── 3. Já finalizado: a urgência não reabre direto (primeiro reabre a finalização) ──
  {
    const a = await abrir(browser, Object.assign({}, URG, { final_em: '2026-11-16T15:00:00Z', final_por: 'Juan', final_itens: 200 }), true);
    check('semana finalizada: o botão de reabrir urgência não aparece (só o da finalização)',
      (await a.page.locator(SEL_REABRIR_URG).count()) === 0 && (await a.page.locator('[onclick*="_pedirReabrirFinalizacao"]').count()) === 1);
    const msg = await a.page.evaluate(async () => { let m = ''; const o = showToast; showToast = (x) => { m = x; }; await _reabrirUrgenciaSemana(); showToast = o; return m; });
    check('…e pelo código também não: pede pra reabrir a finalização primeiro', /reabra a finalização primeiro/.test(msg) && envioGravado(a).length === 0, msg);
    erros.push(...a.erros); await a.ctx.close();
  }

  // ── 4. Reaberta uma vez: a faixa mostra o histórico ──
  {
    const a = await abrir(browser, Object.assign({}, URG, { urgencia_reaberta_em: '2026-11-16T14:00:00Z', urgencia_reaberta_por: 'Tiago' }), true);
    const txt = await a.page.evaluate(() => document.body.innerText);
    check('depois de reenviada, a faixa mostra que a urgência já foi reaberta uma vez (Tiago)', /Urgência já reaberta uma vez/.test(txt) && /Tiago/.test(txt), txt.slice(0, 500));
    erros.push(...a.erros); await a.ctx.close();
  }

  check('nenhum erro de JavaScript', erros.length === 0, JSON.stringify(erros));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou  [${ARQ}]`);
  process.exit(falhou ? 1 : 0);
})();
