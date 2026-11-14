// "as marcações nos itens são ruins, somem às vezes" — check-list da visita saiu da linha
// do dia da loja (checklist_diario, regravada por todo aparelho a cada 30 s) e foi pra um
// registro próprio por visita, gravado item a item.
//
// O que esta suíte prova, com um servidor de mentira que se comporta como o Supabase:
//  1. as definições (setores, itens, pesos, críticos) e as contas de nota são as MESMAS do
//     app Check-list — comparadas lendo o próprio gn-checklist.html;
//  2. os botões aparecem na visita presencial e não na remota;
//  3. marcação feita continua lá depois de fechar e reabrir a página;
//  4. dois aparelhos marcando itens diferentes não se apagam;
//  5. marcação feita sem internet fica guardada, sobrevive à recarga e sobe quando volta;
//  6. finalizar grava nota e trava; cozinha C/NC; auditoria gera o plano de ação;
//  7. registro antigo do app Check-list abre só pra leitura.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
const CHK = CAMINHOS.pub('gn-checklist.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra))); c ? ok++ : falhou++; };

const DIA = '2026-11-20';
const VISITA = { id: '11111111-1111-1111-1111-111111111111', loja: 'Bangu', data: DIA, visitante: 'Carlos', cargo: 'supervisor', hora_chegada: '09:10', hora_saida: null, tipo_visita: null };
const REMOTA = { id: '22222222-2222-2222-2222-222222222222', loja: 'Caxias', data: DIA, visitante: 'Carlos', cargo: 'supervisor', hora_chegada: '10:00', hora_saida: null, tipo_visita: 'remoto' };
const ANTIGA = { id: '33333333-3333-3333-3333-333333333333', loja: 'Boulevard', data: '2026-11-13', visitante: 'Tiago', cargo: 'mestre', hora_chegada: '09:03', hora_saida: '11:00', tipo_visita: 'checklist' };

// ── Servidor de mentira ─────────────────────────────────────────────────────────────
const linhas = [];      // gn_visita_checklist
let rpcFora = false;    // simula sem internet pra gravação
const chamadas = [];
function setPathSrv(d, path, v) {
  let o = d;
  for (let i = 0; i < path.length - 1; i++) {
    if (!o[path[i]] || typeof o[path[i]] !== 'object') o[path[i]] = {};
    o = o[path[i]];
  }
  if (v === null) delete o[path[path.length - 1]]; else o[path[path.length - 1]] = v;
}
async function rota(route) {
  const req = route.request(), url = decodeURIComponent(req.url()), m = req.method();
  const json = (b, st) => route.fulfill({ status: st || 200, contentType: 'application/json', body: JSON.stringify(b) });
  if (/rpc\/gn_visita_ck_set/.test(url)) {
    if (rpcFora) return route.abort('internetdisconnected');
    const b = JSON.parse(req.postData());
    chamadas.push({ rpc: b });
    const l = linhas.find(x => x.id === b.p_id);
    setPathSrv(l.dados, b.p_path, b.p_valor);
    return json(l.dados);
  }
  if (/gn_visita_checklist/.test(url)) {
    if (m === 'GET') {
      const vid = (url.match(/visita_id=eq\.([^&]+)/) || [])[1];
      const tipo = (url.match(/tipo=eq\.([^&]+)/) || [])[1];
      const lista = (url.match(/visita_id=in\.\(([^)]+)\)/) || [])[1];
      let r = linhas;
      if (vid) r = r.filter(x => x.visita_id === vid);
      if (tipo) r = r.filter(x => x.tipo === tipo);
      if (lista) { const ids = lista.split(','); r = r.filter(x => ids.includes(x.visita_id)); }
      return json(JSON.parse(JSON.stringify(r)));
    }
    if (m === 'POST') {
      if (rpcFora) return route.abort('internetdisconnected');
      const b = JSON.parse(req.postData());
      if (linhas.some(x => x.visita_id === b.visita_id && x.tipo === b.tipo)) return json({ message: 'duplicate' }, 409);
      const l = { id: 'ck-' + (linhas.length + 1), dados: {}, nota: null, finalizada: false, ...b };
      linhas.push(l);
      return json([l], 201);
    }
    if (m === 'PATCH') {
      if (rpcFora) return route.abort('internetdisconnected');
      const id = (url.match(/id=eq\.([^&]+)/) || [])[1];
      const b = JSON.parse(req.postData());
      chamadas.push({ patch: b });
      Object.assign(linhas.find(x => x.id === id), b);
      return route.fulfill({ status: 204, body: '' });
    }
  }
  if (/gn_chk_visitas/.test(url) && m !== 'GET') { chamadas.push({ visita: url }); return json([]); }
  if (/checklist_diario/.test(url) && /Boulevard/.test(url)) {
    return json([{ supervisao: { itens: { visual: { limpeza_geral: 1 } }, supervisor: 'Tiago' }, supervisao_cozinha: {}, auditorias_padrao: {} }]);
  }
  if (/storage\/v1\/object/.test(url)) return json({ Key: 'x' });
  return json([]);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  // ── 1. Paridade com o app Check-list ────────────────────────────────────────────────
  {
    const ctx = await browser.newContext();
    await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    const pg = await ctx.newPage();
    await pg.goto('file://' + CHK);
    await pg.waitForFunction(() => { try { return typeof SUP_SETORES === 'object' && typeof AUDITORIA_PADRAO_TIPOS === 'object' && typeof calcNotaCozinha === 'function'; } catch (e) { return false; } }, { timeout: 30000 });
    await pg.addScriptTag({ path: CAMINHOS.pub('gn-visita-checklist.js') });
    const par = await pg.evaluate(() => {
      const so = (lst, f) => JSON.stringify(lst.map(s => ({ k: s.key, l: s.label, i: s.itens.map(f) })));
      const fs = i => [i.key, i.label, i.peso || 1, !!i.critico];
      const fc = i => [i.key, i.label, !!i.critico];
      const fa = i => [i.label, i.peso, i.crit];
      const defs = {
        sup: so(SUP_SETORES, fs) === so(GNVck.SUP_SETORES, fs),
        coz: so(COZ_SETORES, fc) === so(GNVck.COZ_SETORES, fc),
        aud: so(AUDITORIA_PADRAO_TIPOS, fa) === so(GNVck.AUDP_TIPOS, fa),
      };
      // Contas: 300 avaliações sorteadas passadas pelas duas implementações.
      let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      let difS = 0, difC = 0, difA = 0;
      for (let n = 0; n < 300; n++) {
        const itS = {}, itC = {};
        SUP_SETORES.forEach(s => { itS[s.key] = {}; s.itens.forEach(i => { if (rnd() < .8) itS[s.key][i.key] = Math.floor(rnd() * 11); }); });
        COZ_SETORES.forEach(s => { itC[s.key] = {}; s.itens.forEach(i => { const x = rnd(); if (x < .85) itC[s.key][i.key] = x < .6 ? 'C' : x < .75 ? 'NC' : 'NA'; }); });
        const ap = {};
        AUDITORIA_PADRAO_TIPOS.forEach(t => { ap[t.key] = { itens: {} }; t.itens.forEach((_, i) => { const x = rnd(); if (x < .9) ap[t.key].itens[i] = { resp: x < .65 ? 'SIM' : x < .8 ? 'NAO' : 'NA' }; }); });
        state.supervisao = { itens: itS }; state.supervisaoCozinha = { itens: itC };
        const a = calcNotaSupervisao(), b = GNVck.calcSalao({ itens: itS });
        if (a.nota !== b.nota || a.criticos.length !== b.criticos.length) difS++;
        if (getClassificacao(a.nota).label !== GNVck.classSalao(b.nota).label) difS++;
        const c = calcNotaCozinha(), d = GNVck.calcCozinha({ itens: itC });
        if (c.pct !== d.nota) difC++;
        if (getClassificacaoCozinha(c.pct, c.criticos.length > 0).label !== GNVck.classCozinha(d.nota, d.criticos.length > 0).label) difC++;
        if ((c.criticos || []).length !== d.criticos.length) difC++;
        AUDITORIA_PADRAO_TIPOS.forEach(t => { const x = _audpCalcularDe(ap, t.key), y = GNVck.calcPadrao(ap, t.key); if (JSON.stringify(x) !== JSON.stringify(y)) difA++; });
      }
      return { defs, difS, difC, difA };
    });
    check('setores e itens da Supervisão salão iguais aos do Check-list', par.defs.sup);
    check('setores e itens da Supervisão cozinha iguais aos do Check-list', par.defs.coz);
    check('os 5 tipos da Auditoria de padrão iguais aos do Check-list', par.defs.aud);
    check('nota e críticos do salão batem em 300 avaliações sorteadas', par.difS === 0, par.difS);
    check('nota e críticos da cozinha batem em 300 avaliações sorteadas', par.difC === 0, par.difC);
    check('nota e status da auditoria batem em 300×5 avaliações sorteadas', par.difA === 0, par.difA);

    // ── Etapa 3: a aba Visitas saiu do Check-list ──
    const e3 = await pg.evaluate(() => {
      const entradas = [...document.querySelectorAll('.tab-btn, .sidebar-link')].filter(b => /switchTab\('(visitas|supervisao|supervisao-cozinha|auditoria-padrao)'/.test(b.getAttribute('onclick') || ''));
      const antes = (document.querySelector('.tab-content.active') || {}).id;
      let toast = '';
      const orig = window.showToast; window.showToast = (m) => { toast = m; };
      ['visitas', 'supervisao', 'supervisao-cozinha', 'auditoria-padrao'].forEach(t => switchTab(t, null));
      window.showToast = orig;
      try { localStorage.setItem(_tabsRecentesChave(), JSON.stringify(['visitas', 'dados'])); } catch (e) {}
      _renderTabsRecentes();
      const rec = (document.getElementById('tabs-recentes') || {}).innerHTML || '';
      return { n: entradas.length, antes, depois: (document.querySelector('.tab-content.active') || {}).id, toast, recVisitas: /visitas/.test(rec),
        guia: (GUIA_SECOES || []).find ? ((GUIA_SECOES.find(g => g.id === 'visitas') || {}).resumo || '') : '' };
    }).catch(e => ({ erro: String(e) }));
    check('Check-list não tem mais botão nem menu de Visitas/Supervisão/Auditoria', e3.n === 0, e3);
    check('tentar abrir uma dessas telas avisa onde ficou e não troca de aba', e3.antes === e3.depois && /Painel de Gestão › Visitas/.test(e3.toast), e3);
    check('atalho antigo de "Visitas" nas abas recentes some', !e3.recVisitas, e3);
    check('guia do Check-list aponta pro Painel', /Painel de Gestão › Visitas/.test(e3.guia), e3.guia);
    await ctx.close();
  }

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 400, height: 900 } });
  await ctx.route('**/rest/v1/**', rota);
  await ctx.route('**/storage/v1/**', rota);

  async function abrirPainel() {
    const page = await ctx.newPage();
    for (let t = 1; ; t++) {
      await page.goto('file://' + HOME);
      try {
        await page.waitForFunction(() => { try { return typeof _visCalDetalheHtml === 'function' && !!window.GNVck; } catch (e) { return false; } }, { timeout: 25000 });
        break;
      } catch (e) { if (t >= 3) { console.log('FALHOU: o painel não carregou'); process.exit(1); } }
    }
    await page.evaluate((vs) => {
      session = { id: 1, nome: 'Carlos', loja: 'GERAL', cargo: 'supervisor', permissoes: {} };
      _visCalData = vs;
      ['2026-11-20', '2026-11-13'].forEach(d => {
        const box = document.createElement('div'); box.id = '_t-' + d; document.body.appendChild(box);
        box.innerHTML = _visCalDetalheHtml(d);
      });
    }, [VISITA, REMOTA, ANTIGA]);
    await page.waitForTimeout(300);
    return page;
  }
  const estado = (page) => page.evaluate(() => { const r = GNVck._estado(); return r ? { dados: r.dados, fila: r.fila.length, erro: !!r.erro } : null; });
  const esperarFilaVazia = (page) => page.waitForFunction(() => { const r = GNVck._estado(); return r && !r.fila.length && !r.enviando; }, { timeout: 8000 }).then(() => true, () => false);
  const abrirCk = async (page, tipo) => {
    await page.click(`._vck-btns[data-vck-visita="${VISITA.id}"] button:nth-child(${({ salao: 1, cozinha: 2, padrao: 3 })[tipo]})`);
    await page.waitForFunction(() => !!GNVck._estado(), { timeout: 8000 });
  };

  // ── 2. Botões ───────────────────────────────────────────────────────────────────────
  const A = await abrirPainel();
  const botoes = await A.evaluate((ids) => ({
    presencial: !!document.querySelector(`._vck-btns[data-vck-visita="${ids[0]}"]`),
    remota: !!document.querySelector(`._vck-btns[data-vck-visita="${ids[1]}"]`),
    texto: (document.querySelector(`._vck-btns[data-vck-visita="${ids[0]}"]`) || {}).textContent || '',
  }), [VISITA.id, REMOTA.id]);
  check('visita presencial tem os 3 check-lists', botoes.presencial && /Salão/.test(botoes.texto) && /Cozinha/.test(botoes.texto) && /Auditoria/.test(botoes.texto), botoes.texto);
  check('acompanhamento remoto não tem check-list (ninguém está na loja)', !botoes.remota);

  // ── 3. Marcar e reabrir ─────────────────────────────────────────────────────────────
  await abrirCk(A, 'salao');
  check('abre em tela cheia', await A.evaluate(() => { const m = document.getElementById('_vck-modal'); return !!m && getComputedStyle(m).position === 'fixed'; }));
  // Caso real (print 13/11): a visita é aberta de DENTRO da janela "Visitas por Supervisor".
  // O check-list tem que ficar POR CIMA dela — antes abria por baixo e o toque "não fazia nada".
  const porCima = await A.evaluate(() => {
    const ov = document.getElementById('visitas-sup-overlay');
    if (ov) ov.style.display = 'flex';
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    const r = !!el && !!el.closest('#_vck-modal');
    if (ov) ov.style.display = '';
    return { r, temOverlay: !!ov, z: getComputedStyle(document.getElementById('_vck-modal')).zIndex };
  });
  check('abre por cima da janela "Visitas por Supervisor"', porCima.r && porCima.temOverlay, porCima);
  await A.evaluate(() => { GNVck._nota('visual', 'limpeza_geral', 9); GNVck._nota('validade', 'val_cozinha', 4); GNVck._nota('operacao', 'camaras', 8); });
  check('as marcações sobem pro servidor', await esperarFilaVazia(A));
  const srv1 = linhas.find(l => l.visita_id === VISITA.id && l.tipo === 'salao');
  check('servidor guarda as 3 notas no lugar certo',
    srv1 && srv1.dados.itens.visual.limpeza_geral === 9 && srv1.dados.itens.validade.val_cozinha === 4 && srv1.dados.itens.operacao.camaras === 8, srv1 && srv1.dados);
  check('cada toque é uma gravação só daquele item (não o check-list inteiro)',
    chamadas.filter(c => c.rpc).every(c => Array.isArray(c.rpc.p_path) && c.rpc.p_path.length <= 3));
  const tela = await A.evaluate(() => document.getElementById('_vck-modal').textContent);
  check('crítico com nota baixa vira plano de ação', /Plano de ação/.test(tela) && /Validades em dia na cozinha/.test(tela));
  // ── Frases prontas na observação de cada pergunta (só quando o item não está 100%) ──
  const obsChips = await A.evaluate(() => {
    const blocos = [...document.querySelectorAll('#_vck-modal [data-vck-item]')];
    const chipsDe = (txt) => { const b = blocos.find(x => x.textContent.includes(txt)); return b ? [...b.querySelectorAll('button')].map(x => x.textContent.trim()).filter(t => /^[+✓] /.test(t)) : null; };
    return { val4: chipsDe('Validades em dia na cozinha'), cam8: chipsDe('Câmaras frias limpas'), limp9: chipsDe('Limpeza geral do salão') };
  });
  check('nota baixa: a observação da pergunta traz frases prontas daquele item', (obsChips.val4 || []).includes('+ Produto vencido encontrado') && (obsChips.cam8 || []).includes('+ Temperatura sem registro'), obsChips);
  check('nota 9 ou 10: sem frases (item ok fica limpo)', Array.isArray(obsChips.limp9) && obsChips.limp9.length === 0, obsChips.limp9);
  await A.evaluate(() => GNVck._chip(['itens', 'operacao', 'camaras_obs'], 'Temperatura sem registro'));
  await esperarFilaVazia(A);
  check('tocar na frase grava na observação do item', srv1.dados.itens.operacao.camaras_obs === 'Temperatura sem registro', srv1.dados.itens.operacao);
  const chipsSalao = await A.evaluate(() => [...document.querySelectorAll('#_vck-modal button')].map(b => b.textContent.trim()).filter(t => /^\+ /.test(t)));
  check('plano de ação do crítico traz opções prontas daquela questão', chipsSalao.includes('+ Descartar na hora os vencidos e registrar a perda') && chipsSalao.includes('+ Treinar a equipe no padrão'), chipsSalao);
  await A.evaluate(() => { GNVck._chip(['acoes', 'validade|val_cozinha'], 'Descartar na hora os vencidos e registrar a perda'); GNVck._chip(['acoes', 'validade|val_cozinha'], 'Treinar a equipe no padrão'); });
  await esperarFilaVazia(A);
  check('tocar em duas opções junta as duas no plano', srv1.dados.acoes['validade|val_cozinha'] === 'Descartar na hora os vencidos e registrar a perda; Treinar a equipe no padrão', srv1.dados.acoes);
  await A.evaluate(() => { const el = document.createElement('textarea'); el.value = GNVck._estado().dados.acoes['validade|val_cozinha'] + '; até sexta, com o Marcos'; GNVck._texto(el, ['acoes', 'validade|val_cozinha']); GNVck._chip(['acoes', 'validade|val_cozinha'], 'Treinar a equipe no padrão'); });
  await esperarFilaVazia(A);
  check('texto livre continua junto, e tocar de novo tira só aquela opção', srv1.dados.acoes['validade|val_cozinha'] === 'Descartar na hora os vencidos e registrar a perda; até sexta, com o Marcos', srv1.dados.acoes);
  await A.evaluate(() => GNVck._nota('visual', 'limpeza_geral', 9));
  await esperarFilaVazia(A);
  check('tocar de novo na mesma nota desmarca', srv1.dados.itens.visual.limpeza_geral === undefined);
  await A.evaluate(() => GNVck._nota('visual', 'limpeza_geral', 10));
  await esperarFilaVazia(A);
  await A.close();

  const B = await abrirPainel();
  const resumoTxt = await B.evaluate((id) => document.querySelector(`._vck-btns[data-vck-visita="${id}"]`).textContent, VISITA.id);
  check('o botão mostra que o salão está em andamento', /Em andamento/.test(resumoTxt), resumoTxt);
  await abrirCk(B, 'salao');
  const e1 = await estado(B);
  check('depois de fechar e abrir a página, as marcações continuam',
    e1.dados.itens.visual.limpeza_geral === 10 && e1.dados.itens.validade.val_cozinha === 4 && e1.dados.itens.operacao.camaras === 8, e1.dados.itens);

  // ── 4. Dois aparelhos ───────────────────────────────────────────────────────────────
  const C = await abrirPainel();
  await abrirCk(C, 'salao');
  await Promise.all([
    B.evaluate(() => { GNVck._nota('atendimento', 'postura', 7); GNVck._nota('atendimento', 'reservas', 6); }),
    C.evaluate(() => { GNVck._nota('delivery_financeiro', 'boletos', 5); GNVck._nota('documentacao', 'licenca', 10); }),
  ]);
  await esperarFilaVazia(B); await esperarFilaVazia(C);
  const it = srv1.dados.itens;
  check('dois aparelhos marcando ao mesmo tempo: nada se perde no servidor',
    it.atendimento.postura === 7 && it.atendimento.reservas === 6 && it.delivery_financeiro.boletos === 5 && it.documentacao.licenca === 10 && it.visual.limpeza_geral === 10, it);
  await C.close();

  // ── 5. Sem internet ─────────────────────────────────────────────────────────────────
  rpcFora = true;
  await B.evaluate(() => { GNVck._nota('operacao', 'etiquetas', 3); GNVck._nota('visual', 'banheiros', 9); });
  await B.waitForTimeout(400);
  const off = await estado(B);
  const syncTxt = await B.evaluate(() => document.getElementById('_vck-sync').textContent);
  check('sem internet: a tela avisa que ficou guardado no aparelho', off.fila >= 2 && /sem enviar/.test(syncTxt), syncTxt);
  check('e o servidor ainda não tem', srv1.dados.itens.operacao.etiquetas === undefined);
  await B.close();
  const D = await abrirPainel();   // recarregou a página ainda sem internet pra gravar
  await abrirCk(D, 'salao');
  const e2 = await estado(D);
  check('recarregar sem internet NÃO apaga a marcação (era o "some às vezes")',
    e2.dados.itens.operacao.etiquetas === 3 && e2.dados.itens.visual.banheiros === 9 && e2.fila >= 2, e2);
  rpcFora = false;
  await D.evaluate(() => GNVck._enviar());
  check('quando a internet volta, sobe sozinho', await esperarFilaVazia(D));
  check('e o servidor fica com tudo', srv1.dados.itens.operacao.etiquetas === 3 && srv1.dados.itens.visual.banheiros === 9);

  // ── 6a. Finalizar ───────────────────────────────────────────────────────────────────
  D.on('dialog', d => d.accept());
  const notaEsperada = await D.evaluate(() => GNVck.calcSalao(GNVck._estado().dados).nota);
  await D.evaluate(() => GNVck._finalizar());
  await esperarFilaVazia(D);
  check('finalizar grava nota, finalizada e quem', srv1.finalizada === true && srv1.nota === notaEsperada && srv1.finalizada_por === 'Carlos' && srv1.dados.fechada === true, { f: srv1.finalizada, n: srv1.nota, esperado: notaEsperada, por: srv1.finalizada_por });
  await D.evaluate(() => GNVck._nota('visual', 'uniformes', 2));
  await D.waitForTimeout(200);
  check('finalizada trava os itens', srv1.dados.itens.visual.uniformes === undefined);
  const fimTela = await D.evaluate(() => document.getElementById('_vck-modal').textContent.replace(/\s+/g, ' '));
  check('o texto diz que fechou o check-list, não a visita', /Check-list do Salão finalizado/.test(fimTela) && /encerra só pela saída/.test(fimTela) && !/Visita finalizada/.test(fimTela), fimTela.slice(-200));

  // ── Relatório pra diretoria (WhatsApp / PDF / PDF no Whats) ──
  const rel = await D.evaluate(async () => {
    const botoes = [...document.querySelectorAll('#_vck-modal button')].map(b => b.textContent.trim());
    const r = GNVck.relatorio();
    const cap = { textos: [], arquivos: [] };
    // jsPDF de mentira: registra o que seria desenhado (o real vem de CDN).
    const textos = cap.textos;
    window.jspdf = { jsPDF: class { constructor() { this.internal = { pageSize: { getHeight: () => 842, getWidth: () => 595 }, getNumberOfPages: () => 1 }; }
      setFont() {} setFontSize() {} setTextColor() {} setFillColor() {} setDrawColor() {} setLineWidth() {} setCharSpace() {} setPage() {}
      getTextWidth(t) { return String(t).length * 6; } splitTextToSize(t) { return String(t).split('\n'); }
      text(t) { (Array.isArray(t) ? t : [t]).forEach(x => textos.push(String(x))); } roundedRect() {} rect() {} line() {} circle() {} addPage() {} addImage() {}
      output() { return new Blob(['%PDF-1.3'], { type: 'application/pdf' }); } } };
    window.open = (u) => { cap.wpp = u; return null; };
    navigator.canShare = () => true; navigator.share = async (o) => { cap.arquivos.push(o.files[0].name + '|' + o.files[0].type); };
    GNVck.config({ garantirJsPDF: async () => {} });
    GNVck._relWpp(); const fPdf = await GNVck._relPdf(); await GNVck._relPdfWpp();
    cap.pdfNome = fPdf && fPdf.name;
    return { botoes, r, cap, larguraOk: [...document.querySelectorAll('#_vck-modal button')].filter(b => /PDF no Whats/.test(b.textContent)).every(b => b.scrollWidth <= b.clientWidth + 1) };
  });
  check('check-list finalizado mostra 📲 WhatsApp, 📄 PDF e 📄📲 PDF no Whats', ['📲 WhatsApp', '📄 PDF', '📄📲 PDF no Whats'].every(b => rel.botoes.includes(b)), rel.botoes.filter(b => /📲|📄/.test(b)));
  check('o texto do botão "PDF no Whats" cabe dentro dele (print do dono: passava da borda)', rel.larguraOk);
  check('relatório traz loja, data, supervisão, nota e classificação', /SUPERVISÃO SALÃO — Bangu/.test(rel.r.texto) && /20\/11\/2026/.test(rel.r.texto) && /Supervisão: Carlos/.test(rel.r.texto) && new RegExp('NOTA: ' + notaEsperada + '/100').test(rel.r.texto), rel.r.texto.slice(0, 300));
  check('…a nota de cada setor e item avaliado', /Segurança Alimentar e Validades/.test(rel.r.texto) && /Validades em dia na cozinha — nenhum produto vencido: \*4\*/.test(rel.r.texto), rel.r.texto);
  check('…os críticos com o plano de ação escolhido', /Críticos \(1\)/.test(rel.r.texto) && /Ação: Descartar na hora os vencidos e registrar a perda; até sexta, com o Marcos/.test(rel.r.texto), rel.r.texto);
  check('…e quem finalizou', /Finalizado por Carlos/.test(rel.r.texto));
  check('WhatsApp abre com o texto do relatório', /^https:\/\/wa\.me\/\?text=/.test(rel.cap.wpp || '') && decodeURIComponent(rel.cap.wpp).includes('NOTA: ' + notaEsperada));
  const tx = rel.cap.textos.join(' | ');
  check('PDF no padrão GN: marca, título, cartões de resumo e seções', /^GN \| SISTEMA DE GESTÃO/.test(tx) && /Supervisão salão - Bangu/.test(tx) && /NOTA/.test(tx) && /CLASSIFICAÇÃO/.test(tx) && /ITENS CRÍTICOS/.test(tx) && /Segurança Alimentar e Validades/.test(tx) && /Críticos \(1\)/.test(tx), tx.slice(0, 300));
  check('PDF sem emoji (a fonte do PDF não tem)', !rel.cap.textos.some(t => /[^\u0000-\u00FF]/.test(t)), rel.cap.textos.filter(t => /[^\u0000-\u00FF]/.test(t)));
  check('PDF baixa como arquivo .pdf com loja e data no nome', /^Supervis.o_sal.o_-_Bangu_-_20_11_2026\.pdf$/.test(rel.cap.pdfNome || ''), rel.cap.pdfNome);
  check('PDF no Whats compartilha o mesmo arquivo PDF', rel.cap.arquivos.length === 1 && rel.cap.arquivos[0] === rel.cap.pdfNome + '|application/pdf', rel.cap.arquivos);
  check('finalizar o check-list não mexe na visita (chegada/saída)', !chamadas.some(c => c.visita), chamadas.filter(c => c.visita));

  // ── 6b. Cozinha ─────────────────────────────────────────────────────────────────────
  await D.evaluate(() => GNVck._trocarTipo('cozinha'));
  await D.waitForFunction(() => GNVck._ctx() && GNVck._ctx().tipo === 'cozinha' && GNVck._estado());
  await D.evaluate(() => { GNVck._coz('documentacao', 'lsf', 'C'); GNVck._coz('documentacao', 'pops', 'NC'); GNVck._coz('ambientes', 'janelas', 'NA'); GNVck._coz('ambientes', 'janelas', 'NA'); });
  await esperarFilaVazia(D);
  const coz = linhas.find(l => l.visita_id === VISITA.id && l.tipo === 'cozinha');
  check('cozinha grava C / NC e tocar de novo limpa', coz.dados.itens.documentacao.lsf === 'C' && coz.dados.itens.documentacao.pops === 'NC' && coz.dados.itens.ambientes.janelas === undefined, coz.dados);
  const cozTela = await D.evaluate(() => document.getElementById('_vck-modal').textContent);
  check('crítico não conforme da cozinha aparece como risco de interdição', /risco de interdição/.test(cozTela) && /50%/.test(cozTela));
  const cozObs = await D.evaluate(() => {
    const blocos = [...document.querySelectorAll('#_vck-modal [data-vck-item]')];
    const chipsDe = (txt) => { const b = blocos.find(x => x.textContent.includes(txt)); return b ? [...b.querySelectorAll('button')].map(x => x.textContent.trim()).filter(t => /^[+✓] /.test(t)) : null; };
    return { pops: chipsDe('Manual de Boas Práticas'), lsf: chipsDe('Licença Sanitária') };
  });
  check('cozinha: "Não conforme" traz frases prontas na observação; "Conforme" não', (cozObs.pops || []).includes('+ Faltam assinaturas da equipe') && Array.isArray(cozObs.lsf) && cozObs.lsf.length === 0, cozObs);

  // ── 6c. Auditoria de padrão ─────────────────────────────────────────────────────────
  await D.evaluate(() => GNVck._trocarTipo('padrao'));
  await D.waitForFunction(() => GNVck._ctx() && GNVck._ctx().tipo === 'padrao' && GNVck._estado());
  await D.evaluate(() => { GNVck._padraoTipo('calibracao_equipamentos'); GNVck._resp(0, 'SIM'); GNVck._resp(1, 'NAO'); GNVck._resp(2, 'SIM'); });
  const travadoAntes = await D.evaluate(() => [...document.querySelectorAll('#_vck-modal button')].find(b => /Finalizar auditoria/.test(b.textContent)).disabled);
  check('auditoria só finaliza com todos os itens respondidos', travadoAntes);
  await D.evaluate(() => { GNVck._resp(3, 'NA'); GNVck._padraoFinalizar(); });
  await esperarFilaVazia(D);
  const aud = linhas.find(l => l.visita_id === VISITA.id && l.tipo === 'padrao');
  const cal = aud && aud.dados.calibracao_equipamentos;
  check('finalizar gera plano de ação pro NÃO, com prazo de item MAIOR (48h)',
    cal && cal.finalizada === true && cal.planoAcao && cal.planoAcao['0'] && cal.planoAcao['0'].crit === 'MAIOR' && cal.notaFinal === 57.1, cal);
  await D.evaluate(() => { const el = document.createElement('input'); el.value = 'Trocar o filtro da coifa'; GNVck._texto(el, ['calibracao_equipamentos', 'planoAcao', '0', 'acaoCorretiva']); });
  await esperarFilaVazia(D);
  const chipsAud = await D.evaluate(() => [...document.querySelectorAll('#_vck-modal button')].map(b => b.textContent.trim()).filter(t => /^[+✓] /.test(t)));
  check('plano da auditoria: opções de ação corretiva, responsável e preventiva daquela questão',
    chipsAud.includes('+ Limpar os filtros da coifa hoje') && chipsAud.includes('+ Gerente') && chipsAud.includes('+ Limpeza de filtros na escala semanal'), chipsAud);
  await D.evaluate(() => GNVck._chip(['calibracao_equipamentos', 'planoAcao', '0', 'responsavel'], 'Gerente'));
  await esperarFilaVazia(D);
  check('opção de responsável grava no plano', cal.planoAcao['0'].responsavel === 'Gerente');
  check('campo do plano de ação grava sozinho, sem apagar o resto do plano',
    cal.planoAcao['0'].acaoCorretiva === 'Trocar o filtro da coifa' && cal.planoAcao['0'].crit === 'MAIOR');
  await D.evaluate(() => GNVck.fechar());
  await D.waitForTimeout(500);
  const resumoFim = await D.evaluate((id) => document.querySelector(`._vck-btns[data-vck-visita="${id}"]`).textContent, VISITA.id);
  check('ao voltar, o botão do salão mostra a nota final', new RegExp('✓ ' + notaEsperada + '/100').test(resumoFim), resumoFim);

  // ── 7. Registro antigo ──────────────────────────────────────────────────────────────
  const antigoBtn = await D.evaluate((id) => { const el = document.querySelector(`._vck-btns[data-vck-visita="${id}"]`); return el ? el.textContent : ''; }, ANTIGA.id);
  check('visita antiga do app Check-list oferece ver o registro de lá', /Ver o check-list feito no app Check-list/.test(antigoBtn), antigoBtn);
  const nGrav = chamadas.length;
  await D.evaluate((id) => _vckAbrirLegado(id, 'salao'), ANTIGA.id);
  await D.waitForFunction(() => GNVck._estado() && GNVck._estado().somenteLeitura, { timeout: 8000 });
  const leg = await D.evaluate(() => ({ t: document.getElementById('_vck-modal').textContent, dis: [...document.querySelectorAll('#_vck-modal button')].filter(b => /^\d+$/.test(b.textContent.trim())).every(b => b.disabled) }));
  await D.evaluate(() => GNVck._nota('visual', 'limpeza_geral', 9));
  check('registro antigo abre só pra leitura, com o que tinha', /só leitura/.test(leg.t) && leg.dis && chamadas.length === nGrav, leg.t.slice(0, 200));

  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
