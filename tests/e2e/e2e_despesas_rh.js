// "No app rh, ter a opção de somar as despesas no app caixa por lojas, o somatório da semana
//  toda, criar uma aba nova só pra essa informação, colocar as despesas individualmente para
//  saber o que foi cada uma com a foto, e o total, com opção de relatório por dia, por
//  semana e por mês."
//
// Aba nova: não havia nada no RH que somasse o dinheiro que sai da gaveta. O número existia
// só dentro do fechamento de cada turno, um por um.
//
// O fixture copia a FORMA dos dados reais, e três coisas medidas na base mandaram no
// desenho da tela:
//
// 1. `descricao` está VAZIA em 1.152 de 1.152 lançamentos de Out/26 — o app Caixa não a
//    preenche. O que diz o que a saída foi está em `nome`. Ler descricao seria somar certo
//    e não dizer nada.
// 2. "outros" é 44% do dinheiro (R$ 40.137 de R$ 80.322 em Out/26) — a categoria que não
//    informa nada. A tela mostra a quebra por categoria pra isso ficar visível.
// 3. A foto virou regra no meio do caminho: 0 de 1.018 em Ago/26, 396 de 1.077 em Set,
//    1.152 de 1.152 em Out. Lançamento velho não ganha foto depois, então a lista tem que
//    conviver com os dois casos em vez de supor que a foto está lá.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const RH = process.env.ARQ_RH || CAMINHOS.pub('gn-rh.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (!c && extra !== undefined ? ' >> ' + String(extra).slice(0, 300) : '')); c ? ok++ : falhou++; };

const IMG = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
// Hoje fixo: quinta 05/11/2026. A semana é 02/11 (segunda) a 08/11 (domingo), e o mês
// inteiro é 01/11 a 30/11 — os três recortes do pedido.
const HOJE = '2026-11-05';

// Molde do que vem do banco: a DATA mora no fechamento, não na despesa. Guarulhos tem a
// forma do caso real da semana (quase tudo em "outros"); Bangu tem lançamento sem nome e
// sem foto, que é o de Agosto; Caxias tem uma despesa só, pra provar o singular.
const FECH = [
  { loja: 'GUARULHOS', data: '2026-11-03', turno: 'Almoço', gn_caixa_despesa: [
      { categoria: 'outros', nome: 'Compra de gás', valor: 900, foto: IMG, justificativa: '', paga_dinheiro: true },
      { categoria: 'outros', nome: 'Reparo da câmara', valor: 500, foto: IMG, justificativa: 'urgente', paga_dinheiro: true },
      { categoria: 'transporte', nome: 'Uber do fechamento', valor: 60, foto: IMG, justificativa: '', paga_dinheiro: true } ] },
  { loja: 'GUARULHOS', data: '2026-11-04', turno: 'Jantar', gn_caixa_despesa: [
      { categoria: 'alimentacao', nome: 'Marmita da equipe', valor: 40, foto: IMG, justificativa: '', paga_dinheiro: true } ] },
  { loja: 'BANGU', data: '2026-11-02', turno: 'Almoço', gn_caixa_despesa: [
      { categoria: 'papelaria', nome: '', valor: 120, foto: null, justificativa: '', paga_dinheiro: true },
      { categoria: 'transporte', nome: 'Van da carne', valor: 180, foto: IMG, justificativa: '', paga_dinheiro: true },
      // Sem nome, mas a justificativa diz o que foi. MEDIDO: 78 dos 244 lançamentos sem
      // nome desde 01/10 são assim — a informação existe, só está no outro campo.
      { categoria: 'funcionario_extra', nome: null, valor: 100, foto: IMG,
        justificativa: 'Teve 2 faltas hj no salão', paga_dinheiro: true } ] },
  { loja: 'CAXIAS', data: '2026-11-05', turno: 'Jantar', gn_caixa_despesa: [
      { categoria: 'agua', nome: 'Galão de água', valor: 25, foto: IMG, justificativa: '', paga_dinheiro: true } ] },
  // Dia de outro mês em que "outros" existe mas pesa pouco (10 de 110 = 9%): é o caso que
  // separa "avisa quando pesa" de "avisa sempre que aparece".
  { loja: 'ITAQUERA', data: '2026-10-29', turno: 'Almoço', gn_caixa_despesa: [
      { categoria: 'outros', nome: 'Pilha do relógio', valor: 10, foto: IMG, justificativa: '', paga_dinheiro: true },
      { categoria: 'transporte', nome: 'Táxi do depósito', valor: 100, foto: IMG, justificativa: '', paga_dinheiro: true } ] },
  // Fora da semana, dentro do mês: só aparece no recorte de mês.
  { loja: 'PEDREIRA', data: '2026-11-01', turno: 'Almoço', gn_caixa_despesa: [
      { categoria: 'manutencao', nome: 'Troca de lâmpada', valor: 70, foto: IMG, justificativa: '', paga_dinheiro: true } ] },
];
// Contas tiradas do fixture, não da minha cabeça — somar na mão já me fez errar antes.
const SOMA = (rows, filtro) => rows.filter(filtro || (() => true))
  .reduce((t, f) => t + f.gn_caixa_despesa.reduce((a, d) => a + d.valor, 0), 0);
