// "Tem aparecido essa msg. Vi em Guarulhos e agora em Bangu. Sobre espaço no aparelho.
//  Mais depois aparece o verde como salvo. É referente ao meu aparelho que tá sem espaço?"
//
// Não era o aparelho: era a cota do SITE (uns 5 MB, compartilhados pelos 13 apps), entupida
// pelas fotos de manutenção em base64 de várias lojas que o mestre abre no mesmo celular.
// E a mensagem mentia duas vezes: dizia "⚠️ Não salvou" quando o servidor tinha recebido o
// dia, e dizia "sem espaço no aparelho" mandando a pessoa limpar o celular à toa.
//
// Pedido: "que não trave ou suma nada ou dê a entender que tem uma falha". Então o teste
// enche a cota de verdade (patch no setItem) e cobra as três coisas.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

// Faz o localStorage recusar escrita acima de um teto, como o navegador faz de verdade.
// O teto conta o que já está guardado, então liberar espaço realmente volta a permitir.
const COTA = `(() => {
  const real = Storage.prototype.setItem;
  window.__cota = 1e9;
  Storage.prototype.setItem = function (k, v) {
    if (this === window.localStorage) {
      let usado = 0;
      for (let i = 0; i < this.length; i++) {
        const kk = this.key(i);
        if (kk === k) continue;
        usado += (kk.length + (this.getItem(kk) || '').length) * 2;
      }
      if (usado + (k.length + String(v).length) * 2 > window.__cota) {
        const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; e.code = 22;
        throw e;
      }
    }
    return real.call(this, k, v);
  };
})()`;

