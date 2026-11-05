/* gn-presenca.js — a trava de presença na loja, compartilhada por TODOS os apps.
   ───────────────────────────────────────────────────────────────────────────────────────
   "Travar todos. Pra não ter saída."

   Nasceu dentro de gn-home.html e saiu de lá no dia em que precisou valer em todo canto.
   Os 13 apps dividem a MESMA sessão (gn_session_v1), então uma trava só na Home era uma
   porta destrancada: atalho direto pro Caixa na tela do celular entrava sem passar por
   ela. Repetir a trava em 13 arquivos seria pior — 13 cópias de uma regra que decide quem
   entra no app divergem em meses, e a que divergir é a que vira a saída.

   COMO UM APP USA:
       gnPresencaGuardiao({
         sbUrl, sbKey,
         sessao:  { id, nome, cargo, loja, permissoes },
         aoSair:  doLogout,        // cada app desloga do seu jeito
         aoConfirmar: fn,          // opcional: quem tem tela de presença redesenha
       });

   Chamar é seguro em qualquer app e a qualquer momento: a trava só aparece pra gerente e
   sub-gerente, nas lojas da regra, uma vez por dia — e some sozinha no resto.

   O QUE ELA PERGUNTA, e por quê, está documentado no bloco PRESENÇA NA LOJA mais abaixo.

   DEPENDÊNCIAS: gn-lojas-config.js (GN_LOJAS, cargos, GN_PRESENCA_*) e
   gn-comissoes-calendario.js (COMISSOES_CAL). Sem o calendário carregado a trava não
   aparece — falha aberto, como tudo aqui.                                                */

// Config e sessão do app que chamou. Prefixo _gnPres em tudo: este arquivo entra no mesmo
// escopo global de 13 apps, e três deles já usam `S` como o próprio estado.
let _gnPresCfg = { sbUrl: '', sbKey: '', aoSair: null, aoConfirmar: null };
let _gnPresU   = null;

