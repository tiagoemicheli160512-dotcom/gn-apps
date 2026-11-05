// "No app check-list, o Nova América já tinha preenchido o início de contrato e agora tá
//  aparecendo que não tá colocado."
//
// A herança só roda quando a semana é CRIADA. Alguém tinha aberto a semana 39 lá atrás, e
// ela nasceu copiando a semana 36 — antes de o início de contrato existir. Nas semanas 37 e
// 38 a loja preencheu os 51, mas a 39 já existia e nunca mais foi revisitada. Na segunda ela
// virou a semana atual e apareceram 47 "faltando".
//
// Confirmado no banco antes de escrever uma linha: a semana 39 tinha exatamente as MESMAS
// duas pessoas com data que a 36, e nenhuma com cadastro_em. Três lojas atingidas.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const P = 'PRESENTE';
const func = (id, nome, extra) => Object.assign(
  { id, nome, tipo: 'CLT / MENSALISTA', setor: 'Salão', turno: 'MANHÃ', horario: '11-19',
    inicio_contrato: '', fim_contrato: '', dias: Array(7).fill(P) }, extra || {});

// Reproduz o caso real: semana 36 velha (sem datas), 37 e 38 com tudo preenchido, e a 39
// criada ANTES — com a cara da 36.
const ALL = {
  '36': { funcs: [ func(0, 'ALEXANDRE ALVES'), func(1, 'AMILTON ALVES'),
                   func(2, 'ADAILTON ALVES', { inicio_contrato: '2024-03-01' }) ] },
  '37': { funcs: [ func(0, 'ALEXANDRE ALVES', { inicio_contrato: '2025-01-10' }),
                   func(1, 'AMILTON ALVES', { inicio_contrato: '2025-02-20' }),
                   func(2, 'ADAILTON ALVES', { inicio_contrato: '2024-03-01' }) ] },
  '38': { funcs: [ func(0, 'ALEXANDRE ALVES', { inicio_contrato: '2025-01-10', cadastro_em: '2025-01-10', aval_exp_45: { ok: true } }),
                   func(1, 'AMILTON ALVES', { inicio_contrato: '2025-02-20', cadastro_em: '2025-02-20' }),
                   func(2, 'ADAILTON ALVES', { inicio_contrato: '2024-03-01' }) ] },
  // A semana atual, nascida da 36: sem as datas que foram preenchidas depois.
  '39': { funcs: [ func(0, 'ALEXANDRE ALVES'), func(1, 'AMILTON ALVES'),
                   func(2, 'ADAILTON ALVES', { inicio_contrato: '2024-03-01' }) ] },
};

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 430, height: 950 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + CHK);
    try {
      await page.waitForFunction(() => {
        try { return typeof getComissoesWD === 'function' && LOJA !== undefined; }
        catch (e) { return false; }
      }, { timeout: 12000 });
      break;
    } catch (e) { if (t >= 4) { console.log('FALHOU: o Check-list não carregou'); process.exit(1); } }
  }

  const existe = await page.evaluate(() => typeof _comissoesCompletarCadastro === 'function');
  if (!existe) {
    console.log('FALHOU: a correção do cadastro não existe neste arquivo (contraprova esperada — é nova)');
    console.log('\n0 OK, 11 falhou');
    await browser.close(); process.exit(1);
  }

  const monta = (all, idx) => page.evaluate(([a, i]) => {
    const wd = getComissoesWD(a, i);
    const m = {};
    wd.funcs.filter(f => f.nome).forEach(f => {
      m[f.nome] = { ini: f.inicio_contrato || '', cad: f.cadastro_em || '', setor: f.setor || '',
                    aval: f.aval_exp_45 ? 'tem' : '' };
    });
    return m;
  }, [all, idx]);

  // ── 1. O caso relatado ────────────────────────────────────────────────────────────
  const r = await monta(ALL, 39);
  check('o início de contrato volta a aparecer na semana atual',
    r['ALEXANDRE ALVES'].ini === '2025-01-10' && r['AMILTON ALVES'].ini === '2025-02-20');
  check('pegando o valor da semana MAIS RECENTE que tinha (38, não 36)',
    r['ALEXANDRE ALVES'].cad === '2025-01-10');
  check('outros campos de cadastro vêm junto', r['ALEXANDRE ALVES'].aval === 'tem');
  check('quem já tinha a data na semana atual fica como estava',
    r['ADAILTON ALVES'].ini === '2024-03-01');

  // ── 2. Nunca sobrescreve o que a semana atual já diz ──────────────────────────────
  // Se a loja CORRIGIU a data nesta semana, a correção tem que mandar.
  const corrigido = JSON.parse(JSON.stringify(ALL));
  corrigido['39'].funcs[0].inicio_contrato = '2025-06-30';
  const rc = await monta(corrigido, 39);
  check('data corrigida na semana atual não é sobrescrita pela antiga',
    rc['ALEXANDRE ALVES'].ini === '2025-06-30');

  // ── 3. Não inventa gente nem muda quem não precisa ───────────────────────────────
  const semanaCheia = JSON.parse(JSON.stringify(ALL));
  semanaCheia['39'].funcs.forEach(f => { f.inicio_contrato = '2020-01-01'; f.cadastro_em = 'x'; f.aval_exp_45 = { ok: 1 }; });
  const rch = await page.evaluate(([a]) => {
    const antes = JSON.stringify(a['39'].funcs);
    const wd = getComissoesWD(a, 39);
    return { mudou: JSON.stringify(wd.funcs.slice(0, 3)) !== antes,
             qtd: wd.funcs.filter(f => f.nome).length };
  }, [semanaCheia]);
  check('semana já completa não é alterada à toa', rch.mudou === false);
  check('e ninguém novo é inventado no caminho', rch.qtd === 3);

  // ── 4. Arquivado não é ressuscitado nem completado ───────────────────────────────
  const comArquivado = JSON.parse(JSON.stringify(ALL));
  comArquivado['39'].funcs[1].arquivado = true;
  const ra = await page.evaluate(([a]) => {
    const wd = getComissoesWD(a, 39);
    const f = wd.funcs.find(x => x.nome === 'AMILTON ALVES');
    return { ini: f ? (f.inicio_contrato || '') : 'sumiu', arq: f ? !!f.arquivado : null };
  }, [comArquivado]);
  check('quem foi arquivado (fim de contrato) não é completado', ra.ini === '' && ra.arq === true);

  // ── 5. Nome escrito com acento/caixa diferente ainda casa ────────────────────────
  const acento = JSON.parse(JSON.stringify(ALL));
  acento['39'].funcs[0].nome = 'alexandre alves ';
  const rx = await monta(acento, 39);
  check('acento e caixa não impedem o encontro do cadastro',
    (rx['alexandre alves '] || {}).ini === '2025-01-10');

  // ── 6. Semana nova (ainda não criada) continua herdando certo ───────────────────
  const r40 = await monta(ALL, 40);
  check('semana que ainda não existe nasce com o cadastro completo',
    r40['ALEXANDRE ALVES'].ini === '2025-01-10');

  // ── 7. Não olha longe demais ────────────────────────────────────────────────────
  // Além do limite, é histórico — não cadastro vigente.
  const antigo = { '1': { funcs: [ func(0, 'FULANO VELHO', { inicio_contrato: '2019-01-01' }) ] },
                   '39': { funcs: [ func(0, 'FULANO VELHO') ] } };
  const rv = await monta(antigo, 39);
  check('cadastro de 38 semanas atrás não é puxado (fora do alcance)',
    rv['FULANO VELHO'].ini === '');

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
