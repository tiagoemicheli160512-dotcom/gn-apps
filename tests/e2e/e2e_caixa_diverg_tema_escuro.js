// Quadro "DIVERGÊNCIA — VERIFICAR" no tema escuro (27/11/2026). O quadro tem fundo claro fixo;
// a lista dos itens (Sistema · Conferido · diferença) não tinha cor própria, herdava a letra
// clara do tema escuro e ficava invisível — a loja via o título e o botão, mas não ONDE estava
// a divergência. Cobra: texto escuro legível sobre o fundo do quadro, nos dois temas, e a linha
// cabendo na tela do celular.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const ARQ = process.env.ARQ || CAMINHOS.pub('gn-caixa.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra).slice(0, 500))); c ? ok++ : falhou++; };
const CONF = { tem_divergencia: true, conferido_por: 'Financeiro',
  itens: { bandeiras: { 'Visa Crédito': { label: 'Visa Crédito', sistema: 250, conferido: 230, dif: -20 } }, total_real: { label: 'Total Real (Cofre)', sistema: 300, conferido: 300, dif: 0 } } };
(async () => {
  const browser = await chromium.launch(CAMINHOS.CHROMIUM ? { executablePath: CAMINHOS.CHROMIUM } : {});
  const erros = [];
  for (const tema of ['escuro', 'claro']) {
    for (const resolvida of [false, true]) {
      const ctx = await browser.newContext({ viewport: { width: 360, height: 800 } });
      await ctx.addInitScript(t => { try { localStorage.setItem('gn_tema', t); } catch (e) {} }, tema);
      const conf = resolvida ? Object.assign({}, CONF, { divergencia_resolvida: { resolvido_por: 'Ana', resolvido_em: '2026-11-27T23:40:00Z', obs: 'Operador orientado.' } }) : CONF;
      await ctx.route('**/rest/v1/**', r => /gn_lojas\?loja=eq\./.test(r.request().url())
        ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ all_data: { caixa_conferencias: { 'f1': conf } } }]) })
        : r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
      const page = await ctx.newPage(); page.on('pageerror', e => erros.push(String(e.message)));
      await page.goto('file://' + ARQ);
      await page.waitForFunction(() => typeof carregarBannerConferencia === 'function', null, { timeout: 25000 });
      const r = await page.evaluate(async (tema) => {
        if (tema === 'escuro') document.documentElement.setAttribute('data-tema', 'escuro'); else document.documentElement.removeAttribute('data-tema');
        S.user = { nome: 'Ana', cargo: 'gerente' }; S.loja = 'BANGU'; S.modoConsulta = true;
        S.fech = { id: 'f1', loja: 'BANGU', data: '2026-11-27', turno: 'NOITE', status: 'FECHADO', suprimento_inicial: 0 };
        S.comprovantes = []; S.saidas = []; S.supr = []; S.notas10 = []; S.cancel = [];
        ['telaLogin', 'telaTurno'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
        document.getElementById('app').classList.remove('hidden'); irPara('fechar');
        await carregarBannerConferencia();
        // Acha a lista pelo texto (vale pra versão antiga e pra nova).
        const item = [...document.querySelectorAll('#divBannerConf span')].find(x => /Conferido R\$/.test(x.textContent));
        const lista = item && item.parentElement.parentElement;
        const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number); const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]); };
        const caixa = document.querySelector('#divBannerConf > div');
        const fundo = getComputedStyle(caixa).backgroundColor, cor = item ? getComputedStyle(item).color : 'rgb(255,255,255)';
        const L1 = lum(fundo), L2 = lum(cor), contraste = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
        return { tem: !!item, texto: lista ? lista.innerText.replace(/\s+/g, ' ') : '', contraste: Math.round(contraste * 10) / 10,
          cabe: item ? item.getBoundingClientRect().right <= caixa.getBoundingClientRect().right + 1 && caixa.getBoundingClientRect().right <= window.innerWidth + 1 : false,
          medidas: item ? [Math.round(item.getBoundingClientRect().right), Math.round(caixa.getBoundingClientRect().right), window.innerWidth, document.documentElement.scrollWidth] : null };
      }, tema);
      const rot = `${tema}, ${resolvida ? 'já identificada' : 'a verificar'}`;
      check(`${rot}: a lista mostra o item divergente (Visa Crédito · Sistema 250 · Conferido 230)`, r.tem && /Visa Crédito/.test(r.texto) && /Conferido R\$ 230,00/.test(r.texto) && !/Total Real/.test(r.texto), r);
      check(`${rot}: texto legível sobre o fundo do quadro (contraste ≥ 4,5)`, r.contraste >= 4.5, r);
      check(`${rot}: a linha cabe na tela de 360 px`, r.cabe, r);
      await ctx.close();
    }
  }
  check('nenhum erro de JavaScript', erros.length === 0, erros);
  console.log(`\n${ok} OK, ${falhou} falhou`); await browser.close(); process.exit(falhou ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
