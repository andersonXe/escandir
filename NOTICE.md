# Fontes de dados

O léxico em `apps/editor/public/lexico/` é gerado por
`packages/lexicon/scripts/build.mjs` a partir de duas listas públicas. Ele não
é versionado: refaça com `npm run build:data -w @escandir/lexicon`.

## pythonprobr/palavras — MPL-2.0

Lista de ~320.000 palavras do português brasileiro, derivada do dicionário
ortográfico pt_BR do LibreOffice.

https://github.com/pythonprobr/palavras

Define **o que é palavra**. Sem ela, uma lista de frequência de legendas traz
nome próprio, erro de digitação e estrangeirismo.

## hermitdave/FrequencyWords — MIT

Frequências de palavras do pt-BR, a partir do corpus OpenSubtitles.

https://github.com/hermitdave/FrequencyWords

Define **o que é usado**, e é o que permite separar o corrente do obscuro. As
palavras que não aparecem nela entram assim mesmo, na faixa mais rara: legenda
de cinema não é corpus de poesia.

## Sobre a MPL-2.0

É copyleft por arquivo, não viral sobre o resto do projeto. O asset gerado é
obra derivada da lista e mantém a licença dela; o código do editor permanece
independente. Se a MPL for um problema para o destino do projeto, a troca é
substituir a lista de palavras — o gerador não depende de qual seja.
