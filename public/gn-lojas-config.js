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

// ── Entrada de carne que na verdade é contagem ─────────────────────────────
// Caso real (Norte Shopping, semana de 28/09): a loja contou o estoque na terça e lançou o
// mesmo número em três campos — estoque inicial, contagem do dia e ENTRADA do dia. As quatro
// carnes de uma vez. Resultado: 405 kg de entrada que nunca chegaram, e a venda estimada,
// que existe justamente pra apontar perda, apontando 533 kg onde o certo eram 320.
//
// O sinal é simples e forte: entrada idêntica à contagem daquele dia, ou ao estoque inicial.
// Entrega bate nesses números por coincidência quase nunca — ainda mais com casas decimais.
// Entregas de verdade quase sempre chegam pela automação, que grava autoEnt_<dia> junto;
// quando esse par existe e confere, o valor é da automação e não se questiona.
//
// Avisa, nunca bloqueia: quem está com a carne na mão sabe mais do que esta regra.
// Devolve null quando não há suspeita, ou o motivo em texto quando há.
window.gnEntradaCarneSuspeita = function (dadosCarne, dia) {
  if (!dadosCarne || !dia) return null;
  var num = function (v) {
    if (v === undefined || v === null || v === '') return null;
    var n = parseFloat(v);
    return isNaN(n) ? null : n;
  };
  var ent = num(dadosCarne['ent_' + dia]);
  if (ent === null || ent <= 0) return null;

  // Valor que a automação escreveu naquele dia: se a entrada ainda é ele, veio de entrega
  // conferida e não é digitação.
  var auto = num(dadosCarne['autoEnt_' + dia]);
  if (auto !== null && Math.abs(auto - ent) < 0.005) return null;

  var igual = function (a, b) { return a !== null && b !== null && Math.abs(a - b) < 0.005; };
  if (igual(ent, num(dadosCarne[dia])))      return 'igual à contagem deste dia';
  if (igual(ent, num(dadosCarne.inicial)))   return 'igual ao estoque inicial da semana';
  return null;
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

// gn_pedidos.regiao guarda duas coisas ao mesmo tempo: a região de compra E o tipo de
// pedido. O semanal usa 'RJ'/'SP'; o hortifruti tem lote próprio por dia de envio e usa
// 'HORTIFRUTI' (Rio) / 'HORTIFRUTI_SP'. Parece estranho, mas é o que mantém os quatro
// lotes separados sem coluna nova — e o RJ fica com a chave que sempre teve, então nenhum
// pedido de hortifruti já enviado muda de lugar.
window.gnPedidoRegiaoHortifruti = function (regiao) {
  return regiao === 'SP' ? 'HORTIFRUTI_SP' : 'HORTIFRUTI';
};

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
// Cargo é texto livre em gn_usuarios, e comparar por igualdade literal já custou caro:
// esta lista de reabertura nasceu com 'sub-gerente', 'subgerente' e 'sub gerente' — três
// grafias que não existem em registro nenhum — enquanto o banco guarda 'sub_gerente'.
// Os 18 sub-gerentes da rede ficaram sem reabrir caixa, sem excluir caixa aberto e sem
// assinar cancelamento, cada um lendo na tela que o cargo deles não tinha permissão.
// Ninguém reporta como bug o que parece regra da empresa.
//
// Daqui pra frente a comparação passa por aqui: hífen, underline, espaço e acento não
// decidem permissão. A lista continua sendo a fonte de QUEM pode; o normalizador só
// impede que a GRAFIA decida.
window.gnCargoNorm = function (c) {
  return String(c || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
};
window.gnCargoEm = function (cargo, lista) {
  const n = window.gnCargoNorm(cargo);
  return !!n && (lista || []).some(c => window.gnCargoNorm(c) === n);
};

window.CARGOS_SUPERVISAO       = ['supervisor','administrador'];          // autorizações idênticas às do supervisor
window.CARGOS_GESTAO           = ['gerente','sub_gerente','supervisor','administrador','compras','mestre']; // acesso amplo de gestão (app Lojas)
window.CARGOS_MASTER_EQUIV     = ['mestre','supervisor','administrador','compras']; // bypass de restrição de horário/acesso (RH, Manutenção)
window.CARGOS_INVENTARIO       = ['mestre','supervisor','administrador','admin','gerente']; // acesso ao GN Inventário
window.CARGOS_REABRIR          = ['admin','administrador','gerente','sub_gerente','supervisor','mestre']; // reabrir caixa fechado
// Quem pode assinar um cancelamento (autorizar) e a declaração de "dia sem cancelamento".
// Aponta pra CARGOS_REABRIR de propósito, em vez de repetir a lista: hoje é a mesma faixa
// — quem responde pela loja — e duplicar o rol é como as duas versões divergem meses
// depois. É decisão de negócio separada; se um dia diferir, muda aqui.
window.CARGOS_CANCELAMENTO     = window.CARGOS_REABRIR;

// ── MOTIVO DO CANCELAMENTO: CATEGORIA + DETALHE ───────────────────────────
// Os 28 primeiros cancelamentos registrados deram 28 textos diferentes — agrupar pelo
// motivo escrito não dizia nada. Pior: o campo aceitava qualquer coisa, e a própria dica
// da tela ("Ex: pedido trocado") ensinava a resposta vaga. Campo Grande escreveu
// "Troca de pedido" e "Falta"; a segunda tem cinco letras e não explica cancelamento
// nenhum. Do outro lado, Itaquera escreveu "Cancelou porque não tinha sorvete e pegou
// somente pudim" — a diferença não era a pessoa, era o que o campo pedia.
//
// Agora são dois campos: a CATEGORIA, que é o eixo do relatório, e o DETALHE, que conta o
// caso. As categorias saíram dos motivos reais, não de um palpite — a maior delas (troca
// de pedido/produto) cobre 12 dos 28.
window.GN_CANCEL_CATEGORIAS = [
  'Troca de pedido ou produto',
  'Erro de lançamento',
  'Produto em falta',
  'Cliente desistiu',
  'Problema no produto',
  'Cortesia / acerto com o cliente',
  'Outro',
];

// Mínimo do detalhe. Não é rigor por rigor: corta a resposta de uma palavra ("Falta",
// "Troca", "erro") sem barrar quem escreve curto e direto — "troca de prato" tem 14 e
// "Garçom registrou errado" tem 23, os dois passam.
window.GN_CANCEL_DETALHE_MIN = 10;

// O que vai na tela e no relatório. Linha antiga (sem categoria) mostra só o motivo, que
// é o que ela tem — some a categoria, não some a informação.
window.gnCancelMotivoTexto = function (c) {
  if (!c) return '';
  const cat = String(c.motivo_categoria || c.categoria || '').trim();
  const det = String(c.motivo || '').trim();
  if (cat && det) return cat + ' — ' + det;
  return cat || det || '';
};

// Valida o par categoria+detalhe. Devolve '' quando está bom, ou a frase pronta pra tela.
// Recusa o detalhe que só repete a categoria ("Troca de pedido" dentro de "Troca de
// pedido ou produto"): escolher a categoria não é explicar o caso.
window.gnCancelMotivoFalta = function (categoria, detalhe) {
  const cat = String(categoria || '').trim();
  const det = String(detalhe || '').trim();
  if (!cat) return 'Escolha a categoria do cancelamento.';
  if (!det) return 'Falta dizer o que aconteceu.';
  const norm = (x) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const nd = norm(det), nc = norm(cat);
  // "Repetir a categoria" é o detalhe que não acrescenta NADA: ou é a categoria dita de
  // outro jeito ("Troca de pedido" dentro de "Troca de pedido ou produto"), ou é a
  // categoria mais duas palavras de enfeite.
  //
  // Conter as palavras da categoria, por si só, não é repetir — "Cliente desistiu porque
  // demorou 40 minutos" começa pela categoria e é exatamente a explicação que se quer.
  // Barrar isso travaria o fechamento de quem está escrevendo certo, que é um estrago
  // maior do que o motivo vago que se quer evitar.
  if (nd && nc) {
    const sobra = nc.indexOf(nd) >= 0 ? '' : nd.split(nc).join('');
    if (sobra.length < 6) return 'O detalhe está repetindo a categoria — conte o que aconteceu no caso.';
  }
  if (det.length < window.GN_CANCEL_DETALHE_MIN)
    return 'Conte o que aconteceu, com um pouco mais de detalhe.';
  return '';
};
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

// ── MEIO TURNO ────────────────────────────────────────────────────────────────────────
// Um dia de meio turno paga uma FRAÇÃO da cota daquele dia: 70% no turno dia, 30% no
// turno noite. O que não foi pago não some nem fica com a pessoa — cai no pool e vai pro
// rateio de quem tem direito, pelo mesmo caminho do Jovem Aprendiz acima: como
// poolRateio = baseTotal - sumAF, reduzir a cota já joga a diferença no pool sozinha, sem
// nenhuma transferência à parte.
//
// Quem fez meio turno continua contando como UMA PESSOA INTEIRA no divisor do dia (ela
// trabalhou), continua elegível ao rateio, e aquele dia pesa 0,7/0,3 também no rateio, em
// vez de 1 — proporcional ao que foi trabalhado dos dois lados.
//
// Não tem corte por semana como o do Jovem Aprendiz: o meio turno é opção nova, nenhuma
// semana antiga tem dia marcado assim, então não há histórico pra reinterpretar.
window.GN_MEIO_TURNO_FATOR = { DIA: 0.7, NOITE: 0.3 };
window.gnMeioTurnoFator = function (turno) {
  return window.GN_MEIO_TURNO_FATOR[turno === 'NOITE' ? 'NOITE' : 'DIA'];
};
// Turno é gravado por dia, em f.turnos[d]. Func gravado antes desse campo existir, ou dia
// sem turno escolhido, vale DIA — que é o que a tela já mostra marcado.
window.gnTurnoDoDia = function (f, d) {
  return (f && f.turnos && f.turnos[d]) === 'NOITE' ? 'NOITE' : 'DIA';
};
// Quanto aquele DIA vale pra essa pessoa, juntando o fator do contrato (Jovem Aprendiz) e
// o do meio turno. Um Jovem Aprendiz em meio turno dia leva 0,5 × 0,7.
window.gnFatorDoDia = function (f, d, fatorContrato) {
  if (!f || !f.dias || f.dias[d] !== 'MEIO TURNO') return fatorContrato;
  return fatorContrato * window.gnMeioTurnoFator(window.gnTurnoDoDia(f, d));
};
// Status que PAGAM cota do dia, e status que contam como dia trabalhado pro rateio. Eram
// duas listas escritas à mão em seis arquivos; aqui elas têm nome, e o meio turno entra
// nas duas de uma vez.
// Regra combinada no CLAUDE.md: mudança pedida sem citar a Maglia pelo nome vale só pras
// 11 lojas originais. O pedido do meio turno não citou, então a opção não aparece pra ela
// — basta tirar daqui pra liberar, em qualquer um dos apps de uma vez.
window.GN_MEIO_TURNO_FORA = ['MAGLIA'];
// Mesma regra pro registro de cancelamentos no fechamento de caixa: o pedido não citou a
// Maglia, então a seção não aparece pra ela.
window.GN_CANCELAMENTO_FORA = ['MAGLIA'];
// Uma comparação só pras duas listas (e pras próximas): a chave da loja chega com caixa e
// espaços variando conforme o app, e cada cópia dessa comparação é uma chance de divergir.
window.gnLojaForaDe = function (lista, loja) {
  if (!loja) return false;   // sem loja definida, não escondo nada
  const alvo = String(loja).trim().toUpperCase();
  return (lista || []).some(k => String(k).trim().toUpperCase() === alvo);
};
window.gnMeioTurnoLiberado = function (loja) {
  return !window.gnLojaForaDe(window.GN_MEIO_TURNO_FORA, loja);
};
window.gnCancelamentoLiberado = function (loja) {
  return !window.gnLojaForaDe(window.GN_CANCELAMENTO_FORA, loja);
};
// A lista de status que a tela oferece, já sem o que não vale pra aquela loja.
window.gnStatusDaLoja = function (lista, loja) {
  return window.gnMeioTurnoLiberado(loja) ? lista : lista.filter(s => s !== 'MEIO TURNO');
};
window.GN_DIA_PAGA    = ['PRESENTE', 'HORISTA', 'JOVEM APRENDIZ', 'FOLGA', 'BANCO DE HORAS', 'FÉRIAS', 'MEIO TURNO'];
window.GN_DIA_RATEIO  = ['PRESENTE', 'HORISTA', 'FOLGA', 'BANCO DE HORAS', 'FÉRIAS', 'MEIO TURNO'];

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
    dias.forEach((dia, d) => { if (GN_DIA_PAGA.includes(f.dias[d])) bruta += dia.cotaUnit * gnFatorDoDia(f, d, fatorDia); });
    const nFS = f.dias.filter(s => ['FALTA', 'SUSPENSÃO'].includes(s)).length;
    const mult = nFS >= 2 ? 0 : nFS === 1 ? 0.5 : 1;
    const AF = bruta * mult;
    const elegivel = f.tipo !== 'JOVEM APRENDIZ' && nFS === 0 && f.dias.filter(s => s === 'ATESTADO' || s === 'JUSTIFICATIVA').length === 0 && f.dias.filter(s => GN_DIA_RATEIO.includes(s)).length > 0;
    // Dia de meio turno pesa 0,7/0,3 aqui também — o rateio acompanha o que foi
    // trabalhado, em vez de dar peso de dia cheio a quem fez metade. Vira fracionário, e
    // tudo bem: diasEleg só existe como peso dentro desta função, nunca vai pra tela.
    const diasEleg = elegivel ? f.dias.reduce((soma, st, d) => GN_DIA_RATEIO.includes(st)
      ? soma + (st === 'MEIO TURNO' ? gnMeioTurnoFator(gnTurnoDoDia(f, d)) : 1) : soma, 0) : 0;
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

// ── BANCO DE HORAS — valor da hora ───────────────────────────────────────────────────
//
// Estava só em gn-checklist.html, onde o banco de horas é lançado. Quando o Painel de
// Gestão passou a mostrar o saldo de horas das lojas, a escolha era duplicar a constante
// ou trazer a conta pra cá. Duplicar número de folha de pagamento em dois arquivos é
// como o 0,5 vira 0,6 num lado só, meses depois, sem ninguém perceber.
//
// A regra: salário do SETOR dividido por 220 dá a hora. Hora positiva (extra) é paga com
// o adicional; hora negativa é descontada pelo valor cheio, sem adicional — quem deve
// hora não deve hora extra.
window.GN_BH_ADICIONAL_EXTRA = 0.5;
window.GN_BH_HORAS_MES = 220;

window.gnBhValorHora = function (salarioSetor) {
  const s = parseFloat(salarioSetor) || 0;
  return s > 0 ? s / window.GN_BH_HORAS_MES : 0;
};

window.gnBhValorHoras = function (horas, valorHora) {
  const h = parseFloat(horas) || 0;
  const v = parseFloat(valorHora) || 0;
  if (v <= 0 || !h) return 0;
  return h > 0 ? h * v * (1 + window.GN_BH_ADICIONAL_EXTRA) : Math.abs(h) * v;
};

// ── RELATÓRIO EM PDF — padrão único de todos os apps ─────────────────────────────────
//
// Antes cada app tinha a sua cópia de gerarPDF, e as cópias já tinham divergido em três
// variantes: texto cru num <pre> monoespaçado, com um título simples em cima. Só o
// relatório do Painel de Gestão tinha cabeçalho, KPIs e tabela — e foi esse que o dono
// aprovou ("limpo e intuitivo, com a marca do GN"). Aqui esse desenho vira o padrão, e os
// nove apps passam a apontar pra cá: um lugar só pra mexer quando a marca mudar.
//
// A marca é o wordmark GN + tagline da tela de login, em TEXTO. Imagem em impressão é o
// que o navegador descarta primeiro — e um relatório que vai pra direção sem marca é
// exatamente o que não pode acontecer.
//
// Cores explícitas, não tokens: a janela de impressão é um documento novo, sem o :root do
// app. O PDF antigo usava var(--t1)/var(--s2) e só funcionava por acidente — a
// declaração caía por ser inválida e sobrava o preto no branco do navegador.
window.GN_PDF_OURO = '#CA8A04';

window.gnPdfEsc = function (s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

// Texto corrido vira estrutura legível, sem inventar dado nenhum:
//   linha que TERMINA em ':'        → título de seção
//   linha que começa com 2+ espaços → detalhe, recuado e menor
//   o resto                         → linha normal
// Tudo com pre-wrap, pra não perder alinhamento nem espaço de quem montou o texto.
window.gnPdfCorpoDeTexto = function (texto) {
  const linhas = String(texto == null ? '' : texto).split('\n');
  return linhas.map(l => {
    if (!l.trim()) return '<div class="gap"></div>';
    const esc = window.gnPdfEsc(l);
    if (/^\s{2,}/.test(l)) return `<div class="det">${esc}</div>`;
    if (/:\s*$/.test(l.trim())) return `<div class="sec">${esc}</div>`;
    return `<div class="lin">${esc}</div>`;
  }).join('');
};

// Os 25 relatórios já escrevem o próprio título na primeira linha e o "GN Operações" na
// última — eles nasceram num gerador que só tinha um <h1> simples. Com o cabeçalho e o
// rodapé do padrão novo, isso aparecia DUAS vezes, e relatório com título repetido é o
// oposto de limpo.
//
// A remoção é conservadora de propósito: a primeira linha só sai quando, normalizada,
// é IGUAL ao título — nada de parecido ou começa-com. E o rodapé do texto não é
// descartado: ele vira o rodapé do documento, no lugar do genérico.
function _gnPdfNorm(s) {
  return String(s == null ? '' : s).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[*_]/g, '').replace(/\s+/g, ' ').trim();
}
window.gnPdfSemDuplicata = function (texto, titulo) {
  const linhas = String(texto == null ? '' : texto).split('\n');
  let i = 0;
  while (i < linhas.length && !linhas[i].trim()) i++;
  if (i < linhas.length && _gnPdfNorm(linhas[i]) === _gnPdfNorm(titulo)) {
    linhas.splice(0, i + 1);
    while (linhas.length && !linhas[0].trim()) linhas.shift();
  }
  let rodape = null;
  while (linhas.length) {
    const ult = linhas[linhas.length - 1];
    if (!ult.trim()) { linhas.pop(); continue; }
    if (/^\s*GN Opera/i.test(ult)) { if (!rodape) rodape = ult.trim(); linhas.pop(); continue; }
    break;
  }
  return { texto: linhas.join('\n'), rodape: rodape };
};

window.gnPdfAgora = function () {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// opts: { titulo, subtitulo, kpis:[{label,valor,sub}], texto | html, rodape }
// `html` é pra quem já monta tabela própria (o relatório do Painel); `texto` é o caminho
// dos outros, que mandam texto corrido.
window.gnRelatorioPDF = function (opts) {
  const o = opts || {};
  const esc = window.gnPdfEsc;
  const titulo = esc(o.titulo || 'Relatório GN');
  // O <title> vira o NOME DO ARQUIVO quando se salva como PDF, então ele carrega o
  // período junto — "GN Gestão — Mensal Outubro/2026". O h1 fica sem, porque o período
  // já está logo abaixo, na linha do subtítulo.
  const tituloDoc = esc(o.tituloDoc || o.titulo || 'Relatório GN');
  const sub = esc(o.subtitulo || ('gerado em ' + window.gnPdfAgora()));
  const kpis = Array.isArray(o.kpis) ? o.kpis.filter(Boolean) : [];
  const kpiHtml = !kpis.length ? '' :
    `<div class="kpi-row" style="grid-template-columns:repeat(${Math.min(kpis.length, 3)},1fr)">
      ${kpis.map(k => `<div class="kpi">
        <div class="kpi-label">${esc(k.label)}</div>
        <div class="kpi-val">${esc(k.valor)}</div>
        ${k.sub ? `<div class="kpi-sub">${esc(k.sub)}</div>` : ''}
      </div>`).join('')}
    </div>`;
  const limpo = o.html != null ? null : window.gnPdfSemDuplicata(o.texto, o.titulo);
  const corpo = o.html != null ? o.html : window.gnPdfCorpoDeTexto(limpo.texto);
  const rodape = esc(o.rodape || (limpo && limpo.rodape) || ('GN Operações · ' + (o.titulo || '')));

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>${tituloDoc}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11pt;color:#1A1D23;background:#FFFFFF;padding:28px}
  .marca{display:flex;align-items:baseline;gap:7px;margin-bottom:14px}
  .marca-gn{font-size:15pt;font-weight:900;color:${window.GN_PDF_OURO};letter-spacing:-1px;line-height:1}
  .marca-tag{font-size:6.5pt;color:#9aa0a6;letter-spacing:2.5px;text-transform:uppercase}
  h1{font-size:17pt;font-weight:800;color:${window.GN_PDF_OURO};margin-bottom:2px}
  .sub{font-size:9pt;color:#888;margin-bottom:20px}
  .kpi-row{display:grid;gap:10px;margin-bottom:20px}
  .kpi{border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center}
  .kpi-label{font-size:7.5pt;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
  .kpi-val{font-size:14pt;font-weight:700;color:${window.GN_PDF_OURO};font-family:monospace}
  .kpi-sub{font-size:7.5pt;color:#9aa0a6;margin-top:3px;line-height:1.3}
  table{width:100%;border-collapse:collapse;margin-bottom:16px}
  thead th{padding:8px;text-align:left;font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.3px;border-bottom:2px solid ${window.GN_PDF_OURO}}
  thead th:not(:first-child){text-align:right}
  tfoot td{border-top:2px solid ${window.GN_PDF_OURO};font-weight:800}
  h2.sec{font-size:11pt;font-weight:800;margin:4px 0 8px}
  .sec{font-size:10.5pt;font-weight:800;margin:14px 0 4px;white-space:pre-wrap;word-break:break-word}
  .lin{font-size:10pt;line-height:1.5;white-space:pre-wrap;word-break:break-word}
  .det{font-size:9pt;line-height:1.45;color:#555;white-space:pre-wrap;word-break:break-word;padding-left:2px}
  .gap{height:7px}
  .footer{font-size:7.5pt;color:#aaa;border-top:1px solid #eee;padding-top:8px;margin-top:18px}
  @media print{body{padding:0}@page{margin:1.5cm}}
</style></head><body>
  <div class="marca"><span class="marca-gn">GN</span><span class="marca-tag">Sistema de Gestão</span></div>
  <h1>${titulo}</h1>
  <div class="sub">${sub}</div>
  ${kpiHtml}
  ${corpo}
  <div class="footer">${rodape}</div>
  <script>window.onload=function(){window.print()}<\/script>
</body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
};

// O que os nove apps chamam. Mantém a assinatura antiga (texto, titulo) pros 25 pontos
// de chamada que já existem; `opts` é pra quem quiser acrescentar KPIs depois.
window.gnRelatorioPDFTexto = function (texto, titulo, opts) {
  window.gnRelatorioPDF(Object.assign({ titulo: titulo, texto: texto }, opts || {}));
};

// ══════════════════════════════════════════════════════════════════════════
// SIMULAÇÃO DE ESCALA 5x2 (aba Simular 5x2 do app Check-list)
// ══════════════════════════════════════════════════════════════════════════
//
// A rede vai migrar pra 5x2 e precisa ver o estrago antes de aplicar. Esta é a parte que
// pensa; a tela só desenha o que sai daqui. Nada aqui escreve escala — a simulação mora em
// gn_escala_simulacao, tabela própria, longe de gn_comissoes.
//
// ── POR QUE UMA RÉGUA TIRADA DO HISTÓRICO, E NÃO UM TETO FIXO ──
// Um teto do tipo "no máximo R$ X por pessoa" seria chute. O que o histórico mostra é que
// cada loja JÁ opera cada dia da semana num patamar próprio, e bem diferente entre si:
//
//   Bangu, média dos últimos 90 dias
//     terça   R$  6.938 com ~20,3 pessoas  →  R$   342 por pessoa
//     domingo R$ 28.392 com ~18,4 pessoas  →  R$ 1.543 por pessoa
//
// Ou seja: a venda varia de 4 a 6 vezes na semana enquanto o número de pessoas é quase
// plano — em Bangu e na Nova América o DOMINGO, o dia mais forte, hoje tem MENOS gente
// que o sábado. A régua, então, é o que a própria loja sustenta naquele dia da semana.
// Simulação que pede mais que isso é aperto de verdade, não opinião.
//
// Os dias são índice 0..6 = segunda a domingo, a mesma ordem de COMISSOES_CAL e do campo
// `dias` de cada funcionário em gn_comissoes.
window.GN_SIM5X2_DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
// Abreviação de TRÊS letras, não a inicial: com uma letra só, segunda e sexta viram ambas
// "S" e quarta e quinta ambas "Q". Nos botões de folga, no celular, isso é a diferença
// entre folgar na segunda e folgar na sexta — e não há hover pra desempatar.
window.GN_SIM5X2_DIAS_ABREV = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
window.GN_SIM5X2_FOLGAS = 2;          // 5x2: cinco dias de trabalho, dois de folga
// Quanto a simulação pode passar do patamar histórico do dia antes de virar alerta. 15% é
// a folga que absorve variação normal de movimento; acima disso o dia está pedindo mais de
// cada pessoa do que a loja já conseguiu entregar naquele dia da semana.
window.GN_SIM5X2_APERTO = 1.15;
window.GN_SIM5X2_APERTO_GRAVE = 1.40;
// Abaixo disso é gente parada num dia fraco — não quebra nada, mas é onde a folga cabe.
window.GN_SIM5X2_SOBRA = 0.70;
// Com menos amostras que isto o patamar do dia é palpite, e o alerta se cala em vez de
// afirmar. "Não sei" é resposta; número inventado não é.
window.GN_SIM5X2_MIN_AMOSTRAS = 3;

function _gnSimMediana(arr) {
  const v = (arr || []).filter(x => typeof x === 'number' && isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// Perfil da loja por dia da semana: o que ela vende e com quanta gente, de verdade.
//
// `vendas`  : linhas de checklist_diario [{data_operacao, venda_salao, venda_delivery}]
// `semanas` : [[presentesDia0..presentesDia6], ...] — uma entrada por semana já escalada
//
// Mediana, não média: uma segunda de feriado ou um domingo de reinauguração puxam a média
// e mandariam o alerta inteiro pro lado errado.
window.gnSim5x2Perfil = function (vendas, semanas) {
  const porDia = Array.from({ length: 7 }, () => ({ vendas: [], pessoas: [] }));
  (vendas || []).forEach(r => {
    const iso = String(r.data_operacao || r.data || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    // Date com 'T12:00' evita o pulo de fuso que jogaria o dia pra véspera.
    const d = new Date(iso + 'T12:00:00');
    if (isNaN(d)) return;
    const dow = (d.getDay() + 6) % 7;                   // 0 = segunda
    const tot = (parseFloat(r.venda_salao) || 0) + (parseFloat(r.venda_delivery) || 0);
    if (tot > 0) porDia[dow].vendas.push(tot);          // dia sem venda é dia sem dado
  });
  (semanas || []).forEach(sem => {
    (sem || []).forEach((n, i) => { if (i < 7 && typeof n === 'number' && n > 0) porDia[i].pessoas.push(n); });
  });
  return porDia.map((p, i) => {
    const venda = _gnSimMediana(p.vendas);
    const pessoas = _gnSimMediana(p.pessoas);
    const amostras = Math.min(p.vendas.length, p.pessoas.length);
    return {
      dia: i, nome: window.GN_SIM5X2_DIAS[i],
      venda, pessoas,
      // A régua do dia: quanto cada pessoa carrega quando a loja roda como roda hoje.
      porPessoa: (venda && pessoas) ? venda / pessoas : null,
      amostras,
      confiavel: amostras >= window.GN_SIM5X2_MIN_AMOSTRAS,
    };
  });
};

// Distribui as folgas 5x2. Determinística de propósito: a mesma equipe e o mesmo perfil têm
// que sair sempre na mesma proposta, senão não dá pra discutir "a sugestão" com ninguém.
//
// A ideia: cada dia recebe uma COTA de folgas inversamente proporcional ao que ele vende.
// Terça folga muita gente, domingo quase ninguém. Dentro disso, as folgas de um setor são
// espalhadas entre dias diferentes — tirar o Salão inteiro na mesma terça é ruptura, por
// mais que a terça seja fraca.
window.gnSim5x2Sugerir = function (funcs, perfil) {
  const pessoas = (funcs || []).filter(f => f && f.nome);
  if (!pessoas.length) return {};
  const N = pessoas.length;
  const totalFolgas = N * window.GN_SIM5X2_FOLGAS;

  // Peso do dia = quão dispensável ele é. Dia sem venda conhecida entra com peso médio,
  // em vez de virar o depósito de folgas por falta de dado.
  const vendas = perfil.map(p => p.venda);
  const vistas = vendas.filter(v => v > 0);
  const vMedia = vistas.length ? vistas.reduce((a, b) => a + b, 0) / vistas.length : 1;
  const peso = vendas.map(v => 1 / Math.max(v > 0 ? v : vMedia, 1));
  const somaPeso = peso.reduce((a, b) => a + b, 0);
  const cota = peso.map(p => (p / somaPeso) * totalFolgas);

  // Sobra da cota por dia, consumida conforme as folgas são dadas.
  const resta = cota.slice();
  const porSetorDia = {};   // quantas folgas cada setor já deu em cada dia
  const folgas = {};

  // Ordem estável: setor, depois nome. Sem isso a proposta muda a cada carregamento.
  const ordem = pessoas.map((f, i) => ({ f, i }))
    .sort((a, b2) => String(a.f.setor || '').localeCompare(String(b2.f.setor || ''), 'pt-BR')
                  || String(a.f.nome || '').localeCompare(String(b2.f.nome || ''), 'pt-BR'));

  ordem.forEach(({ f, i }) => {
    const setor = String(f.setor || '—');
    porSetorDia[setor] = porSetorDia[setor] || Array(7).fill(0);
    const escolhidos = [];
    for (let k = 0; k < window.GN_SIM5X2_FOLGAS; k++) {
      let melhor = -1, melhorNota = -Infinity;
      for (let d = 0; d < 7; d++) {
        if (escolhidos.includes(d)) continue;           // duas folgas em dias diferentes
        // Nota: o que ainda cabe de folga no dia, penalizado pelo que o setor já tirou ali.
        const nota = resta[d] - porSetorDia[setor][d] * 1.5;
        if (nota > melhorNota) { melhorNota = nota; melhor = d; }
      }
      if (melhor < 0) break;
      escolhidos.push(melhor);
      resta[melhor] -= 1;
      porSetorDia[setor][melhor] += 1;
    }
    folgas[i] = escolhidos.sort((a, b2) => a - b2);
  });
  return folgas;
};

// O que a simulação produz por dia, e onde ela aperta.
//
// `folgas` é {indiceDoFunc: [dia, dia]}. Quem não aparece no mapa trabalha os 7 dias — o
// que é um cenário válido de comparação (é a escala de hoje), não um erro.
window.gnSim5x2Avaliar = function (funcs, folgas, perfil) {
  const pessoas = (funcs || []).map((f, i) => ({ f, i })).filter(x => x.f && x.f.nome);
  const setores = [...new Set(pessoas.map(x => String(x.f.setor || '—')))].sort();
  const dias = [];
  for (let d = 0; d < 7; d++) {
    const trabalham = pessoas.filter(x => !((folgas || {})[x.i] || []).includes(d));
    const porSetor = {};
    setores.forEach(s => { porSetor[s] = trabalham.filter(x => String(x.f.setor || '—') === s).length; });
    const p = perfil[d] || {};
    const porPessoa = (p.venda && trabalham.length) ? p.venda / trabalham.length : null;
    // Razão entre o que a simulação pede de cada pessoa e o que a loja já sustenta nesse
    // dia. 1,0 = igual a hoje. 1,5 = cada pessoa carregando 50% a mais.
    const razao = (porPessoa && p.porPessoa) ? porPessoa / p.porPessoa : null;
    dias.push({
      dia: d, nome: window.GN_SIM5X2_DIAS[d],
      pessoas: trabalham.length, porSetor,
      vendaEsperada: p.venda || null, porPessoa, razao,
      pessoasHoje: p.pessoas || null, porPessoaHoje: p.porPessoa || null,
      confiavel: !!p.confiavel,
    });
  }
  return { dias, setores, alertas: window.gnSim5x2Alertas(dias, setores, perfil) };
};

// Os alertas. Cada um diz o DIA, o QUÊ e o QUANTO — alerta sem número não se discute.
window.gnSim5x2Alertas = function (dias, setores, perfil) {
  const out = [];
  const brl = n => 'R$ ' + Math.round(n).toLocaleString('pt-BR');
  dias.forEach(d => {
    if (!d.pessoas) {
      out.push({ dia: d.dia, nivel: 'grave', tipo: 'sem_ninguem',
        msg: `${d.nome}: ninguém escalado.` });
      return;
    }
    // Setor que a loja sempre teve e a simulação zera: isso não é aperto, é ruptura.
    setores.forEach(s => {
      if (d.porSetor[s] === 0) {
        out.push({ dia: d.dia, nivel: 'grave', tipo: 'ruptura_setor', setor: s,
          msg: `${d.nome}: ${s} fica sem ninguém.` });
      }
    });
    if (!d.confiavel) {
      out.push({ dia: d.dia, nivel: 'info', tipo: 'sem_historico',
        msg: `${d.nome}: histórico curto demais pra comparar — não dá pra dizer se aperta.` });
      return;
    }
    if (d.razao >= window.GN_SIM5X2_APERTO) {
      const pct = Math.round((d.razao - 1) * 100);
      out.push({
        dia: d.dia,
        nivel: d.razao >= window.GN_SIM5X2_APERTO_GRAVE ? 'grave' : 'atencao',
        tipo: 'apertada',
        msg: `${d.nome}: ${d.pessoas} pessoas pra ${brl(d.vendaEsperada)} — ${brl(d.porPessoa)} por pessoa, ${pct}% acima do que a loja costuma segurar nesse dia (${brl(d.porPessoaHoje)}, com ${d.pessoasHoje}).`,
      });
    } else if (d.razao <= window.GN_SIM5X2_SOBRA) {
      const pct = Math.round((1 - d.razao) * 100);
      out.push({ dia: d.dia, nivel: 'sobra', tipo: 'folgada',
        msg: `${d.nome}: ${d.pessoas} pessoas pra ${brl(d.vendaEsperada)} — ${pct}% mais folgado que o normal da loja. É aqui que cabe folga.` });
    }
  });
  const ordem = { grave: 0, atencao: 1, sobra: 2, info: 3 };
  return out.sort((a, b) => ordem[a.nivel] - ordem[b.nivel] || a.dia - b.dia);
};

// O número que decide a conversa: 5x2 com o quadro de hoje dá conta?
//
// Cada pessoa num 5x2 entrega 5 dias por semana. A loja precisa, por semana, da soma das
// pessoas que ela usa em cada dia (pessoa-dias). Dividir um pelo outro dá o quadro mínimo
// pra manter o patamar ATUAL de cada dia — e a diferença pro quadro de hoje é o buraco.
//
// Em Bangu isso dá 139 pessoa-dias por semana (17+20+20+20+22+23+17) ÷ 5 = 28 pessoas,
// contra as 22 de hoje. Sem esse número, a simulação mostra sete dias apertados sem dizer
// que o aperto é aritmético: 22 pessoas em 5x2 não cobrem a semana que a loja opera hoje.
window.gnSim5x2Resumo = function (funcs, folgas, perfil) {
  const pessoas = (funcs || []).filter(f => f && f.nome).length;
  const comBase = (perfil || []).filter(p => p.confiavel && p.pessoas);
  const pessoaDiasHoje = comBase.reduce((a, p) => a + p.pessoas, 0);
  const diasSemBase = 7 - comBase.length;
  // Pessoa-dias que a simulação entrega: cada um trabalha 7 menos as folgas dele.
  const entregues = (funcs || []).reduce((a, f, i) => {
    if (!f || !f.nome) return a;
    return a + (7 - (((folgas || {})[i] || []).length));
  }, 0);
  const quadroNecessario = pessoaDiasHoje ? Math.ceil(pessoaDiasHoje / (7 - window.GN_SIM5X2_FOLGAS)) : null;
  return {
    pessoas,
    pessoaDiasHoje: pessoaDiasHoje || null,
    pessoaDiasSimulados: entregues,
    quadroNecessario,
    // Positivo = faltam pessoas pra manter o patamar de hoje com 5x2.
    faltam: quadroNecessario == null ? null : Math.max(0, quadroNecessario - pessoas),
    sobram: quadroNecessario == null ? null : Math.max(0, pessoas - quadroNecessario),
    // Quantos dias ficaram de fora da conta por falta de histórico — sem isso o "faltam N"
    // pareceria exato quando é parcial.
    diasSemBase,
  };
};

// ── O DOMINGO É OUTRO BICHO ────────────────────────────────────────────────
//
// O domingo não é só o dia que mais vende: é o dia em que a lei tira gente da loja.
// O descanso dominical não é igual pra todo mundo —
//   mulher: folga num domingo a cada 15 dias (trabalha um sim, outro não);
//   homem:  um domingo de folga por mês.
// Então duas lojas com o mesmo número de pessoas têm domingos diferentes conforme quantas
// mulheres cada uma tem. É a conta que ninguém fazia na hora de montar a escala, e o
// motivo de o domingo "furar" sempre.
//
// Este cálculo é de um DOMINGO MÉDIO: qual domingo do mês cai na semana simulada muda o
// número exato. A tela diz isso — número redondo sem a ressalva vira promessa.
window.GN_SIM5X2_DOM_FOLGAS_MULHER = 2;   // domingos de folga por mês
window.GN_SIM5X2_DOM_FOLGAS_HOMEM  = 1;
window.GN_SIM5X2_DOMINGOS_MES      = 52 / 12;   // ≈ 4,33 domingos por mês
window.GN_SIM5X2_DOM_IDX           = 6;         // domingo é o índice 6 (segunda = 0)

// `folgas` é o mapa da simulação: parte da obrigação de domingo pode já estar coberta por
// quem a simulação mandou folgar nesse dia. O que interessa pra operação é o que AINDA
// vai faltar — é esse o número que vira extra.
window.gnSim5x2Domingo = function (funcs, folgas) {
  const pessoas = (funcs || []).map((f, i) => ({ f, i })).filter(x => x.f && x.f.nome);
  const sexo = x => String(x.f.sexo || '').toUpperCase();
  const mulheres = pessoas.filter(x => sexo(x) === 'F');
  const homens   = pessoas.filter(x => sexo(x) === 'M');
  const semInfo  = pessoas.filter(x => sexo(x) !== 'F' && sexo(x) !== 'M');

  const D = window.GN_SIM5X2_DOMINGOS_MES;
  const porDireitoF = mulheres.length * (window.GN_SIM5X2_DOM_FOLGAS_MULHER / D);
  const porDireitoM = homens.length   * (window.GN_SIM5X2_DOM_FOLGAS_HOMEM  / D);
  const porDireito  = porDireitoF + porDireitoM;

  const jaFolgam = pessoas.filter(x =>
    ((folgas || {})[x.i] || []).includes(window.GN_SIM5X2_DOM_IDX)).length;

  return {
    pessoas: pessoas.length,
    mulheres: mulheres.length,
    homens: homens.length,
    semInfo: semInfo.length,
    // Quantos a loja perde no domingo por direito de folga, num domingo médio.
    porDireito: Math.round(porDireito * 10) / 10,
    porDireitoMulheres: Math.round(porDireitoF * 10) / 10,
    porDireitoHomens: Math.round(porDireitoM * 10) / 10,
    jaFolgam,
    // O que a simulação ainda NÃO previu — é daqui que sai o pedido de extra.
    aMais: Math.max(0, Math.ceil(porDireito - jaFolgam)),
    // Sem o sexo de todo mundo, o número é piso e não total: quem falta só pode somar.
    completo: semInfo.length === 0,
  };
};

// A frase que vai pra tela e pro relatório. Separada do cálculo porque é ela que o dono lê.
window.gnSim5x2DomingoTexto = function (dom) {
  if (!dom || !dom.pessoas) return '';
  if (dom.mulheres === 0 && dom.homens === 0) {
    return `Domingo: ninguém com sexo informado ainda — sem isso não dá pra calcular as folgas de domingo (${dom.semInfo} pessoa${dom.semInfo === 1 ? '' : 's'} a preencher na Escala).`;
  }
  const n = x => String(x).replace('.', ',');
  let t = `Domingo: ${dom.mulheres} ${dom.mulheres === 1 ? 'mulher' : 'mulheres'} e ${dom.homens} ${dom.homens === 1 ? 'homem' : 'homens'} — por direito de folga dominical saem ~${n(dom.porDireito)} pessoas num domingo médio (${n(dom.porDireitoMulheres)} delas + ${n(dom.porDireitoHomens)} deles).`;
  t += dom.aMais > 0
    ? ` A simulação já folga ${dom.jaFolgam} nesse dia, então ainda faltariam ~${dom.aMais} — é o tamanho do extra.`
    : ` A simulação já folga ${dom.jaFolgam} nesse dia, o que cobre a obrigação.`;
  if (dom.semInfo > 0) t += ` ${dom.semInfo} pessoa${dom.semInfo === 1 ? '' : 's'} ainda sem sexo informado: o número tende a subir.`;
  return t;
};

// O domingo da tabela conta quem a SIMULAÇÃO escalou. Mas parte dessa gente vai estar de
// folga por direito, e o número real é menor. Sem este alerta a tabela mostrava domingo
// confortável ao lado de um aviso dizendo que faltariam 5 pessoas — duas afirmações
// opostas na mesma tela, e a verde é a que o olho acredita.
window.gnSim5x2AlertaDomingo = function (dias, dom, perfil) {
  if (!dom || !dom.aMais) return null;
  const d = (dias || []).find(x => x.dia === window.GN_SIM5X2_DOM_IDX);
  const p = (perfil || [])[window.GN_SIM5X2_DOM_IDX];
  if (!d || !p || !p.confiavel || !d.vendaEsperada) return null;
  const real = Math.max(0, d.pessoas - dom.aMais);
  const brl = n => 'R$ ' + Math.round(n).toLocaleString('pt-BR');
  if (!real) {
    return { dia: window.GN_SIM5X2_DOM_IDX, nivel: 'grave', tipo: 'domingo_direito',
      msg: `Domingo: com as folgas de direito, a loja ficaria sem ninguém.` };
  }
  const porPessoa = d.vendaEsperada / real;
  const razao = p.porPessoa ? porPessoa / p.porPessoa : null;
  const pct = razao ? Math.round((razao - 1) * 100) : null;
  return {
    dia: window.GN_SIM5X2_DOM_IDX,
    nivel: razao >= window.GN_SIM5X2_APERTO_GRAVE ? 'grave'
         : razao >= window.GN_SIM5X2_APERTO ? 'atencao' : 'sobra',
    tipo: 'domingo_direito',
    msg: `Domingo de verdade: a tabela mostra ${d.pessoas}, mas com as folgas de direito sobram ~${real} — ${brl(porPessoa)} por pessoa${pct == null ? '' : `, ${pct >= 0 ? pct + '% acima' : (-pct) + '% abaixo'} do normal da loja`}. Cobrir com ~${dom.aMais} extra${dom.aMais === 1 ? '' : 's'} devolve o domingo ao patamar da tabela.`,
  };
};

// ── JORNADA, 42 HORAS E O BANCO QUE TEM QUE ZERAR ──────────────────────────
//
// O banco de horas só funciona se ele FECHA. A regra da casa: 42 horas semanais
// trabalhadas; o que passar disso é hora extra que entra no banco e precisa ser
// compensada com folga até o fim do ciclo de 6 meses — todo mundo 0 a 0.
//
// Daí vem a pergunta que a simulação tem que responder antes de a escala valer: a 5x2
// desta loja cabe em 42h por pessoa? Se não couber, o banco não "aperta um pouco" — ele
// cresce toda semana e, no fim do ciclo, vira uma dívida que só se paga com folga (o que
// reabre o buraco) ou com hora extra em dinheiro.
//
// Em números reais: Guarulhos precisa de 48,4h por pessoa/semana. São +6,4h por semana,
// 167h em seis meses, 20 dias de folga por pessoa só pra zerar. Não é disciplina, é
// aritmética — e é melhor descobrir no rascunho.
window.GN_SIM5X2_META_SEMANAL = 42;     // horas trabalhadas por semana, por pessoa
window.GN_SIM5X2_TETO_DIA     = 10;     // limite legal por dia (8h + 2h extras)
window.GN_SIM5X2_BANCO_MESES  = 6;      // ciclo do banco de horas
window.GN_SIM5X2_BANCO_SEMANAS = 26;

// `horasDia` é a jornada diária simulada. Vem preenchida com a que a loja já pratica e é
// editável — é o botão que o dono quis: "e se todo mundo fizer 8h30?".
window.gnSim5x2Horas = function (funcs, folgas, perfil, horasDia) {
  const h = Number(horasDia) || 0;
  const pessoas = (funcs || []).map((f, i) => ({ f, i })).filter(x => x.f && x.f.nome);
  const META = window.GN_SIM5X2_META_SEMANAL;

  const porPessoa = pessoas.map(x => {
    const dias = 7 - (((folgas || {})[x.i] || []).length);
    const semana = dias * h;
    return {
      i: x.i, nome: x.f.nome, setor: x.f.setor || '—',
      dias, semana,
      excedente: semana - META,
      acimaDoTeto: h > window.GN_SIM5X2_TETO_DIA,
    };
  });

  // O que a LOJA precisa entregar por semana, pelo histórico: pessoa-dias × jornada.
  const comBase = (perfil || []).filter(p => p.confiavel && p.pessoas);
  const pessoaDias = comBase.reduce((a, p) => a + p.pessoas, 0);
  const horasNecessarias = pessoaDias * h;
  // Dividido pela equipe, é o que cada um teria que fazer pra loja rodar como roda hoje.
  //
  // Sem pessoa-dias no histórico isto DEVE ser null, não zero: zero fazia a conta dar
  // "0h por semana, dentro das 42h — o banco fecha 0 a 0", que é a tranquilização mais
  // perigosa que esta tela podia dar. Loja sem histórico não tem veredito.
  const porPessoaNecessaria = (pessoas.length && pessoaDias)
    ? horasNecessarias / pessoas.length : null;

  const excedenteSemanal = porPessoaNecessaria == null ? null : porPessoaNecessaria - META;
  const bancoCiclo = excedenteSemanal == null ? null : excedenteSemanal * window.GN_SIM5X2_BANCO_SEMANAS;
  // Pra zerar, a folga vale um dia de meta (42h ÷ 5 dias).
  const diasPraZerar = (bancoCiclo == null || bancoCiclo <= 0) ? 0 : bancoCiclo / (META / 5);

  return {
    horasDia: h,
    meta: META,
    // Jornada que faria 42h exatas em 5 dias — a âncora da conversa (8h24).
    jornadaDaMeta: META / 5,
    porPessoa,
    entregueSemana: porPessoa.reduce((a, p) => a + p.semana, 0),
    horasNecessarias: horasNecessarias || null,
    porPessoaNecessaria,
    excedenteSemanal,
    bancoCiclo,
    diasPraZerar,
    fecha: excedenteSemanal == null ? null : excedenteSemanal <= 0,
    acimaDoTeto: h > window.GN_SIM5X2_TETO_DIA,
    semBase: comBase.length < 7,
  };
};

window.gnSim5x2HorasTexto = function (hr) {
  if (!hr || hr.porPessoaNecessaria == null) {
    return 'Sem histórico suficiente pra dizer quantas horas por pessoa a semana exige.';
  }
  const f1 = n => (Math.round(n * 10) / 10).toString().replace('.', ',');
  let t = `Pra loja rodar como roda hoje, cada pessoa precisaria de ${f1(hr.porPessoaNecessaria)}h por semana`;
  if (hr.fecha) {
    t += ` — dentro das ${hr.meta}h. O banco fecha 0 a 0 no ciclo.`;
  } else {
    t += `, ${f1(hr.excedenteSemanal)}h acima das ${hr.meta}h. Isso vira ${f1(hr.bancoCiclo)}h de banco por pessoa em ${window.GN_SIM5X2_BANCO_MESES} meses — ${f1(hr.diasPraZerar)} dias de folga só pra zerar.`;
  }
  if (hr.acimaDoTeto) t += ` ⚠ A jornada simulada (${f1(hr.horasDia)}h/dia) passa do teto legal de ${window.GN_SIM5X2_TETO_DIA}h por dia.`;
  return t;
};
