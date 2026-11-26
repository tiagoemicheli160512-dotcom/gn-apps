// "Vamos precisar colocar a obrigatoriedade de o gerente validar a verificação da mini DRE no
//  app Home Lojas, o resultado continua com pouca adesão. Pode bloquear a partir de amanhã,
//  só após validação com a senha que liberar o app." (14/11/2026, 22h — "amanhã" é 15/11)
//
// A Home trava em tela cheia com o próprio card do mês dentro (aberto). Libera quando a
// gerência ou a sub confirma com a senha. Só trava gerente/sub, nunca a Maglia, e falha aberto.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 860 } });
  let ciente = {};              // all_data da linha DESEMPENHO_CIENTE
  let cienteFalha = false;
  const gravacoes = [];
  await ctx.route('**/rest/v1/**', async r => {
    const u = decodeURIComponent(r.request().url());
    const metodo = r.request().method();
    if (/rpc\/verificar_login/.test(u)) {
      const b = JSON.parse(r.request().postData() || '{}');
      const corpo = b.p_senha === '1234' ? [{ nome: b.p_nome, cargo: b.p_nome === 'Bia' ? 'sub_gerente' : 'gerente' }] : [];
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) });
    }
    if (/gn_lojas\?on_conflict=loja/.test(u) && metodo === 'POST') {
      const b = JSON.parse(r.request().postData() || '{}');
      gravacoes.push(b);
      if (b.loja === 'DESEMPENHO_CIENTE') ciente = b.all_data;
      return r.fulfill({ status: 201, body: '' });
    }
    if (/gn_lojas\?loja=eq\.DESEMPENHO_CIENTE/.test(u)) {
      if (cienteFalha) return r.abort('internetdisconnected');
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ all_data: ciente }]) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof _renderMesAnteriorHome === 'function' && typeof _cienteBlocoHtml === 'function'; } catch (e) { return false; } }, { timeout: 25000 }); break; }
    catch (e) { if (t >= 3) { console.log('FALHOU: a Home não carregou'); process.exit(1); } }
  }
  const existe = await page.evaluate(() => typeof _cienteTravaReavaliar === 'function');
  if (!existe) { console.log('FALHOU: a trava da ciência do mês não existe neste arquivo (contraprova esperada — é nova)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1); }

  // Monta a Home de uma loja num "hoje" fixo e devolve o estado da trava.
  const montar = (opts) => page.evaluate(async (o) => {
    if (!window.__DateReal) window.__DateReal = Date;
    const Real = window.__DateReal, FIXO = o.hoje + 'T12:00:00';
    window.Date = class extends Real {
      constructor(...a) { if (!a.length) super(FIXO); else super(...a); }
      static now() { return new Real(FIXO).getTime(); }
    };
    if (typeof _cienteTravaLiberar === 'function') _cienteTravaLiberar();
    if (typeof _gateAtivo !== 'undefined') _gateAtivo = false;
    LOJAS_LISTA = ['BANGU', 'MAGLIA'];
    masterLoja = null;
    _cienteAllData = null; _cienteForm = null; _cienteErro = '';
    session = { nome: 'Ana', loja: o.loja || 'BANGU', cargo: o.cargo || 'gerente', permissoes: o.permissoes || {} };
    await _renderMesAnteriorHome(true, session, false);
    return estado();
    function estado() {
      const ov = document.getElementById('gate-ciente-mes');
      const card = document.getElementById('mes-anterior-home-card');
      const det = card && card.querySelector('details');
      return { trava: !!ov, cardDentro: !!(ov && ov.contains(card)), aberto: !!(det && det.open),
               titulo: ov ? ov.innerText.split('\n').slice(0, 3).join(' | ') : '',
               botao: !!(card && /Confirmar que vi o resultado do MÊS/.test(card.innerText)) };
    }
  }, opts);
  const estado = () => page.evaluate(() => {
    const ov = document.getElementById('gate-ciente-mes');
    const card = document.getElementById('mes-anterior-home-card');
    const det = card && card.querySelector('details');
    return { trava: !!ov, cardDentro: !!(ov && ov.contains(card)), aberto: !!(det && det.open),
             noLugar: !!(card && !ov && card.parentNode && card.parentNode.id !== 'gate-ciente-mes-conteudo'),
             erro: card ? (card.innerText.match(/Usuário ou senha incorretos|ciência é da gerência[^\n]*/) || [''])[0] : '',
             visto: !!(card && /Resultado do mês visto pela gerência/.test(card.innerText)),
             overflow: document.body.style.overflow };
  });

  // ── O pedido: a partir de 15/11, gerente sem ciência fica travado ──
  let e = await montar({ hoje: '2026-11-15' });
  check('15/11, gerente de Bangu sem ciência de outubro: o app trava em tela cheia', e.trava, e);
  check('…com o próprio card do mês dentro, já aberto, e o botão de confirmar no fim', e.cardDentro && e.aberto && e.botao, e);
  check('…o título diz que é o resultado do mês de outubro', /resultado do mês de outubro/.test(e.titulo), e.titulo);

  // 15/11, Bangu: a trava subiu VAZIA — o arranjo da Home ("🗂 Fechamentos") puxou o card de
  // volta pro grupo depois que ele foi pra trava. O que a pessoa via: título e "Não sou eu".
  const arr = await page.evaluate(async () => {
    _homeOrganizarGrupos();
    await new Promise(r => setTimeout(r, 400));          // o observador do card reorganiza "logo"
    _homeOrganizarGrupos();
    const ov = document.getElementById('gate-ciente-mes');
    const card = document.getElementById('mes-anterior-home-card');
    return { trava: !!ov, cardDentro: !!(ov && ov.contains(card)), botao: !!(ov && /Confirmar que vi o resultado do MÊS/.test(ov.innerText)) };
  });
  check('a organização da Home em grupos não tira o card de dentro da trava (não fica tela vazia)', arr.trava && arr.cardDentro && arr.botao, arr);

  e = await montar({ hoje: '2026-11-14' });
  check('14/11 (o dia do pedido) ainda não trava — começa no dia seguinte', !e.trava, e);

  e = await montar({ hoje: '2026-11-15', cargo: 'sub_gerente' });
  check('sub-gerente também deve a ciência: trava', e.trava, e);
  e = await montar({ hoje: '2026-11-15', cargo: 'caixa' });
  check('caixa não pode confirmar — não trava (segue trabalhando)', !e.trava, e);
  e = await montar({ hoje: '2026-11-15', permissoes: { master: true } });
  check('mestre/supervisão não trava', !e.trava, e);
  e = await montar({ hoje: '2026-11-15', loja: 'MAGLIA' });
  check('Maglia fica fora (o pedido não a citou)', !e.trava, e);

  ciente = { '2026-10': { BANGU: { nome: 'Ana', cargo: 'gerente', em: '2026-11-10T20:00:00Z' } } };
  e = await montar({ hoje: '2026-11-15' });
  check('loja que já confirmou outubro não trava', !e.trava, e);
  ciente = {};

  cienteFalha = true;
  e = await montar({ hoje: '2026-11-15' });
  check('sem internet pra ler a ciência: não trava (falha aberto)', !e.trava, e);
  cienteFalha = false;

  // Meses seguintes: dias 1–4 o mês ainda está fechando; a partir do dia 5 trava.
  e = await montar({ hoje: '2026-12-04' });
  check('dezembro, dia 4: ainda não trava (mês fechando)', !e.trava, e);
  e = await montar({ hoje: '2026-12-05' });
  check('dezembro, dia 5: trava pelo resultado de novembro', e.trava && /novembro/.test(e.titulo), e.titulo);

  // ── Destravar: senha errada mantém; senha certa libera ──
  await montar({ hoje: '2026-11-15' });
  await page.evaluate(() => _cienteAbrirForm('BANGU'));
  await page.waitForTimeout(300);
  let s = await estado();
  check('abrir o formulário da senha não recolhe o card (continua aberto, dentro da trava)', s.trava && s.cardDentro && s.aberto, s);
  await page.fill('#ciente-user', 'Ana'); await page.fill('#ciente-senha', 'errada');
  await page.click('text=Confirmar que vi');
  await page.waitForTimeout(500);
  s = await estado();
  check('senha errada: aparece o erro e continua travado', s.trava && /incorretos/.test(s.erro) && s.aberto, s);
  check('…e nada foi gravado', gravacoes.length === 0, gravacoes.length);
  await page.fill('#ciente-user', 'Ana'); await page.fill('#ciente-senha', '1234');
  await page.click('text=Confirmar que vi');
  await page.waitForFunction(() => !document.getElementById('gate-ciente-mes'), { timeout: 5000 }).catch(() => {});
  s = await estado();
  check('senha certa da gerência: grava a ciência de outubro de Bangu', gravacoes.length === 1 && ciente['2026-10'] && ciente['2026-10'].BANGU && ciente['2026-10'].BANGU.nome === 'Ana', gravacoes);
  check('…e o app libera: a trava some, o card volta pro lugar com "visto pela gerência"', !s.trava && s.noLugar && s.visto && s.overflow === '', s);

  // Outra pessoa no aparelho do gerente: "Não sou eu — sair".
  ciente = {};
  await montar({ hoje: '2026-11-15' });
  const saiu = await page.evaluate(() => { doLogout(); return { trava: !!document.getElementById('gate-ciente-mes'), sess: session }; });
  check('"Não sou eu — sair" desloga e tira a trava da frente do login', !saiu.trava && saiu.sess === null, saiu);

  // A da semana tem a vez; quando ela solta, aparece a do mês.
  const fila = await page.evaluate(async () => {
    LOJAS_LISTA = ['BANGU']; masterLoja = null; _cienteAllData = null;
    session = { nome: 'Ana', loja: 'BANGU', cargo: 'gerente', permissoes: {} };
    // A trava da semana aqui é simulada (_gateAtivo na mão). Um render da Home ainda em voo
    // termina chamando _gateReavaliar(), que reavalia de verdade, não acha trava da semana e
    // solta a simulada no meio do passo — corrida do teste, não do app (1 em ~12 sob carga).
    const reavaliar = _gateReavaliar; _gateReavaliar = () => {};
    _gateAtivo = true;
    await _renderMesAnteriorHome(true, session, false);
    const comSemana = !!document.getElementById('gate-ciente-mes');
    _gateReavaliar = reavaliar;
    _gateLiberar();
    return { comSemana, depois: !!document.getElementById('gate-ciente-mes') };
  });
  check('com a trava da semana de pé, a do mês espera (não empilha duas telas)', fila.comSemana === false, fila);
  check('…e sobe assim que a da semana solta', fila.depois === true, fila);

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
