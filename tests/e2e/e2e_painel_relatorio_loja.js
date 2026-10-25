// "Como eu faço pra ver o relatório? Seria bom aparecer pra mim no painel de gestão,
//  naquele card expansivo por loja."
//
// O relatório da tela da loja fica atrás da senha de QUEM RESPONDEU, e cargo mestre é
// recusado ali de propósito. Então quem manda na rede via o placar ("Gerente: 1/3") e não
// tinha como abrir o relatório de loja nenhuma — nem saber QUAL pergunta foi errada.
//
// O que esta suíte cobra:
//  1. O chip abre a loja e mostra o relatório + o que gerente e sub marcaram.
//  2. CARREGA SÓ A LOJA TOCADA. Montar o relatório são 5 consultas; fazer as 11 ao
//     desenhar o Painel seriam 55 por render.
//  3. NÃO ATROPELA a tela da loja: o cache do Painel é separado do `_fechaRel`.
//  4. Quem não é mestre não abre nada.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (extra !== undefined && !c ? '  → ' + String(extra).slice(0,300) : '')); c ? ok++ : falhou++; };

const dias = (n, venda) => Array.from({length:n},(_,i)=>({data_operacao:'2026-10-'+String(12+i).padStart(2,'0'),venda_salao:venda/n,venda_delivery:0,faltas:[],manutencao:[]}));
const RESPOSTAS = { '2026-10-12': {
  BANGU: {
    gerente: { nome:'Leandro', cargo:'gerente', acertos:1, total:3, ordem:1,
      respostas: [
        { id:'venda', marcou:120300, correto:94700, exato:94735, rotuloMarcou:'R$ 120.300', rotuloCorreto:'R$ 94.700', certo:false },
        { id:'carne_sol', marcou:104, correto:104, exato:104.05, rotuloMarcou:'104 kg', rotuloCorreto:'104 kg', certo:true },
        { id:'picanha', marcou:63, correto:49, exato:49.25, rotuloMarcou:'63 kg', rotuloCorreto:'49 kg', certo:false },
      ] },
    sub: { nome:'Bárbara', cargo:'sub_gerente', acertos:3, total:3, ordem:2,
      respostas: [
        { id:'venda', marcou:94700, correto:94700, exato:94735, rotuloMarcou:'R$ 94.700', rotuloCorreto:'R$ 94.700', certo:true },
        { id:'carne_sol', marcou:104, correto:104, exato:104.05, rotuloMarcou:'104 kg', rotuloCorreto:'104 kg', certo:true },
        { id:'picanha', marcou:49, correto:49, exato:49.25, rotuloMarcou:'49 kg', rotuloCorreto:'49 kg', certo:true },
      ] },
  },
  CAXIAS: { gerente: { nome:'Jandy', cargo:'gerente', acertos:2, total:3, ordem:1, respostas: [
      { id:'venda', marcou:50000, correto:48100, rotuloMarcou:'R$ 50.000', rotuloCorreto:'R$ 48.100', certo:false },
      { id:'carne_sol', marcou:53, correto:53, rotuloMarcou:'53 kg', rotuloCorreto:'53 kg', certo:true },
      { id:'picanha', marcou:20, correto:20, rotuloMarcou:'20 kg', rotuloCorreto:'20 kg', certo:true } ] } },
} };

