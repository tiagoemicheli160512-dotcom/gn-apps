// "No card da visita da loja, seria bom identificar quando for acesso remoto. Pois aparece
//  a visita, mas pode dar a entender que foram duas presenciais."
//
// O caso real do print (Norte Shopping, 23/10): três linhas iguais no card — uma planejada,
// uma 09:11→10:29 que era ACESSO REMOTO, e uma 11:43 em andamento, essa sim presencial. Nada
// na tela separava as duas, e remoto não é presença física (ver TIPO_VISITA_REMOTO).
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n);
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 320)); c ? ok++ : falhou++; };

const hoje = new Date();
const iso = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const HOJE = iso(hoje);
const ONTEM = iso(new Date(hoje.getTime() - 864e5));

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });

  // Semeia as visitas que a consulta do card vai encontrar e devolve o HTML desenhado.
  async function desenhar(visitas) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await ctx.route('**/rest/v1/**', r => {
      const u = r.request().url();
      if (/gn_chk_visitas/.test(u))
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(visitas) });
      r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    const page = await ctx.newPage();
    const erros = [];
    page.on('pageerror', e => erros.push(String(e.message || e)));
    await page.goto('file://' + HOME);
    await page.waitForFunction(() => { try {
      return typeof _renderVisitaSupervisaoHome === 'function' && typeof _visSeloHtml === 'function';
    } catch (e) { return false; } }, { timeout: 25000 });
    const html = await page.evaluate(async () => {
      window.gnFetchJson = async (url, h, tag, fb) => {
        const r = await fetch(url, { headers: h });
        return r.ok ? r.json() : fb;
      };
      session = { id: 1, nome: 'Tiago', cargo: 'mestre', loja: 'GERAL', permissoes: { master: true } };
      masterLoja = 'NORTE SHOPPING';
      await _renderVisitaSupervisaoHome(true, session, true);
      const el = document.getElementById('visita-supervisao-home-card');
      return { html: el.innerHTML, texto: el.innerText };
    });
    await ctx.close();
    return Object.assign(html, { erros });
  }

  // ── 1. O caso do print: planejada + remota + presencial no mesmo dia ───────────────
  {
    const r = await desenhar([
      { visitante: 'Tiago', cargo: 'mestre', data: HOJE, hora_chegada: 'PLAN',  hora_saida: 'PLAN',  tipo_visita: null },
      { visitante: 'Tiago', cargo: 'mestre', data: HOJE, hora_chegada: '09:11', hora_saida: '10:29', tipo_visita: 'remoto' },
      { visitante: 'Tiago', cargo: 'mestre', data: HOJE, hora_chegada: '11:43', hora_saida: null,    tipo_visita: null },
    ]);
    check('o card de hoje aparece', /Visita de supervisão hoje/.test(r.texto), r.texto.slice(0, 120));
    check('a linha do acesso remoto ganha o selo', /💻 Remoto/.test(r.html), r.html.slice(0, 300));
    check('e só ela — a presencial não é marcada', (r.html.match(/💻 Remoto/g) || []).length === 1,
      (r.html.match(/💻 Remoto/g) || []).length + ' selos');
    // O selo tem que estar na linha das 09:11, não na das 11:43.
    const linhas = r.html.split('border-top:1px solid');
    const daRemota = linhas.find(x => /09:11/.test(x));
    const daPresencial = linhas.find(x => /11:43/.test(x));
    check('o selo está na linha de 09:11 → 10:29', !!daRemota && /💻 Remoto/.test(daRemota), (daRemota || '').slice(0, 220));
    check('e NÃO na linha das 11:43', !!daPresencial && !/💻 Remoto/.test(daPresencial), (daPresencial || '').slice(0, 220));
    check('o rodapé diz quantas foram remotas', /1 delas é acesso remoto/.test(r.texto), r.texto);
    check('os três status continuam aparecendo', /Planejada/.test(r.texto) && /Concluída/.test(r.texto) && /Em andamento/.test(r.texto), r.texto);
    check('sem erro de JS', r.erros.length === 0, r.erros.join(' | '));
  }

  // ── 2. Dia só de acesso remoto: a frase tem que dizer isso ─────────────────────────
  {
    const r = await desenhar([
      { visitante: 'Tiago', cargo: 'mestre', data: HOJE, hora_chegada: '09:11', hora_saida: '10:29', tipo_visita: 'remoto' },
    ]);
    check('dia só com remoto avisa que ninguém esteve na loja',
      /ninguém da supervisão esteve na loja/i.test(r.texto), r.texto);
    check('e a linha segue marcada como remota', /💻 Remoto/.test(r.html));
  }

  // ── 3. Dia só presencial: nada muda do que já era ──────────────────────────────────
  {
    const r = await desenhar([
      { visitante: 'Anderson', cargo: 'supervisor', data: HOJE, hora_chegada: '14:00', hora_saida: '16:30', tipo_visita: null },
    ]);
    check('visita presencial não ganha selo nem rodapé',
      !/💻 Remoto/.test(r.html) && !/acesso remoto/i.test(r.texto), r.texto);
  }

  // ── 4. Sem visita hoje: a frase da semana não pode chamar remoto de visita ─────────
  {
    const r = await desenhar([
      { visitante: 'Tiago', cargo: 'mestre', data: ONTEM, hora_chegada: '09:00', hora_saida: '10:00', tipo_visita: 'remoto' },
    ]);
    check('semana só com remoto NÃO diz "já teve visita"', !/Já teve visita essa semana/.test(r.texto), r.texto);
    check('diz que só teve acesso remoto', /Só teve acesso remoto essa semana/.test(r.texto), r.texto);
    check('e a linha leva o selo', /💻 Remoto/.test(r.html));
  }
  {
    const r = await desenhar([
      { visitante: 'Tiago',    cargo: 'mestre',     data: ONTEM, hora_chegada: '09:00', hora_saida: '10:00', tipo_visita: 'remoto' },
      { visitante: 'Anderson', cargo: 'supervisor', data: ONTEM, hora_chegada: '15:00', hora_saida: '17:00', tipo_visita: null },
    ]);
    check('com uma presencial na semana, volta a dizer "já teve visita"',
      /Já teve visita essa semana/.test(r.texto), r.texto);
    check('e a remota continua identificada na lista', /💻 Remoto/.test(r.html) && /Anderson/.test(r.texto), r.texto);
  }
  {
    const r = await desenhar([
      { visitante: 'Anderson', cargo: 'supervisor', data: ONTEM, hora_chegada: 'PLAN', hora_saida: 'PLAN', tipo_visita: null },
    ]);
    check('só planejada segue dizendo planejada', /Visita planejada pra essa semana/.test(r.texto), r.texto);
  }

  // ── 5. O selo é um só, usado nos três lugares ──────────────────────────────────────
  {
    const fs = require('fs');
    const src = fs.readFileSync(HOME, 'utf8');
    check('o <span> do selo não está copiado pela página',
      (src.match(/💻 Remoto<\/span>/g) || []).length === 1,
      (src.match(/💻 Remoto<\/span>/g) || []).length + ' cópias');
    check('e os três lugares chamam o mesmo helper',
      (src.match(/_visSeloHtml\(/g) || []).length >= 4,
      (src.match(/_visSeloHtml\(/g) || []).length + ' usos');
  }

  await browser.close();
  console.log('\n' + HOME);
  console.log(ok + ' ok, ' + falhou + ' falhou');
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error('ERRO: ' + e.message); process.exit(2); });
