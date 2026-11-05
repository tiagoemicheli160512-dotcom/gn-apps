// "No app check-list, na aba carne, bloquear a aba de entrada, pois é automático
//  atualmente, e a loja preenchendo ainda, gerando um erro."
//
// Combinado: SÓ LEITURA pra loja — ela continua vendo a entrada e o aviso de entrada
// suspeita, só não digita. Mestre/supervisão continuam editando, senão um número errado da
// automação não teria como ser corrigido.
//
// O teste checa os DOIS caminhos de digitação, não o botão: além do "✏️ Editar", a
// calculadora 🧮 do topo da aba Carnes grava direto em ent_<dia> (calcUsarTotal), fora do
// modo edição — é o caminho mais fácil de usar sem perceber, e o mais fácil de esquecer.
// Checar só o botão daria "bloqueado" com o buraco aberto.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

async function abrir(browser) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await ctx.route('**/auth/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + CHK);
    try {
      await page.waitForFunction(() => {
        try { return typeof renderCarnes === "function" && CARNES_DEF && typeof stateWeek === "object"; }
        catch (e) { return false; }
      }, { timeout: 15000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('o Check-list não carregou'); }
  }
  return { ctx, page };
}

// Monta a aba Entrada com dado plantado e devolve o que a tela mostra + o que sobrou
// gravado depois de cada tentativa de escrita.
const cenario = (page, cargo) => page.evaluate((cargo) => {
  usuarioLogado = { id: 7, nome: 'Teste', cargo, loja: 'PEDREIRA' };
  const k1 = CARNES_DEF[0].key, k2 = CARNES_DEF[1].key;
  // k1: entrada normal, igual ao que a automação escreveu.
  // k2: o caso de entrada suspeita — tem que DIFERIR de autoEnt_ (senão veio da automação e
  // gnEntradaCarneSuspeita não suspeita, e com razão) e bater com a contagem do dia. É a
  // digitação antiga que ficou gravada antes deste bloqueio; a loja precisa continuar
  // vendo o aviso dela, que é metade do motivo de a aba seguir visível.
  stateWeek.carnes[k1] = { ent_ter: '18.4', autoEnt_ter: 18.4 };
  stateWeek.carnes[k2] = { ent_ter: '40', autoEnt_ter: 18, ter: '40' };
  carneTabAtiva = 'entradas';
  diaAtivoIdx = 1;                      // terça
  _carneEntradasEditando = false;
  renderCarnes();

  const cont = document.getElementById('carnes-container');
  const txt = (cont.textContent || '').replace(/\s+/g, ' ').trim();
  const out = {
    temBotaoEditar: /✏️ Editar/.test(cont.innerHTML),
    temCadeado: /Não precisa lançar entrada aqui/.test(txt),
    mostraValor: /18[,.]4/.test(txt),
    mostraAvisoSuspeita: /Esta entrada está/.test(txt),
    temAtualizar: /Atualizar do Lojas/.test(cont.innerHTML),
    inputsNaTela: cont.querySelectorAll('input[type=number]').length,
  };

  // Caminho 1: digitação (renderInputTab -> updateCarneCampo)
  updateCarneCampo(k1, 'ent_ter', '999');
  out.depoisDeDigitar = String((stateWeek.carnes[k1] || {}).ent_ter);

  // Caminho 2: calculadora (calcUsarTotal grava direto no stateWeek)
  calcState.carneKey = k1;
  calcState.parcelas = [{ valor: 777 }];
  calcUsarTotal();
  out.depoisDaCalculadora = String((stateWeek.carnes[k1] || {}).ent_ter);

  // Caminho 3: forçar o modo edição na mão (estado que sobrou de outra sessão)
  _carneEntradasEditando = true;
  renderCarnes();
  out.edicaoForcadaAbriu = _carneEntradasEditando === true;
  out.inputsDepoisDeForcar = document.getElementById('carnes-container').querySelectorAll('input[type=number]').length;

  // Caminho 4: a calculadora nem abre
  _carneEntradasEditando = false; renderCarnes();
  openCalcCarne();
  out.modalCalcAberto = document.getElementById('calc-carne-modal').style.display === 'flex';
  closeCalcCarne();

  // E as OUTRAS abas não podem ter sido afetadas — só a Entrada foi pedida
  updateCarneCampo(k1, 'inicial', '12');
  out.inicialAindaGrava = String((stateWeek.carnes[k1] || {}).inicial) === '12';
  updateCarneCampo(k1, 'contagem_final', '13');
  out.contagemAindaGrava = String((stateWeek.carnes[k1] || {}).contagem_final) === '13';
  updateCarneCampo(k1, 'ter', '14');
  out.diarioAindaGrava = String((stateWeek.carnes[k1] || {}).ter) === '14';
  carneTabAtiva = 'contagem'; renderCarnes();
  out.contagem2aTemEditar = /✏️ Editar/.test(document.getElementById('carnes-container').innerHTML);
  return out;
}, cargo);

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  // ── A LOJA: vê, não digita ──────────────────────────────────────────────────────
  const a = await abrir(browser);
  const loja = await cenario(a.page, 'gerente');
  check('a loja não tem mais o botão de editar entrada', loja.temBotaoEditar === false);
  check('e vê no lugar o aviso de que não precisa lançar', loja.temCadeado === true);
  check('a loja CONTINUA vendo a entrada que veio sozinha', loja.mostraValor === true);
  check('e continua vendo o aviso de entrada suspeita', loja.mostraAvisoSuspeita === true);
  check('🔄 Atualizar do Lojas continua lá (é como ela puxa de novo)', loja.temAtualizar === true);
  check('nenhum campo digitável na tela', loja.inputsNaTela === 0);
  check('digitar na mão não grava', loja.depoisDeDigitar === '18.4');
  check('a calculadora não grava na entrada', loja.depoisDaCalculadora === '18.4');
  check('forçar o modo edição não abre', loja.edicaoForcadaAbriu === false && loja.inputsDepoisDeForcar === 0);
  check('a calculadora nem abre na aba Entrada', loja.modalCalcAberto === false);

  // ── O que NÃO foi pedido não pode ter mudado ───────────────────────────────────
  check('aba Início continua gravando', loja.inicialAindaGrava === true);
  check('aba Contagem de 2ª continua gravando', loja.contagemAindaGrava === true);
  check('aba Diário continua gravando', loja.diarioAindaGrava === true);
  check('e a Contagem de 2ª continua com seu botão de editar', loja.contagem2aTemEditar === true);
  await a.ctx.close();

  // ── SUPERVISÃO E MESTRE: a saída pra corrigir a automação ──────────────────────
  for (const cargo of ['supervisor', 'mestre']) {
    const b = await abrir(browser);
    const sup = await cenario(b.page, cargo);
    check(cargo + ' tem o botão de editar', sup.temBotaoEditar === true);
    check(cargo + ' não vê o cadeado', sup.temCadeado === false);
    check(cargo + ' consegue corrigir digitando', sup.depoisDeDigitar === '999');
    check(cargo + ' consegue usar a calculadora', sup.depoisDaCalculadora === '777.000');
    check(cargo + ' abre o modo edição com campos', sup.edicaoForcadaAbriu === true && sup.inputsDepoisDeForcar > 0);
    await b.ctx.close();
  }

  // ── Cargo em MAIÚSCULA não pode escapar do bloqueio ───────────────────────────
  const c = await abrir(browser);
  const caixaAlta = await cenario(c.page, 'GERENTE');
  check('cargo gravado em maiúscula continua bloqueado', caixaAlta.depoisDeDigitar === '18.4');
  const supAlta = await cenario(c.page, 'MESTRE');
  check('e mestre em maiúscula continua liberado', supAlta.depoisDeDigitar === '999');
  await c.ctx.close();

  // ── Sem usuário nenhum (boot antes do login) ──────────────────────────────────
  const d = await abrir(browser);
  const semUser = await d.page.evaluate(() => {
    usuarioLogado = null;
    const k = CARNES_DEF[0].key;
    stateWeek.carnes[k] = { ent_ter: '5' };
    carneTabAtiva = 'entradas'; diaAtivoIdx = 1; renderCarnes();
    updateCarneCampo(k, 'ent_ter', '999');
    return { val: String(stateWeek.carnes[k].ent_ter), quebrou: false };
  });
  check('sem usuário logado, bloqueia (e não quebra a tela)', semUser.val === '5');
  await d.ctx.close();

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
