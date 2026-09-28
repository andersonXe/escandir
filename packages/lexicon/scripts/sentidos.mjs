/**
 * Gera o índice de sentidos: palavra -> acepções, para a ferramenta de duplo
 * sentido.
 *
 * As outras ferramentas dão ao modelo o que ele não percebe — contagem, rima,
 * som —, porque lê grafia. Significado ele domina; o que não tem de cabeça é a
 * lista **confiável e completa** das acepções, inclusive a rara e a regional:
 * que "pena" é castigo, desgosto, pluma e o bico de escrever; que "canto" é
 * canção, esquina, divisão de epopeia e "eu canto". É isso que o duplo sentido
 * precisa: saber que a palavra comporta as duas leituras.
 *
 * Fonte: o Wiktionary em português, na extração do wiktextract (kaikki.org),
 * com definições em português. Licença CC BY-SA 4.0 — o índice gerado herda a
 * licença; o código, não. Ver NOTICE.md.
 *
 * Só entram palavras da lista de sons (comuns, correntes e tradição) com **dois
 * sentidos ou mais**: palavra de sentido único não serve a duplo sentido, e o
 * recorte mantém o índice pequeno.
 *
 * Uso:
 *   node scripts/sentidos.mjs <raw-wiktextract-data.jsonl.gz> <destino-do-lexico>
 *
 * Roda depois de build.mjs: lê `palavras.tsv` do mesmo destino.
 */