// escapeHtml existe na maioria dos apps, mas não em todos — e esta trava desenha nome de
// gente vindo do banco. Fallback próprio, pra não depender de quem carregou o quê.
function _gnEsc3(s) {
  if (window.escapeHtml) return window.escapeHtml(String(s == null ? '' : s));
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function _gnHoraAgoraHM() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
// Mesmos conjuntos da Escala de Hoje (ESCALA_HOME_* em gn-home.html): o vocabulário de
// status é um só na rede, e duas listas é como as telas passam a discordar sobre o que é
// presença.
const GN_PRESENTE_SET = new Set(['PRESENTE', 'HORISTA', 'JOVEM APRENDIZ', 'MEIO TURNO']);
const GN_STATUS_LABEL = { PRESENTE: 'Presente', 'MEIO TURNO': 'Meio turno', HORISTA: 'Horista', 'JOVEM APRENDIZ': 'Jv.Aprendiz', FOLGA: 'Folga', 'FÉRIAS': 'Férias', AFASTAMENTO: 'Afastamento', 'BANCO DE HORAS': 'Bco.H.', FALTA: 'Falta', ATESTADO: 'Atestado', JUSTIFICATIVA: 'Justificativa', 'SUSPENSÃO': 'Suspensão', 'NÃO TRABALHADO': 'Não trab.' };

// A loja chega com grafia diferente conforme o app (userKey, chkKey, com acento ou sem).
// GN_LOJAS é a fonte canônica; aqui só se traduz pra chave da escala e se confere se a
// loja é conhecida.
function _gnComKey(loja) {
  const l = (window.GN_LOJAS || []).find(x =>
    [x.userKey, x.chkKey, x.comKey].some(k => String(k || '').trim().toUpperCase() === String(loja || '').trim().toUpperCase()));
  return l ? l.comKey : loja;
}
function _gnLojaConhecida(loja) {
  return !!(window.GN_LOJAS || []).find(x =>
    [x.userKey, x.chkKey, x.comKey].some(k => String(k || '').trim().toUpperCase() === String(loja || '').trim().toUpperCase()));
}

// ── ESCALA: SEMANA, DIA E OS FUNCIONÁRIOS VIGENTES ─────────────────────────────────────
// Veio junto de gn-home.html porque a trava precisa dela e os outros 12 apps não têm.
// Casa pelo ANO também: com 2026 e 2027 no mesmo calendário, dia+mês aparece duas vezes e
// sem o ano a data cairia na semana do outro ano.
function _gnEscSemIdx(dataISO) {
  const dt = new Date(dataISO+'T12:00:00');
  const d = dt.getDate(), m = dt.getMonth()+1, y = dt.getFullYear();
  const idx = (typeof COMISSOES_CAL !== 'undefined' ? COMISSOES_CAL : []).findIndex(w => w.days.some(x => x.d===d && x.m===m && x.y===y));
  return idx>=0 ? idx : null;
}
function _gnEscDiaIdx(dataISO) {
  const dt = new Date(dataISO+'T12:00:00');
  return (dt.getDay()+6)%7; // Seg=0 ... Dom=6
}

// Réplica de getComissoesFuncsHerdados do app Check-list: quando a semana atual ainda
// não tem registro próprio salvo em all_data, a escala continua valendo por herança da
// última semana com funcionários nomeados — só muda de fato quando alguém reabre a aba
// Escala e salva de novo (troca de horário, etc). Sem essa herança, os cards do Home
// ficavam em branco pra qualquer loja que não tivesse resalvado a semana, mesmo com
// escala real vigente (ex.: Boulevard, Campo Grande, Caxias, Norte Shopping).
function _gnEscNormNome(s) {
  return (s||'').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
}
// Transforma um funcionário de uma semana anterior na versão "herdada" pra semana alvo —
// mesma regra de FOLGA/NT/AFASTAMENTO persistentes e FÉRIAS condicionada à data real usada
// em getComissoesFuncsHerdados do Check-list. Retorna null se não deve ser herdado.
function _gnEscHerdarFunc(f, semAlvo) {
  if (!f.nome || !f.nome.trim() || f.arquivado) return null;
  const MANTER_SEM = new Set(['FOLGA','NÃO TRABALHADO','AFASTAMENTO']);
  let feriasIni=null, feriasFim=null;
  if (f.ferias_ini && f.ferias_fim) {
    feriasIni = new Date(f.ferias_ini+'T12:00:00');
    feriasFim = new Date(f.ferias_fim+'T12:00:00');
  }
  const diasHerd = Array(7).fill(null).map((_,di) => {
    const s = (f.dias||[])[di];
    if (!s) return 'PRESENTE';
    if (MANTER_SEM.has(s)) return s;
    if (s==='FÉRIAS' && feriasIni && feriasFim && semAlvo) {
      const day = semAlvo.days[di];
      // O dia do calendário traz o ano, então a data é exata (antes era chutada).
      const dt = new Date(day.y, day.m-1, day.d, 12, 0, 0);
      if (dt>=feriasIni && dt<=feriasFim) return 'FÉRIAS';
    }
    return 'PRESENTE';
  });
  return {...f, dias: diasHerd};
}
function _gnEscFuncsHerdados(allData, idx) {
  for (let i = idx - 1; i >= 0; i--) {
    const wd = allData[String(i)];
    if (!wd || !wd.funcs) continue;
    const comNome = wd.funcs.filter(f => f.nome && f.nome.trim());
    if (!comNome.length) continue;
    const semAlvo = (typeof COMISSOES_CAL !== 'undefined' ? COMISSOES_CAL : [])[idx];
    return comNome.map(f => _gnEscHerdarFunc(f, semAlvo)).filter(Boolean);
  }
  return [];
}
// Autocorreção (mesma lógica de _comissoesMesclarFuncsFaltantes no Check-list): uma semana
// já salva não é recriada do zero, então funcionário cadastrado depois que essa semana já
// existia nunca aparecia aqui. Busca a semana anterior mais próxima com gente cadastrada e
// acrescenta (por nome normalizado, sem fuzzy) quem estiver faltando na semana atual.
// Nomes excluídos da semana, lidos das "lápides" que a exclusão deixa na vaga vazia
// (_removidoNome no app Check-list; só _removidoEm no app Gorjetas e nas versões antigas,
// e aí o nome vem do índice da vaga na semana anterior). Sem isso o card de Escala do Home
// ressuscitava na tela quem a loja tinha acabado de excluir — mesma correção feita em
// _comissoesMesclarFuncsFaltantes no gn-checklist.html.
function _gnEscNomesRemovidos(funcsBrutos, funcsAnt) {
  const out = new Set();
  (funcsBrutos || []).forEach((f, i) => {
    if (!f || (f.nome && f.nome.trim())) return;
    if (f._removidoNome) { out.add(_gnEscNormNome(f._removidoNome)); return; }
    if (!f._removidoEm) return;
    const ant = (funcsAnt || [])[i];
    if (ant && ant.nome && ant.nome.trim()) out.add(_gnEscNormNome(ant.nome));
  });
  return out;
}
// Mesmo motivo do _comissoesNomesRenomeados no Check-list: renomear não pode parecer
// excluir, senão a fusão devolve o nome antigo e o funcionário aparece duas vezes na
// escala do dia (São Gonçalo, 23/09 — 32 viraram 39 depois de corrigir 7 nomes).
function _gnEscNomesRenomeados(funcs) {
  const out = new Set();
  (funcs || []).forEach(f => {
    if (!f || !f._nomesAnteriores) return;
    f._nomesAnteriores.forEach(n => { if (n && String(n).trim()) out.add(_gnEscNormNome(n)); });
  });
  return out;
}
function _gnEscMesclarFuncsFaltantes(funcsAtuais, allData, idx, funcsBrutos) {
  for (let i = idx - 1; i >= 0; i--) {
    const wdAnt = allData[String(i)];
    if (!wdAnt || !wdAnt.funcs) continue;
    // Deliberadamente NÃO recursivo — ver comentário de _comissoesMesclarFuncsFaltantes
    // no Check-list: encadear a cura por várias semanas pra trás ressuscitava
    // ex-funcionários que saíram sem ser marcados como "arquivado". Só 1 semana pra trás.
    const comNome = wdAnt.funcs.filter(f => f.nome && f.nome.trim());
    if (!comNome.length) continue;
    const nomesAtuais = new Set(funcsAtuais.filter(f => f.nome && f.nome.trim() && !f.arquivado).map(f => _gnEscNormNome(f.nome)));
    const removidos = _gnEscNomesRemovidos(funcsBrutos || funcsAtuais, wdAnt.funcs);
    const renomeados = _gnEscNomesRenomeados(funcsBrutos || funcsAtuais);
    // Quem foi ARQUIVADO nesta semana (fim de contrato) também não pode voltar pela fusão:
    // na semana anterior ele existe sem a marca de arquivado, então a autocorreção o lia
    // como "faltante" e reinseria o desligado — e como a vaga arquivada continuava lá, a
    // pessoa aparecia duas vezes e contava duas vezes. Só a exclusão à mão deixava lápide
    // (_removidoNome); o arquivamento automático não deixa nenhuma, por isso a checagem
    // extra aqui.
    const arquivados = new Set((funcsBrutos || funcsAtuais)
      .filter(f => f && f.nome && f.nome.trim() && f.arquivado)
      .map(f => _gnEscNormNome(f.nome)));
    const faltantes = comNome.filter(f => !f.arquivado
      && !nomesAtuais.has(_gnEscNormNome(f.nome))
      && !removidos.has(_gnEscNormNome(f.nome))
      && !renomeados.has(_gnEscNormNome(f.nome))
      && !arquivados.has(_gnEscNormNome(f.nome)));
    if (!faltantes.length) return funcsAtuais;
    const semAlvo = (typeof COMISSOES_CAL !== 'undefined' ? COMISSOES_CAL : [])[idx];
    const herdados = faltantes.map(f => _gnEscHerdarFunc(f, semAlvo)).filter(Boolean);
    return [...funcsAtuais, ...herdados];
  }
  return funcsAtuais;
}
// Funcionários nomeados válidos pra semana `idx`: usa o registro salvo se existir,
// senão cai pra herança da semana anterior mais recente (ver acima). Quando o registro já
// existe, ainda mescla quem estiver faltando em relação à semana anterior mais próxima.
function _gnEscFuncsAtual(allData, idx) {
  const wd = allData[String(idx)];
  if (!wd) return _gnEscFuncsHerdados(allData, idx);
  // `arquivado` = desligado por fim de contrato. Quem está arquivado não é funcionário
  // ativo, então não entra na contagem do Painel de Gestão (venda por funcionário), nem
  // é cobrado por horário/banco de horas faltando, nem aparece na Escala de Hoje.
  // Só vale da semana do arquivamento pra frente: semanas anteriores seguem com a pessoa
  // e com os dias trabalhados dela (_gnEscHerdarFunc já não herda quem está arquivado).
  const atuais = (wd.funcs || []).filter(f => f.nome && f.nome.trim() && !f.arquivado);
  // wd.funcs cru também: as vagas vazias é que carregam a marca de quem foi excluído.
  return _gnEscMesclarFuncsFaltantes(atuais, allData, idx, wd.funcs || []);
}

/* ── PRESENÇA NA LOJA ───────────────────────────────────────────────────────────────────
   "Quero ter uma informação mais precisa de quem está na loja. Ou seja, quando for acessar
    o aplicativo ele vai precisar confirmar que está na loja."

   O card de plantão aqui em cima DEDUZ quem está na loja a partir da escala. Escala não é
   presença: ela diz quem deveria estar, e o dia em que isso diverge é justamente o dia em
   que alguém precisa saber. Esta trava pede a confirmação.

   O QUE TORNOU ISTO DIFÍCIL, e é metade do código abaixo: o login e a escala são cadastros
   SEPARADOS, sem nenhuma ligação. Medido antes de montar, nos 30 gerentes/subs ativos:
   `Carol` é `A.CAROLINA OLIVEIRA`, `Felix` é `ANDESON DO NASCIMENTO FELIX`, `Ramos` é
   `FRANCISCO SILVA RAMOS`, `Thalyta` é `TALITA SILVA SERPA` (grafia diferente). Casar por
   primeiro nome erraria em 5 dos 30 e — pior — erraria CALADO. Então a primeira vez que a
   trava aparece, a própria pessoa diz qual linha da escala é a dela, e isso fica gravado
   em gn_usuarios.escala_nome. Sugestão pré-marcada onde é óbvia; escolha na mão onde não é.
   Pelo NOME e não pelo id do funcionário: o id é índice de posição e trocou de pessoa em
   192 dos 860 pares (loja,id) em 6 semanas.

   TRÊS CAMINHOS, depois de resolvida a pessoa:
     · no horário  → confirma e pronto.
     · escalado hoje, fora da janela (com GN_PRESENCA_TOLERANCIA_MIN de folga de cada lado)
       → não libera direto: mostra o que a escala diz, e oferece corrigir o horário de HOJE
         pro que ela vai fazer de fato. A correção vai pra escala com trilha.
     · de folga/férias/afastamento → entra, marcado como fora de escala, e isso aparece no
       Painel. Decisão do dono: folga coberta de última hora acontece toda semana, e travar
       quem foi chamado pra cobrir deixaria a loja sem gerência no sistema justo no dia
       atípico.

   FALHA ABERTO, igual à trava do fechamento logo acima: escala que não carregou, semana
   sem calendário, loja fora da lista, nome que não resolve mais — nada disso trava. Um
   defeito meu não pode trancar a gerência fora do app.

   SÓ GERENTE E SUB (CARGOS_PRESENCA), SÓ NAS 11 LOJAS (GN_PRESENCA_FORA tira a Maglia), e
   mestre/supervisor/administrador/compras passam direto, como em todo o resto do app. */
const PRES_ID = 'gate-presenca';
let _presAtivo = false;
let _presDados = null;    // { loja, comKey, idx, diaIdx, funcs, escalaNome, func, fidx, estado, hd, status }
let _presTela  = 'quem';  // 'quem' | 'confirmar' | 'corrigir'
let _presOcupado = false;
let _presErro = '';

function _presHojeISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function _presChaveLocal(usuarioId, loja) { return 'gn_presenca_' + usuarioId + '_' + loja + '_' + _presHojeISO(); }

// Minutos desde a meia-noite, pra comparar com tolerância sem mexer em string de hora.
function _presMin(hm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || '').trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  return (h > 23 || mi > 59) ? null : h * 60 + mi;
}
// Dentro da janela com folga dos dois lados. O turno que vira a noite (ex.: 18:00–02:00)
// é o caso que quebra a comparação ingênua — a mesma regra do _dentroDoHorario do plantão,
// aqui com a tolerância somada.
function _presDentroDaJanela(agoraHM, entrada, saida, tolMin) {
  const a = _presMin(agoraHM), e = _presMin(entrada), s = _presMin(saida);
  if (a == null || e == null || s == null) return false;
  const tol = tolMin == null ? 0 : tolMin;
  const ini = (e - tol + 1440) % 1440;
  const fim = (s + tol) % 1440;
  if (fim === ini) return true;                    // janela cobriu o dia inteiro
  return fim < ini ? (a >= ini || a < fim) : (a >= ini && a < fim);
}

