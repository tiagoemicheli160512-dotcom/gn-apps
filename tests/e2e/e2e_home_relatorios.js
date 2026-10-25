// "Colocar opção de gerar os relatórios no app check-list no home das lojas, nos cards,
//  carne, escala, e etc, para WhatsApp. No card do controle de carne colocar também o valor
//  de faturamento da semana anterior."
//
// Os dois relatórios saem do que o card JÁ montou (nada de refazer consulta), e o
// faturamento vem de checklist_diario na mesma semana das carnes — é a referência contra a
// qual se julga se a venda estimada em kg faz sentido.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try {
      await page.waitForFunction(() => {
        try { return typeof _relatorioCarnesWhats === 'function' && typeof _relatorioEscalaWhats === 'function'
          && typeof _renderCarnesDocsHomeBody === 'function'; } catch (e) { return false; }
      }, { timeout: 25000 });
      break;
    } catch (e) { if (t >= 3) { console.log('FALHOU: as funções de relatório não existem'); falhou++; break; } }
  }

  // Captura o texto que iria pro WhatsApp, sem abrir janela nenhuma.
  const capturar = (fn, dados) => page.evaluate(({ fn, dados }) => {
    if (dados.carnes) _carnesDocsHomeData = {
      ...dados.carnes,
      prevMonday: new Date(dados.carnes.prevMonday + 'T12:00:00'),
      prevSunday: new Date(dados.carnes.prevSunday + 'T12:00:00')
    };
    if (dados.escala) _escalaDiaHomeRelatorio = {
      ...dados.escala,
      data: new Date(dados.escala.data + 'T12:00:00'),
      sortTurno: a => a
    };
    let capturado = null;
    const abrirReal = window.open;
    window.open = (url) => { capturado = decodeURIComponent(String(url).replace('https://wa.me/?text=', '')); return { closed: false }; };
    try { window[fn](); } catch (e) { capturado = 'ERRO: ' + (e && e.message); }
    window.open = abrirReal;
    return capturado;
  }, { fn, dados });

  // ── Carnes ───────────────────────────────────────────────────────────────────────────
  const dadosCarnes = {
    carnes: {
      lojaNome: 'Bangu', prevMonday: '2026-09-21', prevSunday: '2026-09-27',
      fatSemana: 123456.78, fatDias: 7, docsAlerta: [],
      carnesResumo: [
        { key: 'carne_sol', label: 'Carne de Sol', icon: '🥩', unit: 'kg', totIni: 50, totEnt: 163.05, totFim: 40, venda: 173.05, faltando: [] },
        { key: 'picanha', label: 'Picanha', icon: '🥩', unit: 'kg', totIni: 10, totEnt: 21.55, totFim: 35, venda: -3.45, faltando: ['Contagem'] }
      ]
    }
  };
  const txtC = await capturar('_relatorioCarnesWhats', dadosCarnes);
  check('relatório de carnes traz a loja e a semana',
    /Bangu/.test(txtC) && /21\/09 a 27\/09/.test(txtC));
  check('traz o FATURAMENTO da semana anterior, formatado em real',
    /Faturamento da semana/.test(txtC) && /123\.456,78/.test(txtC));
  check('traz cada carne com início, compras, contagem e venda estimada',
    /Carne de Sol/.test(txtC) && /163\.1|163,1|163\.05/.test(txtC) && /Venda estimada/.test(txtC));
  check('marca a venda negativa, que é o sinal de divergência', /NEGATIVO/.test(txtC));
  check('e avisa o que falta lançar', /falta lançar: Contagem/.test(txtC));

  // Semana incompleta tem que ser dita, senão faturamento baixo parece queda de venda
  const txtCp = await capturar('_relatorioCarnesWhats',
    { carnes: { ...dadosCarnes.carnes, fatSemana: 40000, fatDias: 3 } });
  check('semana incompleta sai avisada no relatório', /3 de 7 dias/.test(txtCp));

  // ── Escala ───────────────────────────────────────────────────────────────────────────
  const dadosEscala = {
    escala: {
      loja: 'Bangu', data: '2026-10-01', diaIdx: 3, totalPresentes: 3,
      todosSetores: ['Salão'],
      gruposSetor: { 'Salão': [
        { nome: 'Ana', turno: 'MANHÃ', st: 'PRESENTE', horario_dias: [] , horario: '09:00–17:00' },
        { nome: 'Bruno', turno: 'NOITE', st: 'PRESENTE', horario_dias: [] }
      ] },
      semSetor: [{ nome: 'Carlos', st: 'PRESENTE', horario_dias: [] }],
      folga: [{ nome: 'Diana', st: 'FOLGA', horario_dias: [] }],
      ausente: [{ nome: 'Eduardo', st: 'FALTA', horario_dias: [] }]
    }
  };
  const txtE = await capturar('_relatorioEscalaWhats', dadosEscala);
  check('relatório de escala traz loja e data', /Bangu/.test(txtE) && /01\/10/.test(txtE));
  check('traz a contagem de presentes, folga e ausentes',
    /Presentes: \*3\*/.test(txtE) && /🏖 1/.test(txtE) && /⚠️ 1/.test(txtE));
  check('lista por setor, com quem está em cada um',
    /Salão/.test(txtE) && /Ana/.test(txtE) && /Bruno/.test(txtE));
  check('inclui quem está sem setor', /Sem setor/.test(txtE) && /Carlos/.test(txtE));
  check('separa folga e ausentes, dizendo o status de cada um',
    /Diana/.test(txtE) && /Eduardo/.test(txtE) && /Falta|FALTA/.test(txtE));

  // ── O botão existe no card ───────────────────────────────────────────────────────────
  const botao = await page.evaluate(({ carnes }) => {
    _carnesDocsHomeData = { ...carnes, prevMonday: new Date(carnes.prevMonday + 'T12:00:00'),
                            prevSunday: new Date(carnes.prevSunday + 'T12:00:00') };
    _carnesDocsHomeExpanded = true;
    const el = document.getElementById('carnes-docs-home-card');
    if (!el) return { semCard: true };
    _renderCarnesDocsHomeBody();
    return { html: el.innerHTML };
  }, dadosCarnes);
  check('o card de carnes mostra o botão de WhatsApp quando aberto',
    !botao.semCard && /_relatorioCarnesWhats/.test(botao.html || ''));
  check('e mostra o faturamento da semana no próprio card',
    /Faturamento da semana/.test(botao.html || '') && /123\.456,78/.test(botao.html || ''));

  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})();
