#!/usr/bin/env node
/* Corredor das suítes e2e.

   Uso:
     node tests/run.js                 roda todas
     node tests/run.js foto validade   roda as que casam com algum dos termos
     node tests/run.js --lista         só lista, não roda
     node tests/run.js --paralelo 2    quantas de cada vez (padrão 1)
     node tests/run.js --reguas        gera os arquivos de comparação do origin/main

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

// Várias suítes medem REGRESSÃO contra a versão que está no origin/main, e sem o arquivo de
// comparação não têm contra o que medir. Cada uma recebe o seu em public/_base_<X>.html;
// `--reguas` gera todos de uma vez, que é o que faltava pra isso rodar num clone novo.
const REGUAS = [
  ['_base_chk.html',          'gn-checklist.html'],
  ['_base_home.html',         'gn-home.html'],
  ['_base_lojas.html',        'gn-lojas.html'],
  ['_base_gn-comissoes.html', 'gn-comissoes.html'],
];
if (args.includes('--reguas')) {
  const { execFileSync } = require('child_process');
  let ruim = 0;
  for (const [alvo, fonte] of REGUAS) {
    try {
      // maxBuffer explícito: gn-checklist.html passa de 1 MB e estourava o padrão de 1 MB
      // do execFileSync com ENOBUFS — um erro que não diz nada sobre o que aconteceu.
      fs.writeFileSync(CAMINHOS.pub(alvo),
        execFileSync('git', ['-C', CAMINHOS.RAIZ, 'show', 'origin/main:public/' + fonte],
                     { maxBuffer: 256 * 1024 * 1024 }));
      console.log('✓ ' + alvo.padEnd(24) + ' de origin/main:public/' + fonte);
    } catch (e) { ruim++; console.log('✗ ' + alvo.padEnd(24) + String(e.message).split('\n')[0]); }
  }
  process.exit(ruim ? 1 : 0);
}

const dir = path.join(__dirname, 'e2e');
let suites = fs.readdirSync(dir).filter(f => f.startsWith('e2e_') && f.endsWith('.js')).sort();
if (termos.length) suites = suites.filter(f => termos.some(t => f.includes(t)));

// Modelo parametrizado (@modelo) não é suíte solta: roda uma vez por app, com APP=.
// Contá-lo como vermelho por falta de parâmetro seria ruído que ninguém vai ler.
const modelos = suites.filter(f => /@modelo/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
suites = suites.filter(f => !modelos.includes(f));

if (!suites.length) { console.error('nenhuma suíte casa com: ' + termos.join(' ')); process.exit(2); }
if (soLista) { suites.forEach(s => console.log(s)); process.exit(0); }
modelos.forEach(m => console.log('· pulada: ' + m + ' — modelo parametrizado, roda com APP=<app>'));

// Cada suíte sobe um Chromium inteiro. Acima de ~metade dos núcleos, elas passam a
// disputar CPU e aparecem vermelhas que NÃO são defeito: a cada corrida é outra suíte, e
// todas passam quando rodam sozinhas. Medido nesta máquina de 4 núcleos, em quatro
// corridas com --paralelo 2: 0, 3, 2 e 1 vermelhas, sempre em suítes diferentes.
// O aviso existe pra ninguém perder a tarde atrás de um vermelho que é da máquina.
const nucleos = require('os').cpus().length;
if (paralelo > Math.max(1, Math.floor(nucleos / 2))) {
  console.log('· atenção: --paralelo ' + paralelo + ' em ' + nucleos + ' núcleo(s).');
  console.log('  Cada suíte sobe um Chromium; acima da metade dos núcleos aparecem vermelhas');
  console.log('  por disputa de CPU, não por defeito. Confirme qualquer vermelha rodando a');
  console.log('  suíte sozinha antes de investigar.\n');
}
const semRegua = REGUAS.filter(([alvo]) => !fs.existsSync(CAMINHOS.pub(alvo)));
if (semRegua.length) {
  console.log('· faltam ' + semRegua.length + ' arquivo(s) de comparação: ' + semRegua.map(r => r[0]).join(', '));
  console.log('  as suítes que medem regressão vão falhar. Gere todos com:  node tests/run.js --reguas\n');
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

  // No CI, o log do job fica num armazenamento que nem toda ferramenta alcança — e CI que
  // falha sem dizer POR QUE é quase inútil: foi exatamente o que aconteceu na primeira
  // execução deste workflow, que só deu "Process completed with exit code 1". O resumo do
  // job aparece na própria interface do PR e na API, então é por aqui que a falha se conta.
  if (process.env.GITHUB_STEP_SUMMARY) {
    const l = [];
    l.push('## Suítes e2e', '');
    l.push(`**${resultados.length}** suíte(s) · **${totalOk}** verificações ok · ` +
           `**${totalRuim}** falharam · ${Math.round((Date.now() - inicio) / 1000)}s`, '');
    if (!ruins.length) {
      l.push('Tudo verde.');
    } else {
      l.push(`### ${ruins.length} com problema`, '');
      ruins.forEach(r => {
        l.push(`<details><summary><code>${r.nome}</code> — ` +
               (r.semResumo ? 'não imprimiu o resumo' : `${r.falhou} falhou`) +
               ` (${r.seg}s)</summary>`, '');
        l.push('```');
        // As linhas FALHOU dizem o que quebrou; as últimas dizem como morreu quando nem
        // chegou a imprimir resumo. Cortado pra o resumo do job não estourar o limite.
        const falhas = r.saida.split('\n').filter(x => /^FALHOU/.test(x)).slice(0, 8);
        falhas.forEach(x => l.push(x.slice(0, 200)));
        if (r.semResumo) {
          if (falhas.length) l.push('…');
          r.saida.split('\n').filter(Boolean).slice(-12).forEach(x => l.push(x.slice(0, 200)));
        }
        l.push('```', '</details>', '');
      });
    }
    try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, l.join('\n') + '\n'); }
    catch (e) { console.log('(não consegui escrever o resumo do job: ' + e.message + ')'); }
  }

  // O resumo acima só existe na INTERFACE: a API do GitHub não o devolve, então quem está
  // investigando por fora continua vendo só "exit code 1". Anotação a API devolve — e ela
  // também aparece em cima do job, que é onde se olha primeiro.
  if (process.env.GITHUB_ACTIONS && ruins.length) {
    // Anotação não aceita quebra de linha crua; o GitHub exige estes escapes.
    const esc = s => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    ruins.forEach(r => {
      const linhas = r.saida.split('\n');
      // Quem morre calada precisa dizer ATE ONDE chegou, nao so como morreu: a ultima
      // verificacao que passou e a que falhou localizam o ponto da morte no roteiro. Sem
      // isso a anotacao dava um locator sem contexto e a investigacao comecava do zero —
      // custou uma rodada inteira atras de uma suite que falhava depois do reload.
      const motivo = r.semResumo
        ? [].concat(
            linhas.filter(x => /^(OK|FALHOU):/.test(x)).slice(-3),
            linhas.filter(Boolean).slice(-6))
        : linhas.filter(x => /^FALHOU/.test(x)).slice(0, 6);
      console.log('::error title=' + esc(r.nome) + '::' +
                  esc((r.semResumo ? 'não imprimiu o resumo\n' : r.falhou + ' falhou\n') +
                      motivo.map(x => x.slice(0, 200)).join('\n')));
    });
  }

  process.exit(ruins.length ? 1 : 0);
})();