import { createReadStream, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';

import { SENSE_SHARDS, senseShardName, shardOf } from '../src/shard.ts';

const [, , wiktPath, destino] = process.argv;
if (wiktPath === undefined || destino === undefined) {
  console.error('uso: node scripts/sentidos.mjs <raw-wiktextract-data.jsonl.gz> <destino-do-lexico>');
  process.exit(1);
}

/** Acepções por palavra e tamanho de cada uma: o bastante para distinguir. */
const MAX_SENTIDOS = 8;
const MAX_CARACTERES = 90;

const palavras = new Set(
  readFileSync(join(destino, 'palavras.tsv'), 'utf8')
    .split('\n')
    .map((linha) => linha.split('\t')[0])
    .filter((p) => p !== undefined && p !== ''),
);

const CLASSE = { noun: 'subst.', verb: 'verbo', adj: 'adj.', adv: 'adv.', pron: 'pron.', prep: 'prep.', conj: 'conj.', intj: 'interj.' };

/** Nome de pessoa e de lugar não é sentido que se jogue num verso. */
const PROPRIO = /^(sobrenome|prenome|apelido de família|município|cidade|vila|aldeia|freguesia|topónimo|topônimo|nome próprio|rio |estado |capital )/i;
/** "primeira pessoa do singular do presente do indicativo do verbo cantar" */
const FLEXAO = /\bdo verbo ([\p{L}-]+)/u;
/** "feminino de estrelo", "plural de vela" */
const FORMA_DE = /^(feminino|masculino|plural|singular|diminutivo|aumentativo|superlativo)( [\p{L}]+)* de ([\p{L}-]+)/u;

function encurtar(texto) {
  const limpo = texto.replace(/\s+/g, ' ').replace(/[:;.,\s]+$/, '').trim();
  return limpo.length <= MAX_CARACTERES ? limpo : `${limpo.slice(0, MAX_CARACTERES - 1).replace(/\s\S*$/, '')}…`;
}

const sentidos = new Map();

function acrescenta(palavra, sentido) {
  const lista = sentidos.get(palavra) ?? [];
  if (!lista.includes(sentido)) lista.push(sentido);
  sentidos.set(palavra, lista);
}

/** Acepções próprias de cada palavra do Wiktionary, não só das nossas: a base de "velas" é "vela". */
const proprios = new Map();
/** Palavra -> as bases de que ela é forma: "velas" -> vela; "canto" -> cantar. */
const bases = new Map();

console.log('lendo o Wiktionary...');
let entradas = 0;
const leitor = createInterface({ input: createReadStream(wiktPath).pipe(createGunzip()), crlfDelay: Infinity });
for await (const linha of leitor) {
  const entrada = JSON.parse(linha);
  if (entrada.lang_code !== 'pt') continue;
  const palavra = String(entrada.word ?? '').toLowerCase().normalize('NFC');
  entradas += 1;
  const classe = CLASSE[entrada.pos] ?? entrada.pos ?? '';
  for (const sentido of entrada.senses ?? []) {
    const glosa = (sentido.glosses ?? []).at(-1);
    if (typeof glosa !== 'string' || glosa.trim().length < 3 || PROPRIO.test(glosa)) continue;
    // Forma flexionada vira uma acepção só — "forma de cantar" —, e não
    // doze linhas de pessoa e tempo. É esse o duplo sentido de "canto".
    const flexao = FLEXAO.exec(glosa);
    const forma = flexao === null ? FORMA_DE.exec(glosa) : null;
    const base = flexao?.[1] ?? forma?.[3];
    if (base !== undefined) {
      // "plural de Luz": a base é nome próprio, e nome não é sentido.
      if (!palavras.has(palavra) || base !== base.toLowerCase()) continue;
      acrescenta(palavra, flexao !== null ? `verbo: forma de "${base}"` : `${classe}: ${forma[1]} de "${base}"`);
      bases.set(palavra, new Set([...(bases.get(palavra) ?? []), base.toLowerCase()]));
      continue;
    }
    const lista = proprios.get(palavra) ?? [];
    const texto = `${classe}: ${encurtar(glosa)}`;
    if (!lista.includes(texto)) lista.push(texto);
    proprios.set(palavra, lista);
  }
}

/*
 * Forma flexionada herda as acepções da base.
 *
 * No Wiktionary, "velas" tem uma acepção só — "plural de vela" — e "cantava",
 * "forma de cantar". Sem herdar, ficavam de fora justamente as formas que mais
 * aparecem em fim de verso, e "velas" perdia o barco, a vigília e o círio.
 */
const HERDADAS = 4;
for (const palavra of palavras) {
  for (const texto of proprios.get(palavra) ?? []) acrescenta(palavra, texto);
  for (const base of bases.get(palavra) ?? []) {
    if (base === palavra) continue;
    for (const texto of (proprios.get(base) ?? []).slice(0, HERDADAS)) acrescenta(palavra, `(${base}) ${texto}`);
  }
}

const fatias = Array.from({ length: SENSE_SHARDS }, () => ({}));
let comDois = 0;
for (const [palavra, lista] of sentidos) {
  // Duas acepções de verdade: "forma de cantar" sozinho não é sentido.
  const reais = lista.filter((s) => !/^(verbo: forma de|\S+: (plural|singular|feminino|masculino|diminutivo|aumentativo|superlativo)\b)/.test(s));
  if (reais.length < 2) continue;
  comDois += 1;
  fatias[shardOf(palavra, SENSE_SHARDS)][palavra] = lista.slice(0, MAX_SENTIDOS);
}

await mkdir(join(destino, 'sentidos'), { recursive: true });
let bytes = 0;
for (let i = 0; i < SENSE_SHARDS; i += 1) {
  const conteudo = JSON.stringify(fatias[i]);
  bytes += conteudo.length;
  await writeFile(join(destino, senseShardName(i)), conteudo, 'utf8');
}
await writeFile(
  join(destino, 'sentidos', 'manifest.json'),
  JSON.stringify(
    {
      version: 1,
      shards: SENSE_SHARDS,
      words: comDois,
      source: { name: 'Wiktionary em português, via wiktextract (kaikki.org)', license: 'CC BY-SA 4.0' },
    },
    null,
    2,
  ),
  'utf8',
);
console.log(
  `  ${entradas.toLocaleString('pt-BR')} entradas lidas, ${comDois.toLocaleString('pt-BR')} palavras com dois sentidos ou mais, ` +
    `${Math.round(bytes / 1024 / 1024)} MB em ${SENSE_SHARDS} fatias`,
);
