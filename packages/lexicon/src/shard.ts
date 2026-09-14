/**
 * Como o léxico se reparte em fatias.
 *
 * O asset inteiro não cabe num carregamento só, e não precisa caber: quem pede
 * rimas em `/aw/` não tem uso para as rimas em `/ia/`. A fatia é decidida por
 * hash da chave de som — assim não existe manifesto de milhares de entradas,
 * e o cliente calcula sozinho qual arquivo buscar.
 *
 * Este arquivo é compartilhado entre o script que gera e o código que lê. Se
 * as duas pontas divergirem, o cliente busca a fatia errada e não acha nada —
 * por isso a função vive num lugar só.
 */

export const SHARD_COUNT = 64;

/** FNV-1a de 32 bits. Escolhida por ser curta e idêntica de escrever nas duas pontas. */
export function shardOf(sound: string, shards: number = SHARD_COUNT): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < sound.length; i += 1) {
    hash ^= sound.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % shards;
}

export function shardName(index: number): string {
  return `r${index.toString().padStart(2, '0')}.json`;
}

/**
 * Uma palavra do léxico, no formato compacto em que é gravada.
 *
 * Tupla e não objeto: são centenas de milhares de entradas, e nomes de campo
 * repetidos em JSON custam mais que os dados.
 */
export type PackedEntry = readonly [
  word: string,
  syllables: number,
  /** Tônica contada do fim: 1 oxítona, 2 paroxítona, 3 proparoxítona. */
  stressFromEnd: number,
  /** Faixa de frequência: 0 muito comum, 4 raro. */
  band: number,
];

export interface Manifest {
  readonly version: number;
  readonly shards: number;
  readonly words: number;
  readonly sounds: number;
  readonly sources: readonly { readonly name: string; readonly license: string }[];
}
