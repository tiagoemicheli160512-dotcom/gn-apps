// "após finalizar, o resultado e o histórico da visita aparece no home da loja por uma
//  semana, a partir da data feita" — com a escolha "Gerência vê tudo".
//
// Prova: o card só aparece pra gerente / sub-gerente da loja (e pro mestre olhando a loja);
// pede ao servidor só o finalizado dos últimos 7 dias, daquela loja, de visita que ainda
// existe; mostra nota, nota por setor, críticos, plano de ação, fotos e obs; e tocar abre
// o check-list inteiro só pra leitura, sem gravar nada.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra))); c ? ok++ : falhou++; };

const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const hoje = new Date();
const dias = n => { const d = new Date(hoje); d.setDate(d.getDate() - n); return iso(d); };
const FOTO = 'https://ncxttwvpafajnilpjbol.supabase.co/storage/v1/object/public/fotos/visitas-checklist/a.jpg';

const LINHAS = [
  { id: 'r1', visita_id: 'v1', loja: 'Bangu', data: dias(1), tipo: 'salao', visitante: 'Carlos', finalizada: true, nota: 74,
    dados: { itens: { visual: { limpeza_geral: 9, uniformes: 8, limpeza_geral_foto: FOTO }, validade: { val_cozinha: 4, val_estoque: 10 } },
      acoes: { 'validade|val_cozinha': 'Descartar e treinar a equipe até sexta' }, obs: 'Salão bem montado, cozinha com produto vencido.', fechada: true } },
  { id: 'r2', visita_id: 'v1', loja: 'Bangu', data: dias(1), tipo: 'cozinha', visitante: 'Carlos', finalizada: true, nota: 67,
    dados: { itens: { documentacao: { lsf: 'C', pops: 'NC' }, ambientes: { pias: 'C' } }, fechada: true } },
  { id: 'r3', visita_id: 'v2', loja: 'Bangu', data: dias(6), tipo: 'padrao', visitante: 'Edna', finalizada: true, nota: 57.1,
    dados: { calibracao_equipamentos: { itens: { 0: { resp: 'SIM' }, 1: { resp: 'NAO', foto: FOTO }, 2: { resp: 'SIM' }, 3: { resp: 'NA' } }, finalizada: true,
      planoAcao: { 0: { itemIdx: 1, itemLabel: 'Filtros das coifas', crit: 'MAIOR', acaoCorretiva: 'Trocar filtro', prazoMax: dias(-1), prazo: dias(-1) } } } } },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 380, height: 900 } });
  const pedidos = [], escritas = [];
  await ctx.route('**/rest/v1/**', (route) => {
    const req = route.request(), url = decodeURIComponent(req.url());
    if (req.method() !== 'GET') escritas.push(url);
    if (/gn_visita_checklist/.test(url) && req.method() === 'GET') {
      pedidos.push(url);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LINHAS) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof _renderVisitaResultadoHome === 'function' && !!window.GNVck; } catch (e) { return false; } }, { timeout: 25000 }); break; }
    catch (e) {
      if (t >= 3) {
        const existe = await page.evaluate(() => { try { return typeof _renderVisitaResultadoHome === 'function'; } catch (e) { return false; } });
        console.log(existe ? 'FALHOU: o painel não carregou' : 'FALHOU: o card de resultado da visita não existe neste arquivo (contraprova esperada — é novo)');
        await browser.close(); process.exit(1);
      }
    }
  }

  const render = (cargo, master, masterL) => page.evaluate(async ({ cargo, master, masterL }) => {
    LOJAS_LISTA = GN_LOJAS.map(l => l.userKey);
    masterLoja = masterL || null;
    const sess = { id: 1, nome: 'Fulano', loja: 'BANGU', cargo, permissoes: {} };
    await _renderVisitaResultadoHome(true, sess, master);
    return document.getElementById('visita-resultado-home-card').textContent.replace(/\s+/g, ' ');
  }, { cargo, master, masterL });

  // ── Quem vê ──
  pedidos.length = 0;
  check('garçom não vê o card', (await render('garcom', false)) === '' && pedidos.length === 0);
  check('cozinheiro não vê o card', (await render('cozinheiro', false)) === '');
  const ger = await render('gerente', false);
  check('gerente vê o card', /Resultado das visitas/.test(ger), ger.slice(0, 80));
  check('sub-gerente vê o card', /Resultado das visitas/.test(await render('sub_gerente', false)));
  check('mestre olhando a loja vê o card', /Resultado das visitas/.test(await render('mestre', true, 'BANGU')));
  check('mestre na visão geral (sem loja) não vê', (await render('mestre', true, null)) === '');

  // ── O que é pedido ──
  const q = pedidos[pedidos.length - 1] || '';
  check('pede só a loja da sessão', /loja=eq\.Bangu&/.test(q), q);
  check('só o que foi finalizado', /finalizada=eq\.true/.test(q));
  check('só de visita que ainda existe (excluída some da Home)', /visita_id=not\.is\.null/.test(q));
  check('só dos últimos 7 dias, contando o dia da visita', q.includes('data=gte.' + dias(6)), q);

  // ── O que mostra ──
  check('nota do salão com classificação', /Supervisão salão 74\/100/.test(ger) && /Atenção/.test(ger), ger);
  check('nota por setor do salão', /Padrão Visual 8,5/.test(ger) && /Segurança Alimentar e Validades 7,0/.test(ger), ger);
  check('crítico do salão listado', /1 crítico: Validades em dia na cozinha/.test(ger));
  check('plano de ação e fotos contados', /plano de ação: 1 item/.test(ger) && /1 foto/.test(ger));
  check('observação geral aparece', /Salão bem montado/.test(ger));
  check('cozinha com % e risco de interdição', /Supervisão cozinha 67%/.test(ger) && /risco de interdição/.test(ger));
  check('auditoria com nota do tipo avaliado', /Auditoria de padrão 57,1%/.test(ger) && /Calibração de Equipamentos e Manutenção Preventiva 57,1%/.test(ger), ger);
  check('quem fez e quando', /Carlos · /.test(ger) && /Edna · /.test(ger));
  check('diz até quando fica na Home', /aparece aqui até/.test(ger));

  // ── Tocar abre tudo, só leitura ──
  escritas.length = 0;
  await page.evaluate(() => _vckHomeAbrir(0));
  await page.waitForSelector('#_vck-modal');
  const tela = await page.evaluate(() => ({
    t: document.getElementById('_vck-modal').textContent,
    travado: [...document.querySelectorAll('#_vck-modal button')].filter(b => /^\d+$/.test(b.textContent.trim())).every(b => b.disabled),
    campos: [...document.querySelectorAll('#_vck-modal input[type=text], #_vck-modal textarea')].filter(x => !/Filtrar/.test(x.placeholder)).every(x => x.readOnly),
    mediaSetor: /Padrão Visual2\/5 avaliados8,5/.test(document.getElementById('_vck-modal').textContent),
    semFoto: !document.querySelector('#_vck-modal input[type=file]'),
    abas: /Cozinha/.test(document.querySelector('#_vck-modal [style*="sticky"]').textContent),
  }));
  check('abre o check-list inteiro do salão', /Validades em dia na cozinha/.test(tela.t) && /Descartar e treinar/.test(tela.t.replace(/\s+/g, ' ')) || /Plano de ação/.test(tela.t), tela.t.slice(0, 150));
  check('mostra que é só leitura', /Resultado da visita/.test(tela.t) && tela.travado && tela.campos && tela.semFoto, tela);
  check('média do setor na tela igual à do card (só itens avaliados)', tela.mediaSetor);
  check('sem abas pra trocar de check-list (é o resultado daquela linha)', !tela.abas);
  await page.evaluate(() => { GNVck._nota('visual', 'limpeza_geral', 2); });
  await page.waitForTimeout(300);
  check('tocar numa nota não grava nada', escritas.length === 0, escritas);
  await page.evaluate(() => GNVck.fechar());
  await page.evaluate(() => _vckHomeAbrir(2));
  await page.waitForSelector('#_vck-modal');
  const aud = await page.evaluate(() => document.getElementById('_vck-modal').textContent.replace(/\s+/g, ' '));
  check('auditoria abre no tipo que foi feito, com o plano 5W2H', /Calibração de Equipamentos/.test(aud) && /Plano de ação \(5W2H\)/.test(aud), aud.slice(0, 200));

  console.log(`\n${ok} OK, ${falhou} falhou`);
  await browser.close();
  process.exit(falhou ? 1 : 0);
})();
