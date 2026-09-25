// Fonte canônica de lojas — atualizar aqui reflete em todos os apps
// trioSlug: slug usado na tabela gn_trios_agenda (bandas/trios) — sempre igual a lojaSlug
// (Norte Shopping já usou 'norte' no passado, mas a tabela hoje só tem 'norte_shopping'
// gravado — confirmado direto no banco; manter os dois campos separados só por precaução
// caso surja outra exceção real no futuro).
// municipio: cidade onde a loja fica, usada pelos feriados locais (ver GN_MUNICIPIOS e
// gnFeriadosLocais abaixo). Pedreira fica em Nova Iguaçu, na Baixada — não no município
// do Rio, apesar de existir um bairro Pedreira na cidade do Rio (confirmado com o usuário).
window.GN_LOJAS = [
  { display:'Bangu',          userKey:'BANGU',         chkKey:'Bangu',          comKey:'BANGU',        lojaSlug:'bangu',          trioSlug:'bangu',        cor:'#b81a1a', regiao:'RJ', municipio:'RIO' },
  { display:'Caxias',         userKey:'CAXIAS',        chkKey:'Caxias',         comKey:'CAXIAS',       lojaSlug:'caxias',         trioSlug:'caxias',       cor:'#1a6bbd', regiao:'RJ', municipio:'DUQUE_DE_CAXIAS' },
  { display:'São Gonçalo',    userKey:'SÃO GONÇALO',   chkKey:'São Gonçalo',    comKey:'SAO_GONCALO',  lojaSlug:'sao_goncalo',    trioSlug:'sao_goncalo',  cor:'#8B1A8B', regiao:'RJ', municipio:'SAO_GONCALO' },
  { display:'Norte Shopping', userKey:'NORTE SHOPPING',chkKey:'Norte Shopping', comKey:'NORTE',        lojaSlug:'norte_shopping', trioSlug:'norte_shopping', cor:'#1a7a4a', regiao:'RJ', municipio:'RIO' },
  { display:'Boulevard',      userKey:'BOULEVARD',     chkKey:'Boulevard',      comKey:'BOULEVARD',    lojaSlug:'boulevard',      trioSlug:'boulevard',    cor:'#b85a00', regiao:'RJ', municipio:'RIO' },
  { display:'Nova Iguaçu',    userKey:'RANCHO',        chkKey:'Rancho',         comKey:'RANCHO',       lojaSlug:'nova_iguacu',    trioSlug:'nova_iguacu',  cor:'#0e7490', regiao:'RJ', municipio:'NOVA_IGUACU' },
  { display:'Pedreira',       userKey:'PEDREIRA',      chkKey:'Pedreira',       comKey:'PEDREIRA',     lojaSlug:'pedreira',       trioSlug:'pedreira',     cor:'#7c3aed', regiao:'RJ', municipio:'NOVA_IGUACU' },
  { display:'Nova América',   userKey:'NOVA AMERICA',  chkKey:'Nova América',   comKey:'NOVA_AMERICA', lojaSlug:'nova_america',   trioSlug:'nova_america', cor:'#b45309', regiao:'RJ', municipio:'RIO' },
  { display:'Campo Grande',   userKey:'CAMPO GRANDE',  chkKey:'Campo Grande',   comKey:'CAMPO_GRANDE', lojaSlug:'campo_grande',   trioSlug:'campo_grande', cor:'#065f46', regiao:'RJ', municipio:'RIO' },
  { display:'Itaquera',       userKey:'ITAQUERA',      chkKey:'Itaquera',       comKey:'ITAQUERA',     lojaSlug:'itaquera',       trioSlug:'itaquera',     cor:'#be123c', regiao:'SP', municipio:'SAO_PAULO' },
  { display:'Guarulhos',      userKey:'GUARULHOS',     chkKey:'Guarulhos',      comKey:'GUARULHOS',    lojaSlug:'guarulhos',      trioSlug:'guarulhos',    cor:'#1e40af', regiao:'SP', municipio:'GUARULHOS' },
  // Operação independente (cardápio e gorjetas próprios), gerida pelo grupo — mesmo
  // controle das demais lojas. Sem município: feriado local é assunto que ainda não foi
  // combinado pra ela (regra do CLAUDE.md — Maglia só entra quando for citada).
  { display:'Maglia',         userKey:'MAGLIA',        chkKey:'Maglia',         comKey:'MAGLIA',       lojaSlug:'maglia',         trioSlug:'maglia',       cor:'#059669', regiao:'RJ', municipio:null },
];

