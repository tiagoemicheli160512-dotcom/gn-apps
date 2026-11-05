// "O Aryano é sub-gerente, e está dizendo que ele não pode assinar o cancelamento."
//
// A causa não era o Aryano. CARGOS_REABRIR — a mesma lista que libera assinar
// cancelamento, reabrir caixa fechado e excluir caixa aberto — nasceu com
// 'sub-gerente', 'subgerente' e 'sub gerente'. Nenhuma dessas três grafias existe em
// gn_usuarios: o banco grava 'sub_gerente'. A comparação era literal, então os 18
// sub-gerentes da rede eram barrados, e a tela dizia que o CARGO deles não tinha
// permissão — que é a mensagem que ninguém reporta como bug, porque parece regra.
//
// Dois níveis de prova aqui:
//   1. nenhuma grafia inventada sobrevive nas listas compartilhadas — é o que pega a
//      PRÓXIMA, antes de ela chegar na loja;
//   2. no app, um sub-gerente assina de verdade e um caixa continua barrado.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CONFIG = process.env.ARQ_CONFIG || CAMINHOS.pub('gn-lojas-config.js');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-caixa.html');

// Os cargos que REALMENTE existem em gn_usuarios (select cargo, count(*) ... group by).
// Se o banco ganhar um cargo novo, esta lista é o lugar de registrar.
const CARGOS_REAIS = ['sub_gerente','estoquista','gerente','caixa','supervisor',
                      'administrador','rh','mestre','manutencao','garcom','compras'];
// 'admin' não existe em gn_usuarios: é apelido histórico tolerado de propósito, não
// uma grafia errada de um cargo real. Qualquer outro forasteiro é defeito.
const APELIDOS_OK = ['admin'];

