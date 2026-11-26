// Acompanhamento — relatórios (26/11/2026): "Preciso que tenha opção de gerar relatórios
// desse controle, por WhatsApp, PDF, mesmo esquema por loja e todos."
// Mesmo padrão das outras abas do Painel: 📲 WhatsApp · 📄 PDF · 📄📲 PDF no Whats; nenhuma
// loja marcada = rede; marcadas = só elas. Na Home da loja, só a loja dela.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 700))); c ? ok++ : falhou++; };
const BANCO_JS = `
  const CAT_CS = 'cat-cs-rj', CAT_LATA = 'cat-lata';
  const carnesPed = { carne_sol: { inicial: 50, ter: 40, qua: 42, ent_ter: 10 }, picanha: { inicial: 20, ter: 17, qua: 15.2 }, carne_seca: { inicial: 10, ter: 10 }, camarao: { inicial: 8, ter: 4, qua: 4 } };
  const tot = (cs, pc, cam) => ({ carne_sol: cs, picanha: pc, carne_seca: 0, camarao: cam, coca_un: 10, chopp_l_claro: 0, chopp_l_vinho: 0 });
  window.__BANCO = {
    'acomp:carnes': [{ loja: 'Pedreira', semana_inicio: '2026-11-23', carnes: carnesPed, updated_at: '2026-11-25T14:00:00Z' }],
    'acomp:vendidos': [
      { loja: 'PEDREIRA', data: '2026-11-23', totais: tot(10, 3, 4), itens: { coca_lata: { q: 10 } } },
      { loja: 'PEDREIRA', data: '2026-11-24', totais: tot(6, 1.8, 0), itens: { coca_lata: { q: 10 } } },
      { loja: 'PEDREIRA', data: '2026-11-25', totais: tot(5, 1, 0), itens: { coca_lata: { q: 10 } } },
    ],
    'acomp:rodizio': [],
    'acomp:cadastro': [{ id: 'coca_lata', grupo: 'coca', nome: 'Coca-Cola lata 350 ml', item_estoque: 37, ativo: true }],
    'acomp:choppCont': [], 'acomp:choppEnt': [],
    'acomp:carnesCat': [{ id: CAT_CS, item_id: 207, origem_item_id: null, regiao: 'RJ' }],
    'acomp:carnesRec': [],
    'acomp:estoqueCat': [{ id: CAT_LATA, item_id: 37, origem_item_id: null, und_por_caixa: 12 }],
    'acomp:estoqueCont': [{ loja_slug: 'pedreira', catalogo_id: CAT_LATA, atual: 100, data_contagem: '2026-11-23', criado_em: '2026-11-23T13:00:00Z' }],
    'acomp:estoqueRec': [], 'acomp:estoquePend': [],
  };
  window.gnFetchJson = async (url, h, nome, fb) => { (window.__CONSULTAS = window.__CONSULTAS || []).push(nome); return nome in window.__BANCO ? JSON.parse(JSON.stringify(window.__BANCO[nome])) : (fb === undefined ? [] : fb); };
`;

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: 'America/Sao_Paulo' });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-26T14:00:00');
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof renderDashboard === 'function' && !!window.gnAcomp; } catch (e) { return false; } }, null, { timeout: 25000 }); break; }
    catch (e) { if (t >= 4) throw new Error('a Home não carregou'); }
  }
  if (!(await page.evaluate(() => typeof gnAcomp.relatorio === 'function'))) {
    console.log('FALHOU: os relatórios do acompanhamento não existem neste arquivo (contraprova esperada — são novos)');
    console.log('\n0 OK, 1 falhou'); await browser.close(); process.exit(1);
  }
  await page.evaluate(BANCO_JS);
  const r = await page.evaluate(async () => {
    const out = {}; const abertos = [], pdfs = [], compart = [];
    window.open = (u) => { abertos.push(decodeURIComponent(String(u).split('text=')[1] || '')); return null; };
    window.gnRelatorioPDF = (o) => pdfs.push(o);
    window.gnRelatorioPDFCompartilhar = async (o) => { compart.push(o); };
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    document.getElementById('home-screen').style.display = 'block';
    document.getElementById('dash-section').style.display = 'block';
    _setDashTab('acomp');
    for (let i = 0; i < 40 && !document.querySelector('#acomp-painel .acomp-cel'); i++) await new Promise(r => setTimeout(r, 100));
    const el = document.getElementById('acomp-painel');
    out.botoes = [...el.querySelectorAll('.acomp-rel button')].map(b => b.textContent.trim());
    out.temFiltro = !!el.querySelector('.acomp-rel-filtro') && el.querySelectorAll('.acomp-rel-loja').length === 11;
    el.querySelector('.acomp-rel-wpp').click(); out.wppRede = abertos.pop();
    // Marca Pedreira → relatório individual.
    const cb = el.querySelector('.acomp-rel-loja[value="PEDREIRA"]'); cb.checked = true; cb.onchange();
    out.resumoFiltro = el.querySelector('.acomp-rel-filtro summary').textContent;
    el.querySelector('.acomp-rel-wpp').click(); out.wppPed = abertos.pop();
    el.querySelector('.acomp-rel-pdf').click(); out.pdf = pdfs.pop();
    el.querySelector('.acomp-rel-pdfwpp').click(); await new Promise(r => setTimeout(r, 50)); out.compart = compart.pop();
    // Home da loja (gerente): sem filtro, relatório só da loja.
    session = { id: 7, nome: 'Ana', cargo: 'gerente', loja: 'PEDREIRA', permissoes: {}, ts: Date.now() }; masterLoja = '';
    try { showHome(session); } catch (e) {}
    for (let i = 0; i < 40 && !document.querySelector('#acomp-home-loja .acomp-cel'); i++) await new Promise(r => setTimeout(r, 100));
    const h = document.getElementById('acomp-home-loja');
    out.homeFiltro = !!h.querySelector('.acomp-rel-filtro');
    h.querySelector('.acomp-rel-wpp').click(); out.wppHome = abertos.pop();
    return out;
  });
  check('botões 📲 WhatsApp · 📄 PDF · 📄📲 PDF no Whats na aba do Painel', r.botoes.join('|') === '📲 WhatsApp|📄 PDF|📄📲 PDF no Whats', r.botoes);
  check('lista das 11 lojas pra marcar (nenhuma marcada = rede)', r.temFiltro);
  check('WhatsApp da rede: título REDE, período, resumo e um bloco por loja', /\*ACOMPANHAMENTO — CARNES E BEBIDAS — REDE\*/.test(r.wppRede) && /Semana atual · 23\/11 a hoje/.test(r.wppRede) && /Resumo: \d+ com falta/.test(r.wppRede) && (r.wppRede.match(/🏪/g) || []).length === 11, r.wppRede.slice(0, 300));
  check('Pedreira: falta de carne de sol (−1,4 kg), o resto com o status certo', /🔴 Carne de sol: −1,4 kg/.test(r.wppRede) && /✅ Bate: Picanha · Carne seca · Camarão/.test(r.wppRede) && /⚪ Sem dado: .*Coca-Cola \(em curso\)/.test(r.wppRede), r.wppRede.split('🏪').find(x => /Pedreira/.test(x)));
  check('loja marcada → relatório individual (título com a loja, só ela)', /PEDREIRA/.test(r.resumoFiltro.toUpperCase()) && /— PEDREIRA\*/.test(r.wppPed) && (r.wppPed.match(/🏪/g) || []).length === 1, r.wppPed.slice(0, 200));
  check('PDF: título, números no topo (período, com falta, com sobra), grade colorida e o texto sem repetir o título',
    r.pdf && r.pdf.titulo === 'Acompanhamento — Pedreira' && r.pdf.kpis.length === 3 && r.pdf.kpis[1].label === 'Com falta' && r.pdf.kpis[1].valor === '1' &&
    /<table/.test(r.pdf.visual) && /#fee2e2/.test(r.pdf.visual) && !/ACOMPANHAMENTO — CARNES/.test(r.pdf.texto) && /FALTA · Carne de sol: −1,4 kg/.test(r.pdf.texto), r.pdf && { t: r.pdf.titulo, k: r.pdf.kpis, txt: r.pdf.texto.slice(0, 200) });
  check('PDF no Whats: o mesmo PDF vai pro compartilhamento', r.compart && r.compart.titulo === 'Acompanhamento — Pedreira', r.compart && r.compart.titulo);
  check('Home da loja: sem lista de lojas, o relatório sai só da loja dela', !r.homeFiltro && /— PEDREIRA\*/.test(r.wppHome) && (r.wppHome.match(/🏪/g) || []).length === 1, r.wppHome.slice(0, 200));
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