// Quem é cobrado. Fora daqui, nenhuma trava aparece.
function _presDeveCobrar(sess, isMaster) {
  if (!sess || isMaster) return false;
  if (window.CARGOS_MASTER_EQUIV && window.CARGOS_MASTER_EQUIV.includes((sess.cargo||'').toLowerCase())) return false;
  const cargo = (sess.cargo || '').toLowerCase();
  if (!(window.CARGOS_PRESENCA || []).includes(cargo)) return false;
  const loja = sess.loja;
  if (!loja || !_gnLojaConhecida(loja)) return false;
  return window.gnPresencaLiberada ? window.gnPresencaLiberada(loja) : true;
}

async function _gnPresChecar(sess, isMaster) {
  try {
    if (!_presDeveCobrar(sess, isMaster)) return;
    const loja = sess.loja, hoje = _presHojeISO();
    // Já respondeu neste aparelho hoje: nem busca. A linha no banco continua sendo a
    // verdade — isto só evita perguntar de novo a cada recarga da página.
    try { if (localStorage.getItem(_presChaveLocal(sess.id, loja)) === '1') return; } catch (e) {}

    const H = { apikey: _gnPresCfg.sbKey, Authorization: 'Bearer ' + _gnPresCfg.sbKey };
    const idx = _gnEscSemIdx(hoje);
    if (idx == null) return;                       // dia sem semana no calendário: não trava
    const diaIdx = _gnEscDiaIdx(hoje);
    const comKey = _gnComKey(loja);

    const [jaRows, usrRows, escRows] = await Promise.all([
      window.gnFetchJson(`${_gnPresCfg.sbUrl}/rest/v1/gn_presenca_loja?usuario_id=eq.${sess.id}&loja=eq.${encodeURIComponent(loja)}&data=eq.${hoje}&select=id`, H, 'presenca:ja', null),
      window.gnFetchJson(`${_gnPresCfg.sbUrl}/rest/v1/gn_usuarios_publico?id=eq.${sess.id}&select=escala_nome`, H, 'presenca:usr', null),
      window.gnFetchJson(`${_gnPresCfg.sbUrl}/rest/v1/gn_comissoes?loja=eq.${encodeURIComponent(comKey)}&select=all_data`, H, 'presenca:escala', null),
    ]);
    // Qualquer uma que falhou (null) deixa passar: sem o dado não há pergunta honesta a
    // fazer, e internet ruim não pode trancar a gerência fora do app.
    if (jaRows === null || usrRows === null || escRows === null) return;
    if (jaRows.length) { try { localStorage.setItem(_presChaveLocal(sess.id, loja), '1'); } catch (e) {} return; }
    if (!escRows.length) return;                   // loja sem escala cadastrada: não trava

    const allData = (escRows[0] && escRows[0].all_data) || {};
    let funcs;
    try { funcs = _gnEscFuncsAtual(allData, idx); } catch (e) { return; }
    if (!funcs || !funcs.length) return;

    const escalaNome = (usrRows[0] && usrRows[0].escala_nome) || '';
    _presDados = {
      loja, comKey, idx, diaIdx, hoje, funcs, escalaNome,
      semanaMaterializada: !!allData[String(idx)],
      func: null, fidx: -1,
    };
    const achou = escalaNome && window.gnEscalaAchaFunc ? window.gnEscalaAchaFunc(funcs, escalaNome) : null;
    if (achou) { _presDados.func = achou.func; _presDados.fidx = achou.idx; }
    _presTela = achou ? 'confirmar' : 'quem';
    _presErro = '';
    _presRender();
  } catch (e) {
    // Mesma regra da trava do fechamento: defeito meu solta a trava, nunca prende.
    if (window.gnLogError) window.gnLogError('presenca:checar', e);
    _presLiberar();
  }
}

