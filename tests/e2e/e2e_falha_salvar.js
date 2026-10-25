// "Nova América continua dando falha e data errada."
//
// O que dava pra confirmar: a loja está DOIS DIAS sem gravar (checklist_diario tem linha até
// 25/09 e nada em 26 e 27). O servidor aceita a gravação numa boa — testei pela API com o
// mesmo volume que ela manda (93 KB de manutenção em base64): HTTP 201. Então a falha é no
// aparelho, e o app não dizia qual era: "Falha" na bolinha e o motivo num toast que some em
// 3 segundos.
//
// Este teste cobre as duas coisas que dá pra consertar sem adivinhar:
//  1. o motivo da falha fica GRAVADO e visível até o próximo salvamento dar certo;
//  2. autoSave() não estoura mais quando o localStorage enche — e a Nova América é o caso
//     extremo, com 93 KB de fotos de manutenção dentro do estado do dia.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + CHK);
    try {
      await page.waitForFunction(() => {
        try {
          return typeof autoSave === 'function' && typeof _updateLastSaveIndicator === 'function'
            && typeof _registrarFalhaSalvar === 'function' && typeof _limparFalhaSalvar === 'function'
            && state !== undefined;
        } catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) { if (t >= 3) throw e; }
  }

  // ── O motivo da falha fica na tela ───────────────────────────────────────────────────
  const falha = await page.evaluate(() => {
    LOJA = 'Nova América';
    window.hojeLocal = () => '2026-09-27';
    localStorage.clear();
    localStorage.setItem('gn_cl_last_save_' + LOJA, '✓ Salvo às 23:00');
    localStorage.setItem('gn_cl_last_save_dia_' + LOJA, '2026-09-15');
    _registrarFalhaSalvar('column "obs_abertura" does not exist');
    const el = document.getElementById('last-save-indicator');
    return { texto: el.textContent, cor: el.style.color, visivel: el.style.display,
             rotulo: document.getElementById('sync-label').textContent,
             gravado: localStorage.getItem('gn_cl_last_err_' + LOJA) };
  });
  check('o motivo da falha aparece no cabeçalho, por extenso',
    /não salvou/i.test(falha.texto) && /obs_abertura/.test(falha.texto));
  check('em vermelho, pra não passar por aviso verde de "salvo"',
    falha.cor === 'rgb(185, 28, 28)' && falha.visivel === 'block');
  check('e diz quando foi o último salvamento que deu certo',
    /último OK/.test(falha.texto) && /15\/09/.test(falha.texto));
  check('o motivo fica gravado, não depende do toast de 3 segundos', !!falha.gravado);
  check('a bolinha continua marcando falha', falha.rotulo === 'Falha');

  const limpou = await page.evaluate(() => {
    _limparFalhaSalvar();
    localStorage.setItem('gn_cl_last_save_dia_' + LOJA, hojeLocal());
    _updateLastSaveIndicator();
    const el = document.getElementById('last-save-indicator');
    return { texto: el.textContent, cor: el.style.color };
  });
  check('salvou de novo: o aviso vermelho some e volta o verde',
    !/não salvou/i.test(limpou.texto) && limpou.cor === 'rgb(21, 128, 61)');

  // ── localStorage cheio não pode derrubar o app ───────────────────────────────────────
  // O mecanismo mudou e ficou melhor: antes, cota cheia significava direto "regrava sem as
  // fotos". Hoje o autoSave passa pelo gnGuardar, que primeiro ABRE ESPAÇO (cache da
  // Gorjetas Mestra, fotos de dias passados, fotos das cópias de outras lojas) e só desiste
  // das fotos se nem assim couber. Então o caminho feliz agora guarda a cópia COMPLETA.
  const cotaOk = await page.evaluate(() => {
    LOJA = 'Nova América';
    localStorage.clear();
    // Algo descartável ocupando espaço: é o que o gnGuardar vai liberar.
    localStorage.setItem('gn_mestra_allDataPorLoja', 'M'.repeat(50000));
    state.manutencao = [{ id: 0, descricao: 'item 0', status: 'Pendente',
      fotoBase64: 'data:image/jpeg;base64,' + 'A'.repeat(6000) }];
    const real = Storage.prototype.setItem;
    let primeiraDoDia = true;
    Storage.prototype.setItem = function (k, v) {
      // Estoura só enquanto o cache descartável ainda estiver lá — ou seja, até o gnGuardar
      // fazer a faxina. Depois disso, passa.
      if (k.startsWith('gn_chk4_day_') && primeiraDoDia && localStorage.getItem('gn_mestra_allDataPorLoja')) {
        primeiraDoDia = false;
        const e = new Error('exceeded the quota'); e.name = 'QuotaExceededError'; e.code = 22; throw e;
      }
      return real.call(this, k, v);
    };
    let erro = null;
    try { autoSave(); } catch (e) { erro = String(e && e.name); }
    Storage.prototype.setItem = real;
    const salvou = localStorage.getItem('gn_chk4_day_Nova_América') || '';
    return { erro, cacheSumiu: localStorage.getItem('gn_mestra_allDataPorLoja') === null,
             temFoto: /AAAA/.test(salvou), temItens: /"descricao":"item 0"/.test(salvou),
             aviso: localStorage.getItem('gn_cl_aviso_local_Nova América') };
  });
  check('faltando espaço, ele abre espaço no que é descartável em vez de desistir',
    cotaOk.erro === null && cotaOk.cacheSumiu === true);
  check('e aí a cópia completa cabe — COM as fotos (antes elas eram descartadas direto)',
    cotaOk.temFoto === true && cotaOk.temItens === true);
  check('nesse caso nem aviso aparece: foi resolvido sem incomodar ninguém',
    cotaOk.aviso === null);

  const cota = await page.evaluate(() => {
    LOJA = 'Nova América';
    // Estado no tamanho real da Nova América: 14 itens de manutenção com foto em base64.
    state.manutencao = Array.from({ length: 14 }, (_, i) => ({
      id: i, descricao: 'item ' + i, status: 'Pendente', fotoBase64: 'data:image/jpeg;base64,' + 'A'.repeat(6000)
    }));
    state.abertura = { sistema: { 0: { checked: true, fotoBase64: 'data:image/jpeg;base64,' + 'B'.repeat(4000) } } };
    localStorage.clear();
    const real = Storage.prototype.setItem;
    let estourarSempre = false, tentativas = [];
    // Nada descartável pra liberar: aqui a faxina do gnGuardar não resolve, e o caminho
    // testado é o de desistir das fotos. Estoura em tudo que leve foto; o enxuto passa.
    Storage.prototype.setItem = function (k, v) {
      tentativas.push({ k, tam: v.length });
      if (k.startsWith('gn_chk4_day_') && (estourarSempre || /AAAA/.test(v))) {
        const e = new Error('exceeded the quota'); e.name = 'QuotaExceededError'; e.code = 22; throw e;
      }
      return real.call(this, k, v);
    };
    let erro = null;
    try { autoSave(); } catch (e) { erro = String(e && e.name); }
    const doDia = tentativas.filter(t => t.k.startsWith('gn_chk4_day_'));
    const salvou = localStorage.getItem('gn_chk4_day_Nova_América');
    // Agora o caso em que NADA cabe
    tentativas = []; estourarSempre = true;
    let erro2 = null;
    try { autoSave(); } catch (e) { erro2 = String(e && e.name); }
    Storage.prototype.setItem = real;
    const avisoEl = document.getElementById('aviso-copia-local');
    return { erro, erro2, tentativas: doDia.length,
             temFoto: salvou ? /AAAA/.test(salvou) : null,
             temItens: salvou ? /"descricao":"item 0"/.test(salvou) : null,
             aviso: _autoSaveFalhou,
             avisoNaTela: avisoEl && avisoEl.style.display !== 'none' ? avisoEl.textContent : '',
             erroServidor: localStorage.getItem('gn_cl_last_err_Nova América'),
             barra: (document.getElementById('last-save-indicator').textContent || '') };
  });
  check('cota estourada não derruba o autoSave (antes a exceção subia pra quem chamou)',
    cota.erro === null);
  check('sem nada pra liberar, aí sim ele desiste das fotos e guarda o resto',
    cota.temItens === true && cota.temFoto === false);
  check('a loja é avisada, mas num recado discreto — não no vermelho de "não salvou"',
    /mem[óo]ria do app/i.test(cota.aviso) && !/não salvou/i.test(cota.barra));
  check('e o recado já diz que o dia está no servidor, pra ninguém refazer o check-list',
    /salvo no servidor/i.test(cota.avisoNaTela));
  check('não fala mais em "espaço no aparelho", que mandava limpar o celular à toa',
    !/espa[çc]o no aparelho/i.test(cota.aviso));
  check('e não marca falha de salvamento, que é outra coisa', cota.erroServidor === null);
  check('nem quando NADA cabe o autoSave estoura', cota.erro2 === null);

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
