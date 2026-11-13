/* ══════════════════════════════════════════════════════════════════════════════════════
   CHECK-LIST DA VISITA — Supervisão salão, Supervisão cozinha e Auditoria de padrão
   (13/11/2026, etapa 1 da mudança pedida pelo dono)

   POR QUE SAIU DO CHECK-LIST DA LOJA
   Morava em checklist_diario.supervisao / supervisao_cozinha / auditorias_padrao — a MESMA
   linha do dia da loja, que todo aparelho da loja regrava a cada 30 s e que a recarga troca
   pelo que está no servidor. Medido no banco: em agosto, 5 visitas de check-list terminaram
   com os itens VAZIOS; em 13/11 a Boulevard tinha uma visita aberta com 1 item gravado.
   "As marcações somem às vezes" era isso.

   COMO É AGORA
   - Cada visita tem o PRÓPRIO registro (gn_visita_checklist, uma linha por visita + tipo).
     Nenhum aparelho da loja escreve nele.
   - Cada marcação é gravada SOZINHA (função gn_visita_ck_set, que mexe só no caminho daquele
     item): dois aparelhos marcando itens diferentes não se apagam.
   - O que ainda não subiu fica numa fila neste aparelho e é reaplicado por cima do que vier
     do servidor ao reabrir — a marcação feita sem internet não some na recarga.
   - Os dados guardam o MESMO formato de antes (itens por setor, notaFinal, fechada…), então o
     histórico antigo do checklist_diario abre na mesma tela, só pra leitura.

   As definições (setores, itens, pesos, críticos e as contas de nota) são cópia fiel das do
   app Check-list (gn-checklist.html, SUP_SETORES / COZ_SETORES / AUDITORIA_PADRAO_TIPOS).
   ══════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── Definições ─────────────────────────────────────────────────────────────────────
  const SUP_SETORES = [
    { key: 'visual', label: 'Padrão Visual', icon: '👁', itens: [
      { key: 'limpeza_geral', label: 'Limpeza geral do salão, piso, mesas e cadeiras', peso: 1 },
      { key: 'uniformes', label: 'Funcionários uniformizados, com crachá e cabelos presos', peso: 1 },
      { key: 'iluminacao', label: 'Iluminação completa — lâmpadas e fachada funcionando', peso: 1 },
      { key: 'organizacao', label: 'Organização e layout das mesas', peso: 1 },
      { key: 'banheiros', label: 'Higiene dos banheiros (papel, sabonete, odor)', peso: 1 },
    ] },
    { key: 'operacao', label: 'Operação', icon: '⚙️', itens: [
      { key: 'mise_en_place', label: 'Mise en place das praças completa', peso: 1 },
      { key: 'equipamentos', label: 'Equipamentos funcionando (geladeiras, freezers, fritadeiras)', peso: 1 },
      { key: 'estoque_org', label: 'Estoque organizado — PVPS aplicado', peso: 1 },
      { key: 'camaras', label: 'Câmaras frias limpas, organizadas e temperatura registrada', peso: 1 },
      { key: 'etiquetas', label: 'Máquina de etiquetas funcionando com insumos', peso: 1 },
    ] },
    { key: 'validade', label: 'Segurança Alimentar e Validades', icon: '🔬', itens: [
      { key: 'val_cozinha', label: 'Validades em dia na cozinha — nenhum produto vencido', peso: 3, critico: true, peso_label: '⚡ Peso 3×' },
      { key: 'val_estoque', label: 'Validades em dia no estoque — nenhum produto vencido', peso: 3, critico: true, peso_label: '⚡ Peso 3×' },
      { key: 'val_copa', label: 'Validades em dia na copa/bar — bebidas e frutas', peso: 3, critico: true, peso_label: '⚡ Peso 3×' },
      { key: 'val_salao', label: 'Validades em dia nos produtos expostos no salão', peso: 2, critico: true, peso_label: '⚡ Peso 2×' },
      { key: 'higiene_pessoal', label: 'Higiene pessoal dos manipuladores de alimentos', peso: 1 },
      { key: 'temp_registradas', label: 'Temperaturas dos equipamentos registradas no dia', peso: 1 },
    ] },
    { key: 'atendimento', label: 'Atendimento e Equipe', icon: '👥', itens: [
      { key: 'postura', label: 'Postura e cordialidade da equipe com clientes', peso: 1 },
      { key: 'tempo_resposta', label: 'Tempo de resposta — pedidos entregues no prazo', peso: 1 },
      { key: 'conhecimento', label: 'Equipe conhece cardápio e promoções do dia', peso: 1 },
      { key: 'reservas', label: 'Reservas conferidas, mesas montadas e confirmadas', peso: 1 },
    ] },
    { key: 'documentacao', label: 'Documentação e Controles', icon: '📄', itens: [
      { key: 'licenca', label: 'Licença de funcionamento — vigente e afixada', peso: 2, critico: true, peso_label: '⚡ Peso 2×' },
      { key: 'bombeiro', label: 'Laudo do Corpo de Bombeiros — vigente', peso: 2, critico: true, peso_label: '⚡ Peso 2×' },
      { key: 'dedetizacao', label: 'Certificado de dedetização — vigente', peso: 2, critico: true, peso_label: '⚡ Peso 2×' },
      { key: 'coifa', label: 'Registro de limpeza da coifa — em dia', peso: 2, peso_label: '⚡ Peso 2×' },
      { key: 'extintores', label: 'Extintores com validade em dia — quantidade e tipos corretos', peso: 2, peso_label: '⚡ Peso 2×' },
      { key: 'relatorios', label: 'Relatórios diários e controles preenchidos corretamente', peso: 1 },
    ] },
    { key: 'delivery_financeiro', label: 'Delivery e Financeiro', icon: '🛵', itens: [
      { key: 'plataformas', label: 'iFood e 99Food online e operacionais', peso: 1 },
      { key: 'embalagens', label: 'Estoque de embalagens suficiente para operação', peso: 1 },
      { key: 'maquinetas', label: 'Máquinas de cartão testadas e funcionando', peso: 1 },
      { key: 'boletos', label: 'Boletos em dia e lançados no sistema', peso: 1 },
    ] },
  ];

  const COZ_SETORES = [
    { key: 'documentacao', label: '1. Documentação e Gestão Legal', icon: '📄', itens: [
      { key: 'lsf', label: 'Licença Sanitária de Funcionamento (LSF) do IVISA-RIO atualizada, válida e fixada em local visível', critico: true },
      { key: 'pops', label: 'Manual de Boas Práticas e POPs impressos, assinados e acessíveis a toda a equipe na cozinha', critico: true },
      { key: 'pragas', label: 'Laudo de controle de pragas (desinsetização/desratização) com registro no INEA-RJ vigente', critico: true },
      { key: 'reservatorio', label: 'Comprovante de higienização do reservatório de água (validade máx. 6 meses) e laudo de potabilidade', critico: true },
      { key: 'planilhas', label: 'Planilhas de monitoramento diário de temperatura (refrigeração, congelamento e passeres) preenchidas sem rasuras' },
    ] },
    { key: 'higiene_pessoal', label: '2. Higiene Pessoal e Conduta da Equipe', icon: '🧑‍🍳', itens: [
      { key: 'adornos', label: 'Ausência total de adornos (anéis, alianças, brincos, piercings visíveis, relógios, correntes) em todos os manipuladores', critico: true },
      { key: 'unhas', label: 'Unhas curtas, limpas, sem esmalte e sem base protetora transparente' },
      { key: 'uniformes', label: 'Uniformes limpos e completos, sapatos fechados antiderrapantes e cabelos 100% cobertos por redes/tocas' },
      { key: 'celulares', label: 'Celulares terminantemente proibidos e guardados fora das áreas de manipulação e bancadas', critico: true },
    ] },
    { key: 'ambientes', label: '3. Higiene de Ambientes e Equipamentos', icon: '🧼', itens: [
      { key: 'pias', label: 'Pias exclusivas para lavagem de mãos abastecidas com sabonete líquido antisséptico e papel toalha não reciclável', critico: true },
      { key: 'lixeiras', label: 'Lixeiras com tampas, acionadas exclusivamente por pedal em pleno funcionamento (sem contato manual)' },
      { key: 'janelas', label: 'Janelas com telas milimétricas limpas, ajustadas e totalmente sem rasgos' },
      { key: 'borrachas', label: 'Borrachas de vedação de geladeiras e freezers limpas, sem presença de mofo, bolor ou rasgos' },
      { key: 'coifas', label: 'Coifas e dutos limpos, sem acúmulo ou gotejamento de gordura sobre superfícies ou alimentos', critico: true },
    ] },
    { key: 'rastreabilidade', label: '4. Rastreabilidade e Armazenamento', icon: '📦', itens: [
      { key: 'papelao', label: 'Eliminação completa de caixas de papelão originais em áreas úmidas (geladeiras, freezers e pré-preparo)' },
      { key: 'etiquetagem', label: 'Etiquetagem rigorosa de insumos abertos: nome, marca, data de abertura e nova validade secundária', critico: true },
      { key: 'separacao', label: 'Separação vertical correta em geladeiras: prontos para consumo no topo, semiprontos no meio, crus na base', critico: true },
      { key: 'afastamento', label: 'Alimentos estocados na despensa devidamente afastados do piso (mínimo 15cm), paredes e teto' },
      { key: 'quimicos', label: 'Produtos químicos de limpeza trancados em armário próprio, isolados de qualquer tipo de alimento', critico: true },
    ] },
  ];

  const AUDP_PRAZO_DIAS = { CRITICO: 1, MAIOR: 2, MENOR: 5 };
  const AUDP_TIPOS = [
    { key: 'seguranca_alimentos', icon: '🧪', label: 'Segurança de Alimentos e Boas Práticas', itens: [
      { peso: 5, crit: 'CRITICO', label: 'Todos os produtos em uso (abertos ou fracionados) possuem a etiqueta de validade secundária preenchida corretamente e dentro do prazo?' },
      { peso: 5, crit: 'CRITICO', label: 'Existe separação física clara e identificação entre insumos crus (carnes) e prontos para consumo (saladas/molhos) nas geladeiras para evitar contaminação cruzada?' },
      { peso: 3, crit: 'MAIOR', label: 'As temperaturas dos equipamentos de refrigeração e congelamento estão sendo registradas em planilha/sistema pelo menos 3 vezes ao dia?' },
      { peso: 1, crit: 'MENOR', label: 'O estoque adota rigorosamente o sistema PVPS (Primeiro que Vence, Primeiro que Sai)?' },
      { peso: 1, crit: 'MENOR', label: 'A pia de lavagem de mãos exclusiva dos funcionários está abastecida com sabão antisséptico, papel toalha e lixeira de pedal funcionando?' },
    ] },
    { key: 'calibracao_equipamentos', icon: '🔧', label: 'Calibração de Equipamentos e Manutenção Preventiva', itens: [
      { peso: 3, crit: 'MAIOR', label: 'As borrachas de vedação (gaxetas) de todas as geladeiras, balcões frios e câmaras estão inteiras, sem rasgos e vedando 100%?' },
      { peso: 3, crit: 'MAIOR', label: 'Os filtros das coifas e do sistema de exaustão estão limpos, sem saturação ou gotejamento de gordura (risco de incêndio)?' },
      { peso: 1, crit: 'MENOR', label: 'Os motores dos freezers e geladeiras estão livres de poeira e com espaço adequado nas laterais para ventilação?' },
      { peso: 1, crit: 'MENOR', label: 'O sistema de iluminação de todas as áreas de trabalho, estoque e salão está 100% funcional (sem lâmpadas queimadas)?' },
    ] },
    { key: 'los_jornada_cliente', icon: '⏱', label: 'L.O.S. (Jornada do Cliente e Tempo)', itens: [
      { peso: 3, crit: 'MAIOR', label: 'O tempo total de atendimento (do momento da fila até receber o produto) ficou dentro da meta estabelecida da rede durante o horário de pico?' },
      { peso: 3, crit: 'MAIOR', label: 'O banheiro dos clientes foi verificado e estava limpo, odorizado, com papel higiênico, sabonete e lixeira vazia?' },
      { peso: 3, crit: 'MAIOR', label: 'A temperatura interna do alimento está ideal para consumo imediato no momento da entrega (comida quente / bebida gelada)?' },
      { peso: 3, crit: 'MAIOR', label: 'A montagem e a apresentação visual do prato/embalagem estão idênticas à foto oficial do manual de marca?' },
      { peso: 1, crit: 'MENOR', label: 'Os atendentes utilizaram a frase de saudação oficial da empresa e demonstraram cordialidade durante o atendimento?' },
      { peso: 1, crit: 'MENOR', label: 'As mesas, cadeiras e o chão do salão foram limpos e higienizados em até 3 minutos após a saída do cliente anterior?' },
      { peso: 1, crit: 'MENOR', label: 'A fachada do restaurante, letreiros externos e menus digitais estão limpos, acesos e sem avarias visíveis?' },
    ] },
    { key: 'prevencao_perdas', icon: '🛡', label: 'Prevenção de Perdas, Segurança e Caixa', itens: [
      { peso: 5, crit: 'CRITICO', label: 'Todas as câmeras do circuito interno de TV (CFTV) estão ligadas e gravando, sem pontos cegos nas áreas críticas (caixas, cofres e estoques)?' },
      { peso: 5, crit: 'CRITICO', label: 'As portas de saída de emergência estão completamente desobstruídas e com as barras antipânico funcionando perfeitamente?' },
      { peso: 3, crit: 'MAIOR', label: 'Foi realizado um inventário surpresa de "gaveta de caixa" durante o turno e o valor físico bateu com o saldo do sistema operacional?' },
      { peso: 3, crit: 'MAIOR', label: 'O relatório de cancelamentos de cupons e itens do dia anterior foi assinado pelo gerente e possui a justificativa de cada operação anexada?' },
      { peso: 3, crit: 'MAIOR', label: 'O limite máximo de dinheiro permitido na gaveta do caixa foi respeitado (comprovando que as sangrias periódicas foram feitas)?' },
      { peso: 1, crit: 'MENOR', label: 'O cofre do restaurante permanece trancado e o segredo/chave é de conhecimento exclusivo das pessoas autorizadas do turno?' },
      { peso: 1, crit: 'MENOR', label: 'O lixo ensacado do restaurante é inspecionado visualmente pela supervisão antes de ser levado para a lixeira externa?' },
    ] },
    { key: 'gestao_pessoas', icon: '👥', label: 'Gestão de Pessoas, Clima e Cultura', itens: [
      { peso: 5, crit: 'CRITICO', label: '100% dos funcionários em serviço estão utilizando os EPIs obrigatórios para suas funções (sapato antiderrapante, malha de aço, protetor térmico)?' },
      { peso: 3, crit: 'MAIOR', label: 'Os cartões de ponto dos funcionários do período anterior estão assinados e sem marcações manuais pendentes de correção?' },
      { peso: 1, crit: 'MENOR', label: 'Os funcionários estão com uniformes completos, limpos, passados e utilizando a rede/touca de cabelo adequadamente?' },
      { peso: 1, crit: 'MENOR', label: 'O refeitório/área de descanso dos funcionários está limpo, organizado e com água potável disponível para consumo?' },
      { peso: 1, crit: 'MENOR', label: 'O mural de avisos internos do restaurante está atualizado com as metas do mês, escala de folgas e campanhas vigentes?' },
    ] },
  ];

  const TIPOS = {
    salao: { label: 'Supervisão salão', curto: 'Salão', icon: '🎯' },
    cozinha: { label: 'Supervisão cozinha', curto: 'Cozinha', icon: '🧼' },
    padrao: { label: 'Auditoria de padrão', curto: 'Auditoria', icon: '🔍' },
  };

  // ── Contas (as mesmas do Check-list) ───────────────────────────────────────────────
  const vazio = v => v === undefined || v === null || v === '';
  function calcSalao(d) {
    let pontos = 0, pesoTotal = 0; const criticos = [];
    const itens = (d && d.itens) || {};
    SUP_SETORES.forEach(s => s.itens.forEach(it => {
      const val = (itens[s.key] || {})[it.key];
      if (vazio(val)) return;
      const nota = parseFloat(val) || 0, peso = it.peso || 1;
      pontos += nota * peso; pesoTotal += 10 * peso;
      if (it.critico && nota < 7) criticos.push({ chave: s.key + '|' + it.key, setor: s.label, label: it.label, nota, peso });
    }));
    return { nota: pesoTotal ? Math.round(pontos / pesoTotal * 100) : null, criticos };
  }
  function classSalao(nota) {
    if (nota === null) return { label: 'Preencha a avaliação', cor: 'var(--t3)' };
    if (nota >= 90) return { label: '⭐ Excelente', cor: '#16a34a' };
    if (nota >= 75) return { label: '✅ Dentro do Padrão', cor: '#2563eb' };
    if (nota >= 60) return { label: '⚠️ Atenção', cor: '#d97706' };
    return { label: '🚨 Crítico', cor: '#dc2626' };
  }
  function calcCozinha(d) {
    let c = 0, total = 0; const criticos = [];
    const itens = (d && d.itens) || {};
    COZ_SETORES.forEach(s => s.itens.forEach(it => {
      const val = (itens[s.key] || {})[it.key];
      if (!val || val === 'NA') return;
      total++;
      if (val === 'C') c++;
      else if (val === 'NC' && it.critico) criticos.push({ chave: s.key + '|' + it.key, setor: s.label, label: it.label });
    }));
    return { nota: total ? Math.round(c / total * 100) : null, criticos };
  }
  function classCozinha(pct, temCritico) {
    if (pct === null) return { label: 'Preencha a avaliação', cor: 'var(--t3)' };
    if (temCritico) return { label: '🚨 Crítico — risco de interdição', cor: '#dc2626' };
    if (pct >= 95) return { label: '⭐ Excelente', cor: '#16a34a' };
    if (pct >= 80) return { label: '✅ Dentro do Padrão', cor: '#2563eb' };
    if (pct >= 60) return { label: '⚠️ Atenção', cor: '#d97706' };
    return { label: '🚨 Crítico', cor: '#dc2626' };
  }
  function calcPadrao(d, tipoKey) {
    const banco = AUDP_TIPOS.find(t => t.key === tipoKey);
    const aud = (d && d[tipoKey]) || { itens: {} };
    let somaSim = 0, somaTotal = 0, reprovadaCritica = false, avaliados = 0;
    banco.itens.forEach((it, idx) => {
      const r = ((aud.itens || {})[idx] || {}).resp;
      if (!r || r === 'NA') return;
      avaliados++; somaTotal += it.peso;
      if (r === 'SIM') somaSim += it.peso;
      else if (it.crit === 'CRITICO') reprovadaCritica = true;
    });
    const nota = somaTotal > 0 ? Math.round(somaSim / somaTotal * 1000) / 10 : null;
    let status = null;
    if (nota !== null || reprovadaCritica) {
      if (reprovadaCritica) status = 'reprovado_critico';
      else if (nota >= 95) status = 'excelente';
      else if (nota >= 85) status = 'atencao';
      else status = 'critico';
    }
    return { nota, status, reprovadaCritica, avaliados, total: banco.itens.length };
  }
  function infoPadrao(status) {
    return ({
      excelente: { cor: '#16a34a', emoji: '🟢', label: 'Excelente — Loja padrão Ouro' },
      atencao: { cor: '#d97706', emoji: '🟡', label: 'Atenção — plano de ação obrigatório' },
      critico: { cor: '#dc2626', emoji: '🔴', label: 'Crítico — revalidação obrigatória em até 7 dias' },
      reprovado_critico: { cor: '#dc2626', emoji: '🔴', label: 'Reprovado — item crítico não conforme (revalidação em até 7 dias)' },
    })[status] || { cor: 'var(--t3)', emoji: '⚪', label: 'Sem itens avaliados ainda' };
  }

  // ── Persistência ───────────────────────────────────────────────────────────────────
  // Quem usa passa a conexão e os ganchos da tela (const/let do app não ficam em window).
  const CFG = { url: null, key: null, registrar: null, fecharSobreposta: null, quem: null };
  function config(o) { Object.assign(CFG, o || {}); }
  const URL_ = () => CFG.url || window.GN_SB_URL, KEY = () => CFG.key || window.GN_SB_KEY;
  const H = (extra) => Object.assign({ apikey: KEY(), Authorization: 'Bearer ' + KEY(), 'Content-Type': 'application/json' }, extra || {});
  const LS = id => 'gn_vck_v1_' + id;
  const lerLocal = id => { try { return JSON.parse(localStorage.getItem(LS(id)) || 'null'); } catch (e) { return null; } };
  const gravarLocal = (id, o) => { try { localStorage.setItem(LS(id), JSON.stringify(o)); } catch (e) {} };

  function setPath(obj, path, valor) {
    let o = obj;
    for (let i = 0; i < path.length - 1; i++) {
      if (!o[path[i]] || typeof o[path[i]] !== 'object') o[path[i]] = {};
      o = o[path[i]];
    }
    const k = path[path.length - 1];
    if (valor === null || valor === undefined) delete o[k]; else o[k] = valor;
  }
  const clone = v => JSON.parse(JSON.stringify(v));

  // O registro aberto: { linha, dados, fila:[{path,valor}|{patch}], enviando }
  let R = null;
  let _abrindo = false;
  let _tentarDeNovo = null;

  async function _req(caminho, opts) {
    const r = await fetch(URL_() + '/rest/v1/' + caminho, opts);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }
  async function buscarOuCriar(visita, tipo) {
    const q = `gn_visita_checklist?visita_id=eq.${encodeURIComponent(visita.id)}&tipo=eq.${tipo}&select=*`;
    let rows = await _req(q, { headers: H() });
    if (rows && rows[0]) return rows[0];
    try {
      rows = await _req('gn_visita_checklist', { method: 'POST', headers: H({ Prefer: 'return=representation' }),
        body: JSON.stringify({ visita_id: visita.id, loja: visita.loja, data: visita.data, tipo, visitante: visita.visitante || null }) });
      if (rows && rows[0]) return rows[0];
    } catch (e) { /* outro aparelho criou no mesmo instante: lê de novo */ }
    rows = await _req(q, { headers: H() });
    if (rows && rows[0]) return rows[0];
    throw new Error('não deu pra criar o check-list');
  }

  function _salvarLocal() { if (R && R.linha && R.linha.id) gravarLocal(R.linha.id, { dados: R.dados, fila: R.fila }); }
  function set(path, valor) {
    if (!R || R.somenteLeitura) return;
    setPath(R.dados, path, valor);
    const p = path.map(String), k = JSON.stringify(p);
    // A mesma casa gravada de novo (nota que muda a cada toque, texto corrigido) substitui o
    // pedido que ainda não saiu — desde que nada no meio mexa num caminho parente dela.
    const parente = (a, b) => a.length !== b.length && a.slice(0, Math.min(a.length, b.length)).every((x, i) => x === b[i]);
    for (let i = R.fila.length - 1; i >= (R.enviando ? 1 : 0); i--) {
      const op = R.fila[i];
      if (op.path && JSON.stringify(op.path) === k) { R.fila.splice(i, 1); break; }
      if (op.path && parente(op.path, p)) break;
    }
    R.fila.push({ path: p, valor: valor === undefined ? null : valor });
    _salvarLocal();
    _enviar();
  }
  function patchLinha(corpo) {
    if (!R || R.somenteLeitura) return;
    Object.assign(R.linha, corpo);
    R.fila.push({ patch: corpo });
    _salvarLocal();
    _enviar();
  }
  async function _enviar() {
    if (!R || R.enviando) return;
    R.enviando = true;
    const alvo = R;
    try {
      while (alvo.fila.length) {
        const op = alvo.fila[0];
        if (op.patch) {
          await _req(`gn_visita_checklist?id=eq.${alvo.linha.id}`, { method: 'PATCH', headers: H({ Prefer: 'return=minimal' }), body: JSON.stringify(op.patch) });
        } else {
          await _req('rpc/gn_visita_ck_set', { method: 'POST', headers: H(), body: JSON.stringify({ p_id: alvo.linha.id, p_path: op.path, p_valor: op.valor }) });
        }
        alvo.fila.shift();
        gravarLocal(alvo.linha.id, { dados: alvo.dados, fila: alvo.fila });
      }
      alvo.erro = false;
    } catch (e) {
      alvo.erro = true;
      clearTimeout(_tentarDeNovo);
      _tentarDeNovo = setTimeout(() => { if (R === alvo) _enviar(); }, 5000);
    } finally {
      alvo.enviando = false;
      _pintarSync();
    }
  }
  window.addEventListener('online', () => { if (R) _enviar(); });

  // ── Tela ───────────────────────────────────────────────────────────────────────────
  const esc = s => (window.escapeHtml ? window.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s));
  const attr = s => esc(s).replace(/`/g, '&#96;');
  let _ctx = null;   // { visita, tipo, somenteLeitura, legado:{...} }
  let _padraoTipo = AUDP_TIPOS[0].key;
  let _opts = {};

  function _modal() {
    let m = document.getElementById('_vck-modal');
    if (m) return m;
    m = document.createElement('div');
    m.id = '_vck-modal';
    m.style.cssText = 'position:fixed;inset:0;background:var(--s1,#fff);z-index:10000;overflow-y:auto;-webkit-overflow-scrolling:touch';
    document.body.appendChild(m);
    m._vckRegistrado = typeof CFG.registrar === 'function';
    if (m._vckRegistrado) CFG.registrar(m);
    // O "voltar" do celular tira a tela por fora (popstate): percebe e avisa quem abriu.
    const obs = new MutationObserver(() => { if (!m.isConnected) { obs.disconnect(); _aoSair(); } });
    obs.observe(document.body, { childList: true });
    return m;
  }
  function _aoSair() {
    R = null; _ctx = null;
    const cb = _opts.aoFechar; _opts = {};
    if (typeof cb === 'function') { try { cb(); } catch (e) {} }
  }
  function fechar() {
    const m = document.getElementById('_vck-modal');
    if (!m) return;
    if (m._vckRegistrado && typeof CFG.fecharSobreposta === 'function') CFG.fecharSobreposta();
    else m.remove();
  }

  function _syncTexto() {
    if (!R) return '';
    if (R.somenteLeitura) return '<span style="color:var(--t3)">🔒 Registro antigo · só leitura</span>';
    if (R.fila.length && R.erro) return `<span style="color:#d97706">⏳ ${R.fila.length} sem enviar — guardado neste aparelho, tentando de novo</span>`;
    if (R.fila.length) return `<span style="color:var(--t3)">⏳ Salvando…</span>`;
    return '<span style="color:#16a34a">✓ Tudo salvo</span>';
  }
  function _pintarSync() { const el = document.getElementById('_vck-sync'); if (el) el.innerHTML = _syncTexto(); }

  function _cab() {
    const v = _ctx.visita || {};
    const dm = s => s ? String(s).split('-').reverse().join('/') : '';
    const lojaNome = (window.LOJA_DISPLAY && window._normLoja) ? (window.LOJA_DISPLAY[window._normLoja(v.loja)] || v.loja) : v.loja;
    const abas = _ctx.legado ? '' : `<div style="display:flex;gap:6px;margin-top:10px;overflow-x:auto">${Object.entries(TIPOS).map(([k, t]) => {
      const on = k === _ctx.tipo;
      return `<button type="button" onclick="GNVck._trocarTipo('${k}')" style="flex:1;white-space:nowrap;padding:8px 6px;border-radius:10px;font-size:11.5px;font-weight:800;font-family:inherit;cursor:pointer;border:1px solid ${on ? '#6366f1' : 'var(--b2,rgba(0,0,0,.12))'};background:${on ? 'rgba(99,102,241,.16)' : 'var(--s2,#fff)'};color:var(--t1)">${t.icon} ${t.curto}</button>`;
    }).join('')}</div>`;
    return `<div style="position:sticky;top:0;z-index:2;background:var(--s1,#fff);border-bottom:1px solid var(--b1,rgba(0,0,0,.08));padding:12px 14px 10px">
      <div style="display:flex;align-items:center;gap:10px">
        <button type="button" onclick="GNVck.fechar()" aria-label="Voltar" style="width:40px;height:40px;flex-shrink:0;border-radius:12px;border:1px solid var(--b2,rgba(0,0,0,.12));background:var(--s2,#fff);color:var(--t1);font-size:18px;cursor:pointer">←</button>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:800;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(lojaNome)} · ${esc(dm(v.data))}</div>
          <div style="font-size:11px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(v.visitante || '')}${v.hora_chegada && v.hora_chegada !== 'PLAN' ? ' · chegada ' + esc(v.hora_chegada) : ''}${v.hora_saida ? ' → ' + esc(v.hora_saida) : ''}</div>
        </div>
      </div>
      <div id="_vck-sync" style="font-size:10.5px;font-weight:700;margin-top:6px">${_syncTexto()}</div>
      ${abas}
    </div>`;
  }

  function _filtroHtml() {
    return `<input type="text" placeholder="🔍 Filtrar itens…" oninput="GNVck._filtrar(this.value)" style="width:100%;box-sizing:border-box;margin:0 0 10px;padding:9px 12px;border-radius:10px;border:1px solid var(--b2,rgba(0,0,0,.12));background:var(--s2,#fff);color:var(--t1);font-size:16px;font-family:inherit">`;
  }
  function _filtrar(t) {
    const q = String(t || '').toLowerCase().trim();
    document.querySelectorAll('#_vck-modal [data-vck-item]').forEach(el => { el.style.display = !q || el.dataset.vckItem.includes(q) ? '' : 'none'; });
  }
  const _ro = () => !!(R && (R.somenteLeitura || (R.dados && R.dados.fechada)));
  const card = (inner, extra) => `<div style="background:var(--s2,#fff);border:1px solid var(--b1,rgba(0,0,0,.08));border-radius:14px;padding:12px 14px;margin-bottom:10px;${extra || ''}">${inner}</div>`;
  const inputCss = 'width:100%;box-sizing:border-box;padding:8px 10px;border-radius:9px;border:1px solid var(--b2,rgba(0,0,0,.12));background:var(--s1,#fff);color:var(--t1);font-size:16px;font-family:inherit';
  function _campoTexto(path, valor, ph, rows) {
    const ro = _ro() ? 'readonly' : '';
    const p = attr(JSON.stringify(path));
    return rows
      ? `<textarea ${ro} rows="${rows}" placeholder="${attr(ph)}" onchange="GNVck._texto(this, ${p})" style="${inputCss};resize:vertical">${esc(valor || '')}</textarea>`
      : `<input ${ro} type="text" value="${attr(valor || '')}" placeholder="${attr(ph)}" onchange="GNVck._texto(this, ${p})" style="${inputCss}">`;
  }
  function _fotoHtml(path, url, rotulo) {
    const p = attr(JSON.stringify(path));
    const tem = url && /^https:\/\//.test(url);
    return `<div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      ${tem ? `<a href="${attr(url)}" target="_blank" rel="noopener"><img src="${attr(url)}" alt="Foto" style="width:52px;height:52px;object-fit:cover;border-radius:8px;border:1px solid var(--b2,rgba(0,0,0,.12))"></a>` : ''}
      ${_ro() ? '' : `<label style="display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border-radius:9px;border:1px dashed var(--b2,rgba(0,0,0,.25));font-size:11px;font-weight:700;color:var(--t2);cursor:pointer">📷 ${tem ? 'Trocar foto' : (rotulo || 'Foto (opcional)')}
        <input type="file" accept="image/*" capture="environment" style="display:none" onchange="GNVck._foto(this, ${p})"></label>
        ${tem ? `<button type="button" onclick="GNVck._set(${p}, null)" style="background:none;border:none;color:var(--t4);font-size:11px;cursor:pointer;font-family:inherit">🗑 Remover</button>` : ''}`}
    </div>`;
  }
  const corNota = n => n >= 9 ? '#16a34a' : n >= 7 ? '#2563eb' : n >= 5 ? '#d97706' : '#dc2626';

  // ── Supervisão salão ──
  function _salaoHtml() {
    const d = R.dados; const it = d.itens || {};
    const { nota, criticos } = calcSalao(d); const cl = classSalao(nota);
    const ro = _ro();
    const topo = card(`<div style="font-size:10px;font-weight:800;color:var(--t3);letter-spacing:.6px;text-transform:uppercase">🎯 Visita de supervisão</div>
      <div style="display:flex;align-items:baseline;gap:6px;margin-top:2px"><span style="font-size:30px;font-weight:900;color:${cl.cor};font-variant-numeric:tabular-nums">${nota === null ? '—' : nota}</span><span style="font-size:12px;color:var(--t3);font-weight:700">/100</span></div>
      <div style="font-size:12px;font-weight:800;color:${cl.cor}">${cl.label}</div>`);
    const dadosV = card(`<div style="font-size:10px;font-weight:800;color:var(--t3);letter-spacing:.6px;text-transform:uppercase;margin-bottom:8px">📋 Dados da visita</div>
      <div style="font-size:11px;color:var(--t3);margin-bottom:3px">Responsável pela loja na visita</div>${_campoTexto(['responsavel'], d.responsavel, 'Nome do gerente / responsável')}`);
    const setores = SUP_SETORES.map(s => {
      const sd = it[s.key] || {};
      const feitos = s.itens.filter(i => !vazio(sd[i.key])).length;
      const media = feitos ? s.itens.reduce((a, i) => a + (parseFloat(sd[i.key]) || 0), 0) / s.itens.length : null;
      const itensHtml = s.itens.map(i => {
        const val = sd[i.key], tem = !vazio(val), n = parseFloat(val) || 0;
        const crit = i.critico && tem && n < 7;
        return `<div data-vck-item="${attr(i.label.toLowerCase())}" style="background:${crit ? 'rgba(220,38,38,.06)' : 'var(--s1,#fafafa)'};border:1px solid ${crit ? 'rgba(220,38,38,.25)' : 'var(--b1,rgba(0,0,0,.08))'};border-radius:11px;padding:10px 12px;margin-top:7px">
          <div style="display:flex;justify-content:space-between;gap:10px"><div style="font-size:12.5px;font-weight:600;color:var(--t1);line-height:1.4">${esc(i.label)}${i.peso_label ? `<div style="font-size:10.5px;font-weight:800;color:var(--t2);margin-top:2px">${esc(i.peso_label)}</div>` : ''}</div>
            <div style="font-size:19px;font-weight:900;min-width:30px;text-align:center;color:${tem ? corNota(n) : 'var(--t4)'};font-variant-numeric:tabular-nums">${tem ? n : '—'}</div></div>
          <div style="display:grid;grid-template-columns:repeat(11,minmax(0,1fr));gap:3px;margin-top:8px">${[0,1,2,3,4,5,6,7,8,9,10].map(x => {
            const on = tem && n === x;
            return `<button type="button" ${ro ? 'disabled' : ''} onclick="GNVck._nota('${s.key}','${i.key}',${x})" style="padding:7px 0;border-radius:7px;font-size:11.5px;font-weight:800;font-family:inherit;cursor:${ro ? 'default' : 'pointer'};border:1px solid ${on ? corNota(x) : 'var(--b1,rgba(0,0,0,.1))'};background:${on ? corNota(x) + '26' : 'var(--s2,#fff)'};color:${on ? corNota(x) : 'var(--t3)'}">${x}</button>`;
          }).join('')}</div>
          ${crit ? '<div style="margin-top:7px;font-size:11px;font-weight:800;color:#dc2626">🚨 Item crítico — requer ação imediata</div>' : ''}
          <div style="margin-top:8px">${_campoTexto(['itens', s.key, i.key + '_obs'], sd[i.key + '_obs'], 'Observação (opcional)…')}</div>
          ${_fotoHtml(['itens', s.key, i.key + '_foto'], sd[i.key + '_foto'])}
        </div>`;
      }).join('');
      return `<details open style="background:var(--s2,#fff);border:1px solid var(--b1,rgba(0,0,0,.08));border-radius:14px;padding:10px 12px;margin-bottom:10px">
        <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px"><span style="font-size:16px">${s.icon}</span><span style="flex:1;min-width:0"><b style="font-size:13px;color:var(--t1)">${esc(s.label)}</b><br><span style="font-size:10.5px;color:var(--t3)">${feitos}/${s.itens.length} avaliados</span></span>${media !== null ? `<b style="font-size:15px;color:${corNota(media)}">${media.toFixed(1)}</b>` : ''}</summary>
        ${itensHtml}</details>`;
    }).join('');
    const acoes = d.acoes && !Array.isArray(d.acoes) ? d.acoes : {};
    const plano = criticos.length ? card(`<div style="font-size:10.5px;font-weight:800;color:#dc2626;letter-spacing:.6px;text-transform:uppercase;margin-bottom:8px">⚡ Plano de ação — itens críticos</div>
      ${criticos.map(c => `<div style="background:rgba(220,38,38,.06);border:1px solid rgba(220,38,38,.2);border-radius:10px;padding:9px 11px;margin-bottom:6px">
        <div style="font-size:10.5px;font-weight:800;color:var(--t2)">${esc(c.setor)} · nota ${c.nota}/10 · peso ${c.peso}×</div>
        <div style="font-size:12px;color:var(--t1);margin:2px 0 6px">${esc(c.label)}</div>
        ${_campoTexto(['acoes', c.chave], acoes[c.chave] || _acaoLegada(d, c), 'Ação corretiva e prazo…')}</div>`).join('')}`) : '';
    const obs = card(`<div style="font-size:10px;font-weight:800;color:var(--t3);letter-spacing:.6px;text-transform:uppercase;margin-bottom:8px">📝 Observações gerais</div>${_campoTexto(['obs'], d.obs, 'Pontos positivos, destaques, contexto…', 3)}`);
    return topo + dadosV + _filtroHtml() + setores + plano + obs + _fechamentoHtml(nota);
  }
  // Registro antigo (checklist_diario) guardava as ações num array alinhado à lista de críticos.
  function _acaoLegada(d, c) {
    if (!Array.isArray(d.acoes)) return '';
    const lista = (d.__tipo === 'cozinha' ? calcCozinha(d) : calcSalao(d)).criticos;
    const i = lista.findIndex(x => x.chave === c.chave);
    return i >= 0 ? (d.acoes[i] || '') : '';
  }

  // ── Supervisão cozinha ──
  function _cozinhaHtml() {
    const d = R.dados; const it = d.itens || {};
    const { nota, criticos } = calcCozinha(d); const cl = classCozinha(nota, criticos.length > 0);
    const ro = _ro();
    const topo = card(`<div style="font-size:10px;font-weight:800;color:var(--t3);letter-spacing:.6px;text-transform:uppercase">🧼 Supervisão cozinha</div>
      <div style="display:flex;align-items:baseline;gap:6px;margin-top:2px"><span style="font-size:30px;font-weight:900;color:${cl.cor};font-variant-numeric:tabular-nums">${nota === null ? '—' : nota + '%'}</span><span style="font-size:12px;color:var(--t3);font-weight:700">conformidade</span></div>
      <div style="font-size:12px;font-weight:800;color:${cl.cor}">${cl.label}</div>
      <div style="font-size:10px;color:var(--t4);margin-top:4px">Guia Unificado de Fiscalização Sanitária · IVISA-RIO</div>`);
    const dadosV = card(`<div style="font-size:10px;font-weight:800;color:var(--t3);letter-spacing:.6px;text-transform:uppercase;margin-bottom:8px">📋 Dados da visita</div>
      <div style="font-size:11px;color:var(--t3);margin-bottom:3px">Gerente / responsável pela loja</div>${_campoTexto(['gerente'], d.gerente, 'Nome do gerente / responsável')}`);
    const setores = COZ_SETORES.map(s => {
      const sd = it[s.key] || {};
      const feitos = s.itens.filter(i => !!sd[i.key]).length, nc = s.itens.filter(i => sd[i.key] === 'NC').length;
      const itensHtml = s.itens.map(i => {
        const val = sd[i.key]; const crit = i.critico && val === 'NC';
        const opt = [['C', '✅ Conforme', '#16a34a'], ['NC', '❌ Não conforme', '#dc2626'], ['NA', '➖ N/A', '#64748b']];
        return `<div data-vck-item="${attr(i.label.toLowerCase())}" style="background:${crit ? 'rgba(220,38,38,.06)' : 'var(--s1,#fafafa)'};border:1px solid ${crit ? 'rgba(220,38,38,.25)' : 'var(--b1,rgba(0,0,0,.08))'};border-radius:11px;padding:10px 12px;margin-top:7px">
          <div style="font-size:12.5px;font-weight:600;color:var(--t1);line-height:1.4;margin-bottom:8px">${i.critico ? '<b style="color:#dc2626">⚡ </b>' : ''}${esc(i.label)}</div>
          <div style="display:flex;gap:5px">${opt.map(([v, lbl, cor]) => `<button type="button" ${ro ? 'disabled' : ''} onclick="GNVck._coz('${s.key}','${i.key}','${v}')" style="flex:1;padding:8px 3px;border-radius:9px;font-size:11px;font-weight:800;font-family:inherit;cursor:${ro ? 'default' : 'pointer'};border:1px solid ${val === v ? cor : 'var(--b1,rgba(0,0,0,.1))'};background:${val === v ? cor + '22' : 'var(--s2,#fff)'};color:${val === v ? cor : 'var(--t3)'}">${lbl}</button>`).join('')}</div>
          ${crit ? '<div style="margin-top:7px;font-size:11px;font-weight:800;color:#dc2626">🚨 Item crítico — requer ação imediata</div>' : ''}
          <div style="margin-top:8px">${_campoTexto(['itens', s.key, i.key + '_obs'], sd[i.key + '_obs'], 'Ações corretivas / observações (opcional)…')}</div>
          ${_fotoHtml(['itens', s.key, i.key + '_foto'], sd[i.key + '_foto'])}
        </div>`;
      }).join('');
      return `<details open style="background:var(--s2,#fff);border:1px solid var(--b1,rgba(0,0,0,.08));border-radius:14px;padding:10px 12px;margin-bottom:10px">
        <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px"><span style="font-size:16px">${s.icon}</span><span style="flex:1;min-width:0"><b style="font-size:13px;color:var(--t1)">${esc(s.label)}</b><br><span style="font-size:10.5px;color:var(--t3)">${feitos}/${s.itens.length} avaliados${nc ? ' · ' + nc + ' não conforme' : ''}</span></span></summary>
        ${itensHtml}</details>`;
    }).join('');
    const acoes = d.acoes && !Array.isArray(d.acoes) ? d.acoes : {};
    const plano = criticos.length ? card(`<div style="font-size:10.5px;font-weight:800;color:#dc2626;letter-spacing:.6px;text-transform:uppercase;margin-bottom:8px">⚡ Plano de ação — críticos não conformes</div>
      ${criticos.map(c => `<div style="background:rgba(220,38,38,.06);border:1px solid rgba(220,38,38,.2);border-radius:10px;padding:9px 11px;margin-bottom:6px">
        <div style="font-size:10.5px;font-weight:800;color:var(--t2)">${esc(c.setor)} · 🚨 não conforme</div>
        <div style="font-size:12px;color:var(--t1);margin:2px 0 6px">${esc(c.label)}</div>
        ${_campoTexto(['acoes', c.chave], acoes[c.chave] || _acaoLegada(Object.assign({ __tipo: 'cozinha' }, d), c), 'Ação corretiva e prazo…')}</div>`).join('')}`) : '';
    const obs = card(`<div style="font-size:10px;font-weight:800;color:var(--t3);letter-spacing:.6px;text-transform:uppercase;margin-bottom:8px">📝 Observações gerais</div>${_campoTexto(['obs'], d.obs, 'Pontos positivos, destaques, contexto…', 3)}`);
    return topo + dadosV + _filtroHtml() + setores + plano + obs + _fechamentoHtml(nota);
  }

  function _fechamentoHtml(nota) {
    const d = R.dados;
    if (R.somenteLeitura) return '';
    if (d.fechada) {
      const quando = d.fechada_em ? new Date(d.fechada_em) : null;
      const hm = quando ? String(quando.getHours()).padStart(2, '0') + ':' + String(quando.getMinutes()).padStart(2, '0') : '';
      return card(`<div style="text-align:center"><div style="font-size:20px">🔒</div><div style="font-size:14px;font-weight:800;color:var(--t1)">Visita finalizada</div>
        <div style="font-size:11.5px;color:var(--t3);margin:3px 0 10px">${esc(['Por ' + (d.fechada_por || '—'), hm ? 'às ' + hm : ''].filter(Boolean).join(' '))}</div>
        <button type="button" onclick="GNVck._reabrir()" style="padding:9px 16px;border-radius:10px;border:1px solid var(--b2,rgba(0,0,0,.15));background:var(--s1,#fff);color:var(--t2);font-size:12px;font-weight:800;cursor:pointer;font-family:inherit">🔓 Reabrir pra editar</button></div>`);
    }
    return `<button type="button" onclick="GNVck._finalizar()" style="width:100%;margin:4px 0 24px;padding:13px;border-radius:12px;border:none;background:#16a34a;color:#fff;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit">✅ Finalizar visita${nota !== null ? ' — ' + (_ctx.tipo === 'cozinha' ? nota + '%' : nota + '/100') : ''}</button>`;
  }

  // ── Auditoria de padrão ──
  function _padraoHtml() {
    const d = R.dados;
    const pills = `<div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;margin-bottom:10px">${AUDP_TIPOS.map(t => {
      const c = calcPadrao(d, t.key), inf = infoPadrao(c.status), on = t.key === _padraoTipo;
      return `<button type="button" onclick="GNVck._padraoTipo('${t.key}')" style="white-space:nowrap;flex-shrink:0;padding:8px 11px;border-radius:10px;font-size:11px;font-weight:800;font-family:inherit;cursor:pointer;border:1px solid ${on ? inf.cor : 'var(--b2,rgba(0,0,0,.12))'};background:${on ? 'rgba(99,102,241,.1)' : 'var(--s2,#fff)'};color:var(--t1)">${t.icon} ${esc(t.label)}${c.nota !== null ? ` · ${inf.emoji} ${c.nota}%` : c.reprovadaCritica ? ' · ' + inf.emoji : ''}${(d[t.key] || {}).finalizada ? ' ✓' : ''}</button>`;
    }).join('')}</div>`;
    const banco = AUDP_TIPOS.find(t => t.key === _padraoTipo);
    const aud = d[_padraoTipo] || { itens: {} };
    const calc = calcPadrao(d, _padraoTipo), inf = infoPadrao(calc.status);
    const travado = R.somenteLeitura || !!aud.finalizada;
    const banner = `<div style="background:${inf.cor}14;border:1px solid ${inf.cor}55;border-radius:12px;padding:11px 13px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><div><div style="font-size:10.5px;color:var(--t3);font-weight:800;text-transform:uppercase;letter-spacing:.5px">${banco.icon} ${esc(banco.label)}</div>
      <div style="font-size:13px;font-weight:800;color:${inf.cor};margin-top:2px">${inf.emoji} ${esc(inf.label)}</div></div>${calc.nota !== null ? `<div style="font-size:22px;font-weight:900;color:${inf.cor}">${calc.nota}%</div>` : ''}</div>
      <div style="font-size:10.5px;color:var(--t3);margin-top:5px">${calc.avaliados}/${calc.total} itens avaliados${aud.finalizada ? ' · ✅ finalizada' : ''}</div></div>`;
    const itens = banco.itens.map((it, idx) => {
      const r = ((aud.itens || {})[idx] || {}).resp, foto = ((aud.itens || {})[idx] || {}).foto;
      const pl = it.crit === 'CRITICO' ? '🔴 CRÍTICO · Peso 5' : it.crit === 'MAIOR' ? '🟠 MAIOR · Peso 3' : '🟡 MENOR · Peso 1';
      const b = (v, l, cor) => `<button type="button" ${travado ? 'disabled' : ''} onclick="GNVck._resp(${idx},'${v}')" style="flex:1;padding:8px 3px;border-radius:9px;font-size:11.5px;font-weight:800;font-family:inherit;cursor:${travado ? 'default' : 'pointer'};border:1px solid ${r === v ? cor : 'var(--b1,rgba(0,0,0,.1))'};background:${r === v ? cor + '22' : 'var(--s2,#fff)'};color:${r === v ? cor : 'var(--t3)'}">${l}</button>`;
      return `<div data-vck-item="${attr(it.label.toLowerCase())}" style="background:${r === 'NAO' ? 'rgba(220,38,38,.06)' : 'var(--s1,#fafafa)'};border:1px solid ${r === 'NAO' ? 'rgba(220,38,38,.25)' : 'var(--b1,rgba(0,0,0,.08))'};border-radius:11px;padding:10px 12px;margin-bottom:7px">
        <div style="font-size:10.5px;font-weight:800;color:var(--t2);margin-bottom:3px">${pl}</div>
        <div style="font-size:12.5px;font-weight:600;color:var(--t1);line-height:1.4;margin-bottom:8px">${esc(it.label)}</div>
        <div style="display:flex;gap:5px">${b('SIM', '✓ SIM', '#16a34a')}${b('NAO', '✕ NÃO', '#dc2626')}${b('NA', 'N/A', '#64748b')}</div>
        ${r === 'NAO' ? (travado && !foto ? '' : (travado ? `<a href="${attr(foto)}" target="_blank" rel="noopener"><img src="${attr(foto)}" style="width:52px;height:52px;object-fit:cover;border-radius:8px;margin-top:8px"></a>` : _fotoHtml([_padraoTipo, 'itens', String(idx), 'foto'], foto, 'Foto de evidência (opcional)'))) : ''}
      </div>`;
    }).join('');
    const todos = banco.itens.every((_, idx) => !!((aud.itens || {})[idx] || {}).resp);
    const acao = R.somenteLeitura ? '' : aud.finalizada
      ? `<button type="button" onclick="GNVck._padraoReabrir()" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--b2,rgba(0,0,0,.15));background:var(--s1,#fff);color:var(--t2);font-size:12px;font-weight:800;cursor:pointer;font-family:inherit;margin:4px 0">🔓 Reabrir pra editar</button>`
      : `<button type="button" ${todos ? '' : 'disabled'} onclick="GNVck._padraoFinalizar()" style="width:100%;padding:12px;border-radius:10px;border:none;background:${todos ? '#16a34a' : 'var(--s3,#eee)'};color:${todos ? '#fff' : 'var(--t4)'};font-size:13px;font-weight:800;cursor:${todos ? 'pointer' : 'default'};font-family:inherit;margin:4px 0">✅ Finalizar auditoria</button>${todos ? '' : '<div style="font-size:10.5px;color:var(--t3);text-align:center;margin-top:4px">Responda todos os itens pra finalizar.</div>'}`;
    const plano = (aud.planoAcao || []).length ? card(`<div style="font-size:10.5px;font-weight:800;color:#dc2626;letter-spacing:.6px;text-transform:uppercase;margin-bottom:8px">⚡ Plano de ação (5W2H)</div>
      ${aud.planoAcao.map((p, i) => {
        const cl = p.crit === 'CRITICO' ? '🔴 Crítico · prazo máx. 24h' : p.crit === 'MAIOR' ? '🟠 Maior · prazo máx. 48h' : '🟡 Menor · prazo máx. 5 dias';
        const campo = (k, ph) => _campoTexto([_padraoTipo, 'planoAcao', String(i), k], p[k], ph);
        return `<div style="background:var(--s1,#fafafa);border:1px solid var(--b1,rgba(0,0,0,.08));border-radius:10px;padding:10px 12px;margin-bottom:7px">
          <div style="font-size:10.5px;font-weight:800;color:var(--t2)">${cl}</div><div style="font-size:12px;font-weight:700;color:var(--t1);margin:3px 0 7px">${esc(p.itemLabel)}</div>
          <div style="font-size:10.5px;color:var(--t3)">Ação corretiva</div>${campo('acaoCorretiva', 'O que será feito?')}
          <div style="font-size:10.5px;color:var(--t3);margin-top:5px">Responsável</div>${campo('responsavel', 'Quem vai fazer?')}
          <div style="font-size:10.5px;color:var(--t3);margin-top:5px">Prazo (máx. ${esc(String(p.prazoMax || '').split('-').reverse().join('/'))})</div>
          <input ${R.somenteLeitura ? 'readonly' : ''} type="date" value="${attr(p.prazo || '')}" max="${attr(p.prazoMax || '')}" onchange="GNVck._texto(this, ${attr(JSON.stringify([_padraoTipo, 'planoAcao', String(i), 'prazo']))})" style="${inputCss}">
          <div style="font-size:10.5px;color:var(--t3);margin-top:5px">Ação preventiva</div>${campo('acaoPreventiva', 'Como evitar que se repita?')}</div>`;
      }).join('')}`, 'margin-top:10px') : '';
    return pills + banner + _filtroHtml() + itens + acao + plano + '<div style="height:24px"></div>';
  }

  function pintar() {
    const m = _modal();
    if (!R) { m.innerHTML = _ctx ? _cab() + '<div style="padding:30px;text-align:center;color:var(--t3)">Carregando o check-list…</div>' : ''; return; }
    const y = m.scrollTop;
    const corpo = _ctx.tipo === 'salao' ? _salaoHtml() : _ctx.tipo === 'cozinha' ? _cozinhaHtml() : _padraoHtml();
    m.innerHTML = _cab() + `<div style="max-width:640px;margin:0 auto;padding:12px 14px">${corpo}</div>`;
    m.scrollTop = y;
  }

  // ── Ações ──
  function _nota(setor, item, n) {
    if (_ro()) return;
    const atual = ((R.dados.itens || {})[setor] || {})[item];
    // Tocar de novo na mesma nota desmarca — dá pra corrigir um toque errado.
    set(['itens', setor, item], (!vazio(atual) && Number(atual) === n) ? null : n);
    _atualizarNota(); pintar();
  }
  function _coz(setor, item, v) {
    if (_ro()) return;
    const atual = ((R.dados.itens || {})[setor] || {})[item];
    set(['itens', setor, item], atual === v ? null : v);
    _atualizarNota(); pintar();
  }
  function _texto(el, path) { if (R && !R.somenteLeitura) set(path, String(el.value || '')); }
  function _set(path, v) { set(path, v); pintar(); }
  function _atualizarNota() {
    if (!R || _ctx.tipo === 'padrao') return;
    const n = (_ctx.tipo === 'salao' ? calcSalao(R.dados) : calcCozinha(R.dados)).nota;
    if (R.dados.notaFinal !== n) set(['notaFinal'], n);
  }
  async function _comprimir(file) {
    const img = await new Promise((res, rej) => { const u = URL.createObjectURL(file), i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = () => { URL.revokeObjectURL(u); rej(new Error('foto inválida')); }; i.src = u; });
    const k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.78);
  }
  async function _foto(input, path) {
    const f = input && input.files && input.files[0];
    if (!f || _ro()) return;
    const sync = document.getElementById('_vck-sync'); if (sync) sync.innerHTML = '<span style="color:var(--t3)">📷 Enviando a foto…</span>';
    try {
      const uri = await _comprimir(f);
      const url = await window.gnUploadFotoStorage(URL_(), KEY(), 'visitas-checklist', uri);
      set(path, url); pintar();
    } catch (e) {
      window.gnLogError && window.gnLogError('vck:foto', e);
      alert('A foto não subiu agora. Confira a internet e tente de novo — as marcações continuam salvas.');
      _pintarSync();
    }
  }
  function _quem() { return (typeof CFG.quem === 'function' && CFG.quem()) || (_ctx && _ctx.visita && _ctx.visita.visitante) || ''; }
  function _finalizar() {
    const nota = (_ctx.tipo === 'salao' ? calcSalao(R.dados) : calcCozinha(R.dados)).nota;
    if (nota === null) { alert('Avalie pelo menos um item antes de finalizar.'); return; }
    if (!confirm('Finalizar a visita? Os itens ficam travados (dá pra reabrir se precisar).')) return;
    const agora = new Date().toISOString(), por = _quem();
    set(['notaFinal'], nota); set(['fechada'], true); set(['fechada_em'], agora); set(['fechada_por'], por);
    patchLinha({ finalizada: true, nota, finalizada_em: agora, finalizada_por: por });
    pintar();
  }
  function _reabrir() {
    if (!confirm('Reabrir a visita pra editar?')) return;
    set(['fechada'], false); patchLinha({ finalizada: false });
    pintar();
  }
  function _padraoTipoSel(k) { _padraoTipo = k; pintar(); }
  function _resp(idx, v) {
    const aud = R.dados[_padraoTipo] || {};
    if (aud.finalizada || R.somenteLeitura) return;
    set([_padraoTipo, 'itens', String(idx), 'resp'], v);
    if (v !== 'NAO') set([_padraoTipo, 'itens', String(idx), 'foto'], null);
    pintar();
  }
  function _padraoFinalizar() {
    const banco = AUDP_TIPOS.find(t => t.key === _padraoTipo);
    const aud = R.dados[_padraoTipo] || { itens: {} };
    const calc = calcPadrao(R.dados, _padraoTipo);
    if (!confirm('Finalizar esta auditoria? Os itens ficam travados (dá pra reabrir se precisar).')) return;
    const plano = Array.isArray(aud.planoAcao) ? aud.planoAcao.slice() : [];
    const tem = new Set(plano.map(p => p.itemIdx));
    banco.itens.forEach((it, idx) => {
      const r = ((aud.itens || {})[idx] || {});
      if (r.resp !== 'NAO' || tem.has(idx)) return;
      const pz = new Date(); pz.setDate(pz.getDate() + (AUDP_PRAZO_DIAS[it.crit] || 5));
      const s = `${pz.getFullYear()}-${String(pz.getMonth() + 1).padStart(2, '0')}-${String(pz.getDate()).padStart(2, '0')}`;
      plano.push({ itemIdx: idx, itemLabel: it.label, itemFoto: r.foto || '', crit: it.crit, acaoCorretiva: '', responsavel: '', prazoMax: s, prazo: s, acaoPreventiva: '' });
    });
    const agora = new Date().toISOString(), por = _quem();
    // planoAcao vai como objeto por posição: cada campo do plano é gravado sozinho depois.
    const planoObj = {}; plano.forEach((p, i) => { planoObj[String(i)] = p; });
    set([_padraoTipo, 'planoAcao'], planoObj);
    _normalizarPadrao(R.dados);
    set([_padraoTipo, 'finalizada'], true); set([_padraoTipo, 'notaFinal'], calc.nota); set([_padraoTipo, 'status'], calc.status);
    set([_padraoTipo, 'finalizadaEm'], agora); set([_padraoTipo, 'finalizadaPor'], por);
    patchLinha({ finalizada: true, finalizada_em: agora, finalizada_por: por, nota: calc.nota });
    pintar();
  }
  function _padraoReabrir() { set([_padraoTipo, 'finalizada'], false); pintar(); }

  // planoAcao chega como objeto {0:…,1:…} (novo) ou array (registro antigo): a tela usa array.
  function _normalizarPadrao(d) {
    AUDP_TIPOS.forEach(t => {
      const a = d[t.key];
      if (a && a.planoAcao && !Array.isArray(a.planoAcao)) {
        a.planoAcao = Object.keys(a.planoAcao).sort((x, y) => Number(x) - Number(y)).map(k => a.planoAcao[k]);
      }
    });
    return d;
  }

  async function _carregar(visita, tipo) {
    _ctx = { visita, tipo };
    R = null; pintar();
    try {
      const linha = await buscarOuCriar(visita, tipo);
      const local = lerLocal(linha.id);
      const dados = clone(linha.dados || {});
      const fila = (local && Array.isArray(local.fila)) ? local.fila : [];
      // O que este aparelho marcou e ainda não subiu vale por cima do servidor — é a marcação
      // que a recarga apagava no modelo antigo.
      fila.forEach(op => { if (op.path) setPath(dados, op.path, op.valor); });
      R = { linha, dados: tipo === 'padrao' ? _normalizarPadrao(dados) : dados, fila, enviando: false, erro: false };
      _salvarLocal();
      pintar();
      if (fila.length) _enviar();
    } catch (e) {
      window.gnLogError && window.gnLogError('vck:abrir', e);
      const m = _modal();
      m.innerHTML = _cab() + `<div style="padding:30px 18px;text-align:center;color:var(--t2);font-size:13px;line-height:1.5">Não deu pra abrir o check-list agora.<br>Confira a internet e tente de novo.<br><br><button type="button" onclick="GNVck._trocarTipo('${tipo}')" style="padding:9px 16px;border-radius:10px;border:1px solid var(--b2,rgba(0,0,0,.15));background:var(--s2,#fff);color:var(--t1);font-weight:800;cursor:pointer;font-family:inherit">Tentar de novo</button></div>`;
    }
  }

  async function abrir(visita, tipo, opts) {
    _opts = opts || {};
    if (!visita || !visita.id) return;
    _padraoTipo = AUDP_TIPOS[0].key;
    await _carregar(visita, tipo || 'salao');
  }
  async function _trocarTipo(tipo) {
    if (!_ctx || _ctx.legado) return;
    await _carregar(_ctx.visita, tipo);
  }

  // Registro ANTIGO (checklist_diario): só leitura, na mesma tela.
  async function abrirLegado(visita, tipo) {
    _opts = {};
    _ctx = { visita, tipo, legado: true };
    R = null; pintar();
    try {
      const rows = await _req(`checklist_diario?data_operacao=eq.${encodeURIComponent(visita.data)}&loja=eq.${encodeURIComponent(visita.loja)}&select=supervisao,supervisao_cozinha,auditorias_padrao`, { headers: H() });
      const row = (rows && rows[0]) || {};
      const dados = clone(tipo === 'salao' ? (row.supervisao || {}) : tipo === 'cozinha' ? (row.supervisao_cozinha || {}) : (row.auditorias_padrao || {}));
      R = { linha: { id: null }, dados: tipo === 'padrao' ? _normalizarPadrao(dados) : dados, fila: [], somenteLeitura: true };
      pintar();
    } catch (e) {
      const m = _modal();
      m.innerHTML = _cab() + '<div style="padding:30px;text-align:center;color:var(--t2)">Não deu pra carregar o registro antigo agora.</div>';
    }
  }

  // Resumo pros botões da visita no Painel: {visita_id: {salao:{nota,finalizada}, …}}.
  async function resumo(ids) {
    const lista = (ids || []).filter(Boolean);
    if (!lista.length) return {};
    try {
      const rows = await _req(`gn_visita_checklist?visita_id=in.(${lista.map(encodeURIComponent).join(',')})&select=visita_id,tipo,nota,finalizada`, { headers: H() });
      const out = {};
      (rows || []).forEach(r => { (out[r.visita_id] = out[r.visita_id] || {})[r.tipo] = { nota: r.nota, finalizada: r.finalizada }; });
      return out;
    } catch (e) { return {}; }
  }

  window.GNVck = {
    SUP_SETORES, COZ_SETORES, AUDP_TIPOS, TIPOS,
    calcSalao, calcCozinha, calcPadrao, classSalao, classCozinha, infoPadrao,
    config, abrir, abrirLegado, fechar, resumo, set, setPath,
    _estado: () => R, _ctx: () => _ctx, _enviar,
    _trocarTipo, _filtrar, _nota, _coz, _texto, _set, _foto, _finalizar, _reabrir,
    _padraoTipo: _padraoTipoSel, _resp, _padraoFinalizar, _padraoReabrir,
  };
})();
