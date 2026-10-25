// "No app home painel gestão, nas visitas, quando for remota, ter a opção de selecionar
//  multilojas e também de colocar a msg dos prs feito no dia."
//
// Um acompanhamento remoto num dia cobre várias lojas na mesma sessão (treinamento/reunião
// online), e antes só dava pra registrar uma loja por lançamento. O campo de texto guarda o
// que foi entregue naquele dia junto da visita — hoje a visita só dizia que aconteceu.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const DIA = '2026-10-01';
const FEITO = 'Contagem de barris travando a segunda\nValor do estoque separado por insumo\nPainel de quem enviou o pedido';

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 430, height: 950 } });

  let proxId = 1;
  const escritas = [];
  await ctx.route('**/rest/v1/**', async (route) => {
    const req = route.request(), url = req.url(), m = req.method();
    if (m !== 'GET') escritas.push({ m, url, body: req.postData() });
    if (/gn_chk_visitas/.test(url) && m === 'POST') {
      const enviado = JSON.parse(req.postData() || '[]');
      const rows = (Array.isArray(enviado) ? enviado : [enviado]).map(b => ({ ...b, id: proxId++ }));
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(rows) });
    }
    if (/gn_chk_visitas/.test(url) && m === 'PATCH') {
      const ids = ((url.match(/id=in\.\(([^)]+)\)/) || [])[1] || (url.match(/id=eq\.([^&]+)/) || [])[1] || '').split(',');
      const b = JSON.parse(req.postData() || '{}');
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(ids.filter(Boolean).map(id => ({ id: Number(id), data: DIA, tipo_visita: 'remoto', hora_chegada: '09:00', ...b }))) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try {
      await page.waitForFunction(() => {
        try { return typeof _visCalDetalheHtml === 'function' && typeof TIPO_VISITA_REMOTO !== 'undefined' && typeof GN_LOJAS === 'object'; }
        catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) { if (t >= 3) { console.log('FALHOU: o painel de visitas não carregou'); falhou++; await browser.close(); process.exit(1); } }
  }

  const existe = await page.evaluate(() => {
    try { return typeof _visRemotoToggle === 'function' && typeof _visMultiSelecionadas === 'function'; }
    catch (e) { return false; }
  });
  if (!existe) {
    console.log('FALHOU: o multi-loja do remoto não existe neste arquivo (contraprova esperada — é novo)');
    console.log('\n0 OK, 17 falhou');
    await browser.close(); process.exit(1);
  }

  // Monta o dia como o painel monta, com um mestre registrando em nome de um supervisor.
  const montar = () => page.evaluate((dia) => {
    session = { id: 1, nome: 'Tiago', loja: 'GERAL', cargo: 'mestre', permissoes: { master: true } };
    _visSupList = [{ id: 7, nome: 'Carlos', cargo: 'supervisor' }];
    _visSupSelecionado = 'Carlos';
    window._reverseGeocodeVP = async () => 'Rua de Teste, 10';
    navigator.geolocation.getCurrentPosition = (res) => res({ coords: { latitude: -22.1234567, longitude: -43.7654321 } });
    let box = document.getElementById('_teste-dia');
    if (!box) { box = document.createElement('div'); box.id = '_teste-dia'; document.body.appendChild(box); }
    box.innerHTML = _visCalDetalheHtml(dia);
    // _renderVisitasSupContent() precisa de um alvo pra não estourar ao final do registro.
    if (!document.getElementById('visitas-sup-content')) {
      const alvo = document.createElement('div'); alvo.id = 'visitas-sup-content'; document.body.appendChild(alvo);
    }
    return box.innerHTML;
  }, DIA);

  const visivel = (id) => page.evaluate((id) => {
    const el = document.getElementById(id);
    return !!el && getComputedStyle(el).display !== 'none';
  }, id);

  await montar();

  // ── 1. Presencial é o estado inicial, e não mudou ───────────────────────────────────
  check('presencial continua com um destino só (o corpo está num lugar de cada vez)',
    await visivel('visreg-destino-wrap-' + DIA));
  check('o multi-loja fica escondido enquanto não é remoto',
    !(await visivel('visreg-multi-wrap-' + DIA)));
  check('e o campo do que foi feito no dia também',
    !(await visivel('visreg-feito-wrap-' + DIA)));

  // ── 2. Marcar remoto troca os campos ────────────────────────────────────────────────
  const aoMarcar = await page.evaluate((dia) => {
    document.getElementById('visreg-remoto-' + dia).checked = true;
    _visRemotoToggle(dia);
    return { rotulo: document.getElementById('visreg-btn-' + dia).textContent };
  }, DIA);
  check('no remoto aparece a lista de lojas acompanhadas', await visivel('visreg-multi-wrap-' + DIA));
  check('o destino único sai da frente', !(await visivel('visreg-destino-wrap-' + DIA)));
  check('o campo do que foi feito no dia aparece', await visivel('visreg-feito-wrap-' + DIA));
  check('e o botão deixa de falar em chegada', /Registrar acompanhamento/.test(aoMarcar.rotulo));

  // ── 3. A lista e o "marcar todas" ───────────────────────────────────────────────────
  const lista = await page.evaluate((dia) => {
    const chks = [...document.querySelectorAll('._visreg-multi-' + dia)];
    _visMultiMarcar(dia, true);
    const todas = chks.filter(c => c.checked).map(c => c.value);
    const maglia = chks.find(c => c.dataset.maglia === '1');
    if (maglia) maglia.checked = true;
    const comMaglia = _visMultiSelecionadas(dia);
    _visMultiMarcar(dia, false);
    return { n: chks.length, todas, comMaglia, depoisDeLimpar: _visMultiSelecionadas(dia) };
  }, DIA);
  check(`a lista traz todas as lojas cadastradas (${lista.n})`, lista.n === 12);
  check('"marcar todas" pega as 11 originais', lista.todas.length === 11);
  check('e deixa a Maglia de fora (regra do projeto: só quando é citada)',
    !lista.todas.includes('Maglia'));
  check('mas a Maglia continua marcável uma a uma', lista.comMaglia.includes('Maglia') && lista.comMaglia.length === 12);
  check('"limpar" desmarca tudo', lista.depoisDeLimpar.length === 0);

  // ── 4. Remoto sem loja marcada não grava nada ───────────────────────────────────────
  escritas.length = 0;
  const vazio = await page.evaluate(async (dia) => {
    await _visRegistrarChegada(dia);
    return document.getElementById('visreg-status-' + dia).textContent;
  }, DIA);
  check('remoto sem nenhuma loja marcada avisa e não grava',
    /pelo menos uma loja/.test(vazio) && escritas.length === 0);

  // ── 5. Remoto com várias lojas: uma linha por loja ──────────────────────────────────
  escritas.length = 0;
  await page.evaluate(({ dia, feito }) => {
    document.querySelectorAll('._visreg-multi-' + dia).forEach(c => {
      c.checked = ['Bangu', 'Caxias', 'Itaquera'].includes(c.value);
    });
    document.getElementById('visreg-obs-' + dia).value = 'Reunião de alinhamento';
    document.getElementById('visreg-feito-' + dia).value = feito;
  }, { dia: DIA, feito: FEITO });
  await page.evaluate((dia) => _visRegistrarChegada(dia), DIA);
  await page.waitForTimeout(400);
  const post = escritas.find(e => e.m === 'POST' && /gn_chk_visitas/.test(e.url));
  const linhas = post ? JSON.parse(post.body) : [];
  check('as 3 lojas escolhidas viram 3 linhas num único envio',
    Array.isArray(linhas) && linhas.length === 3);
  check('cada linha é da sua loja',
    linhas.map(l => l.loja).sort().join(',') === 'Bangu,Caxias,Itaquera');
  check('todas com a mesma hora e marcadas como remoto',
    linhas.every(l => l.tipo_visita === 'remoto' && l.hora_chegada === linhas[0].hora_chegada));
  check('sem localização, porque remoto não tem "onde"',
    linhas.every(l => l.lat === null && l.lon === null && l.endereco === null));
  check('o que foi feito no dia fica gravado junto da visita',
    linhas.every(l => l.obs.includes('Feito no dia') && l.obs.includes('Valor do estoque separado por insumo')));
  check('e a observação curta continua valendo',
    linhas.every(l => /Reunião de alinhamento/.test(l.obs)));

  // ── 6. O dia passa a mostrar as 3, com encerramento em bloco ────────────────────────
  const htmlDia = await montar();
  check('as 3 lojas aparecem no histórico do dia com selo de remoto',
    (htmlDia.match(/💻 Remoto/g) || []).length === 3);
  check('e o texto multi-linha não colapsa numa linha só', /white-space:pre-wrap/.test(htmlDia));
  check('com 3 acompanhamentos abertos, dá pra encerrar todos de uma vez',
    /Encerrar os 3 acompanhamentos remotos/.test(htmlDia));

  escritas.length = 0;
  await page.evaluate((dia) => _visEncerrarRemotosDoDia(dia), DIA);
  await page.waitForTimeout(400);
  const patch = escritas.find(e => e.m === 'PATCH' && /gn_chk_visitas/.test(e.url));
  check('o encerramento em bloco fecha as 3 numa chamada',
    patch && /id=in\.\(1,2,3\)/.test(patch.url) && /hora_saida/.test(patch.body));
  const fechadas = await page.evaluate((dia) => _visCalData.filter(v => v.data === dia && !v.hora_saida).length, DIA);
  check('e nenhuma fica aberta depois', fechadas === 0);

  // ── 7. Presencial não mudou de comportamento ────────────────────────────────────────
  await page.evaluate((dia) => { _visCalData = []; }, DIA);
  await montar();
  escritas.length = 0;
  await page.evaluate((dia) => {
    document.getElementById('visreg-destino-' + dia).value = 'Caxias';
    document.getElementById('visreg-obs-' + dia).value = 'Visita de rotina';
    return _visRegistrarChegada(dia);
  }, DIA);
  await page.waitForTimeout(600);
  const postPres = escritas.find(e => e.m === 'POST' && /gn_chk_visitas/.test(e.url));
  const pres = postPres ? JSON.parse(postPres.body) : [];
  check('presencial grava uma linha só, com o destino do seletor',
    pres.length === 1 && pres[0].loja === 'Caxias' && pres[0].tipo_visita === null);
  check('presencial continua capturando GPS e endereço',
    pres.length === 1 && pres[0].lat === -22.123457 && /Rua de Teste/.test(pres[0].endereco || ''));
  check('e não carrega o campo do remoto na observação',
    pres.length === 1 && !/Feito no dia/.test(pres[0].obs));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
