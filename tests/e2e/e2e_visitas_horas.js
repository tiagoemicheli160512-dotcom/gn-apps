// "No app home, painel de gestão, em visitas, vendo nos relatórios, a quantidade de horas
//  está sendo somada de forma errada. Quando existe a visita remota simultaneamente não é
//  pra somar as horas de cada loja, e sim unificar. Iniciei remoto às 8h, entrei presencial
//  às 11h, saí do remoto às 12h e finalizei a presencial às 16h: vale de 8h às 16h."
//
// Uma sessão remota é gravada como UM REGISTRO POR LOJA, todos com o mesmo horário. Somando
// duração registro por registro, 8h45 em 11 lojas virava 96h.
//
// Caso real do banco, 19/10/2026 (Tiago): onze remotos 07:20→16:05 + uma presencial
// 11:06→18:49. O relatório mostrava ~104 horas num dia só. O certo é 07:20→18:49 = 11h29.
//
// Regra decidida com o dono: por pessoa e por DIA, do PRIMEIRO acesso ao ÚLTIMO, presencial
// e remoto juntos — deslocamento e almoço entram, porque o dia de supervisão é contínuo.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const fs = require('fs');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
const CHK  = process.env.ARQ_CHK  || CAMINHOS.pub('gn-checklist.html');
const SB_LIB = fs.readFileSync('' + CAMINHOS.fix('supabase.min.js') + '', 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (extra !== undefined && !c ? '  → ' + String(extra).slice(0,300) : '')); c ? ok++ : falhou++; };

// O dia 19/10 do banco, como está gravado.
const LOJAS_REMOTAS = ['Rancho','Boulevard','Norte Shopping','Guarulhos','Itaquera',
  'São Gonçalo','Caxias','Bangu','Nova América','Campo Grande','Pedreira'];
const DIA_19 = [
  ...LOJAS_REMOTAS.map(l => ({ data:'2026-10-19', loja:l, visitante:'Tiago', tipo_visita:'remoto',
    hora_chegada:'07:20', hora_saida:'16:05' })),
  { data:'2026-10-19', loja:'Bangu', visitante:'Tiago', tipo_visita:'rotina',
    hora_chegada:'11:06', hora_saida:'18:49' },
];

