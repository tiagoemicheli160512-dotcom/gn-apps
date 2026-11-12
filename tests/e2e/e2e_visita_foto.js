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
  // cargo de quem está sendo registrado: 'administrador' (foto opcional) ou 'supervisor' (obrigatória).
  const montar = (gps, cargo) => page.evaluate(([dia, gps, cargo]) => {
    session = { id: 1, nome: 'Tiago', loja: 'GERAL', cargo: 'mestre', permissoes: { master: true } };
    _visSupList = [{ id: 7, nome: 'Carlos', cargo: cargo || 'administrador' }]; _visSupSelecionado = 'Carlos';
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
  }, [DIA, gps, cargo]);
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

  // ── 7. Supervisor: foto obrigatória ────────────────────────────────────────────────
  await montar(true, 'supervisor'); uploads = []; posts = []; dialogos.length = 0;
  check('supervisor: o campo diz "(obrigatória)"', await page.evaluate(d => /obrigatória/.test(document.getElementById('visreg-foto-rot-' + d).textContent), DIA));
  let geoPedido = 0; await page.exposeFunction('__geoConta', () => { geoPedido++; });
  await page.evaluate(() => { const g = navigator.geolocation.getCurrentPosition; navigator.geolocation.getCurrentPosition = (a, b, c) => { window.__geoConta(); g(a, b, c); }; });
  await registrar();
  check('supervisor sem foto: avisa e NÃO registra (nem pede GPS)', dialogos.some(d => /obrigatória/.test(d)) && posts.length === 0 && geoPedido === 0, JSON.stringify({ dialogos, posts: posts.length, geoPedido }));
  await escolherFoto(0); dialogos.length = 0; falharUpload = true;
  await registrar(); falharUpload = false;
  check('supervisor com foto que não subiu: avisa e NÃO registra sem foto', dialogos.some(d => /obrigatória/.test(d)) && posts.length === 0, JSON.stringify({ dialogos, posts }));
  dialogos.length = 0;
  await registrar();
  check('supervisor com foto: registra com foto_chegada', posts.length === 1 && /gn-fotos\/visitas\//.test(posts[0][0].foto_chegada || '') && dialogos.length === 0, JSON.stringify(posts));
  await page.evaluate(d => { document.getElementById('visreg-remoto-' + d).checked = true; _visRemotoToggle(d); }, DIA);
  check('supervisor no remoto: sem campo de foto (remoto não tem foto)', !(await visivel('visreg-foto-wrap-' + DIA)));

  // ── 8. Foto na saída ────────────────────────────────────────────────────────────────
  // Visita em andamento (chegada já registrada) com o painel do dia na tela.
  const abrirSaida = (cargo) => page.evaluate(([dia, cargo]) => {
    _visSupList = [{ id: 7, nome: 'Carlos', cargo }]; _visSupSelecionado = 'Carlos';
    _visCalData = [{ id: 501, loja: 'BANGU', data: dia, visitante: 'Carlos', cargo, hora_chegada: '09:00', hora_saida: null, lat: -22.876123, lon: -43.465123, endereco: 'Rua de Teste, 10 - Bangu', foto_chegada: 'https://ncxttwvpafajnilpjbol.supabase.co/storage/v1/object/public/gn-fotos/visitas/c.jpg' }];
    document.getElementById('_teste-dia').innerHTML = _visCalDetalheHtml(dia);
    window.__textos = [];
    return !!document.getElementById('visreg-foto-s501');
  }, [DIA, cargo]);
  let patches = [];
  await ctx.route('**/rest/v1/gn_chk_visitas?id=eq.*', async route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    const b = JSON.parse(route.request().postData() || '{}'); patches.push(b);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 501, loja: 'BANGU', data: DIA, visitante: 'Carlos', hora_chegada: '09:00', ...b }]) });
  });
  check('visita em andamento mostra "📷 Foto da saída" e a miniatura da chegada', await abrirSaida('administrador')
    && await page.evaluate(() => /📷 chegada/.test(document.getElementById('_teste-dia').innerText)));
  const escolherSaida = () => page.evaluate(async () => {
    const cv = document.createElement('canvas'); cv.width = 800; cv.height = 600; const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, 800, 600);
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9));
    const dt = new DataTransfer(); dt.items.add(new File([blob], 's.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
    document.getElementById('visreg-foto-s501').files = dt.files; _visFotoEscolhida('s501');
  });
  uploads = []; patches = []; dialogos.length = 0;
  await escolherSaida();
  await page.evaluate(async d => { await _visRegistrarSaida('501', d); }, DIA);
  const txs = await page.evaluate(() => window.__textos.join(' | '));
  check('saída com foto: sobe a foto e grava foto_saida junto da hora', uploads.length === 1 && patches.length === 1 && /gn-fotos\/visitas\//.test(patches[0].foto_saida || '') && patches[0].hora_saida === '10:30', JSON.stringify(patches));
  check('…a marca diz "Saída" com data/hora e o GPS da saída', /Saída 12\/10|Saída 01\/10\/2026 10:30/.test(txs) && /GPS -22\.876123/.test(txs), txs);
  await abrirSaida('administrador'); uploads = []; patches = [];
  await page.evaluate(async d => { await _visRegistrarSaida('501', d); }, DIA);
  check('saída sem foto (não supervisor): registra como antes, sem foto_saida', patches.length === 1 && !('foto_saida' in patches[0]) && uploads.length === 0, JSON.stringify(patches));
  await abrirSaida('supervisor'); uploads = []; patches = []; dialogos.length = 0;
  await page.evaluate(async d => { await _visRegistrarSaida('501', d); }, DIA);
  check('supervisor: saída sem foto avisa e NÃO registra', dialogos.some(d => /obrigatória/.test(d)) && patches.length === 0, JSON.stringify({ dialogos, patches }));
  const ambas = await page.evaluate(() => _visFotoThumbHtml({ foto_chegada: 'https://x.supabase.co/a.jpg', foto_saida: 'https://x.supabase.co/b.jpg' }));
  check('a visita mostra as duas miniaturas (chegada e saída)', /📷 chegada/.test(ambas) && /📷 saída/.test(ambas));

  // ── 9. Enviar a foto pelo WhatsApp e fotos nos PDFs (12/11/2026) ─────────────────
  const URLF = 'https://ncxttwvpafajnilpjbol.supabase.co/storage/v1/object/public/gn-fotos/visitas/c.jpg';
  const jpg = await page.evaluate(async () => { const cv = document.createElement('canvas'); cv.width = 40; cv.height = 30; cv.getContext('2d').fillRect(0, 0, 40, 30);
    return (await new Promise(r => cv.toBlob(b => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(b); }, 'image/jpeg', .8))); });
  await ctx.route('**/storage/v1/object/public/gn-fotos/visitas/**', r => r.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.from(jpg, 'base64') }));
  const VIS = { id: 777, loja: 'BANGU', data: '2026-10-01', visitante: 'Carlos', cargo: 'supervisor', hora_chegada: '09:00', hora_saida: '11:30',
    endereco: 'Rua de Teste, 10 - Bangu', endereco_saida: 'Rua de Teste, 12 - Bangu', obs: 'Treinamento do salão', foto_chegada: URLF, foto_saida: URLF.replace('c.jpg', 's.jpg') };
  const thumb2 = await page.evaluate(v => _visFotoThumbHtml(v), VIS);
  check('cada foto da visita tem o botão "📤 Enviar"', (thumb2.match(/_visFotoCompartilhar\('777','(chegada|saida)'\)/g) || []).length === 2 && /📤 Enviar/.test(thumb2), thumb2.slice(0, 300));
  const sh = await page.evaluate(async () => {
    window.__share = null; navigator.canShare = () => true;
    navigator.share = async (d) => { window.__share = { n: d.files.length, tipo: d.files[0].type, nome: d.files[0].name, tam: d.files[0].size, text: d.text }; };
    await _visFotoCompartilhar('777', 'chegada'); return window.__share;
  });
  check('no celular: compartilha a FOTO anexada (jpg), não só o link', sh && sh.n === 1 && sh.tipo === 'image/jpeg' && sh.tam > 100 && /visita-Bangu-2026-10-01-chegada\.jpg/.test(sh.nome), JSON.stringify(sh));
  check('…com o texto da visita: loja, data, horários, quem, endereço e observação', sh && /Visita — Bangu \(chegada\)/.test(sh.text) && /01\/10\/2026/.test(sh.text) && /09:00 → 11:30 \(2h 30min\)/.test(sh.text) && /Carlos · supervisor/.test(sh.text) && /Rua de Teste, 10 - Bangu/.test(sh.text) && /Treinamento do salão/.test(sh.text), sh && sh.text);
  const sh2 = await page.evaluate(async () => { await _visFotoCompartilhar('777', 'saida'); return window.__share; });
  check('na foto da saída, o endereço é o da SAÍDA', sh2 && /\(saída\)/.test(sh2.text) && /Rua de Teste, 12/.test(sh2.text), sh2 && sh2.text);
  const fb = await page.evaluate(async () => {
    navigator.canShare = undefined; window.__abriu = []; const oo = window.open; window.open = (u) => { window.__abriu.push(u); return null; };
    window.__baixou = 0; const oc = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) window.__baixou++; };
    const oa = window.alert; window.alert = () => {};
    await _visFotoCompartilhar('777', 'chegada');
    window.open = oo; HTMLAnchorElement.prototype.click = oc; window.alert = oa;
    return { abriu: window.__abriu, baixou: window.__baixou };
  });
  check('sem compartilhar arquivo (computador): baixa a foto e abre o WhatsApp com o texto e o link', fb.baixou === 1 && fb.abriu.length === 1 && /^https:\/\/wa\.me\/\?text=/.test(fb.abriu[0]) && decodeURIComponent(fb.abriu[0]).includes(URLF), JSON.stringify(fb));
  const pdfHtml = await page.evaluate(v => _visFotosPdfHtml([v, { id: 1, loja: 'FOLGA', data: '2026-10-02', hora_chegada: '00:00' }, { id: 2, loja: 'BANGU', data: '2026-10-03', hora_chegada: 'PLAN' }]), VIS);
  check('PDF de imprimir: seção "Fotos das visitas" com as 2 fotos e a legenda (sem ausência nem plano)', /Fotos das visitas \(2\)/.test(pdfHtml) && (pdfHtml.match(/<img src=/g) || []).length === 2 && /Treinamento do salão/.test(pdfHtml), pdfHtml.slice(0, 300));
  const jp = await page.evaluate(async (v) => {
    const chamadas = { addImage: 0, textos: [] };
    window.jspdf = { jsPDF: class { constructor() { this.internal = { pageSize: { getHeight: () => 842, getWidth: () => 595 } }; }
      setFont() {} setFontSize() {} addPage() {} splitTextToSize(t) { return String(t).split('\n'); }
      text(t) { chamadas.textos.push(String(t)); } addImage(d, f) { chamadas.addImage++; chamadas.fmt = f; chamadas.du = String(d).slice(0, 23); }
      output() { return new Blob(['%PDF']); } } };
    await _textoParaPdfBlob('Relatório', 'Visitas', _visFotosDoPeriodo([v]).concat([{ url: 'https://x.invalid/nao.jpg', legenda: 'x' }]));
    return chamadas;
  }, VIS);
  check('PDF no Whats: as fotos entram como imagem (2) e a que não baixa vira linha com o link', jp.addImage === 2 && jp.fmt === 'JPEG' && /^data:image\/jpeg;base64/.test(jp.du) && jp.textos.some(t => /foto indisponível/.test(t)), JSON.stringify({ a: jp.addImage, f: jp.fmt, du: jp.du }));
  check('…e a legenda vai sem emoji (a fonte do PDF não tem)', jp.textos.some(t => /^Visita - Bangu \(chegada\)$/.test(t)) && jp.textos.some(t => /^09:00 -> 11:30/.test(t)) && !jp.textos.some(t => /📍|📅|🕒/.test(t)), jp.textos.filter(t => /Visita/.test(t)).join(' | '));

  check('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
  await browser.close();
  console.log(`\n${ok} OK, ${falhou} falhou`);
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.log('FALHOU: ' + (e && e.stack || e)); console.log('\n0 OK, 1 falhou'); process.exit(1); });
