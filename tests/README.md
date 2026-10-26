# Suítes de teste

132 suítes de ponta a ponta que sobem o app num Chromium de verdade, mexem nele e
**medem** o resultado. Até agora elas viviam num diretório de rascunho fora do
repositório — sumiam quando a máquina era reciclada e não dava pra rodar antes de abrir
um PR. Este diretório existe pra isso deixar de ser verdade.

## Rodar

```bash
node tests/run.js                  # todas, uma de cada vez
node tests/run.js foto validade    # só as que casam com algum termo
node tests/run.js --paralelo 2     # 2 de cada vez
node tests/run.js --reguas         # gera os arquivos de comparação do origin/main
node tests/run.js --lista          # só lista
```

### `--paralelo` e vermelha que não é defeito

Cada suíte sobe um **Chromium inteiro**. Acima de ~metade dos núcleos da máquina elas
disputam CPU e aparecem vermelhas que não são defeito nenhum: a cada corrida é **outra**
suíte, e todas passam quando rodam sozinhas.

Medido numa máquina de 4 núcleos, quatro corridas com `--paralelo 2`: 0, 3, 2 e 1
vermelhas — sempre em suítes diferentes. As mesmas suítes, sozinhas, passam 100%.

**Antes de investigar qualquer vermelha, rode aquela suíte sozinha.** Se ela passar, era a
máquina. O corredor avisa quando o `--paralelo` está alto pro número de núcleos.

Uma suíte isolada roda sozinha, e é assim que se investiga uma falha — ela imprime o
nome de cada verificação:

```bash
node tests/e2e/e2e_foto_blindada.js
```

## O arquivo de comparação

Boa parte das suítes não pergunta "está bom?", e sim **"piorou?"**. Para isso elas
comparam o arquivo de trabalho com a versão que está no `origin/main`:

```bash
git show origin/main:public/gn-checklist.html > public/_base_chk.html
git show origin/main:public/gn-home.html     > public/_base_home.html
```

Ele precisa ficar em `public/`, ao lado dos `<script src>` relativos — em outra pasta
carrega pela metade e o teste morre num timeout que não diz nada. Os dois arquivos são
descartáveis e estão no `.gitignore`.

## Ambiente

| variável | para quê |
| --- | --- |
| `GN_CHROMIUM` | caminho do Chromium. O padrão é o do contêiner. Vazio (`GN_CHROMIUM=`) faz o Playwright usar o navegador que ele mesmo baixou. |
| `GN_TMP` | onde vão prints e PDFs gerados no meio do teste. Padrão: `$TMPDIR/gn-testes`. |
| `ARQ_CHK`, `ARQ_HOME`, … | aponta uma suíte para outro arquivo — é assim que se roda contra o que a Vercel está servindo em produção. |

## Como estas suítes são escritas

Três regras que vieram de erro cometido, não de preferência:

**Medir, não inspecionar string.** Contraste se lê do pixel composto, não da cor
declarada — uma cor `rgba(…,.12)` lida como opaca já deu "aprovado" para texto ilegível.
Largura se mede com o retângulo do elemento num viewport do tamanho do celular.

**Contraprova.** Toda suíte nova roda também contra o `origin/main` e tem que falhar lá.
Teste que passa nas duas versões não está medindo a mudança. Várias delas carregam a
contraprova no próprio cabeçalho, em comentário.

**Falhar alto.** Suíte que não imprime `N ok, M falhou` conta como falha no corredor.
Morrer calada — por fixture faltando, por timeout — foi a forma mais comum de um vermelho
passar por verde aqui.

## Esperar o app carregar: use `esperarApp`

Declaração de função é **içada**. `typeof minhaFuncao === 'function'` fica verdadeiro no
instante em que o `<script>` começa — muito antes dos `let` de topo serem avaliados. Quem
espera só por função e em seguida **lê** uma variável cai em `Cannot access 'X' before
initialization`, e só **sob carga**, porque é corrida. Isso já mordeu quatro suítes desta
base, cada uma com um nome diferente no erro, e cada vez custou uma investigação inteira.

Espere pela leitura das variáveis que você vai usar:

```js
await CAMINHOS.esperarApp(page, ['LOJA', '_bhRegistros'], ['_bhTodosFuncionarios']);
```

Primeiro as variáveis, depois as funções. Ler é o que prova que a declaração foi
alcançada.

## As fixtures têm nomes fictícios

`tests/fixtures/*.json` saiu do banco de produção, mas os nomes de funcionário foram
trocados por fictícios antes de entrar no repositório. A troca preserva o que os testes
medem: ordem alfabética relativa, acento, caixa e sufixo de função (`- gerente`). Três
nomes foram mantidos de propósito — `FRANCINALDO`, `LEONARDO DE CARVALHO` e `Taynara` —
porque já aparecem no código documentando incidentes reais.

Nos literais que as próprias suítes escrevem (sem ler fixture), só o **sobrenome** foi
trocado. Trocar o nome inteiro ali quebrava a suíte de ordenação, que mistura nomes reais
com nomes que ela mesma inventa — mudar só uns reordenava a lista e o teste passava a medir
outra coisa. Mantendo o primeiro token, a ordem fica idêntica por construção. Nomes de um
token só (`ANTÔNIO`, `JULIANA`) ficaram como estão: um primeiro nome solto não identifica
ninguém, e duas suítes usam o `ANTÔNIO` acentuado justamente como sonda de ordenação.

Se você regenerar uma fixture a partir do banco, **anonimize antes de commitar**.

## O que elas ainda não cobrem

- `gn-pedidos.html`, `gn-estoque` e o app Mestra têm cobertura rasa perto do Check-list
  e do Painel.
- Não há execução automática em CI: hoje se roda à mão antes do PR.
