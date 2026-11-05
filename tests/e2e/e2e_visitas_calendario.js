// "No painel de gestão em visitas, quando abre o modal abre só parcial, e não a tela toda.
//  Queria que abrisse normal igual aos apps. Também queria que no formato do calendário
//  tivesse os nomes, folga/férias etc dentro dos quadrados, e também que tivesse os dias do
//  mês anterior quando tiver espaço no mês atual — pode ser meio apagado, mas que dê pra ver
//  as lojas visitadas e com o indicado do horário feito e se foi presencial ou remoto."
//
// Os três problemas, medidos no arquivo de origin/main:
//   1. o modal usava .picker-sheet, que é FOLHA DE BAIXO: ancorada no rodapé, teto de 82vh
//      e cantos arredondados só em cima. Dentro dela cabem Calendário, Relatório, Cobertura
//      e Provisão — conteúdo de tela inteira espremido numa gaveta;
//   2. a ausência aparecia só como EMOJI no quadrado. Emoji sozinho não diz se é folga ou
//      férias — os dois são azulados e ninguém decora 🌴 contra ✈️;
//   3. os quadrados antes do dia 1 eram `<div style="height:56px"></div>`, vazios.
//
// Dezembro/2026 é o mês do fixture de propósito: começa numa TERÇA, então sobram 2
// quadrados no começo. Novembro/2026 começa num domingo e não teria onde mostrar nada.
//
// Uma mutação sobrevive a esta suíte e é EQUIVALENTE, não buraco: trocar o
// `align-items:stretch` do overlay de volta por `flex-end` não muda nada, porque a folha
// tem `height:100dvh` e preenche o eixo vertical de qualquer jeito — alinhar ao rodapé um
// filho da altura do pai dá o mesmo topo. O `stretch` ficou como intenção escrita, não
// como o que segura o layout; quem segura é a altura.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (!c && extra !== undefined ? ' >> ' + String(extra).slice(0, 240) : '')); c ? ok++ : falhou++; };