// O estado de hoje, a partir da linha da escala já resolvida.
function _presEstadoDoDia(d) {
  const status = ((d.func && d.func.dias) || [])[d.diaIdx] || 'PRESENTE';
  if (!GN_PRESENTE_SET.has(status)) return { estado: 'fora_de_escala', status, hd: null };
  const hd = ((d.func && d.func.horario_dias) || [])[d.diaIdx] || null;
  if (!hd || !hd.entrada || !hd.saida) return { estado: 'sem_horario', status, hd: null };
  const dentro = _presDentroDaJanela(_gnHoraAgoraHM(), hd.entrada, hd.saida, window.GN_PRESENCA_TOLERANCIA_MIN);
  return { estado: dentro ? 'no_horario' : 'fora_do_horario', status, hd };
}

// ── A TELA ─────────────────────────────────────────────────────────────────────────────
// Mesmo desenho da trava do fechamento (_gateOverlay): tela cheia, z-index abaixo do
// alerta urgente do mestre, e a mesma porta de saída — "Não sou eu — sair". Sem ela, um
// aparelho logado como o gerente ficaria inútil pro resto da equipe até ele chegar.
function _presOverlay() {
  let ov = document.getElementById(PRES_ID);
  if (ov) return ov;
  ov = document.createElement('div');
  ov.id = PRES_ID;
  ov.style.cssText = 'position:fixed;inset:0;z-index:9998;background:var(--s1);overflow-y:auto;-webkit-overflow-scrolling:touch';
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  _presAtivo = true;
  return ov;
}
function _presLiberar() {
  const ov = document.getElementById(PRES_ID);
  if (ov) ov.remove();
  _presAtivo = false;
  document.body.style.overflow = '';
}

function _presMoldura(titulo, sub, corpo, botoes) {
  const esc = s => _gnEsc3(String(s == null ? '' : s));
  return `<div style="max-width:560px;margin:0 auto;padding:14px 0 26px">
    <div style="padding:4px 16px 12px">
      <div style="font-size:9px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:var(--t4)">Gigante Nordestino</div>
      <div style="font-size:16px;font-weight:900;color:var(--t1);margin-top:3px;line-height:1.25">${esc(titulo)}</div>
      <div style="font-size:11.5px;color:var(--t3);margin-top:4px;line-height:1.45">${sub}</div>
    </div>
    <div style="padding:0 16px">${corpo}</div>
    ${_presErro ? `<div style="padding:8px 16px 0;font-size:11.5px;color:var(--err,#dc2626);font-weight:700">${esc(_presErro)}</div>` : ''}
    <div style="padding:12px 16px 0;display:flex;flex-direction:column;gap:8px">
      ${botoes}
      <button onclick="gnPresencaSair()" style="width:100%;padding:10px;border-radius:12px;border:1px solid rgba(0,0,0,.15);cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;background:transparent;color:var(--t3)">Não sou eu — sair</button>
    </div>
  </div>`;
}
const _PRES_BTN = 'width:100%;padding:12px;border-radius:12px;border:none;cursor:pointer;font-family:inherit;font-size:13px;font-weight:900;background:#059669;color:#fff';
const _PRES_BTN2 = 'width:100%;padding:11px;border-radius:12px;border:1px solid rgba(0,0,0,.15);cursor:pointer;font-family:inherit;font-size:12.5px;font-weight:800;background:var(--s2);color:var(--t1)';

