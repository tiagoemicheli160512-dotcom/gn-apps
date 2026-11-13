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
  // 20 dias atrás, com crítico e SEM ciência: fora do card (7 dias), mas o alerta não pode sumir.
  { id: 'r4', visita_id: 'v3', loja: 'Bangu', data: dias(20), tipo: 'salao', visitante: 'Aryano', finalizada: true, nota: 40,
    dados: { itens: { documentacao: { licenca: 2 } }, fechada: true } },
  // 3 dias atrás, com crítico e JÁ com ciência: não entra no alerta.
  { id: 'r5', visita_id: 'v4', loja: 'Bangu', data: dias(3), tipo: 'cozinha', visitante: 'Edna', finalizada: true, nota: 0,
    ciente_nome: 'Ana', ciente_cargo: 'gerente', ciente_em: new Date().toISOString(),
    dados: { itens: { ambientes: { pias: 'NC' } }, fechada: true } },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 380, height: 900 } });
  const pedidos = [], escritas = [];
  await ctx.route('**/rest/v1/**', (route) => {
    const req = route.request(), url = decodeURIComponent(req.url());
    if (req.method() !== 'GET' && !/verificar_login/.test(url)) escritas.push({ url, body: req.postData() });
    if (/rpc\/verificar_login/.test(url)) {
      const b = JSON.parse(req.postData());
      const u = { 'ana': [{ nome: 'Ana', cargo: 'gerente' }], 'ze': [{ nome: 'Zé', cargo: 'garcom' }] }[b.p_nome] || [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b.p_senha === '123' ? u : []) });
    }
    if (/gn_visita_checklist/.test(url) && req.method() === 'PATCH') {
      const ids = (url.match(/id=in\.\(([^)]+)\)/) || [])[1].split(',');
      const b = JSON.parse(req.postData());
      const alvo = LINHAS.filter(l => ids.includes(l.id));
      alvo.forEach(l => Object.assign(l, b));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(alvo) });
    }
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
  check('busca 30 dias (o alerta de crítico olha mais pra trás que o card)', q.includes('data=gte.' + dias(29)), q);
  check('o card mostra só os últimos 7 dias, contando o dia da visita', !/Aryano/.test(ger) && /Edna · /.test(ger));

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

  // ── Alerta de crítico ──
  await render('gerente', false);
  await page.waitForTimeout(100);
  const al = await page.evaluate(() => { const el = document.getElementById('visita-critico-home-card'); return { t: el.textContent.replace(/\s+/g, ' '), estado: el.dataset.homeEstado, info: el.dataset.homeInfo }; });
  check('visita com crítico vira linha urgente em "Precisa de você hoje"', al.estado === 'acao' && /Visita com crítico/.test(al.info), al);
  check('alerta lista os críticos sem ciência, inclusive os de 20 dias atrás', /Validades em dia na cozinha/.test(al.t) && /Licença de funcionamento/.test(al.t) && /Aryano|Supervisão salão/.test(al.t), al.t);
  check('crítico que a gerência já viu não volta pro alerta', !/Pias exclusivas/.test(al.t));
  check('alerta diz o prazo do plano (24h depois da visita)', al.t.includes('prazo ' + dias(0).split('-').reverse().slice(0, 2).join('/')), al.t);
  check('prazo que já passou aparece como atrasado', /Plano de ação atrasado desde/.test(al.t) && /atrasado/.test(al.info), al.info);
  check('card de resultado mostra quem já deu ciência', /Gerência ciente: Ana/.test(ger) && /Aguardando ciência da gerência/.test(ger));
  const confirmar = (u, p) => page.evaluate(async ({ u, p }) => {
    _vckAlertaForm = true; _vckRenderAlerta();
    document.getElementById('vck-ciente-user').value = u; document.getElementById('vck-ciente-senha').value = p;
    await _vckCienteConfirmar();
    return document.getElementById('visita-critico-home-card').textContent.replace(/\s+/g, ' ');
  }, { u, p });
  escritas.length = 0;
  const errSenha = await confirmar('ana', 'errada');
  check('senha errada não dá ciência', /Usuário ou senha incorretos/.test(errSenha) && escritas.length === 0);
  const errCargo = await confirmar('ze', '123');
  check('garçom não dá ciência pela gerência', /A ciência é da gerência/.test(errCargo) && escritas.length === 0, errCargo);
  const ok1 = await confirmar('ana', '123');
  const patch = escritas.find(e => /gn_visita_checklist/.test(e.url));
  check('gerente com senha grava a ciência nas visitas pendentes', patch && /r1/.test(patch.url) && /r4/.test(patch.url) && !/r5/.test(patch.url) && /"ciente_nome":"Ana"/.test(patch.body), patch);
  const depois = await page.evaluate(() => ({ estado: document.getElementById('visita-critico-home-card').dataset.homeEstado, card: document.getElementById('visita-resultado-home-card').textContent }));
  check('o alerta sai de "Precisa de você hoje"', ok1.trim() === '' && depois.estado === '', { ok1, depois: depois.estado });
  check('e o card passa a mostrar a ciência', !/Aguardando ciência/.test(depois.card) && /Gerência ciente: Ana/.test(depois.card));

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