async function abrir(browser, { falharRelatorio } = {}) {
  const ctx = await browser.newContext({ viewport:{width:390,height:900} });
  const pedidos = [];
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request(), url = req.url(), m = req.method();
    pedidos.push(url);
    const j = b => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(b) });
    if (m === 'POST') return r.fulfill({ status:201, body:'' });
    if (/FECHAMENTO_SEMANAL/.test(url)) return j([{ all_data: RESPOSTAS }]);
    if (/checklist_diario/.test(url)) {
      if (falharRelatorio) return r.fulfill({ status:500, contentType:'text/plain', body:'boom' });
      return j(/gte\.2026-10-05/.test(url) ? dias(7,90000) : dias(7,94735));
    }
    if (/checklist_carnes/.test(url)) return j([{ carnes:{ carne_sol:{inicial:'104.05',contagem_final:152.65}, picanha:{inicial:'49.25',contagem_final:55.05} } }]);
    if (/gn_caixa_fechamento/.test(url)) return j(Array.from({length:7},(_,i)=>({data:'2026-10-1'+i})));
    if (/gn_lojas/.test(url)) return j([{ all_data: {} }]);
    return j([]);
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => { try { return typeof _fechaPainelToggle === 'function'; } catch(e) { return false; } }, { timeout: 25000 });
  await page.evaluate(async () => {
    window.gnFetchJson = window.gnFetchJson || (async (u,h,t,fb) => fb);
    session = { id:1, nome:'Tiago', cargo:'mestre', loja:'GERAL', permissoes:{ master:true } };
    masterLoja = null;
    _fechaPainelLoja = null; _fechaPainelRel = {}; _fechaPainelErro = {};
    await _fechaCarregarRespostas(true);
    const d = document.createElement('div');
    d.id = 'fecha-painel-card-holder';
    d.innerHTML = _buildFechamentoSemanalCard();
    document.body.appendChild(d);
  });
  return { ctx, page, erros, pedidos };
}