// ── Feriados locais (estaduais e municipais) ───────────────────────────────
// Feriado nacional e data comemorativa continuam na lista DATAS_ESPECIAIS_BASE de cada
// app — valem pra rede inteira. O que está aqui é o contrário: só vale pra quem é
// daquele estado/município, e mostrar pra todo mundo só atrapalhava (a loja de Itaquera
// não fecha no São Jorge, a de Bangu não fecha no aniversário de SP).
// Dia e mês fixos: o ano entra na hora, então não precisa de manutenção ano a ano.
window.GN_MUNICIPIOS = {
  RIO:             { nome: 'Rio de Janeiro',  uf: 'RJ' },
  DUQUE_DE_CAXIAS: { nome: 'Duque de Caxias', uf: 'RJ' },
  SAO_GONCALO:     { nome: 'São Gonçalo',     uf: 'RJ' },
  NOVA_IGUACU:     { nome: 'Nova Iguaçu',     uf: 'RJ' },
  SAO_PAULO:       { nome: 'São Paulo',       uf: 'SP' },
  GUARULHOS:       { nome: 'Guarulhos',       uf: 'SP' },
};

window.GN_FERIADOS_ESTADUAIS = {
  RJ: [{ dm: '04-23', nome: 'São Jorge' }],
  SP: [{ dm: '07-09', nome: 'Revolução Constitucionalista' }],
};

window.GN_FERIADOS_MUNICIPAIS = {
  RIO:             [{ dm: '01-20', nome: 'São Sebastião' }, { dm: '12-08', nome: 'N. Sra. da Conceição' }],
  DUQUE_DE_CAXIAS: [{ dm: '12-31', nome: 'Aniversário de Duque de Caxias' }],
  SAO_GONCALO:     [{ dm: '09-22', nome: 'Aniversário de São Gonçalo' }],
  NOVA_IGUACU:     [{ dm: '01-15', nome: 'Aniversário de Nova Iguaçu' }],
  SAO_PAULO:       [{ dm: '01-25', nome: 'Aniversário de São Paulo' }],
  GUARULHOS:       [{ dm: '12-08', nome: 'N. Sra. da Conceição (padroeira)' }],
};

// Aceita qualquer chave de loja em uso nos apps (userKey do login, chkKey do Check-list,
// comKey das comissões ou o slug do pedido) — cada app guarda a loja de um jeito.
window.gnLojaPorChave = function (chave) {
  if (!chave) return null;
  const k = String(chave);
  return (window.GN_LOJAS || []).find(l =>
    l.userKey === k || l.chkKey === k || l.comKey === k || l.lojaSlug === k || l.display === k) || null;
};

// ── Região de compra (RJ / SP) ─────────────────────────────────────────────
// Itaquera e Guarulhos compram em São Paulo: preço e fornecedor do mesmo item são outros.
// Por isso o catálogo do app Estoque e Pedido é separado por região (gn_catalogo.regiao),
// e o pedido de cada região é um pedido próprio (gn_pedidos.regiao) — assim o de SP nunca
// gera provisão com preço do RJ, nem aparece junto no confirmar.
// Espelha gn_lojas_pedido.regiao, que já marca essas duas como SP. Tudo que não for uma
// dessas duas é RJ, inclusive o Mandacaru (destino interno, nem está em GN_LOJAS) e a
// Maglia — quem não está no mapa cai no padrão em vez de ficar sem região.
window.GN_REGIOES = ['RJ', 'SP'];
window.GN_REGIAO_PADRAO = 'RJ';
window.gnRegiaoLoja = function (chave) {
  const loja = window.gnLojaPorChave(chave);
  return (loja && loja.regiao) || window.GN_REGIAO_PADRAO;
};
window.gnRegiaoLabel = function (r) { return r === 'SP' ? 'São Paulo' : 'Rio de Janeiro'; };

// Feriados locais de UMA loja no ano — é o que a loja (e só ela) precisa ver.
window.gnFeriadosLocais = function (chaveLoja, ano) {
  const loja = window.gnLojaPorChave(chaveLoja);
  const mun = loja && loja.municipio;
  if (!mun) return [];
  const info = window.GN_MUNICIPIOS[mun] || {};
  const out = [];
  ((window.GN_FERIADOS_ESTADUAIS || {})[info.uf] || []).forEach(f =>
    out.push({ data: ano + '-' + f.dm, nome: f.nome, tipo: 'estadual', escopo: info.uf, lojas: [] }));
  ((window.GN_FERIADOS_MUNICIPAIS || {})[mun] || []).forEach(f =>
    out.push({ data: ano + '-' + f.dm, nome: f.nome, tipo: 'municipal', escopo: info.nome, lojas: [] }));
  return out;
};