const MES = '2026-12';
const HOJE = '2026-12-10';
const VISITAS = [
  // Cauda de novembro — é o que tem que aparecer apagado nos 2 quadrados do começo.
  { data: '2026-11-29', loja: 'Caxias', visitante: 'Rafael', hora_chegada: '14:05', hora_saida: '16:00', tipo_visita: 'remoto' },
  // Folga no mês anterior: aparece no quadrado apagado, mas NÃO pode entrar no "Folga 1 dia"
  // do resumo, que é do mês atual.
  { data: '2026-11-30', loja: 'FOLGA', visitante: 'Rafael', hora_chegada: '00:00', hora_saida: '00:00' },
  // Dezembro
  { data: '2026-12-01', loja: 'Pedreira', visitante: 'Rafael', hora_chegada: '08:30', hora_saida: '12:00', tipo_visita: 'rotina' },
  { data: '2026-12-01', loja: 'Bangu',    visitante: 'Rafael', hora_chegada: '13:20', hora_saida: '17:00', tipo_visita: 'checklist' },
  { data: '2026-12-02', loja: 'FOLGA',     visitante: 'Rafael', hora_chegada: '00:00', hora_saida: '00:00' },
  { data: '2026-12-03', loja: 'FÉRIAS',    visitante: 'Rafael', hora_chegada: '00:00', hora_saida: '00:00' },
  { data: '2026-12-04', loja: 'VIAGEM_SP', visitante: 'Rafael', hora_chegada: '00:00', hora_saida: '00:00' },
  { data: '2026-12-07', loja: 'Norte Shopping', visitante: 'Rafael', hora_chegada: '10:00', hora_saida: '12:00', tipo_visita: 'remoto' },
  { data: '2026-12-08', loja: 'Itaquera', visitante: 'Rafael', hora_chegada: 'PLAN', hora_saida: null },
  // Mesma loja duas vezes no mesmo dia, uma presencial e uma remota: vira UMA linha, com a
  // primeira hora, e PRESENCIAL manda (mesma regra do card de hoje e do relatório).
  { data: '2026-12-09', loja: 'Nova América', visitante: 'Rafael', hora_chegada: '09:00', hora_saida: '11:00', tipo_visita: 'rotina' },
  { data: '2026-12-09', loja: 'Nova América', visitante: 'Rafael', hora_chegada: '15:00', hora_saida: '16:00', tipo_visita: 'remoto' },
  { data: '2026-12-09', loja: 'Boulevard',    visitante: 'Rafael', hora_chegada: '12:00', hora_saida: '14:00', tipo_visita: 'rotina' },
  { data: '2026-12-09', loja: 'Campo Grande', visitante: 'Rafael', hora_chegada: '15:30', hora_saida: '17:00', tipo_visita: 'rotina' },
  { data: '2026-12-09', loja: 'Pedreira',     visitante: 'Rafael', hora_chegada: '18:00', hora_saida: '19:00', tipo_visita: 'remoto' },
];

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 414, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, HOJE + 'T12:00:00');
  const janelas = [];
  await ctx.route('**/rest/v1/**', async r => {
    const u = decodeURIComponent(r.request().url());
    const json = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/gn_chk_visitas/.test(u)) {
      const g = /data=gte\.([\d-]+)/.exec(u), l = /data=lte\.([\d-]+)/.exec(u);
      const de = g ? g[1] : '0000-00-00', ate = l ? l[1] : '9999-99-99';
      janelas.push(de + '..' + ate);
      return json(VISITAS.filter(v => v.data >= de && v.data <= ate));
    }
    return json([]);
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(String(e.message)));
  await page.goto('file://' + HOME);
  try {
    await page.waitForFunction(() => {
      try { return typeof _renderVisCalendarioTab === 'function' && typeof _carregarVisCalendario === 'function'; }
      catch (e) { return false; }
    }, { timeout: 25000 });
  } catch (e) { console.log('FALHOU: o Painel não carregou'); console.log('\n0 OK, 25 falhou'); await browser.close(); process.exit(1); }

  const montar = () => page.evaluate(async (mes) => {
    _visSupSelecionado = 'Rafael';
    _visSupView = 'calendario';
    _visCalMes = mes;
    _visCalDiaSel = null;
    _visSupList = [{ nome: 'Rafael', cargo: 'supervisor' }];
    session = { nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    document.getElementById('visitas-sup-overlay').style.display = 'flex';
    await _carregarVisCalendario();
    _renderVisitasSupContent();
    const sheet = document.querySelector('#visitas-sup-overlay .picker-sheet');
    const ov = document.getElementById('visitas-sup-overlay');
    // Espera a animação de entrada terminar: ela começa em translateY(100%), e medir no
    // meio dela devolvia o topo lá embaixo — a animação, não o layout.
    try { await Promise.all(sheet.getAnimations().map(a => a.finished)); } catch (e) {}
    await new Promise(r2 => requestAnimationFrame(() => requestAnimationFrame(r2)));
    const r = sheet.getBoundingClientRect();
    return {
      html: document.getElementById('visitas-sup-content').innerHTML,
      sheet: { topo: Math.round(r.top), altura: Math.round(r.height), largura: Math.round(r.width),
               raio: getComputedStyle(sheet).borderTopLeftRadius },
      tela: { altura: window.innerHeight, largura: window.innerWidth },
      alinhamento: getComputedStyle(ov).alignItems,
    };
  }, MES);

  const d = await montar();
  const txt = String(d.html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  // Só a GRADE. O "Resumo do mês" logo abaixo repete "Folga", "Férias" e os nomes das
  // lojas — medir no HTML inteiro fazia as asserções do QUADRADO passarem em origin/main,
  // onde o quadrado tinha só o emoji. Foi a contraprova que pegou.
  const grade = d.html.split('Resumo do mês')[0];
  const txtGrade = grade.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

  // ── 1. O modal ocupa a tela ───────────────────────────────────────────────────────────
  check('o modal começa no topo da tela, não colado no rodapé',
    d.sheet.topo <= 2, JSON.stringify(d.sheet));
  check('e vai até embaixo: ocupa a altura toda',
    d.sheet.altura >= d.tela.altura - 2, JSON.stringify({ sheet: d.sheet.altura, tela: d.tela.altura }));
  check('ocupa a largura toda, sem o teto de 760px',
    d.sheet.largura >= d.tela.largura - 2, JSON.stringify({ sheet: d.sheet.largura, tela: d.tela.largura }));
  check('deixou de ser folha de baixo (sem canto arredondado no topo)',
    parseFloat(d.sheet.raio) === 0, d.sheet.raio);

  // ── 2. Os nomes dentro dos quadrados ──────────────────────────────────────────────────
  check('folga aparece escrita no quadrado, não só o emoji', /Folga/.test(txtGrade), txtGrade.slice(0, 220));
  check('férias também', /Férias/.test(txtGrade), txtGrade.slice(0, 220));
  check('e viagem também', /Viagem SP|Viag/.test(txtGrade), txtGrade.slice(0, 220));
  check('o nome da loja visitada está no quadrado', /Pedreira/.test(txtGrade) && /Bangu/.test(txtGrade));

  // ── 3. Horário e presencial/remoto ────────────────────────────────────────────────────
  check('o horário da visita aparece no quadrado', /08:30/.test(txtGrade) && /13:20/.test(txtGrade), txtGrade.slice(0, 300));
  check('visita presencial leva o selo 📍', /📍/.test(grade));
  check('visita remota leva o selo 💻', /💻/.test(grade));
  const dia7 = /10:00/.test(txtGrade);
  check('a loja visitada remotamente mostra hora e selo de remoto', dia7);

  // Mesma loja duas vezes no dia: uma linha, a primeira hora, e presencial manda.
  const dia9 = (d.html.match(/Nova América[\s\S]{0,220}?<\/div>\s*<\/div>/) || [''])[0];
  check('mesma loja duas vezes no dia vira uma linha só, com a primeira hora',
    (grade.match(/>Nova América</g) || []).length === 1 && /09:00/.test(dia9),
    JSON.stringify((grade.match(/>Nova América</g) || []).length) + ' ' + dia9.replace(/<[^>]*>/g, ' ').slice(0, 120));
  check('e presencial manda sobre o acesso remoto do mesmo dia',
    /📍/.test(dia9) && !/💻/.test(dia9), dia9.replace(/<[^>]*>/g, ' ').slice(0, 160));

  // ── 4. A cauda do mês anterior ────────────────────────────────────────────────────────
  check('a consulta vai buscar os dias do mês anterior que entram na grade',
    janelas.length > 0 && janelas[janelas.length - 1].startsWith('2026-11-'), JSON.stringify(janelas));
  check('os quadrados do começo deixaram de ser vazios: mostram 29 e 30 de novembro',
    /mês anterior/.test(d.html) && />29</.test(d.html) && />30</.test(d.html));
  const iGrade = d.html.indexOf('repeat(7,1fr);gap:3px');
  const iPrimeiroDia = d.html.indexOf('_mostrarDiaVisCal');
  const cauda = (iGrade >= 0 && iPrimeiroDia > iGrade) ? d.html.slice(iGrade, iPrimeiroDia) : '';
  check('com a loja visitada, o horário e o selo — apagados, mas legíveis',
    /Caxias/.test(cauda) && /14:05/.test(cauda),
    cauda.replace(/<[^>]*>/g, ' ').slice(0, 200));
  check('e o acesso remoto do mês anterior continua marcado como remoto', /💻/.test(cauda));
  check('a folga do mês anterior também aparece escrita no quadrado apagado',
    /Folga/.test(cauda), cauda.replace(/<[^>]*>/g, ' ').slice(0, 200));
  check('o apagado é só visual: opacidade baixa', /opacity:\.45/.test(d.html));

  // ── 5. O que veio de fora não pode contaminar o mês ───────────────────────────────────
  // A consulta passou a trazer novembro; se ele entrasse no resumo, o mês inflaria.
  const resumo = txt.split('Resumo do mês')[1] || '';
  check('o resumo do mês não conta as visitas do mês anterior',
    /Pedreira\s*2 visitas/.test(txt) && !/Caxias/.test(resumo), resumo.slice(0, 220));
  check('nem a ausência do mês anterior: folga continua 1 dia, não 2',
    /Folga\s*1 dia/.test(resumo) && !/Folga\s*2 dias/.test(resumo), resumo.slice(0, 220));

  // No celular (414px) um teto de 760px não limita nada: a mutação que o devolvia passava
  // sem ser notada. O Painel também é usado no computador, e é lá que o teto apareceria.
  const largo = await ctx.newPage();
  await largo.setViewportSize({ width: 1280, height: 900 });
  await largo.goto('file://' + HOME);
  await largo.waitForFunction(() => typeof _renderVisCalendarioTab === 'function', { timeout: 25000 });
  const noLargo = await largo.evaluate(async (mes) => {
    _visSupSelecionado = 'Rafael'; _visSupView = 'calendario'; _visCalMes = mes;
    _visSupList = [{ nome: 'Rafael', cargo: 'supervisor' }];
    session = { nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
    document.getElementById('visitas-sup-overlay').style.display = 'flex';
    await _carregarVisCalendario(); _renderVisitasSupContent();
    const sheet = document.querySelector('#visitas-sup-overlay .picker-sheet');
    try { await Promise.all(sheet.getAnimations().map(a => a.finished)); } catch (e) {}
    const r = sheet.getBoundingClientRect();
    return { largura: Math.round(r.width), tela: window.innerWidth, altura: Math.round(r.height) };
  }, MES);
  await largo.close();
  check('no computador também ocupa a tela toda, sem teto de largura',
    noLargo.largura >= noLargo.tela - 2, JSON.stringify(noLargo));

  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