function _presRender() {
  const d = _presDados;
  if (!d) { _presLiberar(); return; }
  const ov = _presOverlay();
  const esc = s => _gnEsc3(String(s == null ? '' : s));
  if (_presTela === 'quem')      { ov.innerHTML = _presTelaQuem(d, esc);      ov.scrollTop = 0; return; }
  if (_presTela === 'corrigir')  { ov.innerHTML = _presTelaCorrigir(d, esc);  ov.scrollTop = 0; return; }
  ov.innerHTML = _presTelaConfirmar(d, esc);
  ov.scrollTop = 0;
}

// Passo 1, uma vez na vida de cada pessoa: qual linha da escala é você.
// A sugestão vem do nome do login contido no nome da escala — acerta 25 dos 30 medidos.
// Os outros 5 escolhem na lista. Ninguém é vinculado por palpite do app: a pessoa toca.
// Sobre a MESMA lista que aparece na tela, não sobre a escala inteira: sugerir alguém
// que não está entre as opções é não sugerir nada, só que de um jeito que parece ter
// funcionado — e era isso que escondia a ambiguidade real entre dois SILVA da gerência.
function _presSugestao(lista, nomeLogin) {
  const alvo = window.gnNomeEscalaNorm(nomeLogin);
  if (!alvo) return null;
  const cand = (lista || []).filter(f => {
    const n = window.gnNomeEscalaNorm(f.nome);
    return n && (n.indexOf(alvo) >= 0 || alvo.indexOf(n) >= 0);
  });
  return cand.length === 1 ? cand[0].nome : null;   // ambíguo não sugere nada
}
function _presTelaQuem(d, esc) {
  const sess = _gnPresU;
  const daGerencia = d.funcs.filter(f => ['Gerente','Sub Gerente'].includes((f.setor||'').trim()));
  const lista = daGerencia.length ? daGerencia : d.funcs;
  const sug = _presSugestao(lista, sess && sess.nome);
  const opcoes = lista.map(f => {
    const marcado = sug && window.gnNomeEscalaNorm(f.nome) === window.gnNomeEscalaNorm(sug);
    return `<label style="display:flex;align-items:center;gap:10px;padding:11px 12px;border:1px solid ${marcado ? 'var(--txt-green,#059669)' : 'var(--b1)'};background:${marcado ? 'rgba(5,150,105,.08)' : 'var(--s2)'};border-radius:12px;margin-bottom:7px;cursor:pointer">
      <input type="radio" name="pres-quem" value="${esc(f.nome)}" ${marcado ? 'checked' : ''} style="width:17px;height:17px;flex-shrink:0;accent-color:#059669">
      <span style="min-width:0">
        <span style="display:block;font-size:13px;font-weight:800;color:var(--t1);overflow-wrap:anywhere">${esc(String(f.nome||'').trim())}</span>
        <span style="display:block;font-size:10.5px;color:var(--t3)">${esc((f.setor||'').trim() || 'sem função')}${marcado ? ' · parece ser você' : ''}</span>
      </span>
    </label>`;
  }).join('');
  return _presMoldura(
    'Quem é você na escala?',
    `Seu login é <b>${esc((sess && sess.nome) || '')}</b>, e na escala da loja os nomes são completos. Só desta vez: diga qual é o seu, e o app passa a saber o seu horário.`,
    `<div>${opcoes}</div>`,
    `<button onclick="_presSalvarQuem()" style="${_PRES_BTN}">${_presOcupado ? 'Salvando...' : 'Sou eu — continuar'}</button>`
  );
}

async function _presSalvarQuem() {
  if (_presOcupado) return;
  const sel = document.querySelector('input[name="pres-quem"]:checked');
  if (!sel) { _presErro = 'Escolha o seu nome na lista.'; _presRender(); return; }
  _presOcupado = true; _presErro = ''; _presRender();
  const nome = sel.value;
  // fetch cru e res.ok, como o resto dos PATCH deste arquivo: gnFetchJson devolve o
  // fallback em vez de lançar, e `return=minimal` responde 204 sem corpo — os dois juntos
  // fariam uma falha de gravação passar por sucesso.
  const ok = await _presPatch(`gn_usuarios?id=eq.${_gnPresU.id}`,
    { escala_nome: nome, escala_nome_em: new Date().toISOString() }, 'presenca:vincular');
  if (!ok) {
    _presOcupado = false;
    _presErro = 'Não consegui salvar — tente de novo.';
    _presRender(); return;
  }
  const achou = window.gnEscalaAchaFunc(_presDados.funcs, nome);
  _presDados.escalaNome = nome;
  _presDados.func = achou ? achou.func : null;
  _presDados.fidx = achou ? achou.idx : -1;
  _presOcupado = false;
  _presTela = 'confirmar';
  _presRender();
}