// Linha de contexto do feriado local, usada igual nos três apps que mostram as datas
// especiais (Check-list, Home e Estoque e Pedido).
window.gnFeriadoLocalDetalhe = function (f) {
  if (!f || (f.tipo !== 'municipal' && f.tipo !== 'estadual')) return '';
  if (f.lojas && f.lojas.length) {
    return f.lojas.length <= 3 ? 'só ' + f.lojas.join(', ') : f.escopo + ' · ' + f.lojas.length + ' lojas';
  }
  return f.tipo === 'estadual' ? 'feriado estadual ' + f.escopo : 'feriado municipal · ' + f.escopo;
};

// Mesma coisa pra quem enxerga a rede inteira (Compras e Painel de Gestão): uma linha por
// data, dizendo quais lojas param — sem isso o Compras perderia a data ao montar o pedido
// das outras lojas.
window.gnFeriadosLocaisRede = function (ano) {
  const porChave = {};
  (window.GN_LOJAS || []).filter(l => l.municipio).forEach(loja => {
    window.gnFeriadosLocais(loja.userKey, ano).forEach(f => {
      const k = f.data + '|' + f.nome;
      if (!porChave[k]) porChave[k] = { ...f, lojas: [] };
      porChave[k].lojas.push(loja.display);
    });
  });
  return Object.values(porChave).sort((a, b) => a.data.localeCompare(b.data));
};

// ── Buffet de feijoada e rodízio ───────────────────────────────────────────
// Fonte única dos preços e das regras de dia, usada pelo app Caixa (lançamento da
// quantidade vendida no fechamento) e pelo Painel de Gestão do Home (valor no card da
// loja). Mudar um preço aqui reflete nos dois — nenhum dos apps repete esses números.
window.GN_BUFFET_PRECOS = {
  feijoada: { inteira: 69.90, meia: 34.95 },                 // só sexta e sábado
  rodizio: {
    semana:      { inteira: 79.90, meia: 39.95 },            // segunda a sexta
    fimDeSemana: { inteira: 89.90, meia: 44.95 },            // sábado e domingo
  },
};

// RODÍZIO: lojas onde a quantidade é OBRIGATÓRIA pra fechar o caixa. Nas demais o campo
// aparece igual, mas não trava o fechamento.
window.GN_BUFFET_OBRIGATORIO = ['BOULEVARD', 'BANGU', 'SÃO GONÇALO', 'PEDREIRA', 'CAMPO GRANDE']; // userKey

// A Maglia é operação independente e não trabalha com buffet/rodízio: nem vê o campo.
window.GN_BUFFET_FORA = ['MAGLIA']; // userKey

// Quais quantidades travam o fechamento do caixa naquele dia, por loja.
// A FEIJOADA é obrigatória em TODA loja que trabalha com buffet (não depende da lista
// acima), nos dias em que ela é servida; o RODÍZIO só nas lojas de GN_BUFFET_OBRIGATORIO.
// Em ambos os casos, zero é resposta válida — o que trava é o campo em branco, pra
// diferenciar "não vendeu nenhum" de "esqueceu de lançar".
window.gnBuffetCamposObrigatorios = function(userKey, dow) {
  if (window.GN_BUFFET_FORA.includes(userKey)) return [];
  const campos = [];
  if (window.gnBuffetTemFeijoada(dow)) campos.push('feijoada_inteira', 'feijoada_meia');
  if (window.GN_BUFFET_OBRIGATORIO.includes(userKey)) campos.push('rodizio_inteira', 'rodizio_meia');
  return campos;
};

// dow: 0=Dom .. 6=Sáb (use new Date(iso + 'T12:00').getDay(), nunca o UTC).
window.gnBuffetTemFeijoada = function(dow) { return dow === 5 || dow === 6; };
window.gnBuffetPrecoRodizio = function(dow) {
  return (dow === 0 || dow === 6)
    ? window.GN_BUFFET_PRECOS.rodizio.fimDeSemana
    : window.GN_BUFFET_PRECOS.rodizio.semana;
};
window.gnBuffetDow = function(dataISO) { return new Date(dataISO + 'T12:00').getDay(); };

