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

/* Qual Chromium usar.

   Três lugares, três respostas, e a escolha é automática:

   - contêiner de desenvolvimento: tem um Chromium pré-instalado em /opt/pw-browsers, e é
     ele que se usa — a versão do Playwright do projeto nem sempre casa com ela, então
     deixar o Playwright resolver sozinho aqui dá "Executable doesn't exist";
   - CI: não existe esse caminho, então devolve undefined e o executablePath nem é passado
     — o Playwright usa o que o `playwright install` acabou de baixar, que casa por
     construção;
   - qualquer outra máquina: GN_CHROMIUM manda, e `GN_CHROMIUM=` (vazio) força o padrão.

   undefined, e não string vazia: com '' o Playwright ainda entra na resolução própria.    */
const CHROMIUM_CONTEINER = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CHROMIUM = process.env.GN_CHROMIUM !== undefined
  ? (process.env.GN_CHROMIUM || undefined)
  : (fs.existsSync(CHROMIUM_CONTEINER) ? CHROMIUM_CONTEINER : undefined);

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

/* Fixa o dia que a página vê.

   O app muda de comportamento por dia da semana: o card de fechamento de semana não
   aparece na SEGUNDA, que é o dia do pedido e da contagem. Suíte que depende do card
   renderizado passa de terça a domingo e fica vermelha toda segunda — foi exatamente o que
   derrubou três delas na primeira execução do CI, à meia-noite de domingo pra segunda.

   Vermelha que não é defeito é o que faz todo mundo parar de olhar pro CI. Fixando o dia,
   a suíte passa a medir o comportamento que ela quer medir, em vez de medir que dia é hoje.

   setFixedTime, e não install(): as datas passam a responder o instante escolhido, mas os
   temporizadores continuam correndo — senão as próprias esperas das suítes travavam.      */
async function fixarRelogio(ctx, iso) {
  await ctx.clock.setFixedTime(new Date(iso));
}

/* Reload que não perde o que o app já tinha guardado.

   Sob file:// o Chromium nem sempre devolve a mesma partição de armazenamento depois de um
   reload: as últimas escritas de localStorage somem. Não é alguém apagando — grampeei
   Storage.prototype.removeItem/clear e deu ZERO remoção em 18 recarregamentos. Medido neste
   contêiner, com o mesmo roteiro: por file:// perdeu em 1 de 6 e em 3 de 10; servido por
   http://localhost, 12 de 12 limpos. Então é o navegador, e só no file:// — quem usa pelo
   Vercel (https) não passa por isso.

   e2e_tema_escuro já tinha batido nisso e resolveu pra UMA chave conhecida (gn_tema, reposta
   por addInitScript). Aqui vale pra qualquer coisa que o APP tenha gravado, que é o caso de
   quem recarrega pra ver se a tela volta do armazenamento: o dado é escrito pelo app, a
   suíte não sabe a chave nem o conteúdo de antemão.

   Não afrouxa a verificação. O que se cobra do app é LER o que está guardado e remontar a
   tela, e isso continua sendo exercido igual; se o app parar de gravar, o retrato sai vazio
   e a verificação falha do mesmo jeito. Já a GRAVAÇÃO quem confere é a suíte, olhando o
   localStorage antes de recarregar — isso não se terceiriza pro navegador.

   Cada chamada acrescenta um script de inicialização ao page, e eles rodam na ordem em que
   foram adicionados, então o retrato mais novo vence. Chamar duas vezes é seguro; só não
   sirva pra testar REMOÇÃO de chave, porque um retrato antigo a traria de volta.          */
async function recarregarPreservando(page) {
  const guardado = await page.evaluate(() => {
    const o = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k != null) o[k] = localStorage.getItem(k);
      }
    } catch (e) {}
    return o;
  });
  await page.addInitScript(dados => {
    try { Object.keys(dados).forEach(k => localStorage.setItem(k, dados[k])); } catch (e) {}
  }, guardado);
  await page.reload();
}

module.exports = {
  RAIZ, PUBLICO, FIXTURES, CHROMIUM, TMP, BASE_CHK, BASE_HOME, esperarApp, fixarRelogio,
  recarregarPreservando,
  pub: n => path.join(PUBLICO, n),
  fix: n => path.join(FIXTURES, n),
};
