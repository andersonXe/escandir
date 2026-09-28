/**
 * Gera o léxico: lista de palavras -> índice de rimas fatiado.
 *
 * Roda fora do navegador, uma vez. O que ele produz é asset estático imutável,
 * cacheável para sempre — nada disto acontece em tempo de escrita.
 *
 * **Quem decide o que é palavra é o corretor ortográfico** (VERO, o pt_BR do
 * LibreOffice), expandido em todas as formas que ele reconhece. Antes era uma
 * lista só com os radicais desse mesmo dicionário: tinha "cantar" e não
 * "cantava", e quase metade das palavras em fim de verso de Bilac e Castro
 * Alves ficava de fora.
 *
 * Expandido, o corretor reconhece dez milhões de formas — demais para o site,
 * e quase todas conjugações que ninguém procura. Então ele é filtro, não
 * fonte. As candidatas vêm de quatro lugares, e entra a que ele reconhece:
 *
 * - `pt_br_full.txt` — legendas de filmes e séries: o que se **fala**, e com
 *   que frequência. É o que ordena do comum ao raro.
 * - `data/poesia.txt` — poetas em domínio público: o que se **escreve** em
 *   verso e a legenda não tem ("dardeja", "ardentias").
 * - os radicais do corretor — a forma de dicionário de toda entrada, para a
 *   palavra rara não sumir só por ninguém a dizer ("alfazema", "pomar").
 * - `data/acrescentar.txt` — curadoria à mão. Entra sem passar pelo filtro.
 *
 * `data/excluir.txt` vence tudo.
 *
 * O corretor é o que separa palavra de lixo: recusa nome de personagem, erro
 * de digitação e inglês das legendas, e grafia antiga dos poemas.
 *
 * Uso:
 *   node scripts/build.mjs <frequencias.txt> <pt_BR.dic> <pt_BR.aff> <destino>
 */

