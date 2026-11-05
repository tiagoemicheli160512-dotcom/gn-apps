// "Fizemos a mudança nos alertas, quando virassem que gerei o alerta tinha um contador
//  dizendo quantos faltavam pra ver e os nomes, só que vendo agora não tem nada [...] Seria
//  bom identificar quem já viu, e quando todos verem sumir."
// "Pelo que lembro marquei supervisor, caixa não, quando enviei a msg."
//
// Três coisas, todas com os dados reais da rede nesta data:
//  1. A linha sumia: _carregarLeiturasAlertas() estava DENTRO do catch de _loadDashAll(), então
//     só rodava quando o painel falhava ao carregar. Aparecia logo depois de disparar um alerta
//     porque ali quem recarrega é _recarregarAlertasUrgentes(), que sempre chamou.
//  2. A conta era por quantidade de linhas, não por nome.
//  3. Supervisor (Anderson, Edson, Lucas) é cadastrado na loja GERAL. Marcar o cargo no envio
//     não tinha efeito nenhum: eles nunca eram destinatários de loja nenhuma, e a leitura do
//     Edson no aviso da Nova América não aparecia na tela. Agora têm linha própria, contada uma
//     vez pela rede, sem bloquear o fechamento de cada loja (que é da gerência dela).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const USUARIOS = [
  { nome: 'Carol',         loja: 'BANGU',        cargo: 'sub_gerente', ativo: true },
  { nome: 'Taynara',       loja: 'BANGU',        cargo: 'sub_gerente', ativo: true },
  { nome: 'Neto',          loja: 'BANGU',        cargo: 'estoquista',  ativo: true },
  { nome: 'Augusto',       loja: 'NOVA AMERICA', cargo: 'gerente',     ativo: true },
  { nome: 'Ramos',         loja: 'NOVA AMERICA', cargo: 'gerente',     ativo: true },
  { nome: 'Renata Soares', loja: 'NOVA AMERICA', cargo: 'gerente',     ativo: true },
  { nome: 'Walter',        loja: 'NOVA AMERICA', cargo: 'gerente',     ativo: true },
  // Supervisores: loja GERAL, não pertencem a nenhuma das lojas do alerta.
  { nome: 'Anderson',      loja: 'GERAL',        cargo: 'supervisor',  ativo: true },
  { nome: 'Edson',         loja: 'GERAL',        cargo: 'supervisor',  ativo: true },
  { nome: 'Lucas',         loja: 'GERAL',        cargo: 'supervisor',  ativo: true },
  { nome: 'Souza',         loja: 'GERAL',        cargo: 'supervisor',  ativo: false },
];
const CARGOS_ALVO = ['gerente', 'sub_gerente', 'supervisor'];
const MOTIVO = 'Resultado do mês';

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 430, height: 950 } });

  let alertas = [], leituras = [];
  const patches = [];
  await ctx.route('**/rest/v1/**', async (route) => {
    const req = route.request(), url = req.url(), m = req.method();
    const json = b => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/gn_alertas_urgentes/.test(url)) {
      if (m === 'GET') {
        const id = (url.match(/id=eq\.(\d+)/) || [])[1];
        let r = alertas;
        if (id) r = r.filter(a => String(a.id) === id);
        else if (/resolvido=eq\.false/.test(url)) r = r.filter(a => !a.resolvido);
        return json(r);
      }
      if (m === 'PATCH') {
        const id = (url.match(/id=eq\.(\d+)/) || [])[1];
        const b = JSON.parse(req.postData() || '{}');
        patches.push({ id, b });
        alertas.forEach(a => { if (String(a.id) === id) Object.assign(a, b); });
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
    }
    if (/gn_alertas_leitura/.test(url)) {
      if (m === 'GET') {
        const eq = (url.match(/alerta_id=eq\.(\d+)/) || [])[1];
        const inn = (url.match(/alerta_id=in\.\(([^)]+)\)/) || [])[1];
        let r = leituras;
        if (eq) r = r.filter(l => String(l.alerta_id) === eq);
        if (inn) { const ids = inn.split(','); r = r.filter(l => ids.includes(String(l.alerta_id))); }
        return json(r);
      }
      if (m === 'POST') { leituras.push(JSON.parse(req.postData())); return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' }); }
    }
    if (/gn_usuarios_publico/.test(url) && m === 'GET') {
      const loja = (url.match(/loja=eq\.([^&]+)/) || [])[1];
      const cargoIn = (url.match(/cargo=in\.\(([^)]+)\)/) || [])[1];
      let r = USUARIOS.filter(u => u.ativo);
      if (loja) r = r.filter(u => u.loja === decodeURIComponent(loja));
      if (cargoIn) { const cs = cargoIn.split(',').map(decodeURIComponent); r = r.filter(u => cs.includes(u.cargo)); }
      return json(r);
    }
    return json([]);
  });

  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try {
      await page.waitForFunction(() => {
        try { return typeof _buildAlertasUrgentesCard === 'function' && typeof _carregarLeiturasAlertas === 'function'
                     && typeof ALERTA_CARGO_LABEL !== 'undefined'; } catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) { if (t >= 3) { console.log('FALHOU: o painel de alertas não carregou'); falhou++; await browser.close(); process.exit(1); } }
  }

  const temSupervisor = await page.evaluate(() => {
    try { return typeof _alertaForaDaLoja === 'function' && typeof _alertasForaDaLojaHtml === 'function'; }
    catch (e) { return false; }
  });

  const base = () => { alertas = [
    { id: 561, loja: 'BANGU',        cargos: CARGOS_ALVO, resolvido: false, criado_por: 'Tiago', criado_em: new Date().toISOString(), motivo: MOTIVO },
    { id: 567, loja: 'NOVA AMERICA', cargos: CARGOS_ALVO, resolvido: false, criado_por: 'Tiago', criado_em: new Date().toISOString(), motivo: MOTIVO },
  ]; };

  // ── 1. O bug principal: o painel pelo caminho que ele roda de verdade ──────────────
  base();
  leituras = [{ alerta_id: 561, usuario: 'Taynara' }, { alerta_id: 567, usuario: 'Ramos' }, { alerta_id: 567, usuario: 'Edson' }];
  const peloPainel = await page.evaluate(async () => {
    session = { id: 1, nome: 'Tiago', loja: 'GERAL', cargo: 'mestre', permissoes: { master: true } };
    _dashUsuariosAtivos = []; _dashAlertasLeituras = {}; _dashAlertasUrgentes = [];
    try { await _loadDashAll(); } catch (e) {}
    return { usuarios: _dashUsuariosAtivos.length, leituras: Object.keys(_dashAlertasLeituras).length,
             html: _buildAlertasUrgentesCard() };
  });
  check('carregando o painel pelo caminho normal (_loadDashAll), as leituras são buscadas',
    peloPainel.usuarios > 0 && peloPainel.leituras > 0);
  check('e a linha de progresso aparece já no primeiro carregamento', /leu 1\/2/.test(peloPainel.html));
  check('o card diz quem JÁ VIU, não só quem falta', /já viu: Taynara/.test(peloPainel.html));
  check('e quem falta', /falta: Carol/.test(peloPainel.html));
  check('com o cargo a quem o aviso foi dirigido', /Gerente\/Sub-gerente\/Supervisor/.test(peloPainel.html));
  check('o estoquista não entra como destinatário (não era do cargo alvo)', !/Neto/.test(peloPainel.html));

  // ── 2. Supervisor: linha própria, uma leitura pela rede ───────────────────────────
  if (!temSupervisor) {
    ['supervisor tem linha própria no card', 'contado uma vez pela rede, não por loja',
     'quem já viu e quem falta entre os supervisores', 'supervisor não entra no "falta" de cada loja',
     'leitura do supervisor não fecha o aviso da loja'].forEach(n =>
      check(n + ' (contraprova esperada — é novo)', false));
  } else {
    const sup = peloPainel.html;
    check('supervisor tem linha própria no card', /Supervisor \(fora da loja\)/.test(sup));
    check('contado uma vez pela rede, não por loja', /leu 1\/3 · 1 leitura vale pelas 2 lojas/.test(sup));
    check('quem já viu e quem falta entre os supervisores',
      /já viu: Edson/.test(sup) && /falta: Anderson, Lucas/.test(sup));
    // A linha da Nova América é "leu 1/4" (Ramos), e não 2/4 — o Edson não é da loja.
    check('supervisor não entra no "falta" de cada loja',
      /leu 1\/4/.test(sup) && !/falta: Augusto, Edson/.test(sup));
    check('supervisor inativo fica fora da conta (Souza)', !/Souza/.test(sup));
  }

  // ── 3. A conta é por nome: leitura de fora do alvo não infla nem fecha ────────────
  patches.length = 0;
  await page.evaluate(() => { session = { id: 9, nome: 'Augusto', loja: 'NOVA AMERICA', cargo: 'gerente' }; });
  await page.evaluate(() => _confirmarLeituraAlerta(567));
  await page.waitForTimeout(300);
  check('com 2 dos 4 gerentes lendo (mais o supervisor), o aviso NÃO fecha',
    !patches.some(p => p.id === '567' && p.b.resolvido === true));

  for (const nome of ['Renata Soares', 'Walter']) {
    await page.evaluate((n) => { session = { id: 11, nome: n, loja: 'NOVA AMERICA', cargo: 'gerente' }; }, nome);
    await page.evaluate(() => _confirmarLeituraAlerta(567));
    await page.waitForTimeout(250);
  }
  check('quando o último gerente da loja lê, aí sim fecha',
    patches.some(p => p.id === '567' && p.b.resolvido === true));

  const final = await page.evaluate(async () => {
    const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
    const r = await fetch(`${SB_URL}/rest/v1/gn_alertas_urgentes?resolvido=eq.false&select=id,loja,cargos,resolvido,criado_por,criado_em,motivo`, { headers: H });
    _dashAlertasUrgentes = await r.json();
    _dashAlertasLeituras = {};
    await _carregarLeiturasAlertas();
    return _buildAlertasUrgentesCard();
  });
  check('e o alerta some do painel quando a gerência toda viu',
    !/NOVA AMERICA|Nova América/.test(final) && /Bangu|BANGU/.test(final));

  // ── 4. Loja sem ninguém no cargo alvo não quebra o card ──────────────────────────
  alertas.push({ id: 999, loja: 'PEDREIRA', cargos: CARGOS_ALVO, resolvido: false, criado_por: 'Tiago', criado_em: new Date().toISOString(), motivo: MOTIVO });
  const semGente = await page.evaluate(async () => {
    const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
    const r = await fetch(`${SB_URL}/rest/v1/gn_alertas_urgentes?resolvido=eq.false&select=id,loja,cargos,resolvido,criado_por,criado_em,motivo`, { headers: H });
    _dashAlertasUrgentes = await r.json();
    _dashAlertasLeituras = {};
    await _carregarLeiturasAlertas();
    return _buildAlertasUrgentesCard();
  });
  check('loja sem ninguém no cargo alvo aparece sem a linha, sem quebrar o card',
    /PEDREIRA|Pedreira/.test(semGente) && !/leu \d+\/0/.test(semGente));

  // ── 5. Aviso antigo (sem cargos) não ganha linha de supervisor ───────────────────
  alertas = [{ id: 700, loja: 'BANGU', resolvido: false, criado_por: 'Tiago', criado_em: new Date().toISOString(), motivo: 'Aviso antigo' }];
  leituras = [];
  const antigo = await page.evaluate(async () => {
    const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
    const r = await fetch(`${SB_URL}/rest/v1/gn_alertas_urgentes?resolvido=eq.false&select=id,loja,cargos,resolvido,criado_por,criado_em,motivo`, { headers: H });
    _dashAlertasUrgentes = await r.json();
    _dashAlertasLeituras = {};
    await _carregarLeiturasAlertas();
    return _buildAlertasUrgentesCard();
  });
  check('aviso antigo (sem cargos) vale pra toda a loja e não inventa linha de supervisor',
    /toda a loja/.test(antigo) && !/fora da loja/.test(antigo));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
