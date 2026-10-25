// "Nova América aparece sem cancelamento e sem o registro de que não teve nos dias 15 e 16."
//
// O bloco "Sem cancelamento" mostrava as datas SEM resposta, mas o lado confirmado era só
// contagem: "Confirmado por Cassia, Augusto em 2 de 5 caixas". Dá pra saber que dois
// caixas foram respondidos — não QUAIS, nem quem respondeu cada um. O registro de que não
// houve cancelamento em 15/10 e 16/10 simplesmente não aparecia.
//
// Dado real (gn_caixa_fechamento, NOVA AMERICA, 12–18/10):
//   12/10 DIA fechado, ninguém assinou
//   13/10 DIA fechado, ninguém assinou
//   14/10 DIA fechado, ninguém assinou
//   15/10 DIA fechado, assinado por Cassia
//   16/10 DIA fechado, assinado por Augusto
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 300)); };

const dia = (d, por, turno) => ({ data: '2026-10-' + d, turno: turno || 'DIA', ...(por ? { por } : {}) });

const DECL = {
  // Nova América, exatamente como está no banco.
  // A chave da loja é 'NOVA AMERICA', COM espaço — escrever NOVA_AMERICA faz a loja cair
  // em 'sem_caixa' e o teste medir outra coisa (já aconteceu uma vez neste app).
  'NOVA AMERICA': { caixas: 5, declarados: 2, abertos: 0, responsaveis: ['Cassia', 'Augusto'],
    datasOk: [dia('15', 'Cassia'), dia('16', 'Augusto')],
    datasFalta: [dia('12'), dia('13'), dia('14')] },
  // Loja com tudo assinado — não deve mudar de forma.
  BANGU: { caixas: 2, declarados: 2, abertos: 0, responsaveis: ['Neto'],
    datasOk: [dia('15', 'Neto'), dia('16', 'Neto')], datasFalta: [] },
  // Dia com DOIS turnos e só um assinado: o turno tem que aparecer dos dois lados.
  CAXIAS: { caixas: 2, declarados: 1, abertos: 0, responsaveis: ['Renata'],
    datasOk: [dia('15', 'Renata', 'DIA')], datasFalta: [dia('15', null, 'NOITE')] },
  // Nome com HTML: esta saída entra direto no card.
  PEDREIRA: { caixas: 2, declarados: 1, abertos: 0, responsaveis: ['<img src=x onerror=alert(1)>'],
    datasOk: [dia('15', '<img src=x onerror=alert(1)>')], datasFalta: [dia('16')] },
};

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + ARQ);
  await page.waitForFunction(() => { try {
    return typeof _cancelSemNadaHtml === 'function' && typeof _cancelDatas === 'function'
        && typeof _cancelRelatorioSemNada === 'function';
  } catch (e) { return false; } }, { timeout: 30000 });

  const out = await page.evaluate((decl) => {
    _dashCancelPer = {};          // nenhuma loja com cancelamento: todas caem no bloco
    _dashDeclPer = decl;
    _dashPer = 'sem'; _dashWoff = 0;
    const d = _cancelMacroDados();
    const el = document.createElement('div');
    el.innerHTML = _cancelSemNadaHtml(d);
    return {
      html: _cancelSemNadaHtml(d),
      // A linha DA LOJA, não o bloco inteiro: procurar "15/10" no texto todo passa mesmo
      // na versão quebrada, porque outra loja do cenário também tem 15/10.
      linhaNA: ([...el.querySelectorAll('div')]
        .find(x => /^Nova América/.test((x.textContent || '').trim())) || { textContent: '' })
        .textContent.replace(/\s+/g, ' ').trim(),
      texto: el.textContent.replace(/\s+/g, ' ').trim(),
      rel: _cancelRelatorioSemNada(d, false),
      estados: d.semCancel.reduce((a, l) => (a[l.k] = l.estado, a), {}),
      // O formatador puro, sem passar pelo card.
      seisMais: _cancelDatas(
        Array.from({ length: 9 }, (_, i) => ({ data: '2026-10-0' + (i + 1), turno: 'DIA', por: 'Ana' })),
        null, x => x),
    };
  }, DECL);

  check('Nova América é classificada como parcial', out.estados['NOVA AMERICA'] === 'parcial',
    JSON.stringify(out.estados));

  // ── O que o dono pediu ──────────────────────────────────────────────────────
  check('a linha da Nova América passa a mostrar 15/10 como confirmada',
    /Confirmado em[^|]*15\/10/.test(out.linhaNA), out.linhaNA);
  check('e 16/10 também', /Confirmado em[^|]*16\/10/.test(out.linhaNA), out.linhaNA);
  check('cada data vem com quem confirmou aquele caixa',
    /15\/10 por Cassia/.test(out.linhaNA) && /16\/10 por Augusto/.test(out.linhaNA), out.linhaNA);
  check('as datas sem resposta continuam listadas',
    /Sem resposta em 12\/10, 13\/10 e 14\/10/.test(out.linhaNA), out.linhaNA);
  check('e a contagem de caixas segue ali, pra conferir a conta',
    /2 de 5 caixas/.test(out.linhaNA), out.linhaNA);

  // ── O que não podia mudar ───────────────────────────────────────────────────
  check('loja com tudo assinado não muda de forma',
    /Bangu/.test(out.texto) && /Confirmado por Neto/.test(out.texto) && /15\/10 a 16\/10/.test(out.texto),
    (out.texto.match(/Bangu[\s\S]{0,150}/) || [''])[0]);

  check('dia com dois turnos nomeia o turno dos dois lados',
    /15\/10 \(DIA\) por Renata/.test(out.texto) && /Sem resposta em 15\/10 \(NOITE\)/.test(out.texto),
    (out.texto.match(/Caxias[\s\S]{0,170}/) || [''])[0]);

  // ── Nome vindo do banco não vira HTML ───────────────────────────────────────
  check('nome com tag sai escapado no card',
    !/<img src=x/.test(out.html) && /&lt;img src=x/.test(out.html),
    (out.html.match(/Pedreira[\s\S]{0,230}/) || [''])[0]);

  // ── O relatório ─────────────────────────────────────────────────────────────
  check('o relatório também traz as datas confirmadas com quem assinou',
    /Nova América — confirmado em 15\/10 por Cassia e 16\/10 por Augusto \(2 de 5 caixas\)/.test(out.rel),
    (out.rel.match(/Nova América[^\n]*/) || [''])[0]);
  check('e segue dizendo onde faltou resposta',
    /sem resposta em 12\/10, 13\/10 e 14\/10/.test(out.rel),
    (out.rel.match(/Nova América[^\n]*/) || [''])[0]);
  check('no relatório o nome vai cru, sem escape de HTML',
    /<img src=x onerror=alert\(1\)>/.test(out.rel),
    (out.rel.match(/Pedreira[^\n]*/) || [''])[0]);

  // ── O teto continua valendo ─────────────────────────────────────────────────
  check('mais de 6 datas não viram um paredão', /e mais 3$/.test(out.seisMais), out.seisMais);

  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));

  await ctx.close(); await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
