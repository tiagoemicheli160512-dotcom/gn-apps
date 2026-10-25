// "No app check-list, nas abas check-list e fechamento, temos o item de validade que é um
//  dos mais importantes. Hoje marca e tá tudo certo, porém tenho achado muitos erros nessa
//  parte. Então tô com a ideia de ser obrigatório a foto do setor vistoriado [...] se
//  obrigatório colocar a informação de pelo menos 10 itens, o nome e a data a vencer."
//
// Decidido depois de eu levantar o volume (70 produtos/dia digitados no celular dariam
// lixo com cara de controle): a LISTA FICA de um dia pro outro, com destaque do que vence
// em até 3 dias, e a exigência vale só na aba Check-list.
//
// O que o teste mais cobra: a trava não pode ser contornável, mas também não pode trancar
// a loja por falha de rede.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const hojeISO = new Date().toISOString().slice(0, 10);
const maisDias = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// Lista do salão já cadastrada: 10 itens (o mínimo), um vencido e um vencendo em 2 dias.
const SALAO = Array.from({ length: 10 }, (_, i) => ({
  id: 's' + i, nome: 'Produto ' + i,
  validade: i === 0 ? maisDias(-2) : i === 1 ? maisDias(2) : maisDias(60)
}));

async function abrir(browser, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 430, height: 950 } });
  const gravacoes = [];
  let banco = Object.assign({ salao: SALAO.slice() }, opts.banco || {});
  await ctx.route('**/rest/v1/**', async (r) => {
    const req = r.request(), url = req.url(), m = req.method();
    const json = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    // A primeira gravação de uma área é um POST pra tabela nua — a chave só vem no corpo,
    // não na URL. Por isso o POST é tratado à parte, senão a escrita passaria batida.
    if (/gn_lojas/.test(url) && m === 'POST') {
      if (opts.semRede) return r.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      const b = JSON.parse(req.postData() || '{}');
      const area = (String(b.loja || '').match(/VALIDADES_[A-Z_]+?_([a-z]+)$/) || [])[1];
      if (area) {
        gravacoes.push({ area, itens: (b.all_data || {}).itens || [] });
        banco[area] = (b.all_data || {}).itens || [];
        return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
      }
    }
    if (/gn_lojas/.test(url) && /VALIDADES/.test(url)) {
      if (opts.semRede) return r.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      const area = (decodeURIComponent(url).match(/VALIDADES_[A-Z_]+?_([a-z]+)/) || [])[1];
      if (m === 'GET') return json(banco[area] ? [{ loja: 'x', all_data: { itens: banco[area] } }] : []);
      if (m === 'PATCH') {
        const b = JSON.parse(req.postData() || '{}');
        gravacoes.push({ area, itens: (b.all_data || {}).itens || [] });
        banco[area] = (b.all_data || {}).itens || [];
        return r.fulfill({ status: 204, body: '' });
      }
    }
    return json([]);
  });
  // O Check-list se recarrega uma vez com ?v=<versão> pra furar cache. Semeando a versão
  // antes, ele não recarrega — senão o evaluate seguinte cai no meio da navegação
  // ("Resulting promise was garbage collected").
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  const page = await ctx.newPage();
  const errosPg = [];
  page.on('pageerror', e => { errosPg.push(e.message); console.log('  [pageerror] ' + e.message); });
  // O Check-list carrega o supabase-js de CDN, que o sandbox não alcança de forma
  // confiável; quando essa tag falha, o bloco de script que depende dela aborta. É a mesma
  // razão pela qual os outros testes deste app repetem o goto — convenção do repositório.
  // Também não se espera 'load': o Tailwind vem de CDN e seguraria a espera por ~30s à toa.
  for (let t = 1; ; t++) {
    await page.goto('file://' + CHK);
    try {
      await page.waitForFunction(() => {
        try {
          return typeof _valFalta === 'function' && typeof toggleCheck === 'function'
            && typeof renderCheckGroup === 'function' && state !== undefined;
        } catch (e) { return false; }
      }, { timeout: 12000 });
      break;
    } catch (e) {
      if (t >= 4) { console.log('FALHOU: o Check-list não carregou em 4 tentativas'); falhou++; throw e; }
    }
  }
  await page.waitForTimeout(300);
  return { ctx, page, gravacoes, errosPg, banco: () => banco };
}

