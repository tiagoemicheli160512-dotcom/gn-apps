// O vínculo é a peça que faz o bloqueio existir: sem ele salvo, folga e férias não
// alcançam o login. Este teste cobre a tela onde esse vínculo é feito (app Usuários):
// a sugestão automática, o aviso de quem ficou sem vínculo, e o que vai pro banco ao salvar.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const APP = process.env.ARQ_APP || CAMINHOS.pub('gn-usuarios.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const hoje = new Date();
const seg = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - ((hoje.getDay() + 6) % 7));
const SEM = Math.round((seg - Date.UTC(2026, 0, 5)) / 604800000);

const SEMANA = { funcs: [
  { id: 0, nome: 'Renata ALVES - gerente',   setor: 'Gerente', dias: Array(7).fill('PRESENTE') },
  { id: 1, nome: 'Marcos ALVES - gerente', setor: 'Gerente', dias: Array(7).fill('PRESENTE') },
  { id: 2, nome: 'Jandy ALVES - estoque',     setor: 'Estoque', dias: Array(7).fill('PRESENTE') },
  { id: 3, nome: 'Fulano ARQUIVADO - salão',  setor: 'Salão',   dias: Array(7).fill('PRESENTE'), arquivado: true },
]};

// Três usuários de Caxias: um já vinculado, um que a sugestão acerta, um que ela não acerta.
const USUARIOS = [
  { id: 1,  nome: 'Renata',     cargo: 'gerente',  loja: 'CAXIAS', ativo: true,
    permissoes: { lojas: true } },
  { id: 2,  nome: 'Marquinhos', cargo: 'gerente',  loja: 'CAXIAS', ativo: true,
    permissoes: { lojas: true, dashboard_metas: { CAXIAS: 300000 } } },
  { id: 3,  nome: 'Jandy',      cargo: 'estoquista', loja: 'CAXIAS', ativo: true,
    permissoes: { lojas: true, escala_nome: 'Jandy ALVES - estoque' } },
  { id: 38, nome: 'Tiago',      cargo: 'mestre',   loja: 'GERAL',  ativo: true, permissoes: { master: true } },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 900, height: 1000 } });
  const patches = [];
  await ctx.route('**/rest/v1/**', async (r) => {
    const req = r.request(), url = req.url(), m = req.method();
    const json = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/rpc\/verificar_login/.test(url)) return json([{ id: 38, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } }]);
    if (/rpc\/existe_login_duplicado/.test(url)) return json(false);
    if (/gn_usuarios_publico/.test(url)) return json(USUARIOS);
    if (/gn_comissoes/.test(url)) return json([{ [String(SEM)]: SEMANA }]);
    if (/gn_usuarios/.test(url) && m === 'PATCH') {
      patches.push({ url, body: JSON.parse(req.postData() || '{}') });
      return json([USUARIOS[0]]);
    }
    return json([]);
  });
  const page = await ctx.newPage();
  await page.goto('file://' + APP);
  await page.waitForFunction(() => typeof fazerLogin === 'function', { timeout: 25000 });

  await page.evaluate(() => {
    document.getElementById('login-nome').value = 'Tiago';
    document.getElementById('login-senha').value = 'x';
    fazerLogin();
  });
  await page.waitForTimeout(900);

  // ── 1. A lista mostra quem está sem vínculo ───────────────────────────────────────
  const lista = await page.evaluate(() => document.getElementById('lista-usuarios').textContent);
  check('o usuário já vinculado mostra qual linha da escala é dele', /escala: Jandy ALVES/.test(lista));
  check('quem não tem vínculo aparece avisado, não em silêncio',
    /sem vínculo com a escala/.test(lista));
  check('a Renata de Caxias aparece como exceção combinada',
    /exceção combinada/.test(lista));

  // ── 2. Sugestão quando o primeiro nome bate ───────────────────────────────────────
  await page.evaluate(() => abrirEdicao(2));   // Marquinhos
  await page.waitForTimeout(700);
  const marq = await page.evaluate(() => ({
    valor: document.getElementById('modal-escala').value,
    dica: document.getElementById('modal-escala-dica').textContent,
    visivel: !document.getElementById('field-escala').classList.contains('hidden'),
    opcoes: [...document.getElementById('modal-escala').options].map(o => o.value),
  }));
  check('o campo de vínculo aparece pra quem é de loja', marq.visivel === true);
  check('"Marquinhos" não ganha sugestão nenhuma (o apelido não bate com Marcos)',
    marq.valor === '');
  check('e a tela diz em vermelho que ficou sem vínculo',
    /Não deu pra adivinhar/.test(marq.dica));
  check('a lista traz os funcionários da escala, sem o arquivado',
    marq.opcoes.includes('Renata ALVES - gerente') &&
    marq.opcoes.includes('Marcos ALVES - gerente') &&
    !marq.opcoes.includes('Fulano ARQUIVADO - salão'));

  // ── 3. Salvar grava o vínculo e não derruba o resto das permissões ────────────────
  await page.evaluate(() => {
    document.getElementById('modal-escala').value = 'Marcos ALVES - gerente';
    document.getElementById('modal-save').click();
  });
  await page.waitForTimeout(900);
  const salvo = patches.find(p => /id=eq\.2/.test(p.url));
  check('o vínculo escolhido vai pro banco',
    !!salvo && salvo.body.permissoes.escala_nome === 'Marcos ALVES - gerente');
  check('e as metas do Painel de Gestão sobrevivem ao salvamento (sumiam antes)',
    !!salvo && salvo.body.permissoes.dashboard_metas &&
    salvo.body.permissoes.dashboard_metas.CAXIAS === 300000);

  // ── 4. Quem já tem vínculo abre com ele, sem ser sobrescrito pela sugestão ────────
  await page.evaluate(() => abrirEdicao(3));   // Jandy, já vinculado
  await page.waitForTimeout(700);
  const jandy = await page.evaluate(() => ({
    valor: document.getElementById('modal-escala').value,
    dica: document.getElementById('modal-escala-dica').textContent.trim(),
  }));
  check('quem já tem vínculo abre com ele selecionado', jandy.valor === 'Jandy ALVES - estoque');
  check('e sem aviso nenhum — já está resolvido', jandy.dica === '');

  // ── 5. GERAL não tem escala, então nem mostra o campo ─────────────────────────────
  await page.evaluate(() => abrirEdicao(38));  // Tiago, mestre, GERAL
  await page.waitForTimeout(500);
  const geral = await page.evaluate(() =>
    document.getElementById('field-escala').classList.contains('hidden'));
  check('pra quem é GERAL o campo nem aparece (não tem escala)', geral === true);

  // ── 6. Tirar o vínculo é possível, e some do banco ────────────────────────────────
  await page.evaluate(() => abrirEdicao(3));
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    document.getElementById('modal-escala').value = '';
    document.getElementById('modal-save').click();
  });
  await page.waitForTimeout(900);
  const removido = patches.filter(p => /id=eq\.3/.test(p.url)).pop();
  check('dá pra desfazer o vínculo, e ele some das permissões',
    !!removido && !('escala_nome' in removido.body.permissoes));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
