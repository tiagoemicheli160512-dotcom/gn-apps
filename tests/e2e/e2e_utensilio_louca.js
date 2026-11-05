// Taynara (sub-gerente, Bangu), na caixa de sugestões:
//   "Colocar a planilha de perdas de produtos no app, como: copo quebrado, prato — e
//    poderia tbm ter uma planilha que pudéssemos colocar qual item está faltando na nossa
//    loja e fica de fácil acesso pro seu Henrique, por exemplo: pratinho de colocar
//    casquinha de siri."
//
// O registro é o mesmo de uma manutenção (state.manutencao, tipo 'Utensílio / Louça'),
// porque é essa fila que o pessoal de manutenção já olha e já recebe alerta. Mas a PORTA
// é própria: aba "🍽️ Utensílios" no menu, depois do dono testar e dizer "achei confuso,
// vai ter gente sem conseguir achar". Cada aba mostra só o que é dela.
//
// O teste vai nos DOIS lados: a loja lançando no Check-list, e o item aparecendo no app de
// Manutenção com situação e quantidade. Um tipo que exista num lado e não no outro chega
// sem ícone, sem cor e sem prazo — foi isso que mais me preocupou aqui.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK   = process.env.ARQ_CHK   || CAMINHOS.pub('gn-checklist.html');
const MANUT = process.env.ARQ_MANUT || CAMINHOS.pub('gn-manutencao.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const TIPO = 'Utensílio / Louça';

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  // ══ LADO DA LOJA (Check-list) ═════════════════════════════════════════════════════════
  const ctxChk = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await ctxChk.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await ctxChk.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const chk = await ctxChk.newPage();
  for (let t = 1; ; t++) {
    await chk.goto('file://' + CHK);
    try {
      await chk.waitForFunction(() => { try {
        return typeof renderUtensilios === 'function' && typeof addUtensilio === 'function'
            && typeof MANUT_TIPOS_CHK !== 'undefined' && typeof CARNES_DEF !== 'undefined';
      } catch (e) { return false; } }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('o Check-list não carregou (ou falta o código novo)'); }
  }

  const r = await chk.evaluate((TIPO) => {
    usuarioLogado = { id: 1, nome: 'Taynara', cargo: 'sub_gerente', loja: 'BANGU' };
    autoSave = () => {};
    _debouncedSaveAll = () => {};
    state.manutencao = [];
    state.manutOficial = [];
    // Pela aba nova a pessoa não escolhe tipo: o "+ Registrar" já nasce louça. Desde que
    // peça e quantidade viraram obrigatórias, o botão abre um rascunho e o item só nasce
    // no _utensNovoRegistrar() — não existe mais item em branco no state.
    addUtensilio();
    _utensNovoSet('nome', 'Copo de chopp');
    _utensNovoSet('qtd', '3');
    _utensNovoSet('situacao', 'Quebrou');
    _utensNovoSet('setor', 'Salão');
    _utensNovoRegistrar();
    const id = state.manutencao[0].id;
    const txt = (document.getElementById('tab-utensilios') || document.body).textContent.replace(/\s+/g, ' ');

    // E um de FALTANDO, que é o outro caso que ela pediu.
    addUtensilio();
    _utensNovoSet('nome', 'Pratinho de casquinha de siri');
    _utensNovoSet('qtd', '12');
    _utensNovoSet('situacao', 'Faltando');
    _utensNovoRegistrar();
    const id2 = state.manutencao[0].id;
    renderUtensilios();
    // Equipamento de verdade, pra provar que as duas abas não se misturam.
    addManutencao();
    const idEq = state.manutencao[0].id;
    updateManut(idEq, 'tipo', 'Ar Condicionado');
    updateManut(idEq, 'descricao', 'Ar do salão pingando');
    renderUtensilios(); renderManutencao();

    return {
      tipos: MANUT_TIPOS_CHK,
      tipoNasceLouca: state.manutencao.find(m=>m.id===id).tipo,
      txtUtens: (document.getElementById('tab-utensilios')||document.body).textContent.replace(/\s+/g,' '),
      txtManut: (document.getElementById('tab-manutencao')||document.body).textContent.replace(/\s+/g,' '),
      btnUtens: (document.getElementById('tab-btn-utensilios')||{}).textContent||'',
      noMenu: !!document.querySelector('[data-sidebar-tab="utensilios"]'),
      situacoes: MANUT_SITUACOES_UTENSILIO,
      item: state.manutencao.find(m => m.id === id),
      item2: state.manutencao.find(m => m.id === id2),
      txt,
      txtDepois: (document.getElementById('tab-utensilios') || document.body).textContent.replace(/\s+/g, ' '),
      resumo: _manutResumoChk(state.manutencao.find(m => m.id === id)),
      resumoEstrutura: _manutResumoChk({ tipo: 'Estrutura', setor: 'Cozinha', qtd: '9', situacao: 'Quebrou' }),
    };
  }, TIPO);

  check('o tipo "Utensílio / Louça" existe na lista do Check-list', r.tipos.includes(TIPO));
  check('as duas situações são Quebrou e Faltando',
    JSON.stringify(r.situacoes) === JSON.stringify(['Quebrou', 'Faltando']));
  check('situação e quantidade são campos próprios no item, não texto na descrição',
    r.item && r.item.situacao === 'Quebrou' && String(r.item.qtd) === '3' && r.item.descricao === 'Copo de chopp');
  check('o caso de "faltando" grava igual',
    r.item2 && r.item2.situacao === 'Faltando' && String(r.item2.qtd) === '12');
  check('o resumo do item mostra situação e quantidade',
    r.resumo === 'Utensílio / Louça · Salão · Quebrou 3');
  check('e um item de outro tipo NÃO ganha esse detalhe, mesmo com os campos preenchidos',
    r.resumoEstrutura === 'Estrutura · Cozinha');
  check('os campos de louça aparecem na tela quando o tipo é louça', /Quantas/.test(r.txt) && /O que houve/.test(r.txt));
  check('a aba 🍽️ Utensílios existe no menu', r.noMenu === true);
  check('o "+ Registrar" da aba já cria o item como louça (ninguém escolhe tipo)',
    r.tipoNasceLouca === TIPO);
  check('a louça aparece na aba Utensílios', /Copo de chopp/.test(r.txtUtens));
  check('e NÃO aparece mais na aba Manutenção', !/Copo de chopp/.test(r.txtManut));
  check('o equipamento aparece na Manutenção e não na Utensílios',
    /Ar do salão pingando/.test(r.txtManut) && !/Ar do salão pingando/.test(r.txtUtens));
  check('a aba Utensílios mostra quantos estão pendentes', /2/.test(r.btnUtens));
  check('a descrição continua existindo (é onde vai o nome da peça)',
    /Pratinho de casquinha de siri/.test(r.txtDepois));

  // Campos de louça NÃO podem aparecer em item de outro tipo — a aba ficaria pedindo
  // "quantas" pra um ar-condicionado. Precisa de estado LIMPO com um item só: na primeira
  // versão deste teste sobrava o outro item de louça na lista, os campos continuavam na
  // tela com razão, e a checagem falhou acusando o código de um erro que era meu.
  const outroTipo = await chk.evaluate(() => {
    state.manutencao = [];
    addManutencao();
    const id = state.manutencao[0].id;
    updateManut(id, 'tipo', 'Ar Condicionado');
    renderManutencao(); renderUtensilios();
    return { txt: (document.getElementById('tab-manutencao') || document.body).textContent.replace(/\s+/g, ' '),
             itens: state.manutencao.length };
  });
  check('com um item só, de outro tipo, os campos de louça não aparecem',
    outroTipo.itens === 1 && !/O que houve/.test(outroTipo.txt) && !/Quantas/.test(outroTipo.txt));

  await ctxChk.close();

  // ══ LADO DO HENRIQUE (app Manutenção) ═════════════════════════════════════════════════
  const ctxM = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await ctxM.route('**/rest/v1/**', rt => rt.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const man = await ctxM.newPage();
  for (let t = 1; ; t++) {
    await man.goto('file://' + MANUT);
    try {
      await man.waitForFunction(() => { try {
        return typeof TIPOS !== 'undefined' && typeof SLA_CONFIG !== 'undefined'
            && typeof _detalheUtensilio === 'function';
      } catch (e) { return false; } }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 4) throw new Error('o app Manutenção não carregou (ou falta o código novo)'); }
  }

  const m = await man.evaluate((TIPO) => {
    const def = TIPOS.find(t => t.key === TIPO);
    const item = { id: 'x1', tipo: TIPO, setor: 'Salão', descricao: 'Copo de chopp',
                   situacao: 'Quebrou', qtd: '3', status: 'Pendente', prioridade: 'Normal',
                   _loja: 'Bangu', _data: '2026-10-10' };
    return {
      noCatalogo: !!def,
      temIconeECor: !!(def && def.icon && def.cor),
      sla: SLA_CONFIG[TIPO] || null,
      // Toda chave de TIPOS precisa ter SLA, senão o prazo do item é undefined.
      tiposSemSla: TIPOS.filter(t => !SLA_CONFIG[t.key]).map(t => t.key),
      detalhe: _detalheUtensilio(item),
      detalheTxt: _detalheUtensilioTxt(item),
      // Item de outro tipo não pode ganhar a linha de louça.
      detalheOutro: _detalheUtensilio({ tipo: 'Estrutura', situacao: 'Quebrou', qtd: '3' }),
      // Item de louça sem peça nem quantidade: ANTES isso era só "não sujar a tela" e o
      // item chegava mudo. Virou o contrário de propósito — a loja agora é obrigada a
      // informar, então o que sobrou de antes tem que GRITAR, senão o Henrique fica
      // olhando um "Utensílio / Louça · Salão" e não sabe o que comprar.
      detalheAntigo: _detalheUtensilio({ tipo: TIPO }),
      detalheAntigoTxt: _detalheUtensilioTxt({ tipo: TIPO, situacao: 'Quebrou' }),
    };
  }, TIPO);

  check('o tipo existe também no catálogo do app de Manutenção', m.noCatalogo === true);
  check('com ícone e cor próprios (sem isso o item chega sem identidade)', m.temIconeECor === true);
  check('e com prazo definido', m.sla !== null && m.sla.normal > 0 && m.sla.critico > m.sla.normal);
  check('nenhum tipo do catálogo ficou sem prazo', m.tiposSemSla.length === 0);
  if (m.tiposSemSla.length) console.log('      sem SLA: ' + m.tiposSemSla.join(', '));
  check('o card mostra a situação e a quantidade que a loja lançou',
    /Quebrou/.test(m.detalhe) && /3 un/.test(m.detalhe));
  check('o relatório em texto também leva o detalhe', m.detalheTxt === 'Quebrou · 3 un');
  check('item de outro tipo não ganha a linha de louça', m.detalheOutro === '');
  check('item de louça sem peça nem quantidade é marcado como INCOMPLETO, não fica mudo',
    /Lançamento incompleto/.test(m.detalheAntigo) && /qual peça/.test(m.detalheAntigo) && /quantas/.test(m.detalheAntigo));
  check('e o relatório em texto também avisa', /INCOMPLETO/.test(m.detalheAntigoTxt));
  check('lançamento completo não ganha aviso nenhum', !/incompleto/i.test(m.detalhe));

  await ctxM.close();
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