// Em passos curtos, esperando pelo ESTADO em vez de segurar um evaluate assíncrono longo
// aberto: um evaluate que fica pendurado enquanto a página ainda carrega acaba descartado
// pelo Playwright ("Resulting promise was garbage collected").
const preparar = async (page, carregado) => {
  await page.evaluate((hoje) => {
    LOJA = 'Bangu';
    state.data = hoje;
    // A trava só liga em 11/10 (semana de adaptação combinada com o dono). Aqui ela é
    // ligada direto, em vez de mexer em hojeLocal() — falsear "hoje" deslocaria também as
    // datas de validade das fixtures, e o teste passaria a medir outra coisa.
    _valTravaAtiva = () => true;
    usuarioLogado = { id: 1, nome: 'Carol', cargo: 'sub_gerente' };
    _valDados = {}; _valFormAberto = {};
  }, hojeISO);
  if (carregado !== false) {
    await page.evaluate(() => { _valCarregarTodas(true); });   // dispara e solta
    await page.waitForFunction(() => {
      try { return VALIDADE_AREAS.every(a => !!_valDados[a.area]); } catch (e) { return false; }
    }, { timeout: 15000 });
  }
  return page.evaluate(() => {
    // Desenha o grupo de verdade: assim as linhas e os painéis existem no DOM, como na loja.
    renderCheckGroup('checklist', SETORES_CHECKLIST, 'checklist-container', 'checklist-count');
    VALIDADE_AREAS.forEach(x => _valRedesenhar(x.area));
    return VALIDADE_AREAS.map(a => ({ area: a.area, setor: a.setor, idx: a.idx, min: a.min }));
  });
};

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const a = await abrir(browser);
  const areas = await preparar(a.page);

  // ── 1. As cinco áreas foram encontradas pelo texto do item ───────────────────────
  check('as 5 áreas de validade existem', areas.length === 5);
  check('e são salão, cozinha, copa, estoque e câmaras',
    areas.map(x => x.area).join(',') === 'salao,cozinha,copa,estoque,camaras');
  check('com os mínimos combinados: 10/20/10/10/20',
    areas.map(x => x.min).join(',') === '10,20,10,10,20');
  check('as câmaras entraram no FIM do estoque, sem mover os índices já salvos',
    (await a.page.evaluate(() => SETORES_CHECKLIST.estoque.items.length - 1)) ===
    areas.find(x => x.area === 'camaras').idx);
  check('e o item de validade do estoque continua no índice de sempre (7)',
    areas.find(x => x.area === 'estoque').idx === 7);

  // ── 2. A trava: não dá pra marcar sem cumprir ────────────────────────────────────
  const semNada = await a.page.evaluate(() => {
    const d = _itemChk('checklist', 'salao', 8);
    d.valFoto = ''; d.valConfEm = '';
    return _valFalta('checklist', 'salao', 8, VALIDADE_AREAS.find(x => x.area === 'salao'));
  });
  check('sem foto e sem confirmação, a trava diz exatamente o que falta',
    semNada.length === 2 && /foto/.test(semNada[0]) && /confirmação/.test(semNada[1]));

  const tentou = await a.page.evaluate(() => {
    const el = { checked: true };
    toggleCheck('checklist', 'salao', 8, el);
    return { checkboxVoltou: el.checked, item: _itemChk('checklist', 'salao', 8).checked };
  });
  check('marcar o visto é recusado, e o quadradinho volta sozinho',
    tentou.checkboxVoltou === false && tentou.item === false);

  // ── 3. Cumprindo as três coisas, marca ───────────────────────────────────────────
  const liberou = await a.page.evaluate((hoje) => {
    const d = _itemChk('checklist', 'salao', 8);
    d.valFoto = 'https://x/foto.jpg'; d.valFotoEm = hoje;
    _valConfirmarDia('checklist', 'salao', 8, 'salao');
    const falta = _valFalta('checklist', 'salao', 8, VALIDADE_AREAS.find(x => x.area === 'salao'));
    const el = { checked: true };
    toggleCheck('checklist', 'salao', 8, el);
    return { falta, marcou: _itemChk('checklist', 'salao', 8).checked,
             por: d.valConfPor, quando: d.valConfEm };
  }, hojeISO);
  check('com foto, lista completa e conferência, não falta mais nada', liberou.falta.length === 0);
  check('e o visto é aceito', liberou.marcou === true);
  check('fica registrado quem confirmou e quando',
    liberou.por === 'Carol' && String(liberou.quando).slice(0, 10) === hojeISO);

  // ── 4. Desmarcar e "não conforme" nunca são travados ────────────────────────────
  // Se a trava pegasse aqui, um item de validade com problema real não teria como ser
  // registrado — a loja ficaria obrigada a mentir pra conseguir seguir.
  const livre = await a.page.evaluate(() => {
    const d = _itemChk('checklist', 'cozinha', 3);
    d.valFoto = ''; d.valConfEm = ''; d.checked = false;
    const el = { checked: false };
    toggleCheck('checklist', 'cozinha', 3, el);
    const desmarcou = _itemChk('checklist', 'cozinha', 3).checked;
    toggleNaoConforme('checklist', 'cozinha', 3);
    return { desmarcou, naoConf: _itemChk('checklist', 'cozinha', 3).naoConforme };
  });
  check('desmarcar segue livre', livre.desmarcou === false);
  check('e marcar "não conforme" também — problema de validade tem que poder ser registrado',
    livre.naoConf === true);

  // ── 5. Foto de ontem não vale pra hoje ──────────────────────────────────────────
  const fotoVelha = await a.page.evaluate((ontem) => {
    const d = _itemChk('checklist', 'salao', 8);
    d.valFoto = 'https://x/ontem.jpg'; d.valFotoEm = ontem;
    d.valConfEm = '';
    return _valFalta('checklist', 'salao', 8, VALIDADE_AREAS.find(x => x.area === 'salao'));
  }, maisDias(-1));
  check('a foto é do DIA: a de ontem não serve', fotoVelha.some(f => /foto/.test(f)));

  const confOntem = await a.page.evaluate((ontem) => {
    const d = _itemChk('checklist', 'salao', 8);
    d.valFoto = 'https://x/f.jpg'; d.valFotoEm = state.data;
    d.valConfEm = ontem + 'T10:00:00';
    return _valFalta('checklist', 'salao', 8, VALIDADE_AREAS.find(x => x.area === 'salao'));
  }, maisDias(-1));
  check('a confirmação também é do dia: a de ontem não vale',
    confOntem.length === 1 && /confirmação/.test(confOntem[0]));

  // ── 6. A lista fica de um dia pro outro (é o ponto da decisão) ──────────────────
  const persiste = await a.page.evaluate(() => _valItens('salao').length);
  check('a lista veio do banco pronta, sem redigitar nada', persiste === 10);

  const cozinhaVazia = await a.page.evaluate(() =>
    _valFalta('checklist', 'cozinha', 3, VALIDADE_AREAS.find(x => x.area === 'cozinha')));
  check('cozinha ainda vazia cobra os 20 produtos, dizendo quanto falta',
    cozinhaVazia.some(f => /20 produtos na lista \(tem 0 de 20\)/.test(f)));

  // ── 7. Vencido e vencendo em até 3 dias ────────────────────────────────────────
  const resumo = await a.page.evaluate(() => _valResumo('salao'));
  check('conta o que já venceu', resumo.vencidos === 1);
  check('e o que vence em até 3 dias', resumo.vencendo === 1);
  const status = await a.page.evaluate(([d0, d3, d4]) => ({
    hoje: _valStatus({ validade: d0 }), tres: _valStatus({ validade: d3 }), quatro: _valStatus({ validade: d4 })
  }), [hojeISO, maisDias(3), maisDias(4)]);
  check('vence hoje conta como vencendo', status.hoje === 'vencendo');
  check('vence em 3 dias ainda conta; em 4 já não', status.tres === 'vencendo' && status.quatro === 'ok');

  // ── 8. Adicionar e remover gravam no banco ─────────────────────────────────────
  const add = await a.page.evaluate(async () => {
    _valFormAberto.cozinha = true;
    _valRedesenhar('cozinha');
    const n = document.getElementById('val-nome-cozinha');
    const dt = document.getElementById('val-data-cozinha');
    if (!n || !dt) return { erro: 'form não desenhou' };
    n.value = 'Creme de leite aberto';
    dt.value = '2026-10-06';
    await _valAdicionar('cozinha');
    return { total: _valItens('cozinha').length, campoLimpo: document.getElementById('val-nome-cozinha').value };
  });
  check('adicionar produto entra na lista', add.total === 1);
  check('e o campo limpa, pra emendar o próximo sem apagar nada', add.campoLimpo === '');
  const gravou = a.gravacoes.filter(g => g.area === 'cozinha').pop();
  check('a lista vai pro banco, na linha daquela área',
    !!gravou && gravou.itens.length === 1 && gravou.itens[0].nome === 'Creme de leite aberto');
  check('guardando quem cadastrou', gravou.itens[0].criado_por === 'Carol');

  const semData = await a.page.evaluate(async () => {
    const antes = _valItens('cozinha').length;
    document.getElementById('val-nome-cozinha').value = 'Sem data';
    document.getElementById('val-data-cozinha').value = '';
    await _valAdicionar('cozinha');
    return _valItens('cozinha').length === antes;
  });
  check('produto sem data de validade não entra', semData === true);

  // ── 9. Cada área grava na SUA linha — uma não apaga a outra ────────────────────
  const areasGravadas = [...new Set(a.gravacoes.map(g => g.area))];
  check('cozinha gravou sem encostar na lista do salão',
    areasGravadas.length === 1 && areasGravadas[0] === 'cozinha' &&
    (await a.page.evaluate(() => _valItens('salao').length)) === 10);
  // ── 9a. Os campos cabem na tela do celular ──────────────────────────────────────
  // Chegou de São Gonçalo: "ao tentar colocar o item, não tá aparecendo nada". O campo do
  // nome estava com 16px e o da lista com ZERO — input[type=date] tem largura mínima
  // própria (uns 260px) e não encolhe, então lado a lado ele comia a linha inteira.
  // Medir de verdade é a única forma de pegar isso: o HTML estava "correto", a tela não.
  const larguras = await a.page.evaluate(() => {
    document.getElementById('app').style.display = 'block';   // sem login a tela fica oculta
    document.querySelectorAll('.tab-content').forEach(e => e.style.display = 'none');
    const tab = document.getElementById('tab-checklist'); if (tab) tab.style.display = 'block';
    _valDados.salao = { itens: [{ id: 'z', nome: 'Molho de pimenta artesanal 500ml', validade: '2026-12-01' }], carregado: true };
    _valFormAberto.salao = true;
    _valRedesenhar('salao');
    const painel = document.getElementById('valpainel-salao');
    const nome = document.getElementById('val-nome-salao');
    const data = document.getElementById('val-data-salao');
    const dataLinha = [...painel.querySelectorAll('input[type=date]')].find(x => x.id !== 'val-data-salao');
    // Acha a folha que contém o nome do produto, seja qual for o arranjo da linha —
    // um seletor por posição mediria o elemento errado no layout antigo e passaria à toa.
    // Procura div E span: o nome virou <span> quando a linha foi rearranjada pra caber a
    // lixeira (ver e2e_validade_excluir), e um seletor só de <div> deixaria de achá-lo e
    // acusaria "0px" sem nada ter encolhido.
    const nomeLinha = [...painel.querySelectorAll('div, span')].find(e =>
      e.children.length === 0 && e.textContent.trim() === 'Molho de pimenta artesanal 500ml');
    const l = e => e ? Math.round(e.getBoundingClientRect().width) : -1;
    return { formNome: l(nome), formData: l(data), linhaNome: l(nomeLinha), linhaData: l(dataLinha),
             painel: l(painel) };
  });
  check('o campo de digitar o nome do produto cabe na tela (estava com 16px)',
    larguras.formNome > 150 && larguras.formNome <= larguras.painel);
  check('o campo de data também', larguras.formData > 150);
  check('e o nome do produto na lista aparece (estava com 0px)',
    larguras.linhaNome > 150);

    // ── 9b. Semana de adaptação: avisa, mas não tranca ──────────────────────────────
  // Montar a lista do zero são 70 produtos por loja. Ligar a trava no mesmo dia do deploy
  // deixaria 11 lojas sem fechar o check-list na primeira noite — o dono deu uma semana.
  const adaptacao = await a.page.evaluate(() => {
    _valTravaAtiva = () => false;          // antes de 11/10
    const d = _itemChk('checklist', 'copa', 6);
    d.valFoto = ''; d.valConfEm = ''; d.checked = false;
    const falta = _valFalta('checklist', 'copa', 6, VALIDADE_AREAS.find(x => x.area === 'copa'));
    const el = { checked: true };
    toggleCheck('checklist', 'copa', 6, el);
    _valRedesenhar('copa');
    const painel = (document.getElementById('valpainel-copa') || {}).innerHTML || '';
    return { falta: falta.length, marcou: _itemChk('checklist', 'copa', 6).checked, painel };
  });
  check('na semana de adaptação o visto passa mesmo faltando coisa',
    adaptacao.falta > 0 && adaptacao.marcou === true);
  check('mas a tela avisa que vai travar, e a partir de quando',
    /Semana de adaptação/.test(adaptacao.painel) && /11\/10/.test(adaptacao.painel));

  const voltou = await a.page.evaluate(() => {
    _valTravaAtiva = () => true;           // de 11/10 em diante
    const d = _itemChk('checklist', 'copa', 6);
    d.checked = false;
    const el = { checked: true };
    toggleCheck('checklist', 'copa', 6, el);
    _valRedesenhar('copa');
    return { marcou: _itemChk('checklist', 'copa', 6).checked,
             painel: (document.getElementById('valpainel-copa') || {}).innerHTML || '' };
  });
  check('passado o prazo, a mesma situação passa a travar', voltou.marcou === false);
  check('e o aviso de adaptação some da tela', !/Semana de adaptação/.test(voltou.painel));

  await a.ctx.close();

  // ── 10. Falha de rede NÃO pode trancar o check-list ───────────────────────────
  // É a checagem mais importante do arquivo: trava que depende do banco e falha fechada
  // deixaria 11 lojas sem conseguir fechar o dia por causa de um blip.
  const off = await abrir(browser, { semRede: true });
  await preparar(off.page);
  const offline = await off.page.evaluate(() => {
    const d = _itemChk('checklist', 'salao', 8);
    d.valFoto = ''; d.valConfEm = '';
    const falta = _valFalta('checklist', 'salao', 8, VALIDADE_AREAS.find(x => x.area === 'salao'));
    const el = { checked: true };
    toggleCheck('checklist', 'salao', 8, el);
    return { falta, marcou: _itemChk('checklist', 'salao', 8).checked,
             painel: (document.getElementById('valpainel-salao') || {}).innerHTML || '' };
  });
  check('banco fora do ar: a exigência fica desligada, não trancada',
    offline.falta.length === 0 && offline.marcou === true);
  check('e a tela diz isso, em vez de ficar muda',
    /exigência fica desligada/.test(offline.painel) && /Tentar de novo/.test(offline.painel));
  await off.ctx.close();

  // ── 11. Texto do produto é texto, nunca HTML ─────────────────────────────────
  const xss = await abrir(browser, { banco: { copa: [
    { id: 'x1', nome: '<img src=x onerror=alert(1)>', validade: '2026-12-01' }] } });
  await preparar(xss.page);
  const limpo = await xss.page.evaluate(() => {
    const def = VALIDADE_AREAS.find(x => x.area === 'copa');
    const html = _valPainelInner('checklist', def);
    const box = document.createElement('div'); box.innerHTML = html;
    return { temImg: !!box.querySelector('img[src="x"]'), escapado: /&lt;img/.test(html) };
  });
  check('nome de produto não vira HTML', limpo.temImg === false && limpo.escapado === true);
  await xss.ctx.close();

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
