// "Verificar as bandas, tem que ficar somente a segunda importação, teve alterações."
//
// A limpeza das 94 linhas duplicadas é no banco. Aqui está a outra metade do problema: 4
// apresentações de outubro entraram com cachê R$ 0 porque a grafia da agenda não casava exato
// com a lista TRIOS_CACHES — "Trio ZABELLE" (dois L), "Elcinho Trio Forró Moderno" (sem o "e")
// e "Trio Silvas  do Forro" (espaço duplo). Os nomes são os reais da agenda de outubro.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const PEDIDOS = process.env.ARQ_PEDIDOS || CAMINHOS.pub('gn-pedidos.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 950 } });
  await ctx.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + PEDIDOS);
    try {
      await page.waitForFunction(() => {
        // Espera pelo TRIOS_CACHES, nao pelo S: a funcao e hoisted e o S e declarado bem antes dele
        // no arquivo, entao esperar por eles entrava com o const TRIOS_CACHES ainda em TDZ.
        try { return typeof _triosCacheFor === 'function' && typeof TRIOS_CACHES === 'object' && typeof S === 'object' && S !== null; }
        catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) { if (t >= 3) { console.log('FALHOU: app Pedidos não carregou'); falhou++; break; } }
  }

  // TODAS as grafias que existem em gn_trios_agenda hoje (39, consultadas do banco). A lista caiu
  // de 53 chaves pra 24 + 10 apelidos; se alguma banda real tivesse ficado de fora, uma
  // apresentação passaria a entrar com cachê zero. Esta é a checagem que trava isso.
  const TODAS_DO_BANCO = ["Daniel Guerra","Elcinho  Trio Forró Moderno","Elcinho e Trio Forró Moderno","Elcinho Trio Forró Moderno","Fátima Santos","Íris Pontal","Íris Pontal In Trio","Saulo Andrade","Trio 100% Pé Serra","Trio Alma Brasileira","Trio Amigos do Forro","Trio Amigos do Forró","Trio Amigos Forro","Trio Amigos Forró","Trio D Forro","Trio D Forró","Trio Jacana","Trio Luiz e os Sorrisos","Trio LUZIAH","Trio O Xamego Bom","Trio Peneirado","Trio Remelexo","Trio Rony do Forro","Trio Rony do Forró","Trio Sabia dos Tres Forrozeiros","Trio Sabia dos Três Forrozeiros","Trio Sabiá dos Três Forrozeiros","Trio Silvas  do Forro","Trio Silvas do Forro","Trio Silvas Do Forro","Trio Silvas do Forró","Trio SP Baiao","Trio SP Baião","Trio Taxi Lunar","Trio Táxi Lunar","Trio Trilha do Forro","Trio Trilha do Forró","Trio ZABELÊ","Trio ZABELLE"];
  const semCache = await page.evaluate((nomes) => nomes.filter(n => _triosCacheFor(n) === 0), TODAS_DO_BANCO);
  check(`as ${TODAS_DO_BANCO.length} grafias que existem na agenda real acham cachê`,
    semCache.length === 0 || (console.log('   → sem cachê: ' + semCache.join(' | ')), false));

  // Os 3 casos reais que entraram zerados em outubro
  const zerados = await page.evaluate(() => ({
    zabelle: _triosCacheFor('Trio ZABELLE'),
    elcinhoSemE: _triosCacheFor('Elcinho Trio Forró Moderno'),
    silvasEspacoDuplo: _triosCacheFor('Trio Silvas  do Forro'),
  }));
  check('"Trio ZABELLE" (dois L) acha o cachê de 800', zerados.zabelle === 800);
  check('"Elcinho Trio Forró Moderno" (sem o "e") acha 800', zerados.elcinhoSemE === 800);
  check('"Trio Silvas  do Forro" (espaço duplo) acha 600', zerados.silvasEspacoDuplo === 600);

  // Acento e caixa, que é o motivo de a lista ter tantas variantes repetidas
  const variantes = await page.evaluate(() => ({
    comAcento: _triosCacheFor('Trio Trilha do Forró'),
    semAcento: _triosCacheFor('Trio Trilha do Forro'),
    maiuscula: _triosCacheFor('TRIO TRILHA DO FORRÓ'),
    minuscula: _triosCacheFor('trio trilha do forro'),
    comEspacoSobrando: _triosCacheFor('  Trio Trilha do Forró  '),
  }));
  check('a mesma banda dá o mesmo cachê com acento, sem acento, maiúscula e minúscula',
    Object.values(variantes).every(v => v === 600));

  // Banda que realmente não existe continua dando 0 — a normalização não pode inventar cachê
  const desconhecida = await page.evaluate(() => ({
    inventada: _triosCacheFor('Trio Que Nao Existe'),
    vazio: _triosCacheFor(''),
    nulo: _triosCacheFor(null),
  }));
  check('banda desconhecida continua dando 0 (não inventa cachê)',
    desconhecida.inventada === 0 && desconhecida.vazio === 0 && desconhecida.nulo === 0);

  // Nomes parecidos não podem colidir
  const parecidas = await page.evaluate(() => ({
    trilha: _triosCacheFor('Trio Trilha do Forró'),   // 600
    amigos: _triosCacheFor('Trio Amigos do Forró'),   // 700
    rony: _triosCacheFor('Trio Rony do Forró'),       // 600
    peSerra: _triosCacheFor('Trio 100% Pé Serra'),    // 700
  }));
  check('bandas de nome parecido mantêm cada uma o seu cachê',
    parecidas.trilha === 600 && parecidas.amigos === 700 && parecidas.rony === 600 && parecidas.peSerra === 700);

  // A lista do seletor: uma entrada por banda, não 3 ou 4 variantes da mesma
  const lista = await page.evaluate(() => {
    const nomes = _triosNomesUnicos();
    const normalizados = nomes.map(n => _triosNomeNorm(n));
    return { total: nomes.length, unicos: new Set(normalizados).size,
             apelidos: Object.keys(TRIOS_APELIDOS).length,
             apelidoNaLista: Object.keys(TRIOS_APELIDOS).filter(a => nomes.includes(a)), nomes };
  });
  check(`o seletor não repete banda (${lista.total} bandas)`, lista.total === lista.unicos);
  check(`os ${lista.apelidos} apelidos ficam fora do seletor (${lista.apelidoNaLista.join(' | ') || 'nenhum dentro'})`,
    lista.apelidoNaLista.length === 0);
  check('e todas as bandas da lista continuam com cachê', await page.evaluate(() =>
    _triosNomesUnicos().every(n => _triosCacheFor(n) > 0)));

  // A grafia escolhida tem que ser a apresentável, não a que veio em caixa alta de uma agenda
  const grafia = await page.evaluate(() => {
    const nomes = _triosNomesUnicos();
    return {
      temCapsInteiro: nomes.filter(n => n === n.toUpperCase() && /[A-Z]/.test(n)),
      trilha: nomes.filter(n => /trilha/i.test(n)),
      elcinho: nomes.filter(n => /elcinho/i.test(n)),
      zabele: nomes.filter(n => /zabel/i.test(n)),
    };
  });
  check('nenhum nome do seletor fica em CAIXA ALTA inteira', grafia.temCapsInteiro.length === 0);
  check(`Trilha do Forró aparece uma vez só, com acento (${grafia.trilha.join(' | ')})`,
    grafia.trilha.length === 1 && /Forró/.test(grafia.trilha[0]));
  check(`Elcinho aparece uma vez só, apesar das grafias com e sem o "e" (${grafia.elcinho.join(' | ')})`,
    grafia.elcinho.length === 1);
  check(`ZABELÊ aparece uma vez só, apesar do ZABELLE com dois L (${grafia.zabele.join(' | ')})`,
    grafia.zabele.length === 1);

  // O modal: banda gravada com grafia diferente não pode cair em "+ Outro"
  const modal = await page.evaluate(() => {
    S.lojas = [{ slug_pedido: 'caxias', nome_display: 'Caxias' }];
    _triosNovoModal({ artista: 'Trio Trilha do Forro', loja: 'caxias', data: '2026-10-17' });
    // Pelo id: o primeiro select do modal é o da LOJA, não o do trio.
    const sel = document.getElementById('trio-f-artista-sel');
    const opts = [...sel.querySelectorAll('option')];
    const outro = opts.find(o => o.value === '__outro__');
    return { valorSelecionado: sel ? sel.value : null, outroSelecionado: outro ? outro.selected : null,
             nOpcoes: opts.length };
  });
  // Sem /i a comparação falharia por causa da grafia em caixa alta que existe na lista.
  check('abrindo uma apresentação gravada sem acento, a banda vem selecionada',
    /trilha do forr/i.test(String(modal.valorSelecionado)));
  check('e não cai em "+ Outro (digitar nome)"', modal.outroSelecionado === false);

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
