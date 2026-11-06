// "No app estoque e pedido temos a aba trios ... queria trazer essa aba para o painel de
//  gestão para poder fazer as confirmações de lá, é mais prático pra mim." (06/11/2026)
// Dono escolheu "confirmar e editar"; cadastrar e importar continuam no Estoque.
//
// Painel → 🎵 Trios → 📅 Agenda: a mesma tabela gn_trios_agenda. Esta suíte cobra que o que
// se confirma/edita aqui vai pro banco de verdade (PATCH conferido — sem linha casada não é
// "salvo"), que o cachê R$ 0 é apontado, e que a tela não engole loja teste nem Maglia.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

const ap = (id, data, loja, artista, cache, extra) => Object.assign({ id, data, loja, artista, cache,
  horario_inicio: '18:00:00', horario_fim: '22:00:00', confirmado: false, confirmado_por: null, confirmado_em: null,
  presenca_confirmada: false, couver_valor: 0, banda_nao_veio: false }, extra || {});
// Novembro/2026, com os casos reais: o que entrou zerado e o que já veio confirmado.
const BASE = [
  ap('a1', '2026-11-07', 'caxias', 'Trio 100% Pé Serra (18 às 22 horas)', 0),
  ap('a2', '2026-11-07', 'bangu', 'Trio Remelexo', 800, { confirmado: true, confirmado_por: 'Carol', confirmado_em: '2026-11-03T14:00:00Z' }),
  ap('a3', '2026-11-14', 'itaquera', 'TRIO LUZIAH (Vai tocar pelo couvert artístico)', 0),
  ap('a4', '2026-11-15', 'sao_goncalo', 'Trio Sabia dos Tres Forrozeiros', 800),
  ap('t1', '2026-11-08', 'loja_teste', 'Trio de Teste', 100),
  ap('m1', '2026-11-08', 'maglia', 'Trio Qualquer', 500),
];

