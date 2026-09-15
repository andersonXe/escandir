# CLAUDE.md

## O que é

Editor de texto para poesia métrica em português brasileiro. O poeta define a
forma antes de escrever (número de sílabas poéticas, posições das tônicas
obrigatórias, esquema de rima) e recebe retorno visual em tempo real enquanto
compõe: separação de sílabas poéticas, marcação de tônicas, elisões entre
palavras, sílaba faltando ou sobrando.

## Princípio do produto

**O poeta decide. A IA propõe. O sistema mede.**

A IA pode escrever — palavra, verso, estrofe, o que o autor pedir. O que ela
não pode é **aplicar**: nada entra no poema sem um gesto de aceitação. A
autoria aqui se sustenta no controle, não na abstinência.

> Até 14/09/2026 este arquivo dizia o oposto: "o poeta escreve, o sistema mede",
> e proibia gerar verso completo. A regra foi **revogada pelo dono do projeto**,
> de forma deliberada e explícita, não contornada. O histórico fica registrado
> porque a razão dela continua válida e informa o desenho abaixo: LLM que
> resolve o poema sozinha apaga a voz do autor.

O que a regra antiga protegia continua valendo, por outros meios:

- Toda saída da IA chega como **proposta** — fora do texto, visualmente
  distinta, nunca escrita direto no documento
- Proposta é **plural**: candidatos entre os quais o autor escolhe, não uma
  resposta única que só resta aceitar
- Aceitar é gesto explícito. O que foi aceito vira texto comum, editável na
  hora, sem modo especial e sem amarra
- Recusar não deixa rastro
- O documento **registra o que veio da máquina** — proveniência por linha
- Quando o autor contraria o sistema, o autor vence e o sistema registra
- É um app de escrita que por acaso entende métrica, não um painel de análise
  com um campo de texto no meio

## Interação com a IA

O problema difícil não é gerar: é ser **contextual** sem virar um painel de
seis botões que o autor precisa traduzir para a própria situação.

A saída é que o contexto já está computado. A camada 4 sabe que este verso tem
uma sílaba a mais, que aquela posição exige tônica, que a linha está vazia e
devia rimar em `-ar`. Então a ação se oferece onde o cursor está, com o nome do
que falta — "completar verso (10 sílabas, rima em ‑ar)", "ajustar para 10",
"atender ao comentário" — em vez de um menu de verbos genéricos.

**O motor é ferramenta do modelo, e juiz depois.**

LLM não conta sílaba poética de forma confiável, e explicar melhor não resolve:
é limitação de como ela lê texto, não falta de instrução. Mas ela sabe *usar*
quem conta. Então o motor é exposto como ferramenta (`escandir`), que o modelo
chama enquanto rascunha — executando **no navegador**, de graça, em fração de
milissegundo. A ferramenta devolve a divisão silábica junto do número, porque
ver "so|breo|MAR" corrige a intuição de um jeito que o número sozinho não
corrige.

Depois, independentemente disso, todo candidato é escandido de novo antes de
aparecer: o que não fecha a forma é mostrado marcado, nunca disfarçado de
certo. A camada determinística é ferramenta e controle de qualidade da camada
generativa — e só dá para fazer isso porque ela veio primeiro.

A ferramenta muda o gargalo de lugar: com ela, modelo sem raciocínio mede
certo e responde rápido. Modelo de raciocínio gasta o orçamento de tokens
pensando antes de escrever, e o laço de ferramenta multiplica isso — ficou
inutilizável na medição. Preferir modelo rápido.

Isso é regra de código, não conselho: o **primeiro** de `fallbackModels` é o que
a tela adota ao trocar de provedor, então ele é o padrão de fato. Durante um
tempo o padrão foi o modelo de raciocínio mais caro de cada provedor — o oposto
do que este parágrafo manda, e cinco vezes mais caro por proposta. Ao mexer
nessa lista, o rápido vem primeiro.

**A conta é visível.** Quem paga é o autor, e o laço reenvia a conversa inteira
a cada rodada: uma proposta chega a quase trinta mil fichas de entrada quando a
segunda tentativa entra. O painel mostra o consumo somado, subindo durante a
espera. Em token, não em dinheiro — preço muda por modelo, por provedor e por
mês, e o campo de modelo é texto livre justamente para não precisar de catálogo.

