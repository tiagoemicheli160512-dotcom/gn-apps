// "No card de Equipe (Férias, Presença, Xadrez…) um controle de faltas, advertência e
//  suspensão por loja, pra ter a visão" (12/11/2026).
//
// Cobra: a aba ⚠ Ocorrências em Equipe; totais da rede; uma linha por loja (só as 11, sem a
// Maglia), ordenada por quem tem mais; falta/suspensão em DIAS e advertência por documento;
// atestado NÃO entra (não é falta); tocar abre as pessoas; aviso de semana sem escala;
// nome com HTML escapado; 320 px sem rolagem de lado.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 500)); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof _buildOcorrenciasPanel === 'function' && COMISSOES_CAL.length > 0; } catch (e) { return false; } }, { timeout: 20000 }); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: a Home não carregou (ou falta o código novo)'); console.log('\n0 OK, 1 falhou'); process.exit(1); } }
  }
  await page.evaluate(() => {
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } }; masterLoja = null;
    document.getElementById('home-screen').style.display = 'block';
    document.getElementById('dash-section').style.display = 'block';
    const idx = 38, iso = d => d.y + '-' + String(d.m).padStart(2, '0') + '-' + String(d.d).padStart(2, '0');
    const D = o => { const a = Array(7).fill('PRESENTE'); Object.entries(o).forEach(([i, v]) => a[i] = v); return a; };
    _dashComissoesAll = [
      { loja: LOJA_COM_KEY['BANGU'], all_data: { [idx]: { funcs: [
        { nome: 'Maria <b>X</b>', setor: 'Cozinha', dias: D({ 0: 'FALTA', 3: 'FALTA' }), docs: { ADVERTENCIA: 'u' } },
        { nome: 'Ana', setor: 'Cozinha', dias: D({ 2: 'ATESTADO' }), docs: {} },
        { nome: 'Rui', setor: 'Salão', dias: D({ 4: 'SUSPENSÃO', 5: 'SUSPENSÃO', 6: 'SUSPENSÃO' }), docs: {} },
      ] } } },
      { loja: LOJA_COM_KEY['CAXIAS'], all_data: { [idx]: { funcs: [
        { nome: 'Bia', setor: 'Salão', dias: D({ 1: 'FALTA' }), docs: {} },
      ] } } },
      { loja: LOJA_COM_KEY['MAGLIA'] || 'MAGLIA', all_data: { [idx]: { funcs: [
        { nome: 'Zé Maglia', setor: 'Salão', dias: D({ 0: 'FALTA', 1: 'FALTA', 2: 'FALTA', 3: 'FALTA' }), docs: {} },
      ] } } },
    ];
    _dashPer = 'sem';
    _dashWoff = Math.round((new Date(iso(COMISSOES_CAL[idx].days[0]) + 'T12:00:00') - new Date(_weekRange(0).dates[0] + 'T12:00:00')) / (7 * 864e5));
    _dashFat = {}; _dashFatPrev = {};
    _setDashTab('ocorr');
  });
  const tela = () => page.evaluate(() => {
    const sec = document.getElementById('dash-section');
    return { abas: [...sec.querySelectorAll('button')].map(b => b.textContent.trim()), txt: sec.innerText.replace(/\s+/g, ' '), html: sec.innerHTML,
      larga: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
  });
  let t = await tela();
  check('Equipe ganhou a aba "⚠ Ocorrências"', t.abas.some(a => /Ocorrências/.test(a)) && t.abas.some(a => /Férias/.test(a)), t.abas.join('|'));
  check('totais da rede: 3 faltas, 1 advertência, 3 dias de suspensão (atestado e Maglia fora)',
    /Faltas 3 dias/i.test(t.txt) && /Advertências 1 documento\b/i.test(t.txt) && /Suspensões 3 dias/i.test(t.txt), t.txt.slice(0, 300));
  const ordem = await page.evaluate(() => _ocorDados().lojas.map(l => l.k + ':' + l.total));
  check('uma linha por loja das 11, sem a Maglia', ordem.length === 11 && !ordem.some(o => /MAGLIA/.test(o)), ordem.join(','));
  check('ordenada por quem tem mais: Bangu (6) e depois Caxias (1)', ordem[0] === 'BANGU:6' && ordem[1] === 'CAXIAS:1', ordem.join(','));
  check('atestado não conta como falta', await page.evaluate(() => _ocorDados().lojas[0].pessoas.every(p => p.nome !== 'Ana')));
  check('semana sem escala lançada é avisada nas lojas sem registro', /sem escala lançada/.test(t.txt), '');
  check('fechada, a loja não lista as pessoas', !/Maria/.test(t.txt));
  await page.evaluate(() => _ocorToggle('BANGU')); t = await tela();
  check('tocar em Bangu abre as pessoas, com setor', /Maria <b>X<\/b> · Cozinha/.test(t.txt) && /Rui · Salão/.test(t.txt), t.txt.slice(0, 600));
  check('nome com HTML aparece escapado (não vira negrito)', /Maria &lt;b&gt;X&lt;\/b&gt;/.test(t.html));
  check('…com atalho pro raio-x da loja', /_raioxAbrir\('BANGU'\)/.test(t.html));
  check('o período do Painel aparece (é o mesmo do seletor)', await page.evaluate(() => document.getElementById('dash-section').innerText.includes(_dashRangeOf(_dashOff()).label)));
  await page.setViewportSize({ width: 320, height: 800 }); await page.evaluate(() => renderDashboard()); t = await tela();
  check('320 px: sem rolagem de lado', !t.larga);
  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
