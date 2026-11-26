// Etapa 6 (26/11/2026) — auditoria: nenhuma função declarada duas vezes no mesmo app.
// Dois `function x()` no mesmo escopo não dão erro: a de baixo SOBRESCREVE a de cima calada.
// A auditoria achou três casos, dois deles bugs de verdade:
//   • Check-list: updComissoesTurno(i,v) e updComissoesTurno(i,d,sel) — o select "Turno" do
//     cadastro chamava a de 2 argumentos, rodava a de 3 e quebrava em sel.value (nada gravava).
//   • App Lojas: delEntrada duas vezes — a que valia não marcava a entrada como apagada, e a
//     sincronização a trazia de volta da nuvem com o estoque já revertido.
//   • App Lojas: gerarRelatorioConsolidadoWpp duas vezes (cópia morta, sem efeito).
// Sem navegador: lê os <script> embutidos de cada .html e cada .js de public/.
const fs = require('fs');
const path = require('path');
const CAMINHOS = require('../_env');
const PUB = path.dirname(CAMINHOS.pub('gn-home.html'));
let ok = 0, falhou = 0;
const check = (n, c, extra) => { console.log((c ? 'OK: ' : 'FALHOU: ') + n + (c || extra === undefined ? '' : ' → ' + JSON.stringify(extra))); c ? ok++ : falhou++; };

const arquivos = fs.readdirSync(PUB).filter(f => /\.(html|js)$/.test(f) && !/^_base_/.test(f)).sort();
const achados = {};
arquivos.forEach(f => {
  const s = fs.readFileSync(path.join(PUB, f), 'utf8');
  const codigo = f.endsWith('.html')
    ? [...s.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n')
    : s;
  const nomes = [...codigo.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map(m => m[1]);
  const cont = {};
  nomes.forEach(n => { cont[n] = (cont[n] || 0) + 1; });
  const dup = Object.keys(cont).filter(n => cont[n] > 1);
  if (dup.length) achados[f] = dup;
});
check(`nenhuma função de nível de topo declarada duas vezes (${arquivos.length} arquivos)`, Object.keys(achados).length === 0, achados);
check('…e a varredura de fato leu os apps grandes (não passou por estar vazia)', arquivos.includes('gn-home.html') && arquivos.includes('gn-lojas.html') && arquivos.includes('gn-checklist.html'));
console.log(`\n${ok} OK, ${falhou} falhou`);
process.exit(falhou ? 1 : 0);
