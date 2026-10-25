// A limpeza de cota do gn-armazenamento.js reescreve a copia local de OUTRAS lojas sem as
// fotos, pra abrir espaco quando o localStorage enche.
//
// Isso fazia sentido quando a foto ERA o campo: 33 a 117 kB cada. Depois da migracao pro
// Storage, fotoBase64 guarda uma URL de 116 caracteres — apagar nao abre espaco nenhum e
// destroi a unica pista de onde a imagem esta. O gemeo desta limpeza, dentro do autoSave
// do gn-checklist.html, ja tinha sido corrigido; este modulo tem a propria copia e ficou
// de fora ate agora.
//
// O teste exercita a ESCADA de verdade (estourando a cota), nao a funcao isolada: e a
// escada que decide qual degrau roda, e um degrau posterior apaga a copia inteira quando o
// dia ja passou — com data velha o teste nao mediria o degrau das fotos.
const CAMINHOS = require('../_env');
const { chromium } = require('playwright');
const CHK = process.env.ARQ_CHK || CAMINHOS.pub('gn-checklist.html');
// Sem servir a lib do disco, o <script> do CDN falha e todo `let` de topo fica em TDZ:
// o app nao termina de carregar e o teste mede uma pagina pela metade.
const SB_LIB = require('fs').readFileSync(CAMINHOS.fix('supabase.min.js'), 'utf8');
const U = 'https://x.supabase.co/storage/v1/object/public/gn-fotos/checklist-item/f.jpeg';
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n); c ? ok++ : falhou++;
  if (!c && extra !== undefined) console.log('      ' + String(extra).slice(0, 300)); };

(async () => {
  const b = await chromium.launch({ executablePath: CAMINHOS.CHROMIUM });
  const ctx = await b.newContext();
  await ctx.addInitScript(() => { try { localStorage.setItem('gn_chk_page_ver','9999'); } catch(e){} });
  await ctx.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ status:200, contentType:'application/javascript', body:SB_LIB }));
  await ctx.route('**/rest/v1/**', r => r.fulfill({ status:200, contentType:'application/json', body:'[]' }));
  const p = await ctx.newPage();
  const erros = []; p.on('pageerror', e => erros.push(String(e)));
  await p.goto('file://' + CHK);
  await p.waitForFunction(() => { try { return typeof gnGuardar === 'function'; } catch(e){ return false; } }, { timeout: 25000 });

  const cenario = (comBase64) => p.evaluate(({ U, comBase64 }) => {
    localStorage.clear();
    localStorage.setItem('gn_chk_page_ver','9999');
    const hoje = new Date();
    const hojeISO = hoje.getFullYear()+'-'+String(hoje.getMonth()+1).padStart(2,'0')+'-'+String(hoje.getDate()).padStart(2,'0');
    const item1 = comBase64 ? { checked:true, fotoBase64:'data:image/jpeg;base64,'+'A'.repeat(40000), fotoName:'pesada.jpg' }
                            : { checked:true, fotoBase64:U, fotoName:'outra-url.jpg' };
    const bangu = JSON.stringify({ data: hojeISO,
      abertura: { 'Cozinha': { 0: { checked:true, fotoBase64:U, fotoName:'url.jpg' }, 1: item1 } },
      manutencao: [{ id:1, fotoBase64:U }] });
    localStorage.setItem('gn_chk4_day_Bangu', bangu);                       // copia de OUTRA loja
    const caxias = JSON.stringify({ data: hojeISO, abertura: { 'Salao': { 0: { checked:true, fotoBase64:U } } } });
    localStorage.setItem('gn_chk4_day_Caxias', caxias);                     // a loja ABERTA agora
    const antes = localStorage.getItem('gn_chk4_day_Bangu').length;
    // Estoura a cota de verdade pra escada rodar.
    try { gnGuardar('gn_chk4_day_Caxias', 'x'.repeat(12*1024*1024), { lojaAtual: 'Caxias' }); } catch(e) {}
    const txt = localStorage.getItem('gn_chk4_day_Bangu');
    const d = txt ? JSON.parse(txt) : null;
    const it = d && d.abertura && d.abertura['Cozinha'] || {};
    const cx = JSON.parse(localStorage.getItem('gn_chk4_day_Caxias') || '{}');
    return { existe: !!txt, antes, depois: txt ? txt.length : 0,
             url0: (it[0]||{}).fotoBase64, nome0: (it[0]||{}).fotoName,
             campo1: (it[1]||{}).fotoBase64,
             manut: (d && d.manutencao || [{}])[0].fotoBase64,
             lojaAberta: (cx.abertura && cx.abertura['Salao'] && cx.abertura['Salao'][0] || {}).fotoBase64 };
  }, { U, comBase64 });

  // ── 1. Com base64 pesado: ele sai, a URL fica ──────────────────────────────────
  const comB64 = await cenario(true);
  check('a cópia de outra loja continua existindo (não é este degrau que apaga)', comB64.existe === true, JSON.stringify(comB64).slice(0,200));
  check('a URL da foto é PRESERVADA', comB64.url0 === U, comB64.url0);
  check('e o nome do arquivo fica junto dela', comB64.nome0 === 'url.jpg', comB64.nome0);
  check('o base64 pesado continua saindo — é ele que abre espaço', comB64.campo1 === '', String(comB64.campo1).slice(0,40));
  check('a limpeza realmente encolheu a cópia', comB64.depois < comB64.antes - 30000,
    'antes=' + comB64.antes + ' depois=' + comB64.depois);
  check('a URL na manutenção também é preservada', comB64.manut === U, comB64.manut);
  check('a cópia da loja ABERTA nunca é mexida', comB64.lojaAberta === U, comB64.lojaAberta);

  // ── 2. Só URLs: não há o que ganhar, então não reescreve ───────────────────────
  const soUrl = await cenario(false);
  check('cópia só com URLs fica intacta — reescrever não abriria espaço',
    soUrl.depois === soUrl.antes, 'antes=' + soUrl.antes + ' depois=' + soUrl.depois);
  check('e as duas URLs continuam lá', soUrl.url0 === U && soUrl.campo1 === U,
    JSON.stringify({ a: soUrl.url0, b: soUrl.campo1 }));

  check('nenhum erro de JS', erros.length === 0, erros.join(' | '));
  await b.close();
  console.log('\n' + CHK);
  console.log(ok + ' ok, ' + falhou + ' falhou');
  process.exit(falhou ? 1 : 0);
})().catch(e => { console.error('ERRO: ' + e.message); process.exit(2); });