// Converte as quantidades de um fechamento no valor em R$, já usando o preço do dia.
// `qtds` aceita as colunas cruas de gn_caixa_fechamento (feijoada_inteira, feijoada_meia,
// rodizio_inteira, rodizio_meia); null/undefined contam como 0.
window.gnBuffetValores = function(qtds, dow) {
  const n = v => Math.max(0, parseInt(v, 10) || 0);
  const F = window.GN_BUFFET_PRECOS.feijoada, R = window.gnBuffetPrecoRodizio(dow);
  const fI = n(qtds && qtds.feijoada_inteira), fM = n(qtds && qtds.feijoada_meia);
  const rI = n(qtds && qtds.rodizio_inteira),  rM = n(qtds && qtds.rodizio_meia);
  const feijoada = fI * F.inteira + fM * F.meia;
  const rodizio  = rI * R.inteira + rM * R.meia;
  return { feijoadaQtd: fI + fM, rodizioQtd: rI + rM, feijoada, rodizio, total: feijoada + rodizio };
};

// Slug usado em gn_trios_agenda a partir do comKey — helper compartilhado
// entre gn-checklist.html, gn-rh.html e demais apps que consultam bandas/trios.
window.trioLojaSlugByComKey = function(comKey) {
  const l = window.GN_LOJAS.find(x => x.comKey === comKey);
  return l ? l.trioSlug : null;
};

// ── Grupos de cargo compartilhados entre apps ──────────────────────────────
// Fonte única de quem tem quais autorizações. Antes, cada cargo elevado (ex.:
// "administrador") precisava ser adicionado manualmente em ~15 lugares
// espalhados por 7 arquivos — bastava esquecer um pra deixar um app com
// permissão inconsistente. Daqui pra frente, mudar o acesso de um cargo é
// editar só aqui.
window.CARGOS_SUPERVISAO       = ['supervisor','administrador'];          // autorizações idênticas às do supervisor
window.CARGOS_GESTAO           = ['gerente','sub_gerente','supervisor','administrador','compras','mestre']; // acesso amplo de gestão (app Lojas)
window.CARGOS_MASTER_EQUIV     = ['mestre','supervisor','administrador','compras']; // bypass de restrição de horário/acesso (RH, Manutenção)
window.CARGOS_INVENTARIO       = ['mestre','supervisor','administrador','admin','gerente']; // acesso ao GN Inventário
window.CARGOS_REABRIR          = ['admin','administrador','gerente','sub-gerente','subgerente','sub gerente','supervisor','mestre']; // reabrir caixa fechado
window.CARGOS_RH_LIVRE         = ['mestre','supervisor','administrador','compras','admin','gerente']; // sem restrição de horário no GN RH
window.CARGOS_CAIXA_BYPASS     = ['gerente','mestre','admin'];            // bypass de permissão no módulo Caixa (Home)
window.CARGOS_PUSH_TODAS_LOJAS = ['compras','supervisor','administrador','mestre']; // push notification sem filtro de loja
window.CARGOS_ALTERNAR_LOJA    = ['compras','supervisor','administrador']; // pode alternar loja ativa no app Lojas

// ── Log de erro compartilhado para sincronizações entre apps ──────────────
// Antes, falhas nesses pontos (fetch que retorna HTTP não-ok, ex.: tabela
// renomeada/removida, ou exceção de rede) eram engolidas em silêncio por
// `.catch(()=>[])`/`.catch(()=>({}))`, sem deixar rastro nenhum — foi assim
// que o card de manutenções do Painel de Gestão ficou incorreto por tempo
// indeterminado até alguém comparar manualmente com o app Manutenção.
// gnFetchJson loga no console (contexto + causa) sempre que a resposta não
// for ok ou a requisição falhar, mas mantém o mesmo fallback de antes —
// nenhum comportamento visível muda, só passa a ficar rastreável.
window.gnLogError = function(context, err) {
  console.error('[GN:' + context + ']', (err && err.message) ? err.message : err);
};
window.gnFetchJson = async function(url, headers, context, fallback, fetchOpts) {
  try {
    const r = await fetch(url, Object.assign({ headers }, fetchOpts));
    if (!r.ok) { window.gnLogError(context, 'HTTP ' + r.status + ' — ' + url); return fallback; }
    return await r.json();
  } catch (e) {
    window.gnLogError(context, e);
    return fallback;
  }
};

