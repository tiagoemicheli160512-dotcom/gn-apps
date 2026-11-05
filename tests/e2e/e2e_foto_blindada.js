// "Tentar medir essa questão das fotos, no check-list, tentar blindar a gravação."
//
// O que foi MEDIDO no banco antes de mexer em código:
//   578 fotos enviadas ao Storage pela pasta checklist-item; 410 referenciadas por alguma
//   linha; 168 (29%) sem NENHUMA linha apontando pra elas; 1 linha apontando pra objeto
//   que não existe. Três caminhos de perda, os três reproduzidos no navegador:
//
//   1. handleFoto chamava só autoSave() (localStorage) e já dizia "📷 Foto salva!".
//      A referência só ia ao servidor no tick de 30s — fechou o app antes, foto órfã.
//   2. mergeState fazia {...local, ...remoto}: a linha do servidor ainda trazia
//      fotoBase64:'' e APAGAVA a foto tirada segundos antes.
//   3. saveAll mesclava setor a setor: o setor deste aparelho substituía o do servidor
//      inteiro, levando junto a foto que o outro aparelho tinha acabado de tirar.
//
// A regra do conserto é uma só, nos dois merges: o lado que não tem foto nunca apaga o
// lado que tem — exceto a intenção deste aparelho enquanto o servidor não confirma.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
const SB_LIB = require('fs').readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 400)); };
const URLF = 'https://x.supabase.co/storage/v1/object/public/gn-fotos/checklist-item/f.jpeg';

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver', '9999'); } catch (e) {} });
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status:200, contentType:'application/javascript', body:SB_LIB }));
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status:200, contentType:'application/json', body:'[]' }));
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e)));
  const chamadas = [];
  page.on('request', q => { if (/rest\/v1\/checklist_diario/.test(q.url())) chamadas.push(Date.now()); });
  await page.goto('file://' + CHK);
  await page.waitForFunction(() => { try {
    return typeof handleFoto === 'function' && typeof deleteFotoChecklist === 'function'
        && typeof mergeState === 'function' && typeof saveAll === 'function'
        && typeof _fotoDoMerge === 'function' && typeof _fotoPendente === 'object';
  } catch (e) { return false; } }, { timeout: 25000 });
  await page.evaluate(() => { hideLogin(); LOJA='Bangu'; state.data='2026-10-25';
    usuarioLogado={id:1,nome:'T',cargo:'gerente',loja:'BANGU'}; });

  const SETOR = await page.evaluate(() => Object.keys(SETORES_ABERTURA)[0]);
  const zerar = () => page.evaluate(() => { _fotoPendente.clear();
    state.abertura={}; state.checklist={}; state.fechamento={}; });

  // ── 1. A foto recém-tirada não é apagada pela sincronização ────────────────────────
  await zerar();
  const vivo = await page.evaluate(({S,U}) => {
    state.abertura[S] = { 0: { checked:true, naoConforme:false, problema:'', fotoBase64:U, fotoName:'nova.jpg' } };
    _marcarFotoPendente(_chaveFoto('abertura', S, 0), 'fotoBase64');
    mergeState({ abertura: { [S]: { 0: { checked:true, naoConforme:false, problema:'obs do servidor', fotoBase64:'', fotoName:'' } } } });
    return { foto: state.abertura[S][0].fotoBase64, nome: state.abertura[S][0].fotoName,
             problema: state.abertura[S][0].problema };
  }, {S:SETOR,U:URLF});
  check('foto tirada agora sobrevive a uma sincronização do servidor', vivo.foto === URLF, JSON.stringify(vivo));
  check('e o nome do arquivo vai junto, não fica órfão do campo', vivo.nome === 'nova.jpg', vivo.nome);
  check('os OUTROS campos continuam vindo do servidor, como vinham',
    vivo.problema === 'obs do servidor', vivo.problema);

  // ── 2. Sem pendência, a foto do servidor entra (não quebrei o caminho normal) ──────
  await zerar();
  const doServidor = await page.evaluate(({S,U}) => {
    state.abertura[S] = { 1: { checked:true, naoConforme:false, problema:'', fotoBase64:'', fotoName:'' } };
    mergeState({ abertura: { [S]: { 1: { checked:true, naoConforme:false, problema:'', fotoBase64:U, fotoName:'serv.jpg' } } } });
    return state.abertura[S][1];
  }, {S:SETOR,U:URLF});
  check('foto que só o servidor tem continua entrando neste aparelho', doServidor.fotoBase64 === URLF, JSON.stringify(doServidor));
  check('e traz o nome dela', doServidor.fotoName === 'serv.jpg', doServidor.fotoName);

  // ── 3. Exclusão de propósito NÃO volta do servidor ────────────────────────────────
  await zerar();
  const apagada = await page.evaluate(({S,U}) => {
    state.abertura[S] = { 2: { checked:true, naoConforme:false, problema:'', fotoBase64:'', fotoName:'' } };
    _marcarFotoPendente(_chaveFoto('abertura', S, 2), 'fotoBase64');           // acabei de excluir aqui
    mergeState({ abertura: { [S]: { 2: { checked:true, naoConforme:false, problema:'', fotoBase64:U, fotoName:'antiga.jpg' } } } });
    return state.abertura[S][2].fotoBase64;
  }, {S:SETOR,U:URLF});
  check('foto excluída de propósito não volta na sincronização seguinte', apagada === '', apagada);

  // ── 4. Dois aparelhos: o salvamento de B não apaga a foto de A ────────────────────
  await zerar();
  const dois = await page.evaluate(async ({S,U}) => {
    const servidor = { abertura: { [S]: {
      0: { checked:true, naoConforme:false, problema:'', fotoBase64:U, fotoName:'A.jpg' },
      1: { checked:true, naoConforme:false, problema:'', fotoBase64:'', fotoName:'' } } }, dinheiro_caixa: 0 };
    state.abertura = { [S]: {                       // B carregou antes da foto de A
      0: { checked:true, naoConforme:false, problema:'anotei aqui', fotoBase64:'', fotoName:'' },
      1: { checked:true, naoConforme:false, problema:'', fotoBase64:'', fotoName:'' } } };
    let pl = null; const orig = sb.from;
    sb.from = t => t === 'checklist_diario'
      ? { upsert: async p => { pl = p; return { error:null }; },
          select: () => ({ eq: function(){ return this; }, maybeSingle: async () => ({ data: servidor }) }) }
      : orig(t);
    let r; try { r = await saveAll({ silencioso:true }); } finally { sb.from = orig; }
    const item = pl && pl.abertura && pl.abertura[S] && pl.abertura[S][0];
    return { retorno: r, foto: item && item.fotoBase64, problema: item && item.problema };
  }, {S:SETOR,U:URLF});
  check('o salvamento deste aparelho NÃO apaga a foto que o outro tirou', dois.foto === URLF, JSON.stringify(dois));
  check('e o texto digitado AQUI continua vencendo, como vencia', dois.problema === 'anotei aqui', dois.problema);
  check('saveAll devolve true quando a linha chega ao servidor', dois.retorno === true, String(dois.retorno));

  // ── 5. O QUE MAIS IMPORTA: tirar foto grava no servidor, não espera 30s ───────────
  await zerar();
  chamadas.length = 0;
  const tirou = await page.evaluate(async ({S}) => {
    window.gnUploadFotoStorage = async () => 'https://x.supabase.co/storage/v1/object/public/gn-fotos/checklist-item/agora.jpeg';
    let pl = null, upserts = 0; const orig = sb.from;
    sb.from = t => t === 'checklist_diario'
      ? { upsert: async p => { pl = p; upserts++; return { error:null }; },
          select: () => ({ eq: function(){ return this; }, maybeSingle: async () => ({ data: { dinheiro_caixa:0 } }) }) }
      : orig(t);
    const toasts = []; const origToast = window.showToast;
    window.showToast = function(m,t){ toasts.push(String(m)); return origToast.apply(this, arguments); };
    const bin = Uint8Array.from(atob('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='), c=>c.charCodeAt(0));
    handleFoto('abertura', S, 3, { files: [new File([bin], 'foto.jpg', { type:'image/jpeg' })] });
    await new Promise(r => setTimeout(r, 2500));
    sb.from = orig; window.showToast = origToast;
    const item = pl && pl.abertura && pl.abertura[S] && pl.abertura[S][3];
    return { foiAoServidor: !!(item && item.fotoBase64), upserts, toasts,
             noEstado: !!(state.abertura[S] && state.abertura[S][3] && state.abertura[S][3].fotoBase64) };
  }, {S:SETOR});
  check('tirar foto manda a referência pro servidor na hora', tirou.foiAoServidor === true, JSON.stringify(tirou));
  check('e a foto fica no estado do app', tirou.noEstado === true, JSON.stringify(tirou));
  check('o toast diz que foi pro SERVIDOR, não só "salva"',
    tirou.toasts.some(t => /Foto salva no servidor/.test(t)), JSON.stringify(tirou.toasts));
  check('e não aparecem dois toasts de salvamento em sequência',
    !tirou.toasts.some(t => /Salvo no servidor!/.test(t)), JSON.stringify(tirou.toasts));
  check('a linha foi gravada uma vez só, não uma por campo', tirou.upserts === 1, String(tirou.upserts));

  // ── 6. Sem conexão: guarda aqui e DIZ que guardou aqui ───────────────────────────
  await zerar();
  const offline = await page.evaluate(async ({S}) => {
    window.gnUploadFotoStorage = async () => 'https://x.supabase.co/storage/v1/object/public/gn-fotos/checklist-item/off.jpeg';
    const orig = sb.from;
    sb.from = t => t === 'checklist_diario'
      ? { upsert: async () => ({ error:null }),
          select: () => ({ eq: function(){ return this; }, maybeSingle: async () => { throw new Error('sem rede'); } }) }
      : orig(t);
    const toasts = []; const origToast = window.showToast;
    window.showToast = function(m){ toasts.push(String(m)); return origToast.apply(this, arguments); };
    const bin = Uint8Array.from(atob('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='), c=>c.charCodeAt(0));
    handleFoto('abertura', S, 4, { files: [new File([bin], 'foto.jpg', { type:'image/jpeg' })] });
    await new Promise(r => setTimeout(r, 2000));
    sb.from = orig; window.showToast = origToast;
    return { noEstado: !!(state.abertura[S] && state.abertura[S][4] && state.abertura[S][4].fotoBase64),
             aindaPendente: _fotoPendente.has(_chaveFoto('abertura', S, 4) + '#fotoBase64'), toasts };
  }, {S:SETOR});
  check('sem conexão a foto não se perde: fica no aparelho', offline.noEstado === true, JSON.stringify(offline));
  check('e o app NÃO mente dizendo que foi pro servidor',
    offline.toasts.some(t => /sobe sozinha quando a conex/.test(t)) &&
    !offline.toasts.some(t => /no servidor!/.test(t)), JSON.stringify(offline.toasts));
  check('a foto continua marcada como pendente, pra não ser apagada por uma sincronização',
    offline.aindaPendente === true, JSON.stringify(offline));

  // ── 7. Confirmado no servidor, a pendência sai (senão a exclusão de outro aparelho
  //      nunca mais chegaria aqui) ─────────────────────────────────────────────────
  const limpou = await page.evaluate(async ({S}) => {
    _marcarFotoPendente(_chaveFoto('abertura', S, 9), 'fotoBase64');
    const orig = sb.from;
    sb.from = t => t === 'checklist_diario'
      ? { upsert: async () => ({ error:null }),
          select: () => ({ eq: function(){ return this; }, maybeSingle: async () => ({ data: { dinheiro_caixa:0 } }) }) }
      : orig(t);
    let r; try { r = await saveAll({ silencioso:true }); } finally { sb.from = orig; }
    return { r, tamanho: _fotoPendente.size };
  }, {S:SETOR});
  check('salvou no servidor: as pendências de foto são liberadas', limpou.tamanho === 0, JSON.stringify(limpou));

  // ── 7b. A corrida: o tick de 30s em voo não pode liberar a foto que ele não levou ─
  const corrida = await page.evaluate(async ({S}) => {
    _fotoPendente.clear();
    _marcarFotoPendente(_chaveFoto('abertura', S, 20), 'fotoBase64');          // foto que ESTE envio leva
    const orig = sb.from;
    sb.from = t => t === 'checklist_diario'
      ? { upsert: async () => {
            // A foto chega DEPOIS do payload montado — este envio não a carrega. Injetar
            // antes disto (na leitura do servidor) não seria corrida nenhuma: ali ela
            // ainda entra no payload, e liberá-la é o certo.
            _marcarFotoPendente(_chaveFoto('abertura', S, 21), 'fotoBase64');
            return { error: null };
          },
          select: () => ({ eq: function(){ return this; },
                           maybeSingle: async () => ({ data: { dinheiro_caixa: 0 } }) }) }
      : orig(t);
    try { await saveAll({ silencioso:true }); } finally { sb.from = orig; }
    return { levada: _fotoPendente.has(_chaveFoto('abertura', S, 20) + '#fotoBase64'),
             novaAindaPendente: _fotoPendente.has(_chaveFoto('abertura', S, 21) + '#fotoBase64') };
  }, {S:SETOR});
  check('a pendência que o envio levou é liberada', corrida.levada === false, JSON.stringify(corrida));
  check('mas a foto tirada COM o save em voo continua protegida',
    corrida.novaAindaPendente === true, JSON.stringify(corrida));

  // ── 8. Trocar de dia zera as pendências — a chave é de UM dia ────────────────────
  const trocouDia = await page.evaluate(async ({S}) => {
    _marcarFotoPendente(_chaveFoto('abertura', S, 0), 'fotoBase64');
    const sel = document.getElementById('data-select') || { value:'' }; sel.value = '2026-10-20';
    try { await onDataChange('2026-10-20'); } catch (e) {}
    return _fotoPendente.size;
  }, {S:SETOR});
  check('trocar o dia zera as pendências de foto', trocouDia === 0, String(trocouDia));

  // ── 9. Cota cheia: o base64 sai, a URL FICA ─────────────────────────────────────
  const cota = await page.evaluate(({S,U}) => {
    state.data = '2026-10-25';
    state.abertura = { [S]: {
      0: { checked:true, fotoBase64:U, fotoName:'url.jpg' },
      1: { checked:true, fotoBase64:'data:image/jpeg;base64,'+'A'.repeat(50000), fotoName:'pesada.jpg' } } };
    state.manutencao = [{ id:1, fotoBase64:U }, { id:2, fotoBase64:'data:image/jpeg;base64,'+'B'.repeat(50000) }];
    let enxuto = null; const orig = window.gnGuardar; let n = 0;
    window.gnGuardar = function(k, v){ n++;
      if(n === 1) return 'cheio';                       // força o caminho da cota cheia
      if(String(k).indexOf('week') < 0) enxuto = JSON.parse(v);
      return 'ok'; };
    try { autoSave(); } finally { window.gnGuardar = orig; }
    return { url: enxuto && enxuto.abertura[S][0].fotoBase64,
             base64: enxuto && enxuto.abertura[S][1].fotoBase64,
             manutUrl: enxuto && enxuto.manutencao[0].fotoBase64,
             manutB64: enxuto && enxuto.manutencao[1].fotoBase64 };
  }, {S:SETOR,U:URLF});
  check('cota cheia: a URL da foto é PRESERVADA na cópia local', cota.url === URLF, JSON.stringify(cota).slice(0,200));
  check('e o base64 pesado continua saindo, que é o que abria espaço', cota.base64 === '', String(cota.base64).slice(0,40));
  check('mesma regra na manutenção: URL fica, base64 sai',
    cota.manutUrl === URLF && cota.manutB64 === '', JSON.stringify({u:cota.manutUrl,b:String(cota.manutB64).slice(0,20)}));

  // ── 10. Sem foto nenhuma, nada muda ─────────────────────────────────────────────
  await zerar();
  const semFoto = await page.evaluate(({S}) => {
    state.abertura[S] = { 0: { checked:false, naoConforme:false, problema:'', fotoBase64:'', fotoName:'' } };
    mergeState({ abertura: { [S]: { 0: { checked:true, naoConforme:false, problema:'', fotoBase64:'', fotoName:'' } } } });
    return state.abertura[S][0];
  }, {S:SETOR});
  check('item sem foto nenhuma mescla como sempre mesclou',
    semFoto.checked === true && semFoto.fotoBase64 === '', JSON.stringify(semFoto));

  // ══════════════════════════════════════════════════════════════════════════════════
  // OS OUTROS CAMPOS DE FOTO. Medido por pasta do Storage, antes de mexer:
  //   validades            584 orfas de 1306 (45%) — a maior perda de todas
  //   checklist-manutencao  11 de 62 (18%)
  //   checklist-despesas     6 de 7
  // Mesma causa, campos diferentes: valFoto/valFotoEm no item, fotoBase64 na lista de
  // manutencao, foto na lista de despesas.
  // ══════════════════════════════════════════════════════════════════════════════════

  // ── 11. Validades: a foto do setor sobrevive, e o DIA viaja colado nela ───────────
  await zerar();
  const val = await page.evaluate(({S,U}) => {
    state.abertura[S] = { 5: { checked:true, valFoto:U, valFotoEm:'2026-10-25' } };
    _marcarFotoPendente(_chaveFoto('abertura', S, 5), 'valFoto');
    mergeState({ abertura: { [S]: { 5: { checked:true, valFoto:'', valFotoEm:'' } } } });
    return state.abertura[S][5];
  }, {S:SETOR,U:URLF});
  check('foto de validade recém-tirada sobrevive à sincronização', val.valFoto === URLF, JSON.stringify(val));
  check('e o DIA dela vem junto — separado, a tela pediria foto nova tendo uma',
    val.valFotoEm === '2026-10-25', JSON.stringify(val));

  // ── 12. E nunca fica meia: URL de um lado, dia do outro ──────────────────────────
  await zerar();
  const naoMistura = await page.evaluate(({S,U}) => {
    state.abertura[S] = { 6: { checked:true, valFoto:'', valFotoEm:'' } };
    mergeState({ abertura: { [S]: { 6: { checked:true, valFoto:U, valFotoEm:'2026-10-20' } } } });
    return state.abertura[S][6];
  }, {S:SETOR,U:URLF});
  check('foto de validade que só o servidor tem entra com o dia certo',
    naoMistura.valFoto === URLF && naoMistura.valFotoEm === '2026-10-20', JSON.stringify(naoMistura));

  // ── 13. Validades grava no servidor na hora ──────────────────────────────────────
  const valServidor = await page.evaluate(async ({S}) => {
    let pl = null; const orig = sb.from;
    sb.from = t => t === 'checklist_diario'
      ? { upsert: async p => { pl = p; return { error:null }; },
          select: () => ({ eq: function(){ return this; }, maybeSingle: async () => ({ data:{ dinheiro_caixa:0 } }) }) }
      : orig(t);
    state.abertura[S] = { 7: { checked:true, valFoto:'https://x/gn-fotos/validades/v.jpeg', valFotoEm:'2026-10-25' } };
    _marcarFotoPendente(_chaveFoto('abertura', S, 7), 'valFoto');
    try { await saveAll({ silencioso:true }); } finally { sb.from = orig; }
    const it = pl && pl.abertura && pl.abertura[S] && pl.abertura[S][7];
    return { foto: it && it.valFoto, dia: it && it.valFotoEm };
  }, {S:SETOR});
  check('a foto de validade entra no que é gravado no servidor',
    /validades\/v\.jpeg/.test(valServidor.foto || ''), JSON.stringify(valServidor));

  // ── 14. Manutenção: a lista do servidor não leva a foto deste aparelho junto ─────
  const manut = await page.evaluate(({U}) => {
    state.manutencao = [{ id: 77, descricao:'pia', fotoBase64:U, fotoName:'nova.jpg' },
                        { id: 88, descricao:'luz', fotoBase64:'', fotoName:'' }];
    _marcarFotoPendente(_chaveFoto('manutencao','lista',77), 'fotoBase64');
    mergeState({ manutencao: [{ id: 77, descricao:'pia (editado no servidor)', fotoBase64:'', fotoName:'' },
                              { id: 88, descricao:'luz', fotoBase64:'', fotoName:'' }] });
    const m = state.manutencao.find(x => x.id === 77);
    return { foto: m && m.fotoBase64, desc: m && m.descricao, qtd: state.manutencao.length };
  }, {U:URLF});
  check('foto de manutenção recém-tirada sobrevive à lista que vem do servidor',
    manut.foto === URLF, JSON.stringify(manut));
  check('e o resto do item continua vindo do servidor, como vinha',
    /editado no servidor/.test(manut.desc || ''), manut.desc);

  // ── 15. Casa por id, não por posição ────────────────────────────────────────────
  const porId = await page.evaluate(({U}) => {
    state.manutencao = [{ id: 1, fotoBase64:U }, { id: 2, fotoBase64:'' }];
    _marcarFotoPendente(_chaveFoto('manutencao','lista',1), 'fotoBase64');
    // O servidor devolve na ordem trocada, com um item novo no meio.
    mergeState({ manutencao: [{ id: 9, fotoBase64:'' }, { id: 2, fotoBase64:'' }, { id: 1, fotoBase64:'' }] });
    return state.manutencao.map(x => ({ id:x.id, f:x.fotoBase64 }));
  }, {U:URLF});
  check('a foto segue o ID, não a posição na lista',
    porId.find(x => x.id === 1).f === URLF && porId.find(x => x.id === 2).f === '',
    JSON.stringify(porId));

  // ── 16. Despesa: o outro aparelho não perde a foto no salvamento deste ──────────
  const desp = await page.evaluate(async ({U}) => {
    state.despesas = [{ id: 5, descricao:'gás', valor:100, foto:'' }];   // este aparelho, sem foto
    let pl = null; const orig = sb.from;
    sb.from = t => t === 'checklist_diario'
      ? { upsert: async p => { pl = p; return { error:null }; },
          select: () => ({ eq: function(){ return this; }, maybeSingle: async () => ({
            data: { dinheiro_caixa:0, despesas: [{ id:5, descricao:'gás', valor:100, foto:U }] } }) }) }
      : orig(t);
    try { await saveAll({ silencioso:true }); } finally { sb.from = orig; }
    const d = pl && Array.isArray(pl.despesas) && pl.despesas.find(x => x.id === 5);
    return { foto: d && d.foto, valor: d && d.valor };
  }, {U:URLF});
  check('a foto da despesa que o outro aparelho anexou não é apagada ao salvar',
    desp.foto === URLF, JSON.stringify(desp));

  // ── 17. Campo que nenhum lado tem não é inventado ───────────────────────────────
  await zerar();
  const naoInventa = await page.evaluate(({S}) => {
    state.abertura[S] = { 8: { checked:true, naoConforme:false } };
    mergeState({ abertura: { [S]: { 8: { checked:true, naoConforme:true } } } });
    return Object.keys(state.abertura[S][8]).sort().join(',');
  }, {S:SETOR});
  check('item sem campo de foto nenhum não ganha campos vazios inventados',
    naoInventa === 'checked,naoConforme', naoInventa);

  // ── 18. Documento de funcionário: a fila de Gorjetas esvazia na hora ─────────────
  // Medido: 4 das 74 enviadas pra comissoes-docs-func sem ninguém apontando. Caminho
  // diferente dos outros (fila própria, flush a cada 25s), mesma janela.
  const doc = await page.evaluate(async () => {
    let flushes = 0;
    const orig = window.flushComissoesOps;
    window.flushComissoesOps = function(){ flushes++; comissoesOpsQueue.length = 0; return Promise.resolve(); };
    const toasts = []; const origToast = window.showToast;
    window.showToast = function(m){ toasts.push(String(m)); return origToast.apply(this, arguments); };
    comissoesWD = { funcs: [{ nome:'Ana', docs:{} }] };
    comissoesWeekIdx = 0;
    try {
      // Reproduz o trecho do handler: agenda a operação e esvazia a fila.
      scheduleComissoesOp(wd => wd);
      const antes = comissoesOpsQueue.length;
      await flushComissoesOps();
      return { antes, flushes, depois: comissoesOpsQueue.length, toasts };
    } finally { window.flushComissoesOps = orig; window.showToast = origToast; }
  });
  check('a operação do documento é enfileirada', doc.antes >= 1, JSON.stringify(doc));
  check('e a fila é esvaziada na hora, não no tick de 25s',
    doc.flushes === 1 && doc.depois === 0, JSON.stringify(doc));

  const docReentrante = await page.evaluate(async () => {
    // flushComissoesOps real: chamar duas vezes seguidas não pode duplicar o PATCH.
    comissoesWD = { funcs: [{ nome:'Ana', docs:{} }] }; comissoesWeekIdx = 0;
    comissoesOpsQueue.length = 0;
    let patches = 0;
    const origFetch = window.fetch;
    window.fetch = async (u, o) => {
      const url = String(u);
      if(/gn_comissoes/.test(url) && o && /PATCH|POST/.test(o.method||'')) patches++;
      return { ok:true, status:200, json: async () => (/gn_comissoes/.test(url) ? [{ all_data:{} }] : []),
               text: async () => '[]' };
    };
    try {
      scheduleComissoesOp(wd => wd);
      await Promise.all([flushComissoesOps(), flushComissoesOps()]);
      return { patches, restou: comissoesOpsQueue.length };
    } catch(e) { return { erro: String(e) }; } finally { window.fetch = origFetch; }
  });
  check('esvaziar duas vezes em paralelo não duplica a gravação',
    docReentrante.patches <= 1, JSON.stringify(docReentrante));

  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log('\n' + CHK);
  console.log(ok + ' ok, ' + falhou + ' falhou');
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error('ERRO: ' + e.message); process.exit(2); });
