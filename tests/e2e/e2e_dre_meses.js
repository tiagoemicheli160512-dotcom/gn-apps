// "Lançar o realizado dos meses."
//
// Não dava. O formulário do Mini DRE vive dentro do card de desempenho, que é SEMPRE o mês
// que acabou de fechar — e gravava em _dreCtx.comp. Setembro dava pra lançar; agosto e os
// meses de trás não tinham como ser alcançados. Conferido no banco antes: a linha
// DRE_CONFIG nem existia, ou seja, nenhum mês de nenhuma loja tinha realizado lançado.
//
// Agora o mês é escolhido no formulário. Metade das checagens é sobre não estragar o que já
// funcionava: a % continua sendo da loja (não do mês), e lançar um mês não pode encostar no
// que outro mês já tinha.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const LOJA = 'ITAQUERA';
const CARD = '2026-09';        // mês do card (o que fechou)
const ATRAS = '2026-07';       // mês de trás, inalcançável antes

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 420, height: 900 } });

  // Banco de mentira: faturamento por mês + a linha DRE_CONFIG, e guarda o que foi gravado.
  const FAT = { '2026-09': 492833.00, '2026-07': 439837.13 };
  let gravado = null;
  await ctx.route('**/rest/v1/**', async (route) => {
    const req = route.request(), url = req.url();
    const json = b => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/rpc\/verificar_login/.test(url)) return json([{ nome: 'Tiago', cargo: 'mestre' }]);
    if (/checklist_diario/.test(url)) {
      const m = /data_operacao=gte\.(\d{4}-\d{2})/.exec(url);
      const v = (m && FAT[m[1]]) || 0;
      return json(v ? [{ venda_salao: v, venda_delivery: 0 }] : []);
    }
    if (/gn_lojas\?loja=eq\.DRE_CONFIG/.test(url)) {
      if (req.method() === 'PATCH') { gravado = JSON.parse(req.postData() || '{}'); return json([]); }
      return json([{ loja: 'DRE_CONFIG', all_data: gravado ? gravado.all_data : {} }]);
    }
    return json([]);
  });

  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try {
      await page.waitForFunction(() => { try { return typeof _dreFormHtml === 'function' && DRE_CONTAS; } catch (e) { return false; } }, { timeout: 20000 });
      break;
    } catch (e) { if (t >= 3) { console.log('FALHOU: a Home não carregou'); await browser.close(); process.exit(1); } }
  }

  const temFix = await page.evaluate(() => typeof _dreMesEscolhido === 'function' && typeof _dreTrocarMes === 'function');
  if (!temFix) {
    console.log('FALHOU: a escolha de mês não existe neste arquivo (contraprova esperada — é nova)');
    console.log('\n0 OK, 12 falhou');
    await browser.close(); process.exit(1);
  }

  // Põe o formulário na tela, como o card faz.
  const montar = () => page.evaluate(([loja, card]) => {
    session = { nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    masterLoja = loja;
    _dreAllData = { pct: {}, real: {} };
    _dreCtx = { loja, comp: card, faturamento: 492833, mesNome: 'setembro' };
    _dreEditando = false;
    const box = document.createElement('div');
    box.id = '__dre_form';
    box.innerHTML = _dreFormHtml(loja, card);
    document.body.appendChild(box);
    return [...document.querySelectorAll('#dre-mes option')].map(o => ({ v: o.value, t: o.textContent.trim() }));
  }, [LOJA, CARD]);

  const opts = await montar();
  check('o formulário passa a ter um seletor de mês', opts.length >= 12);
  check('abre no mês do card', opts[0].v === CARD && /setembro de 2026/.test(opts[0].t));
  check('e oferece os meses de trás, que antes eram inalcançáveis',
    opts.some(o => o.v === ATRAS) && opts.some(o => o.v === '2026-01'));
  check('com o nome do mês por extenso, não AAAA-MM', /julho de 2026/.test((opts.find(o => o.v === ATRAS) || {}).t || ''));

  // ── Trocar o mês mostra a base e converte o valor em % ──────────────────────────
  // O relatório da empresa vem em % (CMV 35,63%) e o campo é em R$ — sem a conferência na
  // tela, a conversão fica na cabeça de quem digita, nove meses seguidos.
  const base = await page.evaluate(async ([atras]) => {
    document.getElementById('dre-mes').value = atras;
    await _dreTrocarMes();
    document.getElementById('dre-real-cmv').value = '160000';
    _dreHintInput();
    return { base: document.getElementById('dre-base').textContent,
             hint: document.getElementById('dre-hint-cmv').textContent,
             escolhido: _dreMesEscolhido() };
  }, [ATRAS]);
  check('escolher o mês puxa o faturamento dele', /julho de 2026/.test(base.base) && /439\.837,13/.test(base.base));
  check('e o valor digitado mostra quanto é em % do faturamento', base.hint === '36,38%');
  check('o mês escolhido é o que vale', base.escolhido === ATRAS);

  // ── Salvar grava no mês ESCOLHIDO ─────────────────────────────────────────────
  const salvou = await page.evaluate(async () => {
    document.getElementById('dre-user').value = 'Tiago';
    document.getElementById('dre-pass').value = 'x';
    await _dreSalvar();
    return { chaves: Object.keys((_dreAllData || {}).real || {}),
             msg: document.getElementById('dre-err').textContent,
             cor: document.getElementById('dre-err').style.color,
             senhaAindaLa: document.getElementById('dre-pass').value };
  });
  check('grava na competência escolhida, não na do card',
    salvou.chaves.length === 1 && salvou.chaves[0] === LOJA + '|' + ATRAS);
  check('avisa qual mês foi salvo — o card continua sendo o do mês fechado',
    /julho de 2026/.test(salvou.msg) && /salvo/i.test(salvou.msg));
  check('a mensagem de sucesso não vem vestida de erro', salvou.cor.replace(/\s/g, '') === 'rgb(21,128,61)');
  check('e a senha continua na tela, pra lançar o próximo mês sem relogar', salvou.senhaAindaLa === 'x');

  // ── Lançar um mês não pode encostar no outro ─────────────────────────────────
  const segundo = await page.evaluate(async ([card]) => {
    document.getElementById('dre-mes').value = card;
    await _dreTrocarMes();
    const limpoAoTrocar = document.getElementById('dre-real-cmv').value;
    document.getElementById('dre-real-cmv').value = '175000';
    await _dreSalvar();
    const real = (_dreAllData || {}).real || {};
    return { limpoAoTrocar, chaves: Object.keys(real).sort(),
             julho: (real['ITAQUERA|2026-07'] || {}).cmv, setembro: (real['ITAQUERA|2026-09'] || {}).cmv };
  }, [CARD]);
  check('trocar de mês limpa o valor do mês anterior em vez de arrastá-lo', segundo.limpoAoTrocar === '');
  check('os dois meses convivem', segundo.chaves.join(',') === 'ITAQUERA|2026-07,ITAQUERA|2026-09');
  check('cada um com o seu valor', segundo.julho === 160000 && segundo.setembro === 175000);

  // ── A % continua sendo da loja, não do mês ──────────────────────────────────
  const pcts = await page.evaluate(() => Object.keys(((_dreAllData || {}).pct) || {}));
  check('lançar meses não transforma a loja numa exceção de %', pcts.length === 0);

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