async function abrir(browser, arq, vars) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 430, height: 950 } });
  // Esta era a ÚNICA suíte sem isto, e era a causa dos timeouts dela sob carga: sem a
  // versão da página no localStorage, o Check-list se recarrega sozinho com ?v=<versão>
  // pra furar cache, e a espera corre com essa segunda navegação. O waitForTimeout(1500)
  // logo abaixo era a tentativa antiga de contornar — agora o recarregamento nem acontece.
  // A chave é minúscula e nenhum degrau da limpeza de cota casa com ela (os prefixos são
  // gn_chk4_* e gn_mestra_*), então não interfere no que esta suíte mede.
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  await page.goto(('file://' + CAMINHOS.PUBLICO + '/') + arq);
  // O Check-list se recarrega sozinho com ?v=<versão> pra furar cache. Sem esperar isso
  // assentar, o evaluate seguinte pega o documento NOVO com o script ainda no meio, e
  // qualquer `let` do topo ainda está em temporal dead zone.
  await page.waitForLoadState('load');
  await page.waitForTimeout(1500);
  // gnGuardar vem de um <script src> próprio e existe cedo; readyState 'complete' diz que
  // os RECURSOS carregaram, não que o <script> inline de 1 MB do app terminou de executar.
  // Sob carga, o evaluate mais abaixo caía em "Cannot access 'LOJA' before initialization".
  //
  // As variáveis vêm de QUEM CHAMA porque esta função abre apps diferentes: LOJA existe no
  // Check-list e não na Home, e esperar por ela lá dá timeout — foi o que aconteceu quando
  // eu cravei a lista aqui dentro.
  // 60s, nao os 25 do padrao: o Check-list tem 1,1 MB de <script> inline e, quando varias
  // suites rodam juntas, 25s nao bastam pra ele TERMINAR de executar. Timeout curto aqui
  // vira vermelho que nao e defeito — e o vermelho que nao e defeito e o que faz todo
  // mundo parar de olhar.
  await CAMINHOS.esperarApp(page, vars || [], ['gnGuardar'], 60000);
  await page.evaluate(COTA);
  return { ctx, page, erros };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  // ── 1. gnGuardar nunca estoura ────────────────────────────────────────────────────
  const a = await abrir(browser, 'gn-home.html');
  const basico = await a.page.evaluate(() => {
    localStorage.clear();
    window.__cota = 400;                       // apertado de propósito
    let estourou = false, r;
    try { r = gnGuardar('x', 'y'.repeat(500)); } catch (e) { estourou = true; }
    return { estourou, r };
  });
  check('com a cota estourada, gnGuardar devolve o motivo em vez de lançar exceção',
    basico.estourou === false && basico.r === 'sem-espaco');

  const cabe = await a.page.evaluate(() => {
    localStorage.clear(); window.__cota = 1e9;
    return { r: gnGuardar('a', 'b'), lido: localStorage.getItem('a') };
  });
  check('quando cabe, grava normalmente', cabe.r === 'ok' && cabe.lido === 'b');

  // ── 2. Abre espaço sozinho, pela escada ───────────────────────────────────────────
  const escada = await a.page.evaluate(() => {
    localStorage.clear(); window.__cota = 1e9;
    localStorage.setItem('gn_mestra_allDataPorLoja', 'M'.repeat(3000));   // cache puro
    localStorage.setItem('gn_session_v1', JSON.stringify({ id: 1 }));     // intocável
    localStorage.setItem('gn_ped_sync_fila_pendente', 'FILA');            // intocável
    const antes = localStorage.length;
    window.__cota = 7000;
    const r = gnGuardar('gn_novo', 'N'.repeat(2000));
    return { r, antes, sessao: localStorage.getItem('gn_session_v1'),
             fila: localStorage.getItem('gn_ped_sync_fila_pendente'),
             cache: localStorage.getItem('gn_mestra_allDataPorLoja'),
             novo: (localStorage.getItem('gn_novo') || '').length };
  });
  check('faltando espaço, descarta o cache da Mestra e consegue gravar',
    escada.r === 'ok-apos-limpeza' && escada.cache === null && escada.novo === 2000);
  check('e NÃO encosta na sessão nem na fila de coisa não enviada',
    escada.sessao !== null && escada.fila === 'FILA');

  // ── 3. Fotos antigas saem; as de agora ficam ──────────────────────────────────────
  const fotos = await a.page.evaluate(() => {
    localStorage.clear(); window.__cota = 1e9;
    const d = n => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
    localStorage.setItem('gn_chk4_foto_vendas_BANGU_' + d(30), 'V'.repeat(2000));
    localStorage.setItem('gn_chk4_foto_vendas_BANGU_' + d(0),  'H'.repeat(500));
    const r = gnLiberarEspaco({});
    return { velha: localStorage.getItem('gn_chk4_foto_vendas_BANGU_' + d(30)),
             hoje: localStorage.getItem('gn_chk4_foto_vendas_BANGU_' + d(0)), bytes: r.bytes };
  });
  check('foto de mais de 7 dias é liberada', fotos.velha === null && fotos.bytes > 0);
  check('foto de hoje não é tocada', (fotos.hoje || '').length === 500);

  // ── 4. A cópia da loja ABERTA é intocável; a de outra loja perde o base64 ─────────
  // O campo fotoBase64 guarda DUAS coisas, e a limpeza trata cada uma de um jeito:
  //   data:image/...  — a imagem inteira, 33 a 117 kB. Sai: é o que abre espaço.
  //   https://.../gn-fotos/...  — uma URL de 116 caracteres, desde a migração pro
  //                               Storage. FICA: apagar não abre espaço nenhum e é a
  //                               única pista de onde a imagem está.
  // Este teste usava 'G'.repeat(2000), que não é nem uma coisa nem outra — dado de teste
  // anterior à distinção. Com as duas formas de verdade ele passa a cobrar a regra certa.
  const URL_FOTO = 'https://x.supabase.co/storage/v1/object/public/gn-fotos/checklist-item/f.jpeg';
  const copias = await a.page.evaluate((URL_FOTO) => {
    localStorage.clear(); window.__cota = 1e9;
    const hoje = new Date().toISOString().slice(0, 10);
    const B64 = 'data:image/jpeg;base64,' + 'B'.repeat(2000);
    const dia = foto => JSON.stringify({ data: hoje,
      manutencao: [{ descricao: 'torneira', fotoBase64: foto }],
      checklist: { Salao: { i1: { ok: true, fotoBase64: foto },
                            i2: { ok: true, fotoBase64: URL_FOTO } } } });
    localStorage.setItem('gn_chk4_day_BANGU', dia(B64));
    localStorage.setItem('gn_chk4_day_GUARULHOS', dia(B64));
    gnLiberarEspaco({ lojaAtual: 'BANGU' });
    const b = JSON.parse(localStorage.getItem('gn_chk4_day_BANGU'));
    const g = JSON.parse(localStorage.getItem('gn_chk4_day_GUARULHOS'));
    return {
      banguFoto: b.manutencao[0].fotoBase64.length,
      banguUrl:  b.checklist.Salao.i2.fotoBase64,
      guaFoto:   g.manutencao[0].fotoBase64.length,
      guaUrl:    g.checklist.Salao.i2.fotoBase64,
      guaDescricao: g.manutencao[0].descricao,
      guaItem: g.checklist.Salao.i1.ok,
    };
  }, URL_FOTO);
  check('a cópia da loja aberta agora fica intacta, com as fotos', copias.banguFoto > 2000);
  check('e a URL dela também, claro', copias.banguUrl === URL_FOTO);
  check('a de outra loja perde o base64, que é o que pesa', copias.guaFoto === 0);
  check('mas a URL da foto SOBREVIVE — apagá-la não abria espaço e perdia a imagem',
    copias.guaUrl === URL_FOTO);
  check('e mantém o que importa: descrição, itens marcados',
    copias.guaDescricao === 'torneira' && copias.guaItem === true);

  // ── 5. Cópia de dia passado de outra loja sai; a de hoje fica ────────────────────
  const passado = await a.page.evaluate(() => {
    localStorage.clear(); window.__cota = 1e9;
    const hoje = new Date().toISOString().slice(0, 10);
    const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    localStorage.setItem('gn_chk4_day_NORTE', JSON.stringify({ data: ontem, manutencao: [] }));
    localStorage.setItem('gn_chk4_day_PEDREIRA', JSON.stringify({ data: hoje, manutencao: [] }));
    localStorage.setItem('gn_chk4_day_SEM_DATA', JSON.stringify({ manutencao: [] }));
    gnLiberarEspaco({ lojaAtual: 'BANGU' });
    return { ontem: localStorage.getItem('gn_chk4_day_NORTE'),
             hoje: localStorage.getItem('gn_chk4_day_PEDREIRA'),
             semData: localStorage.getItem('gn_chk4_day_SEM_DATA') };
  });
  check('cópia de dia já passado de outra loja é liberada', passado.ontem === null);
  check('cópia de hoje de outra loja NÃO é apagada', passado.hoje !== null);
  check('cópia sem data conhecida não é apagada (na dúvida, não mexe)', passado.semData !== null);

  // ── 6. Aba anônima: recusa tudo, e isso não é falta de espaço ────────────────────
  const anonima = await a.page.evaluate(() => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { const e = new Error('denied'); e.name = 'SecurityError'; throw e; };
    const r = gnGuardar('k', 'v');
    Storage.prototype.setItem = real;
    return r;
  });
  check('navegador que bloqueia dados do site é "indisponivel", não "sem-espaco"',
    anonima === 'indisponivel');
  await a.ctx.close();

  // ── 7. O LOGIN do Check-list não trava mais com a cota cheia ─────────────────────
  // Era o pior caso: o setItem da sessão estourava e levava junto tudo o que vinha depois.
  const c = await abrir(browser, 'gn-checklist.html', ['LOJA']);
  const login = await c.page.evaluate(() => {
    localStorage.clear();
    LOJA = 'Bangu';   // binding lexical: window.LOJA criaria outra variável, sem efeito
    window.__cota = 300;                       // nada mais cabe
    let estourou = null;
    try {
      gnGuardar('gn_chk_user_Bangu', JSON.stringify({ id: 1, nome: 'Ana' }), { lojaAtual: 'Bangu' });
    } catch (e) { estourou = String(e); }
    return estourou;
  });
  check('a gravação da sessão no login não estoura nem com a cota zerada', login === null);

  // ── 8. A mensagem: nada de "não salvou" quando o servidor recebeu ───────────────
  const msg = await c.page.evaluate(() => {
    localStorage.clear(); window.__cota = 1e9;
    LOJA = 'Bangu';   // binding lexical: window.LOJA criaria outra variável, sem efeito
    localStorage.setItem('gn_cl_last_save_Bangu', '✓ Salvo às 19:11');
    localStorage.setItem('gn_cl_last_save_dia_Bangu', hojeLocal());
    _registrarAvisoCopiaLocal('Cópia de segurança deste aparelho ficou sem as fotos (memória do app cheia). O dia continua sendo salvo no servidor normalmente.');
    const ind = document.getElementById('last-save-indicator');
    const av = document.getElementById('aviso-copia-local');
    return { indicador: ind.textContent, cor: ind.style.color,
             aviso: av ? av.textContent : null,
             err: localStorage.getItem('gn_cl_last_err_Bangu') };
  });
  check('o indicador continua verde dizendo "Salvo às 19:11"',
    /Salvo às 19:11/.test(msg.indicador) && !/Não salvou/.test(msg.indicador));
  check('a cor NÃO é a vermelha de falha', msg.cor !== 'rgb(185, 28, 28)');
  check('o aviso aparece à parte, e já diz que o dia está no servidor',
    /mem[óo]ria do app/i.test(msg.aviso || '') && /salvo no servidor/i.test(msg.aviso || ''));
  check('não fala mais em "espaço no aparelho" (mandava limpar o celular à toa)',
    !/espa[çc]o no aparelho/i.test(msg.aviso || ''));
  check('e não registra falha de salvamento, que é outra coisa', msg.err === null);

  // ── 9. Falha de servidor de verdade continua vermelha ───────────────────────────
  const servidor = await c.page.evaluate(() => {
    localStorage.clear(); window.__cota = 1e9;
    LOJA = 'Bangu';   // binding lexical: window.LOJA criaria outra variável, sem efeito
    localStorage.setItem('gn_cl_last_save_Bangu', '✓ Salvo às 18:00');
    localStorage.setItem('gn_cl_last_save_dia_Bangu', hojeLocal());
    _registrarFalhaSalvar('timeout');
    const ind = document.getElementById('last-save-indicator');
    return { txt: ind.textContent, cor: ind.style.color };
  });
  check('falha de servidor segue em vermelho e por extenso',
    /Não salvou/.test(servidor.txt) && /timeout/.test(servidor.txt) && servidor.cor === 'rgb(185, 28, 28)');

  // ── 10. Quando volta a caber, o aviso some ──────────────────────────────────────
  const sumiu = await c.page.evaluate(() => {
    _limparAvisoCopiaLocal();
    _updateLastSaveIndicator();
    const av = document.getElementById('aviso-copia-local');
    return !av || av.style.display === 'none';
  });
  check('resolvido o espaço, o aviso sai da tela sozinho', sumiu === true);
  check('nenhum erro de página durante tudo isso', c.erros.length === 0);
  await c.ctx.close();

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
