// "No app home painel de gestão, o card onde geramos os alertas hoje fica totalmente
//  expansivo, é possível colocar ele pra ser expansivo ao clicar."
//
// Com 9 lojas em aviso o card tomava a tela inteira antes do resto do painel. Agora é um
// acordeão fechado por padrão, com resumo suficiente no cabeçalho pra decidir se vale abrir —
// e o estado sobrevive ao re-render, porque o painel se redesenha sozinho (polling,
// confirmação de leitura, novo alerta) e fechar na cara de quem está lendo seria pior.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const USUARIOS = [
  { nome: 'Carol',   loja: 'BANGU',        cargo: 'sub_gerente', ativo: true },
  { nome: 'Taynara', loja: 'BANGU',        cargo: 'sub_gerente', ativo: true },
  { nome: 'Walter',  loja: 'NOVA AMERICA', cargo: 'gerente',     ativo: true },
];
const CARGOS = ['gerente', 'sub_gerente'];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 430, height: 950 } });
  let alertas = [], leituras = [];
  await ctx.route('**/rest/v1/**', async (route) => {
    const url = route.request().url();
    const json = b => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/gn_alertas_urgentes/.test(url)) return json(alertas.filter(a => !a.resolvido));
    if (/gn_alertas_leitura/.test(url)) return json(leituras);
    if (/gn_usuarios_publico/.test(url)) {
      const loja = (url.match(/loja=eq\.([^&]+)/) || [])[1];
      let r = USUARIOS.filter(u => u.ativo);
      if (loja) r = r.filter(u => u.loja === decodeURIComponent(loja));
      return json(r);
    }
    return json([]);
  });
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try {
      await page.waitForFunction(() => {
        try { return typeof _buildAlertasUrgentesCard === 'function' && typeof ALERTA_CARGO_LABEL !== 'undefined'; }
        catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) { if (t >= 3) { console.log('FALHOU: o painel não carregou'); falhou++; await browser.close(); process.exit(1); } }
  }

  const existe = await page.evaluate(() => {
    try { return typeof _alertasCardAberto !== 'undefined' && typeof _alertaFaltam === 'function'; }
    catch (e) { return false; }
  });
  if (!existe) {
    console.log('FALHOU: o card recolhível não existe neste arquivo (contraprova esperada — é novo)');
    console.log('\n0 OK, 10 falhou');
    await browser.close(); process.exit(1);
  }

  const montar = () => page.evaluate(() => {
    session = { id: 1, nome: 'Tiago', loja: 'GERAL', cargo: 'mestre', permissoes: { master: true } };
    let box = document.getElementById('_teste-alertas');
    if (!box) { box = document.createElement('div'); box.id = '_teste-alertas'; document.body.appendChild(box); }
    box.innerHTML = _buildAlertasUrgentesCard();
    const d = box.querySelector('details.alertas-acc');
    return { html: box.innerHTML, aberto: !!(d && d.open), temDetails: !!d };
  });

  const carregar = () => page.evaluate(async () => {
    const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
    const r = await fetch(`${SB_URL}/rest/v1/gn_alertas_urgentes?resolvido=eq.false&select=id,loja,cargos,resolvido,criado_por,criado_em,motivo`, { headers: H });
    _dashAlertasUrgentes = await r.json();
    _dashUsuariosAtivos = []; _dashAlertasLeituras = {};
    await _carregarLeiturasAlertas();
  });

  // ── 1. Fechado por padrão, com o conteúdo dentro ───────────────────────────────────
  alertas = [
    { id: 1, loja: 'BANGU',        cargos: CARGOS, resolvido: false, criado_por: 'Tiago', criado_em: new Date().toISOString(), motivo: 'Resultado do mês' },
    { id: 2, loja: 'NOVA AMERICA', cargos: CARGOS, resolvido: false, criado_por: 'Tiago', criado_em: new Date().toISOString(), motivo: 'Resultado do mês' },
  ];
  leituras = [{ alerta_id: 1, usuario: 'Taynara' }];
  await carregar();
  const inicial = await montar();
  check('o card virou um acordeão (details)', inicial.temDetails);
  check('e começa FECHADO — era o pedido', inicial.aberto === false);
  check('o conteúdo continua lá dentro, só escondido',
    /Bangu/.test(inicial.html) && /Nova América|NOVA AMERICA/.test(inicial.html) && /falta: Carol/.test(inicial.html));

  // ── 2. O cabeçalho diz o suficiente pra decidir se abre ───────────────────────────
  check('o cabeçalho mantém a contagem de ativos', /2 ativos/.test(inicial.html));
  check('e diz quantas lojas ainda não tiveram a gerência toda lendo',
    /2 de 2 ainda sem a gerência toda/.test(inicial.html));

  leituras = [{ alerta_id: 1, usuario: 'Taynara' }, { alerta_id: 1, usuario: 'Carol' }];
  await carregar();
  const umaLida = await montar();
  check('com uma loja completa, o resumo cai pra 1 de 2', /1 de 2 ainda sem a gerência toda/.test(umaLida.html));

  leituras = [{ alerta_id: 1, usuario: 'Taynara' }, { alerta_id: 1, usuario: 'Carol' }, { alerta_id: 2, usuario: 'Walter' }];
  await carregar();
  const todasLidas = await montar();
  check('quando todas leram, o resumo avisa que vão encerrar sozinhos',
    /A gerência de todas já leu/.test(todasLidas.html));

  // ── 3. Abrir e o estado sobreviver ao re-render ───────────────────────────────────
  const depoisDeAbrir = await page.evaluate(() => {
    const d = document.querySelector('#_teste-alertas details.alertas-acc');
    d.open = true;
    d.dispatchEvent(new Event('toggle'));
    return _alertasCardAberto;
  });
  check('abrir guarda o estado', depoisDeAbrir === true);
  const reRender = await montar();
  check('e o card NÃO fecha sozinho quando o painel se redesenha', reRender.aberto === true);

  const depoisDeFechar = await page.evaluate(() => {
    const d = document.querySelector('#_teste-alertas details.alertas-acc');
    d.open = false;
    d.dispatchEvent(new Event('toggle'));
    return _alertasCardAberto;
  });
  const reRender2 = await montar();
  check('e fechar também é respeitado no re-render', depoisDeFechar === false && reRender2.aberto === false);

  // ── 4. O botão de alertar não abre/fecha o card por acidente ──────────────────────
  const botao = await page.evaluate(() => {
    const d = document.querySelector('#_teste-alertas details.alertas-acc');
    const antes = d.open;
    const b = [...d.querySelectorAll('summary button')].find(x => /Alertar lojas/.test(x.textContent));
    if (!b) return { achou: false };
    let abriuModal = false;
    const real = window.abrirModalAlertaLojas;
    window.abrirModalAlertaLojas = () => { abriuModal = true; };
    b.click();
    window.abrirModalAlertaLojas = real;
    return { achou: true, antes, depois: d.open, abriuModal };
  });
  check('o botão "Alertar lojas" continua no cabeçalho e abre o modal',
    botao.achou && botao.abriuModal);
  check('e clicar nele não recolhe nem expande o card', botao.antes === botao.depois);

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
