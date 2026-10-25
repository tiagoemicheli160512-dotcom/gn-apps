// "Queria um fechamento de relatórios com tudo que aconteceu na semana, com validação da
//  senha gerencial. Como já temos a pergunta de valor de venda com opção de marcar a
//  resposta, pra saber se a gerência sabe. Seria bom fazer na terça, o app abre nela pra
//  gerência e sub, e eles respondem, pra saber se estão acompanhando de fato os resultados."
//
// Três coisas decidem se isso mede algo ou não, e são as que este teste cobra:
//
// 1. A PERGUNTA VEM ANTES DO NÚMERO. Se o relatório aparece e depois pergunta o faturamento,
//    mede leitura de tela. O relatório fica atrás do login de quem já respondeu — inclusive
//    pro segundo da loja, senão o sub leria os números na tela do gerente.
// 2. SÓ PERGUNTA O QUE A LOJA LANÇOU. Medido na semana 12–18/10: venda tem resposta nas 11
//    lojas, estoque inicial de carne em 6, falta de insumo em 3, avaria em 4. Perguntar o que
//    a loja nunca lançou é pergunta sem gabarito; o que falta vira item do relatório.
// 3. SENHA DE GERENTE OU SUB. Sem isso qualquer um responde pela gerência.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (extra !== undefined && !c ? '  → ' + String(extra).slice(0,300) : '')); c ? ok++ : falhou++; };

// Semana fechada vista de 22/10/2026 (quinta): 12/10 a 18/10. Números do Bangu no banco.
const VENDA_BANGU = 94735, CARNE_SOL_INI = 104.05, PICANHA_INI = 49.25, FALTAS_BANGU = 7;
const dias = (n, venda, faltas, comUtensilio) => Array.from({ length: n }, (_, i) => ({
  data_operacao: '2026-10-' + String(12 + i).padStart(2, '0'),
  venda_salao: venda / n, venda_delivery: 0,
  faltas: i === 0 ? Array.from({ length: faltas }, (_, j) => ({ nome: 'item ' + j })) : [],
  manutencao: (i === 0 && comUtensilio) ? [{ tipo: 'Utensílio / Louça', situacao: 'Quebrou', qtd: '1', descricao: 'copo', status: 'Pendente' }] : [],
}));

const CENARIO_COMPLETO = {
  dias: dias(7, VENDA_BANGU, FALTAS_BANGU, true),
  diasAnt: dias(7, 90000, 0),
  carnes: { carne_sol: { inicial: String(CARNE_SOL_INI), contagem_final: 152.65 },
            picanha:   { inicial: String(PICANHA_INI),   contagem_final: 55.05 },
            carne_seca:{ inicial: '22.50', contagem_final: 31.95 },
            camarao:   { inicial: '22.80', contagem_final: 19.06 } },
  lojaAllData: { avariasAll: { BANGU: [{ ts: '2026-10-14T10:00:00Z', valorTotal: 120, insumo: 'x' }] },
                 utensilios_saldo: { 'copo de chopp': { nome: 'Copo de chopp', qtd: 2 } } },
  caixas: 7,
};
// Loja que não lançou nada além da venda — é a maioria hoje.
const CENARIO_COM_LACUNAS = {
  dias: dias(5, 48153, 0), diasAnt: dias(7, 50000, 0),
  carnes: { carne_sol: { contagem_final: 53.4 }, picanha: {} },
  lojaAllData: {}, caixas: 3,
};

