// "Preciso trazer também para o painel de gestão o pagamento de funcionário extra, do app
//  caixa. No mesmo modelo."
//
// O extra é despesa de caixa (gn_caixa_despesa, categoria `funcionario_extra`) e aparecia na
// rede toda só dentro do card "Desempenho do mês anterior", uma loja por vez e sem comparação
// com ninguém. O que a aba acrescenta é a PROPORÇÃO DA VENDA: em Out/26 a Campo Grande é a
// terceira em reais (R$ 4.068) e a primeira em proporção (2,45% contra 0,57% da rede), porque
// é a loja que vende menos. Comparar pelo valor esconde exatamente esse caso.
//
// Esta suíte cobra o que pode dar número errado sem ninguém ver: o filtro da categoria, a
// soma por loja com a chave certa, a proporção com o faturamento do MESMO mês, o agrupamento
// por nome (com variação de caixa e espaço), a contagem do que não diz quem recebeu, o nome
// que se repete, a Maglia de fora e a navegação de mês.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (!c && extra ? ' >> ' + extra : '')); c ? ok++ : falhou++; };

const HOJE = '2026-10-15';
const JUST = 'cobertura da folga da Ana no salao';   // passa dos 10 caracteres
const FOTO = 'https://exemplo/foto.jpg';

// Fechamentos por data. `loja` aqui é a chave do Caixa (userKey), como está no banco.
const FECHAMENTOS = [
  // Bangu: a Talita em quatro datas, com variação de caixa, espaço e ACENTO no nome — é a
  // mesma pessoa e tem que virar UMA linha. Mais um lançamento sem nome e uma despesa de OUTRA
  // categoria no mesmo fechamento, que não pode entrar na conta.
  { loja: 'BANGU', data: '2026-10-03', gn_caixa_despesa: [
    { categoria: 'funcionario_extra', valor: 100, nome: 'Talita', justificativa: JUST, foto: FOTO },
    { categoria: 'funcionario_extra', valor: 100, nome: '',       justificativa: JUST, foto: FOTO },
    { categoria: 'manutencao',        valor: 5000, nome: '',      justificativa: '',   foto: null },
  ] },
  { loja: 'BANGU', data: '2026-10-10', gn_caixa_despesa: [
    { categoria: 'funcionario_extra', valor: 100, nome: 'Talita', justificativa: JUST, foto: FOTO } ] },
  { loja: 'BANGU', data: '2026-10-17', gn_caixa_despesa: [
    { categoria: 'funcionario_extra', valor: 100, nome: ' TALITÁ ', justificativa: JUST, foto: FOTO } ] },
  { loja: 'BANGU', data: '2026-10-24', gn_caixa_despesa: [
    { categoria: 'funcionario_extra', valor: 200, nome: 'Talita', justificativa: JUST, foto: FOTO } ] },
  // Caxias: os QUATRO sem nome, um sem justificativa (lançado antes da trava do Caixa) e um
  // sem foto. Os quatro no mesmo dia: "dias com extra" é 1, não 4. E quatro é o limite de
  // repetição — se "sem nome" contasse como nome, ele viraria alerta de pessoa fixa aqui.
  { loja: 'CAXIAS', data: '2026-10-05', gn_caixa_despesa: [
    { categoria: 'funcionario_extra', valor: 250, nome: '', justificativa: 'x',  foto: FOTO },
    { categoria: 'funcionario_extra', valor: 250, nome: '', justificativa: JUST, foto: null },
    { categoria: 'funcionario_extra', valor: 250, nome: '', justificativa: JUST, foto: FOTO },
    { categoria: 'funcionario_extra', valor: 250, nome: '', justificativa: JUST, foto: FOTO },
  ] },
  // Campo Grande: vende pouco e gasta muito — o caso que só a proporção mostra.
  { loja: 'CAMPO GRANDE', data: '2026-10-09', gn_caixa_despesa: [
    { categoria: 'funcionario_extra', valor: 3000, nome: 'Fulano de Tal', justificativa: JUST, foto: FOTO } ] },
  // Boulevard: tem extra e NÃO tem faturamento lançado — a proporção não existe, e dizer 0%
  // seria mentir pro lado que interessa.
  { loja: 'BOULEVARD', data: '2026-10-11', gn_caixa_despesa: [
    { categoria: 'funcionario_extra', valor: 100, nome: 'Zé', justificativa: JUST, foto: FOTO } ] },
  // Maglia: tem extra, tem faturamento, e mesmo assim fica fora (regra do CLAUDE.md).
  { loja: 'MAGLIA', data: '2026-10-02', gn_caixa_despesa: [
    { categoria: 'funcionario_extra', valor: 9999, nome: 'Heitor', justificativa: JUST, foto: FOTO } ] },
  // Setembro, pro ‹ ter pra onde ir.
  { loja: 'BANGU', data: '2026-09-20', gn_caixa_despesa: [
    { categoria: 'funcionario_extra', valor: 700, nome: 'Ciclano', justificativa: JUST, foto: FOTO } ] },
];

