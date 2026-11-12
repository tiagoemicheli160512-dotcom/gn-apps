// "As lojas pediram pra colocar [as ocorrências] na Home das lojas, igual temos os outros de
//  cancelamento etc., e colocar o índice de lojas com mais ocorrências; e replicar no Painel
//  de Gestão o índice também." (12/11/2026)
//
// Decisões do dono: índice = (falta + advertência + suspensão) ÷ equipe; 1º = MENOS ocorrências
// (igual aos outros quadradinhos). Cobra: o quadradinho em "Como a loja está" com o total do
// mês, o detalhe e "Xº de N"; o cartão com a posição, o índice da loja e o da rede, as pessoas;
// só até hoje (dia futuro marcado não conta); Maglia fora; a consulta pede só as semanas do mês
// com a chave entre aspas (sem aspas o PostgREST devolve null); garçom não vê; o Painel mostra
// a mesma posição.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 500)); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-12T15:00:00');   // quinta; semana 44 = 09/11–15/11
  const D = o => { const a = Array(7).fill('PRESENTE'); Object.entries(o).forEach(([i, v]) => a[i] = v); return a; };
  const f = (nome, setor, dias, docs) => ({ nome, setor, dias: D(dias || {}), docs: docs || {} });
  const ROWS = [
    // Bangu: 2 na equipe; falta seg (09/11) conta, falta SÁBADO 14/11 (futuro) NÃO conta; 1 advertência.
    { loja: 'BANGU', w44: { funcs: [f('Ana', 'Salão', { 0: 'FALTA', 5: 'FALTA' }, { ADVERTENCIA: 'u' }), f('Bia', 'Cozinha', { 1: 'ATESTADO' })] } },
    // Caxias: 4 na equipe, nada.
    { loja: 'CAXIAS', w44: { funcs: [f('C1', 'Salão'), f('C2', 'Salão'), f('C3', 'Salão'), f('C4', 'Salão')] } },
    // Nova América: 10 na equipe, 1 falta → 0,10 por pessoa.
    { loja: 'NOVA_AMERICA', w44: { funcs: Array.from({ length: 10 }, (_, i) => f('N' + i, 'Salão', i === 0 ? { 2: 'FALTA' } : {})) } },
    { loja: 'MAGLIA', w44: { funcs: [f('M', 'Salão', { 0: 'FALTA', 1: 'FALTA', 2: 'FALTA' })] } },
  ];
  let urlEscala = '';
  await ctx.route('**/rest/v1/**', r => {
    const u = r.request().url();
    if (/gn_comissoes\?/.test(u) && /select=loja,w/.test(decodeURIComponent(u))) { urlEscala = decodeURIComponent(u); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ROWS) }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof _renderOcorrHome === 'function' && COMISSOES_CAL.length > 0; } catch (e) { return false; } }, { timeout: 25000 }); break; }
    catch (e) { if (t >= 3) { console.log('FALHOU: a Home não carregou (ou falta o código novo)'); console.log('\n0 OK, 1 falhou'); process.exit(1); } }
  }
  const render = (loja, cargo) => page.evaluate(async ([loja, cargo]) => {
    _ocorHome = null;
    document.getElementById('home-screen').style.display = 'block';
    await _renderOcorrHome(true, { id: 1, nome: 'x', cargo, loja, permissoes: {} }, false);
    const el = document.getElementById('ocorr-rede-home-card');
    let tile = null; try { tile = el.dataset.homeTile ? JSON.parse(el.dataset.homeTile) : null; } catch (e) {}
    return { tile, txt: el.innerText.replace(/\s+/g, ' '), html: el.innerHTML, rank: _ocorHome ? _ocorHome.idx.ordem.map(l => l.k + ':' + l.pos) : [], rede: _ocorHome && _ocorHome.idx.redeIndice };
  }, [loja, cargo]);

  let r = await render('BANGU', 'gerente');
  check('a consulta pede só as semanas do mês (com folga pra herança), com a chave ENTRE ASPAS', /w44:all_data->"44"/.test(urlEscala) && !/w30:/.test(urlEscala) && /w40:all_data->"40"/.test(urlEscala), urlEscala.slice(0, 300));
  check('quadradinho "Ocorrências no mês": Bangu 2 (1 falta até hoje + 1 advertência; a falta de sábado é futura)', r.tile && r.tile.k === 'ocorr' && r.tile.valor === '2' && /1 falta · 1 adv\. · 0 susp\./.test(r.tile.detalhe), JSON.stringify(r.tile));
  check('índice por pessoa e 1º = MENOS: Caxias 1º (0), Nova América 2º (0,10), Bangu 3º (1,00)', r.rank.join(',') === 'CAXIAS:1,NOVA AMERICA:2,BANGU:3', r.rank.join(','));
  check('o quadradinho mostra "3º de 3" (só lojas com escala entram)', r.tile && r.tile.pos === '3º de 3', JSON.stringify(r.tile));
  check('Maglia fica fora (não está no consolidado)', !r.rank.some(x => /MAGLIA/i.test(x)));
  check('rede: 3 ocorrências ÷ 16 pessoas = 0,19 por pessoa', Math.abs(r.rede - 3 / 16) < 1e-9 && /rede 0,19/.test(r.txt), r.txt.slice(0, 200));
  check('o cartão: título, período até hoje, posição e índice da loja', /Ocorrências da loja no mês/.test(r.txt) && /01\/11 a 12\/11/.test(r.txt) && /3º de 3 na rede · 1,00 por pessoa/.test(r.txt), r.txt.slice(0, 260));
  check('…e as pessoas com o que teve (Ana: 1 falta e 1 advertência; Bia: atestado)', /Ana · Salão/.test(r.txt) && /Bia · Cozinha/.test(r.txt), r.txt);
  check('a loja não vê o nome das outras lojas', !/Caxias|Nova América/.test(r.txt));
  r = await render('CAXIAS', 'gerente');
  // 12/11/2026: zero não é mérito automático — pode ser escala que não é marcada.
  check('loja zerada: "1º de 3", em âmbar, com "confira a escala" (não verde)', r.tile && r.tile.valor === '0' && r.tile.cor === 'amber' && r.tile.pos === '1º de 3' && /confira a escala/.test(r.tile.detalhe), JSON.stringify(r.tile));
  check('…e o cartão pede pra conferir se a escala está sendo marcada', /confira se a escala está sendo marcada/.test(r.txt), r.txt.slice(0, 300));
  r = await render('BANGU', 'garcom');
  check('garçom não vê o quadradinho (mesma plateia do cancelamento)', !(r.tile && r.tile.k) && r.html === '', JSON.stringify(r.tile));
  r = await render('MAGLIA', 'gerente');
  check('na Home da Maglia o quadradinho não aparece', !(r.tile && r.tile.k) && r.html === '', JSON.stringify(r.tile));

  // ── O Painel mostra a mesma posição ────────────────────────────────────────────────
  const painel = await page.evaluate(() => {
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } }; masterLoja = null;
    _dashComissoesAll = [
      { loja: 'BANGU', all_data: { 44: { funcs: [{ nome: 'Ana', setor: 'Salão', dias: ['FALTA','PRESENTE','PRESENTE','PRESENTE','PRESENTE','FALTA','PRESENTE'], docs: { ADVERTENCIA: 'u' } }, { nome: 'Bia', setor: 'Cozinha', dias: Array(7).fill('PRESENTE'), docs: {} }] } } },
      { loja: 'CAXIAS', all_data: { 44: { funcs: [1, 2, 3, 4].map(i => ({ nome: 'C' + i, setor: 'Salão', dias: Array(7).fill('PRESENTE'), docs: {} })) } } },
    ];
    _dashPer = 'sem'; _dashWoff = 0;
    const d = _ocorDados();
    return { ordem: d.lojas.slice(0, 2).map(l => l.k + ':' + l.pos), html: _buildOcorrenciasPanel() };
  });
  check('Painel: a lista começa por quem precisa de atenção (maior índice) e mostra a posição', painel.ordem.join(',') === 'BANGU:2,CAXIAS:1', painel.ordem.join(','));
  check('…com "2º de 2 · 1,00 por pessoa" na linha da loja e a explicação do índice', /2º de 2<\/b> · 1,00 por pessoa/.test(painel.html) && /1º = menos ocorrências/.test(painel.html), '');
  check('Painel: a loja zerada (Caxias) leva o aviso de conferir a escala, e o resumo conta as zeradas', /1 loja com zero<\/b> \(Caxias\)/.test(painel.html) && (painel.html.match(/confira se a escala está sendo marcada/g) || []).length >= 2, '');
  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