async function abrir(browser, cen, respostasIniciais) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const escritas = [];
  let respostas = JSON.parse(JSON.stringify(respostasIniciais || {}));
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request(), url = req.url(), m = req.method();
    const j = (b) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (m === 'POST' && /rpc\/verificar_login/.test(url)) {
      const b = JSON.parse(req.postData() || '{}');
      const u = {
        leandro: { nome: 'Leandro', cargo: 'gerente' },
        barbara: { nome: 'Bárbara', cargo: 'sub_gerente' },
        patricia: { nome: 'Patrícia', cargo: 'caixa' },
      }[String(b.p_nome || '').toLowerCase()];
      if (!u || b.p_senha !== 'ok') return j([]);
      return j([u]);
    }
    if (m === 'POST' && /gn_lojas/.test(url)) {
      let b = null; try { b = JSON.parse(req.postData() || 'null'); } catch (e) {}
      escritas.push({ url, body: b });
      if (b && b.loja === 'FECHAMENTO_SEMANAL') respostas = b.all_data;
      return r.fulfill({ status: 201, body: '' });
    }
    if (/gn_lojas/.test(url) && /FECHAMENTO_SEMANAL/.test(url)) return j([{ all_data: respostas }]);
    if (/gn_lojas/.test(url) && /select=all_data/.test(url)) return j([{ all_data: cen.lojaAllData }]);
    if (/checklist_carnes/.test(url)) return j([{ carnes: cen.carnes }]);
    if (/checklist_diario/.test(url)) {
      // a semana anterior vem com data_operacao=gte.2026-10-05
      return j(/gte\.2026-10-05/.test(url) ? cen.diasAnt : cen.dias);
    }
    if (/gn_caixa_fechamento/.test(url)) return j(Array.from({ length: cen.caixas }, (_, i) => ({ data: '2026-10-1' + i })));
    return j([]);
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.goto('file://' + HOME);
  await page.waitForFunction(() => { try { return typeof _renderFechamentoSemanaHome === 'function'; } catch (e) { return false; } }, { timeout: 25000 });
  return { ctx, page, escritas, erros, respostas: () => respostas };
}

