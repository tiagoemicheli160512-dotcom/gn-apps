// Nova América, 23/11/2026 (repique da semana 09–15/11 com "6y", "Hdtytyyy…", "Tmj6666"):
// a fusão automática da escala (_comissoesMesclarFuncsFaltantes) traz pra semana atual quem
// está na anterior e "falta" aqui — comparando só pelo NOME. Quando o nome de alguém foi
// mexido numa semana (lixo de digitação, espaço duplo), a pessoa virava "faltante" e ganhava
// uma CÓPIA numa vaga vazia, que recebia repique. Casos reais reproduzidos:
//   · Luana: "LUANA PEREIRA LIMA ty.ym" (com _nomesAnteriores) na semana anterior, nome bom aqui
//   · Thais: "THAIS  DE OLIVEIRA FARIAS" (espaço duplo) lá, espaço simples aqui
//   · Tatiana: "Tmj6666" lá (sem _nomesAnteriores), "TATIANA BATISTA ALVES" aqui, mesma vaga
// E o que a fusão existe pra fazer continua: quem foi cadastrado na semana anterior depois que
// esta já existia é trazido, inclusive se a vaga dele aqui tem OUTRA pessoa de nome diferente.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const SB_LIB = require('fs').readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 400))); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-23T09:00:00');
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: SB_LIB }));
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + CHK);
  await page.waitForFunction(() => { try { return typeof _comissoesMesclarFuncsFaltantes === 'function' && typeof COMISSOES_CAL !== 'undefined'; } catch (e) { return false; } }, null, { timeout: 25000 });

  const r = await page.evaluate(() => {
    const P = (id, nome, extra) => ({ id, nome, tipo: 'CLT / MENSALISTA', setor: nome ? 'Salão' : '', dias: Array(7).fill('PRESENTE'), ...(extra || {}) });
    const N = 12;
    const ant = Array.from({ length: N }, (_, i) => P(i, ''));
    const cur = Array.from({ length: N }, (_, i) => P(i, ''));
    ant[0] = P(0, 'LUANA PEREIRA LIMA ty.ym ', { _nomesAnteriores: ['LUANA PEREIRA LIMA'] }); cur[0] = P(0, 'LUANA PEREIRA LIMA ');
    ant[1] = P(1, 'THAIS  DE OLIVEIRA FARIAS');                                             cur[1] = P(1, 'THAIS DE OLIVEIRA FARIAS');
    ant[2] = P(2, 'Tmj6666');                                                               cur[2] = P(2, 'TATIANA BATISTA ALVES');
    ant[3] = P(3, 'MICHAEL DOUGLAS SANTrtrr4tttyy5OS OLIVEIRA');                            cur[3] = P(3, 'MICHAEL DOUGLAS SANTOS OLIVEIRA');
    ant[4] = P(4, 'RUAN CORREIA DO NASCIMENTO');                                            cur[4] = P(4, 'RUAN CORREIA DO NASCIMENTO');
    // Cadastrado na semana anterior depois que esta já existia: vaga vazia aqui → TEM que vir.
    ant[5] = P(5, 'FRANCINALDO PEREIRA DA SILVA');
    // Cadastrado lá numa vaga que aqui tem OUTRA pessoa, de nome sem nada em comum → TEM que vir.
    ant[6] = P(6, 'LEONARDO DE CARVALHO TAVARES');                                         cur[6] = P(6, 'BRUNO COIMBRA GOMES');
    const allData = { '45': { funcs: ant } };
    const out = _comissoesMesclarFuncsFaltantes(cur.map(f => ({ ...f })), allData, 46);
    const nomes = out.map(f => f.nome).filter(n => n && n.trim());
    const conta = re => nomes.filter(n => re.test(n)).length;
    return { nomes, luana: conta(/LUANA/), thais: conta(/THAIS/), tati: conta(/TATIANA|Tmj/), michael: conta(/MICHAEL/), ruan: conta(/RUAN/),
             francinaldo: conta(/FRANCINALDO/), leonardo: conta(/LEONARDO/), bruno: conta(/BRUNO/),
             lixo: typeof _comissoesNomeLixo !== 'function' ? 'ausente' : ['Hdtytyyyyyy5yy', '6y', 'ANA AARÃO', 'ISAAC JOÃO', 'MARIA SORAIA'].map(_comissoesNomeLixo) };
  });
  check('Luana renomeada lá ("ty.ym") NÃO ganha cópia aqui', r.luana === 1, r.nomes);
  check('Thais com espaço duplo lá NÃO ganha cópia aqui', r.thais === 1, r.nomes);
  check('Tatiana virou "Tmj6666" lá (mesma vaga, sem nome anterior gravado) NÃO ganha cópia', r.tati === 1, r.nomes);
  check('Michael com lixo no meio do nome lá NÃO ganha cópia', r.michael === 1, r.nomes);
  check('quem está igual nas duas continua uma vez só (Ruan)', r.ruan === 1, r.nomes);
  check('cadastrado na semana anterior com vaga vazia aqui CONTINUA sendo trazido (Francinaldo)', r.francinaldo === 1, r.nomes);
  check('cadastrado lá numa vaga que aqui tem outra pessoa CONTINUA sendo trazido (Leonardo), e o Bruno fica', r.leonardo === 1 && r.bruno === 1, r.nomes);
  check('lixo reconhecido ("Hdtytyyyyyy", "6y"); nomes reais passam ("ANA AARÃO", "ISAAC JOÃO", "MARIA SORAIA")',
    JSON.stringify(r.lixo) === JSON.stringify([true, true, false, false, false]), r.lixo);

  // ── Digitação: letra repetida é recusada e o nome anterior fica ──
  const d = await page.evaluate(() => {
    hideLogin(); LOJA = 'Nova América'; state.data = '2026-11-23';
    usuarioLogado = { id: 1, nome: 'Augusto', cargo: 'gerente', loja: 'NOVA AMERICA' };
    document.querySelectorAll('body > div').forEach(d => { const cs = getComputedStyle(d); if (cs.position === 'fixed' && parseInt(cs.zIndex) >= 900) d.style.display = 'none'; });
    initAllStates(); restoreUI();
    comissoesLoadErr = false; comissoesWeekIdx = 46;
    const P = (id, nome) => ({ id, nome, tipo: 'CLT / MENSALISTA', setor: 'Salão', dias: Array(7).fill('PRESENTE'), inicio_contrato: '2025-01-01', turno: 'TARDE', horario: '12:00 as 20:00' });
    comissoesWD = { brutos: Array(7).fill(0), funcs: [P(0, 'LUANA PEREIRA LIMA'), P(1, 'RUAN CORREIA DO NASCIMENTO')], dist: 'SIM' };
    scheduleComissoesOp = () => {};
    window.__toasts = []; window.showToast = (m) => { window.__toasts.push(m); };
    updComissoesNome(0, 'LUANA PEREIRA LIMA tyyyyy');
    updComissoesNome(1, 'RUAN CORREIA DO NASCIMENTO JUNIOR');
    return { n0: comissoesWD.funcs[0].nome, n1: comissoesWD.funcs[1].nome, toasts: window.__toasts };
  });
  check('digitar "LUANA PEREIRA LIMA tyyyyy" é recusado e o nome fica', d.n0 === 'LUANA PEREIRA LIMA' && d.toasts.some(t => /letra repetida/.test(t)), d);
  check('renomear de verdade continua funcionando ("… JUNIOR")', d.n1 === 'RUAN CORREIA DO NASCIMENTO JUNIOR', d);

  check('nenhum erro de JavaScript', erros.length === 0, erros);
  await browser.close();
  console.log(`\n${ok} ok, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
