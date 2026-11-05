// "Travar todos. Pra não ter saída."
//
// A trava de presença nasceu só na Home. Mas os apps dividem a MESMA sessão
// (gn_session_v1), entao um atalho direto pro Caixa na tela do celular entrava sem passar
// por ela — a trava existia e tinha porta dos fundos.
//
// Esta suíte é a única que responde "não tem saída?" de verdade: ela ABRE CADA APP, um
// por um, com uma sessão de gerente, e cobra que a trava suba. Testar o módulo
// isoladamente não responderia isso — o que falha num caso desses é o app que esqueceu o
// <script>, o que chama a chave de outro nome, o que monta a tela tarde demais.
//
// O que cada app precisa ter, e esta suíte confere em todos:
//   · o <script src="gn-presenca.js"> e o calendário carregados;
//   · a chave do Supabase achável pelo guardião (SB_KEY, SUPA_KEY ou SB_ANON);
//   · a trava subindo com sessão de gerente, e NÃO subindo pra caixa/estoquista/mestre.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const fs = require('fs');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 300)); };

// Os apps que uma gerência de loja abre. gn-comissoes-mestra fica de fora: é a tela do
// mestre, que nunca é cobrado por presença.
const APPS = ['gn-home', 'gn-caixa', 'gn-checklist', 'gn-lojas', 'gn-pedidos', 'gn-rh',
  'gn-usuarios', 'gn-inventario', 'gn-avaliacoes', 'gn-comissoes', 'gn-comandas', 'gn-manutencao'];