// pedidos do relatório de UMA loja (checklist_diario é exclusivo dele neste cenário)
const contaRel = pedidos => pedidos.filter(u => /checklist_diario/.test(u)).length;
const html = page => page.evaluate(() => document.getElementById('fecha-painel-card-holder').innerHTML);
const texto = page => page.evaluate(() => document.getElementById('fecha-painel-card-holder').innerText);

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  // ── 1. O chip abre a loja ───────────────────────────────────────────────────────────
  {
    const a = await abrir(browser);
    const h0 = await html(a.page);
    check('o chip da loja virou botão que abre', /onclick="_fechaPainelToggle\('BANGU'\)"/.test(h0), h0.slice(0,200));
    check('nada do relatório é carregado antes de tocar', contaRel(a.pedidos) === 0, contaRel(a.pedidos));

    await a.page.click('button[onclick*="_fechaPainelToggle(\'BANGU\')"]');
    await a.page.waitForTimeout(700);
    const t = await texto(a.page);
    check('abre com o nome da loja', /Bangu/i.test(t), t.slice(0,160));
    check('mostra o que o GERENTE marcou, e quanto acertou', /Gerente · Leandro: 1 de 3/.test(t), t.slice(0,400));
    check('diz QUAL pergunta ele errou e o certo', /Venda da semana — marcou R\$ 120\.300, o certo era R\$ 94\.700/.test(t), t);
    check('e mostra o valor exato ao lado do arredondado', /exato: 94\.735/.test(t), t);
    check('mostra o do SUB também', /Sub · Bárbara.*: 3 de 3/.test(t), t);
    check('marca que o sub respondeu depois (pode ter visto a tela do primeiro)', /respondeu depois/.test(t), t);
    check('e traz o relatório da semana', /Resultado da semana/.test(t) && /Venda \(salão \+ delivery\)/.test(t), t.slice(0,300));
    check('o relatório tem os controles da semana', /Carne de sol|Avarias|Caixas fechados/.test(t));
    check('só a loja tocada foi carregada', contaRel(a.pedidos) === 2, contaRel(a.pedidos) + ' consultas de dias');
    check('sem erro de JS', a.erros.length === 0, a.erros.join(' | '));
    await a.ctx.close();
  }

  // ── 2. Fecha, reabre do cache, e abre outra loja ────────────────────────────────────
  {
    const a = await abrir(browser);
    await a.page.click('button[onclick*="_fechaPainelToggle(\'BANGU\')"]');
    await a.page.waitForTimeout(700);
    const n1 = contaRel(a.pedidos);
    await a.page.click('button[onclick*="_fechaPainelToggle(\'BANGU\')"]');
    await a.page.waitForTimeout(300);
    check('tocar de novo fecha', !/Resultado da semana/.test(await texto(a.page)));
    await a.page.click('button[onclick*="_fechaPainelToggle(\'BANGU\')"]');
    await a.page.waitForTimeout(500);
    check('reabrir não consulta de novo (cache por loja)', contaRel(a.pedidos) === n1, n1 + ' → ' + contaRel(a.pedidos));
    await a.page.click('button[onclick*="_fechaPainelToggle(\'CAXIAS\')"]');
    await a.page.waitForTimeout(700);
    const t = await texto(a.page);
    check('abrir outra loja troca o que está aberto', /Caxias/i.test(t) && /Gerente · Jandy: 2 de 3/.test(t), t.slice(0,300));
    check('e avisa que o sub dela não respondeu', /Sub não respondeu/.test(t), t.slice(0,400));
    check('a outra loja foi consultada só agora', contaRel(a.pedidos) === n1 + 2, contaRel(a.pedidos));
    await a.ctx.close();
  }

  // ── 3. Loja sem ninguém respondendo ─────────────────────────────────────────────────
  {
    const a = await abrir(browser);
    await a.page.click('button[onclick*="_fechaPainelToggle(\'PEDREIRA\')"]');
    await a.page.waitForTimeout(700);
    const t = await texto(a.page);
    check('loja sem resposta abre mesmo assim e avisa', /Ninguém desta loja respondeu ainda/.test(t), t.slice(0,300));
    check('e o relatório da semana aparece do mesmo jeito', /Resultado da semana/.test(t), t.slice(0,300));
    await a.ctx.close();
  }

  // ── 4. Falha ao montar o relatório não quebra o Painel ──────────────────────────────
  {
    const a = await abrir(browser, { falharRelatorio: true });
    await a.page.click('button[onclick*="_fechaPainelToggle(\'BANGU\')"]');
    await a.page.waitForTimeout(900);
    const t = await texto(a.page);
    check('falha vira recado, não card quebrado', /Não consegui montar o relatório desta loja agora|Resultado da semana/.test(t), t.slice(0,300));
    check('o placar de cima continua de pé', /lojas completas/.test(t), t.slice(0,160));
    check('sem erro de JS', a.erros.length === 0, a.erros.join(' | '));
    await a.ctx.close();
  }

  // ── 5. Quem não é mestre não abre ───────────────────────────────────────────────────
  {
    const a = await abrir(browser);
    await a.page.evaluate(() => { session = { id:9, nome:'Leandro', cargo:'gerente', loja:'BANGU', permissoes:{} }; });
    await a.page.click('button[onclick*="_fechaPainelToggle(\'BANGU\')"]');
    await a.page.waitForTimeout(600);
    check('gerente não abre o relatório pelo Painel', !/Resultado da semana/.test(await texto(a.page)));
    check('e nem dispara a consulta', contaRel(a.pedidos) === 0, contaRel(a.pedidos));
    await a.ctx.close();
  }

  // ── 6. O Painel não atropela a tela da loja ─────────────────────────────────────────
  {
    const a = await abrir(browser);
    await a.page.evaluate(() => { _fechaRel = { loja:'CAXIAS', semISO:'2026-10-12', marcador:'da tela da loja' }; _fechaRelLoja = 'CAXIAS'; });
    await a.page.click('button[onclick*="_fechaPainelToggle(\'BANGU\')"]');
    await a.page.waitForTimeout(700);
    const r = await a.page.evaluate(() => ({ loja: _fechaRelLoja, marcador: _fechaRel && _fechaRel.marcador, painel: Object.keys(_fechaPainelRel) }));
    check('o relatório da tela da loja continua intacto', r.loja === 'CAXIAS' && r.marcador === 'da tela da loja', JSON.stringify(r));
    check('o do Painel fica em cache separado', r.painel.join(',') === 'BANGU', JSON.stringify(r));
    await a.ctx.close();
  }

  await browser.close();
  console.log('\n' + HOME);
  console.log(ok + ' ok, ' + falhou + ' falhou');
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error('ERRO: ' + e.message); process.exit(2); });
