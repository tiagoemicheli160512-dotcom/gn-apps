// Tira do banco as fotos guardadas como base64 dentro do jsonb e põe no Storage, que é
// onde os apps já guardam foto nova (gnUploadFotoStorage → bucket gn-fotos).
//
// Por que: o item de manutenção pendente é copiado de um dia pro outro com a imagem
// inteira junto. Medido: 54 fotos distintas (1,8 MB) aparecem 1190 vezes = 37 MB. Uma
// delas está em 81 linhas. Toda tela que lê manutenção dos últimos 30 dias (painel de
// gestão, app do Henrique) baixa 8,4 MB — e precisa de 341 kB.
//
// Como: cada foto distinta sobe UMA vez (dedupe por md5) e todas as cópias passam a
// guardar a mesma URL pública. É o mesmo comportamento que as fotos novas já têm hoje —
// a URL é que é copiada no carregamento pro dia seguinte.
//
// Seguro por construção:
//   - sobe e CONFERE (baixa de volta e compara o tamanho) antes de trocar qualquer linha;
//   - lê a linha de novo imediatamente antes de gravar, e grava só a coluna mexida, pra
//     janela de concorrência com a loja salvando ser de milissegundos;
//   - é idempotente: rodar de novo não sobe nada nem grava nada se já estiver migrado.
//
// Uso:  node migra_fotos_legadas.js            (modo seco — não escreve nada)
//       node migra_fotos_legadas.js --valendo  (sobe e grava)
const fs = require('fs');

