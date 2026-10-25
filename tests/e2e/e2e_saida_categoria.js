// "No app caixa, tirar esses itens para selecionar na categoria das saídas. E outra mudança
//  colocar a descrição somente após selecionar uma categoria, pois tem muita loja colocando
//  direto a descrição sem alterar a categoria."
//
// As duas coisas são o mesmo problema: Taxa Cartão era a PRIMEIRA opção do seletor e vinha
// marcada sozinha, então dava pra preencher descrição e valor sem nunca olhar pra categoria.
// São 170 lançamentos em taxa_cartao (R$ 11.521,26), 89 nos últimos 30 dias — boa parte é
// isso.
//
// O que este teste fixa:
//   1. as 5 categorias pedidas saíram do seletor;
//   2. as outras 12 continuam lá;
//   3. nada vem pré-selecionado;
//   4. descrição/valor/"+" só aparecem depois de escolher a categoria;
//   5. sem categoria a saída não entra, nem pelo caminho do botão;
//   6. lançamento ANTIGO com categoria aposentada continua exibindo o nome certo — tirar as
//      chaves de SAIDAS renomearia histórico pra "taxa_cartao" em toda tela.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CX = process.env.ARQ_CX || CAMINHOS.pub('gn-caixa.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const TIRADAS = [['taxa_cartao','Taxa Cartão'], ['gorjeta_garcom','Gorjeta Garçom'],
                 ['entrega_motoboy','Entrega Motoboy'], ['troco','Troco'], ['condominio','Condomínio']];
const MANTIDAS = ['manutencao','material_limpeza','descartavel','alimentacao','estacionamento',
                  'transporte','outros','fruta_verdura','insumo','funcionario_extra','papelaria','agua'];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + CX);
    try {
      await page.waitForFunction(() => {
        try { return typeof addSaida === 'function' && SAIDAS !== undefined; }
        catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) { if (t >= 3) throw e; }
  }

  // Monta o seletor. No arquivo novo é _montarSeletorSaidas(); no antigo a montagem estava
  // solta dentro da abertura do caixa, então aqui ela é reproduzida igual — é o que deixa a
  // contraprova medir COMPORTAMENTO, e não só a ausência da função nova.
  await page.addInitScript(() => {});
  await page.evaluate(() => {
    window._montarSaidasParaTeste = () => {
      if (typeof _montarSeletorSaidas === 'function') return _montarSeletorSaidas();
      const s = document.getElementById('saidaCat');
      s.innerHTML = SAIDAS.map(c => `<option value="${c[0]}">${c[1]}</option>`).join('');
      s.onchange = _syncSaidaJustRow;
      _syncSaidaJustRow();
    };
  });

  // ── Seletor ──────────────────────────────────────────────────────────────────────────
  const sel = await page.evaluate(() => {
    _montarSaidasParaTeste();
    const s = document.getElementById('saidaCat');
    return { valores: [...s.options].map(o => o.value), valorAtual: s.value,
             primeiroTexto: s.options[0] ? s.options[0].textContent : null };
  });
  check('as 5 categorias pedidas saíram do seletor',
    TIRADAS.every(([k]) => !sel.valores.includes(k)));
  check('as outras 12 continuam disponíveis',
    MANTIDAS.every(k => sel.valores.includes(k)) && sel.valores.length === MANTIDAS.length + 1);
  check('nenhuma categoria vem pré-selecionada',
    sel.valorAtual === '' && /selecione/i.test(sel.primeiroTexto || ''));

  // ── Campos só depois da categoria ────────────────────────────────────────────────────
  const gate = await page.evaluate(() => {
    _montarSaidasParaTeste();
    // No arquivo antigo a linha nem tem id — aí não há nada pra esconder, que é exatamente
    // o comportamento que a contraprova precisa registrar como falha.
    const linha = document.getElementById('saidaCamposRow');
    if (!linha) return { semLinha: true };
    const escondidoInicio = linha.classList.contains('hidden');
    document.getElementById('saidaCat').value = 'transporte';
    (typeof _syncSaidaForm === "function" ? _syncSaidaForm : _syncSaidaJustRow)();
    const visivelDepois = !linha.classList.contains('hidden');
    // e o que a loja tinha digitado some se ela voltar pro "Selecione"
    document.getElementById('saidaNome').value = 'uber do gerente';
    document.getElementById('saidaVal').value = '35,00';
    document.getElementById('saidaCat').value = '';
    (typeof _syncSaidaForm === "function" ? _syncSaidaForm : _syncSaidaJustRow)();
    return { escondidoInicio, visivelDepois,
             escondidoDeNovo: linha.classList.contains('hidden'),
             nome: document.getElementById('saidaNome').value,
             valor: document.getElementById('saidaVal').value };
  });
  check('descrição, valor e "+" começam escondidos', gate.escondidoInicio === true);
  check('e aparecem assim que a categoria é escolhida', gate.visivelDepois === true);
  check('voltar pro "Selecione" esconde de novo e limpa o que foi digitado',
    gate.escondidoDeNovo === true && gate.nome === '' && gate.valor === '');

  // ── Sem categoria não entra saída ────────────────────────────────────────────────────
  const semCat = await page.evaluate(async () => {
    _montarSaidasParaTeste();
    S.fech = { id: 'f1', data: '2026-09-27' };
    S.saidas = [];
    let mandou = false, aviso = '';
    const sbReal = window.sb, toastReal = window.toast;
    window.sb = async () => { mandou = true; return [{}]; };
    window.toast = (m) => { aviso = String(m || ''); };
    document.getElementById('saidaCat').value = '';
    document.getElementById('saidaVal').value = '50,00';
    try { await addSaida(); } catch (e) {}
    window.sb = sbReal; window.toast = toastReal;
    return { mandou, aviso, quantasSaidas: S.saidas.length };
  });
  check('sem categoria a saída não é gravada', semCat.mandou === false && semCat.quantasSaidas === 0);
  check('e a loja é avisada do que falta', /categoria/i.test(semCat.aviso));

  // ── Histórico não pode perder o nome ─────────────────────────────────────────────────
  const rotulos = await page.evaluate((tiradas) => {
    // é exatamente a busca que renderFechar() faz pra montar a lista de saídas
    return tiradas.map(([k, esperado]) => {
      const achado = SAIDAS.find(([kk]) => kk === k);
      return { k, esperado, achado: achado ? achado[1] : null };
    });
  }, TIRADAS);
  check('lançamento antigo com categoria aposentada continua com o nome certo',
    rotulos.every(r => r.achado === r.esperado));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