let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 300)); };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });

  // ── 1. As listas compartilhadas, lidas direto do config ─────────────────────
  const cfg = await (async () => {
    const p = await ctx.newPage();
    await p.setContent('<!doctype html><meta charset="utf-8">');
    await p.addScriptTag({ path: CONFIG });
    const r = await p.evaluate(() => {
      const listas = {};
      for (const k of Object.keys(window)) if (/^CARGOS_/.test(k) && Array.isArray(window[k])) listas[k] = window[k];
      return { listas, temHelper: typeof window.gnCargoEm === 'function' };
    });
    await p.close();
    return r;
  })();

  check('o config expõe gnCargoEm, para cargo não ser comparado por igualdade literal', cfg.temHelper);

  const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,'');
  const reais = new Set(CARGOS_REAIS.map(norm).concat(APELIDOS_OK.map(norm)));
  const forasteiros = [];
  for (const [nome, lista] of Object.entries(cfg.listas))
    for (const c of lista) if (!reais.has(norm(c))) forasteiros.push(`${nome}: "${c}"`);
  check('nenhuma lista de cargo cita um cargo que não existe em gn_usuarios',
    forasteiros.length === 0, forasteiros.join(' · '));

  // A checagem acima normaliza — então ela sozinha NÃO pegaria 'sub-gerente' no lugar de
  // 'sub_gerente', que foi o defeito. Com o normalizador rodando, a variante deixou de
  // machucar; mas lista que não usa a grafia do banco é armadilha pro próximo que ler.
  // Esta cobra a grafia exata, e é ela que reprova a lista que bloqueou os sub-gerentes.
  const exatos = new Set(CARGOS_REAIS.concat(APELIDOS_OK));
  const variantesNaLista = [];
  for (const [nome, lista] of Object.entries(cfg.listas))
    for (const c of lista) if (!exatos.has(c) && reais.has(norm(c))) variantesNaLista.push(`${nome}: "${c}"`);
  check('e todas escrevem o cargo como gn_usuarios escreve',
    variantesNaLista.length === 0, variantesNaLista.join(' · '));

  // A regra de negócio que o dono confirmou: "sub, gerente e supervisor e mestre podem sim".
  for (const [lista, cargo, esperado] of [
    ['CARGOS_REABRIR', 'sub_gerente', true], ['CARGOS_REABRIR', 'gerente', true],
    ['CARGOS_REABRIR', 'supervisor', true],  ['CARGOS_REABRIR', 'mestre', true],
    ['CARGOS_REABRIR', 'administrador', true],
    ['CARGOS_REABRIR', 'caixa', false],      ['CARGOS_REABRIR', 'estoquista', false],
    ['CARGOS_REABRIR', 'garcom', false],     ['CARGOS_REABRIR', 'rh', false],
  ]) {
    const p = await ctx.newPage();
    await p.setContent('<!doctype html><meta charset="utf-8">');
    await p.addScriptTag({ path: CONFIG });
    // Sem o helper, cai na comparação literal — que é exatamente o que a versão
    // antiga fazia. Assim o teste REPROVA o código quebrado em vez de morrer nele.
    const r = await p.evaluate(({ lista, cargo }) => window.gnCargoEm
      ? window.gnCargoEm(cargo, window[lista])
      : (window[lista] || []).includes(String(cargo || '').toLowerCase()), { lista, cargo });
    await p.close();
    check(`${cargo} ${esperado ? 'assina e reabre' : 'continua barrado'}`, r === esperado, `deu ${r}`);
  }

  // A grafia não pode voltar a decidir: as quatro escritas são a mesma pessoa.
  const variantes = await (async () => {
    const p = await ctx.newPage();
    await p.setContent('<!doctype html><meta charset="utf-8">');
    await p.addScriptTag({ path: CONFIG });
    const r = await p.evaluate(() => {
      const em = (c) => window.gnCargoEm ? window.gnCargoEm(c, window.CARGOS_REABRIR)
        : window.CARGOS_REABRIR.includes(String(c || '').toLowerCase());
      return ['sub_gerente','sub-gerente','sub gerente','SubGerente','Sub-Gerente '].map(em);
    });
    await p.close();
    return r;
  })();
  check('hífen, underline, espaço e maiúscula dão todos no mesmo cargo',
    variantes.every(Boolean), JSON.stringify(variantes));
  const vazio = await (async () => {
    const p = await ctx.newPage();
    await p.setContent('<!doctype html><meta charset="utf-8">');
    await p.addScriptTag({ path: CONFIG });
    const r = await p.evaluate(() => {
      const em = (c) => window.gnCargoEm ? window.gnCargoEm(c, window.CARGOS_REABRIR)
        : window.CARGOS_REABRIR.includes(String(c || '').toLowerCase());
      return [em(''), em(null), em('   ')];
    });
    await p.close();
    return r;
  })();
  check('cargo vazio ou nulo NÃO vira permissão', vazio.every(v => v === false), JSON.stringify(vazio));

  // ── 2. No app: o Aryano assina ──────────────────────────────────────────────
  const gravados = [], patches = [];
  await ctx.route('**/rest/v1/**', async r => {
    const req = r.request(), url = req.url(), metodo = req.method();
    if (/rpc\/verificar_login/.test(url)) {
      const b = JSON.parse(req.postData() || '{}');
      // Aryano é sub-gerente de verdade — o cargo vem do banco escrito 'sub_gerente'.
      if (b.p_nome === 'Aryano' && b.p_senha === 'certa')
        return r.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify([{ id: 7, nome: 'Aryano Melo', cargo: 'sub_gerente', loja: 'BANGU' }]) });
      if (b.p_nome === 'caixa1' && b.p_senha === 'certa')
        return r.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify([{ id: 2, nome: 'Ana Souza', cargo: 'caixa', loja: 'BANGU' }]) });
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (/gn_caixa_fechamento/.test(url) && metodo === 'PATCH') {
      patches.push(JSON.parse(req.postData() || '{}'));
      return r.fulfill({ status: 204, body: '' });
    }
    if (/gn_caixa_cancelamento/.test(url) && metodo === 'POST') {
      const b = JSON.parse(req.postData() || '{}'); gravados.push(b);
      return r.fulfill({ status: 201, contentType: 'application/json',
        body: JSON.stringify([{ id: 'id-' + gravados.length, criado_em: new Date().toISOString(), ...b }]) });
    }
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + ARQ);
  await page.waitForFunction(() => { try {
    return typeof renderTudo === 'function' && typeof S === 'object' && S !== null;
  } catch (e) { return false; } }, { timeout: 20000 });
  await page.evaluate(() => {
    S.user = { nome: 'Tiago', cargo: 'gerente' };
    S.loja = 'BANGU'; S.turnoSel = 'NOITE'; S.modoConsulta = false;
    S.fech = { id: 'fech-1', loja: 'BANGU', data: '2026-10-15', turno: 'NOITE', status: 'ABERTO',
               operador: 'Tiago', suprimento_inicial: 700, repique: 0 };
    S.comprovantes = []; S.saidas = []; S.supr = []; S.notas10 = []; S.cancel = [];
    renderTudo();
  });

  const assinar = (nome, senha) => page.evaluate(async ({ nome, senha }) =>
    await _verificarAssinatura(nome, senha, 'teste'), { nome, senha });

  const aryano = await assinar('Aryano', 'certa');
  check('Aryano (sub_gerente) assina o cancelamento — era isto que estava barrado',
    !aryano.erro && aryano.u && aryano.u.nome === 'Aryano Melo', JSON.stringify(aryano));
  const caixa = await assinar('caixa1', 'certa');
  check('um caixa continua sem poder assinar', !!caixa.erro && !caixa.u, JSON.stringify(caixa));
  const senhaErrada = await assinar('Aryano', 'errada');
  check('e a senha errada do próprio Aryano também não passa',
    /incorret/i.test(senhaErrada.erro || ''), JSON.stringify(senhaErrada));

  // O caminho inteiro, como no print: lançar o cancelamento com a senha do Aryano.
  await page.evaluate(() => {
    document.getElementById('cancelVal').value = '16,99';
    // A categoria passou a ser obrigatória (ver e2e_cancel_categoria) — sem ela o
    // formulário nem chega na checagem de cargo, que é o que este teste mede.
    document.getElementById('cancelCategoria').value = 'Cliente desistiu';
    document.getElementById('cancelMotivo').value = 'Cliente pediu e em seguida desistiu';
    document.getElementById('cancelAutorNome').value = 'Aryano';
    document.getElementById('cancelAutorSenha').value = 'certa';
  });
  await page.evaluate(() => addCancelamento());
  await page.waitForFunction(() => true);
  check('o cancelamento chega a ser gravado', gravados.length === 1, JSON.stringify(gravados));
  check('e grava o nome VERIFICADO, não o que foi digitado',
    gravados[0] && gravados[0].autorizado_por === 'Aryano Melo', JSON.stringify(gravados[0]));
  const msg = await page.evaluate(() => document.getElementById('cancelMsg').textContent);
  check('sem a mensagem de cargo sem permissão na tela', !/não tem cargo/i.test(msg), msg);

  check('nenhum erro de JS no caminho', erros.length === 0, erros.join(' | '));

  await ctx.close(); await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