const VALENDO = process.argv.includes('--valendo');
const SB_URL = 'https://ncxttwvpafajnilpjbol.supabase.co';
const SB_KEY = (fs.readFileSync(require('path').join(__dirname, '..', 'public', 'gn-home.html'), 'utf8')
  .match(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9[^"']*/) || [])[0];
if (!SB_KEY) throw new Error('não achei a chave anon');

const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
const crypto = require('crypto');
const md5 = s => crypto.createHash('md5').update(s).digest('hex');

// Onde mora cada foto legada: coluna do checklist_diario e o campo dentro de cada item.
const ALVOS = [
  { coluna: 'manutencao', campo: 'fotoBase64', pasta: 'manut-legado' },
  { coluna: 'despesas',   campo: 'foto',       pasta: 'caixa-despesa-legado' },
];

const subidas = new Map(); // md5 -> url (dedupe entre linhas E entre execuções)

async function subirFoto(dataUri, pasta) {
  const hash = md5(dataUri);
  if (subidas.has(hash)) return subidas.get(hash);
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUri);
  if (!m) return null;
  const mime = m[1];
  const bytes = Buffer.from(m[2], 'base64');
  const ext = (mime.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg';
  const nome = `${pasta}/${hash}.${ext}`;            // nome determinístico: re-rodar não duplica
  const url = `${SB_URL}/storage/v1/object/public/gn-fotos/${nome}`;

  if (!VALENDO) { subidas.set(hash, url); return url; }

  const r = await fetch(`${SB_URL}/storage/v1/object/gn-fotos/${nome}`, {
    method: 'POST', headers: { ...H, 'Content-Type': mime, 'x-upsert': 'true' }, body: bytes,
  });
  if (!r.ok && r.status !== 409) throw new Error(`upload falhou (${r.status}) ${nome}: ${await r.text()}`);

  // Confere que a foto está mesmo lá e inteira ANTES de qualquer linha apontar pra ela.
  const v = await fetch(url);
  if (!v.ok) throw new Error(`foto não ficou acessível: ${url} (${v.status})`);
  const baixado = Buffer.from(await v.arrayBuffer());
  if (baixado.length !== bytes.length) {
    throw new Error(`foto subiu diferente: ${nome} — ${bytes.length}B virou ${baixado.length}B`);
  }
  subidas.set(hash, url);
  return url;
}

function trocarFotos(arr, campo, mapa) {
  // Devolve [novoArray, quantasTrocou] sem mexer no original.
  let n = 0;
  const novo = (arr || []).map(item => {
    if (!item || typeof item !== 'object') return item;
    const v = item[campo];
    if (typeof v !== 'string' || !v.startsWith('data:')) return item;
    const url = mapa.get(md5(v));
    if (!url) return item;
    n++;
    return { ...item, [campo]: url };
  });
  return [novo, n];
}

(async () => {
  console.log(VALENDO ? '=== VALENDO: vai subir e gravar ===' : '=== modo seco: não escreve nada ===');

  const colunas = ALVOS.map(a => a.coluna).join(',');
  const linhas = [];
  const PAG = 25;
  for (let off = 0; ; off += PAG) {
    const r = await fetch(`${SB_URL}/rest/v1/checklist_diario?select=id,data_operacao,loja,${colunas}&order=id&offset=${off}&limit=${PAG}`, { headers: H });
    if (!r.ok) throw new Error(`leitura falhou: ${r.status} ${await r.text()}`);
    const lote = await r.json();
    linhas.push(...lote);
    process.stdout.write(`\r   lidas ${linhas.length} linhas…`);
    if (lote.length < PAG) break;
  }
  console.log('');

  // 1) Inventário: quais fotos distintas existem e quanto pesam.
  const porAlvo = {};
  for (const alvo of ALVOS) {
    const distintas = new Map(); // md5 -> {dataUri, copias, bytes}
    let copias = 0;
    for (const l of linhas) {
      for (const item of (Array.isArray(l[alvo.coluna]) ? l[alvo.coluna] : [])) {
        const v = item && item[alvo.campo];
        if (typeof v !== 'string' || !v.startsWith('data:')) continue;
        copias++;
        const h = md5(v);
        const reg = distintas.get(h) || { dataUri: v, copias: 0, bytes: Buffer.byteLength(v) };
        reg.copias++; distintas.set(h, reg);
      }
    }
    const pesoCopias = [...distintas.values()].reduce((s, r) => s + r.bytes * r.copias, 0);
    const pesoUnico = [...distintas.values()].reduce((s, r) => s + r.bytes, 0);
    porAlvo[alvo.coluna] = { distintas, copias, pesoCopias, pesoUnico };
    const mb = n => (n / 1048576).toFixed(1) + ' MB';
    console.log(`\n${alvo.coluna}.${alvo.campo}: ${distintas.size} fotos distintas em ${copias} cópias — ${mb(pesoCopias)} no banco, ${mb(pesoUnico)} de imagem de verdade`);
  }

  // 2) Sobe cada foto distinta uma vez.
  for (const alvo of ALVOS) {
    const { distintas } = porAlvo[alvo.coluna];
    let i = 0;
    for (const [, reg] of distintas) {
      await subirFoto(reg.dataUri, alvo.pasta);
      process.stdout.write(`\r   ${alvo.coluna}: ${++i}/${distintas.size} fotos no Storage`);
    }
    if (distintas.size) console.log('');
  }

  // 3) Troca as referências, linha por linha, relendo na hora de gravar.
  let linhasMexidas = 0, trocasTotais = 0;
  for (const l of linhas) {
    const patch = {};
    let trocasLinha = 0;
    for (const alvo of ALVOS) {
      if (!Array.isArray(l[alvo.coluna])) continue;
      const [, prev] = trocarFotos(l[alvo.coluna], alvo.campo, subidas);
      if (prev > 0) patch[alvo.coluna] = true; // marca pra reler e tratar
      trocasLinha += prev;
    }
    if (!trocasLinha) continue;
    linhasMexidas++; trocasTotais += trocasLinha;
    if (!VALENDO) continue;

    // Relê AGORA (a loja pode ter salvo desde a leitura em lote) e grava só o que mudou.
    const rr = await fetch(`${SB_URL}/rest/v1/checklist_diario?id=eq.${l.id}&select=${Object.keys(patch).join(',')}`, { headers: H });
    const atual = (await rr.json())[0] || {};
    const corpo = {};
    for (const alvo of ALVOS) {
      if (!(alvo.coluna in patch) || !Array.isArray(atual[alvo.coluna])) continue;
      const [novo, n] = trocarFotos(atual[alvo.coluna], alvo.campo, subidas);
      if (n > 0) corpo[alvo.coluna] = novo;
    }
    if (!Object.keys(corpo).length) continue;
    const w = await fetch(`${SB_URL}/rest/v1/checklist_diario?id=eq.${l.id}`, {
      method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(corpo),
    });
    if (!w.ok) throw new Error(`gravação falhou na linha ${l.id} (${l.data_operacao} ${l.loja}): ${w.status} ${await w.text()}`);
    process.stdout.write(`\r   gravadas ${linhasMexidas} linhas…`);
  }
  console.log(`\n\n${linhasMexidas} linhas com ${trocasTotais} cópias de foto ${VALENDO ? 'migradas' : 'a migrar'}.`);
  if (!VALENDO) console.log('Nada foi escrito. Rode com --valendo pra valer.');
})();