**Desistir cancela de verdade.** Fechar o painel aborta a requisição. Antes só
escondia a proposta: a chamada seguia até o fim e seguia sendo cobrada.

**A tarefa é declarada, não inferida.** Havia um bug instrutivo: a tarefa saía
da presença de texto na linha — se havia texto, era "completar". Então "propor
variações" virava "complete este verso mantendo o começo", e o modelo colava
texto no fim, estourando a medida. Cada ação agora diz qual é a sua tarefa
(`write`, `complete`, `rewrite`, `vary`, `fragment`, `stanza`, `note`), e o
formato da resposta acompanha: pedido de trecho pede trecho, não verso.

**Trecho marcado.** Selecionar parte de um verso é o gesto mais explícito que
existe — o autor apontou exatamente o que quer trocar. A ferramenta então mede
o verso inteiro com o trecho no lugar, nunca o trecho solto, e o pedido informa
quantas sílabas o trecho ocupa hoje. Sem esses dois cuidados o modelo propõe do
tamanho errado, a régua reprova tudo e ele desiste.

Linha do tipo `note` é o canal de instrução: o autor escreve um comentário no
meio do poema e pede para atendê-lo.

## Estado atual

Camada 6 (proposta por IA) ligada: provedor plugável, OpenAI e Anthropic
implementados, BYOK com chave em IndexedDB. 86 testes no app cobrem o laço de
proposta, as ações contextuais, os limites da importação, a validação do
endereço e a conta de tokens — sem precisar de chave.

Camadas 2, 3 e 4 prontas em `packages/engine`; 289 testes, entre o corpus
escandido à mão e as invariantes da busca. Camadas 1 (léxico pré-computado) e 5
(sugestão) não existem.

`apps/editor` implementa as telas Repouso, Erro e Forma do desenho, em
Svelte 5 + Vite, com escansão ao vivo a cada tecla, mais a tela de ajustes da
IA. Sugestões locais (camada 5) e a tela Trava não existem.

O desenho de referência está em `design/`, exportado do canvas do Claude
Design. É a fonte da paleta, da tipografia e do comportamento das telas.

Orçamento: o teto é 16ms por tecla. Verso normal escande em 0,03ms; a linha
patológica — prosa inteira colada numa linha só, 26 junções — custa 13ms.

O "0,13ms no pior caso" que esta linha dizia antes media o verso corrente e o
chamava de pior caso. O pior caso real era 300ms: a busca enumerava 2^k leituras
e **materializava** todas para descartar todas menos seis. Hoje a busca tem duas
fases — pontua com aritmética de inteiros, monta só as que devolve —, o que deu
entre 15× e 22× nas linhas densas. No editor, uma linha de treze junções saiu de
96ms por tecla para 12ms.

Equivalência verificada por diferencial contra a implementação anterior: 34.535
comparações — com e sem travas do autor, com custos inteiros e fracionários —
sem uma única divergência, em toda leitura devolvida e não só na melhor.

A busca continua exponencial no número de junções livres, com o teto de 14 como
rede. O que a torna aceitável é a constante, não a ordem: se algum dia o teto
precisar subir, aí sim é preciso a busca sobre o DAG que a seção Arquitetura
descreve — programação dinâmica sobre `(unidade, sílabas)`, que muda a
semântica do ranque e é decisão de produto, não de implementação.

**Lacuna conhecida da camada 2.** Prefixo + radical iniciado por vogal
("re-u-nir", "pro-i-bir", "co-in-ci-dir") é hiato que a grafia não registra —
a fronteira é morfológica, e nenhuma regra sobre a palavra escrita alcança.
Hoje isso está no léxico de exceções, o que só cobre alta frequência. O que
fecha de verdade é a camada 1 com `falabrasil/dicts-br`. Enquanto ela não
existir, palavra prefixada de baixa frequência conta uma sílaba a menos.

## Domínio: o que você provavelmente vai errar

Esta seção é a razão de ser deste arquivo. Escansão em português tem
armadilhas que parecem detalhes e não são.

**Sílaba poética ≠ sílaba gramatical.** Hifenização (TeX, hunspell,
`silabas-js`, regex de separação silábica) resolve translineação, não métrica.
Não usar como base do motor. Serve, no máximo, como fallback ruim.