const NA_SEMANA = f => f.data >= '2026-11-02' && f.data <= '2026-11-08';
const NO_DIA    = f => f.data === HOJE;
const NO_MES    = f => f.data >= '2026-11-01' && f.data <= '2026-11-30';
const T_SEMANA = SOMA(FECH, NA_SEMANA);   // 1.825
const T_DIA    = SOMA(FECH, NO_DIA);      // 25
const T_MES    = SOMA(FECH, NO_MES);      // 1.895
const T_GUARU  = SOMA(FECH, f => f.loja === 'GUARULHOS');  // 1.500
const T_BANGU  = SOMA(FECH, f => f.loja === 'BANGU');      // 300
const N_SEMANA = FECH.filter(NA_SEMANA).reduce((t, f) => t + f.gn_caixa_despesa.length, 0);
const brl = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1100, height: 1000 } });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message)));

  // Guarda as URLs pedidas: é como se prova QUAL janela de datas cada recorte foi buscar.
  const pedidos = [];
  await ctx.route('**/rest/v1/**', async route => {
    const url = route.request().url();
    if (url.includes('gn_caixa_fechamento')) {
      pedidos.push(decodeURIComponent(url));
      const m = /data=gte\.([\d-]+)/.exec(url), n = /data=lte\.([\d-]+)/.exec(url);
      const de = m ? m[1] : '0000-00-00', ate = n ? n[1] : '9999-99-99';
      const rows = FECH.filter(f => f.data >= de && f.data <= ate);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  for (let t = 1; ; t++) {
    await page.goto('file://' + RH);
    try {
      await page.waitForFunction(() => {
        try { return typeof carregarDespesas === 'function' && typeof renderDespesas === 'function'
                  && typeof _despRelatorioTexto === 'function' && S !== undefined; } catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) {
      // Contraprova: a aba inteira é nova, não existe versão anterior pra comparar. Sai
      // dizendo isso em vez de estourar com erro de harness.
      if (t >= 3) {
        console.log('FALHOU: a aba Despesas não existe neste arquivo (é recurso novo — contraprova esperada)');
        console.log('\n0 OK, 36 falhou');
        await browser.close(); process.exit(1);
      }
    }
  }

  const abrir = (mode) => page.evaluate(async ({ mode, hoje }) => {
    const [y, m, d] = hoje.split('-').map(Number);
    S.despMode = mode;
    S.despData = new Date(y, m - 1, d, 12, 0, 0, 0);
    S.despAberta = new Set();
    await carregarDespesas();
    renderDespesas();
    return {
      html: document.getElementById('content').innerHTML,
      n: (S.despLista || []).length,
      ini: S.despIni, fim: S.despFim,
      wpp: _despRelatorioTexto(true).msg,
      pdf: _despRelatorioTexto(false).msg,
      titulo: _despRelatorioTexto(false).titulo,
    };
  }, { mode, hoje: HOJE });

  // ── 1. Os três recortes do pedido buscam a janela certa ────────────────────────────────
  const dia = await abrir('dia');
  check('recorte Dia busca só o dia de hoje', dia.ini === HOJE && dia.fim === HOJE, dia.ini + '..' + dia.fim);
  const sem = await abrir('sem');
  check('recorte Semana busca segunda a domingo (02/11 a 08/11)',
    sem.ini === '2026-11-02' && sem.fim === '2026-11-08', sem.ini + '..' + sem.fim);
  const mes = await abrir('mes');
  check('recorte Mês busca o mês inteiro (01/11 a 30/11)',
    mes.ini === '2026-11-01' && mes.fim === '2026-11-30', mes.ini + '..' + mes.fim);

  // ── 2. Os totais ──────────────────────────────────────────────────────────────────────
  check(`a semana toda soma R$ ${brl(T_SEMANA)}`, sem.html.includes('R$ ' + brl(T_SEMANA)), sem.html.slice(0, 200));
  check(`o dia soma R$ ${brl(T_DIA)} (só o lançamento de hoje)`,
    dia.n === 1 && dia.html.includes('R$ ' + brl(T_DIA)), dia.n);
  check(`o mês soma R$ ${brl(T_MES)} — pega o 01/11, que a semana não pega`,
    mes.html.includes('R$ ' + brl(T_MES)) && mes.n === sem.n + 1, mes.n + ' vs ' + sem.n);
  check(`conta os ${N_SEMANA} lançamentos da semana`, sem.n === N_SEMANA && sem.html.includes(String(N_SEMANA)), sem.n);

  // ── 3. Por loja, e a maior primeiro ───────────────────────────────────────────────────
  check(`soma por loja: Guarulhos R$ ${brl(T_GUARU)} e Bangu R$ ${brl(T_BANGU)}`,
    sem.html.includes('R$ ' + brl(T_GUARU)) && sem.html.includes('R$ ' + brl(T_BANGU)));
  const ordem = ['Guarulhos', 'Bangu', 'Caxias'].map(n => sem.html.indexOf('>' + n + '<'));
  check('a loja que mais gastou vem primeiro', ordem.every(i => i >= 0) && ordem[0] < ordem[1] && ordem[1] < ordem[2], JSON.stringify(ordem));
  check('a loja fora do recorte não entra', !sem.html.includes('>Pedreira<') && mes.html.includes('>Pedreira<'));

  // ── 4. A quebra por categoria, que é o que responde "no que foi" ──────────────────────
  check('mostra a quebra por categoria com o nome legível, não a chave crua',
    /Transporte/.test(sem.html) && /Alimentação Equipe/.test(sem.html) && !/>outros</.test(sem.html));
  check('soma a categoria entre lojas (transporte: 60 + 180)', sem.html.includes('R$ ' + brl(240)));
  const ordemCat = ['outros', 'transporte', 'alimentacao'].map(c => sem.html.indexOf('data-cat="' + c + '"'));
  check('a categoria que mais pesa vem primeiro na quebra',
    ordemCat.every(i => i >= 0) && ordemCat[0] < ordemCat[1] && ordemCat[1] < ordemCat[2], JSON.stringify(ordemCat));
  check('diz o quanto cada categoria pesa no total',
    sem.html.includes(Math.round(1400 / T_SEMANA * 100) + '%'), String(Math.round(1400 / T_SEMANA * 100)));

  // ── 5. O aviso do "Outros" ────────────────────────────────────────────────────────────
  // Medido: 44% do dinheiro da rede sai sem dizer o que é. O aviso só vale quando pesa de
  // verdade — na semana "outros" é 1.400 de 1.825 (77%), no dia é zero.
  check('avisa quando "Outros" passa de um terço do período', /saiu como "Outros"/.test(sem.html));
  check('e não avisa quando não tem "Outros" no período', !/saiu como "Outros"/.test(dia.html));
  const leve = await page.evaluate(async () => {
    S.despMode = 'dia'; S.despData = new Date(2026, 9, 29, 12, 0, 0, 0);
    await carregarDespesas(); renderDespesas();
    return document.getElementById('content').innerHTML;
  });
  check('"Outros" presente mas leve (10 de 110) aparece na quebra e NÃO vira aviso',
    /data-cat="outros"/.test(leve) && !/saiu como "Outros"/.test(leve));

  // ── 6. Cada despesa, uma a uma — com o que ela foi e com a foto ───────────────────────
  await abrir('sem');   // volta pra semana: os passos acima renderizaram outros recortes
  const aberta = await page.evaluate(() => {
    despToggleLoja('GUARULHOS');
    return document.getElementById('content').innerHTML;
  });
  check('abre a lista individual da loja', /Compra de gás/.test(aberta) && /Reparo da câmara/.test(aberta));
  check('diz o que cada uma foi lendo `nome` (descricao vem vazia do Caixa)',
    /Uber do fechamento/.test(aberta) && /Marmita da equipe/.test(aberta));
  check('mostra o valor de cada lançamento, não só o total da loja',
    aberta.includes('R$ ' + brl(900)) && aberta.includes('R$ ' + brl(60)));
  check('mostra a data de cada lançamento', /03\/11/.test(aberta) && /04\/11/.test(aberta));
  check('mostra a foto do comprovante', (aberta.match(/<img[^>]+data:image\/gif/g) || []).length >= 3);
  check('a maior saída do dia vem antes da menor',
    aberta.indexOf('Compra de gás') < aberta.indexOf('Uber do fechamento'));

  // ── 7. Os dois buracos reais dos dados ────────────────────────────────────────────────
  const bangu = await page.evaluate(() => {
    despToggleLoja('GUARULHOS'); despToggleLoja('BANGU');
    return document.getElementById('content').innerHTML;
  });
  check('lançamento sem descrição não vira linha muda: diz "sem descrição" na própria linha',
    /sem descrição<\/i>/.test(bangu));
  check('lançamento sem foto diz "sem foto" em vez de mostrar imagem quebrada',
    /sem<br>foto/.test(bangu) && !/<img[^>]+src="null"/.test(bangu));
  check('e o cartão da loja avisa quantos estão sem descrição/sem foto',
    /1 sem descrição/.test(bangu) && /1 sem foto/.test(bangu));
  // Sem nome, mas com justificativa: mostra a justificativa em vez de dizer "sem descrição",
  // e não entra na contagem de mudos — a informação está lá, só em outro campo.
  check('sem nome mas com justificativa: mostra a justificativa como descrição',
    /Teve 2 faltas hj no salão/.test(bangu) &&
    (bangu.match(/Teve 2 faltas hj no salão/g) || []).length === 1 &&
    !/2 sem descrição/.test(bangu), (bangu.match(/Teve 2 faltas hj no salão/g) || []).length);

  // ── 8. Relatório por dia, por semana e por mês ────────────────────────────────────────
  check('o relatório do WhatsApp leva o total e a quebra por categoria',
    sem.wpp.includes('R$ ' + brl(T_SEMANA)) && /Transporte: R\$/.test(sem.wpp) && /Guarulhos/.test(sem.wpp), sem.wpp.slice(0, 160));
  check('o relatório do PDF leva lançamento por lançamento, com o que foi',
    /Compra de gás/.test(sem.pdf) && /Galão de água/.test(sem.pdf) && /Van da carne/.test(sem.pdf));
  check('o relatório diz de que período é', /02\/11 a 08\/11/.test(sem.wpp) && /novembro/i.test(mes.wpp) && /05\/11\/2026/.test(dia.wpp));
  check('o relatório do dia só traz o dia', /Galão de água/.test(dia.pdf) && !/Compra de gás/.test(dia.pdf));

  // ── 9. Período sem nada e período do futuro ───────────────────────────────────────────
  const vazio = await page.evaluate(async () => {
    S.despMode = 'dia'; S.despData = new Date(2026, 0, 7, 12, 0, 0, 0);
    await carregarDespesas(); renderDespesas();
    return { html: document.getElementById('content').innerHTML, n: (S.despLista || []).length,
             wpp: _despRelatorioTexto(true).msg };
  });
  check('período sem lançamento não quebra: diz que não teve despesa',
    vazio.n === 0 && /Nenhuma despesa/.test(vazio.html) && /Nenhuma despesa/.test(vazio.wpp));
  const trava = await page.evaluate(async () => {
    // HOJE de verdade, não uma data fixa: com "05/11/2026" cravado, a checagem passou a
    // falhar sozinha na virada pra 06/11 (UTC), na main e em todo PR aberto — a trava é
    // "não passar de hoje", e hoje muda.
    const h = new Date();
    S.despMode = 'dia'; S.despData = new Date(h.getFullYear(), h.getMonth(), h.getDate(), 12, 0, 0, 0);
    await carregarDespesas(); renderDespesas();
    return document.getElementById('content').innerHTML;
  });
  check('não deixa navegar pra depois de hoje', /disabled/.test(trava));

  check('pediu ao banco só os fechamentos QUE TÊM despesa (!inner), não todos',
    pedidos.length > 0 && pedidos.every(u => u.includes('gn_caixa_despesa!inner')), pedidos[0]);
  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