const HOJE = '2026-10-30';          // sexta → semana 42, dia 4 no calendário do app
const h = (e, s) => ({ entrada: e, saida: s });
const ESCALA = { '42': { funcs: [
  { id: '1', nome: 'A.CAROLINA OLIVEIRA ', setor: 'Sub Gerente', dias: Array(7).fill('PRESENTE'),
    horario_dias: Array(7).fill(h('15:00', '23:00')) },
  { id: '2', nome: 'ANTÔNIO FERNANDO ', setor: 'Gerente', dias: Array(7).fill('PRESENTE'),
    horario_dias: Array(7).fill(h('08:00', '16:00')) },
] } };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  // ══ 1. O ARQUIVO CHEGOU EM TODO MUNDO ═══════════════════════════════════════════
  // Antes de abrir navegador: a falha mais provável deste trabalho é um app ficar sem a
  // tag, e ela some num diff de 13 arquivos.
  APPS.forEach(a => {
    const src = fs.readFileSync(CAMINHOS.pub(a + '.html'), 'utf8');
    check(`${a}: carrega gn-presenca.js`,
      /<script src="gn-presenca\.js"><\/script>/.test(src));
    check(`${a}: carrega o calendário, de que a trava depende`,
      /<script src="gn-comissoes-calendario\.js"><\/script>/.test(src));
    // A ordem importa: o guardião usa GN_LOJAS e COMISSOES_CAL.
    const iCfg = src.indexOf('gn-lojas-config.js');
    const iPres = src.indexOf('gn-presenca.js');
    const iCal = src.indexOf('gn-comissoes-calendario.js');
    check(`${a}: carrega depois do config e do calendário`,
      iCfg >= 0 && iCfg < iPres && iCal < iPres, `cfg=${iCfg} cal=${iCal} pres=${iPres}`);
  });

  // ══ 2. A TRAVA SOBE EM CADA APP ═════════════════════════════════════════════════
  for (const app of APPS) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await CAMINHOS.fixarRelogio(ctx, HOJE + 'T16:20:00');
    await ctx.route('**/rest/v1/**', r => {
      const u = r.request().url();
      const j = x => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) });
      if (/gn_presenca_loja/.test(u)) return j([]);                 // ninguém confirmou hoje
      if (/gn_usuarios_publico/.test(u)) return j([{ escala_nome: 'A.CAROLINA OLIVEIRA' }]);
      if (/gn_comissoes/.test(u)) return j([{ all_data: ESCALA }]);
      j([]);
    });
    const page = await ctx.newPage();
    const erros = [];
    page.on('pageerror', e => erros.push(String(e)));
    // A sessão compartilhada já no lugar ANTES do app carregar: é exatamente o caso que
    // esta suíte existe pra cobrir — a pessoa abre o app direto, sem passar pela Home.
    await page.addInitScript(() => {
      try {
        localStorage.setItem('gn_session_v1', JSON.stringify({
          id: 7, nome: 'Carol', cargo: 'sub_gerente', loja: 'BANGU',
          permissoes: { master: false, caixa: true, checklist: true, lojas: true, pedidos: true,
            rh: true, usuarios: true, inventario: true, avaliacoes: true, comissoes: true,
            comandas: true, manutencao: true },
          ts: Date.now(),
        }));
      } catch (e) {}
    });
    await page.goto('file://' + CAMINHOS.pub(app + '.html'));

    // O auto-arme espera o load + 1200ms de propósito (o app monta a tela primeiro).
    let subiu = false;
    try {
      await page.waitForSelector('#gate-presenca', { timeout: 12000 });
      subiu = true;
    } catch (e) { subiu = false; }

    // A credencial resolvida DENTRO do app, não pela resposta do mock: com a rota
    // dublada, uma URL vazia ainda seria atendida aqui e o teste passaria com a trava
    // quebrada em produção. É a falha mais perigosa deste módulo — sem chave ele não
    // busca nada, a trava não aparece, e parece que está valendo.
    const cred = await page.evaluate(() => {
      try { return { url: _gnPresSbUrl(), key: (_gnPresSbKey() || '').slice(0, 12) }; }
      catch (e) { return { url: '', key: '' }; }
    });
    check(`${app}: acha o endereço do Supabase sem depender do script do app`,
      /^https:\/\//.test(cred.url) && cred.key.length === 12, JSON.stringify(cred));

    check(`${app}: a trava sobe pra gerência que abre o app direto`, subiu,
      'guardião=' + await page.evaluate(() => typeof gnPresencaGuardiao) +
      ' chave=' + await page.evaluate(() => { try { return _gnPresSbKey() ? 'ok' : 'VAZIA'; } catch (e) { return 'erro'; } }));

    if (subiu) {
      const txt = (await page.locator('#gate-presenca').textContent()).replace(/\s+/g, ' ').trim();
      check(`${app}: e pede a confirmação com o nome certo da escala`,
        /Você está na loja/.test(txt) && /A.CAROLINA OLIVEIRA/.test(txt), txt.slice(0, 180));
      check(`${app}: com a porta de saída`, /Não sou eu/.test(txt), txt.slice(-120));
    }

    const reais = erros.filter(e => !/createClient|Failed to fetch|supabase|NetworkError|net::|importScripts|ServiceWorker/i.test(e));
    check(`${app}: sem erro de JS novo`, reais.length === 0, reais.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ══ 3. QUEM NÃO É COBRADO CONTINUA ENTRANDO ═════════════════════════════════════
  // A trava errada é pior que trava nenhuma: se ela subir pro caixa ou pro estoquista, a
  // operação para por uma pergunta que essa pessoa não tem como responder.
  for (const cargo of ['caixa', 'estoquista', 'mestre']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await CAMINHOS.fixarRelogio(ctx, HOJE + 'T16:20:00');
    await ctx.route('**/rest/v1/**', r => {
      const u = r.request().url();
      const j = x => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) });
      if (/gn_comissoes/.test(u)) return j([{ all_data: ESCALA }]);
      if (/gn_usuarios_publico/.test(u)) return j([{ escala_nome: null }]);
      j([]);
    });
    const page = await ctx.newPage();
    await page.addInitScript(c => {
      try {
        localStorage.setItem('gn_session_v1', JSON.stringify({
          id: 9, nome: 'Fulano', cargo: c, loja: 'BANGU', permissoes: { caixa: true }, ts: Date.now(),
        }));
      } catch (e) {}
    }, cargo);
    await page.goto('file://' + CAMINHOS.pub('gn-caixa.html'));
    await page.waitForTimeout(3500);
    check(`${cargo} abre o Caixa sem nenhuma trava`,
      (await page.locator('#gate-presenca').count()) === 0);
    await ctx.close();
  }

  // ══ 3b. QUEM OPERA A REDE INTEIRA TAMBÉM NÃO É COBRADO ═════════════════════════
  // Diferente dos cargos acima: aqui o cargo até é de gerência, mas a pessoa responde
  // pela rede (loja GERAL, ou permissão de master). Presença em loja nenhuma é dela.
  for (const quem of [
    { nome: 'Rede', cargo: 'gerente', loja: 'GERAL', permissoes: {} },
    { nome: 'Dono', cargo: 'gerente', loja: 'BANGU', permissoes: { master: true } },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await CAMINHOS.fixarRelogio(ctx, HOJE + 'T16:20:00');
    await ctx.route('**/rest/v1/**', r => {
      const u = r.request().url();
      const j = x => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) });
      if (/gn_presenca_loja/.test(u)) return j([]);
      if (/gn_usuarios_publico/.test(u)) return j([{ escala_nome: 'A.CAROLINA OLIVEIRA' }]);
      if (/gn_comissoes/.test(u)) return j([{ all_data: ESCALA }]);
      j([]);
    });
    const page = await ctx.newPage();
    await page.addInitScript(q => {
      try { localStorage.setItem('gn_session_v1', JSON.stringify(Object.assign({ id: 3, ts: Date.now() }, q))); } catch (e) {}
    }, quem);
    await page.goto('file://' + CAMINHOS.pub('gn-caixa.html'));
    await page.waitForTimeout(3500);
    check(`${quem.nome} (${quem.loja === 'GERAL' ? 'loja GERAL' : 'permissão master'}) não é cobrado por presença`,
      (await page.locator('#gate-presenca').count()) === 0);
    await ctx.close();
  }

  // ══ 4. SESSÃO VENCIDA NÃO TRAVA ═════════════════════════════════════════════════
  // Quem tem sessão velha vai cair no login do app de qualquer jeito; trava em cima disso
  // seria uma pergunta antes de uma tela de senha.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await CAMINHOS.fixarRelogio(ctx, HOJE + 'T16:20:00');
    // Com a escala respondendo de verdade: mockar vazio faria a trava não subir de
    // qualquer jeito, e o teste passaria sem a regra de validade existir.
    await ctx.route('**/rest/v1/**', r => {
      const u = r.request().url();
      const j = x => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) });
      if (/gn_presenca_loja/.test(u)) return j([]);
      if (/gn_usuarios_publico/.test(u)) return j([{ escala_nome: 'A.CAROLINA OLIVEIRA' }]);
      if (/gn_comissoes/.test(u)) return j([{ all_data: ESCALA }]);
      j([]);
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      try {
        localStorage.setItem('gn_session_v1', JSON.stringify({
          id: 7, nome: 'Carol', cargo: 'sub_gerente', loja: 'BANGU', permissoes: {},
          ts: Date.now() - 50 * 3600 * 1000,       // 50h atrás, muito além das 12h
        }));
      } catch (e) {}
    });
    await page.goto('file://' + CAMINHOS.pub('gn-caixa.html'));
    await page.waitForTimeout(3500);
    check('sessão vencida não faz a trava subir',
      (await page.locator('#gate-presenca').count()) === 0);
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