function _presHeaders() {
  return { apikey: _gnPresCfg.sbKey, Authorization: 'Bearer ' + _gnPresCfg.sbKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
}
async function _presPatch(rota, body, contexto) {
  try {
    const r = await fetch(`${_gnPresCfg.sbUrl}/rest/v1/${rota}`, { method: 'PATCH', headers: _presHeaders(), body: JSON.stringify(body) });
    if (!r.ok && window.gnLogError) window.gnLogError(contexto, 'HTTP ' + r.status);
    return r.ok;
  } catch (e) { if (window.gnLogError) window.gnLogError(contexto, e); return false; }
}
async function _presPost(rota, body, contexto) {
  try {
    const r = await fetch(`${_gnPresCfg.sbUrl}/rest/v1/${rota}`, { method: 'POST', headers: _presHeaders(), body: JSON.stringify(body) });
    if (!r.ok && window.gnLogError) window.gnLogError(contexto, 'HTTP ' + r.status);
    return r.ok;
  } catch (e) { if (window.gnLogError) window.gnLogError(contexto, e); return false; }
}

// Passo 2: a confirmação. O texto muda com o estado, porque as três situações pedem
// coisas diferentes de quem está lendo.
const _PRES_TEXTO = {
  no_horario: {
    titulo: 'Você está na loja?',
    acao: 'Sim, estou na loja',
  },
  fora_do_horario: {
    titulo: 'Fora do horário da sua escala',
    acao: 'Estou na loja mesmo assim',
  },
  sem_horario: {
    titulo: 'Seu horário de hoje está em branco',
    acao: 'Estou na loja',
  },
  fora_de_escala: {
    titulo: 'Hoje não é seu dia de trabalho',
    acao: 'Estou na loja mesmo assim',
  },
};

function _presTelaConfirmar(d, esc) {
  const e = _presEstadoDoDia(d);
  d.estado = e.estado; d.hd = e.hd; d.status = e.status;
  const agora = _gnHoraAgoraHM();
  const txt = _PRES_TEXTO[e.estado] || _PRES_TEXTO.no_horario;
  const rotuloStatus = GN_STATUS_LABEL[e.status] || e.status;
  const nomeEscala = esc(String(d.func && d.func.nome || '').trim());

  let sub, corpo = '', botoes = '';
  const cartao = (cor, linhas) => `<div style="background:var(--s2);border:1px solid var(--b1);border-left:3px solid ${cor};border-radius:14px;padding:12px 14px">${linhas}</div>`;
  const linha = (rot, val, corVal) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:3px 0;font-size:12px">
    <span style="color:var(--t3)">${rot}</span><span style="font-weight:800;color:${corVal || 'var(--t1)'};font-variant-numeric:tabular-nums">${val}</span></div>`;

  if (e.estado === 'no_horario') {
    sub = `Confirme que você está na loja agora. Isso aparece no plantão da Home e no Painel — é o que diz à direção quem está aqui de fato, não só quem a escala previa.`;
    corpo = cartao('var(--txt-green,#059669)',
      linha('Você', nomeEscala) + linha('Sua escala hoje', esc(d.hd.entrada + '–' + d.hd.saida)) + linha('Agora', esc(agora)));
    botoes = `<button onclick="_presConfirmar()" style="${_PRES_BTN}">${_presOcupado ? 'Confirmando...' : txt.acao}</button>`;

  } else if (e.estado === 'fora_do_horario') {
    sub = `Sua escala diz <b>${esc(d.hd.entrada + '–' + d.hd.saida)}</b> e agora são <b>${esc(agora)}</b>. Se o horário de hoje é outro, corrija aqui — a escala é o que conta no banco de horas, então ela precisa dizer o que você realmente vai fazer.`;
    corpo = cartao('var(--txt-amber,#d97706)',
      linha('Você', nomeEscala) + linha('Escala de hoje', esc(d.hd.entrada + '–' + d.hd.saida)) + linha('Agora', esc(agora), 'var(--txt-amber,#d97706)'));
    botoes = (d.semanaMaterializada
        ? `<button onclick="_presIrCorrigir()" style="${_PRES_BTN}">Corrigir meu horário de hoje</button>`
        : `<div style="font-size:11px;color:var(--t3);line-height:1.5;padding:2px 2px 4px">A escala desta semana ainda não foi aberta no Check-list, então não dá pra corrigir por aqui sem criar a semana por fora. Corrija no app Check-list.</div>`)
      + `<button onclick="_presConfirmar()" style="${_PRES_BTN2}">${_presOcupado ? 'Confirmando...' : txt.acao}</button>`;

  } else if (e.estado === 'sem_horario') {
    sub = `Você está escalado hoje (<b>${esc(rotuloStatus)}</b>), mas o horário do dia está em branco na escala. Informe o horário que vai fazer.`;
    corpo = cartao('var(--txt-amber,#d97706)', linha('Você', nomeEscala) + linha('Escala de hoje', 'em branco', 'var(--txt-amber,#d97706)') + linha('Agora', esc(agora)));
    botoes = (d.semanaMaterializada
        ? `<button onclick="_presIrCorrigir()" style="${_PRES_BTN}">Informar meu horário de hoje</button>`
        : `<div style="font-size:11px;color:var(--t3);line-height:1.5;padding:2px 2px 4px">A escala desta semana ainda não foi aberta no Check-list. Informe o horário por lá.</div>`)
      + `<button onclick="_presConfirmar()" style="${_PRES_BTN2}">${_presOcupado ? 'Confirmando...' : txt.acao}</button>`;

  } else {
    sub = `A escala marca hoje como <b>${esc(rotuloStatus)}</b> pra você. Se veio cobrir, pode entrar — fica registrado que foi fora da escala, e aparece assim no Painel.`;
    corpo = cartao('#94a3b8', linha('Você', nomeEscala) + linha('Escala de hoje', esc(rotuloStatus), '#94a3b8') + linha('Agora', esc(agora)));
    botoes = `<button onclick="_presConfirmar()" style="${_PRES_BTN}">${_presOcupado ? 'Confirmando...' : txt.acao}</button>`;
  }

  // Trocar de pessoa sem deslogar: quem errou a escolha na primeira vez ficaria preso ao
  // vínculo errado pra sempre, e o único jeito de sair seria pedir pro TI.
  botoes += `<button onclick="_presTrocarQuem()" style="width:100%;padding:9px;border:none;background:transparent;color:var(--t3);font-family:inherit;font-size:11px;font-weight:700;cursor:pointer;text-decoration:underline">Não sou ${nomeEscala} — trocar</button>`;
  return _presMoldura(txt.titulo, sub, corpo, botoes);
}

function _presTrocarQuem() { _presTela = 'quem'; _presErro = ''; _presRender(); }
function _presIrCorrigir() { _presTela = 'corrigir'; _presErro = ''; _presRender(); }

function _presTelaCorrigir(d, esc) {
  const hd = d.hd || { entrada: '', saida: '' };
  const campo = (id, rot, val) => `<div style="flex:1;min-width:0">
    <label style="display:block;font-size:10px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:var(--t4);margin-bottom:4px">${rot}</label>
    <input id="${id}" type="time" value="${esc(val || '')}" style="width:100%;box-sizing:border-box;padding:11px 10px;border-radius:10px;border:1px solid var(--b1);background:var(--s2);color:var(--t1);font-family:inherit;font-size:15px;font-variant-numeric:tabular-nums">
  </div>`;
  return _presMoldura(
    'Horário de hoje',
    `Coloque o horário que você vai <b>realmente</b> fazer hoje. Isso corrige a sua escala do dia e fica registrado com o horário anterior — a escala é o que o banco de horas lê.`,
    `<div style="display:flex;gap:10px">${campo('pres-ent','Entrada', hd.entrada)}${campo('pres-sai','Saída', hd.saida)}</div>
     <div style="font-size:10.5px;color:var(--t4);margin-top:8px;line-height:1.5">Só o dia de hoje muda. O resto da semana continua como está.</div>`,
    `<button onclick="_presSalvarHorario()" style="${_PRES_BTN}">${_presOcupado ? 'Salvando...' : 'Salvar e confirmar presença'}</button>
     <button onclick="_presVoltarConfirmar()" style="${_PRES_BTN2}">Voltar</button>`
  );
}
function _presVoltarConfirmar() { _presTela = 'confirmar'; _presErro = ''; _presRender(); }

// Grava a correção NA ESCALA e a trilha, e só então confirma a presença.
// Leitura-modificação-escrita do all_data inteiro, que é como o Check-list também grava
// (flushComissoesOps lá). A releitura acontece aqui, imediatamente antes do PATCH, e não
// num retrato guardado no começo da trava: entre abrir a tela e tocar no botão a loja pode
// ter mexido na escala, e escrever por cima do retrato velho apagaria a edição dela — foi
// exatamente esse o bug de "salva e alguns minutos depois volta sozinho" que o Check-list
// já levou. Mexe num campo só, de uma pessoa, de um dia.
async function _presSalvarHorario() {
  if (_presOcupado) return;
  const d = _presDados;
  const ent = (document.getElementById('pres-ent') || {}).value || '';
  const sai = (document.getElementById('pres-sai') || {}).value || '';
  if (!/^\d{2}:\d{2}$/.test(ent) || !/^\d{2}:\d{2}$/.test(sai)) {
    _presErro = 'Preencha entrada e saída.'; _presRender(); return;
  }
  if (ent === sai) { _presErro = 'Entrada e saída não podem ser iguais.'; _presRender(); return; }
  _presOcupado = true; _presErro = ''; _presRender();

  const H = { apikey: _gnPresCfg.sbKey, Authorization: 'Bearer ' + _gnPresCfg.sbKey };
  const rows = await window.gnFetchJson(
    `${_gnPresCfg.sbUrl}/rest/v1/gn_comissoes?loja=eq.${encodeURIComponent(d.comKey)}&select=all_data`, H, 'presenca:relerEscala', null);
  if (rows === null || !rows.length) {
    _presOcupado = false; _presErro = 'Não consegui ler a escala — tente de novo.'; _presRender(); return;
  }
  const allData = (rows[0] && rows[0].all_data) || {};
  const wd = allData[String(d.idx)];
  if (!wd || !Array.isArray(wd.funcs)) {
    _presOcupado = false;
    _presErro = 'A escala desta semana não está aberta no Check-list — corrija por lá.';
    _presRender(); return;
  }
  // Acha a pessoa no retrato RECÉM-LIDO, pelo nome: o índice guardado quando a trava abriu
  // vale pro array de antes, e o id do funcionário é posição, não identidade.
  const achou = window.gnEscalaAchaFunc(wd.funcs, d.escalaNome);
  if (!achou) {
    _presOcupado = false;
    _presErro = 'Não encontrei o seu nome na escala desta semana.';
    _presRender(); return;
  }
  const f = achou.func;
  const hdAntes = ((f.horario_dias || [])[d.diaIdx]) || { entrada: '', saida: '' };
  const hd = Array.isArray(f.horario_dias) && f.horario_dias.length === 7
    ? f.horario_dias.slice()
    : Array(7).fill(null).map((_, i) => Object.assign({ entrada: '', saida: '' }, (f.horario_dias || [])[i] || {}));
  hd[d.diaIdx] = Object.assign({}, hd[d.diaIdx] || {}, { entrada: ent, saida: sai });
  wd.funcs = wd.funcs.slice();
  wd.funcs[achou.idx] = Object.assign({}, f, { horario_dias: hd });
  wd._lastEdit = Date.now();
  allData[String(d.idx)] = wd;

  const okEscala = await _presPatch(`gn_comissoes?loja=eq.${encodeURIComponent(d.comKey)}`, { all_data: allData }, 'presenca:gravarEscala');
  if (!okEscala) {
    _presOcupado = false; _presErro = 'Não consegui gravar na escala — tente de novo.'; _presRender(); return;
  }
  // A trilha depois da escala, nunca antes: trilha de uma mudança que não gravou é pior
  // que trilha nenhuma. Se ela falhar, a presença ainda é confirmada e o erro vai pro log
  // — o que não pode é a pessoa ficar presa na trava por causa do registro de auditoria.
  await _presPost('gn_escala_correcao', {
    usuario_id: _gnPresU.id, nome: _gnPresU.nome, cargo: _gnPresU.cargo, loja: d.loja,
    data: d.hoje, sem_idx: d.idx, dia_idx: d.diaIdx, escala_nome: d.escalaNome,
    entrada_antes: hdAntes.entrada || null, saida_antes: hdAntes.saida || null,
    entrada_depois: ent, saida_depois: sai,
  }, 'presenca:trilha');

  // O objeto local acompanha, pra confirmação gravar o horário novo e não o antigo.
  d.func = wd.funcs[achou.idx]; d.fidx = achou.idx;
  _presOcupado = false;
  await _presConfirmar(true);
}

async function _presConfirmar(jaCorrigiu) {
  if (_presOcupado && !jaCorrigiu) return;
  const d = _presDados;
  _presOcupado = true; _presErro = ''; _presRender();
  const e = _presEstadoDoDia(d);
  const corpo = {
    usuario_id: _gnPresU.id, nome: _gnPresU.nome, cargo: _gnPresU.cargo,
    loja: d.loja, data: d.hoje,
    estado: e.estado === 'sem_horario' ? 'fora_do_horario' : e.estado,
    escala_status: e.status || null,
    escala_entrada: (e.hd && e.hd.entrada) || null,
    escala_saida: (e.hd && e.hd.saida) || null,
    hora_confirmacao: _gnHoraAgoraHM(),
    corrigiu_horario: !!jaCorrigiu,
    escala_nome: d.escalaNome || null,
    aparelho: (navigator.userAgent || '').slice(0, 180),
  };
  const ok = await _presPost('gn_presenca_loja', corpo, 'presenca:confirmar');
  if (!ok) {
    _presOcupado = false;
    // Sem fila offline, pela mesma razão da assinatura do Caixa: a confirmação é o que
    // destrava o app, e destravar em cima de algo que não gravou é o pior dos dois mundos.
    _presErro = 'Não consegui registrar — tente de novo.';
    _presRender(); return;
  }
  try { localStorage.setItem(_presChaveLocal(_gnPresU.id, d.loja), '1'); } catch (er) {}
  _presOcupado = false;
  _presLiberar();
  // Quem tiver uma tela que mostre presença (o plantão da Home) atualiza na hora, sem
  // esperar recarga. Os outros apps não passam nada aqui.
  try { if (typeof _gnPresCfg.aoConfirmar === 'function') _gnPresCfg.aoConfirmar(); } catch (er) {}
}

// ── A PORTA DE SAÍDA E A ENTRADA PÚBLICA ───────────────────────────────────────────────
// Cada app desloga do seu jeito (chave de sessão própria, tela própria), então o botão
// chama de volta quem armou a trava. Sem aoSair a trava ainda sai da frente — o que não
// pode é o botão não fazer nada e o aparelho ficar inútil pra equipe.
function gnPresencaSair() {
  const sair = _gnPresCfg && _gnPresCfg.aoSair;
  _presDados = null;
  _presLiberar();
  try { if (typeof sair === 'function') sair(); } catch (e) { if (window.gnLogError) window.gnLogError('presenca:sair', e); }
}

let _gnPresArmado = false;
window.gnPresencaGuardiao = function (opts) {
  try {
    const o = opts || {};
    const sess = o.sessao;
    if (!sess || !sess.id) return;
    _gnPresArmado = true;
    _gnPresCfg = { sbUrl: o.sbUrl || '', sbKey: o.sbKey || '', aoSair: o.aoSair || null, aoConfirmar: o.aoConfirmar || null };
    _gnPresU = sess;
    // Mestre/supervisor e quem opera a rede inteira não respondem por presença em loja
    // nenhuma — mesma isenção que o resto do app já dá a eles.
    const isMaster = sess.loja === 'GERAL' || !!((sess.permissoes || {}).master);
    _gnPresChecar(sess, isMaster);
  } catch (e) {
    // Um defeito meu não pode trancar ninguém fora do app.
    if (window.gnLogError) window.gnLogError('presenca:guardiao', e);
    try { _presLiberar(); } catch (e2) {}
  }
};
// Some da frente sem perguntar nada — pra quem desloga por fora da trava.
window.gnPresencaLiberar = function () { _presDados = null; try { _presLiberar(); } catch (e) {} };

/* ── AUTO-ARME ──────────────────────────────────────────────────────────────────────────
   "Travar todos. Pra não ter saída."

   Dez dos treze apps dividem a sessão gn_session_v1, e pedir pra cada um chamar o
   guardião seria onze pontos de chamada pra divergir — e o que divergir é a saída. Então
   o próprio módulo se arma, uma vez, a partir da sessão compartilhada.

   Quem chamou gnPresencaGuardiao por conta própria (a Home, que tem o plantão pra
   redesenhar, e os dois apps de sessão própria) não é armado de novo.

   O logout padrão apaga a sessão COMPARTILHADA e recarrega: é o que manda a pessoa de
   volta pro login em qualquer um dos apps, sem este arquivo precisar conhecer o botão de
   sair de cada um. Um app que queira sair do seu jeito passa aoSair.

   O atraso existe porque vários apps restauram sessão e montam a tela no próprio load; a
   trava entra depois que o app se montou, não por cima do que ele ainda está desenhando. */
// GN_SB_URL/GN_SB_KEY vêm de gn-lojas-config.js, que os 13 apps carregam antes deste
// arquivo — é a fonte que não depende do script do app ter executado. Os nomes locais
// (SB_KEY, SUPA_KEY, SB_ANON) ficam como segunda opção, pra um app que um dia carregue
// este módulo sem o config. Sem chave nenhuma a trava não aparece, e isso é a falha mais
// perigosa deste arquivo: ela parece estar valendo e não está. Por isso a suíte
// e2e_presenca_todos_apps.js abre os 13 e cobra a trava em cada um.
function _gnPresSbUrl() {
  if (window.GN_SB_URL) return window.GN_SB_URL;
  if (typeof SB_URL !== 'undefined' && SB_URL) return SB_URL;
  if (typeof SUPA_URL !== 'undefined' && SUPA_URL) return SUPA_URL;
  return '';
}
function _gnPresSbKey() {
  if (window.GN_SB_KEY) return window.GN_SB_KEY;
  if (typeof SB_KEY !== 'undefined' && SB_KEY) return SB_KEY;
  if (typeof SUPA_KEY !== 'undefined' && SUPA_KEY) return SUPA_KEY;
  if (typeof SB_ANON !== 'undefined' && SB_ANON) return SB_ANON;
  return '';
}
function _gnPresAutoArmar() {
  try {
    if (_gnPresArmado) return;
    const bruto = localStorage.getItem('gn_session_v1');
    if (!bruto) return;
    const s = JSON.parse(bruto);
    // Mesma validade que os apps usam pra restaurar a sessão (12h). Sessão vencida é
    // pessoa que vai cair no login de qualquer jeito — trava em cima disso é ruído.
    if (!s || !s.id || !s.ts || Date.now() - s.ts > 43200000) return;
    window.gnPresencaGuardiao({
      sbUrl: _gnPresSbUrl(),
      sbKey: _gnPresSbKey(),
      sessao: s,
      aoSair: function () {
        try { localStorage.removeItem('gn_session_v1'); } catch (e) {}
        location.reload();
      },
    });
  } catch (e) { if (window.gnLogError) window.gnLogError('presenca:autoArmar', e); }
}
if (document.readyState === 'complete') setTimeout(_gnPresAutoArmar, 1200);
else window.addEventListener('load', () => setTimeout(_gnPresAutoArmar, 1200));
