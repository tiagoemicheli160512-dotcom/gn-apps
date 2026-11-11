// "Os cabeçalhos da Home das lojas e do Painel de Gestão estão muito grandes" (print da
// Pedreira, 12/11/2026).
//
// Medido em 390 px: no Painel o cartão do topo tinha 323 px (sete selos em três linhas,
// "Boa tarde" em 24 px, o desenho da fachada) e mais a faixa do título "Painel de Gestão";
// na loja (mestre olhando a Pedreira, com gerente, sub e acessos) o cartão tinha 403 px.
//
// Nada some de vez — some no CELULAR o que é enfeite ou repetido:
//   - "Navegando como mestre…" e o selo "LOJA ATIVA" (o nome já diz a loja); a fachada FICA,
//     pequena (sumir com ela no celular já foi defeito — ver e2e_topo_estreito);
//   - os selos viram uma faixa que rola de lado DENTRO dela (a página não rola de lado);
//   - acessos de hoje numa linha, que abre no toque;
//   - "↻ Atualizar" vira só "↻" (com nome pra leitor de tela).
// No computador (≥ 768 px) fica como era.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const abrir = async (largura, loja) => {
    const ctx = await browser.newContext({ viewport: { width: largura, height: 844 } });
    await CAMINHOS.fixarRelogio(ctx, '2026-11-11T16:00:00');
    await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await ctx.addInitScript(({ loja }) => { try {
      localStorage.setItem('gn_session_v1', JSON.stringify({ id: 9999, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true, mestra: true }, ts: Date.now() }));
      localStorage.setItem('gn_aviso_guia_v1', '1');
      if (loja) localStorage.setItem('gn_home_loja', JSON.stringify({ loja, ts: Date.now() }));
    } catch (e) {} }, { loja });
    const page = await ctx.newPage();
    const erros = []; page.on('pageerror', e => erros.push(String(e)));
    await page.goto('file://' + HOME);
    await page.waitForFunction(() => { try { return typeof showHome === 'function' && document.getElementById('hero-loja-name').textContent !== '—'; } catch (e) { return false; } }, null, { timeout: 25000 });
    // Selos e acessos de mentira (a rede está desligada): o que se mede é o arranjo.
    await page.evaluate(() => {
      const hc = document.getElementById('health-chips');
      hc.innerHTML = ['📈 R$ 133,2k / sem', '⛔ 0/12 lojas ok', '💵 0/12 cx', '📋 7/12 chk', '🔧 80 manut.', '● 1 em andamento', '📍 1 visita hoje']
        .map(t => `<span style="background:#eee;color:#111;border-radius:999px">${t}</span>`).join('');
      const ac = document.getElementById('acessos-hoje');
      ac.textContent = '👤 Acessos hoje: Marlon (sub_gerente) 09:24 · Gabriel (estoquista) 10:36 · Marlon (sub_gerente) 12:55 · Marlon (sub_gerente) 13:15';
      ac.style.display = '';
    });
    return { ctx, page, erros };
  };
  const medir = page => page.evaluate(() => {
    const vis = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
    const hc = document.getElementById('health-chips');
    const tops = [...hc.children].map(c => Math.round(c.getBoundingClientRect().top));
    const ac = document.getElementById('acessos-hoje');
    return {
      hero: Math.round(document.getElementById('hero').getBoundingClientRect().height),
      ilustra: vis(document.querySelector('.hero-ilustra')), ilustraL: Math.round(document.querySelector('.hero-ilustra').getBoundingClientRect().width), sub: vis(document.getElementById('hero-sub')),
      chip: vis(document.getElementById('hero-loja-chip')),
      selosUmaLinha: new Set(tops).size === 1, selosRolam: hc.scrollWidth > hc.clientWidth,
      acessosLinha: Math.round(ac.getBoundingClientRect().height),
      // Só o CSS do rótulo: no computador a barra de cima inteira dá lugar à lateral.
      atualizarLbl: getComputedStyle(document.querySelector('#btn-atualizar .hdr-lbl')).display !== 'none', atualizarNome: document.getElementById('btn-atualizar').getAttribute('aria-label'),
      larg: document.documentElement.scrollWidth,
      nome: document.getElementById('hero-loja-name').textContent, saud: document.getElementById('hero-greeting').textContent,
      data: document.getElementById('hero-date').textContent,
    };
  });

  // ══ Painel (todas as lojas), 390 px ═══════════════════════════════════════════════
  let a = await abrir(390, null);
  let m = await medir(a.page);
  check('Painel: o cartão do topo cabe em menos de 200 px (eram 323)', m.hero < 200, m.hero);
  check('Painel: os selos ficam numa faixa só, que rola de lado', m.selosUmaLinha && m.selosRolam, JSON.stringify(m));
  check('Painel: a página não ganha rolagem lateral por causa da faixa', m.larg <= 390, m.larg);
  check('Painel: o nome, a data e a saudação continuam lá', /Todas as lojas/.test(m.nome) && /novembro/.test(m.data) && /Boa tarde, Tiago/.test(m.saud), JSON.stringify(m));
  check('Painel: a fachada continua, mas pequena; "Acesso mestre…" sai no celular', m.ilustra && m.ilustraL <= 50 && !m.sub, JSON.stringify(m));
  check('"↻ Atualizar" vira só o ícone, com nome pra leitor de tela', !m.atualizarLbl && /Atualizar/.test(m.atualizarNome || ''), JSON.stringify(m));
  const rola = await a.page.evaluate(() => { const hc = document.getElementById('health-chips'); hc.scrollLeft = 9999; const u = hc.lastElementChild.getBoundingClientRect(); return u.right <= innerWidth + 1 && u.left >= 0; });
  check('Painel: rolando a faixa, o último selo aparece inteiro', rola);
  check('sem erro de JavaScript (Painel)', a.erros.length === 0, a.erros.join(' | '));
  await a.ctx.close();

  // ══ Loja (mestre na Pedreira), 390 px ═════════════════════════════════════════════
  a = await abrir(390, 'PEDREIRA');
  m = await medir(a.page);
  check('Loja: o nome é o da loja', /Pedreira/.test(m.nome), m.nome);
  check('Loja: selo "LOJA ATIVA" sai no celular (o nome já diz)', !m.chip, JSON.stringify(m));
  check('Loja: acessos de hoje numa linha só', m.acessosLinha <= 20, m.acessosLinha);
  const abre = await a.page.evaluate(() => { const ac = document.getElementById('acessos-hoje'); ac.click(); return Math.round(ac.getBoundingClientRect().height); });
  check('Loja: tocar nos acessos mostra a lista inteira', abre > 20, abre);
  check('Loja: o cartão cabe em menos de 260 px (eram 403 com gerente, sub e acessos)', m.hero < 260, m.hero);
  check('sem erro de JavaScript (loja)', a.erros.length === 0, a.erros.join(' | '));
  await a.ctx.close();

  // ══ 320 px e computador ═══════════════════════════════════════════════════════════
  a = await abrir(320, 'PEDREIRA');
  m = await medir(a.page);
  check('320 px sem rolagem de lado', m.larg <= 320, m.larg);
  await a.ctx.close();
  a = await abrir(1024, null);
  m = await medir(a.page);
  check('no computador fica como era: desenho, "Acesso mestre…" e "Atualizar" escrito', m.ilustra && m.sub && m.atualizarLbl, JSON.stringify(m));
  await a.ctx.close();

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
