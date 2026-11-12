// "No app home painel de gestão em visitas, já temos a localização por GPS quando colocamos a
//  chegada, tem como incluir a opção da foto, e com a marca d'água com a localização?" (12/11/2026)
//
// Cobra:
//  - campo de foto (opcional) na chegada presencial; some no remoto;
//  - ao confirmar: marca d'água DESENHADA na imagem com loja, quem chegou, data/hora,
//    endereço e GPS; imagem reduzida (lado máx. 1600); sobe pra gn-fotos/visitas;
//    a visita grava foto_chegada;
//  - GPS negado: a marca diz que a localização não foi obtida;
//  - foto antiga (galeria): pergunta antes; seguindo, a marca avisa; cancelando, nada grava;
//  - foto não subiu: pergunta se registra sem a foto (a chegada não se perde);
//  - sem foto: tudo como antes; miniatura só pra URL https.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const HOME = process.env.ARQ_HOME || CAMINHOS.pub('gn-home.html');
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 500)); };
const DIA = '2026-10-01';

(async () => {
  const browser = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 900 } });
  await CAMINHOS.fixarRelogio(ctx, '2026-10-01T10:30:00');
  let proxId = 1, uploads = [], posts = [], falharUpload = false;
  await ctx.route('**/storage/v1/object/**', async route => {
    const req = route.request();
    if (req.method() !== 'POST') return route.fulfill({ status: 200, body: '' });
    if (falharUpload) return route.fulfill({ status: 500, body: 'erro' });
    uploads.push({ url: req.url(), tipo: req.headers()['content-type'], tam: (req.postDataBuffer() || Buffer.alloc(0)).length, b64: (req.postDataBuffer() || Buffer.alloc(0)).toString('base64') });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"x"}' });
  });
  await ctx.route('**/rest/v1/**', async route => {
    const req = route.request(), url = req.url(), m = req.method();
    if (/gn_chk_visitas/.test(url) && m === 'POST') {
      const enviado = JSON.parse(req.postData() || '[]'); posts.push(enviado);
      const rows = (Array.isArray(enviado) ? enviado : [enviado]).map(b => ({ ...b, id: proxId++ }));
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(rows) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
  const dialogos = []; let responder = true;
  page.on('dialog', d => { dialogos.push(d.message()); responder ? d.accept() : d.dismiss(); });
  for (let t = 1; ; t++) {
    await page.goto('file://' + HOME);
    try { await page.waitForFunction(() => { try { return typeof _visCalDetalheHtml === 'function' && typeof _visCarimbarFoto === 'function'; } catch (e) { return false; } }, { timeout: 25000 }); break; }
    catch (e) { if (t >= 3) { console.log('FALHOU: a Home não carregou (ou falta o código novo)'); console.log('\n0 OK, 1 falhou'); process.exit(1); } }
  }
  await page.evaluate(() => {
    window.__textos = []; const orig = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, x, y) { window.__textos.push(String(t)); return orig.apply(this, arguments); };
  });
  const montar = (gps) => page.evaluate(([dia, gps]) => {
    session = { id: 1, nome: 'Tiago', loja: 'GERAL', cargo: 'mestre', permissoes: { master: true } };
    _visSupList = [{ id: 7, nome: 'Carlos', cargo: 'supervisor' }]; _visSupSelecionado = 'Carlos';
    window._reverseGeocodeVP = async () => 'Rua de Teste, 10 - Bangu';
    navigator.geolocation.getCurrentPosition = gps
      ? (res) => res({ coords: { latitude: -22.8761234, longitude: -43.4651234, accuracy: 12 } })
      : (res, rej) => rej(new Error('negado'));
    let box = document.getElementById('_teste-dia');
    if (!box) { box = document.createElement('div'); box.id = '_teste-dia'; document.body.appendChild(box); }
    box.innerHTML = _visCalDetalheHtml(dia);
    if (!document.getElementById('visitas-sup-content')) { const a = document.createElement('div'); a.id = 'visitas-sup-content'; document.body.appendChild(a); }
    const sel = document.getElementById('visreg-destino-' + dia); if (sel) { const o = [...sel.options].find(x => /BANGU|Bangu/.test(x.value)); if (o) sel.value = o.value; }
    window.__textos = [];
  }, [DIA, gps]);
  // Foto "tirada agora": 4000x3000 branca, com lastModified opcional.
  const escolherFoto = (minutosAtras) => page.evaluate(async ([dia, min]) => {
    const cv = document.createElement('canvas'); cv.width = 4000; cv.height = 3000;
    const c = cv.getContext('2d'); c.fillStyle = '#ffffff'; c.fillRect(0, 0, 4000, 3000);
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9));
    const f = new File([blob], 'foto.jpg', { type: 'image/jpeg', lastModified: Date.now() - (min || 0) * 60000 });
    const dt = new DataTransfer(); dt.items.add(f);
    const inp = document.getElementById('visreg-foto-' + dia); inp.files = dt.files; _visFotoEscolhida(dia);
    return getComputedStyle(document.getElementById('visreg-foto-prev-' + dia)).display;
  }, [DIA, minutosAtras]);
  const registrar = () => page.evaluate(async dia => { await _visRegistrarChegada(dia); }, DIA);
  const visivel = id => page.evaluate(id => { const el = document.getElementById(id); return !!el && getComputedStyle(el).display !== 'none'; }, id);

  // ── 1. O campo ──────────────────────────────────────────────────────────────────────
  await montar(true);
  check('chegada presencial tem o campo "📷 Foto da chegada (opcional)"', await visivel('visreg-foto-wrap-' + DIA)
    && await page.evaluate(d => { const i = document.getElementById('visreg-foto-' + d); return i.accept === 'image/*' && i.getAttribute('capture') === 'environment'; }, DIA));
  await page.evaluate(d => { document.getElementById('visreg-remoto-' + d).checked = true; _visRemotoToggle(d); }, DIA);
  check('no remoto o campo de foto some (GPS do computador não diz nada da loja)', !(await visivel('visreg-foto-wrap-' + DIA)));
  await page.evaluate(d => { document.getElementById('visreg-remoto-' + d).checked = false; _visRemotoToggle(d); }, DIA);
  check('…e volta no presencial', await visivel('visreg-foto-wrap-' + DIA));
  check('escolher a foto mostra a miniatura', (await escolherFoto(0)) === 'flex');

  // ── 2. Registrar com foto ───────────────────────────────────────────────────────────
  uploads = []; posts = []; dialogos.length = 0;
  await registrar();
  const tx = await page.evaluate(() => window.__textos.join(' | '));
  check('subiu UMA foto, em JPEG, pra gn-fotos/visitas', uploads.length === 1 && /\/gn-fotos\/visitas\//.test(uploads[0].url) && uploads[0].tipo === 'image/jpeg', JSON.stringify(uploads.map(u => [u.url, u.tipo])));
  const dims = uploads[0] ? await page.evaluate(async b64 => { const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode(); return [img.naturalWidth, img.naturalHeight]; }, uploads[0].b64) : [0, 0];
  check('a foto foi reduzida (4000×3000 → 1600×1200)', dims[0] === 1600 && dims[1] === 1200, JSON.stringify(dims));
  const escura = uploads[0] ? await page.evaluate(async b64 => { const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const px = (yy) => x.getImageData(5, yy, 1, 1).data[0]; return [px(10), px(c.height - 5)]; }, uploads[0].b64) : [0, 0];
  check('a marca d\'água está DESENHADA na imagem (faixa escura embaixo, topo intacto)', escura[0] > 240 && escura[1] < 140, JSON.stringify(escura));
  check('a marca traz a identificação do app (GN Operações · Visita)', /GN Operações · Visita/.test(tx), tx);
  check('a marca traz loja e quem chegou', /Bangu · Carlos/i.test(tx), tx);
  check('…data e hora da chegada', /Chegada 01\/10\/2026 10:30/.test(tx), tx);
  check('…o endereço e o GPS com a precisão', /Rua de Teste, 10/.test(tx) && /GPS -22\.876123, -43\.465123 \(±12 m\)/.test(tx), tx);
  const corpo = posts[0] && posts[0][0];
  check('a visita grava foto_chegada com a URL da foto', corpo && typeof corpo.foto_chegada === 'string' && /\/storage\/v1\/object\/public\/gn-fotos\/visitas\//.test(corpo.foto_chegada), JSON.stringify(corpo));
  check('…e continua gravando hora e GPS como antes', corpo && corpo.hora_chegada === '10:30' && corpo.lat === -22.876123 && corpo.endereco === 'Rua de Teste, 10 - Bangu', JSON.stringify(corpo));
  check('sem pergunta nenhuma quando a foto é de agora', dialogos.length === 0, dialogos.join(' | '));
  const thumb = await page.evaluate(u => _visFotoThumbHtml({ foto_chegada: u }), corpo && corpo.foto_chegada);
  check('a visita registrada mostra a miniatura com link pra foto', /<img src="https:\/\/.+gn-fotos\/visitas\//.test(thumb) && /target="_blank"/.test(thumb), thumb.slice(0, 200));
  check('URL que não é https não vira miniatura', await page.evaluate(() => _visFotoThumbHtml({ foto_chegada: 'javascript:alert(1)' }) === ''));

  // ── 3. GPS negado ───────────────────────────────────────────────────────────────────
  await montar(false); await escolherFoto(0); uploads = []; posts = [];
  await registrar();
  const tx2 = await page.evaluate(() => window.__textos.join(' | '));
  check('GPS negado: a marca diz que a localização não foi obtida', /Localização não obtida/.test(tx2) && uploads.length === 1, tx2);

  // ── 4. Foto antiga ──────────────────────────────────────────────────────────────────
  await montar(true); await escolherFoto(60 * 24); uploads = []; posts = []; dialogos.length = 0; responder = false;
  await registrar();
  check('foto antiga: pergunta antes ("não de agora")', dialogos.some(d => /não de agora/.test(d)), dialogos.join(' | '));
  check('…cancelando, nada é gravado', uploads.length === 0 && posts.length === 0);
  responder = true; dialogos.length = 0; await montar(true); await escolherFoto(60 * 24);
  await registrar();
  const tx3 = await page.evaluate(() => window.__textos.join(' | '));
  check('…seguindo, a marca avisa "foto de 30/09/2026 10:30, não tirada na chegada"', /Atenção: foto de 30\/09\/2026 10:30, não tirada na chegada/.test(tx3), tx3);

  // ── 5. Upload falhou ────────────────────────────────────────────────────────────────
  await montar(true); await escolherFoto(0); uploads = []; posts = []; dialogos.length = 0; falharUpload = true;
  await registrar();
  falharUpload = false;
  check('foto não subiu: pergunta se registra a chegada sem ela', dialogos.some(d => /sem a foto/.test(d)), dialogos.join(' | '));
  check('…confirmando, a chegada é gravada (sem foto_chegada)', posts.length === 1 && posts[0][0] && !('foto_chegada' in posts[0][0]) && posts[0][0].lat === -22.876123, JSON.stringify(posts));

  // ── 6. Sem foto: como antes ─────────────────────────────────────────────────────────
  await montar(true); uploads = []; posts = []; dialogos.length = 0;
  await registrar();
  check('sem foto: nenhum upload, chegada gravada como antes', uploads.length === 0 && posts.length === 1 && !('foto_chegada' in posts[0][0]), JSON.stringify(posts));

  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
