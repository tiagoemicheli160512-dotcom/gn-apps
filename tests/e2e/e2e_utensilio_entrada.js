// "Quero no app home lojas, na aba utens, colocar a opção de dar entrada em utensílios pela
//  loja, com assinatura de quem deu entrada, e somar a quantidade em estoque, pois hoje seria
//  pela aba manutenção, mas nem sempre chega por lá, às vezes a própria loja compra."
//  (16/11/2026)
//
// Cobra: o botão 📥 Entrada existe (e não na Maglia, que não foi citada); a entrada SOMA no
// saldo; exige assinatura (nome+senha conferidos no verificar_login, usuário da loja ou
// GERAL); senha errada não grava nada; a entrada fica no histórico da peça com quem assinou;
// peça fora do controle abre a linha com o que chegou; não cria manutenção.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const fs = require('fs');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const SB_LIB = fs.readFileSync('' + CAMINHOS.fix('supabase.min.js') + '', 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (extra !== undefined && !c ? '  → ' + String(extra).slice(0, 400) : '')); c ? ok++ : falhou++; };

const USUARIOS = {
  'Carla:certa': { nome: 'Carla', cargo: 'auxiliar', loja: 'BANGU' },
  'Super:certa': { nome: 'Super', cargo: 'supervisor', loja: 'GERAL' },
  'Outra:certa': { nome: 'Outra', cargo: 'gerente', loja: 'CAXIAS' },
};