async function abrir(browser, arq, espera) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status:200, contentType:'application/javascript', body:SB_LIB }));
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status:200, contentType:'application/json', body:'[]' }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e)));
  await page.addInitScript(() => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('gn_session_v1', JSON.stringify({
      id: 38, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true, visitas: true }, ts: Date.now() }));
  });
  await page.goto('file://' + arq);
  await page.waitForFunction(espera, { timeout: 30000 });
  return { ctx, page, erros };
}

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  // ── 1. A regra, no arquivo compartilhado ───────────────────────────────────────────
  {
    const a = await abrir(browser, HOME, () => { try { return typeof gnVisitasMinutos === 'function'; } catch(e) { return false; } });
    const r = await a.page.evaluate((DIA_19) => {
      const m = (vs) => gnVisitasMinutos(vs);
      return {
        dia19: m(DIA_19),
        somaAntiga: DIA_19.reduce((t,v) => {
          const [ch,cm]=v.hora_chegada.split(':').map(Number), [sh,sm]=v.hora_saida.split(':').map(Number);
          return t + ((sh*60+sm)-(ch*60+cm)); }, 0),
        exemploDoDono: m([
          { data:'2026-10-20', hora_chegada:'08:00', hora_saida:'12:00', tipo_visita:'remoto' },
          { data:'2026-10-20', hora_chegada:'11:00', hora_saida:'16:00' },
        ]),
        comBuraco: m([
          { data:'2026-09-18', hora_chegada:'10:14', hora_saida:'12:28' },
          { data:'2026-09-18', hora_chegada:'13:02', hora_saida:'17:30' },
        ]),
        doisDias: m([
          { data:'2026-10-01', hora_chegada:'08:00', hora_saida:'12:00' },
          { data:'2026-10-02', hora_chegada:'09:00', hora_saida:'10:30' },
        ]),
        emAndamento: m([{ data:'2026-10-20', hora_chegada:'08:00', hora_saida:null }]),
        plano: m([{ data:'2026-10-20', hora_chegada:'PLAN', hora_saida:null }]),
        ausencia: m([{ data:'2026-10-20', loja:'FOLGA', hora_chegada:null, hora_saida:null }]),
        viraNoite: m([{ data:'2026-10-20', hora_chegada:'22:00', hora_saida:'02:00' }]),
        soRemotosIguais: m(DIA_19.filter(v => v.tipo_visita === 'remoto')),
        porDia: gnVisitasMinutosPorDia(DIA_19),
      };
    }, DIA_19);

    check('o dia 19/10 vale 11h29 (07:20 → 18:49)', r.dia19 === 689, r.dia19 + ' min');
    check('e a soma antiga dava ~104 h no mesmo dia', r.somaAntiga === 6238, r.somaAntiga + ' min');
    check('o exemplo do dono dá 8 h (8h → 16h)', r.exemploDoDono === 480, r.exemploDoDono + ' min');
    check('o intervalo entre duas visitas entra na conta', r.comBuraco === 436, r.comBuraco + ' min (10:14 → 17:30)');
    check('cada dia é contado por si e somado', r.doisDias === 240 + 90, r.doisDias + ' min');
    check('visita em andamento não entra', r.emAndamento === 0, r.emAndamento);
    check('plano não entra', r.plano === 0, r.plano);
    check('folga/férias não entram', r.ausencia === 0, r.ausencia);
    check('visita que atravessa a meia-noite dá 4 h', r.viraNoite === 240, r.viraNoite + ' min');
    check('11 remotos no mesmo horário valem uma única sessão',
      r.soRemotosIguais === 525, r.soRemotosIguais + ' min (07:20 → 16:05 = 8h45)');
    check('e o detalhe por dia tem um dia só', Object.keys(r.porDia).length === 1, JSON.stringify(r.porDia));
    await a.ctx.close();
  }

  // ── 2. Home: a tela e o relatório passam a dizer a MESMA coisa ────────────────────
  {
    const a = await abrir(browser, HOME, () => { try { return typeof _renderVisRelatorioTab === 'function' && typeof _buildTextoVisitasSup === 'function'; } catch(e) { return false; } });
    const r = await a.page.evaluate((DIA_19) => {
      session = { id: 38, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true, visitas: true } };
      _visSupSelecionado = 'Tiago';
      _visSupData = DIA_19.map(v => Object.assign({ obs:'', endereco:'' }, v));
      _visSupDe = '2026-10-19'; _visSupAte = '2026-10-19'; _visSupPeriodo = 'diaria';
      _visSupLojaFiltro = null;
      const html = _renderVisRelatorioTab();
      const txt = (_buildTextoVisitasSup(true) || {}).texto || '';
      return { html, txt };
    }, DIA_19);

    check('a tela mostra 11h 29min', /11h 29min/.test(r.html), (r.html.match(/\d+h( \d+min)?/g)||[]).join(', '));
    check('e não mostra mais a soma inflada', !/10[0-9]h/.test(r.html));
    check('o card deixa de se chamar "tempo em campo"', !/Tempo em campo/i.test(r.html));
    check('e diz a regra na própria tela', /primeiro ao último acesso/i.test(r.html));
    check('o relatório de WhatsApp mostra o mesmo 11h 29min', /11h 29min/.test(r.txt),
      (r.txt.match(/Horas de acompanhamento.*/)||[])[0]);
    check('com a regra escrita no texto', /primeiro ao último acesso/i.test(r.txt));
    // Lê o número que está DENTRO do card rotulado "Visitas presenciais": das 12 linhas do
    // dia, 11 são remotas e só 1 é presencial. As horas unificam as duas naturezas, a
    // contagem de visitas não — é isso que esta asserção protege.
    const nPresenciais = (() => {
      const m = /<div[^>]*>(\d+)<\/div>\s*<div[^>]*>\s*Visitas presenciais/.exec(r.html);
      return m ? Number(m[1]) : null;
    })();
    check('o remoto entra nas horas mas não na contagem de visitas presenciais',
      nPresenciais === 1, 'contou ' + nPresenciais + ' presencial(is)');
    check('sem erro de JS', a.erros.length === 0, a.erros.join(' | '));
    await a.ctx.close();
  }

  // ── 3. Check-list: o mesmo dado tem que dar o mesmo número ───────────────────────
  {
    const a = await abrir(browser, CHK, () => { try { return typeof renderVisitasRelatorio === 'function' && typeof gnVisitasMinutos === 'function'; } catch(e) { return false; } });
    const r = await a.page.evaluate((DIA_19) => {
      LOJA = 'Bangu';
      usuarioLogado = { nome: 'Tiago', cargo: 'mestre' };
      _visitasRelData = DIA_19.map(v => Object.assign({ obs:'', endereco:'' }, v));
      renderVisitasRelatorio('2026-10-19', '2026-10-19');
      const el = document.getElementById('tab-visitas') || document.body;
      return { texto: el.innerText, minutos: gnVisitasMinutos(_visitasRelData) };
    }, DIA_19);
    check('o Check-list dá o mesmo total do Home', r.minutos === 689, r.minutos);
    check('e a tela dele mostra 11h 29min', /11h 29min/.test(r.texto),
      (r.texto.match(/\d+h( \d+min)?/g)||[]).join(', '));
    check('com o mesmo rótulo do Home', /Horas de acompanhamento/i.test(r.texto));
    await a.ctx.close();
  }

  await browser.close();
  console.log('\n' + ok + ' ok, ' + falhou + ' falhou');
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error('ERRO: ' + e.message); process.exit(2); });
