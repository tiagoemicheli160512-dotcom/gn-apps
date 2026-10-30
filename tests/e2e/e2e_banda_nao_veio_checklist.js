// A loja via um numero e o Painel via outro pelo MESMO fim de semana.
//
// Depois que "banda que nao veio nao e paga" entrou no Painel de Gestao, o Historico de
// Banda do Check-list continuou cobrando o cache de quem nao tocou: no 10-11/10 a Pedreira
// lia "Total Bandas R$ 1.600,00 / Saldo -R$ 459,00" na tela da loja enquanto o Painel ja
// mostrava +R$ 341. Duas telas discordando sobre o mesmo dinheiro e pior do que as duas
// erradas juntas: nao da pra saber qual levar pra conversa.
//
// A divergencia tem uma causa concreta: as duas telas leem FONTES diferentes. O Painel le
// gn_trios_agenda, que tem a marca `banda_nao_veio`; o Historico le o campo `banda` do
// checklist_diario, que guarda so nome, valor, consumo e quantidade de couvert — a marca
// nao existe la. MEDIDO em 10/10 na Pedreira: {"nome":"Trio Remelexo","valor":800,
// "consumo":150,"qtd_couvert":0}. Nada nessa linha diz que a banda faltou.
//
// E a mesma ressalva do Painel vale aqui, porque a marca quer dizer DUAS coisas:
//   · Pedreira 10/10 — ninguem tocou, couvert 0                        -> desconta;
//   · Guarulhos 26 e 27/09 — TROCA de banda, outro trio tocou e a casa arrecadou couvert
//     de 48 e 129 pessoas                                              -> NAO desconta.
// Quem decide e o couvert da noite, nao a marca.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-checklist.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };

