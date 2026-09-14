/**
 * Classificação de grafemas do português. Tudo aqui opera sobre a palavra já
 * normalizada (NFC, minúscula).
 */

/** Acentos que marcam tônica: agudo e circunflexo. */
export const STRESS_MARKS = 'áéíóúâêô';

/** Til marca nasalidade; marca tônica apenas na ausência de agudo/circunflexo. */
export const TILDE_VOWELS = 'ãõ';

/**
 * Vogais que sempre podem ser núcleo silábico. Inclui `í`/`ú`, porque o acento
 * sobre vogal fraca é justamente o que desfaz o ditongo ("sa-ú-de", "pa-ís").
 */
export const NUCLEUS_VOWELS = 'aeoáéóâêôãõàíú';

/** Vogais fracas átonas: candidatas a semivogal. `y`/`w` só em estrangeirismos. */
export const GLIDE_VOWELS = 'iuyüw';

const VOWELS = NUCLEUS_VOWELS + GLIDE_VOWELS;

/** Consoantes que podem iniciar grupo com líquida (obstruinte + l/r). */
const OBSTRUENTS = 'pbcdfgtv';
const LIQUIDS = 'lr';

/** Acesso a caractere sem `undefined`: fora da palavra é string vazia. */
export function at(text: string, index: number): string {
  return text[index] ?? '';
}

export function isVowelChar(c: string): boolean {
  return c !== '' && VOWELS.includes(c);
}

/** Vogal capaz de ser núcleo por si só (forte, ou fraca acentuada). */
export function isNucleusVowel(c: string): boolean {
  return c !== '' && NUCLEUS_VOWELS.includes(c);
}

/** Vogal fraca átona, que pode virar semivogal de um ditongo. */
export function isGlideVowel(c: string): boolean {
  return c !== '' && GLIDE_VOWELS.includes(c);
}

export function hasStressMark(c: string): boolean {
  return c !== '' && STRESS_MARKS.includes(c);
}

export function hasTilde(c: string): boolean {
  return c !== '' && TILDE_VOWELS.includes(c);
}

/**
 * Grupo consonantal que o português admite como ataque de sílaba:
 * obstruinte + líquida. `dl` fica de fora porque não ocorre em posição
 * de ataque no vocabulário corrente.
 */
export function isValidComplexOnset(first: string, second: string): boolean {
  if (first.length !== 1 || second.length !== 1) return false;
  if (!OBSTRUENTS.includes(first) || !LIQUIDS.includes(second)) return false;
  return !(first === 'd' && second === 'l');
}

/** Normaliza para a forma sobre a qual todas as regras operam. */
export function normalizeWord(word: string): string {
  return word.normalize('NFC');
}

export function foldCase(word: string): string {
  return word.toLowerCase();
}