// Sobe uma foto (data URI base64, já comprimida no cliente) pro bucket gn-fotos do
// Storage e devolve a URL pública — padrão compartilhado pra ir substituindo, app por
// app, o armazenamento de foto como base64 direto em coluna/JSON. `pasta` organiza por
// funcionalidade (ex.: 'manut-gastos', 'caixa-fechamento'). Lança erro se falhar —
// quem chama decide se aborta o salvamento ou segue sem foto.
window.gnUploadFotoStorage = async function(supaUrl, supaKey, pasta, dataUri) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUri || '');
  if (!m) throw new Error('Formato de foto inválido');
  const mime = m[1];
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ext = mime.split('/')[1] || 'jpg';
  const nome = pasta + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 9) + '.' + ext;
  const r = await fetch(supaUrl + '/storage/v1/object/gn-fotos/' + nome, {
    method: 'POST',
    headers: { apikey: supaKey, Authorization: 'Bearer ' + supaKey, 'Content-Type': mime },
    body: bytes,
  });
  if (!r.ok) throw new Error('Falha ao subir foto (HTTP ' + r.status + ')');
  return supaUrl + '/storage/v1/object/public/gn-fotos/' + nome;
};

// Remove uma foto do Storage a partir da URL pública salva (best-effort — chamado ao
// excluir o registro dono da foto; falha aqui não deve travar a exclusão do registro).
window.gnDeleteFotoStorage = async function(supaUrl, supaKey, url) {
  const prefixo = supaUrl + '/storage/v1/object/public/gn-fotos/';
  if (!url || !url.startsWith(prefixo)) return;
  const caminho = url.slice(prefixo.length);
  try {
    await fetch(supaUrl + '/storage/v1/object/gn-fotos/' + caminho, {
      method: 'DELETE',
      headers: { apikey: supaKey, Authorization: 'Bearer ' + supaKey },
    });
  } catch (e) {
    window.gnLogError('storage:delete', e);
  }
};

