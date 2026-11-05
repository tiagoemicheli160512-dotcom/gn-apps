// "Preciso que o alerta não seja possível driblar [...] hoje se o primeiro que lê o aviso
//  clicar resolver some, porém o aviso precisa ser visto por toda a gerência [...] cada pessoa
//  com cargo gerente e sub tem que manter até todos terem lido [...] e talvez criar um seletor
//  de função, pra que quando seja gerado uma msg clicar quais setores podem ver."
//
// Os cargos do fixture são os reais da Bangu: Neto (estoquista), Carol e Taynara (sub-gerente),
// Patrícia (caixa) — a loja com DOIS sub-gerentes, que é o caso que o pedido descreve.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const USUARIOS = [
  { nome: 'Neto',     loja: 'BANGU', cargo: 'estoquista' },
  { nome: 'Carol',    loja: 'BANGU', cargo: 'sub_gerente' },
  { nome: 'Taynara',  loja: 'BANGU', cargo: 'sub_gerente' },
  { nome: 'Patrícia', loja: 'BANGU', cargo: 'caixa' },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 430, height: 950 } });

  let alertas = [];
  let leituras = [];
  let escritas = [];
  await ctx.route('**/rest/v1/**', async (route) => {
    const req = route.request();
    const url = req.url(), m = req.method();
    if (m !== 'GET') escritas.push({ m, url, body: req.postData() });
    if (/gn_alertas_leitura/.test(url)) {
      if (m === 'GET') {
        const usuario = (url.match(/usuario=eq\.([^&]+)/) || [])[1];
        const alertaEq = (url.match(/alerta_id=eq\.(\d+)/) || [])[1];
        const alertaIn = (url.match(/alerta_id=in\.\(([^)]+)\)/) || [])[1];
        let r = leituras;
        if (usuario) r = r.filter(l => l.usuario === decodeURIComponent(usuario));
        if (alertaEq) r = r.filter(l => String(l.alerta_id) === alertaEq);
        if (alertaIn) { const ids = alertaIn.split(',').map(String); r = r.filter(l => ids.includes(String(l.alerta_id))); }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r) });
      }
      if (m === 'POST') { leituras.push(JSON.parse(req.postData())); return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' }); }
    }
    if (/gn_alertas_urgentes/.test(url)) {
      if (m === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(alertas.filter(a => !a.resolvido)) });
      if (m === 'PATCH') {
        const id = (url.match(/id=eq\.(\d+)/) || [])[1];
        const b = JSON.parse(req.postData() || '{}');
        alertas.forEach(a => { if (String(a.id) === id) Object.assign(a, b); });
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
    }
    if (/gn_usuarios_publico/.test(url) && m === 'GET') {
      const loja = (url.match(/loja=eq\.([^&]+)/) || [])[1];
      const cargoIn = (url.match(/cargo=in\.\(([^)]+)\)/) || [])[1];
      let r = USUARIOS;
      if (loja) r = r.filter(u => u.loja === decodeURIComponent(loja));
      if (cargoIn) {
        const cs = cargoIn.split(',').map(c => decodeURIComponent(c));
        r = r.filter(u => cs.includes(u.cargo));
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try {
      await page.waitForFunction(() => {
        try { return typeof _checarAlertaUrgente === 'function' && typeof ALERTA_CARGOS !== 'undefined'; }
        catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) {
      if (t >= 3) {
        console.log('FALHOU: a leitura por pessoa não existe neste arquivo (contraprova esperada — é nova)');
        console.log('\n0 OK, 14 falhou');
        await browser.close(); process.exit(1);
      }
    }
  }

  const entrar = (nome, cargo) => page.evaluate(({ nome, cargo }) => {
    session = { id: 1, nome, loja: 'BANGU', cargo, permissoes: {} };
    _alertasLeiturasMinhas = new Set();
  }, { nome, cargo });

  const ver = async () => {
    await page.evaluate(() => _checarAlertaUrgente('BANGU'));
    return page.evaluate(() => {
      const el = document.getElementById('alerta-urgente-overlay');
      if (!el) return { aberto: false };
      const cs = getComputedStyle(el);
      return { aberto: true, html: el.innerHTML, bloqueia: cs.pointerEvents !== 'none',
               opaco: cs.backgroundColor !== 'rgba(0, 0, 0, 0)' };
    });
  };

  // ── 1. Não dá pra driblar ───────────────────────────────────────────────────────────
  alertas = [{ id: 1, loja: 'BANGU', motivo: 'Falta troco no caixa', criado_por: 'Tiago',
               resolvido: false, criado_em: new Date().toISOString(), cargos: ['gerente', 'sub_gerente'] }];
  leituras = [];
  await entrar('Carol', 'sub_gerente');
  let v = await ver();
  check('o aviso aparece pra quem é do cargo alvo', v.aberto);
  check('e BLOQUEIA a tela (antes era borda decorativa, dava pra usar o app por baixo)',
    v.bloqueia && v.opaco);
  check('diz pra quem é o aviso', /Gerente, Sub-gerente/.test(v.html));
  check('e explica que só encerra quando todos lerem', /todos os destinatários lerem/.test(v.html));
  check('o botão é de confirmar leitura, não de resolver pra todos',
    /Li e entendi/.test(v.html) && !/Resolver todos/.test(v.html));

  // ── 2. Quem não é do cargo alvo não é travado ───────────────────────────────────────
  await entrar('Patrícia', 'caixa');
  v = await ver();
  check('caixa não é travada por um aviso que é da gerência', v.aberto === false);

  // ── 3. Leitura é por pessoa: a 1ª não encerra pra 2ª ────────────────────────────────
  await entrar('Carol', 'sub_gerente');
  await page.evaluate(() => _confirmarLeituraAlerta(1));
  await page.waitForTimeout(250);
  const depoisCarol = await ver();
  check('depois de confirmar, some pra QUEM leu', depoisCarol.aberto === false);
  check('a leitura foi gravada com nome e cargo',
    leituras.length === 1 && leituras[0].usuario === 'Carol' && leituras[0].cargo === 'sub_gerente');
  check('e o aviso NÃO foi encerrado, porque falta a outra sub-gerente',
    alertas[0].resolvido !== true);

  await entrar('Taynara', 'sub_gerente');
  v = await ver();
  check('a segunda sub-gerente continua vendo o aviso (era o furo: chegava pela metade)', v.aberto);

  await page.evaluate(() => _confirmarLeituraAlerta(1));
  await page.waitForTimeout(250);
  check('quando a última confirma, aí sim o aviso é encerrado', alertas[0].resolvido === true);
  check('com as duas leituras registradas', leituras.length === 2);

  // ── 4. Aviso sem cargo definido vale pra todo mundo (linhas antigas) ────────────────
  alertas = [{ id: 2, loja: 'BANGU', motivo: 'Aviso antigo', criado_por: 'Tiago',
               resolvido: false, criado_em: new Date().toISOString() }];
  leituras = [];
  await entrar('Patrícia', 'caixa');
  v = await ver();
  check('aviso sem cargo (linha antiga) aparece pra todo mundo da loja',
    v.aberto && /toda a loja/.test(v.html));

  // ── 5. Alvo por cargo diferente da gerência ─────────────────────────────────────────
  alertas = [{ id: 3, loja: 'BANGU', motivo: 'Conferir a entrega', criado_por: 'Matheus',
               resolvido: false, criado_em: new Date().toISOString(), cargos: ['estoquista'] }];
  leituras = [];
  await entrar('Neto', 'estoquista');
  const doEstoquista = await ver();
  await entrar('Carol', 'sub_gerente');
  const daSub = await ver();
  check('aviso só do estoquista aparece pro estoquista', doEstoquista.aberto && /Estoquista/.test(doEstoquista.html));
  check('e não trava a sub-gerente', daSub.aberto === false);

  await entrar('Neto', 'estoquista');
  await ver();   // o fluxo real passa pela tela antes de confirmar
  await page.evaluate(() => _confirmarLeituraAlerta(3));
  await page.waitForTimeout(250);
  check('com um único destinatário, a leitura dele encerra o aviso', alertas[0].resolvido === true);

  // ── 5b. Confirmar com a lista fora de memória (reload, outra aba) ──────────────────
  // Sem buscar a linha do alerta no banco, o fechamento caía no padrão "todos os cargos" e
  // contava gente que nem era destinatária — o aviso ficava pendente pra sempre.
  alertas = [{ id: 4, loja: 'BANGU', motivo: 'So do estoquista', criado_por: 'Matheus',
               resolvido: false, criado_em: new Date().toISOString(), cargos: ['estoquista'] }];
  leituras = [];
  await entrar('Neto', 'estoquista');
  await page.evaluate(() => { _alertasUrgentesAtivos = []; });   // simula a lista perdida
  await page.evaluate(() => _confirmarLeituraAlerta(4));
  await page.waitForTimeout(300);
  check('confirma e encerra mesmo sem a lista em memória (busca a linha no banco)',
    alertas[0].resolvido === true);

  // ── 6. O seletor de cargos na criação ───────────────────────────────────────────────
  const modal = await page.evaluate(() => {
    abrirModalAlertaLojas();
    const chks = [...document.querySelectorAll('._alerta-cargo-chk')];
    return { n: chks.length, marcados: chks.filter(c => c.checked).map(c => c.value),
             html: document.getElementById('_alerta-lojas-modal').innerHTML };
  });
  check(`o seletor oferece os cargos (${modal.n})`, modal.n >= 6);
  check('com gerente e sub-gerente marcados por padrão',
    modal.marcados.length === 2 && modal.marcados.includes('gerente') && modal.marcados.includes('sub_gerente'));
  check('e oferece compras e estoquista, que era quem não era alcançado',
    /value="compras"/.test(modal.html) && /value="estoquista"/.test(modal.html));
  check('explica que sem marcar nada vai pra todo mundo', /todo mundo<\/b> da loja/.test(modal.html));

  const envio = await page.evaluate(async () => {
    document.querySelectorAll('._alerta-cargo-chk').forEach(c => { c.checked = c.value === 'compras'; });
    document.querySelectorAll('._alerta-loja-chk').forEach((c, i) => { c.checked = i === 0; });
    const realConf = window.confirm; let msg = '';
    window.confirm = (m) => { msg = String(m); return true; };
    const realAlert = window.alert; window.alert = () => {};
    await _confirmarEnvioAlertaLojas();
    window.confirm = realConf; window.alert = realAlert;
    return msg;
  });
  check('a confirmação diz quem vai receber', /Quem recebe: Compras/.test(envio));
  const post = escritas.filter(e => e.m === 'POST' && /gn_alertas_urgentes/.test(e.url)).pop();
  check('e o cargo escolhido é gravado no alerta',
    post && JSON.parse(post.body).cargos && JSON.parse(post.body).cargos[0] === 'compras');

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
