#!/usr/bin/env node
/* Corredor das suítes e2e.

   Uso:
     node tests/run.js                 roda todas
     node tests/run.js foto validade   roda as que casam com algum dos termos
     node tests/run.js --lista         só lista, não roda
     node tests/run.js --paralelo 2    quantas de cada vez (padrão 1)

   Cada suíte é um processo próprio que sobe o seu Chromium e termina com código 0 quando
   passa. O corredor não interpreta o conteúdo: lê a última linha "N ok, M falhou" e o
   código de saída. Suíte que não imprime o resumo conta como falha — morrer calada foi,
   nesta base, a forma mais comum de um vermelho passar por verde. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const CAMINHOS = require('./_env');

const args = process.argv.slice(2);
const soLista = args.includes('--lista');
const iPar = args.indexOf('--paralelo');
const paralelo = iPar >= 0 ? Math.max(1, parseInt(args[iPar + 1] || '1', 10)) : 1;
const termos = args.filter((a, i) => !a.startsWith('--') && !(iPar >= 0 && i === iPar + 1));

const dir = path.join(__dirname, 'e2e');
let suites = fs.readdirSync(dir).filter(f => f.startsWith('e2e_') && f.endsWith('.js')).sort();
if (termos.length) suites = suites.filter(f => termos.some(t => f.includes(t)));

if (!suites.length) { console.error('nenhuma suíte casa com: ' + termos.join(' ')); process.exit(2); }
if (soLista) { suites.forEach(s => console.log(s)); process.exit(0); }

// Várias suítes medem regressão contra a versão do origin/main. Sem o arquivo elas falham
// — e avisam como criá-lo. O corredor diz de uma vez, no começo, em vez de deixar
// descobrir uma por uma.
for (const [rotulo, arq] of [['_base_chk.html', CAMINHOS.BASE_CHK], ['_base_home.html', CAMINHOS.BASE_HOME]]) {
  if (!fs.existsSync(arq)) {
    console.log('· aviso: ' + rotulo + ' não existe — as suítes que comparam com o origin/main vão falhar.');
    console.log('  crie com: git -C ' + CAMINHOS.RAIZ + ' show origin/main:public/' + rotulo.replace('_base_', 'gn-').replace('chk', 'checklist') + ' > ' + arq);
  }
}

const inicio = Date.now();
const resultados = [];
let proxima = 0;

function rodar(nome) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const p = spawn(process.execPath, [path.join(dir, nome)], { env: process.env });
    let saida = '';
    p.stdout.on('data', d => saida += d);
    p.stderr.on('data', d => saida += d);
    p.on('close', code => {
      const m = saida.match(/^(\d+) (?:OK|ok), (\d+) falhou/m);
      const r = { nome, code, ok: m ? +m[1] : 0, falhou: m ? +m[2] : 0,
                  semResumo: !m, seg: Math.round((Date.now() - t0) / 1000), saida };
      resultados.push(r);
      const marca = r.semResumo ? '  SEM RESUMO' : (r.falhou ? `  ${r.falhou} FALHOU` : `  ${r.ok} ok`);
      console.log((r.semResumo || r.falhou ? '✗ ' : '✓ ') + nome.padEnd(36) + marca.padStart(13) + ('  ' + r.seg + 's').padStart(7));
      resolve();
    });
  });
}

(async () => {
  const trabalhadores = Array.from({ length: paralelo }, async () => {
    while (proxima < suites.length) await rodar(suites[proxima++]);
  });
  await Promise.all(trabalhadores);

  const ruins = resultados.filter(r => r.falhou || r.semResumo);
  const totalOk = resultados.reduce((s, r) => s + r.ok, 0);
  const totalRuim = resultados.reduce((s, r) => s + r.falhou, 0);
  console.log('\n' + '─'.repeat(64));
  console.log(`${resultados.length} suíte(s) · ${totalOk} verificações ok · ${totalRuim} falharam · ` +
              `${Math.round((Date.now() - inicio) / 1000)}s`);
  if (ruins.length) {
    console.log('\ncom problema:');
    ruins.forEach(r => {
      console.log('  ' + r.nome + (r.semResumo ? '  (não imprimiu o resumo)' : '  (' + r.falhou + ' falhou)'));
      r.saida.split('\n').filter(l => /^FALHOU/.test(l)).slice(0, 4).forEach(l => console.log('      ' + l));
      if (r.semResumo) r.saida.split('\n').filter(Boolean).slice(-3).forEach(l => console.log('      ' + l.slice(0, 160)));
    });
  }
  process.exit(ruins.length ? 1 : 0);
})();
