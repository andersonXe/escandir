/**
 * Gera o léxico: lista de palavras -> índice de rimas fatiado.
 *
 * Roda fora do navegador, uma vez. O que ele produz é asset estático imutável,
 * cacheável para sempre — nada disto acontece em tempo de escrita.
 *
 * Duas fontes, com papéis distintos:
 *
 * - `palavras.txt` diz o que **é palavra**. Sem ele, lista de frequência de
 *   legendas traz nome próprio, erro de digitação e estrangeirismo.
 * - `pt_br_full.txt` diz o que é **usado**. Sem ele, não há como separar o
 *   corrente do obscuro, e toda sugestão sai com o mesmo peso.
 *
 * A interseção é a lista limpa e ordenada por uso.
 *
 * Uso:
 *   node scripts/build.mjs <palavras.txt> <frequencias.txt> <destino>
 */

import { createReadStream } from 'node:fs';
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

const [, , palavrasPath, freqPath, destino] = process.argv;
if (palavrasPath === undefined || freqPath === undefined || destino === undefined) {
  console.error('uso: node scripts/build.mjs <palavras.txt> <frequencias.txt> <destino>');
  process.exit(1);
}

/** Só letras do português. Corta sigla, número, pontuação e o que veio torto. */
const PALAVRA = /^[a-zà-öø-ÿ]+(?:-[a-zà-öø-ÿ]+)*$/;

async function* linhas(path) {
  const stream = createReadStream(path, { encoding: 'utf8' });
  for await (const linha of createInterface({ input: stream, crlfDelay: Infinity })) {
    yield linha;
  }
}

console.log('lendo o dicionário...');
const validas = new Set();
for await (const linha of linhas(palavrasPath)) {
  const palavra = linha.trim().toLowerCase().normalize('NFC');
  // Monossílabo de uma letra não rima com nada de útil; hífen só no interior.
  if (palavra.length >= 2 && PALAVRA.test(palavra)) validas.add(palavra);
}
console.log(`  ${validas.size.toLocaleString('pt-BR')} palavras de dicionário`);

console.log('lendo as frequências...');
const ordem = [];
const vistas = new Set();
for await (const linha of linhas(freqPath)) {
  const palavra = linha.split(' ')[0]?.trim().toLowerCase().normalize('NFC');
  if (palavra === undefined || !validas.has(palavra) || vistas.has(palavra)) continue;
  vistas.add(palavra);
  ordem.push(palavra);
}
const usadas = ordem.length;

/*
 * O resto do dicionário entra depois das frequentes, na faixa mais rara.
 *
 * Legenda de cinema não é corpus de poesia: "pomar", "alfazema" e "vagar" mal
 * aparecem lá, e são justamente o tipo de palavra que se procura ao rimar.
 * Cortá-las por não serem comuns empobreceria a ferramenta no ponto em que ela
 * mais serve.
 */
for (const palavra of validas) {
  if (!vistas.has(palavra)) ordem.push(palavra);
}
console.log(
  `  ${usadas.toLocaleString('pt-BR')} usadas em legendas, ` +
    `mais ${(ordem.length - usadas).toLocaleString('pt-BR')} só de dicionário`,
);

/**
 * Cinco faixas por posto de frequência, não por contagem bruta.
 *
 * Contagem bruta tem cauda longuíssima — "que" aparece 15 milhões de vezes e
 * a mediana aparece 3. Faixa por posto dá grupos de tamanho comparável, que é
 * o que serve para a interface oferecer "comum" e "raro" lado a lado.
 */
function faixa(posto, total) {
  // As de dicionário-só caem todas na última faixa, por construção da ordem.
  const cortes = [0.02, 0.1, 0.3, 0.6];
  const p = posto / total;
  for (let i = 0; i < cortes.length; i += 1) {
    if (p < cortes[i]) return i;
  }
  return cortes.length;
}

console.log('escandindo...');
const analyzer = createAnalyzer(ptBR, { maxEntries: 400_000 });
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
  let tonica = -1;
  for (let i = reading.syllables.length - 1; i >= 0; i -= 1) {
    if (reading.syllables[i].stressStrength === 'strong') {
      tonica = i;
      break;
    }
  }
  if (tonica < 0) return;

  const entrada = [
    palavra,
    reading.syllables.length,
    reading.syllables.length - tonica,
    faixa(posto, ordem.length),
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
    { name: 'pythonprobr/palavras (dicionário LibreOffice pt_BR)', license: 'MPL-2.0' },
    { name: 'hermitdave/FrequencyWords (OpenSubtitles pt-BR)', license: 'MIT' },
  ],
};
await writeFile(join(destino, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

const media = Math.round(bytes / SHARD_COUNT / 1024);
console.log(`  ${SHARD_COUNT} fatias, ${Math.round(bytes / 1024 / 1024)} MB no total, ~${media} KB cada`);
console.log('pronto.');