**A contagem para na última tônica.** Decassílabo tem 10 sílabas *até a última
tônica*. O que vem depois não conta. Em "e o vento esquece o nome que trazia",
o "a" final de "trazia" é extramétrico. Isto precisa ser explícito no modelo,
não ser efeito colateral de implementação.

**Escansão é ambígua.** Não é uma função `verso → número`. Cada encontro
vocálico é um ponto de decisão: internos (ditongo vs. hiato) e externos
(elisão entre palavras). O motor constrói um grafo dessas decisões e devolve
*leituras ranqueadas*, nunca uma contagem única.

**Elisão entre palavras é a regra, não a exceção.** "sobre o mar" se lê
"so-breo-mar". Ignorar isso produz contagem errada na maioria dos versos.
Cada elisão tem um custo de naturalidade: elisão de átonas iguais é quase
obrigatória, hiato forçado é caro.

**Tonicidade é quase determinística pela grafia.** Depois das reformas
ortográficas dos anos 40, achar a vogal tônica a partir da palavra escrita é
processo de regra, não de dicionário — diferente de inglês ou italiano. Então:
regras primeiro, léxico como lista de exceções. Isso mantém o asset pequeno.

**O alvo métrico é dado, não inferido.** Diferente de sistemas de escansão
acadêmicos, aqui o autor já declarou a forma. Isso transforma o problema em
busca com alvo, muito mais barata e precisa.

**Verso livre existe.** Ausência de métrica não é estado de erro.

## Arquitetura

Seis camadas. As quatro primeiras são determinísticas e rodam no cliente.

1. **Léxico** — sílabas, tônica e fonemas pré-computados. Asset estático,
   imutável, cacheado para sempre.
2. **Palavra → sílabas + tônica** — regras, com o léxico resolvendo exceções.
   Memoizado.
3. **Verso → grafo de junções** — todas as elisões e hiatos possíveis, com
   custo. Busca com alvo sobre o grafo, em duas fases: pontua toda leitura com
   aritmética de inteiros, monta as sílabas só das que devolve. (A busca em si
   ainda enumera; ver o orçamento no Estado atual.)