const desenhar = (page, loja) => page.evaluate(async (loja) => {
  window.gnFetchJson = window.gnFetchJson || (async () => []);
  session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
  masterLoja = loja;
  _fechaRel = null; _fechaRelLoja = null; _fechaAllData = null; _fechaQuem = null; _fechaRespostas = {};
  await _fechaCarregarRespostas(true);
  await _renderFechamentoSemanaHome(true, session, true);
  return document.getElementById('fechamento-semana-home-card').innerText;
}, loja);

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  // ── 1. Terça em diante, e a semana certa ────────────────────────────────────────────
  {
    const a = await abrir(browser, CENARIO_COMPLETO);
    const r = await a.page.evaluate(() => {
      const d = (s) => new Date(s + 'T12:00:00');
      const sem = _fechaSemanaFechada(d('2026-10-22'));
      return {
        seg: _fechaJaAbriu(d('2026-10-26')), ter: _fechaJaAbriu(d('2026-10-27')),
        qui: _fechaJaAbriu(d('2026-10-22')), dom: _fechaJaAbriu(d('2026-10-25')),
        ini: sem.ini.toISOString().slice(0,10), fim: sem.fim.toISOString().slice(0,10),
      };
    });
    check('na segunda o card não aparece (é o dia do pedido e da contagem)', r.seg === false, JSON.stringify(r));
    check('na terça aparece', r.ter === true);
    check('e segue até o domingo', r.qui === true && r.dom === true);
    check('a semana é a fechada: 12/10 a 18/10', r.ini === '2026-10-12' && r.fim === '2026-10-18', r.ini + ' a ' + r.fim);
    await a.ctx.close();
  }

  // ── 2. Fechado e aberto sem login: nenhum número do relatório na tela ──────────────
  {
    const a = await abrir(browser, CENARIO_COMPLETO);
    const fechado = await desenhar(a.page, 'BANGU');
    check('o card mostra a semana no título', /Fechamento da semana 12\/10 a 18\/10/.test(fechado), fechado.slice(0,120));
    check('e diz que ninguém respondeu', /Gerente: não respondeu/.test(fechado) && /Sub: não respondeu/.test(fechado));
    const aberto = await a.page.evaluate(async () => { _fechaToggle(); await new Promise(r=>setTimeout(r,250));
      return document.getElementById('fechamento-semana-home-card').innerText; });
    check('abrindo, pede o login', /Entre pra responder/.test(aberto), aberto.slice(0,200));
    check('e NENHUM número do relatório aparece antes de responder',
      !/94\.?735/.test(aberto) && !/104,05/.test(aberto) && !/Resultado da semana/.test(aberto), aberto.slice(0,300));
    await a.ctx.close();
  }

  // ── 3. A senha é de gerente ou sub, e só ───────────────────────────────────────────
  {
    const a = await abrir(browser, CENARIO_COMPLETO);
    await desenhar(a.page, 'BANGU');
    const r = await a.page.evaluate(async () => {
      const out = {};
      _fechaToggle(); await new Promise(r=>setTimeout(r,200));
      const tenta = async (u, p) => {
        document.getElementById('fecha-user').value = u;
        document.getElementById('fecha-senha').value = p;
        await _fechaEntrar(); await new Promise(r=>setTimeout(r,250));
        return { erro: _fechaErro, quem: _fechaQuem && _fechaQuem.chave };
      };
      out.senhaErrada = await tenta('leandro', 'xxx');
      out.caixa = await tenta('patricia', 'ok');
      out.gerente = await tenta('leandro', 'ok');
      return out;
    });
    check('senha errada não entra', /incorret/i.test(r.senhaErrada.erro) && !r.senhaErrada.quem, JSON.stringify(r.senhaErrada));
    check('cargo caixa é recusado, dizendo o cargo', /caixa/i.test(r.caixa.erro) && !r.caixa.quem, r.caixa.erro);
    check('gerente entra', r.gerente.quem === 'gerente', JSON.stringify(r.gerente));
    await a.ctx.close();
  }

  // ── 4. As perguntas: só o que a loja lançou, com o valor certo entre as opções ─────
  {
    const a = await abrir(browser, CENARIO_COMPLETO);
    await desenhar(a.page, 'BANGU');
    const r = await a.page.evaluate(() => {
      const qs = _fechaPerguntasDe(_fechaRel);
      return { ids: qs.map(q => q.id), n: qs.length,
               venda: qs.find(q => q.id === 'venda'),
               todasTemCerta: qs.every(q => q.opcoes.includes(q.valor) && q.correta >= 0),
               quatroOpcoes: qs.every(q => q.opcoes.length >= 3 && new Set(q.opcoes).size === q.opcoes.length) };
    });
    check('são 3 perguntas', r.n === 3, JSON.stringify(r.ids));
    check('a venda da semana entra sempre', r.ids.includes('venda'), JSON.stringify(r.ids));
    check('as outras saem dos controles que a loja lançou',
      r.ids.filter(i => ['avaria','utens','carne_sol','picanha','faltas'].includes(i)).length === 2, JSON.stringify(r.ids));
    check('o valor certo está entre as alternativas', r.todasTemCerta);
    check('sem alternativa repetida', r.quatroOpcoes);
    check('a venda guarda o valor exato da semana pro gabarito',
      r.venda && Math.round(r.venda.exato) === VENDA_BANGU, r.venda && r.venda.exato);
    // O furo que isto fecha: com as erradas arredondadas e a certa não, acertava-se pela
    // forma do número (94.735 entre 110.000, 80.000 e 120.000).
    const mesmaForma = await a.page.evaluate(() => {
      const qs = _fechaPerguntasDe(_fechaRel).filter(q => q.id !== 'utens' && q.id !== 'faltas');
      return qs.map(q => {
        const digitos = String(Math.round(Math.abs(q.exato))).length;
        const gran = Math.pow(10, Math.max(0, digitos - 3));
        return { id: q.id, todasNaMesmaGranularidade: q.opcoes.every(o => Math.abs(o / gran - Math.round(o / gran)) < 1e-9) };
      });
    });
    check('nenhuma alternativa se destaca pela forma do número',
      mesmaForma.length > 0 && mesmaForma.every(x => x.todasNaMesmaGranularidade), JSON.stringify(mesmaForma));

    const b = await abrir(browser, CENARIO_COM_LACUNAS);
    await desenhar(b.page, 'CAMPO GRANDE');
    const r2 = await b.page.evaluate(() => {
      const qs = _fechaPerguntasDe(_fechaRel);
      return { ids: qs.map(q => q.id), lacunas: _fechaRel.lacunas };
    });
    check('loja que só lançou venda recebe só a pergunta da venda',
      r2.ids.length === 1 && r2.ids[0] === 'venda', JSON.stringify(r2.ids));
    check('e o que faltou lançar entra no relatório como lacuna',
      r2.lacunas.some(l => /carne de sol/i.test(l)) && r2.lacunas.some(l => /picanha/i.test(l))
      && r2.lacunas.some(l => /5 de 7 dias/.test(l)), JSON.stringify(r2.lacunas));
    await a.ctx.close(); await b.ctx.close();
  }

  // ── 5. Responder certo: grava, pontua e só então abre o relatório ─────────────────
  {
    const a = await abrir(browser, CENARIO_COMPLETO);
    await desenhar(a.page, 'BANGU');
    const r = await a.page.evaluate(async () => {
      _fechaToggle(); await new Promise(r=>setTimeout(r,200));
      document.getElementById('fecha-user').value = 'leandro';
      document.getElementById('fecha-senha').value = 'ok';
      await _fechaEntrar(); await new Promise(r=>setTimeout(r,250));
      const antes = document.getElementById('fechamento-semana-home-card').innerText;
      const qs = _fechaPerguntasDe(_fechaRel);
      qs.forEach(q => _fechaMarcar(q.id, q.correta));
      await _fechaEnviar(); await new Promise(r=>setTimeout(r,350));
      return { antes, depois: document.getElementById('fechamento-semana-home-card').innerText };
    });
    check('as perguntas aparecem sem o relatório atrás',
      /responda sobre a semana/i.test(r.antes) && !/Resultado da semana/.test(r.antes), r.antes.slice(0,200));
    check('depois de enviar, o relatório abre', /Resultado da semana/.test(r.depois), r.depois.slice(0,200));
    check('com 3 de 3 acertos', /3 de 3/.test(r.depois), (r.depois.match(/Suas respostas.*/)||[])[0]);
    check('e o relatório mostra a venda da semana', /94\.735/.test(r.depois), (r.depois.match(/Venda.*/)||[])[0]);
    // Loja que lançou tudo não tem lacuna nenhuma: o bloco só aparece quando falta algo
    // (a cobrança disso está no cenário com lacunas, acima).
    check('e sem bloco de lacuna, porque essa loja lançou tudo',
      !/Faltou lançar na semana/.test(r.depois), (r.depois.match(/Faltou.*/)||[])[0]);

    const grav = a.escritas.filter(e => e.body && e.body.loja === 'FECHAMENTO_SEMANAL');
    const reg = grav.length && grav[grav.length-1].body.all_data['2026-10-12']['BANGU']['gerente'];
    check('a resposta é gravada na linha compartilhada', !!reg, JSON.stringify(grav.map(g=>Object.keys(g.body.all_data))));
    check('com nome, cargo, acertos e a ordem de quem respondeu primeiro',
      reg && reg.nome === 'Leandro' && reg.cargo === 'gerente' && reg.acertos === 3 && reg.ordem === 1, JSON.stringify(reg));
    check('e a resposta de cada pergunta, com o certo', reg && reg.respostas.length === 3 && reg.respostas.every(x => x.certo), JSON.stringify(reg && reg.respostas));
    await a.ctx.close();
  }

  // ── 6. Errar: registra o erro e mostra o número certo ─────────────────────────────
  {
    const a = await abrir(browser, CENARIO_COMPLETO);
    await desenhar(a.page, 'BANGU');
    const r = await a.page.evaluate(async () => {
      _fechaToggle(); await new Promise(r=>setTimeout(r,200));
      document.getElementById('fecha-user').value = 'barbara';
      document.getElementById('fecha-senha').value = 'ok';
      await _fechaEntrar(); await new Promise(r=>setTimeout(r,250));
      const qs = _fechaPerguntasDe(_fechaRel);
      qs.forEach((q, i) => _fechaMarcar(q.id, i === 0 ? (q.correta === 0 ? 1 : 0) : q.correta));
      await _fechaEnviar(); await new Promise(r=>setTimeout(r,350));
      return { txt: document.getElementById('fechamento-semana-home-card').innerText };
    });
    check('o sub responde com a própria senha', /Bárbara|2 de 3/.test(r.txt), r.txt.slice(0,200));
    check('o erro aparece com o valor certo ao lado', /❌/.test(r.txt) && /o certo era/.test(r.txt), (r.txt.match(/❌.*/)||[])[0]);
    check('e o relatório abre igual (errar não bloqueia)', /Resultado da semana/.test(r.txt));
    const reg = a.respostas()['2026-10-12']['BANGU']['sub'];
    check('o erro fica gravado, não só o acerto', reg && reg.acertos === 2 && reg.respostas.some(x => !x.certo), JSON.stringify(reg && {a:reg.acertos,t:reg.total}));
    await a.ctx.close();
  }

  // ── 7. O segundo a responder não vê os números antes ─────────────────────────────
  {
    const resp = { '2026-10-12': { 'BANGU': { gerente: { nome:'Leandro', cargo:'gerente', acertos:3, total:3, ordem:1, respostas:[] } } } };
    const a = await abrir(browser, CENARIO_COMPLETO, resp);
    await desenhar(a.page, 'BANGU');
    const r = await a.page.evaluate(async () => {
      _fechaToggle(); await new Promise(r=>setTimeout(r,250));
      const semLogin = document.getElementById('fechamento-semana-home-card').innerText;
      document.getElementById('fecha-user').value = 'barbara';
      document.getElementById('fecha-senha').value = 'ok';
      await _fechaEntrar(); await new Promise(r=>setTimeout(r,250));
      return { semLogin, comLogin: document.getElementById('fechamento-semana-home-card').innerText };
    });
    check('com o gerente já tendo respondido, o relatório não fica à mostra',
      !/Resultado da semana/.test(r.semLogin) && !/94\.735/.test(r.semLogin), r.semLogin.slice(0,250));
    check('e o sub recebe as perguntas, não o relatório',
      /responda sobre a semana/i.test(r.comLogin) && !/Resultado da semana/.test(r.comLogin), r.comLogin.slice(0,200));
    check('o card mostra o placar de quem já respondeu', /Gerente: 3\/3/.test(r.semLogin), r.semLogin.slice(0,150));
    await a.ctx.close();
  }

  // ── 8. Painel de Gestão: quem respondeu, quem falta ─────────────────────────────
  {
    const resp = { '2026-10-12': {
      'BANGU':   { gerente: { nome:'Leandro', cargo:'gerente', acertos:3, total:3, ordem:1 },
                   sub:     { nome:'Bárbara', cargo:'sub_gerente', acertos:1, total:3, ordem:2 } },
      'CAXIAS':  { gerente: { nome:'X', cargo:'gerente', acertos:1, total:3, ordem:1 } } } };
    const a = await abrir(browser, CENARIO_COMPLETO, resp);
    const r = await a.page.evaluate(async () => {
      await _fechaCarregarRespostas(true);
      return _buildFechamentoSemanalCard();
    });
    check('o Painel diz quantas lojas estão completas', /1 de 11 lojas completas/.test(r), (r.match(/\d+ de \d+ lojas completas/)||[])[0]);
    check('mostra chip por loja com o quanto respondeu', /Bangu<\/span>|Bangu 2\/2/.test(r) && /1\/2/.test(r), r.slice(0,200));
    check('e diz quantas não responderam nada', /9 loja\(s\) sem nenhuma resposta/.test(r), (r.match(/\d+ loja\(s\) sem nenhuma/)||[])[0]);
    // 3/3 do Bangu (ordem 1) + 1/3 do Caxias = 4 de 6 = 67%. A de ordem 2 fica fora.
    check('o acerto considera só a primeira resposta de cada loja', /67%/.test(r), (r.match(/\d+%/)||[])[0]);
    await a.ctx.close();
  }

  const erros = [];
  await browser.close();
  console.log('\n' + ok + ' ok, ' + falhou + ' falhou');
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error('ERRO: ' + e.message); process.exit(2); });