// Os numeros reais do banco, dos dois casos.
const DIARIO = [
  { data_operacao: '2026-10-10', banda: { nome: 'Trio Remelexo',  valor: 800, consumo: 150, qtd_couvert: 0 } },
  { data_operacao: '2026-10-11', banda: { nome: 'Trio Peneirado', valor: 800, consumo: 150, qtd_couvert: 163 } },
];
const AGENDA = [
  { data: '2026-10-10', banda_nao_veio: true  },
  { data: '2026-10-11', banda_nao_veio: false },
];
// A troca de banda: marca igual, couvert na mao.
const DIARIO_TROCA = [
  { data_operacao: '2026-10-10', banda: { nome: 'Trio SP Baiao', valor: 800, consumo: 150, qtd_couvert: 48 } },
];
const AGENDA_TROCA = [{ data: '2026-10-10', banda_nao_veio: true }];
// Dia com DOIS trios em que so um faltou. Sao 28 dias com mais de uma apresentacao na
// base: se bastasse uma falta pra zerar o dia, o cache de quem tocou sumia junto.
const DIARIO_DOIS = [
  { data_operacao: '2026-10-10', banda: { nome: 'Trio A + Trio B', valor: 1300, consumo: 150, qtd_couvert: 0 } },
];
const AGENDA_DOIS = [
  { data: '2026-10-10', banda_nao_veio: true  },
  { data: '2026-10-10', banda_nao_veio: false },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-10-15T12:00:00');
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message || e)));

  // O app cria o cliente Supabase num `const sb` de topo, que nao e propriedade de window
  // — trocar window.sb nao troca nada. Entao o teste responde no HTTP, pela rota, o que
  // tambem e mais fiel: a consulta que a tela monta de verdade passa por aqui, e da pra
  // cobrar a loja e o periodo que ela pediu.
  let cenario = { diario: [], agenda: [], agendaFalha: false };
  const urls = [];
  await ctx.route('**/rest/v1/**', r => {
    const u = r.request().url();
    urls.push(u);
    if (/\/gn_trios_agenda/.test(u)) {
      // Duas formas de falhar, e elas nao sao a mesma: o 500 volta como {error}, e a
      // conexao cortada faz o fetch REJEITAR. So a segunda derruba a aba inteira se a
      // chamada nao tiver quem a segure.
      if (cenario.agendaFalha === 'corte') return r.abort('connectionrefused');
      if (cenario.agendaFalha) return r.fulfill({ status: 500, contentType: 'application/json',
        body: '{"message":"rede"}' });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cenario.agenda) });
    }
    if (/\/checklist_diario/.test(u))
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cenario.diario) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('file://' + ARQ);
  // A espera NAO exige _bandaCalc de proposito: contra a versao anterior a suite precisa
  // carregar e falhar nos NUMEROS, nao na ausencia da funcao — senao a contraprova so
  // provaria que a funcao e nova.
  await CAMINHOS.esperarApp(page, ['_bandaTabRows'],
    ['carregarBandaTab', 'renderBandaTab', 'abrirRelatorioBanda'], 25000);

  const rodar = async (diario, agenda, agendaFalha) => {
    cenario = { diario, agenda, agendaFalha };
    urls.length = 0;
    return page.evaluate(async () => {
      const ini = document.getElementById('banda-filtro-ini');
      const fim = document.getElementById('banda-filtro-fim');
      if (ini) ini.value = '2026-10-05';
      if (fim) fim.value = '2026-10-11';
      // Vazio, nao null: o card de 'banda de hoje' escreve em state.banda.nome, e com
      // null isso estoura. Com o nome em branco ele tambem nao entra no historico.
      state.banda = { nome: '', valor: 0, consumo: 0, qtd_couvert: 0 };
      await carregarBandaTab(true);
      const el = document.getElementById('banda-tab-conteudo');
      const alerta = document.getElementById('banda-tab-alerta');
      // Cada cartao de dia lido por CAMPO: no texto corrido os valores ficam colados.
      const dias = [...el.querySelectorAll(':scope > div')].slice(1).map(dv => {
        const campos = {};
        [...dv.querySelectorAll('div')].forEach(c => {
          const f = c.firstElementChild, v = f && f.nextElementSibling;
          if (!f || !v) return;
          const rot = f.textContent.trim();
          if (/^(Couvert|Banda|Resultado)$/.test(rot)) {
            campos[rot] = v.textContent.trim();
            const extra = v.nextElementSibling;
            if (extra) campos[rot + '_nota'] = extra.textContent.replace(/\s+/g, ' ').trim();
          }
        });
        return { txt: dv.textContent.replace(/\s+/g, ' ').trim(), campos };
      });
      const resumo = el.firstElementChild;
      const tot = {};
      [...(resumo ? resumo.querySelectorAll('div') : [])].forEach(c => {
        const f = c.firstElementChild, v = f && f.nextElementSibling;
        if (f && v && /^(Total Couvert|Total Bandas|Saldo)$/.test(f.textContent.trim()))
          tot[f.textContent.trim()] = v.textContent.trim();
      });
      return { dias, tot, slug: _triosLojaSlug(),
               semShow: typeof _bandaTabSemShow === 'undefined' ? [] : [..._bandaTabSemShow],
               alerta: alerta && alerta.style.display !== 'none'
                       ? alerta.textContent.replace(/\s+/g, ' ').trim() : '',
               txt: el.textContent.replace(/\s+/g, ' ').trim() };
    });
  };

  await page.evaluate(() => { LOJA = 'Pedreira'; state.data = '2026-10-15'; });
  const r = await rodar(DIARIO, AGENDA, false);
  const sn = s => String(s == null ? '' : s).replace(/ /g, ' ');

  check('a tela descobre o slug da loja na agenda dos trios', r.slug === 'pedreira', r.slug);
  // A consulta da agenda tem que ser da MESMA loja e do MESMO período do histórico —
  // senão o desconto viria de outro lugar e ninguém notaria.
  const urlAgenda = urls.find(u => /gn_trios_agenda/.test(u) && /data=gte/.test(u)) || '';
  check('e consulta a agenda da loja aberta, no período do filtro',
    /loja=eq\.pedreira/.test(urlAgenda) && /data=gte\.2026-10-05/.test(urlAgenda)
      && /data=lte\.2026-10-11/.test(urlAgenda), urlAgenda || JSON.stringify(urls.slice(0,4)));
  check('e marca 10/10 como a noite em que ninguém tocou',
    JSON.stringify(r.semShow) === JSON.stringify(['2026-10-10']), JSON.stringify(r.semShow));
  check('os dois dias aparecem no histórico', r.dias.length === 2, JSON.stringify(r.dias.map(d => d.campos)));

  // ══ 1. O DIA SEM BANDA NÃO CUSTA NADA ═══════════════════════════════════════════
  const d10 = r.dias[0] || { campos: {} };
  check('o cachê do dia sem banda sai da conta',
    sn(d10.campos['Banda']) === 'R$ 0,00', JSON.stringify(d10.campos));
  check('e o dia deixa de fechar em −R$ 800,00',
    sn(d10.campos['Resultado']) === '+R$ 0,00', JSON.stringify(d10.campos));
  check('a tela diz de onde saiu a diferença, com o valor',
    /não veio — R\$ ?800,00 descontados/.test(sn(d10.campos['Banda_nota'])),
    JSON.stringify(d10.campos));
  check('o couvert daquele dia continua zero, porque não houve show',
    sn(d10.campos['Couvert']) === 'R$ 0,00', JSON.stringify(d10.campos));

  // ══ 2. O DIA EM QUE A BANDA VEIO NÃO MUDA ═══════════════════════════════════════
  const d11 = r.dias[1] || { campos: {} };
  check('o dia em que a banda veio segue com o cachê cheio',
    sn(d11.campos['Banda']) === 'R$ 800,00', JSON.stringify(d11.campos));
  check('e com o couvert e o resultado que ele deu',
    sn(d11.campos['Couvert']) === 'R$ 1.141,00' && sn(d11.campos['Resultado']) === '+R$ 341,00',
    JSON.stringify(d11.campos));

  // ══ 3. O PERÍODO PASSA A BATER COM O PAINEL ═════════════════════════════════════
  // É o número que o dono viu divergindo: a loja lia −R$ 459 e o Painel +R$ 341.
  check('o total de bandas do período é o devido, não o contratado',
    sn(r.tot['Total Bandas']) === 'R$ 800,00', JSON.stringify(r.tot));
  check('o couvert do período é o mesmo de sempre',
    sn(r.tot['Total Couvert']) === 'R$ 1.141,00', JSON.stringify(r.tot));
  check('e o saldo deixa de ser −R$ 459,00 e passa a ser +R$ 341,00',
    sn(r.tot['Saldo']) === '+R$ 341,00', JSON.stringify(r.tot));
  check('nenhum dia é apontado como fechando no vermelho',
    r.alerta === '', r.alerta);

  // ══ 4. O RELATÓRIO FALA O MESMO NÚMERO DA TELA ══════════════════════════════════
  const rel = await page.evaluate(() => {
    abrirRelatorioBanda();
    const c = document.getElementById('rel-content');
    return c ? c.textContent : '';
  });
  check('o relatório traz o cachê descontado no dia sem banda',
    /banda não veio: R\$ ?800,00 descontados\) a pagar: R\$ ?0,00/.test(sn(rel)), sn(rel).slice(0, 700));
  check('e o dia em que a banda veio segue inteiro nele',
    /Resultado: \+R\$ ?341,00/.test(sn(rel)), sn(rel).slice(0, 800));
  check('e o saldo do período no relatório é o mesmo da tela',
    /Saldo total: \+R\$ ?341,00/.test(sn(rel)), sn(rel).slice(-200));

  // ══ 5. A TROCA DE BANDA NÃO PODE SER DESCONTADA ═════════════════════════════════
  const t = await rodar(DIARIO_TROCA, AGENDA_TROCA, false);
  const t10 = t.dias[0] || { campos: {} };
  check('a noite marcada como "não veio" que ARRECADOU mantém o cachê',
    sn(t10.campos['Banda']) === 'R$ 800,00', JSON.stringify(t10.campos));
  check('e não ganha a nota de desconto',
    !/descontados/.test(sn(t10.campos['Banda_nota'])), JSON.stringify(t10.campos));
  check('o resultado dela é o couvert menos o cachê cheio (336 − 800)',
    sn(t10.campos['Resultado']) === 'R$ -464,00', JSON.stringify(t10.campos));

  // ══ 6. DIA COM DOIS TRIOS EM QUE SÓ UM FALTOU ══════════════════════════════
  // Houve show: quem subiu no palco recebe. Zerar o dia inteiro apagaria o cachê dele.
  const dois = await rodar(DIARIO_DOIS, AGENDA_DOIS, false);
  check('o dia com dois trios em que só um faltou não conta como noite sem show',
    dois.semShow.length === 0, JSON.stringify(dois.semShow));
  check('e o cachê do dia continua inteiro',
    sn((dois.dias[0] || { campos: {} }).campos['Banda']) === 'R$ 1.300,00',
    JSON.stringify((dois.dias[0] || {}).campos));

  // ══ 7. SEM A AGENDA, A TELA ABRE DO JEITO QUE SEMPRE ABRIU ══════════════════════
  // A agenda é complemento: desconto que depende de rede não pode derrubar o histórico
  // inteiro nem inventar um desconto que ninguém confirmou.
  const f = await rodar(DIARIO, AGENDA, true);
  check('se a agenda não responde, o histórico continua abrindo',
    f.dias.length === 2, JSON.stringify(f.dias.map(d => d.campos)));
  check('e sem desconto nenhum — o cachê cheio, como era antes',
    sn((f.dias[0] || { campos: {} }).campos['Banda']) === 'R$ 800,00',
    JSON.stringify((f.dias[0] || {}).campos));
  check('nenhuma noite entra na lista de "ninguém tocou"',
    f.semShow.length === 0, JSON.stringify(f.semShow));

  // E com a conexao cortada no meio, que e a falha que realmente derruba a chamada.
  const corte = await rodar(DIARIO, AGENDA, 'corte');
  check('com a conexão cortada o histórico também continua abrindo',
    corte.dias.length === 2, JSON.stringify(corte.dias.map(d => d.campos)));
  check('e também sem desconto nenhum',
    sn((corte.dias[0] || { campos: {} }).campos['Banda']) === 'R$ 800,00',
    JSON.stringify((corte.dias[0] || {}).campos));

  const reais = erros.filter(e => !/createClient|Failed to fetch|supabase|NetworkError|net::/i.test(e));
  check('nenhum erro de JS', reais.length === 0, reais.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