4. **Ajuste ao esquema** — leituras válidas + diagnóstico acionável ("sobra 1
   sílaba", "tônica na 8ª, esperada na 6ª").
5. **Sugestão local** — índice invertido gera candidatos metricamente válidos
   por `(nº de sílabas, tonicidade, terminação de rima)`. Consulta local, sem
   inferência. Funciona sem chave, sem rede e em tempo de digitação.
6. **Proposta por IA** — verso e estrofe, BYOK, fora do caminho crítico. Só
   sob pedido do autor. Todo candidato passa pelas camadas 3 e 4 antes de
   aparecer: o que não fecha a forma não é oferecido como se fechasse.

As camadas 5 e 6 não se substituem. A 5 é a que existe quando não há chave,
rede ou paciência para esperar.

Orçamento de performance: escansão completa de um verso em menos de 16ms. O
retorno é em tempo real durante a digitação; não há espaço para ida ao
servidor no caminho crítico.

## Restrições

**Custo zero é requisito, não preferência.** O projeto precisa se sustentar sem
despesa recorrente.

- Sem backend, sem banco, sem autenticação, sem contas
- Sem proxy com chave do desenvolvedor. Se houver LLM, é BYOK: chave do
  usuário, guardada no browser, chamada direta do navegador
- Frontend estático em CDN. Poemas em IndexedDB, com export/import de arquivo
- Local-first, zero lock-in: o site deve poder mudar de host numa tarde

**A chave é o que a origem tem de proteger.** Ela fica em claro no IndexedDB —
não há como ser outro sem servidor, e é o contrato BYOK. A contrapartida é que a
origem tranca o resto: CSP em meta tag no `index.html` (o Pages não deixa pôr
cabeçalho), com `script-src 'self'`, `object-src 'none'`, `base-uri 'none'`.
`connect-src` fica aberto de propósito, porque o endereço da API é editável e é
isso que faz dezenas de provedores compatíveis funcionarem sem código novo.

Pelo mesmo motivo o projeto **não tem dependência de runtime**: todo pacote é de
build. Cada dependência que rodasse no navegador seria alguém com acesso à chave
do autor. Acrescentar uma é decisão de segurança, não de conveniência.

O campo de endereço valida o esquema e pede confirmação quando muda com uma
chave guardada: é o único ponto do app onde um erro de digitação manda a
credencial de alguém para um estranho. `http://` só passa em `localhost`, porque
modelo local é metade do motivo de o campo ser editável.

**TypeScript puro no motor.** Sem dependência de runtime Python. O motor tem
que rodar no browser.

**Motor isolado da UI.** Pacote próprio, sem DOM, sem fetch, sem I/O. Entra
texto e especificação métrica, sai estrutura. Testável e reusável fora do
editor.

**Léxico e regras plugáveis por idioma.** Entregar só português no v1, mas não
cravar pt-BR na arquitetura. Espanhol tem a mesma família de problemas
(sinalefa) e mercado maior.

## Decisões em aberto

Não resolva sozinho. São escolhas de produto.

- **Tamanho e formato do léxico embarcado.**
- **Quais ações contextuais existem, e como são nomeadas.** A lista de verbos
  ("sugerir rima", "completar estrofe") é fácil; difícil é qual aparece quando,
  e com que nome, sem virar menu.
- **Identidade de junção através de edição.** Hoje o id de uma junção é o offset
  no texto, então editar antes dela desloca o id e uma trava do autor se perde.
  A tela Trava depende de resolver isto. É o buraco do modelo de documento.

## Decisões fechadas pelo desenho

Tomadas em `design/`, não por código. Registradas aqui para não serem
reabertas por engano.

- **Sugestões não são ordenadas.** Agrupam-se por campo semântico, e a
  interface diz isso em voz alta: "só palavras, sem ordem de preferência".
  Mata a alternativa de ranquear por similaridade, que geraria clichê.
- **A régua se alinha à sílaba.** O desenho propunha uma tira de passo fixo,
  para evitar o custo de medir texto. Testado, não serviu: ponto que não fica
  sob a sílaba que assinala não se lê como régua. Revertido.

  O alinhamento saiu barato porque o editor já espelha o verso em DOM: cada
  sílaba é um `<span>`, e o navegador **já mediu** aquele texto ao dispor a
  linha. Ler `getClientRects()` do span custa uma medição de layout por verso
  editado — não há canvas em lugar nenhum.

  O verso que quebra em duas linhas **não** saía de graça, ao contrário do que
  esta seção dizia. O `x` saía: cada span sabe em que linha caiu. O `y` não:
  com a entrelinha de 1,62 sobram 1,7px entre uma linha visual e a seguinte, e
  o ponto ocupa 14 — a régua da primeira linha era desenhada por cima das
  letras da segunda, treze pontos de dezessete num alexandrino no corpo padrão.
  Agora o verso que quebra ganha entrelinha de `calc(1.62em + 14px)`, e só ele:
  verso que cabe numa linha continua com a tipografia de antes, porque como o
  poema se apresenta é escolha de quem escreve.
- **Palavra de classe fechada não desenha tempo forte.** "sobre", "entre",
  "quando" são `weak`. Se uma posição obrigatória aceita átona é decisão
  separada, da camada 4 — o peso prosódico governa a régua, não o diagnóstico.

## Não construir

- Aplicar saída de IA sem aceitação explícita do autor
- Proposta única onde cabe um conjunto de candidatos
- Correção automática de métrica (propor sim, reescrever por conta própria não)
- Backend de qualquer tipo
- Silabação baseada em hifenização
- Ordenação de sugestões por proximidade semântica pura, sem discussão prévia

## A forma é quatro coisas, não uma

Número de sílabas, posições das tônicas obrigatórias, esquema de rima e número
de versos são **campos independentes**, cada um com entrada direta de valor.
Um modelo — "decassílabo heroico", "soneto" — é atalho que preenche os quatro
de uma vez, nunca um pacote que os prende juntos. Partir de um clássico e mexer
num campo é uso normal, não desvio.

O autor cria e guarda modelos próprios, que ficam ao lado dos de fábrica. Os
clássicos que só prescrevem metro deixam rima e número de versos em aberto:
uma redondilha não manda rimar, e inventar essa regra seria pôr na boca da
tradição o que ela não diz.

Só sílabas e tônicas chegam ao motor (`MetricSpec`). Rima e número de versos
são do documento — a camada 3 não sabe o que é uma estrofe.

## Léxico

`packages/lexicon` gera e lê o índice de rimas. 315 mil palavras, 18 mil sons
distintos, repartidas em 64 fatias por hash da chave de som.

O custo que importa não é o total: é **12 KB comprimidos por consulta**. Quem
pede rimas em /aw/ nunca baixa as rimas em /ia/, e a fatia fica em memória
depois. A busca com a fatia carregada custa 0,13 ms.

O índice é gerado fora do navegador e não é versionado — ver NOTICE.md para as
fontes e licenças. Refazer: `npm run build:data -w @escandir/lexicon`.

Ele serve duas pontas pelo mesmo dado: o poeta, quando a tela de sugestões
existir, e a IA, que o consulta como ferramenta.

## O tema do poema

Campo de documento: do que o poema trata, na voz de quem escreve. Vai em todo
pedido à IA como contexto permanente.

É distinto da linha do tipo `note`: nota é pedido pontual, preso a um lugar do
texto ("aqui falta uma imagem de água"); tema é o chão, e vale para o poema
inteiro. A primeira redação desta seção dizia "não repita estes termos", temendo que o
modelo encaixasse as palavras do tema à força. Saiu o oposto: ele evitou as
coisas concretas que carregavam o poema — escreveu "trânsito" onde o tema
dizia "bonde" — e entregou atmosfera genérica.

O que se evita é a **paráfrase**, não o **material**. A instrução agora manda
usar o que o tema nomeia, opõe o particular ao geral com esse mesmo exemplo, e
dá ao modelo um teste para aplicar sozinho: "este verso caberia em qualquer
outro poema? então não está usando o tema". O tema vem antes da forma no
pedido, porque é o que enquadra o resto.

Foi o que mais mexeu no **tom**, que era a fraqueza que sobrava depois de
métrica e rima resolvidas.

## Seleção por verso

Cada verso é um `<textarea>` próprio — é o que sustenta a régua alinhada, a
escansão por linha e os tipos de linha. Navegador não seleciona através de
campos separados, então marcar trecho de vários versos não podia ser seleção
de caractere.

A marca é **por verso**: Shift+clique noutro verso, ou Shift+seta na borda da
linha. Não é remendo da limitação — é o gesto certo para uma coisa que se
pensa em versos. Marca de caractere continua existindo dentro de um verso; a
de trecho vence quando há as duas, porque quem marcou três versos não pediu
meia palavra.

Mover o cursor sem Shift desfaz a marca, e `cursorLine` segue o ponteiro no
`mousedown` em vez de esperar o evento de foco — depender só do foco já deixou
a ação apontando para o verso errado uma vez.

## Rima idêntica não é rima

Rimar uma palavra com ela mesma é repetição. A regra é cobrada em três pontas,
porque uma só o modelo contorna: o pedido avisa, o dicionário não oferece as
já usadas, e o motor recusa o candidato. Foi observado na prática — sem a
regra, quatro de quatro propostas terminavam na palavra do verso anterior.

## Rima é som, não letra

A terminação carrega duas formas: a **grafia**, para dizer "rima em -ar" na
tela, e uma **chave fonêmica**, que é quem decide. Comparar letras recusaria
"ca-ça"/"mas-sa", "giz"/"quis" e "mal"/"mau" — três rimas legítimas — e
aceitaria "ca-sa"/"ca-ça", que não rima.

A chave colapsa o que a ortografia separa sem motivo sonoro: `ç`/`ss`/`c(e,i)`
viram /s/, `s` entre vogais vira /z/, `z` final ensurdece, `l` de coda vira /w/,
nasal de coda vira til na vogal, e vogal átona final se fecha (`bolo` soa
`bolu`). Não é transcrição fonética — é chave canônica, só o bastante para
julgar rima.

Fica em `pt/rhyme.ts`, atrás do contrato `Prosody`: é conhecimento de idioma, e
o motor de verso continua sem saber português.

Rima toante (só as vogais) existe na API e ainda não tem interface.

## Nem toda linha é verso

Uma linha tem tipo: `verse`, `heading` (título, canto, marcação de coro) ou
`note` (comentário do autor). Só `verse` é medido.

A consequência que importa não é visual: título e nota **não consomem letra do
esquema de rima nem entram na contagem de versos**. Inserir um "Refrão" no meio
do poema não pode deslocar todas as rimas abaixo dele.

## Modelo de documento

O documento **não é uma string**. É texto mais anotações de escansão travadas
pelo autor. Licença poética existe: o poeta vai forçar elisão ou hiato contra
o que o motor sugere, e essa escolha precisa persistir. Modelar como string
pura agora significa reescrever depois.

Implementado em `apps/editor/src/lib/document.ts`: formato próprio `.poema`,
JSON por dentro. Guarda título, forma declarada, esquema de rima, e por verso
o texto mais as travas. É por isso que não é `.txt` — um arquivo de texto
guarda as letras e perde exatamente o que distingue este documento.

Importar é a única porta por onde entra dado que o editor não produziu, e por
isso `fromRaw` valida campo a campo em vez de espalhar o objeto. Os limites da
forma são cobrados **aqui também**, e não só na tela: a tela limita sílabas a 20
e versos a 200, um arquivo não passa por ela, e `syllables: 1000000` atravessava
a validação inteira — era número, era finito — para travar a aba assim que a
tela de Forma tentasse desenhar uma casa de régua por sílaba.

O campo `locks` já existe e já persiste, embora a UI ainda não o produza: o
formato precisa estar pronto antes da tela Trava, ou os arquivos gravados hoje
não abrem amanhã. O que falta é identidade de junção estável (ver acima).

Biblioteca local em IndexedDB (`lib/store.ts`): vários poemas, cada um com id
próprio, gravação em rajada a cada 400ms, e o último aberto reabre sozinho.

Foi a biblioteca que tornou o "Novo" seguro. Enquanto havia um rascunho só, ele
era destrutivo e pedia confirmação; agora o poema anterior fica guardado e o
novo começa com id próprio.

Desfazer e refazer são do documento, não do campo (`lib/history.ts`). Enter e
Backspace nas bordas viram operações sobre a lista de linhas, que o `<textarea>`
não conhece — depois de uma delas a pilha do navegador está dessincronizada, e
desfazer restauraria o texto de um campo sem desfazer a divisão da linha.

## Fontes de dados

- `falabrasil/dicts-br` (MIT) — dicionários de fonemas, sílabas e vogal tônica
  para pt-BR, gerados sobre ~2,4M palavras do OSCAR Corpus, com versão reduzida
  de 250k. Recursos no GitLab com LFS.
- Tese do Aoidos (Adiel Mittmann, UFSC/NUPILL) — sistema de escansão automática
  baseado em regras, acurácia acima de 98%. Código não publicado, mas a tese
  descreve o algoritmo e o sistema de regras em detalhe. É a referência do
  motor.
- `linhd-postdata/rantanplan` (Apache 2.0) — escansão de espanhol. Não serve
  para pt, mas o formato de saída é o modelo de dados a copiar: cada sílaba
  carrega `is_stressed`, `is_word_end`, `has_synalepha`.
- NILC-Embeddings — word embeddings para português, 17 córpus, ~1,39B tokens,
  de 50 a 1000 dimensões. Só relevante se a camada 5 for adiante.

## Convenções

- Motor: funções puras, sem efeito colateral. Sem `any`.
- Testes do motor contra um conjunto de versos escandidos à mão. Escansão é
  domínio onde só golden tests pegam regressão — cobertura de linha não diz
  nada aqui. Montar esse conjunto antes de otimizar qualquer regra.
- Diagnóstico é parte da API pública do motor, não string formatada na UI.
  A camada 4 devolve estrutura; a UI decide a frase.

## Comandos

Monorepo com workspaces do npm. Tudo roda da raiz.

- `npm install` — instala todos os pacotes
- `npm test` — testes de todos os pacotes (hoje só o motor)
- `npm run typecheck` — checa `src` e `test`
- `npm run build` — compila o motor para `dist`

Dentro de `packages/engine`, `npm run test:watch` para o ciclo curto.

## Convenção do corpus

Padrões de sílaba usam `|` como separador e caixa alta na tônica:
`'his|TÓ|ria'`. Não é `-` porque hífen ocorre dentro de palavra ("dá-lo").
O mesmo formato vale para o léxico de exceções e para os testes.
