# Escandir

Editor de texto para poesia métrica em português brasileiro. O poeta define a
forma antes de escrever e recebe retorno visual enquanto compõe: sílabas
poéticas, tônicas, elisões, sílaba faltando ou sobrando.

**O poeta decide. A IA propõe. O sistema mede.**

Ver [CLAUDE.md](CLAUDE.md) para as decisões de design e as armadilhas do
domínio.

## Estrutura

```
packages/engine   Motor de escansão. TypeScript puro, sem DOM, sem I/O.
packages/lexicon  Índice de rimas: gerador e leitor sob demanda.
apps/editor       Editor em Svelte 5 + Vite.
design/           Canvas do Claude Design: paleta, tipografia, comportamento.
```

## Comandos

Na raiz, valendo para todos os pacotes:

```bash
npm install
```

```bash
npm test
```

```bash
npm run typecheck
```

O léxico de rimas não é versionado — 7 MB gerados a partir de duas listas
públicas (ver [NOTICE.md](NOTICE.md)). Gere uma vez:

```bash
npm run build:data -w @escandir/lexicon -- palavras.txt frequencias.txt apps/editor/public/lexico
```

O editor, em `http://localhost:5173`:

```bash
npm run dev -w @escandir/editor
```

## Onde o motor está

| Camada | O que faz | Estado |
| --- | --- | --- |
| 1. Léxico | 315 mil palavras indexadas por som de rima | **Pronta** |
| 2. Palavra → sílabas + tônica | Regras, léxico só para exceções | **Pronta** |
| 3. Verso → grafo de junções | Elisões e hiatos com custo, busca com alvo | **Pronta** |
| 4. Ajuste ao esquema | Leituras válidas + diagnóstico estruturado | **Pronta** |
| 5. Sugestão local | Índice serve a IA; falta a tela para o autor | Parcial |
| 6. Proposta por IA | BYOK, com o motor e o dicionário como ferramentas | **Pronta** |

### Camada 2

```ts
import { analyzeWord } from '@escandir/engine';

analyzeWord('história');
// syllables: his | tó | ria     stressIndex: 1
```

Cada sílaba carrega `onset`, `nucleus`, `coda`, `start`, `end` e `isStressed`.
Os índices apontam para a palavra normalizada, para que a UI alinhe a régua sem
remedir o texto.

Para uso repetido, `createAnalyzer(ptBR)` devolve a mesma função memoizada — o
motor não tem cache global.

A saída é a leitura **canônica**, a de prosa. Ditongo desfeito e hiato desfeito
são desvios com custo, e pertencem à camada 3.

### Camadas 3 e 4

```ts
import { assess, createAnalyzer, FORMAS, ptBR, scanVerse } from '@escandir/engine';

const analyzer = createAnalyzer(ptBR);
const scansion = scanVerse('A tarde desce lenta sobre o mar', ptBR, analyzer, {
  spec: FORMAS.heroico,
});

scansion.best.count; // 10 — para na última tônica
assess(scansion.best, FORMAS.heroico).status; // 'ok'
```

`scanVerse` **não devolve um número**. Devolve `readings`, leituras ranqueadas
sobre o grafo de junções, com as que cabem na forma primeiro. `best` é só a
primeira delas; quem escolhe entre as outras é o poeta.

Cada sílaba da leitura carrega `hasSynalepha` (nasceu de elisão),
`hasDiaeresis`, `isExtrametrical` e `stressStrength`. Os offsets apontam para o
texto original do verso.

`assess` é a camada 4 e devolve **estrutura**, nunca frase:
`{ kind: 'count', delta: 1 }`, não `"sobra 1 sílaba"`. Quem escolhe a palavra é
a UI — em `apps/editor/src/lib/phrase.ts`.

Junções travadas pelo autor entram em `scanVerse` por `locks`. Uma trava sai da
busca e não custa nada: quando o autor contraria o sistema, o autor vence.

Os custos de naturalidade vivem todos em `packages/engine/src/verse/costs.ts`.
**São estimativas, não medições** — vêm de princípio fonológico, e é isto que
precisa de recalibração quando houver corpus de verso verificado.

### Editor

A forma é quatro campos independentes — sílabas, tônicas obrigatórias, esquema
de rima, número de versos — com entrada direta de valor em cada um. Os modelos
clássicos são atalhos que preenchem os quatro; o autor pode criar e guardar os
seus, que ficam ao lado dos de fábrica em IndexedDB.

Os poemas ficam numa biblioteca local: "Abrir" lista o que está guardado neste
navegador e também aceita arquivo do disco. "Novo" não apaga nada.

O poema é guardado em IndexedDB a cada 400ms e sai em arquivo `.poema` — JSON
por dentro, com título, forma, esquema de rima e, por verso, texto mais travas
de escansão. O formato está em `apps/editor/src/lib/document.ts`.

### IA

Provedor é plugável: um adaptador por arquivo em `src/lib/ai/`, registrado em
`registry.ts`. OpenAI e Anthropic implementados. O endereço é editável, então o
adaptador da OpenAI alcança qualquer serviço que fale `/chat/completions`.

O campo de modelo é **texto livre**, com a lista buscada do próprio provedor —
modelo lançado ontem funciona hoje, sem versão nova do editor.

**Escolha do modelo importa mais que o prompt.** Medido com a mesma forma e o
mesmo pedido: `gpt-4.1` resolveu em 11s, com 4 de 4 candidatos fechando a
forma. `gpt-5-mini` levou mais de 90s e não concluiu — modelo de raciocínio
gasta milhares de tokens por rodada, e o laço tem várias. Para esta tarefa,
modelo sem raciocínio com a ferramenta na mão ganha dos dois lados.

O modelo tem **duas** ferramentas: `escandir`, que mede, e `rimas`, que
consulta o dicionário por som. A segunda amplia o repertório dele em vez de só
corrigi-lo — quem rima com "massa" rima com "caça" e "praça", e ele não sabia.

Rimar uma palavra com ela mesma é recusado: o pedido avisa, o dicionário não a
oferece, o motor reprova.

Todo candidato é escandido pelo motor antes de aparecer. Quando nenhum fecha a
forma, o pedido é refeito uma vez com a medida do motor junto: dizer "errado"
não ensina, dizer "este tem 11 e devia ter 10" ensina.

A régua alinha cada ponto sob a sílaba que ele assinala, lendo a posição do
`<span>` que o espelho do editor já dispôs. Não há medição em canvas.

## Publicação

GitHub Pages, por Actions (`.github/workflows/pages.yml`), a cada push em
`main`. O workflow verifica antes de publicar — typecheck e testes — porque no
Pages não há como voltar atrás sem outra publicação.

O léxico não está no repositório: o workflow baixa as duas listas e roda o
gerador. As listas ficam em cache entre execuções, porque não mudam.

O caminho base vem de `BASE_PATH`, preenchido com o nome do repositório.
Servir na raiz de um domínio próprio é só não defini-lo — é o que sustenta a
promessa de mudar de host numa tarde.

## Testes

O motor é testado contra um corpus escandido à mão
(`packages/engine/test/golden/`). Cobertura de linha não diz nada aqui: uma
regra errada executa todos os seus ramos sem reclamar. Regra nova entra com os
casos que ela resolve **e** com os vizinhos que ela não pode quebrar.
