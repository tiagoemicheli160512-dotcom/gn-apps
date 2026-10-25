// Suite do painel "Acessos (quem entrou)" do gn-usuarios + sanidade do filtro.
// Uso: node e2e_login_acessos.js [arquivo.html]
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const path = require('path');

const ARQ = process.argv[2] || CAMINHOS.pub('gn-usuarios.html');
const URL = 'file://' + path.resolve(ARQ);

let ok = 0, fail = 0;
const t = (nome, cond, extra) => {
  if (cond) { ok++; console.log('  ok   ' + nome); }
  else { fail++; console.log('  FALHA ' + nome + (extra ? ' | ' + extra : '')); }
};

const ACESSOS = [
  { nome: 'Luiz', cargo: 'gerente', loja: 'NORTE SHOPPING', app: 'gn-lojas', criado_em: '2026-10-22T17:17:00+00:00' },
  { nome: 'Matheus', cargo: 'compras', loja: 'GERAL', app: 'gn-pedidos', criado_em: '2026-10-22T16:00:00+00:00' },
  { nome: '<img src=x onerror=alert(1)>', cargo: 'gerente', loja: 'BANGU', app: 'gn-lojas', criado_em: '2026-10-22T15:00:00+00:00' },
];

async function montar(page, opts = {}) {
  const pedidos = [];
  await page.route('**/rest/v1/**', async route => {
    const u = route.request().url();
    pedidos.push(u);
    const json = b => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (u.includes('rpc/verificar_login')) return json([{ id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: {}, senha_alterada_em: null }]);
    if (u.includes('gn_usuarios_publico')) return json([{ id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', ativo: true }]);
    if (u.includes('gn_login_acessos')) {
      if (opts.erroAcessos) return route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' });
      const temFiltro = u.includes('or=');
      if (opts.vazioComFiltro && temFiltro) return json([]);
      if (opts.vazioSempre) return json([]);
      return json(ACESSOS);
    }
    if (u.includes('gn_login_tentativas')) return json([]);
    return json([]);
  });
  await page.goto(URL);
  await page.fill('#login-nome', 'Tiago');
  await page.fill('#login-senha', 'x');
  await page.click('#btn-entrar');
  await page.waitForSelector('#lista-acessos div', { timeout: 5000 }).catch(() => {});
  return pedidos;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  console.log('\n== painel de acessos ==');
  {
    const page = await browser.newPage();
    const pedidos = await montar(page);
    const txt = await page.textContent('body');
    const html = await page.innerHTML('#lista-acessos').catch(() => '');

    t('secao "Acessos (quem entrou)" existe', txt.includes('Acessos (quem entrou)'));
    t('lista o acesso do Luiz', html.includes('Luiz'));
    t('mostra o cargo traduzido (Gerente)', html.includes('Gerente'), html.slice(0, 200));
    t('mostra a loja', html.includes('NORTE SHOPPING'));
    t('mostra o app', html.includes('gn-lojas'));
    t('mostra data e hora', /22\/10\/2026\s+\d{2}:\d{2}/.test(html), html.slice(0, 300));
    t('nome malicioso vem escapado', !html.includes('<img src=x') && html.includes('&lt;img'), html.includes('<img src=x') ? 'HTML CRU NA TELA' : '');
    t('carrega do gn_login_acessos com limite e ordem',
      pedidos.some(u => u.includes('gn_login_acessos') && u.includes('order=criado_em.desc') && u.includes('limit=60')),
      pedidos.filter(u => u.includes('acessos')).join(' | '));
    t('nao pede nada de escrita na tabela de acessos',
      pedidos.filter(u => u.includes('gn_login_acessos')).length > 0);
    await page.close();
  }

  console.log('\n== filtro ==');
  {
    const page = await browser.newPage();
    const pedidos = await montar(page);
    const antes = pedidos.filter(u => u.includes('gn_login_acessos')).length;
    await page.fill('#busca-acessos', 'norte');
    await page.waitForTimeout(700);
    const depois = pedidos.filter(u => u.includes('gn_login_acessos'));
    t('filtro dispara nova busca no servidor', depois.length > antes, 'antes=' + antes + ' depois=' + depois.length);
    const ultima = decodeURIComponent(depois[depois.length - 1] || '');
    t('filtro usa or= em nome, loja e app',
      ultima.includes('or=(nome.ilike.*norte*') && ultima.includes('loja.ilike.*norte*') && ultima.includes('app.ilike.*norte*'),
      ultima);
    await page.close();
  }

  console.log('\n== filtro com caractere que quebraria o or=() ==');
  {
    const page = await browser.newPage();
    const pedidos = await montar(page);
    await page.fill('#busca-acessos', 'lui,z)(*');
    await page.waitForTimeout(700);
    const ultima = decodeURIComponent(pedidos.filter(u => u.includes('gn_login_acessos')).pop() || '');
    const termo = (ultima.match(/nome\.ilike\.\*([^*]*)\*/) || [])[1];
    t('virgula e parenteses saem do termo', termo === 'luiz', 'termo=' + JSON.stringify(termo) + ' | ' + ultima);
    t('nao sobra parentese solto quebrando o filtro', (ultima.match(/\(/g) || []).length === 1, ultima);
    await page.close();
  }

  console.log('\n== estados vazios e de erro ==');
  {
    const page = await browser.newPage();
    await montar(page, { vazioSempre: true });
    const html = await page.innerHTML('#lista-acessos');
    t('sem acesso ainda, explica que o registro passa a valer', html.includes('passa a valer'), html);
    await page.close();
  }
  {
    const page = await browser.newPage();
    await montar(page, { vazioComFiltro: true });
    await page.fill('#busca-acessos', 'zzz');
    await page.waitForTimeout(700);
    const html = await page.innerHTML('#lista-acessos');
    t('filtro sem resultado tem mensagem propria', html.includes('Nenhum acesso com esse filtro'), html);
    await page.close();
  }
  {
    const page = await browser.newPage();
    await montar(page, { erroAcessos: true });
    const html = await page.innerHTML('#lista-acessos');
    t('erro de rede nao quebra a tela', html.includes('Erro ao carregar acessos'), html);
    const txt = await page.textContent('body');
    t('resto do painel continua de pe', txt.includes('Usuários') && txt.includes('Tentativas de login com falha'));
    await page.close();
  }

  await browser.close();
  console.log('\n' + ARQ);
  console.log('ok=' + ok + ' falhas=' + fail);
  process.exit(fail ? 1 : 0);
})();