import { createReadStream, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import {
  createAnalyzer,
  ptBR,
  rhymeOf,
  scanVerse,
  VERSO_LIVRE,
} from '../../engine/dist/index.js';
import { SHARD_COUNT, shardName, shardOf } from '../src/shard.ts';
import { expandir } from './hunspell.mjs';

const [, , freqPath, dicPath, affPath, destino] = process.argv;
if (freqPath === undefined || dicPath === undefined || affPath === undefined || destino === undefined) {
  console.error('uso: node scripts/build.mjs <frequencias.txt> <pt_BR.dic> <pt_BR.aff> <destino>');
  process.exit(1);
}

/** Só letras do português. Corta sigla, número, pontuação e o que veio torto. */
const PALAVRA = /^[a-zà-öø-ÿ]+(?:-[a-zà-öø-ÿ]+)*$/;

/**
 * Forma de comparar. O trema saiu da ortografia em 2009: "tranqüilo" nos
 * poemas e nas legendas antigas é "tranquilo", e o corretor só conhece a nova.
 */
function normalizar(bruta) {
  const palavra = bruta.trim().toLowerCase().normalize('NFC').replace(/ü/g, 'u');
  // Monossílabo de uma letra não rima com nada de útil; hífen só no interior.
  return palavra.length >= 2 && PALAVRA.test(palavra) ? palavra : null;
}

async function* linhas(path) {
  const stream = createReadStream(path, { encoding: 'utf8' });
  for await (const linha of createInterface({ input: stream, crlfDelay: Infinity })) {
    yield linha;
  }
}

/** Lista versionada em `data/`: uma palavra por linha, `#` comenta. */
function lista(nome) {
  return readFileSync(new URL(`../data/${nome}`, import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((linha) => !linha.startsWith('#'))
    .map((linha) => normalizar(linha.split(' ')[0] ?? ''))
    .filter((palavra) => palavra !== null);
}

console.log('expandindo o corretor ortográfico...');
const { formas, radicais } = expandir(dicPath, affPath);
console.log(`  ${formas.size.toLocaleString('pt-BR')} formas, ${radicais.size.toLocaleString('pt-BR')} radicais`);

const excluir = new Set(lista('excluir.txt'));
const ordem = [];
const vistas = new Set();
/** Acrescenta na ordem, uma vez só. `livre` pula o corretor (curadoria). */
function entra(palavra, livre = false) {
  if (palavra === null || vistas.has(palavra) || excluir.has(palavra)) return false;
  if (!livre && !formas.has(palavra)) return false;
  vistas.add(palavra);
  ordem.push(palavra);
  return true;
}

console.log('lendo as frequências...');
for await (const linha of linhas(freqPath)) entra(normalizar(linha.split(' ')[0] ?? ''));
const usadas = ordem.length;

// Os poemas vêm depois das legendas: o que as duas têm já entrou pela
// frequência da fala, que é a que ordena. Aqui entra o que só o verso usa.
console.log('lendo o acervo de poesia...');
for (const palavra of lista('poesia.txt')) entra(palavra);
const poeticas = ordem.length - usadas;

let curadas = 0;
for (const palavra of lista('acrescentar.txt')) if (entra(palavra, true)) curadas += 1;

/*
 * O resto do dicionário entra depois, na faixa mais rara.
 *
 * Legenda de cinema não é corpus de poesia: "pomar", "alfazema" e "vagar" mal
 * aparecem lá, e são justamente o tipo de palavra que se procura ao rimar.
 * Cortá-las por não serem comuns empobreceria a ferramenta no ponto em que ela
 * mais serve.
 */
for (const palavra of radicais) entra(normalizar(palavra));
console.log(
  `  ${usadas.toLocaleString('pt-BR')} das legendas, ${poeticas.toLocaleString('pt-BR')} só da poesia, ` +
    `${curadas} curadas, ${(ordem.length - usadas - poeticas - curadas).toLocaleString('pt-BR')} só de dicionário`,
);
/**
 * Cinco faixas por posto de frequência, não por contagem bruta.
 *
 * Contagem bruta tem cauda longuíssima — "que" aparece 15 milhões de vezes e
 * a mediana aparece 3. Faixa por posto dá grupos de tamanho comparável, que é
 * o que serve para a interface oferecer "comum" e "raro" lado a lado.
 */
function faixa(posto) {
  // A faixa mede a fala: o que não aparece nas legendas — só da poesia, só do
  // dicionário — cai todo na última, e os cortes valem só entre as faladas.
  if (posto >= usadas) return 5;
  const cortes = [0.02, 0.1, 0.3, 0.6];
  const p = posto / usadas;
  for (let i = 0; i < cortes.length; i += 1) {
    if (p < cortes[i]) return i;
  }
  return cortes.length;
}

console.log('escandindo...');
const analyzer = createAnalyzer(ptBR, { maxEntries: 1_000_000 });
const porSom = new Map();
let escandidas = 0;
let semRima = 0;

ordem.forEach((palavra, posto) => {
  const reading = scanVerse(palavra, ptBR, analyzer, { spec: VERSO_LIVRE }).best;
  if (reading === null) return;
  const rima = rhymeOf(reading, palavra, ptBR.prosody);
  if (rima.sound === '') {
    semRima += 1;
    return;
  }

  // Tônica contada do fim: é assim que a métrica usa. Uma oxítona fecha o
  // verso na própria sílaba; uma paroxítona deixa uma extramétrica sobrando.
  //
  // A tônica da palavra, não o tempo forte da régua. Palavra de classe fechada
  // ("quando", "antes", "uma") não desenha tempo forte no meio do verso, mas no
  // fim dele carrega a rima como qualquer outra — "quando" rima com "brando".
  // Procurar só o tempo forte as descartava todas.
  let tonica = -1;
  for (let i = reading.syllables.length - 1; i >= 0; i -= 1) {
    if (reading.syllables[i].isStressed) {
      tonica = i;
      break;
    }
  }
  if (tonica < 0) return;

  const entrada = [
    palavra,
    reading.syllables.length,
    reading.syllables.length - tonica,
    faixa(posto),
  ];

  const lista = porSom.get(rima.sound);
  if (lista === undefined) porSom.set(rima.sound, [entrada]);
  else lista.push(entrada);
  escandidas += 1;
});

console.log(`  ${escandidas.toLocaleString('pt-BR')} indexadas, ${porSom.size.toLocaleString('pt-BR')} sons distintos`);
if (semRima > 0) console.log(`  ${semRima} sem terminação rimável (ignoradas)`);

console.log('gravando as fatias...');
await mkdir(destino, { recursive: true });

const fatias = Array.from({ length: SHARD_COUNT }, () => ({}));
for (const [som, lista] of porSom) {
  // Dentro de cada som, as comuns primeiro: é a ordem em que se quer ler.
  lista.sort((a, b) => a[3] - b[3] || a[0].localeCompare(b[0], 'pt-BR'));
  fatias[shardOf(som)][som] = lista;
}

let bytes = 0;
for (let i = 0; i < SHARD_COUNT; i += 1) {
  const conteudo = JSON.stringify(fatias[i]);
  bytes += conteudo.length;
  await writeFile(join(destino, shardName(i)), conteudo, 'utf8');
}

const manifest = {
  version: 1,
  shards: SHARD_COUNT,
  words: escandidas,
  sounds: porSom.size,
  sources: [
    { name: 'VERO, corretor ortográfico pt_BR do LibreOffice (filtro)', license: 'LGPL-3.0 / MPL' },
    { name: 'Wikisource, poesia em domínio público (data/poesia.txt)', license: 'domínio público' },
    { name: 'hermitdave/FrequencyWords (OpenSubtitles pt-BR)', license: 'MIT' },
  ],
};
await writeFile(join(destino, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

const media = Math.round(bytes / SHARD_COUNT / 1024);
console.log(`  ${SHARD_COUNT} fatias, ${Math.round(bytes / 1024 / 1024)} MB no total, ~${media} KB cada`);
console.log('pronto.');