async function abrir(browser, saldoInicial) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const escritas = [];
  let saldo = JSON.parse(JSON.stringify(saldoInicial || {}));
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: SB_LIB }));
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request(), url = req.url(), m = req.method();
    const aceita = String((req.headers() || {})['accept'] || '');
    if (/rpc\/verificar_login/.test(url)) {
      const b = (() => { try { return JSON.parse(req.postData() || '{}'); } catch (e) { return {}; } })();
      const u = USUARIOS[b.p_nome + ':' + b.p_senha];
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(u ? [u] : []) });
    }
    if (m !== 'GET') {
      let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) {}
      escritas.push({ m, tabela: url.split('/rest/v1/')[1].split('?')[0], body });
      if (/gn_lojas/.test(url) && body && body.all_data && body.all_data.utensilios_saldo) saldo = body.all_data.utensilios_saldo;
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (/gn_lojas/.test(url)) {
      const linha = { all_data: { utensilios_saldo: saldo } };
      return r.fulfill({ status: 200, contentType: aceita.includes('pgrst.object') ? 'application/vnd.pgrst.object+json' : 'application/json',
        body: JSON.stringify(aceita.includes('pgrst.object') ? linha : [linha]) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.addInitScript(() => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('gn_session_v1', JSON.stringify({ id: 7, nome: 'Bangu Loja', cargo: 'gerente', loja: 'BANGU', permissoes: { checklist: true }, ts: Date.now() }));
    localStorage.setItem('gn_nav_loja', JSON.stringify({ loja: 'BANGU', ts: Date.now() }));
  });
  await page.goto('file://' + CHK);
  await page.waitForFunction(() => { try { return typeof renderUtensilios === 'function' && typeof switchTab === 'function'; } catch (e) { return false; } }, { timeout: 30000 });
  return { ctx, page, escritas, erros, saldoAgora: () => saldo };
}
const preparar = (page, loja) => page.evaluate(async (loja) => {
  LOJA = loja || 'Bangu';
  usuarioLogado = { nome: 'Bangu Loja', cargo: 'gerente' };
  switchTab('utensilios', document.getElementById('tab-btn-utensilios'));
  await carregarManutOficial();
  renderUtensilios();
}, loja);
const darEntrada = (page, campos) => page.evaluate(async (c) => {
  abrirEntradaUtensilio();
  Object.entries(c).forEach(([k, v]) => _utensEntradaSet(k, v));
  await _utensEntradaSalvar();
  await new Promise(r => setTimeout(r, 300));
  return { aberto: !!_utensEntrada, reg: _utensilioDe(c.nome) };
}, campos);

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const todosErros = [];
  if (true) {
    const a = await abrir(browser, { 'copo de chopp': { nome: 'Copo de chopp', qtd: 30, inicial: 40, contado: true } });
    await preparar(a.page);
    const existe = await a.page.evaluate(() => typeof abrirEntradaUtensilio === 'function');
    if (!existe) { console.log('FALHOU: a entrada de utensílios não existe neste arquivo (contraprova esperada — é nova)'); console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1); }

    const ui = await a.page.evaluate(() => {
      const b = document.getElementById('utens-btn-entrada');
      abrirEntradaUtensilio();
      const f = document.getElementById('utens-entrada');
      return { botao: !!b && b.style.display !== 'none' && /Entrada/.test(b.textContent),
               campos: ['utens-entrada-nome', 'utens-entrada-qtd', 'utens-entrada-origem', 'utens-entrada-ass-nome', 'utens-entrada-ass-senha'].every(id => !!document.getElementById(id)),
               senhaTipo: (document.getElementById('utens-entrada-ass-senha') || {}).type,
               txt: f ? f.innerText : '', btnOk: (document.getElementById('utens-entrada-ok') || {}).disabled };
    });
    check('a aba Utensílios tem o botão 📥 Entrada', ui.botao);
    check('o formulário pede peça, quantidade, origem e a assinatura (nome + senha)', ui.campos && ui.senhaTipo === 'password', JSON.stringify(ui));
    check('…diz que soma no saldo', /soma no saldo/.test(ui.txt), ui.txt);
    check('…e o botão fica travado enquanto falta algo', ui.btnOk === true);
    await a.page.evaluate(() => _utensEntradaCancelar());

    // Sem assinatura não grava.
    const semAss = await a.page.evaluate(async () => {
      abrirEntradaUtensilio(); _utensEntradaSet('nome', 'Copo de chopp'); _utensEntradaSet('qtd', '24');
      const falta = _utensEntradaFalta(); await _utensEntradaSalvar(); _utensEntradaCancelar(); return falta;
    });
    check('sem assinatura não dá entrada (pede nome e senha de quem recebeu)', /assinatura/.test(semAss) && !a.escritas.some(e => /gn_lojas/.test(e.tabela)), semAss);

    // Senha errada não grava.
    const errada = await darEntrada(a.page, { nome: 'Copo de chopp', qtd: '24', assNome: 'Carla', assSenha: 'errada' });
    check('senha errada: nada é gravado e o saldo segue 30', !a.escritas.some(e => /gn_lojas/.test(e.tabela)) && a.saldoAgora()['copo de chopp'].qtd === 30 && errada.aberto, JSON.stringify(a.saldoAgora()));
    await a.page.evaluate(() => _utensEntradaCancelar());

    // Usuário de outra loja não assina.
    await darEntrada(a.page, { nome: 'Copo de chopp', qtd: '24', assNome: 'Outra', assSenha: 'certa' });
    check('usuário de OUTRA loja não assina a entrada desta', !a.escritas.some(e => /gn_lojas/.test(e.tabela)) && a.saldoAgora()['copo de chopp'].qtd === 30);
    await a.page.evaluate(() => _utensEntradaCancelar());

    // Certa: soma.
    const manutAntes = await a.page.evaluate(() => (state.manutencao || []).length);
    const r = await darEntrada(a.page, { nome: 'copo de CHOPP ', qtd: '24', origem: 'Compra da loja', obs: 'nota 1234', assNome: 'Carla', assSenha: 'certa' });
    const s = a.saldoAgora()['copo de chopp'];
    check('assinatura certa: SOMA no saldo (30 + 24 = 54), na mesma peça mesmo escrita diferente', s && s.qtd === 54 && Object.keys(a.saldoAgora()).length === 1, JSON.stringify(a.saldoAgora()));
    const ent = s && s.entradas && s.entradas[s.entradas.length - 1];
    check('a entrada fica no histórico da peça: quantas, origem, observação, quem assinou e quem estava logado',
      ent && ent.qtd === 24 && ent.origem === 'Compra da loja' && ent.obs === 'nota 1234' && ent.assinado_por === 'Carla' && ent.registrado_por === 'Bangu Loja' && !!ent.em, JSON.stringify(ent));
    check('…sem mexer no inicial nem marcar como corrigido (entrada não é correção)', s.inicial === 40 && !s.corrigido);
    check('não cria manutenção', (await a.page.evaluate(() => (state.manutencao || []).length)) === manutAntes);
    check('o formulário fecha', r.aberto === false);
    const linhaSaldo = await a.page.evaluate(() => (document.querySelector('.utens-ult-entrada') || {}).textContent || '');
    check('a linha da peça no controle mostra a última entrada e quem assinou', /\+24/.test(linhaSaldo) && /Carla/.test(linhaSaldo), linhaSaldo);

    // Segunda entrada (supervisor GERAL assina): soma de novo e acumula histórico.
    await darEntrada(a.page, { nome: 'Copo de chopp', qtd: '6', assNome: 'Super', assSenha: 'certa' });
    const s2 = a.saldoAgora()['copo de chopp'];
    check('segunda entrada soma de novo (60) e o histórico guarda as duas', s2.qtd === 60 && s2.entradas.length === 2 && s2.entradas[1].assinado_por === 'Super', JSON.stringify(s2));

    // Peça nova: abre a linha com o que chegou.
    await darEntrada(a.page, { nome: 'Prato fundo', qtd: '12', assNome: 'Carla', assSenha: 'certa' });
    const pf = a.saldoAgora()['prato fundo'];
    check('peça fora do controle: a entrada abre o saldo com o que chegou (12), marcada como aberta por entrada', pf && pf.qtd === 12 && pf.aberto_por_entrada === true && pf.entradas.length === 1, JSON.stringify(pf));

    // Auditoria.
    check('a entrada vai pra auditoria', a.escritas.some(e => /auditoria/i.test(e.tabela) && JSON.stringify(e.body || '').includes('ENTRADA_UTENSILIO')), JSON.stringify(a.escritas.map(e => e.tabela)));
    todosErros.push(...a.erros); await a.ctx.close();
  }

  // Maglia: não citada no pedido → sem o botão.
  {
    const a = await abrir(browser, {});
    await preparar(a.page, 'Maglia');
    const m = await a.page.evaluate(() => {
      abrirEntradaUtensilio();
      const b = document.getElementById('utens-btn-entrada');
      return { escondido: !!b && b.style.display === 'none', abriu: !!_utensEntrada };
    });
    check('Maglia (não citada): sem o botão de Entrada', m.escondido && !m.abriu, JSON.stringify(m));
    todosErros.push(...a.erros); await a.ctx.close();
  }

  check('nenhum erro de JavaScript', todosErros.length === 0, todosErros.join(' | '));
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
