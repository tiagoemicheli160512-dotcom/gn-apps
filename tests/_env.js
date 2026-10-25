/* Caminhos das suítes, resolvidos a partir do próprio arquivo.
   As suítes nasceram num diretório de rascunho com tudo cravado em caminho absoluto
   (/home/user/gn-apps/..., /tmp/.../scratchpad/...). Isso prendia tudo a uma máquina e
   era o motivo de elas nunca terem entrado no repositório. Aqui a raiz vem de __dirname,
   então funcionam de qualquer clone. */
const path = require('path');
const fs   = require('fs');
const os   = require('os');

const RAIZ     = path.resolve(__dirname, '..');
const PUBLICO  = path.join(RAIZ, 'public');
const FIXTURES = path.join(__dirname, 'fixtures');

// O Chromium do contêiner vem pré-instalado neste caminho; em outra máquina, aponte com
// GN_CHROMIUM. Vazio faz o Playwright usar o navegador que ele mesmo baixou.
const CHROMIUM = process.env.GN_CHROMIUM !== undefined
  ? process.env.GN_CHROMIUM
  : '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// Saída descartável (prints, PDFs gerados no meio do teste).
const TMP = process.env.GN_TMP || path.join(os.tmpdir(), 'gn-testes');
try { fs.mkdirSync(TMP, { recursive: true }); } catch (_) {}

// O arquivo de comparação: várias suítes medem REGRESSÃO contra a versão que está no
// origin/main, e sem ele não dá pra dizer que nada piorou. Fica em public/ porque os
// <script src> dele são relativos — em outra pasta ele carrega pela metade.
const BASE_CHK  = path.join(PUBLICO, '_base_chk.html');
const BASE_HOME = path.join(PUBLICO, '_base_home.html');

/* Espera o app terminar de carregar — de verdade.

   Declaração de função é ICADA: `typeof minhaFuncao === 'function'` fica verdadeiro no
   instante em que o <script> começa, muito antes dos `let` de topo serem avaliados. Quem
   espera só por função e em seguida LÊ uma variável cai em
   "Cannot access 'X' before initialization" — e só sob carga, porque é corrida. Já
   aconteceu em três suítes desta base, cada uma com um nome diferente no erro.

   Então se espera pela leitura das VARIÁVEIS que a suíte vai usar: ler é o que prova que
   a declaração foi alcançada. Passe os nomes que você toca logo depois.

     await CAMINHOS.esperarApp(page, ['LOJA', '_bhRegistros'], ['_bhTodosFuncionarios']);   */
async function esperarApp(page, variaveis, funcoes, tempoMs) {
  await page.waitForFunction(({ vars, fns }) => {
    try {
      for (const f of fns || []) if (typeof window[f] !== 'function') return false;
      // eval, e não window[v]: `let` de topo não vira propriedade de window, então
      // window['_bhRegistros'] seria undefined mesmo depois de inicializado — e a espera
      // passaria sem provar nada. Dentro do try, o TDZ vira false e a espera continua.
      for (const v of vars || []) eval(v);
      return true;
    } catch (e) { return false; }
  }, { vars: variaveis || [], fns: funcoes || [] }, { timeout: tempoMs || 25000 });
}

module.exports = {
  RAIZ, PUBLICO, FIXTURES, CHROMIUM, TMP, BASE_CHK, BASE_HOME, esperarApp,
  pub: n => path.join(PUBLICO, n),
  fix: n => path.join(FIXTURES, n),
};