// Escapa texto livre antes de inserir em innerHTML (nomes, observações, motivos etc.)
// — evita que caracteres como <, >, & quebrem o layout ou injetem HTML.
window.escapeHtml = function(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// ── Compartilhado entre gn-comissoes e gn-comissoes-mestra ────────────────
const ADM = 50;

function fmtBRL(v) {
  if (isNaN(v) || v == null) v = 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}
function fmtBRLShort(v) {
  if (isNaN(v) || v == null) v = 0;
  return 'R$ ' + new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}
function fmtBRLDia(v) {
  if (isNaN(v) || v == null || v === 0) return '—';
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}
function parseBRL(v) {
  if (!v) return 0;
  v = String(v).trim().replace(/R\$\s*/g, '').trim();
  if (v.includes(',') && v.includes('.')) {
    if (v.lastIndexOf(',') > v.lastIndexOf('.')) v = v.replace(/\./g, '').replace(',', '.');
    else v = v.replace(/,/g, '');
  } else if (v.includes(',')) {
    const parts = v.split(',');
    if (parts[parts.length - 1].length <= 2) v = v.replace(',', '.');
    else v = v.replace(/,/g, '');
  }
  return parseFloat(v) || 0;
}

// Quanto da cota do dia cada tipo de contrato leva. O Jovem Aprendiz leva METADE do dia
// trabalhado; a outra metade não some nem fica com ele — cai no pool e vai pra
// distribuição dos demais (ele nunca entra nesse rateio, ver `elegivel` em calcSemana).
// Como poolRateio = baseTotal - sumAF, reduzir a cota dele já joga a metade liberada no
// pool sozinha, sem precisar de nenhuma transferência à parte.
window.GN_GORJETA_FATOR_DIA = { 'JOVEM APRENDIZ': 0.5 };
// A regra da meia cota vale da semana 38 (14/09 a 20/09/2026) EM DIANTE. Semanas
// anteriores continuam calculando como sempre calcularam, senão abrir uma semana já paga
// mostraria um valor diferente do que a loja efetivamente pagou na época — o app não
// guarda foto do que foi pago, recalcula tudo na hora a partir dos dados crus.
// O número aqui é o ÍNDICE interno da semana (a chave usada em all_data), que é o número
// mostrado na tela menos 2: semana 38 na tela = índice 36.
window.GN_GORJETA_JA_METADE_DESDE_SEM = 36;
// `semIdx` ausente = semana não identificada; nesse caso vale a regra NOVA, que é a regra
// corrente do negócio — o corte acima é uma cortesia com o histórico, não o padrão.
window.gnGorjetaFatorDia = function(tipo, semIdx) {
  const f = window.GN_GORJETA_FATOR_DIA[tipo];
  if (typeof f !== 'number') return 1;
  // null/undefined/'' são "semana não identificada" — não podem virar Number(null)===0 e
  // cair no lado ANTIGO do corte, que é o oposto do padrão que queremos.
  if (semIdx === null || semIdx === undefined || semIdx === '') return f;
  const idx = Number(semIdx);
  if (Number.isFinite(idx) && idx < window.GN_GORJETA_JA_METADE_DESDE_SEM) return 1;
  return f;
};

function calcSemana(wd, saldoAnt = 0) {
  const ativos = wd.funcs.filter(f => f.nome.trim());
  const nAtivos = ativos.length;
  const dias = Array.from({ length: 7 }, (_, d) => {
    const e90 = (parseFloat(wd.brutos[d]) || 0) * 0.9;
    const I = ativos.filter(f => f.dias[d] !== 'NÃO TRABALHADO' && f.dias[d] !== 'AFASTAMENTO').length;
    return { e90, cotaUnit: I > 0 ? e90 / I : 0, I };
  });
  const funcCalc = ativos.map(f => {
    // O Jovem Aprendiz continua contando como uma pessoa inteira no divisor do dia
    // (`I` acima) — o que muda é só quanto ele leva da própria cota. `wd.semIdx` é gravado
    // por quem monta a semana (getWD/getWDLoja) e decide se a semana já está sob a regra
    // nova; as telas leem o `fatorDia` daqui em vez de recalcular, pra tela e conta nunca
    // divergirem.
    const fatorDia = gnGorjetaFatorDia(f.tipo, wd.semIdx);
    let bruta = 0;
    dias.forEach((dia, d) => { if (['PRESENTE', 'HORISTA', 'JOVEM APRENDIZ', 'FOLGA', 'BANCO DE HORAS', 'FÉRIAS'].includes(f.dias[d])) bruta += dia.cotaUnit * fatorDia; });
    const nFS = f.dias.filter(s => ['FALTA', 'SUSPENSÃO'].includes(s)).length;
    const mult = nFS >= 2 ? 0 : nFS === 1 ? 0.5 : 1;
    const AF = bruta * mult;
    const elegivel = f.tipo !== 'JOVEM APRENDIZ' && nFS === 0 && f.dias.filter(s => s === 'ATESTADO' || s === 'JUSTIFICATIVA').length === 0 && f.dias.filter(s => ['PRESENTE', 'HORISTA', 'FOLGA', 'BANCO DE HORAS', 'FÉRIAS'].includes(s)).length > 0;
    const diasEleg = elegivel ? f.dias.filter(s => ['PRESENTE', 'HORISTA', 'FOLGA', 'BANCO DE HORAS', 'FÉRIAS'].includes(s)).length : 0;
    return { ...f, bruta, mult, AF, elegivel, diasEleg, nFS, fatorDia };
  });
  const baseTotal = dias.reduce((s, d) => s + d.e90, 0);
  const sumAF = funcCalc.reduce((s, f) => s + f.AF, 0);
  const poolRateio = Math.max(0, baseTotal - sumAF);
  const saldoTotal = poolRateio + saldoAnt;
  const vD = parseFloat(wd.vDist) || 0;
  const efetivo = wd.dist === 'SIM' ? (vD > 0 ? Math.min(vD, saldoTotal) : saldoTotal) : 0;
  const retido = saldoTotal - efetivo;
  const totalDE = funcCalc.reduce((s, f) => s + f.diasEleg, 0);
  const nPagantes = funcCalc.filter(f => f.AF > 0).length;
  const ff = funcCalc.map(f => {
    const rateio = f.elegivel && totalDE > 0 ? efetivo * f.diasEleg / totalDE : 0;
    const cota = f.AF + rateio;
    const adm = nPagantes > 0 && f.AF > 0 ? ADM / nPagantes : 0;
    return { ...f, rateio, cota, adm, liquido: cota - adm };
  });
  return { dias, funcCalc: ff, baseTotal, poolRateio, saldoAnt, saldoTotal, efetivo, retido, nAtivos, pct: saldoTotal > 0 ? efetivo / saldoTotal : 0 };
}
