// "Ao colar ou escrever uma msg, no tema escuro, as letras somem. No alerta que mando
//  pras lojas."
//
// Causa: o <textarea> do modal declarava `color` e NÃO declarava fundo. A Home não tem CSS
// global de input, então o navegador pintava o campo de branco por padrão — e no tema
// escuro o texto (var(--t1), quase branco) ficava branco no branco.
//
// Esta suíte não confere o CSS escrito: ela MEDE a cor renderizada do texto contra o fundo
// que de fato aparece atrás dele (compondo com os ancestrais quando o campo é transparente)
// e cobra contraste de leitura nos dois temas. É a única forma de o teste falhar pelo
// mesmo motivo que o usuário reclamou.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => {
  console.log((c ? 'OK: ' : 'FALHOU: ') + n);
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 300));
  c ? ok++ : falhou++;
};

const MEDIR = `
(() => {
  const rgb = s => (String(s).match(/[\\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  // O fundo que a pessoa VÊ: se o campo é transparente, quem pinta é o ancestral.
  const fundoReal = el => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = rgb(getComputedStyle(n).backgroundColor);
      if (c.length >= 3 && (c[3] === undefined || c[3] > 0.5)) return c.slice(0, 3);
      n = n.parentElement;
    }
    const b = rgb(getComputedStyle(document.body).backgroundColor);
    return b.length >= 3 ? b.slice(0, 3) : [255, 255, 255];
  };
  const contraste = el => {
    const t = rgb(getComputedStyle(el).color).slice(0, 3);
    const f = fundoReal(el);
    const a = lum(t), b = lum(f);
    return { razao: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), texto: t, fundo: f };
  };
  const campos = [...document.querySelectorAll('#_alerta-lojas-modal textarea, #_alerta-lojas-modal input[type=text], #_alerta-lojas-modal input:not([type])')];
  return campos.map(el => Object.assign({ id: el.id || el.tagName.toLowerCase() }, contraste(el)));
})()`;

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  for (const tema of ['escuro', 'claro']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await ctx.addInitScript(t => { try { localStorage.setItem('gn_tema', t); } catch (e) {} }, tema);
    await ctx.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    const page = await ctx.newPage();
    const erros = [];
    page.on('pageerror', e => erros.push(String(e.message || e)));
    await page.goto('file://' + HOME);
    await page.waitForFunction(() => { try { return typeof abrirModalAlertaLojas === 'function'; } catch (e) { return false; } }, { timeout: 25000 });

    await page.evaluate(() => { abrirModalAlertaLojas(); });
    await page.waitForTimeout(400);
    check(`[${tema}] o modal do alerta abre`, (await page.locator('#_alerta-lojas-modal').count()) === 1);
    check(`[${tema}] o tema aplicado é o pedido`,
      (await page.evaluate(() => document.documentElement.getAttribute('data-tema'))) === (tema === 'escuro' ? 'escuro' : null),
      await page.evaluate(() => document.documentElement.getAttribute('data-tema')));

    // Vazio: só o placeholder. Já é onde o campo tem que ter fundo próprio.
    const vazio = await page.evaluate(MEDIR);
    const campo = vazio.find(c => c.id === '_alerta-loja-motivo');
    check(`[${tema}] o campo do recado existe e foi medido`, !!campo, JSON.stringify(vazio));
    check(`[${tema}] o texto do recado tem contraste de leitura contra o fundo do campo`,
      campo && campo.razao >= 4.5,
      campo && `razão ${campo.razao.toFixed(2)} · texto rgb(${campo.texto}) · fundo rgb(${campo.fundo})`);

    // Agora escrevendo de verdade — que é o que o usuário fez.
    await page.fill('#_alerta-loja-motivo', 'Pessoal, a partir de hoje a transferência de mesa é lançada no caixa.');
    await page.waitForTimeout(200);
    const escrito = await page.evaluate(MEDIR);
    const c2 = escrito.find(c => c.id === '_alerta-loja-motivo');
    check(`[${tema}] com texto escrito, segue legível`, c2 && c2.razao >= 4.5,
      c2 && `razão ${c2.razao.toFixed(2)} · texto rgb(${c2.texto}) · fundo rgb(${c2.fundo})`);
    check(`[${tema}] e o que foi escrito está mesmo no campo`,
      (await page.inputValue('#_alerta-loja-motivo')).includes('transferência de mesa'));

    // Nenhum outro campo do modal pode ter o mesmo defeito.
    const ruins = escrito.filter(c => c.razao < 4.5);
    check(`[${tema}] nenhum campo do modal fica ilegível`, ruins.length === 0, JSON.stringify(ruins));

    check(`[${tema}] sem erro de JS`, erros.length === 0, erros.join(' | '));
    await ctx.close();
  }

  // Varredura do arquivo: campo de texto que declara cor e não declara fundo é o defeito
  // deste commit. Se voltar em qualquer outro campo da Home, este teste pega.
  {
    const fs = require('fs');
    const html = fs.readFileSync(HOME, 'utf8');
    const semFundo = [];
    const re = /<(textarea|input|select)\b[^>]*style="([^"]*)"[^>]*>/g;
    let m;
    while ((m = re.exec(html))) {
      const est = m[2];
      const tipo = (/type="([^"]*)"/.exec(m[0]) || [])[1] || 'text';
      if (['checkbox', 'radio', 'file', 'range', 'color', 'hidden'].includes(tipo)) continue;
      if (/(^|;)\s*color:/.test(est) && !/background/.test(est)) {
        semFundo.push(((/id="([^"]*)"/.exec(m[0]) || [])[1]) || m[0].slice(0, 60));
      }
    }
    check('nenhum campo da Home declara cor de texto sem declarar o fundo',
      semFundo.length === 0, JSON.stringify(semFundo));
  }

  await browser.close();
  console.log('\n' + HOME);
  console.log(ok + ' ok, ' + falhou + ' falhou');
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error('ERRO: ' + e.message); process.exit(2); });
