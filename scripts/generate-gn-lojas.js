#!/usr/bin/env node
// Gera public/gn-lojas.html a partir de public/gn-estoque.html.
// gn-estoque.html é a fonte única (master); gn-lojas.html é a versão restrita
// para loja individual (sem Fichas Técnicas / Usuários). Rodar após qualquer
// edição em gn-estoque.html para manter os dois arquivos sincronizados.
const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'public', 'gn-estoque.html');
const destPath = path.join(__dirname, '..', 'public', 'gn-lojas.html');

let html = fs.readFileSync(srcPath, 'utf8');

html = html.replace('<title>GN Estoque</title>', '<title>GN Lojas</title>');

html = html.replace(
  '</style>\n</head>',
  '</style>\n<style>\n#nav-fichas{display:none!important}\n#nav-usuarios{display:none!important}\n</style>\n</head>'
);

html = html.replace(
  /if \(!u\.permissoes \|\| !u\.permissoes\.estoque\) \{\s*\n\s*erroEl\.textContent = '🚫 Seu usuário não tem acesso ao GN Estoque\.';/,
  "if (!u.permissoes || !u.permissoes.lojas) {\n      erroEl.textContent = '🚫 Seu usuário não tem acesso ao GN Lojas.';"
);

fs.writeFileSync(destPath, html);
console.log('gn-lojas.html gerado a partir de gn-estoque.html');
