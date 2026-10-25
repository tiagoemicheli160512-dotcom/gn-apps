// "No app estoque e pedido, nova Iguaçu e nova América subirem as urgências, porém nova
//  América tá zerado, tem como verificar o que houve?"
//
// A urgência da Nova América subiu certa: 66 contagens às 09h42 de 05/10, Água Tônica = 39.
// O que estava velho era a TELA. O painel do topo relê gn_pedido_envio_semana de minuto em
// minuto e acendeu o ⚡ da loja; gn_contagens_pedido era lido UMA vez, ao abrir o app, e o
// Compras passa a segunda inteira com a tela aberta. Resultado: o painel anunciava a
// urgência e, embaixo, a coluna da loja continuava a da semana passada — Est.ant 28
// (2CX+4UN), que é exatamente a contagem de 28/09, e Est.vig 0.
//
// Metade dos testes aqui é sobre o que a recarga NÃO pode fazer: uma falha de rede no meio
// da paginação devolve lista parcial em silêncio, e trocar o estado por ela zeraria o
// Est.vig de todas as lojas — o mesmo sintoma, agora causado pela correção.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const fs = require('fs');
const fakeSupabase = require('' + CAMINHOS.fix('fake_supabase.js') + '');
const PEDIDOS = process.env.ARQ_PEDIDOS || CAMINHOS.pub('gn-pedidos.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

const iso = d => d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
const segundaDesta = (() => { const d = new Date(); const w = d.getDay(); d.setDate(d.getDate() + (w === 0 ? -6 : 1 - w)); d.setHours(12,0,0,0); return d; })();
const SEG = iso(segundaDesta);
const SEG_ANT = iso(new Date(segundaDesta.getTime() - 7 * 86400000));

const AGUA = 'cat-agua-tonica';
const PEDIDO_ID = 'ped-semana-rj';

// Estado do banco ANTES de a Nova América contar: só a contagem da semana passada.
function bancoInicial() {
  return {
    gn_catalogo: [
      { id: AGUA, produto: 'Agua Tonica cx c/ 12 und', grupo: 'BEBIDAS', fornecedor: 'AMBEV',
        und: 'CX', custo: 42.12, und_por_caixa: 12, ativo: true },
    ],
    gn_lojas_pedido: [],
    gn_pedidos: [{ id: PEDIDO_ID, data_pedido: SEG, semana_inicio: SEG, regiao: 'RJ', status: 'RASCUNHO', criado_em: SEG + 'T11:24:58Z' }],
    gn_pedido_itens: [
      { id: 'it-ni', pedido_id: PEDIDO_ID, catalogo_id: AGUA, loja_slug: 'nova_iguacu', qtd_pedida: 3, custo_unitario: 42.12 },
    ],
    gn_contagens_pedido: [
      { id: 'c-na-ant', catalogo_id: AGUA, loja_slug: 'nova_america', atual: 28, ul_estoque: 24, ul_pedido: 3,
        atual_cx: 2, atual_und: 4, data_contagem: SEG_ANT, criado_por: 'Júlia', criado_em: SEG_ANT + 'T13:30:46Z' },
      { id: 'c-ni-ant', catalogo_id: AGUA, loja_slug: 'nova_iguacu', atual: 20, ul_estoque: 15, ul_pedido: 2,
        atual_cx: 1, atual_und: 8, data_contagem: SEG_ANT, criado_por: 'Juan', criado_em: SEG_ANT + 'T13:10:00Z' },
    ],
    gn_pedido_envio_semana: [
      { loja_slug: 'nova_iguacu', semana_inicio: SEG, loja: 'NOVA IGUAÇU',
        urgencia_em: SEG + 'T12:23:30Z', urgencia_por: 'Juan', urgencia_itens: 75 },
    ],
  };
}

// O que a Nova América mandou às 09h42: a contagem do dia (Água Tônica 39 = 3CX+3UN) e a
// linha de envio que faz o ⚡ acender no painel.
const CONTAGEM_NOVA_AMERICA = { id: 'c-na-hoje', catalogo_id: AGUA, loja_slug: 'nova_america',
  atual: 39, ul_estoque: 28, ul_pedido: 0, atual_cx: 3, atual_und: 3,
  data_contagem: SEG, criado_por: 'Júlia', criado_em: SEG + 'T12:42:01Z' };
const ENVIO_NOVA_AMERICA = { loja_slug: 'nova_america', semana_inicio: SEG, loja: 'NOVA AMERICA',
  urgencia_em: SEG + 'T12:42:05Z', urgencia_por: 'Júlia', urgencia_itens: 66 };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(fakeSupabase());
  // O CDN tem que ficar fora: quando ele responde, o supabase-js de verdade sobrescreve o
  // falso e some com o banco do teste; quando não responde, o script do app aborta na
  // criação do client. Bloquear deixa o resultado igual nos dois dias.
  await ctx.route('https://cdn.jsdelivr.net/**', r => r.abort());
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();

  for (let t = 1; ; t++) {
    await page.goto('file://' + PEDIDOS);
    try {
      // Esperar por S (um let) e não por uma função: declaração de função é içada e
      // responde true mesmo com o script abortado no meio.
      await page.waitForFunction(() => { try { return !!S && typeof renderPedido === 'function'; } catch (e) { return false; } }, { timeout: 20000 });
      break;
    } catch (e) {
      if (t >= 3) { console.log('FALHOU: o app Pedidos não carregou'); await browser.close(); process.exit(1); }
    }
  }

  // Na contraprova (arquivo de produção) a função não existe: o teste segue rodando com o
  // caminho antigo — que era só reler o status — pra mostrar o sintoma de verdade em vez de
  // só constatar que a função nova falta.
  const temRecarga = await page.evaluate(() => {
    const novo = typeof _recarregarDadosDasLojas === 'function' && typeof atualizarPainelEnvio === 'function';
    window.__recarregar = novo ? _recarregarDadosDasLojas : (async () => {});
    return novo;
  });
  if (!temRecarga) console.log('· contraprova: arquivo sem a recarga — rodando o caminho antigo');

  // Monta a tela como o Compras a deixa aberta: pedido da semana carregado, Nova América
  // ainda sem contar.
  const inicial = await page.evaluate(async ([db0, seg, agua, pedidoId]) => {
    window.__DB = db0; window.__DB_ERRO = {};
    S.regiao = 'RJ';
    S.semanaAtiva = new Date(seg + 'T12:00:00');
    S.lojas = [{ slug_pedido: 'nova_iguacu', nome_display: 'Nova Iguaçu' },
               { slug_pedido: 'nova_america', nome_display: 'Nova América' }];
    S.catalogo = [{ id: agua, produto: 'Agua Tonica cx c/ 12 und', grupo: 'BEBIDAS', fornecedor: 'AMBEV',
                    und: 'CX', custo: 42.12, und_por_caixa: 12, ativo: true }];
    S.pedidoAtual = { id: pedidoId, status: 'RASCUNHO' };
    await carregarContagens();
    await carregarItensPedido();
    await carregarEnvioSemana();
    const c = S.contagens[agua].nova_america;
    const ef = _estAntVigEfetivo(c, seg, seg);
    return { atual: c.atual, estAnt: ef.estAnt, estVig: ef.estVig, statusNA: _envioStatusLoja('nova_america') };
  }, [bancoInicial(), SEG, AGUA, PEDIDO_ID]);

  check('antes de a loja contar, a tela mostra o estoque da semana passada (28)',
    inicial.atual === 28 && inicial.estAnt === 28);
  check('e o Est.vig fica vazio — é o "zerado" que o Tiago viu', inicial.estVig === null);
  check('o painel ainda não acusa a Nova América', inicial.statusNA === 'nada');

  // ── A loja conta às 09h42 ────────────────────────────────────────────────────────
  const depois = await page.evaluate(async ([cont, envio, seg, agua]) => {
    window.__DB.gn_contagens_pedido.push(cont);
    window.__DB.gn_pedido_envio_semana.push(envio);
    const mudou = await carregarEnvioSemana();   // é o que o polling de 60s faz primeiro
    await window.__recarregar();
    const c = S.contagens[agua].nova_america;
    const ef = _estAntVigEfetivo(c, seg, seg);
    return { mudou, status: _envioStatusLoja('nova_america'), atual: c.atual,
             estAnt: ef.estAnt, estVig: ef.estVig, cx: ef.estVigCx, und: ef.estVigUnd,
             quem: c.criado_por };
  }, [CONTAGEM_NOVA_AMERICA, ENVIO_NOVA_AMERICA, SEG, AGUA]);

  check('o painel detecta que a loja enviou', depois.mudou === true && depois.status === 'urgencia');
  check('e a contagem do dia chega junto: Est.vig passa a 39', depois.estVig === 39 && depois.atual === 39);
  check('com a quebra que a loja digitou (3CX+3UN)', depois.cx === 3 && depois.und === 3);
  check('o Est.ant vira o estoque da semana passada (28), como deve ser', depois.estAnt === 28);
  check('e dá pra saber quem contou', depois.quem === 'Júlia');

  // ── O que a recarga NÃO pode fazer ──────────────────────────────────────────────
  // 1. Falha de rede não apaga o que já está certo na tela.
  const semRede = await page.evaluate(async ([agua]) => {
    window.__DB_ERRO = { gn_contagens_pedido: true };
    await window.__recarregar();
    window.__DB_ERRO = {};
    const c = S.contagens[agua] && S.contagens[agua].nova_america;
    return { atual: c ? c.atual : null, lojas: Object.keys(S.contagens[agua] || {}).length };
  }, [AGUA]);
  check('falha de rede mantém as contagens em vez de zerar a tela inteira',
    semRede.atual === 39 && semRede.lojas === 2);

  // 2. Com item esperando sincronizar, o que o comprador digitou não pode ser relido por
  //    cima — mas a contagem, que ninguém digita aqui, continua atualizando.
  const comFila = await page.evaluate(async ([agua, cont2]) => {
    S.pedidoItens[agua].nova_america = { id: null, qtd: 7, custo: 42.12 };
    _ppSet(agua, 'nova_america', 7, 42.12, null);
    window.__DB.gn_contagens_pedido.push(Object.assign({}, cont2, { id: 'c-na-2', atual: 41, atual_cx: 3, atual_und: 5, criado_em: cont2.criado_em.replace('12:42', '12:58') }));
    await window.__recarregar();
    const r = { qtd: S.pedidoItens[agua].nova_america.qtd, atual: S.contagens[agua].nova_america.atual };
    _ppDel(agua, 'nova_america');
    return r;
  }, [AGUA, CONTAGEM_NOVA_AMERICA]);
  check('item ainda não sincronizado não é sobrescrito pela recarga', comFila.qtd === 7);
  check('e mesmo assim a contagem nova entra (41)', comFila.atual === 41);

  // 3. Sem fila pendente, os itens que chegaram do banco aparecem.
  const itens = await page.evaluate(async ([agua, pedidoId]) => {
    window.__DB.gn_pedido_itens.push({ id: 'it-na', pedido_id: pedidoId, catalogo_id: agua,
      loja_slug: 'nova_america', qtd_pedida: 5, custo_unitario: 42.12 });
    await window.__recarregar();
    return { qtd: (S.pedidoItens[agua].nova_america || {}).qtd, conta: contarItensLoja('nova_america') };
  }, [AGUA, PEDIDO_ID]);
  check('sem fila pendente, o item que chegou do banco entra na tela', itens.qtd === 5);
  check('e a aba da loja deixa de mostrar zero', itens.conta === 1);

  // 4. O botão 🔄 do painel faz a mesma recarga — antes ele relia só o status.
  const botao = await page.evaluate(() => _painelEnvioSemanaHtml());
  check('o 🔄 do painel chama a recarga completa, não só o status',
    /onclick="atualizarPainelEnvio\(\)"/.test(botao) && !/carregarEnvioSemana\(\)\.then/.test(botao));

  // 5. A recarga leva segundos de rede. Se o comprador começou a digitar nesse meio-tempo,
  //    redesenhar apagaria o número dele — isso o polling já evitava, mas antes a janela
  //    entre consultar e desenhar era instantânea; agora não é.
  const ocupado = await page.evaluate(() => {
    if (typeof _pedidoOcupado !== 'function') return null;
    const livre = _pedidoOcupado();
    const inp = document.createElement('input');
    document.body.appendChild(inp); inp.focus();
    const digitando = _pedidoOcupado();
    inp.blur(); inp.remove();
    return { livre, digitando };
  });
  check('a tela sabe quando não pode redesenhar (campo em foco)',
    !!ocupado && ocupado.livre === false && ocupado.digitando === true);

  await browser.close();

  // 6. O polling de 60s precisa passar pela recarga — é o caminho que o Compras usa sem
  //    clicar em nada, e é onde o defeito estava.
  const fonte = fs.readFileSync(PEDIDOS, 'utf8');
  const bloco = (fonte.match(/setInterval\(async \(\) => \{[\s\S]*?\}, 60000\);/) || [''])[0];
  check('o polling de 60s recarrega os dados da loja antes de redesenhar',
    /_recarregarDadosDasLojas\(\)/.test(bloco) && /renderPedido\(\)/.test(bloco));
  check('e adia o desenho em vez de descartá-lo quando o comprador está digitando',
    /_pedidoRenderAdiado = true/.test(bloco) && /if \(!_pedidoRenderAdiado\)/.test(bloco));

  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