(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-11-06T12:00:00');
  // O banco: GET devolve as linhas; PATCH altera a linha do id e devolve ela (return=representation).
  let banco = JSON.parse(JSON.stringify(BASE));
  const patches = [], gets = []; let patchFalha = false;
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request(), url = req.url(), m = req.method();
    const json = (b, st) => r.fulfill({ status: st || 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/gn_trios_agenda/.test(url) && m === 'PATCH') {
      const id = decodeURIComponent((url.match(/id=eq\.([^&]+)/) || [])[1] || '');
      const corpo = JSON.parse(req.postData() || '{}');
      patches.push({ id, corpo, prefer: req.headers()['prefer'] || '' });
      if (patchFalha) return json({ message: 'erro' }, 500);
      const i = banco.findIndex(x => x.id === id);
      if (i < 0) return json([]);
      banco[i] = Object.assign({}, banco[i], corpo);
      return json([banco[i]]);
    }
    if (/gn_trios_agenda/.test(url)) {
      gets.push(url);
      const ini = (url.match(/data=gte\.([\d-]+)/) || [])[1], fim = (url.match(/data=lt\.([\d-]+)/) || [])[1];
      return json(banco.filter(x => (!ini || x.data >= ini) && (!fim || x.data < fim)));
    }
    return json([]);
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await CAMINHOS.esperarApp(page, ['LOJAS_LISTA'], ['_buildTriosAgendaPanel', '_loadTriosAgenda', '_triosAgConfirmar', 'renderDashboard']); break; }
    catch (e) { if (t >= 4) { console.log('FALHOU: a Home não carregou (ou falta a agenda no Painel)'); console.log('\n0 OK, 1 falhou'); process.exit(1); } }
  }
  await page.evaluate(() => {
    session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    document.getElementById('dash-section').style.display = 'block';
    _dashTab = 'trios';
    window._loadTriosGerencia = async () => {};   // o painel de couvert não é o que se mede aqui
  });
  const tela = () => page.evaluate(() => {
    const el = document.getElementById('dash-section');
    return { txt: el.textContent.replace(/\s+/g, ' '), html: el.innerHTML,
             itens: [...el.querySelectorAll('.trio-ag-item')].map(x => ({ id: x.dataset.id, t: x.textContent.replace(/\s+/g, ' ').trim() })) };
  });
  const esperar = () => page.waitForTimeout(150);

  // ── 1. A agenda aparece na aba Trios do Painel ────────────────────────────────────────
  await page.evaluate(() => { _triosVista = 'resultado'; renderDashboard(); });
  let t = await tela();
  check('a aba Trios ganha a escolha entre "Couvert × cachê" e "Agenda"', /Couvert × cachê/.test(t.txt) && /📅 Agenda/.test(t.txt));
  await page.evaluate(() => _triosSetVista('agenda')); await esperar();
  t = await tela();
  check('abre no mês corrente: novembro de 2026', /Novembro 2026/.test(t.txt), t.txt.slice(0, 200));
  check('lista as apresentações do mês', t.itens.length === 4, JSON.stringify(t.itens.map(x => x.id)));
  check('loja teste e Maglia ficam fora', !t.itens.some(x => x.id === 't1' || x.id === 'm1'));
  check('mostra loja, banda e valor', t.itens.some(x => x.id === 'a2' && /Trio Remelexo/.test(x.t) && /Bangu/.test(x.t) && /R\$ 800,00/.test(x.t)));
  check('o que já foi confirmado diz por quem', t.itens.some(x => x.id === 'a2' && /confirmado por Carol em 03\/11/.test(x.t)));
  check('resumo: 4 apresentações, 1 de 4 confirmadas', /Apresentações\s*4/.test(t.txt) && /1\/4/.test(t.txt));
  check('as apresentações com cachê R$ 0 são apontadas no topo', /2 apresentações com cachê R\$ 0/.test(t.txt));
  check('e na linha aparece "sem cachê"', t.itens.some(x => x.id === 'a1' && /sem cachê/.test(x.t)));
  check('cachê diferente da tabela fica sinalizado (Sabiá a R$ 800, tabela R$ 600)',
    t.itens.some(x => x.id === 'a4' && /tabela R\$ 600,00/.test(x.t)));
  check('a consulta pede só o mês (de 01/11 a antes de 01/12)',
    gets.length >= 1 && /data=gte\.2026-11-01/.test(gets[gets.length - 1]) && /data=lt\.2026-12-01/.test(gets[gets.length - 1]), gets[gets.length - 1]);

  // ── 2. Confirmar grava no banco ───────────────────────────────────────────────────────
  await page.evaluate(() => _triosAgConfirmar('a1')); await esperar();
  t = await tela();
  const pc = patches[patches.length - 1];
  check('confirmar faz PATCH na apresentação certa, com quem confirmou',
    pc && pc.id === 'a1' && pc.corpo.confirmado === true && pc.corpo.confirmado_por === 'Tiago' && !!pc.corpo.confirmado_em, JSON.stringify(pc));
  check('pedindo a linha de volta (é o que prova que gravou)', pc && /return=representation/.test(pc.prefer));
  check('a tela mostra confirmado e o resumo sobe pra 2/4', t.itens.some(x => x.id === 'a1' && /✓ Confirmado/.test(x.t)) && /2\/4/.test(t.txt));
  await page.evaluate(() => _triosAgConfirmar('a1')); await esperar();
  check('tocar de novo desfaz a confirmação', banco.find(x => x.id === 'a1').confirmado === false && banco.find(x => x.id === 'a1').confirmado_por === null);

  // Linha que sumiu do banco (apagada no Estoque com a tela aberta): PATCH devolve [] — não é "salvo".
  await page.evaluate(() => { _triosAgRows.push({ id: 'fantasma', data: '2026-11-20', loja: 'bangu', artista: 'Trio X', cache: 800, confirmado: false }); renderDashboard(); });
  await page.evaluate(() => _triosAgConfirmar('fantasma')); await esperar();
  t = await tela();
  check('se a apresentação não existe mais no banco, a tela avisa em vez de marcar confirmado',
    t.itens.some(x => x.id === 'fantasma' && /Não consegui gravar/.test(x.t) && !/✓ Confirmado/.test(x.t)));

  // ── 3. Editar: corrigir o cachê de quem entrou zerado ──────────────────────────────────
  await page.evaluate(() => _loadTriosAgenda()); await esperar();
  await page.evaluate(() => _triosAgEditar('a1')); await esperar();
  const form = await page.evaluate(() => ({
    banda: document.getElementById('trio-ag-banda-a1').value,
    loja: document.getElementById('trio-ag-loja-a1').value,
    data: document.getElementById('trio-ag-data-a1').value,
    hi: document.getElementById('trio-ag-hi-a1').value,
    lojas: [...document.querySelectorAll('#trio-ag-loja-a1 option')].map(o => o.value),
  }));
  check('o formulário abre com a banda reconhecida apesar do "(18 às 22 horas)"', form.banda === 'Trio 100% Pé Serra', form.banda);
  check('e com a loja, a data e o horário da apresentação', form.loja === 'caxias' && form.data === '2026-11-07' && form.hi === '18:00');
  check('a lista de lojas não oferece Maglia nem loja teste', !form.lojas.includes('maglia') && !form.lojas.includes('loja_teste') && form.lojas.length === 11);
  // Trocar a banda sugere o cachê da tabela
  await page.evaluate(() => { const s = document.getElementById('trio-ag-banda-a1'); s.value = 'Trio Rony do Forró'; _triosAgBandaMudou('a1'); });
  check('trocar a banda preenche o cachê da tabela (Rony = R$ 600)', await page.evaluate(() => document.getElementById('trio-ag-cache-a1').value) === '600');
  await page.evaluate(() => { const s = document.getElementById('trio-ag-banda-a1'); s.value = 'Trio 100% Pé Serra'; _triosAgBandaMudou('a1'); });
  await page.evaluate(() => _triosAgSalvar('a1')); await esperar();
  const ed = patches[patches.length - 1];
  check('salvar grava banda, loja, data, horário e cachê (R$ 700)',
    ed.id === 'a1' && ed.corpo.cache === 700 && ed.corpo.artista === 'Trio 100% Pé Serra' && ed.corpo.loja === 'caxias' &&
    ed.corpo.data === '2026-11-07' && ed.corpo.horario_inicio === '18:00' && ed.corpo.horario_fim === '22:00', JSON.stringify(ed.corpo));
  t = await tela();
  check('a tela atualiza: R$ 700 e o aviso cai pra 1 apresentação com R$ 0',
    t.itens.some(x => x.id === 'a1' && /R\$ 700,00/.test(x.t) && /✓ Salvo/.test(x.t)) && /1 apresentação com cachê R\$ 0/.test(t.txt), t.txt.slice(0, 400));

  // Banda fora da lista: digita o nome
  await page.evaluate(() => _triosAgEditar('a3')); await esperar();
  await page.evaluate(() => {
    document.getElementById('trio-ag-banda-a3').value = '__outro__'; _triosAgBandaMudou('a3');
    document.getElementById('trio-ag-outro-a3').value = 'Banda Nova do Forró';
    document.getElementById('trio-ag-cache-a3').value = '650';
  });
  await page.evaluate(() => _triosAgSalvar('a3')); await esperar();
  check('banda fora da lista: grava o nome digitado e o cachê informado',
    banco.find(x => x.id === 'a3').artista === 'Banda Nova do Forró' && banco.find(x => x.id === 'a3').cache === 650);

  // Validação
  await page.evaluate(() => _triosAgEditar('a2')); await esperar();
  const nAntes = patches.length;
  await page.evaluate(() => { document.getElementById('trio-ag-cache-a2').value = '-5'; });
  await page.evaluate(() => _triosAgSalvar('a2')); await esperar();
  t = await tela();
  check('cachê negativo não grava e explica', patches.length === nAntes && /não pode ser negativo/.test(t.txt));

  // Falha do banco
  await page.evaluate(() => { document.getElementById('trio-ag-cache-a2').value = '900'; });
  patchFalha = true;
  await page.evaluate(() => _triosAgSalvar('a2')); await esperar();
  patchFalha = false;
  t = await tela();
  check('se o banco recusar, a tela não diz "salvo"', /Não consegui salvar/.test(t.txt) && banco.find(x => x.id === 'a2').cache === 800);

  // Mudar a data pra outro mês: avisa, em vez de a linha sumir sem explicação
  await page.evaluate(() => { document.getElementById('trio-ag-data-a2').value = '2026-12-05'; });
  await page.evaluate(() => _triosAgSalvar('a2')); await esperar();
  t = await tela();
  check('mudar pra outro mês grava e avisa no topo pra onde foi (a linha sai da tela)',
    banco.find(x => x.id === 'a2').data === '2026-12-05' && /Trio Remelexo \(Bangu\) foi pra 05\/12\/2026 — saiu deste mês/.test(t.txt), t.txt.slice(0, 300));

  // ── 4. Filtro por loja e navegação de mês ─────────────────────────────────────────────
  await page.evaluate(() => { _triosAgLoja = 'caxias'; renderDashboard(); });
  t = await tela();
  check('filtrar por loja mostra só ela', t.itens.length === 1 && t.itens[0].id === 'a1');
  await page.evaluate(() => { _triosAgLoja = null; _triosAgNav(1); }); await esperar();
  t = await tela();
  check('› vai pra dezembro e mostra o que foi movido pra lá', /Dezembro 2026/.test(t.txt) && t.itens.some(x => x.id === 'a2'));

  // ── 4b. A confirmação da LOJA (presença), igual à aba Trios do Estoque ─────────────────
  // "Eu não sei se a loja confirmou, preciso que essa informação venha também." Hoje = 06/11.
  await page.evaluate(() => {
    _triosAgMes = '2026-11'; _triosAgLoja = null; _triosAgEditando = null; _triosAgMsg = {}; _triosAgAviso = null;
    _triosAgRows = [
      { id: 'p1', data: '2026-11-01', loja: 'bangu', artista: 'Trio Remelexo', cache: 800, confirmado: true, confirmado_por: 'Tiago',
        presenca_confirmada: true, couver_valor: 1330, banda_nao_veio: false },
      { id: 'p2', data: '2026-11-01', loja: 'caxias', artista: 'Trio D Forró', cache: 800, confirmado: true,
        presenca_confirmada: true, couver_valor: 500, banda_nao_veio: false },
      { id: 'p3', data: '2026-11-01', loja: 'boulevard', artista: 'Trio Peneirado', cache: 800, confirmado: false,
        presenca_confirmada: false, couver_valor: 0, banda_nao_veio: true, banda_nao_veio_motivo: 'carro quebrou' },
      { id: 'p4', data: '2026-11-01', loja: 'pedreira', artista: 'Trio Alma Brasileira', cache: 800, confirmado: false,
        presenca_confirmada: false, couver_valor: 0, banda_nao_veio: false },
      { id: 'p5', data: '2026-11-14', loja: 'pedreira', artista: 'Trio Táxi Lunar', cache: 800, confirmado: false,
        presenca_confirmada: false, couver_valor: 0, banda_nao_veio: false },
    ];
    renderDashboard();
  });
  t = await tela();
  const it = id => (t.itens.find(x => x.id === id) || {}).t || '';
  check('presença confirmada pela loja aparece, com o couvert e o saldo (+R$ 530)',
    /Presença confirmada pela loja/.test(it('p1')) && /Couvert R\$ 1\.330,00/.test(it('p1')) && /\+R\$ 530,00/.test(it('p1')), it('p1'));
  check('saldo negativo sai com sinal de menos (couvert 500 − cachê 800)', /−R\$ 300,00/.test(it('p2')), it('p2'));
  check('banda que não veio aparece com o motivo', /banda não veio — carro quebrou/.test(it('p3')), it('p3'));
  check('show que já aconteceu sem resposta da loja fica apontado', /Loja ainda não confirmou/.test(it('p4')), it('p4'));
  check('show que ainda vem não cobra a loja', !/Loja ainda não confirmou|Presença confirmada/.test(it('p5')), it('p5'));
  check('a sua confirmação e a da loja são coisas separadas na mesma linha',
    /✓ confirmado por Tiago/.test(it('p1')) && /Presença confirmada pela loja/.test(it('p1')));
  check('resumo: "Loja confirmou 3/4" — só dos shows que já aconteceram (o de 14/11 fica fora)',
    /Loja confirmou\s*3\/4/.test(t.txt), t.txt.slice(0, 400));
  check('a consulta traz o motivo de a banda não ter vindo', gets.some(u => /banda_nao_veio_motivo/.test(u)));

  // ── 5. Falha ao carregar ─────────────────────────────────────────────────────────────
  await page.evaluate(() => { const o = window.gnFetchJson; window.gnFetchJson = async (u, h, c, fb) => /trios/.test(c) ? fb : o(u, h, c, fb); _loadTriosAgenda(); });
  await esperar();
  t = await tela();
  check('sem conexão, avisa e oferece tentar de novo (não mostra agenda vazia)', /Não deu pra carregar a agenda/.test(t.txt) && /Tentar de novo/.test(t.txt));

  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
