// "No app rh tem uma das abas que deveria puxar as informações do app check-list aba dados em
//  funcionários, os arquivos de advertência e suspensão, para que o setor possa enviar, porém
//  olhei na aba rh e não achei."
//
// Estava puxando — mas só como miniatura de 24px ao lado do nome, na tabela de Escala, e SÓ
// na semana em que o documento foi anexado. Quem precisava mandar tinha que adivinhar a
// semana. Esta aba é a mesma informação virada do avesso: por pessoa, com todas as semanas.
//
// Os dados do fixture são os reais da base (semanas 29 a 38).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const RH = process.env.ARQ_RH || CAMINHOS.pub('gn-rh.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
// Kauan aparece em 3 semanas diferentes — é o caso que prova o agrupamento por pessoa.
const COMISSOES = [
  { loja: 'SAO_GONCALO', all_data: {
      '31': { funcs: [{ nome: 'Kauan', setor: 'Salão', docs: { SUSPENSAO: IMG } }] },
      '35': { funcs: [{ nome: 'Kauan', setor: 'Salão', docs: { ADVERTENCIA: IMG } },
                      { nome: 'Douglas', setor: 'Cozinha', docs: { ADVERTENCIA: IMG } }] },
      '36': { funcs: [{ nome: 'Kauan', setor: 'Salão', docs: { ADVERTENCIA: IMG } },
                      { nome: 'Marriete', setor: 'Caixa', docs: { SUSPENSAO: IMG, DEMISSAO: IMG } }] },
      'CONFIG': { qualquer: 1 } } },
  { loja: 'PEDREIRA', all_data: {
      '38': { funcs: [{ nome: 'RICARDO ALVES', setor: 'Salão', docs: { SUSPENSAO: IMG } }] },
      '37': { funcs: [{ nome: 'DAVI ALVES', docs: { ADVERTENCIA: IMG } },
                      { nome: 'JESSICA ALVES', docs: { ADVERTENCIA: IMG } }] } } },
  { loja: 'BANGU', all_data: {
      '34': { funcs: [{ nome: 'A.CAROLINA ALVES', docs: { SUSPENSAO: IMG } },
                      { nome: 'Sem documento', docs: {} },
                      { nome: 'Vazio', docs: { ATESTADO: '' } }] } } },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + RH);
    try {
      await page.waitForFunction(() => {
        try { return typeof carregarDocumentos === 'function' && typeof renderDocumentos === 'function' && S !== undefined; }
        catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) {
      // Na contraprova é aqui que se para: a aba inteira é nova, não existe versão anterior
      // do comportamento pra comparar. Sai dizendo isso, em vez de estourar.
      if (t >= 3) {
        console.log('FALHOU: a aba Documentos não existe neste arquivo (é recurso novo — contraprova esperada)');
        console.log('\n0 OK, 12 falhou');
        await browser.close();
        process.exit(1);
      }
    }
  }

  await ctx.route('**/rest/v1/**', async (route) => {
    const url = route.request().url();
    if (url.includes('gn_comissoes')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(COMISSOES) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  const carregar = () => page.evaluate(async () => {
    S.docTipo = ''; S.docLoja = ''; S.docBusca = '';
    await carregarDocumentos();
    renderDocumentos();
    return { total: S.documentos.length, html: document.getElementById('content').innerHTML };
  });

  // Conta esperada derivada do próprio fixture — contar na mão já me fez errar uma vez.
  const esperado = COMISSOES.reduce((tot, row) => tot + Object.entries(row.all_data)
    .filter(([k]) => /^\d+$/.test(k))
    .reduce((a, [, sem]) => a + (sem.funcs || [])
      .reduce((b, f) => b + Object.values(f.docs || {}).filter(Boolean).length, 0), 0), 0);
  const r = await carregar();
  check(`acha os documentos de todas as semanas, não só da atual (${esperado})`,
    r.total === esperado || (console.log('   → veio ' + r.total), false));
  check('ignora chaves que não são semana (CONFIG) e docs vazios',
    !/Sem documento/.test(r.html) && !/Vazio/.test(r.html));
  check('mostra advertência e suspensão, que era o que o RH procurava',
    /Advertência/.test(r.html) && /Suspensão/.test(r.html));
  check('traduz o número da semana em data legível', /29\/09|28\/09|15\/09|08\/09/.test(r.html));
  check('mostra a loja de cada pessoa', /São Gonçalo/.test(r.html) && /Pedreira/.test(r.html));

  // Agrupamento por pessoa — o histórico junto é o que não existia antes
  const kauan = await page.evaluate(() => {
    S.docBusca = 'kauan'; renderDocumentos();
    const h = document.getElementById('content').innerHTML;
    return { html: h, pessoas: (h.match(/docs?<\/span>/g) || []).length };
  });
  check('junta as 3 semanas do Kauan num cartão só da pessoa',
    /Kauan/.test(kauan.html) && /3 docs/.test(kauan.html) && kauan.pessoas === 1);
  check('e a busca por nome filtra o resto', !/Marriete/.test(kauan.html) && !/DAVI/.test(kauan.html));

  const porTipo = await page.evaluate(() => {
    S.docBusca = ''; S.docTipo = 'SUSPENSAO'; renderDocumentos();
    return document.getElementById('content').innerHTML;
  });
  check('filtro por tipo mostra só as suspensões',
    /RICARDO/.test(porTipo) && /Marriete/.test(porTipo) && !/DAVI ALVES/.test(porTipo));

  const porLoja = await page.evaluate(() => {
    S.docTipo = ''; S.docLoja = 'Pedreira'; renderDocumentos();
    return document.getElementById('content').innerHTML;
  });
  check('filtro por loja mostra só a loja escolhida',
    /RICARDO/.test(porLoja) && !/Kauan/.test(porLoja));

  // Modal: abrir, e o texto do WhatsApp com loja e período
  const modal = await page.evaluate(() => {
    S.docLoja = ''; S.docTipo = ''; renderDocumentos();
    const i = S.documentos.findIndex(d => d.nome.includes('RICARDO'));
    _rhVerDoc(i);
    let capturado = null;
    const abrirReal = window.open;
    window.open = (u) => { capturado = decodeURIComponent(String(u).replace('https://wa.me/?text=', '')); return null; };
    const shareReal = navigator.share; try { delete navigator.share; } catch (e) {}
    _wppDocRH();
    window.open = abrirReal; if (shareReal) try { navigator.share = shareReal; } catch (e) {}
    return { modal: _rhDocModal, texto: capturado };
  });
  check('abrir o documento carrega o modal com loja e período',
    modal.modal && modal.modal.loja === 'Pedreira' && /\d{2}\/\d{2}/.test(modal.modal.periodo || ''));
  check('o texto do WhatsApp sai com tipo, pessoa, loja e período',
    /Suspensão/.test(modal.texto || '') && /RICARDO/.test(modal.texto || '')
      && /Pedreira/.test(modal.texto || '') && /\d{2}\/\d{2}/.test(modal.texto || ''));

  const semNada = await page.evaluate(() => {
    S.docBusca = 'zzzznaoexiste'; renderDocumentos();
    return document.getElementById('content').innerHTML;
  });
  check('filtro sem resultado explica, em vez de ficar em branco', /Nenhum documento com esses filtros/.test(semNada));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