// Faturamento do mês, por chkKey. Itaquera vende e não tem extra; Maglia vende muito e não
// pode entrar na base da rede.
const VENDAS = [
  { loja: 'Bangu',        data_operacao: '2026-10-04', venda_salao: 100000, venda_delivery: 0 },
  { loja: 'Caxias',       data_operacao: '2026-10-04', venda_salao: 100000, venda_delivery: 0 },
  { loja: 'Campo Grande', data_operacao: '2026-10-04', venda_salao: 50000,  venda_delivery: 0 },
  { loja: 'Itaquera',     data_operacao: '2026-10-04', venda_salao: 250000, venda_delivery: 0 },
  { loja: 'Maglia',       data_operacao: '2026-10-04', venda_salao: 999999, venda_delivery: 0 },
  { loja: 'Bangu',        data_operacao: '2026-09-15', venda_salao: 70000,  venda_delivery: 0 },
];

// Fora de ordem de propósito: a ordenação alfabética dos cartões é do app, e lista já
// ordenada não prova nada.
const LOJAS = ['ITAQUERA', 'MAGLIA', 'BANGU', 'CAXIAS', 'CAMPO GRANDE', 'BOULEVARD'];

const entre = (v, de, ate) => v >= de && v <= ate;
const faixa = url => {
  const g = decodeURIComponent(url).match(/(?:data|data_operacao)=gte\.([\d-]+)/);
  const l = decodeURIComponent(url).match(/(?:data|data_operacao)=lte\.([\d-]+)/);
  return [g ? g[1] : '0000-00-00', l ? l[1] : '9999-99-99'];
};

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, HOJE + 'T12:00:00');

  // Dublê de PostgREST: honra a janela de datas e o filtro da categoria na tabela aninhada
  // (`gn_caixa_despesa.categoria=eq.funcionario_extra` + !inner), que é o que o app manda.
  // Sem honrar, o teste não provaria que o recorte é feito no servidor.
  await ctx.route('**/rest/v1/**', async route => {
    const url = route.request().url();
    const [de, ate] = faixa(url);
    const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.includes('gn_caixa_fechamento')) {
      const soExtra = /gn_caixa_despesa\.categoria=eq\.funcionario_extra/.test(decodeURIComponent(url));
      const inner = /gn_caixa_despesa!inner/.test(decodeURIComponent(url));
      const linhas = FECHAMENTOS
        .filter(f => entre(f.data, de, ate))
        .map(f => ({ loja: f.loja, data: f.data,
                     gn_caixa_despesa: soExtra ? f.gn_caixa_despesa.filter(d => d.categoria === 'funcionario_extra')
                                               : f.gn_caixa_despesa }))
        .filter(f => !inner || f.gn_caixa_despesa.length);
      return json(linhas);
    }
    if (url.includes('checklist_diario')) return json(VENDAS.filter(v => entre(v.data_operacao, de, ate)));
    return json([]);
  });

  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message)));
  await page.goto('file://' + HOME);
  try {
    await CAMINHOS.esperarApp(page, ['LOJAS_LISTA'], ['_monthRange']);
  } catch (e) { console.log('FALHOU: o Painel não carregou'); falhou++; await browser.close(); process.exit(1); }

  const carregou = await page.evaluate(async lojas => {
    try {
      LOJAS_LISTA = lojas;
      window.renderDashboard = () => {};
      if (typeof _loadExtraGerencia !== 'function') return { ausente: true };
      await _loadExtraGerencia();
      return { ok: true };
    } catch (e) { return { erro: String(e && e.message) }; }
  }, LOJAS);
  if (!carregou || !carregou.ok) {
    console.log('FALHOU: a aba Extra do Painel não existe ou não carregou — ' + JSON.stringify(carregou));
    falhou++;
    await browser.close();
    console.log(`\n${ok} OK, ${falhou} falhou`);
    process.exit(1);
  }

  const ler = () => page.evaluate(() => {
    const o = {};
    _extraGerData.lojas.forEach(k => {
      const c = _extraGerData.porLoja[k];
      o[k] = { total: c.total, qtd: c.qtd, fat: c.fat, pct: c.pct, dias: c.dias,
               semNome: c.semNome, semJust: c.semJust, semFoto: c.semFoto,
               pessoas: c.pessoas.map(p => ({ nome: p.nome, semNome: p.semNome, vezes: p.vezes, total: p.total })),
               repetidos: c.repetidos.map(p => p.nome),
               lancamentos: c.lancamentos.map(l => l.data + '|' + (l.nome || '-') + '|' + l.valor) };
    });
    return { lojas: _extraGerData.lojas, mes: _extraGerData.range.label, porLoja: o, html: _buildExtraPanel() };
  });

  const d = await ler();
  const txt = String(d.html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const B = d.porLoja['BANGU'], C = d.porLoja['CAXIAS'], CG = d.porLoja['CAMPO GRANDE'],
        BV = d.porLoja['BOULEVARD'], I = d.porLoja['ITAQUERA'];

  // ── 1. Maglia fora ─────────────────────────────────────────────────────────────────────
  check('Maglia fica fora da aba (o pedido não citou o nome dela)',
    !d.lojas.includes('MAGLIA') && !d.porLoja['MAGLIA']);
  check('e os R$ 9.999 dela não aparecem em lugar nenhum', !/9\.999/.test(txt));

  // ── 2. A soma por loja ─────────────────────────────────────────────────────────────────
  check('Bangu: R$ 600,00 em 5 lançamentos', B && B.total === 600 && B.qtd === 5);
  check('a despesa de OUTRA categoria no mesmo fechamento não entra (seriam R$ 5.600)',
    B && B.total === 600);
  check('Bangu: 4 dias com extra (dois lançamentos no mesmo dia contam um dia)',
    B && B.dias === 4);
  check('Caxias: R$ 1.000,00 em 4 lançamentos, num dia só', C && C.total === 1000 && C.qtd === 4 && C.dias === 1);

  // ── 3. A proporção da venda, que é o que compara as lojas ──────────────────────────────
  check('Bangu: 0,60% da venda (R$ 600 sobre R$ 100 mil)', B && Math.abs(B.pct - 0.6) < 0.001);
  check('Campo Grande: 6,00% — terceira em reais, primeira em proporção',
    CG && CG.total === 3000 && Math.abs(CG.pct - 6) < 0.001);
  check('a rede fica em 0,94% (R$ 4.700 sobre R$ 500 mil — a venda da Maglia não entra na base)',
    /0,94%/.test(txt) && /R\$ 4\.700,00/.test(txt));
  check('Boulevard tem extra e não tem venda lançada: a proporção fica em branco, não em zero',
    BV && BV.qtd === 1 && BV.pct === null && /sem faturamento pra comparar/i.test(txt));

  // ── 4. Quem está fora da média ────────────────────────────────────────────────────────
  check('só a Campo Grande passa do dobro da média, e o aviso diz o número',
    /1 loja gasta mais que o dobro da média da rede/.test(txt) &&
    /Campo Grande 6,00%/.test(txt) && !/Caxias 1,00%/.test(txt));
  check('Bangu e Caxias ficam marcadas como dentro da média, e só elas',
    (txt.match(/dentro da média/gi) || []).length === 2);
  check('Itaquera vende e não teve extra: cartão próprio dizendo isso',
    I && I.qtd === 0 && /sem extra no mês/i.test(txt) && txt.includes('Itaquera'));

  // ── 5. Agrupamento por nome ───────────────────────────────────────────────────────────
  const talita = B && B.pessoas.find(p => !p.semNome);
  check('Talita vira UMA linha de 4×, somando R$ 500 — " TALITÁ " é a mesma pessoa',
    !!talita && talita.vezes === 4 && talita.total === 500);
  check('e ela vem no topo da lista da loja, antes do que não se repete',
    B && B.pessoas[0] && B.pessoas[0].vezes === 4);
  check('quem veio sem nome vira uma linha só, dita como tal',
    B && B.pessoas.some(p => p.semNome && p.vezes === 1) &&
    C && C.pessoas.length === 1 && C.pessoas[0].semNome && C.pessoas[0].vezes === 4);
  check('o aviso do nome que se repete nomeia a pessoa e as vezes',
    /1 nome se repete 4 vezes ou mais no mês/.test(txt) && /Talita 4×/.test(txt));
  // O cartão da Caxias MOSTRA "sem nome 4×" na lista agrupada, e deve mostrar — é o retrato
  // do que não dá pra auditar. O que não pode é isso virar alerta de pessoa fixa.
  const avisoRepete = (txt.match(/\d+ nomes? se repete[\s\S]{0,160}?Extra que volta/) || [''])[0];
  check('o "sem nome" não vira alerta de nome repetido, mesmo com 4 lançamentos na Caxias',
    C && C.repetidos.length === 0 && B && B.repetidos.length === 1 &&
    /Talita 4×/.test(avisoRepete) && !/sem nome/.test(avisoRepete), avisoRepete);
  check('mas a lista agrupada da Caxias mostra as 4 vezes sem nome, que é o retrato do buraco',
    /sem nome 4× R\$ 1\.000,00/.test(txt));

  // ── 6. O que não dá pra auditar ───────────────────────────────────────────────────────
  check('5 de 11 lançamentos não dizem quem recebeu, e o aviso aponta as lojas',
    /5 de 11 lançamentos não dizem quem recebeu/.test(txt) &&
    /Bangu \(1 de 5\)/.test(txt) && /Caxias \(4 de 4\)/.test(txt));
  check('justificativa curta conta como sem justificativa (a régua é a mesma do Caixa)',
    C && C.semJust === 1 && /1 lançamento sem justificativa/.test(txt));
  check('e o lançamento sem foto é contado', C && C.semFoto === 1 && C.qtd === 4);

  // ── 7. Ordem e navegação ──────────────────────────────────────────────────────────────
  const titulos = String(d.html).match(/font-weight:(?:800|700);color:var\(--t[12]\);flex:1">([^<]+)</g)
    .map(x => x.replace(/.*">/, '').replace(/<$/, ''));
  check('um cartão por loja, em ordem alfabética',
    titulos.join('|') === 'Bangu|Boulevard|Campo Grande|Caxias|Itaquera');
  check('o cabeçalho diz o mês e que ele está em andamento',
    /OUT 2026/.test(txt) && /mês corrente — em andamento/.test(txt));
  check('o › vem desabilitado: não há mês à frente',
    /_extraGerNav\(1\)[^>]*disabled/.test(String(d.html)));

  const antes = await page.evaluate(async () => {
    _extraGerNav(-1);
    for (let i = 0; i < 100 && (!_extraGerData || _extraGerData.range.label !== 'Set 2026'); i++) {
      await new Promise(r => setTimeout(r, 50));
    }
    return { mes: _extraGerData.range.label, total: _extraGerData.porLoja['BANGU'].total,
             qtd: _extraGerData.porLoja['BANGU'].qtd, html: _buildExtraPanel() };
  });
  const aTxt = String(antes.html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  check('o ‹ volta um mês e busca de novo: Set 2026 traz os R$ 700,00 da Bangu',
    antes.mes === 'Set 2026' && antes.total === 700 && antes.qtd === 1);
  check('e o mês fechado é dito como tal', /mês fechado/.test(aTxt) && /SET 2026/.test(aTxt));
  check('a proporção acompanha o mês: R$ 700 sobre os R$ 70 mil de setembro = 1,00%',
    /1,00%/.test(aTxt));

  // ── 8. A lista por dia ────────────────────────────────────────────────────────────────
  const porDia = await page.evaluate(async () => {
    _extraGerNav(1);
    for (let i = 0; i < 100 && (!_extraGerData || _extraGerData.range.label !== 'Out 2026'); i++) {
      await new Promise(r => setTimeout(r, 50));
    }
    _extraGerToggle('CAXIAS');
    return _buildExtraPanel();
  });
  const dTxt = String(porDia).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  check('o › volta pro mês corrente', /OUT 2026/.test(dTxt));
  const alem = await page.evaluate(async () => {
    _extraGerNav(1);
    await new Promise(r => setTimeout(r, 300));
    return { off: _extraGerOff, mes: _extraGerData.range.label };
  });
  check('e não passa dele: não há mês à frente pra consultar',
    alem.off === 0 && alem.mes === 'Out 2026');
  check('aberta por dia, a Caxias mostra a data de cada lançamento', /05\/10/.test(dTxt));
  check('a justificativa aparece como foi escrita, inclusive a curta demais',
    / 05\/10 sem nome R\$ 250,00 x /.test(dTxt) && dTxt.includes(JUST));
  check('e o lançamento sem foto diz "sem foto" em vez de uma imagem quebrada',
    /sem foto/.test(dTxt));

  // ── 9. Os relatórios ──────────────────────────────────────────────────────────────────
  const rel = await page.evaluate(() => {
    try { return { wpp: _extraRelatorioTexto(true).msg, pdf: _extraRelatorioTexto(false).msg }; }
    catch (e) { return { erro: String(e && e.message) }; }
  });
  check('o relatório traz o total da rede e a proporção',
    rel.pdf && /R\$ 4\.700,00/.test(rel.pdf) && /0,94%/.test(rel.pdf));
  check('o WhatsApp vai agrupado por pessoa', rel.wpp && /Talita: 4× R\$ 500,00/.test(rel.wpp));
  check('o PDF vai lançamento a lançamento, com data e motivo',
    rel.pdf && /03\/10 · Talita · R\$ 100,00 · cobertura da folga/.test(rel.pdf));
  check('os dois apontam o nome que se repete', /se repete 4×/.test(rel.pdf) && /se repete 4×/.test(rel.wpp));
  check('e dizem quais lojas não tiveram extra no mês',
    /Sem extra no mês.*Itaquera/.test(rel.pdf));
  check('a Maglia não entra em relatório nenhum', !/Maglia/.test(rel.pdf) && !/Maglia/.test(rel.wpp));

  // ── 10. O app não confia cegamente na resposta ────────────────────────────────────────
  // A passada de cima prova que o recorte da categoria vai NA CONSULTA (o dublê só devolve
  // extra porque o app pediu assim). Aqui o servidor devolve a despesa de manutenção junto,
  // como devolveria se o filtro aninhado fosse perdido numa edição: o total não pode mudar.
  await ctx.unroute('**/rest/v1/**');
  await ctx.route('**/rest/v1/**', async route => {
    const url = route.request().url();
    const [de, ate] = faixa(url);
    const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.includes('gn_caixa_fechamento')) return json(FECHAMENTOS.filter(f => entre(f.data, de, ate)));
    if (url.includes('checklist_diario')) return json(VENDAS.filter(v => entre(v.data_operacao, de, ate)));
    return json([]);
  });
  const semFiltro = await page.evaluate(async () => {
    await _loadExtraGerencia();
    return { bangu: _extraGerData.porLoja['BANGU'].total, qtd: _extraGerData.porLoja['BANGU'].qtd };
  });
  check('servidor devolvendo outras categorias junto não muda a conta (R$ 600, não R$ 5.600)',
    semFiltro.bangu === 600 && semFiltro.qtd === 5, JSON.stringify(semFiltro));

  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
