# Fontes de dados

O léxico em `apps/editor/public/lexico/` é gerado por
`packages/lexicon/scripts/build.mjs`. Ele não é versionado: o CI baixa as
fontes externas e o refaz a cada publicação (ver `.github/workflows/pages.yml`).

## VERO — corretor ortográfico pt_BR do LibreOffice — LGPL-3.0 / MPL

Dicionário Hunspell mantido por Raimundo Moura e colaboradores, no repositório
de dicionários do LibreOffice, preso ao commit
`5cf23af85b47be6e398add826da1a02175be4238`.

https://github.com/LibreOffice/dictionaries/tree/master/pt_BR

Decide **o que é palavra**. O gerador expande os radicais em todas as formas
flexionadas que o corretor reconhece (`scripts/hunspell.mjs`) e aceita só as
candidatas que estão entre elas. É o que recusa nome próprio, erro de
digitação e inglês das legendas, e grafia antiga dos poemas. Os radicais
entram também por si, na faixa mais rara.

Substitui a lista `pythonprobr/palavras`, que era só os radicais deste mesmo
dicionário, sem as flexões: tinha "cantar" e não "cantava".

## hermitdave/FrequencyWords — MIT

Frequências de palavras do pt-BR, contadas sobre o OpenSubtitles 2018 —
legendas de filmes e séries.

https://github.com/hermitdave/FrequencyWords

Define **o que é usado**, e é o que separa o corrente do obscuro.

## Wikisource — domínio público

`packages/lexicon/data/poesia.txt`: vocabulário de 23 poetas de língua
portuguesa mortos antes de 1956, com a contagem de cada palavra. Gerado por
`packages/lexicon/scripts/poesia.mjs` e versionado. As obras estão em domínio
público; a lista é só de palavras e contagens, não reproduz texto.

https://pt.wikisource.org

Traz o que se escreve em verso e a legenda não tem ("dardeja", "ardentias").

## Curadoria própria

`packages/lexicon/data/acrescentar.txt` e `excluir.txt`: listas mantidas à mão
neste repositório, sob a licença dele.

## Sobre a LGPL e a MPL

As duas são copyleft sobre o próprio arquivo, não virais sobre o resto do
projeto. O asset gerado é obra derivada do dicionário e mantém a licença dele;
o código do editor permanece independente. Se isso for um problema para o
destino do projeto, a troca é substituir o corretor — o gerador não depende de
qual seja, desde que seja Hunspell.
